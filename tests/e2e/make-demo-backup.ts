/**
 * Test fixture: a MoveWise backup file full of REAL games (low-level bots playing each other, so every move is
 * legal and every result is genuine for that game). Used by the e2e/screenshot tests to exercise the Profile and
 * Home pages with data. Never bundled into the app and never loaded unless a test imports it through Settings.
 *
 * Usage: tsx tests/e2e/make-demo-backup.ts out.json [games=24]
 */
import { writeFileSync } from 'node:fs';
import { Game } from '../../src/chess/game';
import { START_FEN } from '../../src/chess/types';
import { chooseBotMove } from '../../src/engine/engine';
import { LEVELS, PERSONALITIES } from '../../src/engine/levels';
import type { SavedGame } from '../../src/storage/types';

const out = process.argv[2] ?? 'demo-backup.json';
const count = Number(process.argv[3] ?? 24);
const level = (id: string) => LEVELS.find((l) => l.id === id)!;
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const DAY = 86_400_000;
const now = Date.now();
const games: SavedGame[] = [];
const humanLevels = ['beginner', 'easy', 'casual', 'casual', 'easy', 'casual'];
const botLevels = ['beginner', 'easy', 'easy', 'casual', 'casual', 'intermediate'];

for (let i = 0; i < count; i++) {
  const humanSide: 'white' | 'black' = i % 2 === 0 ? 'white' : 'black';
  const hl = level(humanLevels[i % humanLevels.length]!);
  const bl = level(botLevels[(i * 5 + 1) % botLevels.length]!);
  const personality = PERSONALITIES[i % PERSONALITIES.length]!.id;
  const g = new Game(START_FEN);
  while (!g.status().over && g.ply < 120) {
    const humanTurn = (g.turn === 0) === (humanSide === 'white');
    const lvl = humanTurn ? hl : bl;
    const r = chooseBotMove({ startFen: g.startFen, moves: g.moves.map((m) => m.uci), level: lvl.id, personality: humanTurn ? 'balanced' : personality, seed: 100 + i * 977 + g.ply });
    g.playUci(r.uci);
  }
  if (!g.status().over) g.agreeDraw();
  const st = g.status();
  // Spread over ~45 days, with a run of consecutive days at the end, oldest first.
  const daysAgo = Math.max(0, Math.round(((count - 1 - i) / (count - 1)) * 44 - (i > count - 6 ? 0 : 0)));
  games.push({
    id: `demo-${i}`,
    createdAt: now - daysAgo * DAY - Math.floor(rnd() * 3_000_000),
    white: humanSide === 'white' ? 'You' : `${bl.name} bot`,
    black: humanSide === 'black' ? 'You' : `${bl.name} bot`,
    human: humanSide,
    botLevel: bl.id,
    botPersonality: personality,
    startFen: g.startFen,
    uciMoves: g.moves.map((m) => m.uci),
    result: st.result,
    reason: st.reason ?? null,
    source: 'played',
    takebacks: i === 3 ? 1 : 0,
  });
}

writeFileSync(
  out,
  JSON.stringify({
    app: 'MoveWise',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: {},
    games,
    currentGame: null,
    profile: { displayName: 'Ada Lovelace', avatar: { kind: 'piece', color: 'violet', piece: 'knight' }, startedAt: now - 46 * DAY, ratingEpoch: 0 },
    activity: [],
  }),
);
const tally = games.reduce<Record<string, number>>((a, g) => ((a[g.result] = (a[g.result] ?? 0) + 1), a), {});
console.log('wrote', out, games.length, 'games', JSON.stringify(tally));
