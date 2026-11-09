/**
 * Judging a move that is not the stored one. The stored line is one way to solve a puzzle, not necessarily the only way, so
 * the app asks the engine (Stockfish when available) to compare the player's move with the stored move, in the player's
 * favour or not. The same call produces the engine's best reply to a failed move, which is what "Why does my move fail?" shows.
 *
 * Rules, stated in the interface:
 *  - Mate puzzles: accepted only if the move still forces mate no later than the stored line does.
 *  - Other puzzles: accepted if the engine scores the move within 50 centipawns of the stored move, or if both leave the
 *    player clearly winning (at least +6 pawns). Otherwise it is not accepted and the refutation is shown on request.
 */
import type { BotReply, EvalRequest } from '../engine/engine';
import { buildLine, type Line } from '../review/facts';
import { Position } from '../chess/position';
import type { PuzzleSession } from './solver';

export interface JudgeEngine {
  evaluate(req: EvalRequest): Promise<BotReply>;
}

export interface Judgement {
  accept: boolean;
  /** Evaluations from the player's point of view, in centipawns (mate = ±30000 minus distance). Null if unavailable. */
  played: number | null;
  stored: number | null;
  /** Engine's best continuation after the player's move (starting with the opponent's reply). */
  refutation: Line | null;
  engine: string | null;
  reason: string;
}

const MATE = 30000;
const view = (r: BotReply, white: boolean): number => {
  const v = r.mate !== null ? (r.mate > 0 ? MATE - r.mate : -MATE - r.mate) : r.scoreCp;
  return white ? v : -v;
};

export async function judgeAlternative(session: PuzzleSession, uci: string, engine: JudgeEngine, opts: { movetimeMs?: number } = {}): Promise<Judgement> {
  const stored = session.expected;
  const fen = session.fen;
  const white = session.playerColor === 0;
  const t = opts.movetimeMs ?? 700;
  const none: Judgement = { accept: false, played: null, stored: null, refutation: null, engine: null, reason: 'The engine could not be reached, so only the stored solution is accepted.' };
  if (!stored) return none;
  try {
    const after = await engine.evaluate({ startFen: fen, moves: [uci], depth: 14, maxTimeMs: t });
    const ref = await engine.evaluate({ startFen: fen, moves: [stored], depth: 14, maxTimeMs: t });
    const played = view(after, white);
    const storedScore = view(ref, white);
    const posAfter = new Position(fen);
    const m = posAfter.parseUci(uci);
    if (m !== undefined) posAfter.makeMove(m);
    const refutation = buildLine(posAfter.toFen(), after.pv, 6);
    const isMatePuzzle = session.puzzle.themes.some((x) => x === 'mate' || /^mateIn\d$/.test(x));
    let accept: boolean;
    let reason: string;
    if (isMatePuzzle) {
      const mateIn = after.mate !== null && (white ? after.mate < 0 : after.mate > 0) ? Math.abs(after.mate) : null;
      accept = mateIn !== null && mateIn <= session.remaining - 1;
      reason = accept ? `The engine confirms this also forces mate in ${(mateIn ?? 0) + 1}.` : 'This does not force checkmate as quickly as the stored solution.';
    } else {
      accept = played >= storedScore - 50 || (played >= 600 && storedScore >= 600);
      reason = accept
        ? 'The engine rates this about as well as the stored solution.'
        : `The engine rates this clearly worse for you than the stored solution (${fmt(played)} against ${fmt(storedScore)}).`;
    }
    return { accept, played, stored: storedScore, refutation, engine: after.engine ?? null, reason };
  } catch {
    return none;
  }
}

export function fmt(cp: number): string {
  if (Math.abs(cp) >= MATE - 100) return `mate in ${MATE - Math.abs(cp)}${cp < 0 ? ' against you' : ''}`;
  return `${cp >= 0 ? '+' : '−'}${(Math.abs(cp) / 100).toFixed(1)}`;
}
