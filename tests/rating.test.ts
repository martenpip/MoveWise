import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glicko2Update, expectedScore } from '../src/profile/glicko2';
import {
  PLAYER_START_RATING, botStrength, buildRating, ineligibleReason, outcomeOf, suggestedLevel,
} from '../src/profile/rating';
import { COMPETITIVE_FROM, LEVELS, STOCKFISH_FROM, findLevel } from '../src/engine/levels';
import { at, game } from './helpers';

test('Glicko-2 matches the worked example in Glickman\'s paper', () => {
  // Player 1500 / RD 200 / vol 0.06, tau 0.5; beats 1400/30, loses to 1550/100 and 1700/300.
  const next = glicko2Update(
    { rating: 1500, rd: 200, vol: 0.06 },
    [
      { opponentRating: 1400, opponentRd: 30, score: 1 },
      { opponentRating: 1550, opponentRd: 100, score: 0 },
      { opponentRating: 1700, opponentRd: 300, score: 0 },
    ],
    0.5,
  );
  assert.ok(Math.abs(next.rating - 1464.06) < 0.05, `rating ${next.rating}`);
  assert.ok(Math.abs(next.rd - 151.52) < 0.05, `rd ${next.rd}`);
  assert.ok(Math.abs(next.vol - 0.05999) < 0.0001, `vol ${next.vol}`);
});

test('Glicko-2: wins raise, losses lower, draws between equals leave the rating alone', () => {
  const s = { rating: 1000, rd: 200, vol: 0.06 };
  const opp = { opponentRating: 1000, opponentRd: 50 };
  assert.ok(glicko2Update(s, [{ ...opp, score: 1 }]).rating > 1000);
  assert.ok(glicko2Update(s, [{ ...opp, score: 0 }]).rating < 1000);
  assert.ok(Math.abs(glicko2Update(s, [{ ...opp, score: 0.5 }]).rating - 1000) < 1e-6);
  assert.ok(glicko2Update(s, [{ ...opp, score: 1 }]).rd < 200, 'a game reduces uncertainty');
  assert.ok(Math.abs(expectedScore(1000, 1000, 50) - 0.5) < 1e-9);
});

test('bot ladder: 25 levels from 100 to 2500 in steps of 100, ordered by strength', () => {
  assert.equal(LEVELS.length, 25);
  assert.deepEqual(LEVELS.map((l) => l.rating), Array.from({ length: 25 }, (_, i) => (i + 1) * 100));
  const ratings = LEVELS.map((l) => botStrength(l.id)!.rating);
  assert.deepEqual(ratings, LEVELS.map((l) => l.rating));
  assert.equal(botStrength('nonsense'), null);
});

test('bot ladder: practice below 1000, competitive from 1000, Stockfish from 1400', () => {
  for (const l of LEVELS) {
    assert.equal(l.category, l.rating < COMPETITIVE_FROM ? 'practice' : 'competitive', `category of ${l.rating}`);
    assert.equal(l.backend, l.rating < STOCKFISH_FROM ? 'builtin' : 'stockfish', `backend of ${l.rating}`);
    if (l.backend === 'stockfish') assert.equal(l.elo, l.rating);
  }
  assert.equal(LEVELS.filter((l) => l.category === 'practice').length, 9);
  assert.equal(LEVELS.filter((l) => l.category === 'competitive').length, 16);
});

test('bot ladder: built-in levels get steadily stronger settings', () => {
  const builtin = LEVELS.filter((l) => l.backend === 'builtin');
  for (let i = 1; i < builtin.length; i++) {
    const a = builtin[i - 1]!;
    const b = builtin[i]!;
    assert.ok(b.limits.maxDepth >= a.limits.maxDepth, `depth at ${b.rating}`);
    // At the same depth a stronger rung makes fewer deliberate mistakes; a deeper search may start with more of them.
    if (b.limits.maxDepth === a.limits.maxDepth) assert.ok(b.temperature < a.temperature, `temperature at ${b.rating}`);
  }
});

test('levels saved by earlier versions still resolve to a ladder level', () => {
  for (const id of ['beginner', 'easy', 'casual', 'intermediate', 'advanced', 'expert', 'max']) {
    assert.ok(findLevel(id), id);
    assert.ok(botStrength(id), id);
  }
  assert.equal(findLevel('casual')!.id, 'r1000');
  assert.equal(findLevel('beginner')!.category, 'practice');
});

test('eligibility: only completed, un-taken-back, standard-start games vs known bots count', () => {
  assert.equal(ineligibleReason(game({})), null);
  assert.equal(ineligibleReason(game({ source: 'imported' })), 'imported');
  assert.equal(ineligibleReason(game({ human: null as never })), 'no-human-side');
  assert.equal(ineligibleReason(game({ result: '*' })), 'unfinished');
  assert.equal(ineligibleReason(game({ takebacks: 1 })), 'takebacks');
  assert.equal(ineligibleReason(game({ uciMoves: ['e2e4', 'e7e5'] })), 'too-short');
  assert.equal(ineligibleReason(game({ botLevel: 'grandmaster' })), 'unknown-level');
  assert.equal(ineligibleReason(game({ botLevel: 'r900' })), 'practice-bot');
  assert.equal(ineligibleReason(game({ botLevel: 'easy' })), 'practice-bot');
  assert.equal(ineligibleReason(game({ botLevel: 'r1000' })), null);
  assert.equal(ineligibleReason(game({ botLevel: 'r2500' })), null);
  assert.equal(ineligibleReason(game({ botLevel: 'r1800', mode: 'trainer' })), 'trainer');
  assert.equal(ineligibleReason(game({ startFen: '8/8/8/8/8/8/8/K6k w - - 0 1' })), 'custom-start');
  assert.equal(ineligibleReason(game({ createdAt: at(2026, 1, 1) }), at(2026, 6, 1)), 'before-reset');
  // Games saved before take-backs were recorded have no field and are treated as 0.
  const legacy = game({});
  delete (legacy as { takebacks?: number }).takebacks;
  assert.equal(ineligibleReason(legacy), null);
});

