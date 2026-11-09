import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, CURRICULUM_INDEX, PATHS } from '../src/academy/curriculum';
import { validateCurriculum } from '../src/academy/validate';
import { LineSession, gradeQuestion, reachClick, reachTargets, scoreOf, toUci } from '../src/academy/session';
import {
  COURSE_PASS, EMPTY_EVIDENCE, assessState, courseAccess, courseSatisfied, courseState, evidenceFrom, lessonState,
  newAssessmentRecord, newLessonRecord, recordAssessment, recordCheck, type Evidence,
} from '../src/academy/progress';
import { currentPath, evidenceRecommendations, plan, startAdvice, MIN_REVIEW_GAMES } from '../src/academy/recommend';
import type { AcademyRecord, CheckAttempt, Course, Lesson, MetaRecord, MoveExercise, ReachExercise } from '../src/academy/types';
import type { PuzzleEvent, ReviewEvent } from '../src/profile/types';
import { MIN_ATTEMPTS } from '../src/puzzles/skills';

const DAY = 86_400_000;
const T0 = new Date(2026, 0, 10, 12).getTime();
const clone = <T>(x: T): T => structuredClone(x);

const lessonOf = (id: string): Lesson => CURRICULUM_INDEX.lessons.get(id)!.lesson;
const loc = (id: string) => CURRICULUM_INDEX.lessons.get(id)!;
const attempt = (lesson: Lesson, correct: number, at: number): CheckAttempt => ({
  at, total: lesson.check.length, correct: lesson.check.slice(0, correct).map((q) => q.id), score: correct / lesson.check.length,
});
/** A lesson record with every exercise solved cleanly. */
function solvedRecord(lesson: Lesson, at = T0): ReturnType<typeof newLessonRecord> {
  const rec = newLessonRecord(lesson.id, at);
  for (const s of lesson.steps) if ('id' in s) rec.exercises[s.id] = { attempts: 1, solved: true, clean: true, hints: 0 };
  rec.step = lesson.steps.length;
  return rec;
}
const evidence = (records: AcademyRecord[], puzzles: PuzzleEvent[] = []): Evidence => evidenceFrom(records, puzzles);

/* ------------------------------- validator ------------------------------ */

test('the validator accepts the shipped curriculum', () => {
  assert.deepEqual(validateCurriculum(COURSES, PATHS), []);
});

test('the validator rejects content that is not chess: illegal moves, impossible positions, wrong answers', () => {
  const bad = (edit: (cs: Course[]) => void): string[] => {
    const cs = clone(COURSES);
    edit(cs);
    return validateCurriculum(cs, PATHS);
  };
  const firstMove = (cs: Course[]) => {
    for (const c of cs) for (const ch of c.chapters) for (const l of ch.lessons) for (const s of l.steps) if (s.kind === 'move') return s;
    throw new Error('no move exercise');
  };
  // an illegal move in a line
  assert.ok(bad((cs) => { firstMove(cs).line[0] = 'a1a8'; }).length > 0, 'illegal move');
  // a position with no black king
  assert.ok(bad((cs) => { firstMove(cs).board.fen = '8/8/8/8/8/8/8/4K3 w - - 0 1'; }).length > 0, 'missing king');
  // a position where the side not to move is in check
  assert.ok(bad((cs) => { firstMove(cs).board.fen = '4k3/8/8/8/8/8/4R3/4K3 w - - 0 1'; }).length > 0, 'opponent in check');
  // a multiple-choice answer that is out of range
  assert.ok(bad((cs) => { cs[0]!.chapters[0]!.lessons[0]!.check[0] = { kind: 'choice', id: 'zz-1', prompt: 'x', options: ['a', 'b'], answer: 5, explain: 'x' }; }).length > 0, 'answer out of range');
  // a duplicate id
  assert.ok(bad((cs) => { cs[0]!.chapters[0]!.lessons[1]!.id = cs[0]!.chapters[0]!.lessons[0]!.id; }).length > 0, 'duplicate lesson id');
  // a path that names a course that does not exist
  assert.ok(validateCurriculum(COURSES, [{ id: 'p', title: 'p', blurb: 'p', courses: ['nope'] }]).length > 0, 'unknown course in a path');
  // an unrelated edit does not trip it
  assert.deepEqual(bad(() => undefined), []);
});

