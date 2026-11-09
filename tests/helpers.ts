import type { SavedGame } from '../src/storage/types';
import { START_FEN } from '../src/chess/types';

let n = 0;
export const DAY = 86_400_000;
/** Local-noon timestamp for a calendar day (month is 1-based), so day-bucket tests don't depend on the time zone. */
export const at = (y: number, m: number, d: number, h = 12): number => new Date(y, m - 1, d, h).getTime();

/** A finished game against a bot, as the Play page would save it. */
export function game(over: Partial<SavedGame> & { outcome?: 'win' | 'loss' | 'draw' }): SavedGame {
  const human = over.human ?? 'white';
  const outcome = over.outcome ?? 'win';
  const result =
    over.result ??
    (outcome === 'draw' ? '1/2-1/2' : (outcome === 'win') === (human === 'white') ? '1-0' : '0-1');
  const { outcome: _o, ...rest } = over;
  void _o;
  n++;
  return {
    id: `g${n}`,
    createdAt: at(2026, 1, 1) + n * 1000,
    white: human === 'white' ? 'You' : 'Bot',
    black: human === 'black' ? 'You' : 'Bot',
    human,
    botLevel: 'casual',
    botPersonality: 'balanced',
    startFen: START_FEN,
    uciMoves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'],
    result,
    reason: outcome === 'draw' ? 'agreement' : 'checkmate',
    source: 'played',
    takebacks: 0,
    ...rest,
  };
}
