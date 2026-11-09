// Authoring helper: look for exchange sacrifices (rook takes a defended minor piece) that the engine rates within 40cp of its best move.
import { Position } from '../src/chess/position';
import { StockfishClient } from '../src/engine/stockfish';
import { realTransport, TEST_BUILD } from '../tests/nodeEngine';
import { sanLine } from '../src/academy/content/dsl';
import { moveFrom, moveTo, squareName } from '../src/chess/types';
const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
const lines = [
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be7 f3 Be6 Qd2 O-O O-O-O Nbd7 g4 b5 g5 b4 Ne2 Ne8 f4 a5 Kb1 a4 Nbd4 exd4 Nxd4 Bxa2+ Kxa2',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4 Bd7 O-O-O Rc8 Bb3 Ne5 Kb1 Nc4 Bxc4 Rxc4',
  'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 Be2 Nf6 O-O Be7 f4 d6 Kh1 O-O Qe1 Nxd4 Bxd4 b5 a3 Bb7',
  'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3 dxc4 Bxc4 Qc7',
  'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Na5 Bc2 c5 d4 Qc7 Nbd2 Nc6 d5 Nd8',
];
for (const l of lines) {
  const { fen } = sanLine(l);
  const p = new Position(fen);
  const white = p.turn === 0;
  const sign = white ? 1 : -1;
  const val = (r: { scoreCp: number; mate: number | null }) => sign * (r.mate !== null ? (r.mate > 0 ? 10000 : -10000) : r.scoreCp);
  const base = await engine.evaluate({ startFen: fen, moves: [], depth: 16, maxTimeMs: 600 });
  const best = val(base);
  for (const m of p.legalMoves()) {
    const from = moveFrom(m), to = moveTo(m);
    const pc = p.board[from]! & 7, tgt = p.board[to]! & 7;
    if (pc !== 4 || tgt < 2 || tgt > 3) continue;
    const u = squareName(from) + squareName(to);
    const r = await engine.evaluate({ startFen: fen, moves: [u], depth: 16, maxTimeMs: 600 });
    const v = val(r);
    if (best - v < 60) console.log(`${p.toSan(m)} ${u}: ${v} (best ${best}) in ${fen}`);
  }
}
engine.dispose();
