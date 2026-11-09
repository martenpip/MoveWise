// Authoring helper: two blocked pawn pairs; find wins whose engine line is a king triangulation.
import { Position } from '../src/chess/position';
import { StockfishClient } from '../src/engine/stockfish';
import { realTransport, TEST_BUILD } from '../tests/nodeEngine';
const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
const files = 'abcdefgh';
const [A, B] = process.argv.slice(2) as [string, string]; // e.g. d5 f4 : white pawn squares; black pawn directly above
const near = (a: string, b: string) => Math.abs(files.indexOf(a[0]!) - files.indexOf(b[0]!)) <= 1 && Math.abs(+a[1]! - +b[1]!) <= 1;
const up = (s: string) => s[0]! + (+s[1]! + 1);
const wps = [A, B], bps = [up(A), up(B)];
function fen(wk: string, bk: string) {
  const b: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
  const put = (s: string, c: string) => { b[8 - +s[1]!]![files.indexOf(s[0]!)] = c; };
  put(wk, 'K'); put(bk, 'k'); wps.forEach((s) => put(s, 'P')); bps.forEach((s) => put(s, 'p'));
  return b.map((row) => { let o = '', n = 0; for (const c of row) { if (!c) n++; else { if (n) o += n; n = 0; o += c; } } return o + (n || ''); }).join('/') + ' w - - 0 1';
}
const find = (pos: Position, piece: number) => { for (let i = 0; i < 64; i++) if (pos.board[i] === piece) return files[i % 8]! + (((i / 8) | 0) + 1); return ''; };
const all = [...wps, ...bps];
for (let wf = 0; wf < 8; wf++) for (let wr = 1; wr <= 6; wr++) for (let bf = 0; bf < 8; bf++) for (let br = 3; br <= 8; br++) {
  const wk = files[wf]! + wr, bk = files[bf]! + br;
  if (near(wk, bk) || all.includes(wk) || all.includes(bk)) continue;
  const f = fen(wk, bk);
  let p0: Position; try { p0 = new Position(f); } catch { continue; }
  // black king must not be attacked by a white pawn
  if (p0.attackersOf && false) continue;
  let r; try { r = await engine.evaluate({ startFen: f, moves: [], depth: 16, maxTimeMs: 250 }); } catch { continue; }
  if (!(r.mate !== null && r.mate > 0 || r.scoreCp > 250)) continue;
  const p = new Position(f); const seen = [wk]; const bseen = [bk]; const cnt = () => { let n = 0; for (let i = 0; i < 64; i++) if (p.board[i]) n++; return n; }; const n0 = cnt(); let cap = false;
  for (let i = 0; i < Math.min(r.pv.length, 10); i++) {
    const m = p.parseUci(r.pv[i]!); if (m === undefined) break;
    if (wps.includes(r.pv[i]!.slice(0, 2))) break;
    p.makeMove(m); if (cnt() < n0) cap = true;
    if (i % 2 === 0) seen.push(find(p, 6)); else bseen.push(find(p, 14));
  }
  let nWin = 0; for (const m of p0.legalMoves()) { const q = p0.clone(); q.makeMove(m); let r2; try { r2 = await engine.evaluate({ startFen: q.toFen(), moves: [], depth: 16, maxTimeMs: 200 }); } catch { continue; } if (r2.mate !== null ? r2.mate > 0 : r2.scoreCp > 250) nWin++; }
  if (nWin > 1) continue;
  if (!cap && seen.length >= 4 && seen[3] === seen[0] && new Set(seen.slice(0, 3)).size === 3) console.log(`${f}  wk ${seen.join('>')}  bk ${bseen.join('>')}  eval ${r.mate ?? r.scoreCp}`);
}
engine.dispose();
