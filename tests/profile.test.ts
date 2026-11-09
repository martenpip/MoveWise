import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START_FEN } from '../src/chess/types';
import { evaluateAchievements, newlyEarned } from '../src/profile/achievements';
import { buildProfileModel } from '../src/profile/model';
import { OPENING_LINES, identifyOpening } from '../src/profile/openings';
import { buildRating } from '../src/profile/rating';
import {
  averageMoves, dayStreaks, finishedGames, firstStreakReached, groupBy, inPeriod, openingStats, recentForm,
  resultsOverTime, streaks, tally,
} from '../src/profile/stats';
import { lessonStats, puzzleStats, qualityStats } from '../src/profile/training';
import { defaultProfile, type ActivityEvent } from '../src/profile/types';
import { DAY, at, game } from './helpers';

const NOW = at(2026, 6, 30);

/* ------------------------------ openings ------------------------------ */

test('every opening line is legal and distinct, and the longest match wins', () => {
  assert.ok(OPENING_LINES.length >= 40);
  const seen = new Set<string>();
  for (const l of OPENING_LINES) {
    assert.ok(l.uci.length >= 1, l.name);
    const key = l.uci.join(' ');
    assert.ok(!seen.has(key), `duplicate line for ${l.name}`);
    seen.add(key);
  }
  const ruy = OPENING_LINES.find((l) => l.name === 'Ruy Lopez')!;
  assert.equal(identifyOpening(START_FEN, ruy.uci)!.name, 'Ruy Lopez');
  assert.equal(identifyOpening(START_FEN, [...ruy.uci, 'a7a6'])!.name, 'Ruy Lopez: Morphy Defense');
  assert.equal(identifyOpening(START_FEN, ['e2e4'])!.name, "King's Pawn Opening");
  assert.equal(identifyOpening(START_FEN, ['a2a3', 'a7a6']), null);
  assert.equal(identifyOpening(START_FEN, []), null);
  assert.equal(identifyOpening('8/8/8/8/8/8/8/K6k w - - 0 1', ['e2e4']), null, 'custom starts are never named');
});

/* ------------------------------- stats -------------------------------- */

test('only finished games the player played against a bot are counted', () => {
  const list = [
    game({ outcome: 'win' }),
    game({ result: '*' }),
    game({ source: 'imported', human: null as never }),
    game({ outcome: 'loss' }),
  ];
  const f = finishedGames(list);
  assert.equal(f.length, 2);
  assert.deepEqual(tally(f), { n: 2, wins: 1, draws: 0, losses: 1, winRate: 0.5, score: 0.5 });
  assert.deepEqual(tally([]), { n: 0, wins: 0, draws: 0, losses: 0, winRate: null, score: null });
});

test('streaks: a draw ends a streak, best and current are tracked separately', () => {
  const seq = ['win', 'win', 'win', 'draw', 'win', 'loss', 'loss'] as const;
  const f = finishedGames(seq.map((o, i) => game({ outcome: o, createdAt: NOW + i })));
  assert.deepEqual(streaks(f), { currentWin: 0, bestWin: 3, currentLoss: 2, worstLoss: 2 });
  assert.deepEqual(recentForm(f, 3), ['win', 'loss', 'loss']);
  assert.deepEqual(streaks([]), { currentWin: 0, bestWin: 0, currentLoss: 0, worstLoss: 0 });
});

test('period filters use real timestamps', () => {
  const f = finishedGames([
    game({ createdAt: NOW - 3 * DAY }),
    game({ createdAt: NOW - 20 * DAY }),
    game({ createdAt: NOW - 60 * DAY }),
    game({ createdAt: NOW - 400 * DAY }),
  ]);
  assert.equal(inPeriod(f, '7d', NOW).length, 1);
  assert.equal(inPeriod(f, '30d', NOW).length, 2);
  assert.equal(inPeriod(f, '90d', NOW).length, 3);
  assert.equal(inPeriod(f, 'all', NOW).length, 4);
});

test('white/black split, grouping and average length', () => {
  const f = finishedGames([
    game({ human: 'white', outcome: 'win', botLevel: 'easy', uciMoves: new Array(20).fill('x') }),
    game({ human: 'black', outcome: 'loss', botLevel: 'easy', uciMoves: new Array(40).fill('x') }),
    game({ human: 'black', outcome: 'draw', botLevel: 'casual', uciMoves: new Array(30).fill('x') }),
  ]);
  assert.equal(tally(f.filter((g) => g.color === 'black')).n, 2);
  const rows = groupBy(f, (g) => g.game.botLevel);
  assert.equal(rows.find((r) => r.key === 'easy')!.n, 2);
  assert.equal(averageMoves(f), (10 + 20 + 15) / 3);
  assert.equal(averageMoves([]), null);
});

