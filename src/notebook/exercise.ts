/**
 * Practising a Notebook entry: judging a move and giving progressive hints.
 *
 * A move is correct when it is the engine's move recorded with the entry, a move already known to be acceptable, or - when an
 * engine is available - a move whose evaluation is within ACCEPT_LOSS points of win chance of the best move. A reasonable
 * alternative is therefore never marked wrong just because it is not the engine's first choice. When no engine can check
 * another move, the app says so instead of claiming the move is wrong.
 */
import { Position } from '../chess/position';
import { squareName } from '../chess/types';
import { describeMove, pieceWord } from '../review/facts';
import { targetsAfter } from '../puzzles/explain';
import { forSide, winPct } from '../review/score';
import { MATE_CP } from '../review/types';
import type { NotebookEntry } from './types';

/** A move that keeps the evaluation within this many points of win chance of the best move is accepted. */
export const ACCEPT_LOSS = 4;

/** Evaluate the position after `moves` from `fen`. Centipawns from WHITE's point of view, or null when no engine is available. */
export type Evaluator = (fen: string, moves: string[]) => Promise<{ cp: number; mate: number | null } | null>;

export type Judgement =
  | { kind: 'best' }
  | { kind: 'acceptable'; loss: number; via: 'known' | 'engine' }
  | { kind: 'wrong'; reason: 'illegal' | 'played-again' | 'worse' | 'unchecked'; loss: number | null };

export function isLegal(fen: string, uci: string): boolean {
  try {
    return new Position(fen).parseUci(uci) !== undefined;
  } catch {
    return false;
  }
}

export async function judgeMove(entry: NotebookEntry, uci: string, evaluate?: Evaluator): Promise<Judgement> {
  if (!isLegal(entry.fen, uci)) return { kind: 'wrong', reason: 'illegal', loss: null };
  if (uci === entry.best.uci) return { kind: 'best' };
  if (entry.alternatives.includes(uci)) return { kind: 'acceptable', loss: 0, via: 'known' };
  if (entry.played && uci === entry.played.uci) return { kind: 'wrong', reason: 'played-again', loss: entry.winLoss };
  if (!evaluate || entry.evalBefore === null) return { kind: 'wrong', reason: 'unchecked', loss: null };
  let r: Awaited<ReturnType<Evaluator>> = null;
  try {
    r = await evaluate(entry.fen, [uci]);
  } catch {
    r = null;
  }
  if (!r) return { kind: 'wrong', reason: 'unchecked', loss: null };
  const cp = r.mate !== null ? (r.mate > 0 ? MATE_CP : -MATE_CP) : r.cp;
  const after = winPct(forSide(cp, entry.sideToMove));
  const before = winPct(entry.evalBefore);
  const loss = Math.max(0, before - after);
  return loss <= ACCEPT_LOSS ? { kind: 'acceptable', loss, via: 'engine' } : { kind: 'wrong', reason: 'worse', loss };
}

export const MAX_HINT = 3;

export interface NotebookHint {
  level: 1 | 2 | 3;
  text: string;
  /** Square to highlight (level 3 only). */
  square: number | null;
}

function ideaHint(e: NotebookEntry): string {
  if (e.themes.includes('mate') || e.kind === 'missed-mate') return 'There may be a forcing way to end the game here. Look at every check before anything else.';
  if (e.themes.includes('knightFork') || e.themes.includes('fork')) return 'One move can attack two things at once. Look for a piece that can do that.';
  if (e.themes.includes('hangingPiece') || e.kind === 'hung-piece') return 'Before you move, check whether anything is undefended: your pieces and theirs.';
  if (e.kind === 'allowed-mate') return 'Ask what your opponent threatens before you commit. Check their checks and captures first.';
  if (e.tags.includes('threw-away-advantage')) return 'You are doing well here. Choose the move that keeps your advantage, not the first attractive one.';
  return 'Start with the forcing moves: checks, captures and threats, yours and your opponent’s.';
}

export function hintFor(e: NotebookEntry, level: 1 | 2 | 3): NotebookHint {
  if (level === 1) return { level, text: ideaHint(e), square: null };
  const d = describeMove(e.fen, e.best.uci);
  if (!d) return { level, text: 'Look for the move that keeps your position safe and your plans going.', square: null };
  if (level === 2) {
    const targets = targetsAfter(e.fen, e.best.uci);
    let text: string;
    if (d.checkmate) text = 'The winning move gives checkmate.';
    else if (d.captured) text = `Something can be captured on ${squareName(d.to)}. Is it defended, and what happens next?`;
    else if (targets.length) text = `The right move attacks the ${targets.slice(0, 2).join(' and the ')}.`;
    else if (d.check) text = 'The right move gives check, and the check matters.';
    else text = `The key square is ${squareName(d.to)}.`;
    return { level, text, square: null };
  }
  const bits = [d.checkmate ? 'It is checkmate.' : d.check ? 'It gives check.' : '', d.captured ? 'It captures something.' : ''].filter(Boolean);
  return { level, text: `Move the ${pieceWord(d.pieceType)} on ${squareName(d.from)}. ${bits.join(' ')}`.trim(), square: d.from };
}
