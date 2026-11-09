import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES, evaluateAchievements, getAchievementDefs, mergeAchievementStates, registerAchievements, syncAchievements,
} from '../src/profile/achievements';
import { checkAchievements } from '../src/profile/achievementService';
import { buildRating, type RatingPoint, type RatingSummary } from '../src/profile/rating';
import { dayIndex, streakReached } from '../src/profile/stats';
import { MemoryStore } from '../src/storage/store';
import { BACKUP_VERSION } from '../src/storage/types';
import type { ActivityEvent } from '../src/profile/types';
import { DAY, at, game } from './helpers';

const NOW = at(2026, 6, 30);
const ON = { puzzles: true, lessons: true, review: true };
const ctx = (games = [] as ReturnType<typeof game>[], activity: ActivityEvent[] = [], extra = {}) => ({ games, activity, rating: buildRating(games), ...extra });
const find = (list: ReturnType<typeof evaluateAchievements>, id: string) => list.find((a) => a.id === id)!;
const puzzle = (i: number, solved: boolean, themes: string[] = ['fork'], t = NOW + i): ActivityEvent => ({ id: `p${i}`, kind: 'puzzle', at: t, puzzleId: `pz${i}`, puzzleRating: 1200, solved, timeMs: 5000, hintsUsed: 0, themes });

/** A rating summary with an explicit history, so rating achievements can be tested without simulating hundreds of games. */
function ratingOf(afters: number[], start = 800): RatingSummary {
  let prev = start;
  const history: RatingPoint[] = afters.map((a, i) => {
    const p: RatingPoint = { gameId: `r${i}`, at: NOW + i * 1000, before: prev, after: a, delta: a - prev, rdAfter: 80, opponentLevel: 'casual', opponentRating: 900, score: 1 };
    prev = a;
    return p;
  });
  const cur = afters.length ? afters[afters.length - 1]! : start;
  return { ratedGames: afters.length, current: cur, rd: 80, confidence: 'provisional', peak: Math.max(start, ...afters), peakAt: null, lastDelta: null, low: cur - 160, high: cur + 160, history };
}

/* ------------------------------ registry ------------------------------ */

test('registry: ids are unique, every category is used, every achievement explains itself', () => {
  const defs = getAchievementDefs();
  assert.equal(new Set(defs.map((d) => d.id)).size, defs.length);
  const cats = new Set(CATEGORIES.map((c) => c.id));
  for (const d of defs) {
    assert.ok(cats.has(d.category), d.id);
    assert.ok(d.title && d.description && d.condition, d.id);
  }
  for (const c of CATEGORIES) assert.ok(defs.some((d) => d.category === c.id), `empty category ${c.id}`);
});

test('registry: future features can add achievements; duplicates are refused', () => {
  const def = {
    id: 'test-future', category: 'tactics' as const, title: 'T', description: 'd', condition: 'c', icon: 'star' as const, rarity: 'common' as const,
    evaluate: () => ({ current: 1, target: 1, unit: 'x', at: 5 }),
  };
  const off = registerAchievements([def]);
  try {
    assert.ok(find(evaluateAchievements(ctx()), 'test-future').earned);
    assert.throws(() => registerAchievements([def]), /Duplicate/);
  } finally {
    off();
  }
  assert.ok(!getAchievementDefs().some((d) => d.id === 'test-future'));
});

/* ------------------------- thresholds and progress ------------------------- */

test('games played: thresholds and progress', () => {
  const games = Array.from({ length: 9 }, (_, i) => game({ createdAt: NOW + i, outcome: 'win' }));
  let a = evaluateAchievements(ctx(games));
  assert.ok(!find(a, 'ten-games').earned);
  assert.deepEqual([find(a, 'ten-games').progress.current, find(a, 'ten-games').progress.target], [9, 10]);
  assert.equal(find(a, 'ten-games').progress.pct, 0.9);
  games.push(game({ createdAt: NOW + 9, outcome: 'loss' }));
  a = evaluateAchievements(ctx(games));
  assert.ok(find(a, 'ten-games').earned);
  assert.equal(find(a, 'ten-games').earnedAt, games[9]!.createdAt, 'unlock time is the time of the game that crossed the line');
  assert.ok(!find(a, 'fifty-games').earned);
});