test('results over time bucket by day for short periods and by week for long ones', () => {
  const f = finishedGames([
    game({ createdAt: at(2026, 6, 1, 9), outcome: 'win' }),
    game({ createdAt: at(2026, 6, 1, 20), outcome: 'loss' }),
    game({ createdAt: at(2026, 6, 3), outcome: 'draw' }),
    game({ createdAt: at(2026, 6, 4), outcome: 'win' }),
  ]);
  const daily = resultsOverTime(f, '30d');
  assert.equal(daily.length, 3);
  assert.deepEqual([daily[0]!.wins, daily[0]!.losses], [1, 1]);
  const weekly = resultsOverTime(f, 'all');
  assert.equal(weekly.length, 1, 'all four fall in the same Monday-based week');
  assert.equal(weekly[0]!.wins + weekly[0]!.draws + weekly[0]!.losses, 4);
});

test('opening stats name openings and count the rest as unrecognised', () => {
  const italian = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'];
  const f = finishedGames([
    game({ human: 'white', outcome: 'win', uciMoves: italian }),
    game({ human: 'white', outcome: 'loss', uciMoves: italian }),
    game({ human: 'black', outcome: 'win', uciMoves: ['d2d4', 'd7d5', 'c2c4', 'e7e6'] }),
    game({ human: 'white', outcome: 'win', uciMoves: ['a2a3', 'a7a6', 'b2b3', 'b7b6'] }),
  ]);
  const o = openingStats(f);
  assert.equal(o.unrecognised, 1);
  assert.equal(o.white[0]!.key, 'Italian Game: Giuoco Piano');
  assert.equal(o.white[0]!.n, 2);
  assert.equal(o.white[0]!.winRate, 0.5);
  assert.equal(o.black[0]!.key, "Queen's Gambit Declined");
});

test('day streaks: consecutive local days, forgiving of an unfinished today', () => {
  const days = [at(2026, 6, 20), at(2026, 6, 21), at(2026, 6, 22), at(2026, 6, 28), at(2026, 6, 29)];
  assert.deepEqual(dayStreaks(days, at(2026, 6, 29, 23)), { current: 2, best: 3, activeDays: 5 });
  assert.deepEqual(dayStreaks(days, at(2026, 6, 30, 8)), { current: 2, best: 3, activeDays: 5 }, 'yesterday still counts');
  assert.equal(dayStreaks(days, at(2026, 7, 2)).current, 0, 'two idle days break it');
  assert.deepEqual(dayStreaks([], NOW), { current: 0, best: 0, activeDays: 0 });
  const week = Array.from({ length: 7 }, (_, i) => at(2026, 6, 10 + i));
  assert.equal(firstStreakReached(week, 7), at(2026, 6, 16, 0));
  assert.equal(firstStreakReached(week.slice(0, 6), 7), null);
});

/* ---------------------- training analytics (future) -------------------- */

const puzzle = (i: number, solved: boolean, themes: string[], rating = 1200): ActivityEvent => ({
  id: `p${i}`, kind: 'puzzle', at: NOW + i, puzzleId: `z${i}`, puzzleRating: rating, solved, timeMs: 10_000 + i, hintsUsed: 0, themes,
});

test('puzzle rating is its own track: empty without puzzles, rises with solves', () => {
  const none = puzzleStats([]);
  assert.equal(none.rating, null);
  assert.equal(none.successRate, null);
  const ps = puzzleStats([puzzle(1, true, ['fork']), puzzle(2, true, ['fork']), puzzle(3, false, ['pin'])]);
  assert.equal(ps.attempts, 3);
  assert.equal(ps.solved, 2);
  assert.ok(ps.rating! > 0 && ps.history.length === 3);
  assert.equal(ps.provisional, true);
  assert.equal(ps.avgSolveMs, (10_001 + 10_002) / 2);
});

test('puzzle theme analytics need a minimum sample before naming weaknesses', () => {
  const events = [
    ...Array.from({ length: 6 }, (_, i) => puzzle(i, i < 5, ['fork'])),
    ...Array.from({ length: 6 }, (_, i) => puzzle(10 + i, i < 2, ['pin'])),
    puzzle(30, false, ['skewer']),
  ];
  const ps = puzzleStats(events, 5);
  assert.deepEqual(ps.weakest.map((w) => w.theme), ['pin', 'fork']);
  assert.equal(ps.weakest.some((w) => w.theme === 'skewer'), false, 'one attempt is not evidence');
  assert.equal(ps.strongest[0]!.theme, 'fork');
});

