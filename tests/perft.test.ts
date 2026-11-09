import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position } from '../src/chess/position';

/**
 * Published perft node counts (chessprogramming.org "Perft Results").
 * Perft exercises castling, en passant, promotion, pins and check evasion,
 * so matching these numbers is strong evidence the move generator is correct.
 */
const SUITE: Array<{ name: string; fen: string; counts: number[] }> = [
  {
    name: 'start position',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    counts: [20, 400, 8902, 197281],
  },
  {
    name: 'kiwipete',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    counts: [48, 2039, 97862],
  },
  {
    name: 'position 3 (en passant / pins)',
    fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    counts: [14, 191, 2812, 43238],
  },
  {
    name: 'position 4 (promotions, castling through check)',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    counts: [6, 264, 9467],
  },
  {
    name: 'position 5',
    fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    counts: [44, 1486, 62379],
  },
  {
    name: 'position 6',
    fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    counts: [46, 2079, 89890],
  },
];

for (const { name, fen, counts } of SUITE) {
  test(`perft: ${name}`, () => {
    const pos = new Position(fen);
    counts.forEach((expected, i) => {
      assert.equal(pos.perft(i + 1), expected, `depth ${i + 1}`);
    });
    // make/unmake must restore the exact position and hash.
    assert.equal(pos.toFen().split(' ').slice(0, 4).join(' '), fen.split(' ').slice(0, 4).join(' '));
  });
}

test('hash is restored after make/unmake', () => {
  const pos = new Position();
  const before = pos.hash;
  for (const m of pos.legalMoves()) {
    pos.makeMove(m);
    pos.unmakeMove();
    assert.equal(pos.hash, before);
  }
});
