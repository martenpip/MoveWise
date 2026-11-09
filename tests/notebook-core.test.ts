import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseReview } from '../src/review/analyse';
import { autoEntries, entryFromPly, entryIdFor, mergeEntry, qualifies, MAX_AUTO_PER_GAME, type GameInfo } from '../src/notebook/capture';
import { ACCEPT_LOSS, hintFor, judgeMove, type Evaluator } from '../src/notebook/exercise';
import { insightsFrom, MIN_EVIDENCE } from '../src/notebook/insights';
import { DAY_MS, MIN_EASE, MAX_EASE, RELEARN_MS, daysUntilDue, endOfDay, gradeFor, isDueToday, newSchedule, reschedule, sessionQueue, statusOf } from '../src/notebook/srs';
import type { Grade, NotebookEntry } from '../src/notebook/types';
import { COURSES } from '../src/academy/curriculum';
import { THEMES } from '../src/puzzles/themes';
import { hungKnight, makeReview, missedQueen, scholar, thrownAdvantage } from './review-fixtures';
import { at } from './helpers';

const NOW = at(2026, 3, 10, 9);
const info = (id: string): GameInfo => ({ gameId: id, white: 'You', black: 'Bot', playedAt: NOW });

function fromFixture(review: ReturnType<typeof hungKnight>, id = review.gameId): NotebookEntry[] {
  return autoEntries(analyseReview(review), info(id), NOW);
}

/* ------------------------------ spaced repetition ------------------------------ */

test('SRS: a new schedule is due immediately and untouched', () => {
  const s = newSchedule(NOW);
  assert.equal(s.due, NOW);
  assert.equal(s.attempts, 0);
  assert.equal(s.lastGrade, null);
});

test('SRS: grades come from what happened in the attempt', () => {
  assert.equal(gradeFor({ wrong: 0, hints: 0, solved: true, revealed: false }), 'easy');
  assert.equal(gradeFor({ wrong: 1, hints: 0, solved: true, revealed: false }), 'good');
  assert.equal(gradeFor({ wrong: 0, hints: 1, solved: true, revealed: false }), 'good');
  assert.equal(gradeFor({ wrong: 0, hints: 3, solved: true, revealed: false }), 'hard');
  assert.equal(gradeFor({ wrong: 3, hints: 0, solved: true, revealed: false }), 'hard');
  assert.equal(gradeFor({ wrong: 1, hints: 2, solved: true, revealed: false }), 'hard');
  assert.equal(gradeFor({ wrong: 0, hints: 0, solved: true, revealed: true }), 'failed');
  assert.equal(gradeFor({ wrong: 2, hints: 0, solved: false, revealed: false }), 'failed');
});

test('SRS: intervals grow with the quality of recall, and a failure comes back within the session', () => {
  const s0 = newSchedule(NOW);
  const easy = reschedule(s0, 'easy', NOW);
  const good = reschedule(s0, 'good', NOW);
  const hard = reschedule(s0, 'hard', NOW);
  const failed = reschedule(s0, 'failed', NOW);
  assert.equal(easy.intervalDays, 3);
  assert.equal(good.intervalDays, 1);
  assert.equal(hard.intervalDays, 1);
  assert.equal(easy.due, NOW + 3 * DAY_MS);
  assert.equal(failed.due, NOW + RELEARN_MS);
  assert.equal(failed.intervalDays, 0);
  assert.equal(failed.lapses, 0, 'failing a position the first time is not a lapse');
  assert.ok(failed.ease < s0.ease && hard.ease < s0.ease && easy.ease > s0.ease);
  assert.equal(good.ease, s0.ease);
});

test('SRS: repeated success gives progressively longer intervals', () => {
  let s = newSchedule(NOW);
  let t = NOW;
  const days: number[] = [];
  for (let i = 0; i < 6; i++) {
    s = reschedule(s, 'good', t);
    days.push(s.intervalDays);
    t = s.due;
  }
  assert.deepEqual(days.slice(0, 3), [1, 3, Math.round(3 * 2.5)]);
  for (let i = 1; i < days.length; i++) assert.ok(days[i]! > days[i - 1]!, `interval ${i} should grow: ${days.join(',')}`);
});

