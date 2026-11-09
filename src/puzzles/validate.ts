/**
 * Validation of puzzles with MoveWise's own rules engine. Used by the build script (before a pack is packaged) and by
 * the app (before an installed pack, or a puzzle made from a game, is accepted), so nothing is ever shown that the rules
 * of chess do not support.
 */
import { Position } from '../chess/position';
import type { PackPuzzle, Puzzle } from './types';

export interface Checked {
  ok: boolean;
  error?: string;
}

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const MATE_IN = /^mateIn([1-9])$/;

/** True when the position has a side to move that is checkmated. */
export function isCheckmate(pos: Position): boolean {
  return pos.inCheck() && !pos.hasLegalMove();
}

/** Replays the puzzle on the rules engine; reports the first thing that does not hold. */
export function checkPuzzle(p: { id: string; fen: string; moves: string[]; rating: number; themes: string[] }): Checked {
  if (!p.id || p.id.length > 60) return { ok: false, error: 'bad id' };
  if (!Number.isFinite(p.rating) || p.rating < 100 || p.rating > 4000) return { ok: false, error: 'rating out of range' };
  if (p.moves.length < 2 || p.moves.length > 40 || p.moves.length % 2 !== 0) return { ok: false, error: 'solution must start with the opponent and end with the player' };
  let pos: Position;
  try {
    pos = new Position(p.fen);
  } catch {
    return { ok: false, error: 'invalid FEN' };
  }
  if (isCheckmate(pos) || !pos.hasLegalMove()) return { ok: false, error: 'the start position has no moves' };
  for (let i = 0; i < p.moves.length; i++) {
    const u = p.moves[i]!;
    if (!UCI.test(u)) return { ok: false, error: `move ${i + 1} is not UCI` };
    const m = pos.parseUci(u);
    if (m === undefined) return { ok: false, error: `move ${i + 1} (${u}) is illegal` };
    pos.makeMove(m);
  }
  const playerMoves = p.moves.length / 2;
  const mates = p.themes.map((t) => MATE_IN.exec(t)).find((x) => x);
  if (mates && Number(mates[1]) !== playerMoves) return { ok: false, error: `labelled mate in ${mates[1]} but has ${playerMoves} player moves` };
  if ((mates || p.themes.includes('mate')) && !isCheckmate(pos)) return { ok: false, error: 'a mate puzzle must end in checkmate' };
  return { ok: true };
}

export function toPuzzle(p: PackPuzzle, pack: string): Puzzle {
  return { id: p.id, fen: p.fen, moves: p.moves.split(' '), rating: p.rating, rd: p.rd, themes: p.themes, pack, kind: 'tactic' };
}
