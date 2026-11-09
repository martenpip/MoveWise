// Authoring helper: K+P vs K. Find positions where white wins only by triangulating (few winning king moves, line returns to start square).
import { Position } from '../src/chess/position';
import { StockfishClient } from '../src/engine/stockfish';
import { realTransport, TEST_BUILD } from '../tests/nodeEngine';
const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
const files = 'abcdefgh';
const near = (a: string, b: string) => Math.abs(files.indexOf(a[0]!) - files.indexOf(b[0]!)) <= 1 && Math.abs(+a[1]! - +b[1]!) <= 1;
const fen = (wk: string, bk: string, wp: string, stm = 'w') => {
  const b: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
  const put = (s: string, c: string) => { b[8 - +s[1]!]![files.indexOf(s[0]!)] = c; };
  put(wk, 'K'); put(bk, 'k'); put(wp, 'P');
  return b.map((row) => { let o = '', n = 0; for (const c of row) { if (!c) n++; else { if (n) o += n; n = 0; o += c; } } return o + (n || ''); }).join('/') + ` ${stm} - - 0 1`;
};
const win = (r: any) => (r.mate !== null && r.mate > 0) || r.scoreCp > 250;
for (const wp of process.argv.slice(2)) for (let wf = 0; wf < 8; wf++) for (let wr = 1; wr <= 7; wr++) for (let bf = 0; bf < 8; bf++) for (let br = 1; br <= 8; br++) {
  const wk = files[wf]! + wr, bk = files[bf]! + br;
  if (near(wk, bk) || wk === wp || bk === wp) continue;
  const f = fen(wk, bk, wp);
  let r; try { r = await engine.evaluate({ startFen: f, moves: [], depth: 20, maxTimeMs: 150 }); } catch { continue; }
  if (!win(r)) continue;
  // count winning king moves
  const p = new Position(f); let nWin = 0, nKing = 0;
  for (const m of p.legalMoves()) {
    const u = p.toUci ? p.toUci(m) : '';
    const q = p.clone(); q.makeMove(m);
    const from = ((m >> 0) & 63);
    nKing++;
    let r2; try { r2 = await engine.evaluate({ startFen: q.toFen(), moves: [], depth: 20, maxTimeMs: 150 }); } catch { continue; }
    if (!(r2.mate !== null && r2.mate < 0) && !(r2.scoreCp < -250)) { /* black to move eval from white's view */ }
    if ((r2.mate !== null && r2.mate > 0) || r2.scoreCp > 250) nWin++;
  }
  if (nWin === 1 && p.board[((r.pv[0] ? files.indexOf(r.pv[0][0]!) + 8 * (+r.pv[0][1]! - 1) : 0))] === 6 && r.pv.length >= 6 && r.pv[0]!.slice(0, 2) === r.pv[4]!.slice(2, 4)) console.log(`${f} winningKingMoves ${nWin}/${nKing}  pv ${r.pv.slice(0, 6).join(' ')}`);
}
engine.dispose();
