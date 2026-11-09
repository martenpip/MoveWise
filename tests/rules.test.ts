import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/chess/game';
import { Position, FenError } from '../src/chess/position';
import { parsePgn, toPgn } from '../src/chess/pgn';
import { parseSquare } from '../src/chess/types';

const sq = parseSquare;
const play = (g: Game, ...sans: string[]) => sans.forEach((s) => g.playSan(s));

test('illegal moves are rejected', () => {
  const g = new Game();
  assert.equal(g.playSquares(sq('e2'), sq('e5')), undefined); // pawn can't jump three
  assert.equal(g.playSquares(sq('e1'), sq('e2')), undefined); // blocked by own pawn
  assert.equal(g.playSquares(sq('e7'), sq('e5')), undefined); // wrong side to move
  assert.throws(() => g.playSan('Ke2'));
  assert.equal(g.ply, 0);
});

test('castling both sides, rights lost after king move', () => {
  const g = new Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const sans = g.legalMoves().map((m) => g.position.toSan(m));
  assert.ok(sans.includes('O-O') && sans.includes('O-O-O'));
  g.playSan('O-O');
  assert.equal(g.fen.split(' ')[0], 'r3k2r/8/8/8/8/8/8/R4RK1');
  g.playSan('O-O-O');
  assert.equal(g.fen.split(' ')[0], '2kr3r/8/8/8/8/8/8/R4RK1');
  assert.equal(g.fen.split(' ')[2], '-');
});

