/**
 * What a learner has actually done, and what that means.
 *
 * Completing a lesson and mastering it are different. A lesson is *completed* when its exercises are done and its
 * knowledge check was passed. It is *mastered* only when the latest check is strong AND something independent confirms it:
 * a repeat check on a different day, clean puzzle solves on its theme afterwards, or a chapter / course assessment that
 * tested it. A lesson goes back to *needs review* when later evidence is poor. Nothing here is a guess: every status is
 * recomputed from saved records, so deleting data changes it honestly.
 */
import type { PuzzleEvent } from '../profile/types';
import { isClean, themeSkills } from '../puzzles/skills';
import {
  MASTERY_SCORE, PASS_SCORE, PLACEMENT_SCORE,
  type AcademyRecord, type AssessmentRecord, type Chapter, type CheckAttempt, type Course, type Lesson, type LessonRecord, type MetaRecord,
} from './types';

export const COURSE_PASS = 0.7;
export const COURSE_MASTERY = 0.85;
/** Clean puzzle solves on a lesson's themes (after completing it) that confirm the lesson. */
export const PUZZLE_CONFIRMATIONS = 3;

export type Status = 'not-started' | 'in-progress' | 'completed' | 'mastered' | 'needs-review';
export const STATUS_LABEL: Record<Status, string> = {
  'not-started': 'Not started', 'in-progress': 'In progress', completed: 'Completed', mastered: 'Mastered', 'needs-review': 'Needs review',
};

/* ------------------------------- index ------------------------------- */

export interface Located {
  lesson: Lesson;
  chapter: Chapter;
  course: Course;
  /** Position of the lesson within its course, 0-based. */
  index: number;
}

export interface Curriculum {
  courses: readonly Course[];
  lessons: Map<string, Located>;
  chapters: Map<string, { chapter: Chapter; course: Course }>;
  courseById: Map<string, Course>;
  /** Lessons in course order, for "next lesson". */
  order: Located[];
}

export function indexCurriculum(courses: readonly Course[]): Curriculum {
  const lessons = new Map<string, Located>();
  const chapters = new Map<string, { chapter: Chapter; course: Course }>();
  const order: Located[] = [];
  for (const course of courses) {
    let i = 0;
    for (const chapter of course.chapters) {
      chapters.set(chapter.id, { chapter, course });
      for (const lesson of chapter.lessons) {
        const loc = { lesson, chapter, course, index: i++ };
        lessons.set(lesson.id, loc);
        order.push(loc);
      }
    }
  }
  return { courses, lessons, chapters, courseById: new Map(courses.map((c) => [c.id, c])), order };
}

/* ------------------------------ evidence ------------------------------ */

export interface Evidence {
  lessonRecords: ReadonlyMap<string, LessonRecord>;
  assessments: ReadonlyMap<string, AssessmentRecord>;
  meta: MetaRecord | null;
  /** Puzzle attempts from the trainer (positions from the player's own games excluded). */
  puzzles: readonly PuzzleEvent[];
}

export function evidenceFrom(records: readonly AcademyRecord[], puzzles: readonly PuzzleEvent[]): Evidence {
  const lessonRecords = new Map<string, LessonRecord>();
  const assessments = new Map<string, AssessmentRecord>();
  let meta: MetaRecord | null = null;
  for (const r of records) {
    if (r.kind === 'lesson') lessonRecords.set(r.lessonId, r);
    else if (r.kind === 'assessment') assessments.set(r.assessmentId, r);
    else meta = r;
  }
  return { lessonRecords, assessments, meta, puzzles: puzzles.filter((p) => !p.puzzleId.startsWith('game:')) };
}

export const EMPTY_EVIDENCE: Evidence = { lessonRecords: new Map(), assessments: new Map(), meta: null, puzzles: [] };

const dayOf = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Whether the course was passed up front as a placement check ("I already know this"). */
export const isPlaced = (ev: Evidence, courseId: string): boolean => {
  const a = ev.assessments.get(courseId);
  return !!a?.placed && a.passedAt !== undefined;
};

/* -------------------------------- lessons ------------------------------ */

