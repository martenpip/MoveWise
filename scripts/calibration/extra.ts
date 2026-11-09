/**
 * Level-vs-level calibration games for MoveWise's built-in engine.
 *
 * Extra games for one pair, run on an otherwise idle machine (the two slowest levels are time-capped, so CPU
 * contention skews them). Usage: tsx scripts/calibration/extra.ts <levelA> <levelB> <firstRound> <rounds> <out.jsonl>
 *
 * Plays a fixed schedule of games between levels (all with the "balanced" style),
 * alternating colours, and appends one JSON line per finished game. Results are fitted
 * to relative Elo-style numbers by fit.ts. This measures levels against EACH OTHER only;
 * it says nothing about human strength or FIDE Elo.
 */
import { appendFileSync } from 'node:fs';
import { Game } from '../../src/chess/game';
import { START_FEN, WHITE } from '../../src/chess/types';
import { chooseBotMove } from '../../src/engine/engine';
import { materialBalance } from '../../src/engine/eval';
import { LEVELS } from '../../src/engine/levels';

const [idA, idB, firstArg, roundsArg, outFile] = process.argv.slice(2);
if (!outFile) throw new Error('usage: extra.ts <levelA> <levelB> <firstRound> <rounds> <out.jsonl>');
const ia = LEVELS.findIndex((l) => l.id === idA);
const ib = LEVELS.findIndex((l) => l.id === idB);
if (ia < 0 || ib < 0) throw new Error('unknown level');

const MAX_PLIES = 110;


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

for (let k = 0; k < Number(roundsArg); k++) {
  const round = Number(firstArg) + k;
  const aWhite = round % 2 === 0;
  const t0 = Date.now();
  const out = playGame(aWhite ? ia : ib, aWhite ? ib : ia, 90000 + round * 7919 + ia * 101 + ib);
  const scoreA = out.result === '1/2-1/2' ? 0.5 : (out.result === '1-0') === aWhite ? 1 : 0;
  appendFileSync(outFile, JSON.stringify({ key: `${idA}|${idB}|${round}`, a: idA, b: idB, aWhite, result: out.result, scoreA, plies: out.plies, how: out.how, ms: Date.now() - t0 }) + '\n');
}