test('lesson stats: completion needs a known total, mastery has explicit rules', () => {
  const les = (id: string, topic: string, score: number | null, completed = true): ActivityEvent => ({ id: `e${id}`, kind: 'lesson', at: NOW, lessonId: id, topic, completed, score });
  const s = lessonStats([les('a', 'forks', 0.9), les('b', 'forks', 0.85), les('c', 'pins', 0.4), les('d', 'mate', 1), les('e', 'mate', null, false)], 10);
  assert.equal(s.completed, 4);
  assert.equal(s.completionRate, 0.4);
  assert.equal(s.topics.find((t) => t.topic === 'forks')!.status, 'mastered');
  assert.equal(s.topics.find((t) => t.topic === 'pins')!.status, 'practice');
  assert.equal(s.topics.find((t) => t.topic === 'mate')!.status, 'learning');
  assert.equal(lessonStats([], 0).completionRate, null, 'unknown total means no percentage');
});

test('quality stats average real review records', () => {
  const r = (i: number, acc: number): ActivityEvent => ({
    id: `r${i}`, kind: 'review', at: NOW + i, gameId: `g${i}`, acpl: 100 - acc, accuracy: acc, inaccuracies: 2, mistakes: 1, blunders: i % 2,
    missedTactics: 1, phaseAcpl: { opening: 20, middlegame: i === 1 ? null : 40, endgame: null }, weaknesses: ['hung a piece'],
  });
  const q = qualityStats([r(1, 80), r(2, 60)]);
  assert.equal(q.reviewedGames, 2);
  assert.equal(q.avgAccuracy, 70);
  assert.equal(q.avgAcpl, 30);
  assert.equal(q.blundersPerGame, 0.5);
  assert.equal(q.phaseAcpl.middlegame, 40, 'null phases are skipped, not treated as zero');
  assert.equal(q.phaseAcpl.endgame, null);
  assert.equal(q.best!.accuracy, 80);
  assert.equal(q.worst!.accuracy, 60);
  assert.deepEqual(q.weaknesses, [{ tag: 'hung a piece', count: 2 }]);
  assert.equal(qualityStats([]).avgAcpl, null);
});

/* ---------------------------- achievements ---------------------------- */

test('achievements are earned from real activity and unavailable ones say why', () => {
  const none = evaluateAchievements({ games: [], activity: [], rating: buildRating([]) });
  assert.ok(none.every((a) => !a.earned));
  // Puzzles (Phase 3) and lessons (Phase 4) exist in this build. With a feature off, its achievements stay unavailable.
  assert.equal(none.find((a) => a.id === 'first-puzzle')!.available, true);
  assert.equal(evaluateAchievements({ games: [], activity: [], rating: buildRating([]), features: { puzzles: false, lessons: false, review: true } }).find((a) => a.id === 'first-puzzle')!.available, false);
  assert.equal(none.find((a) => a.id === 'first-lesson')!.available, true);
  const noLessons = evaluateAchievements({ games: [], activity: [], rating: buildRating([]), features: { puzzles: true, lessons: false, review: true } });
  assert.match(noLessons.find((a) => a.id === 'first-lesson')!.unavailableReason!, /not available yet|not built/i);
  assert.equal(none.find((a) => a.id === 'first-game')!.available, true);

  const games = [game({ outcome: 'win', reason: 'checkmate' })];
  const a = evaluateAchievements({ games, activity: [], rating: buildRating(games) });
  for (const id of ['first-game', 'first-win', 'first-mate']) assert.ok(a.find((x) => x.id === id)!.earned, id);
  assert.ok(!a.find((x) => x.id === 'ten-games')!.earned);

  const resigned = [game({ outcome: 'win', reason: 'resignation' })];
  assert.ok(!evaluateAchievements({ games: resigned, activity: [], rating: buildRating(resigned) }).find((x) => x.id === 'first-mate')!.earned, 'a resignation is not a checkmate');
  const lost = [game({ outcome: 'loss', reason: 'checkmate' })];
  assert.ok(!evaluateAchievements({ games: lost, activity: [], rating: buildRating(lost) }).find((x) => x.id === 'first-mate')!.earned, 'being mated is not delivering mate');
});

test('puzzle and lesson achievements unlock only when the feature exists; newlyEarned diffs correctly', () => {
  const on = { puzzles: true, lessons: true, review: false };
  const before = evaluateAchievements({ games: [], activity: [], rating: buildRating([]), features: on });
  const act: ActivityEvent[] = [puzzle(1, true, ['fork']), { id: 'l1', kind: 'lesson', at: NOW, lessonId: 'a', topic: 't', completed: true, score: 1 }];
  const off = evaluateAchievements({ games: [], activity: act, rating: buildRating([]), features: { puzzles: false, lessons: false, review: false } });
  assert.ok(off.every((a) => !a.earned), 'activity for a feature that does not exist earns nothing');
  const after = evaluateAchievements({ games: [], activity: act, rating: buildRating([]), features: on });
  assert.deepEqual(newlyEarned(before, after).map((a) => a.id).sort(), ['first-lesson', 'first-puzzle']);
  assert.deepEqual(newlyEarned(after, after), []);
});

