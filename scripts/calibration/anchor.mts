/**
 * Plays a built-in bot configuration against Stockfish limited to a given UCI_Elo and prints one JSON line per game.
 * Usage: tsx scripts/calibration/anchor.mts <levelId> <elo> <games> <sfMovetimeMs> <out.jsonl> [seed]
 * Result is from the built-in bot's side (1 = bot won). Games are adjudicated by material after 12 plies at +-10 pawns, or at
 * 140 plies by a material margin of 3 pawns (otherwise a draw), exactly as the level-vs-level calibration did.
 */
import { appendFileSync } from 'node:fs';
import { Game } from '../../src/chess/game';
import { START_FEN, WHITE } from '../../src/chess/types';
import { chooseBotMove } from '../../src/engine/engine';
import { materialBalance } from '../../src/engine/eval';
import { StockfishClient } from '../../src/engine/stockfish';
import { realTransport, TEST_BUILD } from '../../tests/nodeEngine';

const [levelId, eloArg, gamesArg, mtArg, out, seedArg] = process.argv.slice(2);
const elo = Number(eloArg), games = Number(gamesArg), movetime = Number(mtArg), seed0 = Number(seedArg ?? 1);
const sf = new StockfishClient(TEST_BUILD, { transport: realTransport });

for (let i = 0; i < games; i++) {
  const botWhite = i % 2 === 0;
  const g = new Game(START_FEN);
  let streak = 0;
  let how = 'ended';
  let result: '1-0' | '0-1' | '1/2-1/2' | null = null;
  while (!g.status().over && g.ply < 140) {
    const botTurn = (g.turn === WHITE) === botWhite;
    const spec = { startFen: g.startFen, moves: g.moves.map((m) => m.uci) };
    const r = botTurn ? chooseBotMove({ ...spec, level: levelId!, personality: 'balanced', seed: seed0 * 1000 + i * 200 + g.ply }) : await sf.chooseLimited(spec, elo, movetime);
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
  const score = result === '1/2-1/2' ? 0.5 : (result === '1-0') === botWhite ? 1 : 0;
  appendFileSync(out!, JSON.stringify({ level: levelId, elo, movetime, botWhite, result, plies: g.ply, how, score }) + '\n');
}
sf.dispose();