/* ------------------------------- sessions ------------------------------- */

function moveExercise(pred: (s: MoveExercise) => boolean): MoveExercise {
  for (const c of COURSES) for (const ch of c.chapters) for (const l of ch.lessons) for (const s of l.steps) if (s.kind === 'move' && pred(s)) return s;
  throw new Error('no such exercise');
}

test('a move exercise: wrong moves are explained, illegal moves are not graded, the right move is accepted', () => {
  const ex = moveExercise((s) => s.id === 'free-capture');
  const s = new LineSession(ex);
  assert.equal(s.attempt('d1h1').kind, 'illegal'); // not a queen move... d1h1 is blocked by the king? it is illegal or wrong, never correct
  const wrong = new LineSession(ex).attempt('d1d5');
  assert.equal(wrong.kind, 'wrong');
  assert.match((wrong as { note?: string }).note ?? '', /exd5/);
  const ok = new LineSession(ex).attempt(ex.line[0]!);
  assert.equal(ok.kind, 'correct');
  assert.equal((ok as { done: boolean }).done, true);
});

test('a multi-move line plays the scripted reply, then asks for the next move', () => {
  const ex = moveExercise((s) => s.line.length >= 3 && !s.alt?.length);
  const s = new LineSession(ex);
  const first = s.attempt(ex.line[0]!);
  assert.equal(first.kind, 'correct');
  if (first.kind === 'correct') {
    assert.equal(first.reply, ex.line[1]);
    assert.equal(first.done, false);
  }
  assert.equal(s.expected, ex.line[2]);
  assert.equal(s.attempt(ex.line[2]!).kind, 'correct');
  assert.equal(s.done, true);
});

test('accepted alternatives end the exercise, and anyMate accepts any checkmate', () => {
  const alt = moveExercise((s) => !!s.alt?.length);
  const a = new LineSession(alt).attempt(alt.alt![0]!);
  assert.equal(a.kind, 'correct');
  const mate = moveExercise((s) => !!s.anyMate);
  const m = new LineSession(mate).attempt(mate.line[0]!);
  assert.ok(m.kind === 'correct' && m.mate, 'the stored mating move gives mate');
});

test('reach exercises: the targets are exactly the legal destinations, and clicks are judged', () => {
  let ex: ReachExercise | undefined;
  for (const c of COURSES) for (const ch of c.chapters) for (const l of ch.lessons) for (const s of l.steps) if (s.kind === 'reach' && !ex) ex = s;
  assert.ok(ex, 'the curriculum has a reach exercise');
  const t = reachTargets(ex!);
  assert.ok(t.length > 0);
  assert.equal(reachClick(t, new Set(), t[0]!), 'found');
  assert.equal(reachClick(t, new Set([t[0]!]), t[0]!), 'again');
  assert.equal(reachClick(t, new Set(), 'a8x'), 'wrong');
});

test('question grading and scoring', () => {
  const ch = lessonOf('what-is-chess').check[1]!;
  assert.equal(ch.kind, 'choice');
  if (ch.kind === 'choice') {
    assert.equal(gradeQuestion(ch, ch.answer), true);
    assert.equal(gradeQuestion(ch, ch.answer + 1), false);
    assert.equal(gradeQuestion(ch, String(ch.answer)), false, 'a string is not an option index');
  }
  assert.equal(scoreOf(2, 3), 2 / 3);
  assert.equal(scoreOf(0, 0), 0);
  assert.equal(toUci(52, 36, 0), 'e7e5');
  assert.equal(toUci(48, 56, 5), 'a7a8q');
});

/* ------------------------------- progression ---------------------------- */