test('win streak and ten-games achievements', () => {
  const games = Array.from({ length: 10 }, (_, i) => game({ createdAt: NOW + i, outcome: i < 3 ? 'win' : 'loss' }));
  const a = evaluateAchievements({ games, activity: [], rating: buildRating(games) });
  assert.ok(a.find((x) => x.id === 'three-wins')!.earned);
  assert.ok(a.find((x) => x.id === 'ten-games')!.earned);
  assert.ok(!a.find((x) => x.id === 'fifty-games')!.earned);
});

/* ------------------------------- model -------------------------------- */

test('profile model combines everything and reports why games are unrated', () => {
  const games = [
    game({ createdAt: NOW - 2 * DAY, outcome: 'win', botLevel: 'r1100' }),
    game({ createdAt: NOW - 1 * DAY, outcome: 'loss', botLevel: 'casual', human: 'black' }),
    game({ createdAt: NOW - 1 * DAY + 5, outcome: 'win', botLevel: 'casual', takebacks: 1 }),
    game({ createdAt: NOW - 40 * DAY, outcome: 'win', botLevel: 'r1200' }),
  ];
  const m = buildProfileModel({ games, activity: [], profile: defaultProfile(NOW), period: '7d', now: NOW });
  assert.equal(m.allTime.n, 4);
  assert.equal(m.overall.n, 3, 'period filter applied to period stats');
  assert.equal(m.rating.ratedGames, 3, 'rating always uses all eligible games');
  assert.deepEqual(m.unrated, [{ reason: 'takebacks', count: 1 }]);
  assert.equal(m.asBlack.n, 1);
  assert.ok(m.bestWin && m.bestWin.game.botLevel === 'r1100');
  assert.ok(m.worstLoss && m.worstLoss.game.botLevel === 'casual');
  assert.equal(m.puzzles.rating, null, 'no puzzle rating without puzzles');
  assert.equal(m.lessons.completionRate, null);
  assert.equal(m.quality.reviewedGames, 0);
  assert.deepEqual(m.byLevel.map((r) => r.key), ['casual', 'r1100']);
});

test('an empty profile produces empty, honest values rather than zeros pretending to be data', () => {
  const m = buildProfileModel({ games: [], activity: [], profile: defaultProfile(NOW), period: 'all', now: NOW });
  assert.equal(m.overall.winRate, null);
  assert.equal(m.avgMoves, null);
  assert.equal(m.bestWin, null);
  assert.equal(m.rating.confidence, 'unrated');
  assert.deepEqual(m.form, []);
  assert.equal(m.activity.current, 0);
});

test('default profile starts at the earliest game when games already exist', () => {
  assert.equal(defaultProfile(1000).startedAt, 1000);
  assert.equal(defaultProfile(1000, 400).startedAt, 400);
  assert.equal(defaultProfile(1000, 5000).startedAt, 1000);
});

test('statistics are kept apart: competitive, practice and Trainer games never mix', () => {
  const games = [
    game({ createdAt: NOW - 5 * DAY, outcome: 'win', botLevel: 'r1200' }),
    game({ createdAt: NOW - 4 * DAY, outcome: 'loss', botLevel: 'r1500' }),
    game({ createdAt: NOW - 3 * DAY, outcome: 'win', botLevel: 'r400' }),
    game({ createdAt: NOW - 3 * DAY + 1, outcome: 'win', botLevel: 'r900' }),
    game({ createdAt: NOW - 3 * DAY + 2, outcome: 'win', botLevel: 'easy' }),
    game({ createdAt: NOW - 2 * DAY, outcome: 'loss', botLevel: 'r1800', mode: 'trainer' }),
    game({ createdAt: NOW - 1 * DAY, outcome: 'win', botLevel: 'r300', mode: 'trainer' }),
  ];
  const m = buildProfileModel({ games, activity: [], profile: defaultProfile(NOW), period: 'all', now: NOW });
  assert.equal(m.byKind.competitive.n, 2);
  assert.equal(m.byKind.practice.n, 3);
  assert.equal(m.byKind.trainer.n, 2);
  assert.equal(m.byKind.competitive.wins, 1);
  assert.equal(m.byKind.practice.wins, 3, 'practice wins are counted only as practice');
  assert.equal(m.byKind.trainer.losses, 1);
  assert.equal(m.byKind.competitive.n + m.byKind.practice.n + m.byKind.trainer.n, m.allTime.n);
  assert.equal(m.rating.ratedGames, 2, 'only the two competitive games are rated');
  const reasons = Object.fromEntries(m.unrated.map((u) => [u.reason, u.count]));
  assert.equal(reasons['practice-bot'], 3);
  assert.equal(reasons['trainer'], 2);
});
