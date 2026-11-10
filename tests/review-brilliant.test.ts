import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBrilliant } from '../src/review/analyse';
import { shownClass, hasBadge, SHOWN_GLYPH } from '../src/review/shown';
import { KNIGHT, PAWN, KING, QUEEN } from '../src/chess/types';

const base = { forced: false, matchedEngine: true, pieceType: KNIGHT, materialIfPlayed: -300, winBefore: 55, winAfter: 60 };

test('a brilliant move is the engine’s choice, gives up real material and keeps the position at least level', () => {
  assert.equal(isBrilliant(base), true);
  assert.equal(isBrilliant({ ...base, pieceType: QUEEN, materialIfPlayed: -900 }), true);
});

test('brilliant is strict: not forced, not a pawn or king move, not a small sacrifice, not already winning, not worse than level', () => {
  assert.equal(isBrilliant({ ...base, forced: true }), false);
  assert.equal(isBrilliant({ ...base, matchedEngine: false }), false);
  assert.equal(isBrilliant({ ...base, pieceType: PAWN }), false);
  assert.equal(isBrilliant({ ...base, pieceType: KING }), false);
  assert.equal(isBrilliant({ ...base, materialIfPlayed: -100 }), false);
  assert.equal(isBrilliant({ ...base, winBefore: 92 }), false);
  assert.equal(isBrilliant({ ...base, winAfter: 40 }), false);
});

test('the shown class and the badge rule', () => {
  assert.equal(shownClass({ cls: 'best', brilliant: true }), 'brilliant');
  assert.equal(shownClass({ cls: 'blunder', brilliant: false }), 'blunder');
  assert.equal(hasBadge('forced'), false);
  for (const c of ['brilliant', 'best', 'good', 'inaccuracy', 'mistake', 'blunder'] as const) assert.equal(hasBadge(c), true, c);
  assert.equal(SHOWN_GLYPH.brilliant, '!!');
});
