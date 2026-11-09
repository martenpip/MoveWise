// Authoring helper: draw the frozen Academy puzzles as ASCII. `npx tsx scripts/show.mts id id ...`
import { TP } from '../src/academy/content/tactic-positions';
for (const id of process.argv.slice(2)) {
  const t = TP[id]; if (!t) { console.log('?', id); continue; }
  console.log(`${id} r${t.rating} ${t.side} to move  ${t.text}  [${t.themes.filter((x) => !['middlegame','endgame','opening'].includes(x)).join(',')}]`);
  const rows = t.fen.split(' ')[0]!.split('/');
  rows.forEach((row, i) => console.log(`${8 - i} ` + [...row].map((c) => (/\d/.test(c) ? '. '.repeat(Number(c)) : c + ' ')).join('')));
  console.log('  a b c d e f g h');
}