export interface LessonState {
  status: Status;
  /** Known from a passed placement check, not learned in the Academy: not counted as a completed lesson. */
  placed: boolean;
  attempts: number;
  bestScore: number | null;
  lastScore: number | null;
  /** How mastery was (or would be) confirmed. */
  confirmedBy: 'review' | 'puzzles' | 'assessment' | null;
  /** Short plain-language reasons shown next to the status. */
  notes: string[];
  missed: number;
}

const last = <T>(a: readonly T[]): T | undefined => a[a.length - 1];

function assessmentConfirms(lesson: Lesson, completedAt: number, ev: Evidence, cur: Curriculum, loc: Located): boolean {
  const ids: string[] = [loc.chapter.id, loc.course.id];
  for (const id of ids) {
    const rec = ev.assessments.get(id);
    if (!rec) continue;
    const qs = (id === loc.chapter.id ? loc.chapter.check : loc.course.assessment).filter((q) => q.lesson === lesson.id);
    if (!qs.length) continue;
    for (const at of rec.attempts) if (at.at > completedAt && qs.every((q) => at.correct.includes(q.id))) return true;
  }
  void cur;
  return false;
}

export function lessonState(loc: Located, ev: Evidence, cur: Curriculum): LessonState {
  const { lesson } = loc;
  const rec = ev.lessonRecords.get(lesson.id);
  const placed = isPlaced(ev, loc.course.id);
  const checks = rec?.checks ?? [];
  const lastC = last(checks);
  const base = {
    attempts: checks.length,
    bestScore: checks.length ? Math.max(...checks.map((c) => c.score)) : null,
    lastScore: lastC?.score ?? null,
    missed: rec?.missed.length ?? 0,
  };
  if (!rec) {
    return placed
      ? { ...base, status: 'completed', placed: true, confirmedBy: null, notes: ['Known from your placement check. Take the lesson any time to confirm it.'] }
      : { ...base, status: 'not-started', placed: false, confirmedBy: null, notes: [] };
  }
  if (rec.completedAt === undefined) {
    return { ...base, status: placed ? 'completed' : 'in-progress', placed, confirmedBy: null, notes: placed ? ['Known from your placement check.'] : [] };
  }
  const notes: string[] = [];
  // Evidence of trouble after completing.
  let needs = false;
  if (lastC && lastC.score < PASS_SCORE) {
    needs = true;
    notes.push(`Your latest check was ${Math.round(lastC.score * 100)}%.`);
  }
  if (lesson.puzzleThemes?.length) {
    const skills = themeSkills(ev.puzzles.filter((p) => p.at >= rec.completedAt!));
    const weak = lesson.puzzleThemes.find((t) => skills.get(t)?.level === 'weak');
    if (weak) {
      needs = true;
      notes.push('Recent puzzles on this theme have been going wrong.');
    }
  }
  let confirmedBy: LessonState['confirmedBy'] = null;
  const strong = !!lastC && lastC.score >= MASTERY_SCORE;
  if (strong) {
    const strongDays = new Set(checks.filter((c) => c.score >= MASTERY_SCORE).map((c) => dayOf(c.at)));
    if (strongDays.size >= 2) confirmedBy = 'review';
    else if (assessmentConfirms(lesson, rec.completedAt, ev, cur, loc)) confirmedBy = 'assessment';
    else if (lesson.puzzleThemes?.length) {
      const themes = new Set(lesson.puzzleThemes);
      const clean = new Set(ev.puzzles.filter((p) => p.at >= rec.completedAt! && p.solved && isClean(p) && p.themes.some((t) => themes.has(t))).map((p) => p.puzzleId));
      if (clean.size >= PUZZLE_CONFIRMATIONS) confirmedBy = 'puzzles';
    }
  }
  if (needs) return { ...base, status: 'needs-review', placed, confirmedBy: null, notes };
  if (strong && confirmedBy) return { ...base, status: 'mastered', placed, confirmedBy, notes: [] };
  if (!strong) notes.push(`Score ${MASTERY_SCORE * 100}% or more on the check, plus one confirmation, makes a lesson mastered.`);
  else notes.push(lesson.puzzleThemes?.length ? 'To master it: pass the check again on another day, ace the chapter check, or solve a few puzzles on it cleanly.' : 'To master it: pass the check again on another day, or ace the chapter check.');
  return { ...base, status: 'completed', placed, confirmedBy: null, notes };
}