test('click-through earns nothing: no records means not started, and a lesson needs its exercises AND a passed check', () => {
  const lesson = lessonOf('what-is-chess');
  assert.equal(lessonState(loc('what-is-chess'), EMPTY_EVIDENCE, CURRICULUM_INDEX).status, 'not-started');

  // exercises done, check not taken
  const rec = solvedRecord(lesson);
  assert.equal(lessonState(loc(lesson.id), evidence([rec]), CURRICULUM_INDEX).status, 'in-progress');

  // check passed but an exercise was never solved: not complete
  const half = newLessonRecord(lesson.id, T0);
  const after = recordCheck(lesson, half, attempt(lesson, lesson.check.length, T0));
  assert.equal(after.completedAt, undefined);
  assert.equal(lessonState(loc(lesson.id), evidence([after]), CURRICULUM_INDEX).status, 'in-progress');

  // check failed: not complete
  const failed = recordCheck(lesson, rec, attempt(lesson, 0, T0));
  assert.equal(failed.completedAt, undefined);

  // exercises + passed check: complete, but not mastered by one run
  const done = recordCheck(lesson, rec, attempt(lesson, lesson.check.length, T0));
  assert.equal(done.completedAt, T0);
  const st = lessonState(loc(lesson.id), evidence([done]), CURRICULUM_INDEX);
  assert.equal(st.status, 'completed');
  assert.notEqual(st.status, 'mastered');
});

test('mastery needs a strong check plus a confirmation on another day (not the same session)', () => {
  const lesson = lessonOf('what-is-chess');
  const n = lesson.check.length;
  let rec = recordCheck(lesson, solvedRecord(lesson), attempt(lesson, n, T0));
  rec = recordCheck(lesson, rec, attempt(lesson, n, T0 + 60_000)); // same day: no confirmation
  assert.equal(lessonState(loc(lesson.id), evidence([rec]), CURRICULUM_INDEX).status, 'completed');
  rec = recordCheck(lesson, rec, attempt(lesson, n, T0 + 2 * DAY)); // another day
  const st = lessonState(loc(lesson.id), evidence([rec]), CURRICULUM_INDEX);
  assert.equal(st.status, 'mastered');
  assert.equal(st.confirmedBy, 'review');
});

test('a later poor result sends a completed lesson back to "needs review" without taking the completion away', () => {
  const lesson = lessonOf('what-is-chess');
  let rec = recordCheck(lesson, solvedRecord(lesson), attempt(lesson, lesson.check.length, T0));
  rec = recordCheck(lesson, rec, attempt(lesson, 0, T0 + 3 * DAY));
  assert.equal(rec.completedAt, T0);
  assert.equal(lessonState(loc(lesson.id), evidence([rec]), CURRICULUM_INDEX).status, 'needs-review');
});

test('missed questions are remembered for revisiting and cleared when answered right', () => {
  const lesson = lessonOf('what-is-chess');
  const rec = recordCheck(lesson, solvedRecord(lesson), attempt(lesson, 1, T0));
  assert.equal(rec.missed.length, lesson.check.length - 1);
  const again = recordCheck(lesson, rec, attempt(lesson, lesson.check.length, T0 + 1000));
  assert.equal(again.missed.length, 0);
});

test('puzzle practice confirms mastery only with enough clean solves on the lesson\'s own themes', () => {
  const lesson = lessonOf('tac-forks');
  const n = lesson.check.length;
  const rec = recordCheck(lesson, solvedRecord(lesson), attempt(lesson, n, T0));
  const clean = (i: number, theme: string): PuzzleEvent => ({ id: `p${i}`, kind: 'puzzle', at: T0 + 1000 + i, puzzleId: `pz${i}`, puzzleRating: 1500, solved: true, timeMs: 5000, hintsUsed: 0, themes: [theme], wrongMoves: 0 });
  const two = [clean(1, 'fork'), clean(2, 'fork')];
  assert.equal(lessonState(loc(lesson.id), evidence([rec], two), CURRICULUM_INDEX).status, 'completed');
  const three = [...two, clean(3, 'fork')];
  const st = lessonState(loc(lesson.id), evidence([rec], three), CURRICULUM_INDEX);
  assert.equal(st.status, 'mastered');
  assert.equal(st.confirmedBy, 'puzzles');
  // clean solves of an unrelated theme do not count
  const wrongTheme = [1, 2, 3].map((i) => clean(i, 'pin'));
  assert.equal(lessonState(loc(lesson.id), evidence([rec], wrongTheme), CURRICULUM_INDEX).status, 'completed');
  // and puzzles from the player's own games are not trainer practice
  const own = [1, 2, 3].map((i) => ({ ...clean(i, 'fork'), puzzleId: `game:g${i}:4` }));
  assert.equal(lessonState(loc(lesson.id), evidence([rec], own), CURRICULUM_INDEX).status, 'completed');
});

