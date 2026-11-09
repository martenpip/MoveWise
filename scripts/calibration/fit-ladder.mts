/**
 * Fits ratings to the family games (family.mts) and, optionally, anchors them to Stockfish (anchor.mts results).
 * Usage: tsx scripts/calibration/fit-ladder.mts <anchorMember> <anchorRating> <family.jsonl...>
 * Method: Elo/Bradley-Terry maximum likelihood (a draw counts as half a win), fitted by Newton's method with a very weak prior
 * (one imaginary draw between neighbours) so unbeaten members stay finite. Standard errors come from the observed information.
 */
import { readFileSync } from 'node:fs';
import { FAMILY } from './family.mts';

const [anchorArg, anchorRatingArg, ...files] = process.argv.slice(2);
const N = FAMILY.length;
const games: Array<{ a: number; b: number; score: number }> = [];
for (const f of files) for (const l of readFileSync(f, 'utf8').split('\n')) if (l.trim()) { const g = JSON.parse(l); games.push({ a: g.a, b: g.b, score: g.score }); }
for (let i = 0; i + 1 < N; i++) games.push({ a: i, b: i + 1, score: 0.5 });

const K = Math.LN10 / 400;
const theta = new Array<number>(N).fill(0); // in Elo points
const p = (d: number) => 1 / (1 + Math.exp(-K * d));
for (let it = 0; it < 200; it++) {
  const grad = new Array<number>(N).fill(0), hess = new Array<number>(N).fill(0);
  for (const g of games) {
    const e = p(theta[g.a]! - theta[g.b]!);
    const r = (g.score - e) * K;
    const w = e * (1 - e) * K * K;
    grad[g.a]! += r; grad[g.b]! -= r; hess[g.a]! += w; hess[g.b]! += w;
  }
  let maxStep = 0;
  for (let i = 0; i < N; i++) { const step = grad[i]! / Math.max(hess[i]!, 1e-9); theta[i]! += Math.max(-80, Math.min(80, step)); maxStep = Math.max(maxStep, Math.abs(step)); }
  if (maxStep < 1e-4) break;
}
const anchor = Number(anchorArg), offset = Number(anchorRatingArg) - theta[anchor]!;
const info = new Array<number>(N).fill(0), count = new Array<number>(N).fill(0);
for (const g of games) { const e = p(theta[g.a]! - theta[g.b]!); const w = e * (1 - e) * K * K; info[g.a]! += w; info[g.b]! += w; count[g.a]!++; count[g.b]!++; }
const rows = FAMILY.map((m, i) => ({ i, depth: m.depth, temperature: m.temperature, rating: Math.round(theta[i]! + offset), se: Math.round(1 / Math.sqrt(info[i]!)), games: count[i]! }));
console.log(JSON.stringify(rows));
for (const r of rows) console.log(`f${String(r.i).padStart(2)} d${r.depth} T${String(r.temperature).padStart(4)}  rating ${String(r.rating).padStart(5)}  +-${r.se}  games ${r.games}`);
