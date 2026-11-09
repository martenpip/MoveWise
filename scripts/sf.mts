// Authoring helper: ask the real Stockfish about positions. `npx tsx scripts/sf.mts "<fen>" [uci moves...]`  (several: pass "--" between)
import { Position } from '../src/chess/position';
import { StockfishClient } from '../src/engine/stockfish';
import { realTransport, TEST_BUILD } from '../tests/nodeEngine';

const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
const groups: string[][] = [[]];
for (const a of process.argv.slice(2)) a === '--' ? groups.push([]) : groups[groups.length - 1]!.push(a);
for (const [fen, ...moves] of groups) {
  if (!fen) continue;
  const r = await engine.evaluate({ startFen: fen, moves, depth: 18, maxTimeMs: 1500 });
  const p = new Position(fen);
  for (const m of moves) p.makeMove(p.parseUci(m)!);
  const q = p.clone();
  const san: string[] = [];
  for (const u of r.pv.slice(0, 6)) {
    const m = q.parseUci(u);
    if (m === undefined) break;
    san.push(q.toSan(m));
    q.makeMove(m);
  }
  console.log(`${p.toFen()}\n  eval ${r.mate !== null ? `mate ${r.mate}` : (r.scoreCp / 100).toFixed(2)} (white's view) depth ${r.depth}  best ${r.uci}  pv ${san.join(' ')}`);
}
engine.dispose();
