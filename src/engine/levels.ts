import { STYLES, type Style } from './eval';
import type { SearchLimits } from './search';

export type BotCategory = 'practice' | 'competitive';

export interface Level {
  id: string;
  name: string;
  /** Plain-language description of how this level really works. */
  how: string;
  limits: SearchLimits;
  /**
   * Softmax temperature in centipawns used to choose among root moves.
   * 0 = always the best move found. Higher = more willing to play inferior moves.
   */
  temperature: number;
  /** Approximate MoveWise bot rating (100 to 2500). See docs/bots.md for how it was measured and how far to trust it. */
  rating: number;
  /** Practice bots (below 1000) never change the MoveWise Rating; competitive bots (1000 and above) do. */
  category: BotCategory;
  /** Which engine plays this level. Stockfish levels use its own strength limiter (UCI_Elo) and need the Stockfish files. */
  backend: 'builtin' | 'stockfish';
  /** Stockfish's UCI_Elo for this level (Stockfish levels only). */
  elo?: number;
  /** Time per move for Stockfish levels. */
  movetimeMs?: number;
}

/** Ratings of the ladder: 100 to 2500 in steps of 100. */
export const RATING_STEPS: readonly number[] = Array.from({ length: 25 }, (_, i) => (i + 1) * 100);
/** Practice below this rating, competitive from it. */
export const COMPETITIVE_FROM = 1000;
/** The first level played by Stockfish; below it the built-in engine plays. Stockfish's limiter cannot go under 1320. */
export const STOCKFISH_FROM = 1400;
export const STOCKFISH_MOVETIME_MS = 400;

/** Search limits per depth, as used by the calibration family (scripts/calibration/family.mts). */
const BY_DEPTH: Record<number, { nodes: number; ms: number }> = {
  1: { nodes: 2_000, ms: 300 },
  2: { nodes: 6_000, ms: 400 },
  3: { nodes: 20_000, ms: 600 },
  4: { nodes: 60_000, ms: 900 },
};

/**
 * The built-in rungs (100 to 1300): search depth and mistake temperature. Each pair was read off a strength curve fitted to about
 * 600 games between 22 configurations of the built-in engine (see docs/bots.md and scripts/calibration/), with the top of the
 * curve anchored to Stockfish's strength limiter. Values between measured configurations are interpolated on that curve (log of
 * temperature), then checked with rung-against-rung games. They are approximate MoveWise bot ratings, not Elo or FIDE ratings.
 */
const BUILTIN: Record<number, { depth: number; temperature: number }> = {
  100: { depth: 1, temperature: 109 },
  200: { depth: 2, temperature: 250 },
  300: { depth: 2, temperature: 211 },
  400: { depth: 2, temperature: 174 },
  500: { depth: 2, temperature: 149 },
  600: { depth: 2, temperature: 130 },
  700: { depth: 2, temperature: 114 },
  800: { depth: 2, temperature: 100 },
  900: { depth: 2, temperature: 77 },
  1000: { depth: 2, temperature: 60 },
  1100: { depth: 4, temperature: 80 },
  1200: { depth: 4, temperature: 56 },
  1300: { depth: 4, temperature: 48 },
};

function builtinSpec(rating: number): Pick<Level, 'limits' | 'temperature'> {
  const b = BUILTIN[rating]!;
  const d = BY_DEPTH[b.depth]!;
  return { limits: { maxDepth: b.depth, maxNodes: d.nodes, maxTimeMs: d.ms, quiesce: b.depth > 1 }, temperature: b.temperature };
}

const HOW_BUILTIN = (r: number): string =>
  r <= 300
    ? 'Plays almost at random and often leaves pieces hanging. Good for learning how the pieces move.'
    : r <= 600
      ? 'Looks one move ahead and cannot see recaptures, so it regularly leaves pieces hanging.'
      : r <= 900
        ? 'Looks two moves ahead and still blunders often, but punishes obvious oversights.'
        : r <= 1200
          ? 'Looks three moves ahead. Sees simple tactics but misses deeper ones.'
          : 'Looks four moves ahead with occasional inaccuracies.';

/** The ladder, weakest first. This is the single list of bot levels; every part of the app reads it. */
export const LEVELS: Level[] = RATING_STEPS.map((rating): Level => {
  const category: BotCategory = rating < COMPETITIVE_FROM ? 'practice' : 'competitive';
  if (rating < STOCKFISH_FROM) {
    return { id: `r${rating}`, name: `Bot ${rating}`, how: HOW_BUILTIN(rating), ...builtinSpec(rating), rating, category, backend: 'builtin' };
  }
  return {
    id: `r${rating}`,
    name: `Bot ${rating}`,
    how: `Stockfish, with its strength limiter set to ${rating}. It plays like an engine held back, not like a person of that rating: it is usually sound but can make odd mistakes. MoveWise did not measure this level game by game; its number is Stockfish's own setting.`,
    limits: { maxDepth: 30, maxNodes: 3_000_000, maxTimeMs: STOCKFISH_MOVETIME_MS, quiesce: true },
    temperature: 0,
    rating,
    category,
    backend: 'stockfish',
    elo: rating,
    movetimeMs: STOCKFISH_MOVETIME_MS,
  };
});

/**
 * Levels from earlier versions (which saved games still refer to) and the ladder level each corresponds to. The correspondence is
 * approximate (see docs/bots.md): Advanced was measured against Stockfish, Expert and Maximum were not (they are placed above it); it exists so older games keep a sensible opponent in the Profile and the rating.
 */
export const LEGACY_LEVELS: Record<string, string> = {
  beginner: 'r400',
  easy: 'r700',
  casual: 'r1000',
  intermediate: 'r1400',
  advanced: 'r1800',
  expert: 'r2000',
  max: 'r2000',
};

export const LEGACY_NAMES: Record<string, string> = {
  beginner: 'Complete Beginner',
  easy: 'Easy',
  casual: 'Casual',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
  max: 'Maximum Strength',
};

/** The ladder level for an id, accepting the ids of earlier versions. Unknown ids give the default (Bot 1000). */
export const resolveLevelId = (id: string): string => LEGACY_LEVELS[id] ?? id;
export const findLevel = (id: string): Level | undefined => LEVELS.find((l) => l.id === resolveLevelId(id));
export const getLevel = (id: string): Level => findLevel(id) ?? LEVELS.find((l) => l.id === 'r1000')!;

export interface Personality {
  id: string;
  name: string;
  blurb: string;
  style: Style;
}

export const PERSONALITIES: Personality[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    blurb: 'No particular preference.',
    style: STYLES.balanced!,
  },
  {
    id: 'aggressive',
    name: 'Aggressive attacker',
    blurb: 'Values pieces near your king and likes captures and checks.',
    style: STYLES.aggressive!,
  },
  {
    id: 'defensive',
    name: 'Defensive player',
    blurb: 'Values king safety and solid pawn cover; prefers quiet moves.',
    style: STYLES.defensive!,
  },
  {
    id: 'positional',
    name: 'Positional player',
    blurb: 'Cares about pawn structure and long-term weaknesses.',
    style: STYLES.positional!,
  },
  {
    id: 'tactical',
    name: 'Tactical player',
    blurb: 'Seeks sharp lines with captures and checks.',
    style: STYLES.tactical!,
  },
  {
    id: 'endgame',
    name: 'Endgame specialist',
    blurb: 'Weights king activity and passed pawns heavily once pieces come off.',
    style: STYLES.endgame!,
  },
];

export const getPersonality = (id: string): Personality =>
  PERSONALITIES.find((p) => p.id === id) ?? PERSONALITIES[0]!;