test('only finished bot games count: unfinished, imported PGN and unknown-human games earn nothing', () => {
  const imported = game({ outcome: 'win', source: 'imported', human: null });
  const a = evaluateAchievements(ctx([imported]));
  assert.ok(!find(a, 'first-game').earned, 'a game from a PGN file is not the player\'s game');
  assert.ok(!find(a, 'first-win').earned);
  const restored = game({ outcome: 'win' }); // backup-restored games keep source "played"
  assert.ok(find(evaluateAchievements(ctx([restored])), 'first-game').earned);
});

test('win streaks, comeback and consistency', () => {
  const seq = (o: Array<'win' | 'loss' | 'draw'>) => o.map((x, i) => game({ createdAt: NOW + i, outcome: x }));
  assert.ok(find(evaluateAchievements(ctx(seq(['win', 'win', 'win']))), 'three-wins').earned);
  assert.ok(!find(evaluateAchievements(ctx(seq(['win', 'win', 'draw', 'win']))), 'three-wins').earned, 'a draw ends the run');
  assert.ok(find(evaluateAchievements(ctx(seq(['win', 'win', 'win', 'win', 'win']))), 'five-wins').earned);
  assert.ok(!find(evaluateAchievements(ctx(seq(['win', 'win', 'win', 'win']))), 'five-wins').earned);
  assert.ok(find(evaluateAchievements(ctx(seq(['loss', 'loss', 'loss', 'win']))), 'comeback').earned);
  assert.ok(!find(evaluateAchievements(ctx(seq(['loss', 'loss', 'win']))), 'comeback').earned);
  const many = seq(Array.from({ length: 25 }, (_, i) => (i < 16 ? 'win' : 'loss')));
  assert.ok(find(evaluateAchievements(ctx(many)), 'consistency').earned, '16/25 = 64%');
  const few = seq(Array.from({ length: 24 }, () => 'win'));
  assert.ok(!find(evaluateAchievements(ctx(few)), 'consistency').earned, 'needs a real sample');
});

test('first mate: only a checkmate win counts', () => {
  assert.ok(find(evaluateAchievements(ctx([game({ outcome: 'win', reason: 'checkmate' })])), 'first-mate').earned);
  assert.ok(!find(evaluateAchievements(ctx([game({ outcome: 'win', reason: 'resignation' })])), 'first-mate').earned);
  assert.ok(!find(evaluateAchievements(ctx([game({ outcome: 'loss', reason: 'checkmate' })])), 'first-mate').earned);
});

/* ---------------------------- rating achievements ---------------------------- */

test('level-up needs 10 rated games and two consecutive games at the milestone', () => {
  const r = (afters: number[]) => find(evaluateAchievements({ games: [], activity: [], rating: ratingOf(afters) }), 'level-up');
  const nine = Array.from({ length: 9 }, () => 1020);
  assert.ok(!r(nine).earned, 'fewer than 10 rated games');
  const spike = [...Array.from({ length: 9 }, () => 900), 1010, 900];
  assert.ok(!r(spike).earned, 'one lucky game at the milestone is not enough');
  const steady = [...Array.from({ length: 9 }, () => 900), 1010, 1005];
  assert.ok(r(steady).earned);
  const early = [...Array.from({ length: 4 }, () => 1100), ...Array.from({ length: 6 }, () => 1100)];
  assert.ok(r(early).earned, 'unlocked on the first game after the 10-game gate where both are at the milestone');
});

test('personal best needs 10 rated games and a real margin', () => {
  const pb = (afters: number[]) => find(evaluateAchievements({ games: [], activity: [], rating: ratingOf(afters) }), 'personal-best');
  assert.ok(!pb(Array.from({ length: 8 }, (_, i) => 800 + i * 40)).earned, 'under 10 rated games');
  const flat = [...Array.from({ length: 10 }, () => 900), 910];
  assert.ok(!pb(flat).earned, '+10 is noise');
  assert.ok(pb([...Array.from({ length: 10 }, () => 900), 930]).earned);
});

test('improvement: +150 over a 20-game window', () => {
  const imp = (afters: number[]) => find(evaluateAchievements({ games: [], activity: [], rating: ratingOf(afters) }), 'improvement');
  assert.ok(!imp(Array.from({ length: 19 }, (_, i) => 800 + i * 20)).earned);
  assert.ok(imp(Array.from({ length: 20 }, (_, i) => 800 + (i + 1) * 8)).earned, '+160 over 20 games');
  assert.ok(!imp(Array.from({ length: 20 }, (_, i) => 800 + (i + 1) * 5)).earned, '+100 is not enough');
});

/* ------------------------------ streak days ------------------------------ */

