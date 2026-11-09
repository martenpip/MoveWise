/**
 * Runs the engine over every position of a game and records what it says. The engine is asked about one position
 * at a time; positions already analysed (from an earlier, interrupted run) are kept, so a review can be resumed.
 * Nothing leaves the device: the engine is the local Stockfish (or, if it cannot start, the built-in engine) and
 * each answer is stored together with the NAME of the engine that gave it.
 */
import { Game } from '../chess/game';
import { EngineCancelled } from '../engine/client';
import type { BotReply, EvalRequest } from '../engine/engine';
import { MATE_CP, MAX_PV_PLIES, REVIEW_VERSION, RULES_ENGINE, type GameReview, type PositionEval, type ReviewSettings, type Side } from './types';

/** The part of an engine the runner needs (satisfied by AnalysisEngine, StockfishClient and test doubles). */
export interface ReviewEngine {
  evaluate(req: EvalRequest): Promise<BotReply>;
  cancel(): void;
}

export interface GameToReview {
  id: string;
  startFen: string;
  uciMoves: string[];
}

export function newReview(game: GameToReview, settings: ReviewSettings, perspective: Side | null, now = Date.now()): GameReview {
  return {
    version: REVIEW_VERSION,
    gameId: game.id,
    createdAt: now,
    updatedAt: now,
    startFen: game.startFen,
    moves: [...game.uciMoves],
    engines: [],
    settings,
    positions: new Array<PositionEval | null>(game.uciMoves.length + 1).fill(null),
    complete: false,
    perspective,
  };
}

/** Convert an engine reply (White's point of view) to the stored form. */
export function toPositionEval(reply: BotReply, engines: string[]): PositionEval {
  const name = reply.engine ?? 'Unknown engine';
  let e = engines.indexOf(name);
  if (e < 0) e = engines.push(name) - 1;
  const mate = reply.mate !== null && reply.mate !== 0 ? reply.mate : null;
  const cp = mate !== null ? (mate > 0 ? MATE_CP : -MATE_CP) : Math.max(-MATE_CP + 1, Math.min(MATE_CP - 1, Math.round(reply.scoreCp)));
  const pv = reply.pv.length ? reply.pv.slice(0, MAX_PV_PLIES) : reply.uci ? [reply.uci] : [];
  return { cp, mate, best: reply.uci || pv[0] || '', pv, depth: reply.depth, e };
}

/** The evaluation of a position where the game is over, decided by the rules (no engine involved). */
export function finalEval(game: Game, engines: string[], engineName = RULES_ENGINE): PositionEval | null {
  const st = game.status();
  if (!st.over || st.reason === 'resignation' || st.reason === 'agreement') return null; // those positions are still live on the board
  let e = engines.indexOf(engineName);
  if (e < 0) e = engines.push(engineName) - 1;
  if (st.reason === 'checkmate') {
    // The side to move is mated, so the other side won.
    const whiteWon = game.turn === 1;
    return { cp: whiteWon ? MATE_CP : -MATE_CP, mate: null, best: '', pv: [], depth: 0, e, final: true };
  }
  return { cp: 0, mate: null, best: '', pv: [], depth: 0, e, final: true };
}

export interface RunOptions {
  engine: ReviewEngine;
  /** Called after every position with how many are done. */
  onProgress?: (done: number, total: number, review: GameReview) => void;
  signal?: AbortSignal;
}

export type RunOutcome = 'complete' | 'cancelled';

/**
 * Analyse the missing positions of `review` in place. Resolves with 'cancelled' (keeping everything done so far)
 * if the signal fires, and rejects if the engine fails outright. Finished reviews are returned unchanged.
 */
export async function runReview(review: GameReview, { engine, onProgress, signal }: RunOptions): Promise<RunOutcome> {
  const total = review.positions.length;
  // Fail early if the stored moves do not replay (the engine is given the move list, so repetition history is right).
  const final = new Game(review.startFen);
  for (const u of review.moves) final.playUci(u);
  const onAbort = () => engine.cancel();
  signal?.addEventListener('abort', onAbort);
  try {
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) return 'cancelled';
      if (review.positions[i]) {
        onProgress?.(review.positions.filter(Boolean).length, total, review);
        continue;
      }
      let result: PositionEval | null = null;
      if (i === total - 1) result = finalEval(final, review.engines);
      if (!result) {
        try {
          const reply = await engine.evaluate({
            startFen: review.startFen,
            moves: review.moves.slice(0, i),
            depth: review.settings.depth,
            maxTimeMs: review.settings.movetimeMs,
          });
          if (signal?.aborted) return 'cancelled';
          result = toPositionEval(reply, review.engines);
        } catch (e) {
          if (e instanceof EngineCancelled || signal?.aborted) return 'cancelled';
          throw e;
        }
      }
      review.positions[i] = result;
      review.updatedAt = Date.now();
      onProgress?.(review.positions.filter(Boolean).length, total, review);
    }
    review.complete = review.positions.every(Boolean);
    return review.complete ? 'complete' : 'cancelled';
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Number of positions analysed so far. */
export const progressOf = (r: GameReview): { done: number; total: number } => ({ done: r.positions.filter(Boolean).length, total: r.positions.length });
