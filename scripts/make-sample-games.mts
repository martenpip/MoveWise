/**
 * Makes a small backup file of sample games for the README screenshots: the app's own bots play each other, and the file is
 * imported through the app's normal import. Nothing is invented by hand. Usage: tsx scripts/make-sample-games.mts <out.json>
 * The "player" is the side shown as You; the opponent is the bot level named in the game.
 */
import { writeFileSync } from 'node:fs';
import { Game } from '../src/chess/game';
import { START_FEN, WHITE } from '../src/chess/types';
import { chooseBotMove } from '../src/engine/engine';
import { materialBalance } from '../src/engine/eval';
import { findLevel } from '../src/engine/levels';
import { DEFAULT_SETTINGS, BACKUP_VERSION, type SavedGame } from '../src/storage/types';

const out = process.argv[2]!;
// [your level, opponent level, you play white]. Your side uses the level as a stand-in for a player of about that strength.
const PLAN: Array<[string, string, boolean]> = [
  ['r500', 'r400', true], ['r500', 'r700', false], ['r600', 'r500', true], ['r600', 'r900', true], ['r700', 'r600', false],
  ['r700', 'r1000', true], ['r800', 'r700', true], ['r800', 'r1100', false], ['r900', 'r800', true], ['r900', 'r1200', true],
];
const games: SavedGame[] = [];
const base = Date.now() - 12 * 86_400_000;
let n = 0;
for (const [mine, theirs, white] of PLAN) {
  const g = new Game(START_FEN);
  let streak = 0;
  while (!g.status().over && g.ply < 160) {
    const side = (g.turn === WHITE) === white ? mine : theirs;
    const r = chooseBotMove({ startFen: g.startFen, moves: g.moves.map((m) => m.uci), level: side, personality: 'balanced', seed: 500 + n * 211 + g.ply });
    g.playUci(r.uci);
    streak = Math.abs(materialBalance(g.position)) >= 900 ? streak + 1 : 0;
    if (streak >= 8) break;
  }
  const st = g.status();
  let result = st.over ? (st.result as '1-0' | '0-1' | '1/2-1/2') : null;
  let reason: string | null = st.over ? (st.reason ?? null) : null;
  if (!result) {
    const mat = materialBalance(g.position);
    result = Math.abs(mat) >= 300 ? (mat > 0 ? '1-0' : '0-1') : '1/2-1/2';
    reason = result === '1/2-1/2' ? 'agreement' : 'resignation';
  }
  const opp = findLevel(theirs)!;
  games.push({
    id: `sample-${n}`, createdAt: base + n * 1.1 * 86_400_000, white: white ? 'You' : opp.name, black: white ? opp.name : 'You', human: white ? 'white' : 'black',
    botLevel: theirs, botPersonality: 'balanced', startFen: START_FEN, uciMoves: g.moves.map((m) => m.uci), result, reason, source: 'played', takebacks: 0, mode: 'normal',
  });
  n++;
}
const backup = { app: 'MoveWise', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings: DEFAULT_SETTINGS, games, currentGame: null, profile: null, activity: [], achievements: null };
writeFileSync(out, JSON.stringify(backup));
console.log(`${games.length} games: ${games.map((g) => g.result).join(' ')}`);
