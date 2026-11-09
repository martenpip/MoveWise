/**
 * The MoveWise Rating: a provisional strength estimate for the player, computed locally with Glicko-2 from finished
 * competitive games against MoveWise's bots.
 *
 * Honest limits (also shown in the app):
 *  - It is NOT a FIDE, national or online (Lichess / Chess.com) rating and is not comparable to them.
 *  - Bot ratings are approximate. Levels from 1400 up are Stockfish with its own strength limiter, whose Elo scale is the
 *    engine's, not a human one; the levels below are MoveWise's built-in engine, placed on that scale by games against
 *    Stockfish at 1320 and against each other (docs/bots.md lists the evidence and its uncertainty).
 *  - Only competitive bots (1000 and above) count. Practice bots (100 to 900) and Trainer games never change the rating.
 *  - Playing style / personality is not rated separately (it was not calibrated).
 *
 * The rating is derived from the saved games every time, so it can never drift from the data.
 */
import { START_FEN } from '../chess/types';
import { COMPETITIVE_FROM, LEVELS, findLevel } from '../engine/levels';
import { LADDER_RD } from '../engine/ladderCalibration';
import type { SavedGame } from '../storage/types';
import { GLICKO_DEFAULTS, glicko2Update, type GlickoState } from './glicko2';
import type { Profile } from './types';

/** Where a new player's rating starts, with maximum uncertainty. A convention, not a measurement. */
export const PLAYER_START_RATING = 800;
export const MIN_PLIES_RATED = 4;
export const PROVISIONAL_GAMES = 10;
export const PROVISIONAL_RD = 120;

const START_KEY = START_FEN.split(' ').slice(0, 4).join(' ');

export interface BotStrength {
  rating: number;
  /** One standard error of the calibration, used as the opponent's rating deviation. */
  rd: number;
}

export function botStrength(levelId: string): BotStrength | null {
  const level = findLevel(levelId);
  if (!level) return null;
  return { rating: level.rating, rd: LADDER_RD[level.backend] };
}

export type Ineligible =
  | 'imported'
  | 'no-human-side'
  | 'unfinished'
  | 'custom-start'
  | 'takebacks'
  | 'too-short'
  | 'unknown-level'
  | 'before-reset'
  | 'practice-bot'
  | 'trainer';

export const INELIGIBLE_TEXT: Record<Ineligible, string> = {
  imported: 'Imported game',
  'no-human-side': 'No player side recorded',
  unfinished: 'Not finished',
  'custom-start': 'Started from a custom position',
  takebacks: 'Take-backs were used',
  'too-short': 'Too short to rate',
  'unknown-level': 'Unknown opponent level',
  'before-reset': 'Before the rating was restarted',
  'practice-bot': 'Practice bot (below 1000), not rated',
  trainer: 'Played with the Trainer, not rated',
};

/** Why a game does not count toward the rating, or null if it does. */
export function ineligibleReason(g: SavedGame, epoch = 0): Ineligible | null {
  if (g.source !== 'played') return 'imported';
  if (!g.human) return 'no-human-side';
  if (g.result === '*') return 'unfinished';
  if (g.startFen.split(' ').slice(0, 4).join(' ') !== START_KEY) return 'custom-start';
  if ((g.takebacks ?? 0) > 0) return 'takebacks';
  if (g.uciMoves.length < MIN_PLIES_RATED) return 'too-short';
  if (!g.botLevel || !botStrength(g.botLevel)) return 'unknown-level';
  if (g.mode === 'trainer') return 'trainer';
  if (findLevel(g.botLevel)!.rating < COMPETITIVE_FROM) return 'practice-bot';
  if (g.createdAt < epoch) return 'before-reset';
  return null;
}

export type Outcome = 'win' | 'loss' | 'draw';

/** Result of a finished game from the human's side, or null when it has no human side or is unfinished. */
export function outcomeOf(g: SavedGame): Outcome | null {
  if (!g.human || g.result === '*') return null;
  if (g.result === '1/2-1/2') return 'draw';
  const whiteWon = g.result === '1-0';
  return (g.human === 'white') === whiteWon ? 'win' : 'loss';
}

export interface RatingPoint {
  gameId: string;
  at: number;
  before: number;
  after: number;
  delta: number;
  rdAfter: number;
  opponentLevel: string;
  opponentRating: number;
  score: number;
}

export type Confidence = 'unrated' | 'provisional' | 'established';

export interface RatingSummary {
  ratedGames: number;
  current: number;
  rd: number;
  confidence: Confidence;
  peak: number;
  peakAt: number | null;
  /** Change caused by the most recent rated game, or null with no games. */
  lastDelta: number | null;
  /** ~95% range: current ± 2·RD. */
  low: number;
  high: number;
  history: RatingPoint[];
}

export function buildRating(games: SavedGame[], profile: Pick<Profile, 'ratingEpoch'> = { ratingEpoch: 0 }): RatingSummary {
  const eligible = games
    .filter((g) => ineligibleReason(g, profile.ratingEpoch) === null)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  let state: GlickoState = { rating: PLAYER_START_RATING, rd: GLICKO_DEFAULTS.initialRd, vol: GLICKO_DEFAULTS.initialVol };
  const history: RatingPoint[] = [];
  let peak = PLAYER_START_RATING;
  let peakAt: number | null = null;

  for (const g of eligible) {
    const bot = botStrength(g.botLevel!)!;
    const outcome = outcomeOf(g)!;
    const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
    const before = state.rating;
    state = glicko2Update(state, [{ opponentRating: bot.rating, opponentRd: bot.rd, score }]);
    history.push({
      gameId: g.id,
      at: g.createdAt,
      before,
      after: state.rating,
      delta: state.rating - before,
      rdAfter: state.rd,
      opponentLevel: g.botLevel!,
      opponentRating: bot.rating,
      score,
    });
    if (state.rating > peak) {
      peak = state.rating;
      peakAt = g.createdAt;
    }
  }

  const n = history.length;
  const confidence: Confidence = n === 0 ? 'unrated' : n < PROVISIONAL_GAMES || state.rd > PROVISIONAL_RD ? 'provisional' : 'established';
  return {
    ratedGames: n,
    current: state.rating,
    rd: state.rd,
    confidence,
    peak,
    peakAt,
    lastDelta: n ? history[n - 1]!.delta : null,
    low: state.rating - 2 * state.rd,
    high: state.rating + 2 * state.rd,
    history,
  };
}

/** The bot level whose rating is closest to (and not far below) the player's, for "recommended opponent". */
export function suggestedLevel(rating: number): string {
  let best = LEVELS[0]!.id;
  let bestGap = Infinity;
  for (const l of LEVELS) {
    if (l.category !== 'competitive') continue;
    const s = botStrength(l.id);
    if (!s) continue;
    // Aim slightly above the player so games are competitive but winnable.
    const gap = Math.abs(s.rating - (rating + 40));
    if (gap <= bestGap) {
      best = l.id;
      bestGap = gap;
    }
  }
  return best;
}

export const roundRating = (r: number): number => Math.round(r);
