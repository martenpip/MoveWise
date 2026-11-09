/**
 * Puzzle data model.
 *
 * A puzzle is stored exactly as the Lichess puzzle database stores it: the FEN is the position BEFORE the opponent's
 * last move, and `moves` is [opponent's move, your move, opponent's reply, your move, ...] in UCI. The solver plays the
 * first move for the opponent, so what the player sees is the position the puzzle is really about.
 */
export const PACK_FORMAT = 'movewise-puzzle-pack';
export const PACK_VERSION = 1;

export interface Puzzle {
  /** Unique across packs, e.g. "li:00008" (the Lichess puzzle id with a prefix). */
  id: string;
  fen: string;
  /** UCI moves: opponent's setup move first, then alternating, ending with the player's move. */
  moves: string[];
  rating: number;
  /** Rating deviation published with the rating (uncertainty of the puzzle's own difficulty). */
  rd: number;
  /** Lichess theme keys that are kept (motifs, mates, phases). */
  themes: string[];
  /** Id of the pack this puzzle came from (filled in when loaded). */
  pack: string;
  /** Tactical puzzles have a forced, checkable solution. Strategic exercises are not included in any bundled pack. */
  kind: 'tactic';
  /** Set for exercises made from the player's own games (never part of a pack, never rated). */
  custom?: { gameId: string; ply: number; /** False for unscored learning positions. */ scored: boolean; played: string };
}

/** What is written in a pack file (compact form). */
export interface PackPuzzle {
  id: string;
  fen: string;
  /** Space-separated UCI moves. */
  moves: string;
  rating: number;
  rd: number;
  themes: string[];
}

export interface PackInfo {
  id: string;
  name: string;
  description: string;
  license: string;
  /** Human-readable credit and provenance lines, shown in the app. */
  attribution: string;
  source: string;
  version: number;
  createdAt: string;
}

export interface PuzzlePack extends PackInfo {
  format: typeof PACK_FORMAT;
  formatVersion: number;
  puzzles: PackPuzzle[];
}

export const BUNDLED_PACK_ID = 'lichess-starter';
