// Authoring helper: find K+P v K positions whose winning line is a king triangulation (white king back on its start square after 3 moves, pawn unmoved).
import { Position } from '../src/chess/position';
import { StockfishClient } from '../src/engine/stockfish';
import { realTransport, TEST_BUILD } from '../tests/nodeEngine';
const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
const files = 'abcdefgh';
const near = (a: string, b: string) => Math.abs(files.indexOf(a[0]!) - files.indexOf(b[0]!)) <= 1 && Math.abs(+a[1]! - +b[1]!) <= 1;
function fen(wk: string, bk: string, pawn: string) {
  const b: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
  const put = (s: string, c: string) => { b[8 - +s[1]!]![files.indexOf(s[0]!)] = c; };
  put(wk, 'K'); put(bk, 'k'); put(pawn, 'P');
  return b.map((row) => { let o = '', n = 0; for (const c of row) { if (!c) n++; else { if (n) o += n; n = 0; o += c; } } return o + (n || ''); }).join('/') + ' w - - 0 1';
}
const pawn = process.argv[2] ?? 'd4';
for (let wf = 1; wf < 7; wf++) for (let wr = 3; wr < 6; wr++) for (let bf = 1; bf < 7; bf++) for (let br = 4; br < 8; br++) {
  const wk = files[wf]! + (wr + 1), bk = files[bf]! + (br + 1);
  if (near(wk, bk) || wk === pawn || bk === pawn || wk === 'x') continue;
  const pf = files.indexOf(pawn[0]!), pr = +pawn[1]!;
  // black king must not give check to the white king / be attacked by the pawn on white's move
  if (bk === files[pf - 1]! + (pr + 1) || bk === files[pf + 1]! + (pr + 1)) continue;
  const f = fen(wk, bk, pawn);
  const r = await engine.evaluate({ startFen: f, moves: [], depth: 26, maxTimeMs: 900 });
  if (!(r.mate !== null && r.mate > 0 || r.scoreCp > 400)) continue;
  const p = new Position(f);
  let wkBack = false, pawnMoved = false;
  const sqOf = (pos: Position) => { let s = ''; for (let i = 0; i < 64; i++) if (pos.board[i] === 6) s = files[i % 8]! + (((i / 8) | 0) + 1); return s; };
  for (let i = 0; i < Math.min(r.pv.length, 8); i++) {
    const m = p.parseUci(r.pv[i]!); if (m === undefined) break;
    if (r.pv[i]!.slice(0, 2) === pawn) pawnMoved = true;
    p.makeMove(m);
    if (i === 5 && !pawnMoved && sqOf(p) === wk) wkBack = true;
  }
  if (wkBack) console.log(`${f}   pv ${r.pv.slice(0, 8).join(' ')}  eval ${r.mate ?? r.scoreCp}`);
}
engine.dispose();
