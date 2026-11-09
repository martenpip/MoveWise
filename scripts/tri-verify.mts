// Authoring helper: for candidate positions (white to move), play the engine line and require every WHITE move on the way (3 moves) to be the only winning move, and the three king moves to form a triangle back to the start square.
import { Position } from '../src/chess/position';
import { StockfishClient } from '../src/engine/stockfish';
import { realTransport, TEST_BUILD } from '../tests/nodeEngine';
import { readFileSync } from 'node:fs';
const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
const win = (r: any) => (r.mate !== null && r.mate > 0) || r.scoreCp > 250;
const fens = readFileSync(process.argv[2]!, 'utf8').split('\n').map((l) => l.split('  ')[0]!.trim()).filter((l) => /^[\dKkPp\/]+ w /.test(l));
for (const fen of fens) {
  const p = new Position(fen); const moves: string[] = []; let ok = true; const path: string[] = [];
  for (let step = 0; step < 3 && ok; step++) {
    // count winning white moves
    let nWin = 0; let best = '';
    const r = await engine.evaluate({ startFen: fen, moves, depth: 18, maxTimeMs: 400 });
    if (!win(r)) { ok = false; break; }
    for (const m of p.legalMoves()) { const q = p.clone(); q.makeMove(m); const r2 = await engine.evaluate({ startFen: q.toFen(), moves: [], depth: 16, maxTimeMs: 250 }); if (win(r2)) nWin++; }
    if (nWin !== 1) { ok = false; break; }
    best = r.uci; path.push(best.slice(0, 2)); moves.push(best); p.makeMove(p.parseUci(best)!);
    // black reply: the engine's best
    const rb = await engine.evaluate({ startFen: fen, moves, depth: 18, maxTimeMs: 400 });
    moves.push(rb.uci); p.makeMove(p.parseUci(rb.uci)!);
  }
  if (ok && path.length === 3 && path[0] !== path[2] && p.turn === 0) console.log(`${fen}  line ${moves.join(' ')}`);
}
engine.dispose();