test('SRS: a failure after learning resets the run, counts a lapse and lowers ease, but never below the floor', () => {
  let s = newSchedule(NOW);
  s = reschedule(s, 'good', NOW);
  s = reschedule(s, 'good', NOW + DAY_MS);
  assert.equal(s.reps, 2);
  const f = reschedule(s, 'failed', NOW + 5 * DAY_MS);
  assert.equal(f.reps, 0);
  assert.equal(f.lapses, 1);
  let x = f;
  for (let i = 0; i < 20; i++) x = reschedule(x, 'failed', NOW + 6 * DAY_MS);
  assert.equal(x.ease, MIN_EASE);
  let y = newSchedule(NOW);
  for (let i = 0; i < 40; i++) y = reschedule(y, 'easy', NOW);
  assert.ok(y.ease <= MAX_EASE);
  assert.ok(y.intervalDays <= 365);
});

test('SRS: it is deterministic, does not mutate its input and keeps a bounded history', () => {
  const s = newSchedule(NOW);
  const frozen = JSON.stringify(s);
  const a = reschedule(s, 'good', NOW);
  const b = reschedule(s, 'good', NOW);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(s), frozen);
  let h = s;
  for (let i = 0; i < 80; i++) h = reschedule(h, (['good', 'easy', 'hard', 'failed'] as Grade[])[i % 4]!, NOW + i);
  assert.ok(h.history.length <= 30);
  assert.equal(h.attempts, 80);
});

test('SRS: due-date and status calculation', () => {
  const entries = fromFixture(hungKnight());
  assert.equal(entries.length, 1);
  const e = entries[0]!;
  assert.equal(statusOf(e, NOW), 'new');
  assert.ok(isDueToday(e, NOW));
  // learning
  const learned = { ...e, srs: reschedule(e.srs, 'good', NOW) };
  assert.equal(statusOf(learned, NOW), 'learning', 'recalled once, scheduled for tomorrow');
  assert.equal(statusOf(learned, NOW + DAY_MS), 'due');
  assert.equal(daysUntilDue(learned, NOW), 1);
  assert.equal(daysUntilDue(learned, NOW + 3 * DAY_MS), 0);
  // needs practice
  const failed = { ...e, srs: reschedule(learned.srs, 'failed', NOW + DAY_MS) };
  assert.equal(statusOf(failed, NOW + DAY_MS), 'needs-practice');
  // retained: several successes in a row and a long interval
  let s = newSchedule(NOW);
  let t = NOW;
  for (let i = 0; i < 5; i++) { s = reschedule(s, 'easy', t); t = s.due; }
  const retained = { ...e, srs: s };
  assert.equal(statusOf(retained, s.lastReviewed! + DAY_MS), 'retained');
  assert.ok(endOfDay(NOW) >= NOW && endOfDay(NOW) - NOW < DAY_MS);
});

test('SRS: a focused session lists what is due today, failed positions first, and respects the limit', () => {
  const base = fromFixture(hungKnight())[0]!;
  const mk = (i: number, due: number, last: Grade | null): NotebookEntry => ({ ...base, id: `nb:${i}`, savedAt: i, srs: { ...base.srs, due, attempts: last ? 1 : 0, lastGrade: last } });
  const q = sessionQueue([mk(1, NOW + 5 * DAY_MS, 'good'), mk(2, NOW - DAY_MS, 'good'), mk(3, NOW, 'failed'), mk(4, NOW - 3 * DAY_MS, null)], NOW, 10);
  assert.deepEqual(q.map((e) => e.id), ['nb:3', 'nb:4', 'nb:2']);
  assert.equal(sessionQueue([mk(1, NOW, null), mk(2, NOW, null)], NOW, 1).length, 1);
});

/* ------------------------------ automatic capture ------------------------------ */