test('cannot castle out of, through, or into check', () => {
  // rook on e8 gives check
  let p = new Position('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.ok(!p.legalMoves().some((m) => p.toSan(m).startsWith('O-O')));
  // rook on f8 attacks f1 (passing square)
  p = new Position('5rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.ok(!p.legalMoves().some((m) => p.toSan(m) === 'O-O'));
  assert.ok(p.legalMoves().some((m) => p.toSan(m) === 'O-O-O'));
  // rook on g8 attacks g1 (destination)
  p = new Position('1k4r1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.ok(!p.legalMoves().some((m) => p.toSan(m) === 'O-O'));
});

test('en passant captures and expires after one move', () => {
  const g = new Game();
  play(g, 'e4', 'a6', 'e5', 'd5');
  assert.ok(g.fen.includes(' d6 '));
  g.playSan('exd6');
  assert.equal(g.fen.split(' ')[0], 'rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR');

  const h = new Game();
  play(h, 'e4', 'a6', 'e5', 'd5', 'Nf3', 'a5');
  assert.throws(() => h.playSan('exd6'));
});

test('en passant that exposes the king is illegal', () => {
  // Capturing en passant would remove both pawns from rank 5 and expose the white king to the rook.
  const p = new Position('8/8/8/KPp4r/8/8/8/7k w - c6 0 1');
  assert.ok(!p.legalMoves().some((m) => p.toSan(m).startsWith('bxc6')));
});

test('promotion offers all four pieces; underpromotion works', () => {
  const g = new Game('7k/P7/8/8/8/8/8/K7 w - - 0 1');
  const sans = g.legalMoves().map((m) => g.position.toSan(m)).filter((s) => s.startsWith('a8'));
  assert.deepEqual(sans.sort(), ['a8=B', 'a8=N', 'a8=Q+', 'a8=R+'].sort());
  assert.ok(g.needsPromotion(sq('a7'), sq('a8')));
  g.playSan('a8=N');
  assert.equal(g.fen.split(' ')[0], 'N6k/8/8/8/8/8/8/K7');
});

test("fool's mate is checkmate", () => {
  const g = new Game();
  play(g, 'f3', 'e5', 'g4', 'Qh4#');
  const s = g.status();
  assert.equal(s.over, true);
  assert.equal(s.reason, 'checkmate');
  assert.equal(s.result, '0-1');
  assert.equal(g.legalMoves().length, 0);
});

test('stalemate is a draw', () => {
  const g = new Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  const s = g.status();
  assert.equal(s.over, true);
  assert.equal(s.reason, 'stalemate');
  assert.equal(s.result, '1/2-1/2');
});

test('insufficient material cases', () => {
  const draw = ['8/8/8/8/8/8/8/K1k5 w - - 0 1', '8/8/8/8/8/8/8/K1kB4 w - - 0 1', '8/8/8/8/8/8/8/K1kN4 w - - 0 1'];
  for (const f of draw) assert.equal(new Game(f).status().reason, 'insufficient-material', f);
  // same-colour bishops on each side: dead draw
  assert.equal(new Game('8/8/8/8/8/2b5/8/K1k1B3 w - - 0 1').position.isInsufficientMaterial(), true);
  // opposite-colour bishops can (theoretically) mate with help: not automatic
  assert.equal(new Game('8/8/8/8/8/3b4/8/K1k1B3 w - - 0 1').position.isInsufficientMaterial(), false);
  // pawn, rook or queen always counts
  assert.equal(new Game('8/8/8/8/8/8/P7/K1k5 w - - 0 1').position.isInsufficientMaterial(), false);
});

test('threefold repetition', () => {
  const g = new Game();
  play(g, 'Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8');
  const s = g.status();
  assert.equal(s.reason, 'threefold-repetition');
  assert.equal(s.result, '1/2-1/2');
});

test('fifty-move rule', () => {
  const g = new Game('8/8/8/4k3/8/8/R7/K7 w - - 99 80');
  assert.equal(g.status().over, false);
  g.playSan('Rb2');
  assert.equal(g.status().reason, 'fifty-move-rule');
});

test('undo and redo restore exact positions', () => {
  const g = new Game();
  const fens = [g.fen];
  play(g, 'e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6');
  g.moves.forEach((m) => fens.push(m.fen));
  for (let i = g.ply; i > 0; i--) {
    g.undo();
    assert.equal(g.fen, fens[i - 1]);
  }
  assert.equal(g.fen, fens[0]);
  for (let i = 1; i <= fens.length - 1; i++) {
    g.redo();
    assert.equal(g.fen, fens[i]);
  }
  g.goTo(3);
  assert.equal(g.fen, fens[3]);
  // A new move after undo clears the redo stack.
  g.undo();
  g.playSan('Nc3');
  assert.equal(g.redoable.length, 0);
});

test('undo after checkmate reopens the game', () => {
  const g = new Game();
  play(g, 'f3', 'e5', 'g4', 'Qh4#');
  g.undo();
  assert.equal(g.status().over, false);
});

test('resignation sets the result', () => {
  const g = new Game();
  g.resign(0);
  assert.deepEqual([g.status().result, g.status().reason], ['0-1', 'resignation']);
});

test('SAN disambiguation', () => {
  const p = new Position('4k3/8/8/8/8/8/4K3/R6R w - - 0 1');
  const sans = p.legalMoves().map((m) => p.toSan(m));
  assert.ok(sans.includes('Rad1') && sans.includes('Rhd1'));
  const q = new Position('4k3/8/8/8/R7/8/8/R3K3 w - - 0 1');
  assert.ok(q.legalMoves().map((m) => q.toSan(m)).includes('R4a2'));
  assert.ok(q.parseSan('R1a2'));
});

test('FEN round trip and validation', () => {
  const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  assert.equal(new Position(fen).toFen(), fen);
  assert.throws(() => new Position('not a fen'), FenError);
  assert.throws(() => new Position('8/8/8/8/8/8/8/8 w - - 0 1'), FenError); // no kings
  assert.throws(() => new Position('P3k3/8/8/8/8/8/8/4K3 w - - 0 1'), FenError); // pawn on rank 8
  assert.throws(() => new Position('4k3/4R3/8/8/8/8/8/4K3 w - - 0 1'), FenError); // side not to move is already in check
});

test('PGN export and import round trip', () => {
  const g = new Game();
  play(g, 'e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7');
  const pgn = toPgn(g, { White: 'Tester', Black: 'MoveWise Bot' });
  assert.match(pgn, /\[White "Tester"\]/);
  assert.match(pgn, /1\. e4 e5 2\. Nf3 Nc6/);
  const parsed = parsePgn(pgn);
  assert.equal(parsed.game.fen, g.fen);
  assert.equal(parsed.headers.Black, 'MoveWise Bot');
});

test('PGN import skips comments and variations, rejects illegal moves', () => {
  const ok = parsePgn('1. e4 {best by test} e5 (1... c5 2. Nf3) 2. Nf3 $1 Nc6 1-0');
  assert.equal(ok.game.ply, 4);
  assert.equal(ok.result, '1-0');
  assert.throws(() => parsePgn('1. e4 e5 2. Ke3'), /Ke3/);
});

test('PGN with custom start position keeps the FEN header', () => {
  const g = new Game('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  g.playSan('e4');
  const pgn = toPgn(g);
  assert.match(pgn, /\[FEN "4k3\/8\/8\/8\/8\/8\/4P3\/4K3 w - - 0 1"\]/);
  assert.equal(parsePgn(pgn).game.fen, g.fen);
});
