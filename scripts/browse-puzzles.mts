// Authoring helper: list bundled puzzles for a theme, with the position after the opponent's set-up move. 
// `npx tsx scripts/browse-puzzles.mts <theme> [maxRating] [maxMoves] [count] [skip]`
import { readFileSync } from 'node:fs';
import { Position } from '../src/chess/position';
const pack = JSON.parse(readFileSync(new URL('../public/puzzles/lichess-starter.json', import.meta.url), 'utf8'));
const [theme, maxR = '1400', maxM = '4', count = '8', skip = '0'] = process.argv.slice(2);
const minR = 0;
const rows = pack.puzzles.filter((p: any) => p.themes.includes(theme) && p.rating <= Number(maxR) && p.rating >= minR && p.moves.split(' ').length <= Number(maxM)).sort((a: any, b: any) => a.rating - b.rating).slice(Number(skip), Number(skip) + Number(count));
for (const p of rows) {
  const ms = p.moves.split(' ');
  const pos = new Position(p.fen);
  pos.makeMove(pos.parseUci(ms[0])!);
  const start = pos.toFen();
  const q = pos.clone();
  const san: string[] = [];
  for (const u of ms.slice(1)) { const m = q.parseUci(u)!; san.push(q.toSan(m)); q.makeMove(m); }
  const rowsA: string[] = [];
  for (let r = 7; r >= 0; r--) { let s = ''; for (let f = 0; f < 8; f++) { const pc = pos.board[r * 8 + f]; s += pc ? 'PNBRQKpnbrqk'[(pc as number) - 1] ?? '?' : '.'; } rowsA.push(s); }
  console.log(`${p.id} r${p.rating} ${p.themes.filter((t: string) => !['middlegame','endgame','opening'].includes(t)).join(',')}\n  start ${start}\n  sol ${ms.slice(1).join(' ')}  =  ${san.join(' ')}`);
}
