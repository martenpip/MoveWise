/**
 * Checking a move before it is played (the Trainer's warning) and after (its comment).
 *
 * The verdict comes from two engine evaluations of real positions: the position before the move, and the position after it.
 * The loss is measured in points of win chance, with the same thresholds Game Review uses, so the Trainer and the review never
 * disagree about what a blunder is. When the engine is unavailable, or stopped before it searched deeply enough, the result says
 * so and the Trainer stays quiet instead of guessing.
 */
import { Position } from '../chess/position';
import { BLACK, WHITE, type Color } from '../chess/types';
import { settledMaterialChange } from '../review/facts';
import { BLUNDER_AT, classByLoss, forSide, winPct } from '../review/score';
import { MATE_CP } from '../review/types';

export interface TrainerEvaluation {
  /** Centipawns from WHITE's point of view. */
  cp: number;
  /** Moves to mate from White's point of view (negative = Black mates), or null. */
  mate: number | null;
  /** The engine's best move in the position it was asked about. */
  uci: string;
  pv: string[];
  depth: number;
}

/** Evaluate the position reached from `fen` after `moves`. Resolves to null when no engine is available. */
export type TrainerEval = (fen: string, moves: string[]) => Promise<TrainerEvaluation | null>;

/** A verdict needs at least this much search depth. A shallower answer is reported as inconclusive. */
export const MIN_DEPTH = 8;
/** Do not warn about a move in a position that is already close to lost: there is little left to protect. */
export const MIN_WIN_TO_WARN = 10;

export type MoveVerdict = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export type MoveCheck =
  | { status: 'unavailable' }
  | { status: 'inconclusive'; depth: number }
  | {
      status: 'checked';
      verdict: MoveVerdict;
      /** Points of win chance given up by the move (0 to 100). */
      loss: number;
      winBefore: number;
      winAfter: number;
      best: { uci: string; san: string };
      playedUci: string;
      playedSan: string;
      /** The engine's best reply to the move, when it has one. */
      reply: { uci: string; san: string } | null;
      /** Moves until the opponent mates after this move, or null. */
      mateAgainst: number | null;
      /** Material the mover loses along the engine's line (centipawns, 0 or negative), judged once the captures settle. */
      material: number;
      depth: number;
    };

const scoreCp = (e: TrainerEvaluation): number => (e.mate !== null ? (e.mate > 0 ? MATE_CP : -MATE_CP) : e.cp);

function sanOf(fen: string, uci: string): string {
  try {
    const p = new Position(fen);
    const m = p.parseUci(uci);
    return m === undefined ? uci : p.toSan(m);
  } catch {
    return uci;
  }
}

export async function checkMove(fen: string, uci: string, evaluate: TrainerEval): Promise<MoveCheck> {
  let before: TrainerEvaluation | null = null;
  let after: TrainerEvaluation | null = null;
  try {
    before = await evaluate(fen, []);
    if (!before) return { status: 'unavailable' };
    after = uci === before.uci ? before : await evaluate(fen, [uci]);
  } catch {
    return { status: 'unavailable' };
  }
  if (!after) return { status: 'unavailable' };
  const depth = Math.min(before.depth, after.depth);
  if (depth < MIN_DEPTH) return { status: 'inconclusive', depth };

  const side = new Position(fen).turn === WHITE ? 'white' : 'black';
  const mover: Color = side === 'white' ? WHITE : BLACK;
  const winBefore = winPct(forSide(scoreCp(before), side));
  const winAfter = uci === before.uci ? winBefore : winPct(forSide(scoreCp(after), side));
  const loss = uci === before.uci ? 0 : Math.max(0, winBefore - winAfter);
  const replyUci = uci === before.uci ? null : (after.pv[0] ?? null);
  const moverLosing = after.mate !== null && (side === 'white' ? after.mate < 0 : after.mate > 0);
  const line = uci === before.uci ? [] : [uci, ...after.pv];
  const material = line.length ? Math.min(0, settledMaterialChange(fen, line, mover).change) : 0;

  let afterFen = fen;
  try {
    const p = new Position(fen);
    p.makeMove(p.parseUci(uci)!);
    afterFen = p.toFen();
  } catch {
    /* keep fen */
  }
  return {
    status: 'checked',
    verdict: classByLoss(loss),
    loss,
    winBefore,
    winAfter,
    best: { uci: before.uci, san: sanOf(fen, before.uci) },
    playedUci: uci,
    playedSan: sanOf(fen, uci),
    reply: replyUci ? { uci: replyUci, san: sanOf(afterFen, replyUci) } : null,
    mateAgainst: moverLosing ? Math.abs(after.mate!) : null,
    material,
    depth,
  };
}

/** True when the Trainer should stop the player before this move: a serious blunder from a position that was still worth saving. */
export function shouldWarn(check: MoveCheck): boolean {
  return check.status === 'checked' && check.verdict === 'blunder' && check.loss >= BLUNDER_AT && check.winBefore >= MIN_WIN_TO_WARN;
}
