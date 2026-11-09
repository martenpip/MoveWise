// Authoring helper: evaluate several candidate first moves from one position.  `npx tsx scripts/sf-moves.mts "<fen>" uci uci ...`  (evaluation after each move, white's view)
import { Position } from '../src/chess/position';
import { StockfishClient } from '../src/engine/stockfish';
import { realTransport, TEST_BUILD } from '../tests/nodeEngine';
const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
const [fen, ...moves] = process.argv.slice(2);
const p0 = new Position(fen!);
const base = await engine.evaluate({ startFen: fen!, moves: [], depth: 20, maxTimeMs: 2500 });
console.log(`best ${base.uci}  ${base.mate !== null ? '#' + base.mate : (base.scoreCp / 100).toFixed(2)}`);
for (const u of moves) {
  const m = p0.parseUci(u!);
  if (m === undefined) { console.log(u, 'ILLEGAL'); continue; }
  const r = await engine.evaluate({ startFen: fen!, moves: [u!], depth: 20, maxTimeMs: 2500 });
  console.log(u, p0.toSan(m), r.mate !== null ? '#' + r.mate : (r.scoreCp / 100).toFixed(2));
}
engine.dispose();
