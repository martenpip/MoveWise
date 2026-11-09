/**
 * Bridge opponents for calibration. Adjacent shipped levels are so far apart that 8-game matches are sweeps (which only
 * give a lower bound). These measurement-only players use the SAME engine with in-between depth / mistake-temperature
 * settings so the chain of results has non-sweep links. They are never offered in the app.
 *
 * Usage: tsx scripts/calibration/bridges.ts <shard> <shards> <out.jsonl>
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { Game } from '../../src/chess/game';
import { START_FEN, WHITE } from '../../src/chess/types';
import { chooseBotMove } from '../../src/engine/engine';
import { materialBalance } from '../../src/engine/eval';
import { LEVELS, type Level } from '../../src/engine/levels';

const [shardArg, shardsArg, outFile] = process.argv.slice(2);
const shard = Number(shardArg);
const shards = Number(shardsArg);
if (!outFile) throw new Error('usage: bridges.ts <shard> <shards> <out.jsonl>');

const L = (id: string) => LEVELS.find((l) => l.id === id)!;
const mk = (id: string, depth: number, temperature: number, nodes: number, ms: number): Level => ({
  id, name: id, how: 'calibration bridge', temperature, limits: { maxDepth: depth, maxNodes: nodes, maxTimeMs: ms, quiesce: depth > 1 }, rating: 0, category: 'practice', backend: 'builtin',
});

/** Presumed order of strength, weakest first. Order only decides who plays whom; the fit decides the numbers. */
export const CHAIN: Level[] = [
  L('beginner'),
  mk('b-d1-t160', 1, 160, 2_000, 300),
  mk('b-d2-t320', 2, 320, 6_000, 400),
  L('easy'),
  mk('b-d2-t85', 2, 85, 6_000, 400),
  mk('b-d3-t160', 3, 160, 20_000, 600),
  L('casual'),
  mk('b-d3-t42', 3, 42, 20_000, 600),
  mk('b-d4-t85', 4, 85, 60_000, 900),
  L('intermediate'),
  mk('b-d4-t14', 4, 14, 60_000, 900),
  mk('b-d5-t42', 5, 42, 100_000, 1_100),
  mk('b-d5-t14', 5, 14, 100_000, 1_100),
  L('advanced'),
];

const MAX_PLIES = 110;
function playGame(w: Level, b: Level, seed: number): { scoreWhite: number; plies: number; how: string } {
  const g = new Game(START_FEN);
  let streak = 0;
  while (!g.status().over && g.ply < MAX_PLIES) {
    const lvl = g.turn === WHITE ? w : b;
    const r = chooseBotMove({ startFen: g.startFen, moves: g.moves.map((m) => m.uci), level: lvl.id, levelSpec: lvl, personality: 'balanced', seed: seed + g.ply });
    g.playUci(r.uci);
    const mat = materialBalance(g.position);
    streak = Math.abs(mat) >= 1000 ? streak + 1 : 0;
    if (streak >= 10) return { scoreWhite: mat > 0 ? 1 : 0, plies: g.ply, how: 'adjudicated-material' };
  }
  const st = g.status();
  if (st.over) return { scoreWhite: st.result === '1/2-1/2' ? 0.5 : st.result === '1-0' ? 1 : 0, plies: g.ply, how: st.reason ?? 'ended' };
  const mat = materialBalance(g.position);
  return { scoreWhite: Math.abs(mat) >= 300 ? (mat > 0 ? 1 : 0) : 0.5, plies: g.ply, how: 'adjudicated-length' };
}

interface Job { a: Level; b: Level; round: number }
const jobs: Job[] = [];
for (const [gap, rounds] of [[1, 10], [2, 6]] as const)
  for (let i = 0; i + gap < CHAIN.length; i++)
    for (let r = 0; r < rounds; r++) jobs.push({ a: CHAIN[i]!, b: CHAIN[i + gap]!, round: r });

const done = new Set<string>();
if (existsSync(outFile)) for (const line of readFileSync(outFile, 'utf8').split('\n').filter(Boolean)) done.add((JSON.parse(line) as { key: string }).key);

jobs.forEach((job, idx) => {
  if (idx % shards !== shard) return;
  const key = `${job.a.id}|${job.b.id}|${job.round}`;
  if (done.has(key)) return;
  const aWhite = job.round % 2 === 0;
  const t0 = Date.now();
  const out = playGame(aWhite ? job.a : job.b, aWhite ? job.b : job.a, 5000 + idx * 104729);
  const scoreA = aWhite ? out.scoreWhite : 1 - out.scoreWhite;
  appendFileSync(outFile, JSON.stringify({ key, a: job.a.id, b: job.b.id, aWhite, scoreA, plies: out.plies, how: out.how, ms: Date.now() - t0 }) + '\n');
});
