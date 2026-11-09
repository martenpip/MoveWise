// Authoring helper: let real Stockfish play both sides from a FEN and print SAN + evaluation (white's view).  `npx tsx scripts/selfplay.mts "<fen>" [plies] [uci...]`
import { Position } from '../src/chess/position';
import { StockfishClient } from '../src/engine/stockfish';
import { realTransport, TEST_BUILD } from '../tests/nodeEngine';
const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
const [fen, n = '16', ...pre] = process.argv.slice(2);
const p = new Position(fen!);
const moves: string[] = [];
for (const u of pre) { const m = p.parseUci(u)!; moves.push(u); p.makeMove(m); }
const out: string[] = [];
for (let i = 0; i < Number(n); i++) {
  if (!p.hasLegalMove()) break;
  const r = await engine.evaluate({ startFen: fen!, moves, depth: 20, maxTimeMs: 2500 });
  const m = p.parseUci(r.uci)!;
  const num = p.turn === 0 ? `${Math.floor(out.length / 2) + 1}.` : '';
  out.push(`${p.toSan(m)}[${r.mate !== null ? '#' + r.mate : (r.scoreCp / 100).toFixed(1)}]`);
  moves.push(r.uci); p.makeMove(m);
}
console.log(out.join(' '));
console.log(moves.join(' '));
engine.dispose();