test('training streaks use local calendar days and survive DST', () => {
  const day = (m: number, d: number, h = 12) => at(2026, m, d, h);
  // Late evening one day, early morning the next: two calendar days even though < 24h apart.
  assert.equal(streakReached([day(3, 10, 23), day(3, 11, 1)], 2).best, 2);
  // Same calendar day twice is one day.
  assert.equal(streakReached([day(3, 10, 8), day(3, 10, 22)], 2).best, 1);
  // Across the spring-forward and autumn-back weekends (both hemispheres' common dates), consecutive days stay consecutive.
  const run = (m: number, d: number, n: number) => Array.from({ length: n }, (_, i) => day(m, d + i));
  assert.equal(streakReached(run(3, 26, 5), 5).best, 5, 'EU DST change on 29 Mar 2026');
  assert.equal(streakReached(run(3, 7, 5), 5).best, 5, 'US DST change on 8 Mar 2026');
  assert.equal(streakReached(run(10, 24, 5), 5).best, 5, 'EU DST change on 25 Oct 2026');
  assert.equal(streakReached(run(11, 1, 5), 5).best, 5, 'US DST change on 1 Nov 2026');
  assert.equal(dayIndex(day(3, 29)) - dayIndex(day(3, 28)), 1);
  assert.equal(streakReached([day(3, 10), day(3, 12)], 2).best, 1, 'a gap breaks it');
  // Unlock time is the activity on the day the streak was reached.
  assert.equal(streakReached(run(5, 1, 3), 3).at, day(5, 3));
});

test('streak achievements come from games (and future activity), not from one day of binge', () => {
  const g = (d: number, n = 1) => Array.from({ length: n }, (_, i) => game({ createdAt: at(2026, 5, d, 9 + i) }));
  assert.ok(!find(evaluateAchievements(ctx(g(1, 20))), 'three-days').earned, 'twenty games in one day is one day');
  const three = [...g(1), ...g(2), ...g(3)];
  assert.ok(find(evaluateAchievements(ctx(three)), 'three-days').earned);
  assert.deepEqual([find(evaluateAchievements(ctx(three)), 'seven-days').progress.current, find(evaluateAchievements(ctx(three)), 'seven-days').progress.target], [3, 7]);
});

/* ---------------------------- inactive features ---------------------------- */

const OFF = { puzzles: false, lessons: false, review: true };

test('puzzle / lesson achievements are inactive while their feature is off and ignore stray records; review ones are active but not earned by them', () => {
  const act: ActivityEvent[] = Array.from({ length: 5 }, (_, i) => puzzle(i, true));
  const a = evaluateAchievements(ctx([], act, { features: OFF }));
  for (const id of ['first-puzzle', 'first-lesson', 'fork-master', 'knowledge-seeker']) {
    assert.equal(find(a, id).available, false, id);
    assert.ok(!find(a, id).earned, id);
    assert.ok(find(a, id).unavailableReason, id);
  }
  // Game Review exists now (Phase 2): its achievements are available, and puzzle records can never earn them.
  assert.equal(find(a, 'endgame-expert').available, true);
  assert.ok(!find(a, 'endgame-expert').earned);
});

test('in the shipped build puzzles (Phase 3) and lessons (Phase 4) exist; each is earned only by real activity', () => {
  const a = evaluateAchievements(ctx([], Array.from({ length: 5 }, (_, i) => puzzle(i, true))));
  assert.equal(find(a, 'first-puzzle').available, true);
  assert.ok(find(a, 'first-puzzle').earned);
  assert.equal(find(a, 'first-lesson').available, true);
  assert.ok(!find(a, 'first-lesson').earned, 'puzzles are not lessons');
  const lesson: ActivityEvent = { id: 'lesson:what-is-chess', kind: 'lesson', at: NOW, lessonId: 'what-is-chess', topic: 'The board and goal', completed: true, score: 1 };
  assert.ok(find(evaluateAchievements(ctx([], [lesson])), 'first-lesson').earned);
  // With the feature flag off the achievement says why it is unavailable.
  const off = evaluateAchievements(ctx([], [lesson], { features: { puzzles: true, lessons: false, review: true } }));
  assert.equal(find(off, 'first-lesson').available, false);
  assert.ok(!find(off, 'first-lesson').earned);
});

