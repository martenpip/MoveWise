/**
 * Strength curve of the built-in engine's settings. Plays members of a family (search depth x mistake temperature) against their
 * neighbours and writes one JSON line per game. fit-ladder.mts turns the lines into ratings.
 * Usage: tsx scripts/calibration/family.mts <shard> <shards> <gamesPerPair> <out.jsonl>
 */
import { appendFileSync } from 'node:fs';
import { Game } from '../../src/chess/game';
import { START_FEN, WHITE } from '../../src/chess/types';
import { chooseBotMove } from '../../src/engine/engine';
import { materialBalance } from '../../src/engine/eval';
import type { Level } from '../../src/engine/levels';

export const FAMILY: Array<{ depth: number; temperature: number }> = [
  ...[1200, 800, 500, 320, 200, 120].map((temperature) => ({ depth: 1, temperature })),
  ...[400, 250, 160, 100, 60].map((temperature) => ({ depth: 2, temperature })),
  ...[250, 160, 100, 85, 60, 40].map((temperature) => ({ depth: 3, temperature })),
  ...[120, 80, 60, 42, 25].map((temperature) => ({ depth: 4, temperature })),
];
const NODES = [0, 2_000, 6_000, 20_000, 60_000];
const MS = [0, 300, 400, 600, 900];
export const spec = (i: number): Level => {
  const m = FAMILY[i]!;
  return { id: `f${i}`, name: `f${i}`, how: '', rating: 0, category: 'practice', backend: 'builtin', temperature: m.temperature, limits: { maxDepth: m.depth, maxNodes: NODES[m.depth]!, maxTimeMs: MS[m.depth]!, quiesce: m.depth > 1 } };
};

if (process.argv[1]?.endsWith('family.mts')) {
  const [shardArg, shardsArg, gamesArg, out] = process.argv.slice(2);
  const shard = Number(shardArg), shards = Number(shardsArg), per = Number(gamesArg);
  const jobs: Array<[number, number, number]> = [];
  for (let i = 0; i < FAMILY.length; i++) for (const gap of [1, 2, 3]) if (i + gap < FAMILY.length) for (let r = 0; r < per; r++) jobs.push([i, i + gap, r]);
  jobs.forEach(([a, b, r], idx) => {
    if (idx % shards !== shard) return;
    const aWhite = r % 2 === 0;
    const g = new Game(START_FEN);
    let streak = 0, how = 'ended';
    let result: '1-0' | '0-1' | '1/2-1/2' | null = null;
    const la = spec(a), lb = spec(b);
    while (!g.status().over && g.ply < 140) {
      const lvl = (g.turn === WHITE) === aWhite ? la : lb;
      const rep = chooseBotMove({ startFen: g.startFen, moves: g.moves.map((m) => m.uci), level: lvl.id, levelSpec: lvl, personality: 'balanced', seed: idx * 1000 + g.ply });
      g.playUci(rep.uci);
      const mat = materialBalance(g.position);
      streak = Math.abs(mat) >= 1000 ? streak + 1 : 0;
      if (streak >= 10) { result = mat > 0 ? '1-0' : '0-1'; how = 'adjudicated-material'; break; }
    }
    if (!result) {
      const st = g.status();
      if (st.over) { result = st.result as '1-0' | '0-1' | '1/2-1/2'; how = st.reason ?? 'ended'; }
      else { const mat = materialBalance(g.position); how = 'adjudicated-length'; result = Math.abs(mat) >= 300 ? (mat > 0 ? '1-0' : '0-1') : '1/2-1/2'; }
    }
    const score = result === '1/2-1/2' ? 0.5 : (result === '1-0') === aWhite ? 1 : 0; // from a's side
    appendFileSync(out!, JSON.stringify({ a, b, aWhite, result, plies: g.ply, how, score }) + '\n');
  });
}