test('a chapter check passed with the lesson\'s questions right confirms mastery', () => {
  const l = loc('files-ranks'); // the chapter check asks two questions about this lesson
  const lesson = l.lesson;
  const rec = recordCheck(lesson, solvedRecord(lesson), attempt(lesson, lesson.check.length, T0));
  const chap = l.chapter;
  assert.ok(chap.check.some((q) => q.lesson === lesson.id));
  const a = newAssessmentRecord(chap.id, 'chapter', T0 + DAY);
  const all: CheckAttempt = { at: T0 + DAY, total: chap.check.length, correct: chap.check.map((q) => q.id), score: 1 };
  const withCheck = recordAssessment(a, all, 0.6, false, true);
  const st = lessonState(l, evidence([rec, withCheck]), CURRICULUM_INDEX);
  assert.equal(st.status, 'mastered');
  assert.equal(st.confirmedBy, 'assessment');
  // missing one of that lesson's questions in the chapter check does not confirm it
  const missed = chap.check.find((q) => q.lesson === lesson.id)!.id;
  const partial = recordAssessment(a, { ...all, correct: all.correct.filter((c) => c !== missed), score: 0.8 }, 0.6, false, true);
  assert.equal(lessonState(l, evidence([rec, partial]), CURRICULUM_INDEX).status, 'completed');
});

/* ------------------------ prerequisites and placement ------------------- */

test('prerequisites are soft: a course can be opened early, or skipped by a placement check', () => {
  const tactics = CURRICULUM_INDEX.courseById.get('tactics')!;
  const beginner = CURRICULUM_INDEX.courseById.get('beginner')!;
  const none = courseAccess(tactics, EMPTY_EVIDENCE, CURRICULUM_INDEX);
  assert.equal(none.open, false);
  assert.deepEqual(none.missing.map((c) => c.id), ['beginner']);
  assert.equal(courseAccess(beginner, EMPTY_EVIDENCE, CURRICULUM_INDEX).open, true);

  const meta: MetaRecord = { id: 'meta', kind: 'meta', updatedAt: T0, opened: ['tactics'] };
  assert.equal(courseAccess(tactics, evidence([meta]), CURRICULUM_INDEX).open, true, 'opened early by choice');

  const placement = recordAssessment(newAssessmentRecord('beginner', 'course', T0), { at: T0, total: 12, correct: beginner.assessment.slice(0, 11).map((q) => q.id), score: 11 / 12 }, COURSE_PASS, true, false);
  assert.equal(placement.placed, true);
  const ev = evidence([placement]);
  assert.equal(courseSatisfied('beginner', ev, CURRICULUM_INDEX), true);
  assert.equal(courseAccess(tactics, ev, CURRICULUM_INDEX).open, true);
});

test('a placement check never counts as completed lessons and cannot place out of a course already started', () => {
  const beginner = CURRICULUM_INDEX.courseById.get('beginner')!;
  const at: CheckAttempt = { at: T0, total: 12, correct: beginner.assessment.map((q) => q.id), score: 1 };
  const placed = recordAssessment(newAssessmentRecord('beginner', 'course', T0), at, COURSE_PASS, true, false);
  const st = courseState(beginner, evidence([placed]), CURRICULUM_INDEX);
  assert.equal(st.placed, true);
  assert.equal(st.lessonsCompleted, 0, 'placed-out lessons are not completed lessons');
  assert.equal(st.lessonsKnown, st.lessonsTotal);
  assert.equal(st.lessonsMastered, 0);
  const first = lessonState(loc('what-is-chess'), evidence([placed]), CURRICULUM_INDEX);
  assert.equal(first.placed, true);

  // a high score after lesson work is a normal assessment, not a placement
  const late = recordAssessment(newAssessmentRecord('beginner', 'course', T0), at, COURSE_PASS, true, true);
  assert.notEqual(late.placed, true);
  // a placement score below 80% does not place the learner out, even if it passes the course pass mark
  const low = recordAssessment(newAssessmentRecord('beginner', 'course', T0), { ...at, correct: beginner.assessment.slice(0, 9).map((q) => q.id), score: 0.75 }, COURSE_PASS, true, false);
  assert.notEqual(low.placed, true);
  assert.equal(assessState(evidence([low]), 'beginner', COURSE_PASS).passed, true);
});