test('with the feature switched on, puzzle achievements count each puzzle once', () => {
  const same: ActivityEvent[] = Array.from({ length: 3 }, (_, i) => ({ ...puzzle(i, true), puzzleId: 'same' }));
  assert.equal(find(evaluateAchievements(ctx([], same, { features: ON })), 'tactical-thinker').progress.current, 1);
  const forks: ActivityEvent[] = Array.from({ length: 10 }, (_, i) => puzzle(i, true, ['Fork', 'short']));
  const a = evaluateAchievements(ctx([], forks, { features: ON }));
  assert.ok(find(a, 'fork-master').earned);
  assert.ok(!find(a, 'pin-master').earned);
});

/* ------------------------- sync, idempotence, persistence ------------------------- */

test('sync is idempotent and the first run is silent', () => {
  const games = [game({ createdAt: NOW, outcome: 'win' })];
  const first = syncAchievements(null, ctx(games), NOW + 1);
  assert.equal(first.firstRun, true);
  assert.ok(first.state.unlocked.some((r) => r.id === 'first-game'));
  const again = syncAchievements(first.state, ctx(games), NOW + 2);
  assert.equal(again.firstRun, false);
  assert.deepEqual(again.newlyUnlocked, []);
  assert.equal(again.changed, false);
  assert.deepEqual(again.state, first.state);
  // Records carry both the moment it was earned and the moment it was recorded.
  const rec = first.state.unlocked.find((r) => r.id === 'first-game')!;
  assert.deepEqual([rec.unlockedAt, rec.recordedAt], [NOW, NOW + 1]);
});

test('a new game unlocks only what is new, once', () => {
  const g1 = [game({ createdAt: NOW, outcome: 'loss', reason: 'resignation' })];
  const s1 = syncAchievements(null, ctx(g1), NOW + 1).state;
  const g2 = [...g1, game({ createdAt: NOW + 5, outcome: 'win', reason: 'checkmate' })];
  const s2 = syncAchievements(s1, ctx(g2), NOW + 6);
  assert.deepEqual(s2.newlyUnlocked.map((a) => a.id).sort(), ['first-mate', 'first-win']);
  assert.deepEqual(syncAchievements(s2.state, ctx(g2), NOW + 7).newlyUnlocked, []);
});

test('unlocks are permanent: deleting games or restarting the rating never takes one away', () => {
  const games = Array.from({ length: 10 }, (_, i) => game({ createdAt: NOW + i, outcome: 'win' }));
  const state = syncAchievements(null, ctx(games), NOW + 100).state;
  const after = syncAchievements(state, ctx([]), NOW + 200);
  assert.deepEqual(after.state.unlocked, state.unlocked);
  const shown = evaluateAchievements(ctx([]), after.state);
  assert.ok(find(shown, 'ten-games').earned);
  assert.equal(find(shown, 'ten-games').earnedAt, NOW + 9);
  assert.equal(find(shown, 'ten-games').progress.pct, 1);
});

test('locked achievements show progress; earned ones show a date', () => {
  const games = Array.from({ length: 4 }, (_, i) => game({ createdAt: NOW + i }));
  const a = evaluateAchievements(ctx(games));
  const locked = find(a, 'ten-games');
  assert.equal(locked.earned, false);
  assert.equal(locked.earnedAt, null);
  assert.equal(locked.progress.pct, 0.4);
  assert.ok(find(a, 'first-game').earnedAt);
});

test('merging two states keeps every unlock at its earliest time', () => {
  const a = { version: 1 as const, initialisedAt: 50, unlocked: [{ id: 'x', unlockedAt: 10, recordedAt: 11 }, { id: 'y', unlockedAt: 30, recordedAt: 31 }] };
  const b = { version: 1 as const, initialisedAt: 40, unlocked: [{ id: 'x', unlockedAt: 5, recordedAt: 60 }, { id: 'z', unlockedAt: 7, recordedAt: 8 }] };
  const m = mergeAchievementStates(a, b)!;
  assert.deepEqual(m.unlocked.map((r) => [r.id, r.unlockedAt]), [['x', 5], ['z', 7], ['y', 30]]);
  assert.equal(m.initialisedAt, 40);
  assert.equal(mergeAchievementStates(null, null), null);
});

/* ------------------------- service, store, backup ------------------------- */

