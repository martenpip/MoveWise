/**
 * Game Review: the stored record and the shapes derived from it.
 *
 * What is STORED is only what an engine actually said about each position (`GameReview`). Everything else
 * (move classes, accuracy, ACPL, critical moments, explanations, the summary) is recomputed from it by pure
 * functions in this folder, so the formulas can be inspected, tested and improved without re-running the engine,
 * and nothing shown can drift away from the engine's real output.
 */

/** Centipawn value used for forced mates and checkmate. Same scale as the UCI layer's `MATE_SCORE`. */
export const MATE_CP = 30000;

/** Version of the stored review format. */
export const REVIEW_VERSION = 1;

export type Side = 'white' | 'black';

/** What the engine said about one position. All numbers are from WHITE's point of view. */
export interface PositionEval {
  /** Centipawns (±MATE_CP for a forced mate or a checkmate on the board). */
  cp: number;
  /** Signed distance to a forced mate in moves (positive: White mates, negative: Black mates), else null. */
  mate: number | null;
  /** The engine's preferred move here (UCI), or '' when the game is over in this position. */
  best: string;
  /** The engine's expected continuation, starting with `best` (UCI, at most MAX_PV_PLIES). */
  pv: string[];
  /** Search depth actually reached (0 for positions that were not searched). */
  depth: number;
  /** Index into `GameReview.engines`: which engine produced this entry. */
  e: number;
  /** True when the game is over in this position (checkmate, stalemate, a draw rule): decided by the rules, not searched. */
  final?: true;
}

export const MAX_PV_PLIES = 10;

/** Activity id of a game's review record. Fixed per game, so reviewing again replaces the record instead of adding another. */
export const reviewEventId = (gameId: string): string => `review:${gameId}`;

/** Name recorded for positions the rules of chess decided (checkmate, stalemate, a draw rule); no engine is involved. */
export const RULES_ENGINE = 'Rules of chess';

/** Engines that actually searched (the rules entry removed). */
export const searchEngines = (engines: readonly string[]): string[] => engines.filter((e) => e !== RULES_ENGINE);

export type ReviewPreset = 'quick' | 'standard' | 'thorough';

export interface ReviewSettings {
  preset: ReviewPreset;
  /** Time limit per position. The engine also stops at its own minimum depth if that comes first. */
  movetimeMs: number;
  /** Depth requested (Stockfish builds apply their own minimum on top). */
  depth: number;
}

export const REVIEW_PRESETS: Record<ReviewPreset, ReviewSettings & { label: string; hint: string }> = {
  quick: { preset: 'quick', movetimeMs: 500, depth: 14, label: 'Quick', hint: 'about half a second per position' },
  standard: { preset: 'standard', movetimeMs: 1200, depth: 16, label: 'Standard', hint: 'about a second per position' },
  thorough: { preset: 'thorough', movetimeMs: 3000, depth: 20, label: 'Thorough', hint: 'up to 3 seconds per position' },
};

/** A stored review of one saved game. `positions[i]` is the position after `i` half-moves (0 = the start). */
export interface GameReview {
  version: typeof REVIEW_VERSION;
  gameId: string;
  createdAt: number;
  updatedAt: number;
  /** Copy of the game that was analysed, so a review can always be checked against what it was computed from. */
  startFen: string;
  moves: string[];
  /** Display names of the engines that produced entries (see `PositionEval.e`). */
  engines: string[];
  settings: ReviewSettings;
  /** `moves.length + 1` entries; null where not analysed yet (an unfinished review). */
  positions: Array<PositionEval | null>;
  complete: boolean;
  /** Whose moves the personal summary and the Profile statistics are about; null = no personal view (e.g. someone else's game). */
  perspective: Side | null;
}

/* ---------------------------- derived shapes ---------------------------- */

export type Phase = 'opening' | 'middlegame' | 'endgame';
export const PHASES: readonly Phase[] = ['opening', 'middlegame', 'endgame'];

/**
 * - forced:      the only legal move; not a decision, never counted.
 * - best:        the engine's first choice, or within 1 point of win chance of it.
 * - good:        loses less than 5 points of win chance.
 * - inaccuracy:  loses 5 to under 10 points.
 * - mistake:     loses 10 to under 15 points.
 * - blunder:     loses 15 points or more.
 */
export type MoveClass = 'forced' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';
export const MOVE_CLASSES: readonly MoveClass[] = ['forced', 'best', 'good', 'inaccuracy', 'mistake', 'blunder'];

/**
 * Facts the engine's own lines and the rules engine support. A tag is attached only when its condition holds
 * for the move (see facts.ts); none of them is a guess about what the player was thinking.
 */
export type Tag =
  | 'hung-piece' //          the moved piece (not a pawn) can be captured and material is lost along the engine's line
  | 'lost-material' //       the engine's line after the move loses material, but not by capturing the piece just moved
  | 'missed-capture' //      the engine's best line wins material that the played move does not
  | 'missed-mate' //         a forced mate was available and is gone after the move
  | 'allowed-mate' //        the move allows a forced mate that was not there before
  | 'threw-away-advantage' // a clear advantage was reduced to roughly level
  | 'found-tactic' //        the played move IS the engine's choice and wins material or mates
  | 'found-mate';

export const WEAKNESS_TAGS: readonly Tag[] = ['hung-piece', 'lost-material', 'missed-capture', 'missed-mate', 'allowed-mate', 'threw-away-advantage'];
