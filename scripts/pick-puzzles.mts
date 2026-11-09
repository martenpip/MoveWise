// Authoring helper: deterministically choose bundled puzzles for a theme that are not used by the Academy yet.
// `npx tsx scripts/pick-puzzles.mts <theme> <count> [minRating=600] [maxRating=1700] [maxPlayerMoves=3] [skip=0] [requireTheme2]`
import { readFileSync } from 'node:fs';
import { TP } from '../src/academy/content/tactic-positions';
import { checkMotif } from '../src/puzzles/motif';
const pack = JSON.parse(readFileSync(new URL('../public/puzzles/lichess-starter.json', import.meta.url), 'utf8'));
const picks = new Set(readFileSync(new URL('./academy-picks.txt', import.meta.url), 'utf8').split(/\s+/).filter(Boolean));
const [theme, count = '5', minR = '600', maxR = '1700', maxM = '3', skip = '0', also] = process.argv.slice(2);
const rows = pack.puzzles
  .filter((p: any) => p.themes.includes(theme) && (!also || p.themes.includes(also)) && p.rating >= +minR && p.rating <= +maxR && Math.ceil((p.moves.split(' ').length - 1) / 2) <= +maxM)
  .filter((p: any) => !picks.has(p.id.slice(3)) && !TP[p.id.slice(3)])
  .filter((p: any) => !process.env.CONFIRM || checkMotif({ fen: p.fen, moves: p.moves.split(' ') }, theme) === 'confirmed')
  .sort((a: any, b: any) => a.rating - b.rating || (a.id < b.id ? -1 : 1));
// spread picks over the rating range instead of taking the easiest ones
const step = Math.max(1, Math.floor(rows.length / (+count + +skip)));
const out: string[] = [];
for (let i = +skip; out.length < +count && i * step < rows.length; i++) out.push(rows[i * step].id.slice(3));
console.log(out.join(' '));
console.error(`${rows.length} candidates`);
