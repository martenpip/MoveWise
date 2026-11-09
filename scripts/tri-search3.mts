// Authoring helper: blocked pawns (white pawn on rank r, black pawn above it); find wins whose line is a king triangulation.
import { Position } from '../src/chess/position';
import { StockfishClient } from '../src/engine/stockfish';
import { realTransport, TEST_BUILD } from '../tests/nodeEngine';
const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
const files = 'abcdefgh';
const near = (a: string, b: string) => Math.abs(files.indexOf(a[0]!) - files.indexOf(b[0]!)) <= 1 && Math.abs(+a[1]! - +b[1]!) <= 1;
function fen(wk: string, bk: string, wp: string, bp: string) {
  const b: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
  const put = (s: string, c: string) => { b[8 - +s[1]!]![files.indexOf(s[0]!)] = c; };
  put(wk, 'K'); put(bk, 'k'); put(wp, 'P'); put(bp, 'p');
  return b.map((row) => { let o = '', n = 0; for (const c of row) { if (!c) n++; else { if (n) o += n; n = 0; o += c; } } return o + (n || ''); }).join('/') + ' w - - 0 1';
}
const sqOf = (pos: Position) => { let s = ''; for (let i = 0; i < 64; i++) if (pos.board[i] === 6) s = files[i % 8]! + (((i / 8) | 0) + 1); return s; };
const bkOf = (pos: Position) => { let s = ''; for (let i = 0; i < 64; i++) if (pos.board[i] === 14) s = files[i % 8]! + (((i / 8) | 0) + 1); return s; };
for (const pf of [2, 3, 4, 5]) for (const pr of [3, 4, 5]) {
  const wp = files[pf]! + pr, bp = files[pf]! + (pr + 1);
  for (let wf = Math.max(0, pf - 2); wf <= Math.min(7, pf + 2); wf++) for (let wr = 1; wr < 7; wr++) for (let bf = Math.max(0, pf - 2); bf <= Math.min(7, pf + 2); bf++) for (let br = 2; br < 8; br++) {
    const wk = files[wf]! + (wr + 1), bk = files[bf]! + (br + 1);
    if (near(wk, bk) || [wp, bp].includes(wk) || [wp, bp].includes(bk)) continue;
    // the black king may not stand on a square attacked by the white pawn (white to move: that would be an illegal position)
    if (bk === files[pf - 1]! + (pr + 1) || bk === files[pf + 1]! + (pr + 1)) continue;
    const f = fen(wk, bk, wp, bp);
    let r;
    try { r = await engine.evaluate({ startFen: f, moves: [], depth: 24, maxTimeMs: 700 }); } catch { continue; }
    if (!(r.mate !== null && r.mate > 0 || r.scoreCp > 250)) continue;
    const p = new Position(f);
    const seen: string[] = [wk]; const bseen: string[] = [bk];
    let ok = false;
    for (let i = 0; i < Math.min(r.pv.length, 10); i++) {
      const m = p.parseUci(r.pv[i]!); if (m === undefined) break;
      if (r.pv[i]!.slice(0, 2) === wp) break;
      p.makeMove(m);
      if (i % 2 === 0) seen.push(sqOf(p)); else bseen.push(bkOf(p));
    }
    if (seen.length >= 4 && seen[3] === seen[0] && new Set(seen.slice(0, 3)).size === 3 && new Set(bseen.slice(0, 4)).size <= 2) ok = true;
    if (ok) console.log(`${f}  wk ${seen.join('>')}  bk ${bseen.join('>')}  eval ${r.mate ?? r.scoreCp}`);
  }
}
engine.dispose();