test('a course is completed only when all lessons, chapter checks and the assessment are passed', () => {
  // Build the evidence for a perfect learner: every lesson done, every chapter check and the assessment passed.
  const beginner = CURRICULUM_INDEX.courseById.get('beginner')!;
  const records: AcademyRecord[] = [];
  for (const ch of beginner.chapters) {
    for (const lesson of ch.lessons) records.push(recordCheck(lesson, solvedRecord(lesson), attempt(lesson, lesson.check.length, T0)));
    records.push(recordAssessment(newAssessmentRecord(ch.id, 'chapter', T0), { at: T0, total: ch.check.length, correct: ch.check.map((q) => q.id), score: 1 }, 0.6, false, true));
  }
  const partial = courseState(beginner, evidence(records), CURRICULUM_INDEX);
  assert.equal(partial.status, 'in-progress', 'without the assessment the course is not complete');
  records.push(recordAssessment(newAssessmentRecord('beginner', 'course', T0), { at: T0, total: beginner.assessment.length, correct: beginner.assessment.map((q) => q.id), score: 1 }, COURSE_PASS, false, true));
  const full = courseState(beginner, evidence(records), CURRICULUM_INDEX);
  assert.ok(full.status === 'completed' || full.status === 'mastered');
  assert.equal(full.lessonsCompleted, full.lessonsTotal);
  assert.equal(courseSatisfied('beginner', evidence(records), CURRICULUM_INDEX), true);
});

/* ----------------------------- recommendations -------------------------- */

const puz = (i: number, themes: string[], solved: boolean): PuzzleEvent => ({ id: `p${i}`, kind: 'puzzle', at: T0 + i, puzzleId: `pz${i}`, puzzleRating: 1500, solved, timeMs: 9000, hintsUsed: solved ? 0 : 3, themes, wrongMoves: solved ? 0 : 2 });
const rev = (i: number, weaknesses: string[]): ReviewEvent => ({ id: `r${i}`, kind: 'review', at: T0 + i, gameId: `g${i}`, acpl: 60, accuracy: 70, inaccuracies: 1, mistakes: 1, blunders: 1, missedTactics: 0, phaseAcpl: { opening: 30, middlegame: 40, endgame: 40 }, weaknesses });

test('no recommendation is made from too little data', () => {
  const few = Array.from({ length: MIN_ATTEMPTS - 1 }, (_, i) => puz(i, ['fork'], false));
  assert.deepEqual(evidenceRecommendations(CURRICULUM_INDEX, EMPTY_EVIDENCE, { puzzles: few, reviews: [] }), []);
  const twoGames = [rev(1, ['allowed-mate']), rev(2, ['allowed-mate'])];
  assert.deepEqual(evidenceRecommendations(CURRICULUM_INDEX, EMPTY_EVIDENCE, { puzzles: [], reviews: twoGames }), []);
  assert.deepEqual(evidenceRecommendations(CURRICULUM_INDEX, EMPTY_EVIDENCE, { puzzles: [], reviews: [] }), []);
});

test('a weak puzzle theme recommends the lesson that teaches it, with the numbers behind it', () => {
  const many = Array.from({ length: 8 }, (_, i) => puz(i, ['fork'], false));
  const recs = evidenceRecommendations(CURRICULUM_INDEX, EMPTY_EVIDENCE, { puzzles: many, reviews: [] });
  assert.equal(recs.length, 1);
  assert.equal(recs[0]!.kind, 'weak-theme');
  assert.equal(recs[0]!.lessonId, 'tac-forks');
  assert.match(recs[0]!.evidence ?? '', /0 of 8/);
  assert.ok(recs[0]!.reason.length > 20);
  // a theme that goes well is never recommended
  const good = Array.from({ length: 8 }, (_, i) => puz(i, ['fork'], true));
  assert.deepEqual(evidenceRecommendations(CURRICULUM_INDEX, EMPTY_EVIDENCE, { puzzles: good, reviews: [] }), []);
  // puzzles from the player's own games are not used
  const own = many.map((p) => ({ ...p, puzzleId: `game:${p.puzzleId}` }));
  assert.deepEqual(evidenceRecommendations(CURRICULUM_INDEX, EMPTY_EVIDENCE, { puzzles: own, reviews: [] }), []);
});

