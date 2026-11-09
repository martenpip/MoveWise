/**
 * Verification games for the built-in part of the bot ladder (100 to 1300): a stronger rung plays a weaker rung and the results are
 * written as JSON lines. Usage: tsx scripts/calibration/ladder.mts <weakRating> <strongRating> <games> <out.jsonl> [seed]
 * Same adjudication as anchor.mts. The score is from the stronger rung's side.
 */
import { appendFileSync } from 'node:fs';
import { Game } from '../../src/chess/game';
import { START_FEN, WHITE } from '../../src/chess/types';
import { chooseBotMove } from '../../src/engine/engine';
import { materialBalance } from '../../src/engine/eval';
import { LEVELS } from '../../src/engine/levels';

const [weakArg, strongArg, gamesArg, out, seedArg] = process.argv.slice(2);
const weak = LEVELS.find((l) => l.rating === Number(weakArg))!;
const strong = LEVELS.find((l) => l.rating === Number(strongArg))!;
const games = Number(gamesArg), seed0 = Number(seedArg ?? 1);

for (let i = 0; i < games; i++) {
  const strongWhite = i % 2 === 0;
  const g = new Game(START_FEN);
  let streak = 0;
  let how = 'ended';
  let result: '1-0' | '0-1' | '1/2-1/2' | null = null;
  while (!g.status().over && g.ply < 140) {
    const lvl = (g.turn === WHITE) === strongWhite ? strong : weak;
    const r = chooseBotMove({ startFen: g.startFen, moves: g.moves.map((m) => m.uci), level: lvl.id, personality: 'balanced', seed: seed0 * 1000 + i * 200 + g.ply });
    g.playUci(r.uci);
    const mat = materialBalance(g.position);
    streak = Math.abs(mat) >= 1000 ? streak + 1 : 0;
    if (streak >= 10) { result = mat > 0 ? '1-0' : '0-1'; how = 'adjudicated-material'; break; }
  }
  if (!result) {
    const st = g.status();
    if (st.over) { result = st.result as '1-0' | '0-1' | '1/2-1/2'; how = st.reason ?? 'ended'; }
    else { const mat = materialBalance(g.position); how = 'adjudicated-length'; result = Math.abs(mat) >= 300 ? (mat > 0 ? '1-0' : '0-1') : '1/2-1/2'; }
  }
  const score = result === '1/2-1/2' ? 0.5 : (result === '1-0') === strongWhite ? 1 : 0;
  appendFileSync(out!, JSON.stringify({ weak: weak.rating, strong: strong.rating, strongWhite, result, plies: g.ply, how, score }) + '\n');
}
