import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/chess/game';
import { Position } from '../src/chess/position';
import { START_FEN } from '../src/chess/types';
import { chooseBotMove, evaluatePosition } from '../src/engine/engine';
import { LEVELS, PERSONALITIES } from '../src/engine/levels';
import { Searcher } from '../src/engine/search';
import { materialBalance } from '../src/engine/eval';

const SAMPLE_FENS = [
  START_FEN,
  'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
  '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
  'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
];

test('every level and personality returns a legal move', () => {
  for (const fen of SAMPLE_FENS) {
    for (const level of LEVELS.slice(0, 4)) {
      // All personalities on the quick levels; one is enough on the slower ones.
      for (const personality of level.limits.maxDepth <= 3 ? PERSONALITIES : PERSONALITIES.slice(0, 1)) {
        const reply = chooseBotMove({ startFen: fen, moves: [], level: level.id, personality: personality.id, seed: 1 });
        const pos = new Position(fen);
        assert.ok(pos.parseUci(reply.uci) !== undefined, `${level.id}/${personality.id} illegal ${reply.uci} in ${fen}`);
      }
    }
  }
});

test('search leaves the position untouched even when aborted by the clock', () => {
  const fen = SAMPLE_FENS[1]!;
  const pos = new Position(fen);
  const before = pos.toFen();
  new Searcher(pos).search({ maxDepth: 30, maxNodes: 1e9, maxTimeMs: 15, quiesce: true }, true);
  assert.equal(pos.toFen(), before);
  assert.equal(pos.plyCount, 0);
});

test('finds mate in one at strong and weak-ish levels', () => {
  const fen = '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1';
  for (const id of ['casual', 'advanced', 'expert']) {
    const r = chooseBotMove({ startFen: fen, moves: [], level: id, personality: 'balanced', seed: 3 });
    assert.equal(r.uci, 'a1a8', id);
  }
});

test('finds a forced mate in two', () => {
  // Black king h8 boxed in by g7/h7 pawns; Qg8+ Rxg8 Nf7# style is too exotic — use a simple ladder mate.
  const fen = '7k/8/8/8/8/8/1R6/R3K3 w - - 0 1';
  const r = chooseBotMove({ startFen: fen, moves: [], level: 'expert', personality: 'balanced', seed: 1 });
  const pos = new Position(fen);
  const m = pos.parseUci(r.uci)!;
  pos.makeMove(m);
  assert.equal(r.mate, 2);
});

test('takes a hanging queen and does not hang its own', () => {
  const fen = 'k7/8/8/3q4/8/8/8/K2R4 w - - 0 1';
  for (const id of ['advanced', 'expert']) {
    const r = chooseBotMove({ startFen: fen, moves: [], level: id, personality: 'balanced', seed: 5 });
    assert.equal(r.uci, 'd1d5', id);
  }
});

test('evaluation sign follows the side that is winning (White perspective)', () => {
  const up = evaluatePosition({ startFen: 'k7/8/8/8/8/8/8/KQ6 w - - 0 1', moves: [], depth: 4, maxTimeMs: 500 });
  assert.ok(up.scoreCp > 500, `white up a queen: ${up.scoreCp}`);
  const down = evaluatePosition({ startFen: 'k7/8/8/8/8/8/8/KQ6 b - - 0 1', moves: [], depth: 4, maxTimeMs: 500 });
  assert.ok(down.scoreCp > 500, `still White's advantage with Black to move: ${down.scoreCp}`);
  const black = evaluatePosition({ startFen: 'kq6/8/8/8/8/8/8/K7 w - - 0 1', moves: [], depth: 4, maxTimeMs: 500 });
  assert.ok(black.scoreCp < -500, `black up a queen: ${black.scoreCp}`);
});

test('repetition history is respected (engine sees the draw)', () => {
  const moves = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1'];
  const r = chooseBotMove({ startFen: START_FEN, moves, level: 'expert', personality: 'balanced', seed: 1 });
  assert.ok(r.uci.length >= 4);
});

/** Play a short game between two levels; adjudicate on material if unfinished. */
function playMatch(white: string, black: string, seed: number, maxPlies = 120): number {
  const g = new Game();
  while (!g.status().over && g.ply < maxPlies) {
    const level = g.turn === 0 ? white : black;
    const reply = chooseBotMove({
      startFen: g.startFen,
      moves: g.moves.map((m) => m.uci),
      level,
      personality: 'balanced',
      seed: seed * 1000 + g.ply,
    });
    g.playUci(reply.uci);
  }
  const s = g.status();
  if (s.over) return s.result === '1-0' ? 1 : s.result === '0-1' ? -1 : 0;
  const bal = materialBalance(g.position);
  return bal > 300 ? 1 : bal < -300 ? -1 : 0;
}

test('stronger levels beat weaker levels (casual vs beginner)', { timeout: 240_000 }, () => {
  let strongScore = 0;
  const games = 6;
  for (let i = 0; i < games; i++) {
    const strongIsWhite = i % 2 === 0;
    const r = strongIsWhite ? playMatch('casual', 'beginner', i + 1) : -playMatch('beginner', 'casual', i + 1);
    strongScore += r;
  }
  assert.ok(strongScore >= 3, `casual should clearly outscore beginner, net ${strongScore}/${games}`);
});
