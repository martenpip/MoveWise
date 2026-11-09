/**
 * Level-vs-level calibration games for MoveWise's built-in engine.
 *
 * Usage: tsx scripts/calibration/play.ts <shard> <shards> <out.jsonl>
 *
 * Plays a fixed schedule of games between levels (all with the "balanced" style),
 * alternating colours, and appends one JSON line per finished game. Results are fitted
 * to relative Elo-style numbers by fit.ts. This measures levels against EACH OTHER only;
 * it says nothing about human strength or FIDE Elo.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { Game } from '../../src/chess/game';
import { START_FEN, WHITE } from '../../src/chess/types';
import { chooseBotMove } from '../../src/engine/engine';
import { materialBalance } from '../../src/engine/eval';
import { LEVELS } from '../../src/engine/levels';

const [shardArg, shardsArg, outFile] = process.argv.slice(2);
const shard = Number(shardArg);
const shards = Number(shardsArg);
if (!outFile || !Number.isFinite(shard) || !Number.isFinite(shards)) throw new Error('usage: play.ts <shard> <shards> <out.jsonl>');

const MAX_PLIES = 110;

interface Job { a: number; b: number; round: number }

/** Adjacent levels get the most games; level i vs i+2 and i+3 link the chain more firmly. */
function schedule(): Job[] {
  const jobs: Job[] = [];
  const plan: Array<[number, number]> = [[1, 8], [2, 4], [3, 2]];
  for (const [gap, rounds] of plan)
    for (let i = 0; i + gap < LEVELS.length; i++) {
      // The slowest levels get fewer games so the whole schedule finishes in reasonable time.
      const slow = i + gap >= 5;
      const n = slow ? Math.max(2, Math.ceil(rounds * 0.6)) : rounds;
      for (let r = 0; r < n; r++) jobs.push({ a: i, b: i + gap, round: r });
    }
  return jobs;
}

function playGame(whiteIdx: number, blackIdx: number, seed: number): { result: '1-0' | '0-1' | '1/2-1/2'; plies: number; how: string } {
  const g = new Game(START_FEN);
  let streak = 0;
  while (!g.status().over && g.ply < MAX_PLIES) {
    const lvl = LEVELS[g.turn === WHITE ? whiteIdx : blackIdx]!;
    const r = chooseBotMove({ startFen: g.startFen, moves: g.moves.map((m) => m.uci), level: lvl.id, personality: 'balanced', seed: seed + g.ply });
    g.playUci(r.uci);
    // Adjudicate hopeless positions so the schedule finishes: >= 10 pawns of material for 10 plies.
    const mat = materialBalance(g.position);
    streak = Math.abs(mat) >= 1000 ? streak + 1 : 0;
    if (streak >= 10) return { result: mat > 0 ? '1-0' : '0-1', plies: g.ply, how: 'adjudicated-material' };
  }
  const st = g.status();
  if (st.over) return { result: st.result as '1-0' | '0-1' | '1/2-1/2', plies: g.ply, how: st.reason ?? 'ended' };
  const mat = materialBalance(g.position);
  if (Math.abs(mat) >= 300) return { result: mat > 0 ? '1-0' : '0-1', plies: g.ply, how: 'adjudicated-length' };
  return { result: '1/2-1/2', plies: g.ply, how: 'adjudicated-length' };
}

const done = new Set<string>();
if (existsSync(outFile))
  for (const line of readFileSync(outFile, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line) as { key: string };
    done.add(r.key);
  }

schedule().forEach((job, idx) => {
  if (idx % shards !== shard) return;
  const key = `${LEVELS[job.a]!.id}|${LEVELS[job.b]!.id}|${job.round}`;
  if (done.has(key)) return;
  // Alternate colours by round.
  const aWhite = job.round % 2 === 0;
  const t0 = Date.now();
  const out = playGame(aWhite ? job.a : job.b, aWhite ? job.b : job.a, 1000 + idx * 7919);
  const scoreA = out.result === '1/2-1/2' ? 0.5 : (out.result === '1-0') === aWhite ? 1 : 0;
  appendFileSync(outFile, JSON.stringify({ key, a: LEVELS[job.a]!.id, b: LEVELS[job.b]!.id, aWhite, result: out.result, scoreA, plies: out.plies, how: out.how, ms: Date.now() - t0 }) + '\n');
});