/* -------------------------- chapters and courses ----------------------- */

export interface AssessState {
  attempts: number;
  best: number | null;
  last: number | null;
  passed: boolean;
}
export function assessState(ev: Evidence, id: string, pass: number): AssessState {
  const a = ev.assessments.get(id);
  const at = a?.attempts ?? [];
  const best = at.length ? Math.max(...at.map((x) => x.score)) : null;
  return { attempts: at.length, best, last: last(at)?.score ?? null, passed: best !== null && best >= pass };
}

export interface ChapterState {
  status: Status;
  lessons: Array<{ loc: Located; state: LessonState }>;
  done: number;
  mastered: number;
  check: AssessState;
}

export function chapterState(course: Course, chapter: Chapter, ev: Evidence, cur: Curriculum): ChapterState {
  const lessons = chapter.lessons.map((lesson) => {
    const loc = cur.lessons.get(lesson.id)!;
    return { loc, state: lessonState(loc, ev, cur) };
  });
  const done = lessons.filter((l) => l.state.status === 'completed' || l.state.status === 'mastered' || l.state.status === 'needs-review').length;
  const mastered = lessons.filter((l) => l.state.status === 'mastered').length;
  const check = assessState(ev, chapter.id, PASS_SCORE);
  const placed = isPlaced(ev, course.id);
  const started = lessons.some((l) => l.state.status !== 'not-started') || check.attempts > 0;
  const allDone = done === lessons.length;
  let status: Status;
  if (!started) status = 'not-started';
  else if (!allDone || (!check.passed && !placed)) status = 'in-progress';
  else if (lessons.some((l) => l.state.status === 'needs-review')) status = 'needs-review';
  else if (!placed && (check.last ?? 0) >= MASTERY_SCORE && mastered >= Math.ceil(lessons.length * 0.75)) status = 'mastered';
  else status = 'completed';
  return { status, lessons, done, mastered, check };
}

export interface CourseState {
  status: Status;
  chapters: Array<{ chapter: Chapter; state: ChapterState }>;
  lessonsTotal: number;
  /** Lessons completed in the Academy (not placed out). */
  lessonsCompleted: number;
  /** Lessons counted toward progress, including placed-out ones. */
  lessonsKnown: number;
  lessonsMastered: number;
  assessment: AssessState;
  placed: boolean;
}

export function courseState(course: Course, ev: Evidence, cur: Curriculum): CourseState {
  const chapters = course.chapters.map((chapter) => ({ chapter, state: chapterState(course, chapter, ev, cur) }));
  const all = chapters.flatMap((c) => c.state.lessons);
  const placed = isPlaced(ev, course.id);
  const lessonsCompleted = all.filter((l) => !l.state.placed && ['completed', 'mastered', 'needs-review'].includes(l.state.status)).length;
  const lessonsKnown = all.filter((l) => ['completed', 'mastered', 'needs-review'].includes(l.state.status)).length;
  const lessonsMastered = all.filter((l) => l.state.status === 'mastered').length;
  const assessment = assessState(ev, course.id, COURSE_PASS);
  const started = all.some((l) => l.state.status !== 'not-started') || chapters.some((c) => c.state.check.attempts > 0) || assessment.attempts > 0;
  const chaptersDone = chapters.every((c) => c.state.status === 'completed' || c.state.status === 'mastered' || c.state.status === 'needs-review');
  let status: Status;
  if (placed) status = all.some((l) => l.state.status === 'needs-review') ? 'needs-review' : 'completed';
  else if (!started) status = 'not-started';
  else if (!chaptersDone || !assessment.passed) status = 'in-progress';
  else if (all.some((l) => l.state.status === 'needs-review')) status = 'needs-review';
  else {
    const prereqsDone = course.requires.every((r) => courseSatisfied(r, ev, cur));
    const strong = (assessment.last ?? 0) >= COURSE_MASTERY && lessonsMastered >= Math.ceil(all.length * 0.75);
    status = strong && prereqsDone ? 'mastered' : 'completed';
  }
  return { status, chapters, lessonsTotal: all.length, lessonsCompleted, lessonsKnown, lessonsMastered, assessment, placed };
}