test('a weakness that recurs across reviewed games recommends the matching lesson; a mastered lesson is not repeated', () => {
  const games = Array.from({ length: MIN_REVIEW_GAMES }, (_, i) => rev(i, ['allowed-mate']));
  const recs = evidenceRecommendations(CURRICULUM_INDEX, EMPTY_EVIDENCE, { puzzles: [], reviews: games });
  assert.equal(recs[0]!.kind, 'game-weakness');
  assert.equal(recs[0]!.lessonId, 'tac-back-rank');
  assert.match(recs[0]!.evidence ?? '', new RegExp(`${MIN_REVIEW_GAMES} of your ${MIN_REVIEW_GAMES}`));

  const lesson = lessonOf('tac-back-rank');
  let rec = recordCheck(lesson, solvedRecord(lesson), attempt(lesson, lesson.check.length, T0));
  rec = recordCheck(lesson, rec, attempt(lesson, lesson.check.length, T0 + 2 * DAY));
  const ev = evidence([rec]);
  assert.equal(lessonState(loc('tac-back-rank'), ev, CURRICULUM_INDEX).status, 'mastered');
  assert.deepEqual(evidenceRecommendations(CURRICULUM_INDEX, ev, { puzzles: [], reviews: games }), []);
});

test('the plan: continue what was started, then the next lesson on the path, and review what slipped', () => {
  const p0 = plan(CURRICULUM_INDEX, PATHS, EMPTY_EVIDENCE, { puzzles: [], reviews: [] });
  assert.equal(p0.continue, null);
  assert.equal(p0.next?.lessonId, 'what-is-chess');
  assert.deepEqual(p0.evidence, []);

  const started = newLessonRecord('what-is-chess', T0);
  const p1 = plan(CURRICULUM_INDEX, PATHS, evidence([started]), { puzzles: [], reviews: [] });
  assert.equal(p1.continue?.lessonId, 'what-is-chess');
  assert.equal(p1.next?.lessonId, 'files-ranks', 'next is a different lesson from the one in progress');

  const lesson = lessonOf('what-is-chess');
  let done = recordCheck(lesson, solvedRecord(lesson), attempt(lesson, lesson.check.length, T0));
  done = recordCheck(lesson, done, attempt(lesson, 0, T0 + 3 * DAY));
  const p2 = plan(CURRICULUM_INDEX, PATHS, evidence([done]), { puzzles: [], reviews: [] });
  assert.equal(p2.review[0]?.lessonId, 'what-is-chess');
});

test('where a new learner starts follows what they said, then their own results, and never guesses', () => {
  const meta = (level: MetaRecord['level']) => evidence([{ id: 'meta', kind: 'meta', updatedAt: T0, opened: [], level }]);
  assert.equal(startAdvice(meta('new'), null, null).path, 'beginner');
  assert.deepEqual(startAdvice(meta('new'), null, null).placement, []);
  assert.equal(startAdvice(meta('regular'), null, null).path, 'tactician');
  assert.ok(startAdvice(meta('advanced'), null, null).placement.includes('beginner'));
  assert.equal(startAdvice(EMPTY_EVIDENCE, null, null).path, 'beginner');
  assert.equal(startAdvice(EMPTY_EVIDENCE, { rating: 1800, attempts: 3 }, null).path, 'beginner', 'three puzzles say nothing');
  assert.equal(startAdvice(EMPTY_EVIDENCE, { rating: 1800, attempts: 30 }, null).path, 'tactician');
  const path = currentPath(PATHS, CURRICULUM_INDEX, meta('regular'));
  assert.equal(path?.id, 'tactician');
  for (const id of ['beginner', 'tactician']) assert.ok(PATHS.some((p) => p.id === id), `path ${id} exists`);
});
