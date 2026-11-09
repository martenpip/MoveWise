// Authoring helper: look for a classical triangulation position (blocked pawns d5/d6).
import { StockfishClient } from '../src/engine/stockfish';
import { realTransport, TEST_BUILD } from '../tests/nodeEngine';
const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
const files = 'abcdefgh';
const sqn = (f: number, r: number) => files[f]! + (r + 1);
function fenOf(wk: string, bk: string, side: 'w' | 'b') {
  const b: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
  const put = (s: string, c: string) => { b[8 - +s[1]!]![files.indexOf(s[0]!)] = c; };
  put(wk, 'K'); put(bk, 'k'); put('d5', 'P'); put('d6', 'p');
  return b.map((row) => { let o = '', n = 0; for (const c of row) { if (!c) n++; else { if (n) o += n; n = 0; o += c; } } return o + (n || ''); }).join('/') + ` ${side} - - 0 1`;
}
const near = (a: string, b: string) => Math.abs(files.indexOf(a[0]!) - files.indexOf(b[0]!)) <= 1 && Math.abs(+a[1]! - +b[1]!) <= 1;
const res = new Map<string, number>();
for (let wf = 1; wf < 6; wf++) for (let wr = 2; wr < 5; wr++) for (let bf = 1; bf < 6; bf++) for (let br = 5; br < 8; br++) {
  const wk = sqn(wf, wr), bk = sqn(bf, br);
  if (near(wk, bk) || wk === 'd5' || bk === 'd6' || wk === 'd6' || bk === 'd5' || bk === 'c6' || bk === 'e6' || wk === 'c5' || wk === 'e5') continue;
  for (const side of ['w', 'b'] as const) {
    const fen = fenOf(wk, bk, side);
    const r = await engine.evaluate({ startFen: fen, moves: [], depth: 22, maxTimeMs: 400 });
    res.set(`${wk} ${bk} ${side}`, r.mate !== null ? (r.mate > 0 ? 1000 : -1000) : r.scoreCp);
  }
}
for (const [k, v] of res) {
  const [wk, bk, side] = k.split(' ');
  if (side === 'b' && v > 300 && (res.get(`${wk} ${bk} w`) ?? 999) < 100) console.log(`mutual zugzwang: Wk ${wk} Bk ${bk}: black to move ${v}, white to move ${res.get(`${wk} ${bk} w`)}`);
}
engine.dispose();