/** A prerequisite course counts once it is completed (assessment passed) or placed out. Shallow: no mastery needed. */
export function courseSatisfied(courseId: string, ev: Evidence, cur: Curriculum): boolean {
  const course = cur.courseById.get(courseId);
  if (!course) return true;
  if (isPlaced(ev, courseId)) return true;
  const assessment = assessState(ev, courseId, COURSE_PASS);
  if (!assessment.passed) return false;
  return course.chapters.every((ch) => chapterDone(course, ch, ev, cur));
}

const chapterDone = (course: Course, ch: Chapter, ev: Evidence, cur: Curriculum): boolean => {
  const placed = isPlaced(ev, course.id);
  const lessons = ch.lessons.every((l) => {
    const s = lessonState(cur.lessons.get(l.id)!, ev, cur).status;
    return s === 'completed' || s === 'mastered' || s === 'needs-review';
  });
  return lessons && (placed || assessState(ev, ch.id, PASS_SCORE).passed);
};

export interface Access {
  open: boolean;
  /** Prerequisite courses still to do. */
  missing: Course[];
  /** The learner chose to open it early. */
  opened: boolean;
}

/** Prerequisites are guidance, not a lock: a learner can pass a placement check or open a course early. */
export function courseAccess(course: Course, ev: Evidence, cur: Curriculum): Access {
  const missing = course.requires.filter((r) => !courseSatisfied(r, ev, cur)).map((r) => cur.courseById.get(r)!).filter(Boolean);
  const opened = !!ev.meta?.opened.includes(course.id);
  return { open: missing.length === 0 || opened, missing, opened };
}

/* ------------------------------ writing -------------------------------- */

export const lessonRecordId = (lessonId: string): string => `lesson:${lessonId}`;
export const assessRecordId = (assessmentId: string): string => `assess:${assessmentId}`;

export function newLessonRecord(lessonId: string, now: number): LessonRecord {
  return { id: lessonRecordId(lessonId), kind: 'lesson', lessonId, startedAt: now, updatedAt: now, step: 0, exercises: {}, checks: [], missed: [] };
}
export function newAssessmentRecord(id: string, scope: 'chapter' | 'course', now: number): AssessmentRecord {
  return { id: assessRecordId(id), kind: 'assessment', assessmentId: id, scope, startedAt: now, updatedAt: now, attempts: [] };
}

/** Whether every exercise of the lesson has been solved. */
export function exercisesDone(lesson: Lesson, rec: LessonRecord): boolean {
  return lesson.steps.every((s) => !('id' in s) || rec.exercises[s.id]?.solved === true);
}

/**
 * Applies a finished check attempt to a lesson record. The lesson completes when the exercises are done and the check is
 * passed; completion is never taken back (a later poor score changes the status to "needs review" instead).
 */
export function recordCheck(lesson: Lesson, rec: LessonRecord, attempt: CheckAttempt): LessonRecord {
  const missed = lesson.check.filter((q) => !attempt.correct.includes(q.id)).map((q) => q.id);
  const next: LessonRecord = { ...rec, updatedAt: attempt.at, checks: [...rec.checks, attempt].slice(-20), missed };
  if (next.completedAt === undefined && attempt.score >= PASS_SCORE && exercisesDone(lesson, next)) next.completedAt = attempt.at;
  return next;
}

/** Applies a finished assessment attempt. A passed placement check marks the course as known. */
export function recordAssessment(rec: AssessmentRecord, attempt: CheckAttempt, pass: number, placement: boolean, hasLessonProgress: boolean): AssessmentRecord {
  const next: AssessmentRecord = { ...rec, updatedAt: attempt.at, attempts: [...rec.attempts, attempt].slice(-20) };
  if (attempt.score >= pass && next.passedAt === undefined) next.passedAt = attempt.at;
  // Only a check taken BEFORE doing the course's lessons can place the learner out of it.
  if (placement && !hasLessonProgress && attempt.score >= PLACEMENT_SCORE && rec.scope === 'course') next.placed = true;
  return next;
}