test('capture: a blunder that hangs a piece qualifies and carries everything needed to rebuild the position', () => {
  const a = analyseReview(hungKnight());
  const e = autoEntries(a, info('hung'), NOW);
  assert.equal(e.length, 1);
  const x = e[0]!;
  assert.equal(x.kind, 'hung-piece');
  assert.equal(x.severity, 'blunder');
  assert.equal(x.sideToMove, 'white');
  assert.equal(x.played?.san, 'Nxe5');
  assert.equal(x.id, entryIdFor(x.fen));
  assert.ok(x.id.startsWith('nb:'));
  assert.equal(x.fen, 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
  assert.deepEqual(x.previous, { fen: a.plies[3]!.fenBefore, uci: 'b8c6' });
  assert.equal(x.origin.gameId, 'hung');
  assert.equal(x.moveNumber, 3);
  assert.ok(x.winLoss! >= 15);
  assert.equal(x.evalBefore !== null && x.evalAfter !== null, true);
  assert.ok(x.explanation.length > 30);
  assert.equal(x.srs.attempts, 0);
  assert.equal(x.occurrences.length, 1);
});

test('capture: a missed forced win of material is saved as a missed tactic with a verified theme', () => {
  const e = fromFixture(missedQueen());
  assert.equal(e.length, 1);
  assert.equal(e[0]!.kind, 'missed-tactic');
  assert.equal(e[0]!.best.uci, 'd1d5');
  assert.ok(e[0]!.themes.includes('hangingPiece'), 'the queen on d5 was undefended');
});

test('capture: ordinary fluctuations are not saved (inaccuracies, a mate the opponent played, a position already decided)', () => {
  const small = makeReview({ id: 'small', moves: ['e2e4', 'e7e5'], perspective: 'white', evals: [{ cp: 10, best: 'd2d4', pv: ['d2d4'] }, { cp: -90, best: 'e7e5' }, { cp: -85, best: 'g1f3' }] });
  const sp = analyseReview(small).plies[0]!;
  assert.equal(sp.cls, 'inaccuracy');
  assert.equal(fromFixture(small).length, 0, 'an inaccuracy is not saved automatically');
  assert.equal(fromFixture(thrownAdvantage()).length, 1, 'but throwing away a clear advantage is a mistake worth saving');
  const sch = analyseReview(scholar('black'));
  // Black walked into mate: its moves were already lost positions or forced, so nothing qualifies for the loser's slip after it was lost
  for (const p of sch.plies) if (p.color === 'black' && p.winBefore < 10) assert.equal(qualifies(p, 'black'), false);
  assert.equal(autoEntries(analyseReview(hungKnight(null)), info('x'), NOW).length, 0, 'no perspective, no personal notebook');
});

test('capture: the opponent’s mistakes are never saved for the player', () => {
  assert.equal(fromFixture(hungKnight('black')).length, 0);
});

test('capture: never more than the cap per game', () => {
  assert.ok(MAX_AUTO_PER_GAME >= 1 && MAX_AUTO_PER_GAME <= 8);
});

test('manual saving: any analysed move can be saved by hand and is marked as saved by you', () => {
  const a = analyseReview(hungKnight());
  const p = a.plies[0]!; // 1.e4, a perfectly good move
  const e = entryFromPly(a, p, info('hung'), NOW, true)!;
  assert.equal(e.kind, 'manual');
  assert.equal(e.severity, 'manual');
  assert.equal(e.fen.split(' ')[1], 'w');
});

test('duplicates: the same position found twice is one entry; a new game adds an occurrence and schedules it again', () => {
  const first = fromFixture(hungKnight(), 'game-1')[0]!;
  const again = fromFixture(hungKnight(), 'game-2')[0]!;
  assert.equal(first.id, again.id);
  assert.equal(mergeEntry(first, first, NOW), first, 'the same game and move again changes nothing');
  const practised = { ...first, srs: reschedule(reschedule(first.srs, 'good', NOW), 'good', NOW + DAY_MS) };
  const merged = mergeEntry(practised, again, NOW + 2 * DAY_MS);
  assert.equal(merged.occurrences.length, 2);
  assert.equal(merged.srs.lapses, practised.srs.lapses + 1);
  assert.equal(statusOf(merged, NOW + 2 * DAY_MS), 'needs-practice');
  assert.equal(merged.srs.attempts, practised.srs.attempts);
  // an unpractised entry just gains the occurrence
  const m2 = mergeEntry(first, again, NOW + 1);
  assert.equal(m2.occurrences.length, 2);
  assert.equal(m2.srs.lapses, 0);
});

/* ------------------------------ exercises and hints ------------------------------ */

const base = (): NotebookEntry => fromFixture(hungKnight())[0]!;

test('exercise: the engine move is correct, the original mistake is not, illegal moves are rejected', async () => {
  const e = base();
  assert.deepEqual(await judgeMove(e, e.best.uci), { kind: 'best' });
  const again = await judgeMove(e, 'f3e5');
  assert.equal(again.kind, 'wrong');
  assert.equal(again.kind === 'wrong' && again.reason, 'played-again');
  const bad = await judgeMove(e, 'a1a8');
  assert.equal(bad.kind === 'wrong' && bad.reason, 'illegal');
});

test('exercise: a known alternative is accepted, and an alternative is accepted when the engine confirms it', async () => {
  const e = { ...base(), alternatives: ['d2d4'] };
  assert.deepEqual(await judgeMove(e, 'd2d4'), { kind: 'acceptable', loss: 0, via: 'known' });
  const plain = base();
  const evalAfter = (cp: number): Evaluator => async () => ({ cp, mate: null });
  // evalBefore is about -190 for white in this fixture; a move that keeps it close is acceptable
  const near = await judgeMove(plain, 'f1c4', evalAfter(plain.evalBefore! + 10));
  assert.equal(near.kind, 'acceptable');
  const worse = await judgeMove(plain, 'f1c4', evalAfter(plain.evalBefore! - 400));
  assert.equal(worse.kind, 'wrong');
  assert.equal(worse.kind === 'wrong' && worse.reason, 'worse');
  assert.ok(ACCEPT_LOSS > 0);
});

test('exercise: without an engine a different move is not called wrong for chess reasons, it is reported as unchecked', async () => {
  const e = base();
  const r = await judgeMove(e, 'f1c4');
  assert.equal(r.kind === 'wrong' && r.reason, 'unchecked');
  const failing = await judgeMove(e, 'f1c4', async () => { throw new Error('engine crashed'); });
  assert.equal(failing.kind === 'wrong' && failing.reason, 'unchecked');
});

test('exercise: hints get more specific and only the last one names the piece', () => {
  const e = fromFixture(missedQueen())[0]!;
  const h1 = hintFor(e, 1).text, h2 = hintFor(e, 2).text, h3 = hintFor(e, 3);
  assert.ok(h1.length > 20 && !/queen on d1|d5/i.test(h1), 'level 1 names no square: ' + h1);
  assert.ok(/d5/.test(h2) && !/queen on d1/i.test(h2), 'level 2 points at the target: ' + h2);
  assert.ok(/queen on d1/i.test(h3.text) && /captures/.test(h3.text));
  assert.equal(h3.square, 3);
  assert.notEqual(h1, h2);
});

/* ------------------------------ insights ------------------------------ */

test('insights: no conclusions from fewer than three positions, plain wording from three or more', () => {
  const e = base();
  const knightFork = (i: number): NotebookEntry => ({ ...e, id: `nb:${i}`, themes: ['fork', 'knightFork'], savedAt: NOW - i * DAY_MS });
  assert.deepEqual(insightsFrom([knightFork(1), knightFork(2)], NOW), []);
  const out = insightsFrom([knightFork(1), knightFork(2), knightFork(3)], NOW);
  assert.equal(out[0]!.id, 'knight-forks');
  assert.equal(out[0]!.sentence, 'You have missed several knight forks recently.');
  assert.ok(MIN_EVIDENCE === 3);
  // old evidence expires
  const old = [1, 2, 3].map((i) => ({ ...knightFork(i), savedAt: NOW - 400 * DAY_MS, occurrences: [{ gameId: 'g', ply: 1, uci: 'e2e4', at: NOW - 400 * DAY_MS }] }));
  assert.deepEqual(insightsFrom(old, NOW), []);
});

test('insights: every suggested lesson and puzzle theme exists in this app', () => {
  const e = base();
  const lessons = new Set(COURSES.flatMap((c) => c.chapters.flatMap((ch) => ch.lessons.map((l) => l.id))));
  const themes = new Set(THEMES.map((t) => t.id));
  const all: NotebookEntry[] = [];
  for (const kind of ['missed-mate', 'allowed-mate', 'hung-piece'] as const) for (let i = 0; i < 3; i++) all.push({ ...e, id: `nb:${kind}${i}`, kind, tags: ['threw-away-advantage', 'hung-piece'], phase: 'endgame', themes: ['fork', 'knightFork', 'hangingPiece'] });
  const ins = insightsFrom(all, NOW);
  assert.ok(ins.length >= 5);
  for (const i of ins) {
    for (const l of i.suggest.lessons) assert.ok(lessons.has(l), `lesson ${l} for ${i.id}`);
    for (const t of i.suggest.puzzleThemes) assert.ok(themes.has(t), `theme ${t} for ${i.id}`);
  }
});
