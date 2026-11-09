import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { StockfishClient } from '../src/engine/stockfish';
import { analyseReview } from '../src/review/analyse';
import { newReview, runReview } from '../src/review/runner';
import { summarise } from '../src/review/summary';
import { learningItems } from '../src/review/notebook';
import { REVIEW_PRESETS, type GameReview, type ReviewSettings } from '../src/review/types';
import { START_FEN } from '../src/chess/types';
import { realTransport, TEST_BUILD } from './nodeEngine';
import { CLEAN_MOVES, HUNG_MOVES, MISSED_FEN, SCHOLAR_MOVES } from './review-fixtures';

/**
 * End to end with the REAL Stockfish: the runner asks it about every position, the analysis classifies the moves from
 * its answers. Nothing here is hand-written: the expectations are things any strong engine must say.
 */
const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
after(() => engine.dispose());

const FAST: ReviewSettings = { ...REVIEW_PRESETS.quick, movetimeMs: 400, depth: 14 };

async function review(id: string, uciMoves: string[], perspective: 'white' | 'black', startFen = START_FEN): Promise<GameReview> {
  const r = newReview({ id, startFen, uciMoves }, FAST, perspective);
  assert.equal(await runReview(r, { engine }), 'complete');
  return r;
}

test('real Stockfish: Scholar’s mate — 3…Nf6 is a blunder that allows mate, and Qxf7# is the found mate', async () => {
  const r = await review('scholar', SCHOLAR_MOVES, 'black');
  assert.deepEqual(r.engines.filter((e) => e !== 'Rules of chess'), ['Stockfish 19 (lite)']);
  const a = analyseReview(r);
  const nf6 = a.plies[5]!;
  assert.equal(nf6.san, 'Nf6');
  assert.equal(nf6.cls, 'blunder');
  assert.ok(nf6.tags.includes('allowed-mate'), nf6.tags.join());
  assert.equal(nf6.mateAfter, -1);
  assert.equal(nf6.afterLine.uci[0], 'h5f7');
  const mate = a.plies[6]!;
  assert.equal(mate.cls, 'best');
  assert.ok(mate.tags.includes('found-mate'));
  assert.ok(a.meanDepth! >= 8, `depth ${a.meanDepth}`);
  const items = learningItems(a);
  assert.equal(items.length >= 1 && items[0]!.ply === 6, true);
  const s = summarise(a, '1-0', [], 'intermediate');
  assert.equal(s.lesson.ply, 6);
  assert.match(s.lesson.paragraphs.join(' '), /Qxf7#/);
  assert.deepEqual(s.caveats, []);
});

test('real Stockfish: giving a knight away is flagged as lost material on the piece that moved', async () => {
  const a = analyseReview(await review('hung', HUNG_MOVES, 'white'));
  const p = a.plies[4]!;
  assert.equal(p.san, 'Nxe5');
  assert.ok(p.cls === 'mistake' || p.cls === 'blunder', p.cls);
  assert.ok(p.tags.includes('hung-piece') || p.tags.includes('lost-material'), p.tags.join());
  assert.ok(p.materialIfPlayed <= -200);
});

test('real Stockfish: not taking a free queen is a blunder that missed material', async () => {
  const a = analyseReview(await review('missed', ['e1e2'], 'white', MISSED_FEN));
  const p = a.plies[0]!;
  assert.equal(p.cls, 'blunder');
  assert.ok(p.tags.includes('missed-capture'), p.tags.join());
  assert.equal(p.best?.san, 'Qxd5');
  assert.equal(p.materialIfBest, 900);
});

test('real Stockfish: a sound game is not accused of errors, and still teaches a lesson', async () => {
  const a = analyseReview(await review('clean', CLEAN_MOVES, 'white'));
  for (const side of ['white', 'black'] as const) {
    assert.equal(a.sides[side].counts.blunder, 0, `${side} blunders`);
    assert.equal(a.sides[side].counts.mistake, 0, `${side} mistakes`);
    assert.ok(a.sides[side].accuracy! > 70, `${side} accuracy ${a.sides[side].accuracy}`);
  }
  const s = summarise(a, '1/2-1/2', [], 'beginner');
  assert.ok(s.lesson.paragraphs.join('').length > 20);
  assert.ok(s.focus.length > 20);
});

test('real Stockfish: reviewing again from a half-finished review gives the same positions for the part already done', async () => {
  const full = await review('resume', CLEAN_MOVES.slice(0, 8), 'white');
  const partial = newReview({ id: 'resume', startFen: START_FEN, uciMoves: CLEAN_MOVES.slice(0, 8) }, FAST, 'white');
  partial.positions.splice(0, 4, ...full.positions.slice(0, 4));
  partial.engines = [...full.engines];
  assert.equal(await runReview(partial, { engine }), 'complete');
  assert.deepEqual(partial.positions.slice(0, 4), full.positions.slice(0, 4));
  assert.equal(partial.positions.every(Boolean), true);
});
