// Authoring audit: do the puzzles used in lessons, and the bundled pack, really show the theme they are tagged with?
//   npx tsx scripts/audit-puzzle-themes.mts
import { readFileSync } from 'node:fs';
import { COURSES } from '../src/academy/curriculum';
import { TP } from '../src/academy/content/tactic-positions';
import { checkMotif, CHECKED_THEMES } from '../src/puzzles/motif';

const pack = JSON.parse(readFileSync(new URL('../public/puzzles/lichess-starter.json', import.meta.url), 'utf8'));
const rows: Record<string, { tagged: number; confirmed: number }> = {};
for (const p of pack.puzzles) for (const t of p.themes) {
  if (!CHECKED_THEMES.has(t)) continue;
  const r = (rows[t] ??= { tagged: 0, confirmed: 0 });
  r.tagged++;
  if (checkMotif({ fen: p.fen, moves: p.moves.split(' ') }, t) === 'confirmed') r.confirmed++;
}
console.log('PACK: theme  tagged  confirmed');
for (const [t, r] of Object.entries(rows)) console.log(`  ${t.padEnd(20)} ${String(r.tagged).padStart(4)} ${String(r.confirmed).padStart(4)}  ${((100 * r.confirmed) / r.tagged).toFixed(0)}%`);

const byFen = new Map(Object.entries(TP).map(([id, t]) => [t.fen, id]));
const byId = new Map<string, any>(pack.puzzles.map((p: any) => [p.id.slice(3), p]));
let bad = 0, checked = 0, unchecked = 0;
for (const c of COURSES) for (const ch of c.chapters) for (const l of ch.lessons) {
  const themes = (l.puzzleThemes ?? []).filter((t) => CHECKED_THEMES.has(t));
  const ids = new Set<string>();
  for (const s of l.steps) {
    if (s.kind === 'move' && s.id.startsWith('ex-')) ids.add(s.id.slice(3));
    if (s.kind === 'demo') { const id = byFen.get(s.board.fen); if (id) ids.add(id); }
  }
  for (const q of l.check) if (q.kind === 'move' && q.id.startsWith('q-')) ids.add(q.id.slice(2));
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) { console.log(`?? ${l.id}: ${id} not in pack`); continue; }
    if (!themes.length) { unchecked++; continue; }
    const res = themes.map((t) => checkMotif({ fen: p.fen, moves: p.moves.split(' ') }, t));
    checked++;
    if (!res.includes('confirmed')) { bad++; console.log(`NOT FOUND ${l.id}: ${id} (${themes.join(',')}) tags=${p.themes.join(',')}`); }
  }
}
console.log(`lesson puzzles with a checkable theme: ${checked}, of which not confirmed: ${bad}; lesson puzzles on themes without a detector: ${unchecked}`);

// Discrimination: how often does the detector fire on puzzles NOT tagged with the theme? (a detector that fires everywhere proves nothing)
console.log('\nBASELINE: detector fires on untagged puzzles');
for (const t of CHECKED_THEMES) {
  const un = pack.puzzles.filter((p: any) => !p.themes.includes(t));
  const hit = un.filter((p: any) => checkMotif({ fen: p.fen, moves: p.moves.split(' ') }, t) === 'confirmed').length;
  console.log(`  ${t.padEnd(20)} ${hit}/${un.length} = ${((100 * hit) / un.length).toFixed(0)}%`);
}
