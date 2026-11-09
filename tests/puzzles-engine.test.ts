import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Position } from '../src/chess/position';
import { StockfishClient } from '../src/engine/stockfish';
import { judgeAlternative } from '../src/puzzles/alternatives';
import { explainPuzzle } from '../src/puzzles/explain';
import { learningPuzzle, puzzleIdOf, toLearningPosition } from '../src/puzzles/learn';
import { PuzzleSession } from '../src/puzzles/solver';
import type { PuzzlePack } from '../src/puzzles/types';
import { toPuzzle } from '../src/puzzles/validate';
import type { LearningItem } from '../src/review/notebook';
import { realTransport, TEST_BUILD } from './nodeEngine';

const PACK: PuzzlePack = JSON.parse(readFileSync(new URL('../public/puzzles/lichess-starter.json', import.meta.url), 'utf8'));
const get = (id: string) => toPuzzle(PACK.puzzles.find((p) => p.id === id)!, PACK.id);
const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
after(() => engine.dispose());

test('real Stockfish: a different first move that also forces the same mate is accepted as an alternative', async () => {
  const p = get('li:BAm5l');
  assert.notEqual(p.moves[1], 'g4f4');
  const s = new PuzzleSession(p);
  assert.equal(s.attempt('g4f4').kind, 'wrong', 'the solver alone does not accept it');
  const j = await judgeAlternative(s, 'g4f4', engine, { movetimeMs: 300 });
  assert.equal(j.accept, true, j.reason);
  assert.match(j.engine ?? '', /Stockfish/);
  assert.ok(s.acceptAlternative('g4f4') && s.done && s.viaAlternative === 'g4f4');
});

test('real Stockfish: a clearly worse move is not accepted, and the engine’s refutation is available', async () => {
  const p = get('li:gs7Yz');
  const s = new PuzzleSession(p);
  const j = await judgeAlternative(s, 'b5b4', engine, { movetimeMs: 300 });
  assert.equal(j.accept, false);
  assert.ok(j.refutation && j.refutation.san.length > 0, 'a line showing why it fails');
  assert.ok(j.played! < j.stored! - 50);
  assert.match(j.reason, /clearly worse/);
  assert.equal(s.done, false);
});

test('without an engine the judgement is a safe "not accepted"', async () => {
  const s = new PuzzleSession(get('li:BAm5l'));
  const j = await judgeAlternative(s, 'g4f4', { evaluate: () => Promise.reject(new Error('no engine')) });
  assert.equal(j.accept, false);
  assert.match(j.reason, /only the stored solution/);
});

test('real Stockfish agrees with the stored first move of a sample of bundled non-mate puzzles', async () => {
  const sample = PACK.puzzles.filter((p) => !p.themes.some((t) => t === 'mate' || /^mateIn/.test(t))).filter((_, i) => i % 97 === 0).slice(0, 12);
  assert.ok(sample.length >= 8);
  for (const raw of sample) {
    const p = toPuzzle(raw, PACK.id);
    const s = new PuzzleSession(p);
    const stored = await engine.evaluate({ startFen: p.fen, moves: p.moves.slice(0, 2), depth: 12, maxTimeMs: 300 });
    const white = s.playerColor === 0;
    const v = (white ? 1 : -1) * (stored.mate !== null ? (stored.mate > 0 ? 30000 : -30000) : stored.scoreCp);
    const defence = p.themes.includes('defensiveMove') || p.themes.includes('equality');
    assert.ok(v >= (defence ? -150 : 50), `${p.id}: the stored move scores ${v} for the player`);
  }
});

/* ---------------------------------- Game Review linkage ---------------------------------- */

const mateP = PACK.puzzles.find((p) => p.themes.includes('mateIn2'))!;
function item(over: Partial<LearningItem> = {}): LearningItem {
  const p = toPuzzle(mateP, 'x');
  const s = new PuzzleSession(p);
  const pos = new Position(s.fen);
  const other = pos.legalMoves().map((m) => `${'abcdefgh'[m & 7]}${((m >> 3) & 7) + 1}${'abcdefgh'[(m >> 6) & 7]}${((m >> 9) & 7) + 1}`).find((u) => u !== p.moves[1])!;
  return {
    id: 'g1:20', gameId: 'g1', ply: 20, fen: s.fen, sideToMove: s.playerColor === 0 ? 'white' : 'black',
    solution: { move: p.moves[1]!, san: 'x', line: p.moves.slice(1) }, played: { move: other, san: 'y' }, cls: 'blunder', winLoss: 60,
    tags: ['missed-mate'], phase: 'middlegame', engine: 'Stockfish 19 (lite)', previous: { fen: p.fen, uci: p.moves[0]! }, ...over,
  };
}

test('game link: a verified forced mate becomes a scored exercise that behaves like a puzzle and keeps its game reference', () => {
  const lp = toLearningPosition(item(), 1000)!;
  assert.equal(lp.scored, true);
  assert.deepEqual([lp.gameId, lp.ply], ['g1', 20]);
  assert.ok(lp.themes.some((t) => t.theme === 'mateIn2'));
  const pz = learningPuzzle(lp, 1200);
  assert.equal(pz.id, puzzleIdOf(lp));
  assert.deepEqual(pz.custom, { gameId: 'g1', ply: 20, scored: true, played: lp.played.uci });
  const s = new PuzzleSession(pz);
  for (let i = 0; i < 2; i++) s.attempt(s.expected!);
  assert.ok(s.done, 'the exercise needs the whole mating sequence');
  assert.ok(explainPuzzle(pz, 'beginner').facts.endsInMate);
});

test('game link: a mistake without a verified forced mate becomes an UNSCORED learning position, never a puzzle', () => {
  const lp = toLearningPosition(item({ tags: ['missed-capture'], solution: { move: mateP.moves.split(' ')[1]!, san: 'x', line: mateP.moves.split(' ').slice(1, 2) } }), 1)!;
  assert.equal(lp.scored, false);
  assert.equal(lp.moves.length, 2);
  assert.ok(!lp.themes.some((t) => t.theme === 'mateIn2'), 'no mate claim without a verified mate');
});

test('game link: a line that is not a mate is not turned into a mate puzzle even if tagged', () => {
  const lp = toLearningPosition(item({ solution: { move: mateP.moves.split(' ')[1]!, san: 'x', line: mateP.moves.split(' ').slice(1, 3) } }), 1);
  assert.equal(lp?.scored ?? false, false);
});

test('game link: items with no previous move or with broken data are refused safely', () => {
  assert.equal(toLearningPosition(item({ previous: null }), 1), null);
  assert.equal(toLearningPosition(item({ previous: { fen: 'garbage', uci: 'e2e4' } }), 1), null);
});
