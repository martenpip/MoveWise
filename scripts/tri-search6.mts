// Authoring helper: K+P vs K. A genuine triangulation: white to move wins; following the engine line the white king goes round a triangle (3 moves) while the black king ends where it began; and the SAME final position with WHITE to move is only a draw.
import { Position } from '../src/chess/position';
import { StockfishClient } from '../src/engine/stockfish';
import { realTransport, TEST_BUILD } from '../tests/nodeEngine';
const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
const files = 'abcdefgh';
const near = (a: string, b: string) => Math.abs(files.indexOf(a[0]!) - files.indexOf(b[0]!)) <= 1 && Math.abs(+a[1]! - +b[1]!) <= 1;
const fen = (wk: string, bk: string, wp: string) => {
  const b: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
  const put = (s: string, c: string) => { b[8 - +s[1]!]![files.indexOf(s[0]!)] = c; };
  put(wk, 'K'); put(bk, 'k'); put(wp, 'P');
  return b.map((row) => { let o = '', n = 0; for (const c of row) { if (!c) n++; else { if (n) o += n; n = 0; o += c; } } return o + (n || ''); }).join('/') + ' w - - 0 1';
};
const win = (r: any) => (r.mate !== null && r.mate > 0) || r.scoreCp > 250;
const draw = (r: any) => r.mate === null && Math.abs(r.scoreCp) < 60;
const find = (p: Position, piece: number) => { for (let i = 0; i < 64; i++) if (p.board[i] === piece) return files[i % 8]! + (((i / 8) | 0) + 1); return ''; };
for (const wp of process.argv.slice(2)) for (let wf = 0; wf < 8; wf++) for (let wr = 1; wr <= 7; wr++) for (let bf = 0; bf < 8; bf++) for (let br = 2; br <= 8; br++) {
  const wk = files[wf]! + wr, bk = files[bf]! + br;
  if (near(wk, bk) || wk === wp || bk === wp) continue;
  const f = fen(wk, bk, wp);
  let r; try { r = await engine.evaluate({ startFen: f, moves: [], depth: 18, maxTimeMs: 150 }); } catch { continue; }
  if (!win(r) || r.pv.length < 5) continue;
  const p = new Position(f); let okPath = true;
  for (let i = 0; i < 5; i++) { const m = p.parseUci(r.pv[i]!); if (m === undefined) { okPath = false; break; } if (i % 2 === 0 && r.pv[i]!.slice(0, 2) === wp) okPath = false; p.makeMove(m); }
  if (!okPath) continue;
  if (find(p, 6) !== wk || find(p, 14) !== bk) continue;                 // both kings back where they started (black to move)
  const w1 = r.pv[0]!.slice(2, 4), w2 = r.pv[2]!.slice(2, 4);
  if (new Set([wk, w1, w2]).size !== 3) continue;
  const flip = p.toFen().replace(' b ', ' w ');
  let r2; try { r2 = await engine.evaluate({ startFen: flip, moves: [], depth: 20, maxTimeMs: 300 }); } catch { continue; }
  if (!draw(r2)) continue;
  console.log(`${f}  wk ${wk}>${w1}>${w2}>${wk}  bk ${bk}>${r.pv[1]!.slice(2, 4)}>${bk}  line ${r.pv.slice(0, 5).join(' ')}`);
}
engine.dispose();