test('outcomeOf reads the result from the human side', () => {
  assert.equal(outcomeOf(game({ human: 'white', outcome: 'win' })), 'win');
  assert.equal(outcomeOf(game({ human: 'black', outcome: 'win' })), 'win');
  assert.equal(outcomeOf(game({ human: 'black', outcome: 'loss' })), 'loss');
  assert.equal(outcomeOf(game({ outcome: 'draw' })), 'draw');
  assert.equal(outcomeOf(game({ result: '*' })), null);
});

test('a new player is unrated, starts at the stated origin, and is never given a fake number', () => {
  const r = buildRating([]);
  assert.equal(r.confidence, 'unrated');
  assert.equal(r.ratedGames, 0);
  assert.equal(r.current, PLAYER_START_RATING);
  assert.equal(r.lastDelta, null);
  assert.deepEqual(r.history, []);
});

test('rating follows results, records history and peak, and ignores ineligible games', () => {
  const t = at(2026, 3, 1);
  const games = [
    game({ createdAt: t + 1, outcome: 'win', botLevel: 'r1100' }),
    game({ createdAt: t + 2, outcome: 'win', botLevel: 'casual' }),
    game({ createdAt: t + 3, outcome: 'loss', botLevel: 'casual' }),
    game({ createdAt: t + 4, outcome: 'win', takebacks: 2 }), // not counted
    game({ createdAt: t + 5, source: 'imported', human: null as never }), // not counted
  ];
  const r = buildRating(games);
  assert.equal(r.ratedGames, 3);
  assert.equal(r.history.length, 3);
  assert.ok(r.history[0]!.after > PLAYER_START_RATING);
  assert.ok(r.history[2]!.delta < 0);
  assert.equal(r.peak, Math.max(...r.history.map((p) => p.after)));
  assert.equal(r.confidence, 'provisional');
  assert.ok(r.low < r.current && r.current < r.high);
  assert.equal(r.history[1]!.before, r.history[0]!.after, 'each game starts where the last ended');
});

test('rating does not depend on the order games are listed in', () => {
  const t = at(2026, 3, 1);
  const list = [1, 2, 3, 4, 5, 6].map((i) => game({ createdAt: t + i, outcome: i % 3 === 0 ? 'loss' : 'win', botLevel: i % 2 ? 'r1100' : 'casual' }));
  const a = buildRating(list);
  const b = buildRating([...list].reverse());
  assert.equal(a.current, b.current);
  assert.deepEqual(a.history.map((p) => p.gameId), b.history.map((p) => p.gameId));
});

test('restarting the rating ignores earlier games without deleting them', () => {
  const list = [game({ createdAt: at(2026, 1, 1), outcome: 'win' }), game({ createdAt: at(2026, 2, 1), outcome: 'win' })];
  const all = buildRating(list, { ratingEpoch: 0 });
  const reset = buildRating(list, { ratingEpoch: at(2026, 1, 15) });
  assert.equal(all.ratedGames, 2);
  assert.equal(reset.ratedGames, 1);
  assert.equal(list.length, 2);
});

test('confidence reaches "established" only after enough games and a small deviation', () => {
  const t = at(2026, 3, 1);
  const levels = ['casual', 'r1200', 'intermediate', 'advanced', 'r1600'];
  const games = Array.from({ length: 60 }, (_, i) => game({ createdAt: t + i, outcome: i % 2 ? 'win' : 'loss', botLevel: levels[i % levels.length]! }));
  const early = buildRating(games.slice(0, 5));
  const late = buildRating(games);
  assert.equal(early.confidence, 'provisional');
  assert.ok(late.rd < early.rd, 'uncertainty shrinks with games');
  assert.ok(['provisional', 'established'].includes(late.confidence));
});

test('suggested opponent is close to the player\'s strength, never absurd', () => {
  assert.equal(suggestedLevel(0), 'r1000', 'the suggestion is always a competitive bot');
  assert.equal(suggestedLevel(1e6), LEVELS[LEVELS.length - 1]!.id);
  const mid = suggestedLevel(PLAYER_START_RATING);
  assert.ok(LEVELS.some((l) => l.id === mid));
});

test('practice and Trainer games never change the rating, whatever the result', () => {
  const t = at(2026, 3, 1);
  const base = [game({ createdAt: t + 1, outcome: 'win', botLevel: 'r1200' }), game({ createdAt: t + 2, outcome: 'loss', botLevel: 'r1200' })];
  const extra = [
    game({ createdAt: t + 3, outcome: 'win', botLevel: 'r300' }),
    game({ createdAt: t + 4, outcome: 'win', botLevel: 'r900' }),
    game({ createdAt: t + 5, outcome: 'loss', botLevel: 'r900' }),
    game({ createdAt: t + 6, outcome: 'win', botLevel: 'r2000', mode: 'trainer' }),
    game({ createdAt: t + 7, outcome: 'loss', botLevel: 'r1300', mode: 'trainer' }),
  ];
  const a = buildRating(base);
  const b = buildRating([...base, ...extra]);
  assert.equal(b.ratedGames, 2);
  assert.equal(a.current, b.current);
  assert.equal(a.rd, b.rd);
  assert.deepEqual(a.history, b.history);
});