test('checkAchievements: stores unlocks, announces once even when called concurrently', async () => {
  const s = new MemoryStore();
  const first = await checkAchievements(s, NOW);
  assert.equal(first.firstRun, true, 'an empty device initialises silently');
  await s.putGame(game({ createdAt: NOW + 10, outcome: 'win', reason: 'checkmate' }));
  const [a, b] = await Promise.all([checkAchievements(s, NOW + 20), checkAchievements(s, NOW + 20)]);
  const ids = [...a.newlyUnlocked, ...b.newlyUnlocked].map((x) => x.id).sort();
  assert.deepEqual(ids, ['first-game', 'first-mate', 'first-win'], 'each unlock is reported exactly once');
  const stored = await s.getAchievements();
  assert.deepEqual(stored!.unlocked.map((r) => r.id).sort(), ids);
  assert.deepEqual((await checkAchievements(s, NOW + 30)).newlyUnlocked, []);
});

test('existing history is migrated silently on the first run', async () => {
  const s = new MemoryStore();
  for (let i = 0; i < 12; i++) await s.putGame(game({ createdAt: NOW + i, outcome: 'win' }));
  const r = await checkAchievements(s, NOW + 100);
  assert.equal(r.firstRun, true);
  const ids = (await s.getAchievements())!.unlocked.map((x) => x.id);
  for (const id of ['first-game', 'first-win', 'ten-games', 'three-wins']) assert.ok(ids.includes(id), id);
  assert.equal((await s.getAchievements())!.unlocked.find((x) => x.id === 'ten-games')!.unlockedAt, NOW + 9, 'original dates are kept');
});

test('export / import carries achievements; importing merges rather than replaces', async () => {
  const a = new MemoryStore();
  await a.putGame(game({ createdAt: NOW, outcome: 'win' }));
  await checkAchievements(a, NOW + 1);
  const backup = JSON.parse(JSON.stringify(await a.exportAll()));
  assert.equal(backup.version, BACKUP_VERSION);
  assert.ok(backup.achievements.unlocked.length >= 2);

  const b = new MemoryStore();
  b.putAchievements({ version: 1, initialisedAt: 1, unlocked: [{ id: 'ten-games', unlockedAt: 3, recordedAt: 4 }] });
  const res = await b.importAll(backup);
  assert.ok(res.achievements >= 2);
  const ids = (await b.getAchievements())!.unlocked.map((r) => r.id);
  assert.ok(ids.includes('ten-games') && ids.includes('first-game'), 'both sides are kept');
  // Importing the same file again changes nothing.
  const before = JSON.stringify(await b.getAchievements());
  await b.importAll(backup);
  assert.equal(JSON.stringify(await b.getAchievements()), before);
});

test('older backups without achievements still import, and the first check re-derives them silently', async () => {
  const s = new MemoryStore();
  const res = await s.importAll({ app: 'MoveWise', version: 2, games: [game({ createdAt: NOW, outcome: 'win' })], activity: [] });
  assert.equal(res.achievements, 0);
  const r = await checkAchievements(s, NOW + 1);
  assert.equal(r.firstRun, true);
  assert.ok((await s.getAchievements())!.unlocked.some((x) => x.id === 'first-game'));
});

test('malformed achievement records in a backup are dropped, not trusted', async () => {
  const s = new MemoryStore();
  const res = await s.importAll({
    app: 'MoveWise', version: 3, games: [],
    achievements: { version: 1, initialisedAt: 5, unlocked: [{ id: 'first-game', unlockedAt: 9, recordedAt: 10 }, { id: 7 }, null, { id: 'x' }, { id: 'y', unlockedAt: 'soon' }] },
  });
  assert.equal(res.achievements, 1);
  assert.deepEqual((await s.getAchievements())!.unlocked.map((r) => r.id), ['first-game']);
});

test('time zone changes never remove or duplicate an unlock', () => {
  const times = [at(2026, 5, 1, 23), at(2026, 5, 2, 23), at(2026, 5, 3, 23)];
  const games = times.map((t) => game({ createdAt: t }));
  const state = syncAchievements(null, ctx(games), NOW).state;
  assert.ok(state.unlocked.some((r) => r.id === 'three-days'));
  const saved = process.env.TZ;
  try {
    for (const tz of ['Pacific/Auckland', 'America/Los_Angeles', 'Asia/Kolkata', 'Europe/Helsinki']) {
      process.env.TZ = tz; // Node re-reads TZ on assignment
      const again = syncAchievements(state, ctx(games), NOW + 1);
      assert.ok(again.state.unlocked.some((r) => r.id === 'three-days'), tz);
      assert.deepEqual(again.newlyUnlocked, [], tz);
      assert.equal(new Set(again.state.unlocked.map((r) => r.id)).size, again.state.unlocked.length, tz);
    }
  } finally {
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
  }
});

void DAY;
