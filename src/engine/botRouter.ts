import { EngineCancelled, type Engine } from './client';
import type { BotReply, BotRequest } from './engine';
import { getLevel } from './levels';
import type { StockfishClient } from './stockfish';

/** Thrown when a level needs Stockfish and Stockfish cannot run here. The app never plays a different, weaker engine in its place. */
export class StockfishUnavailable extends Error {
  constructor(why: string) {
    super(`This opponent needs the Stockfish engine, which could not start on this device (${why}). Choose a level up to 1300, which uses MoveWise's built-in engine.`);
    this.name = 'StockfishUnavailable';
  }
}

/**
 * Chooses who plays a bot's move. Levels up to 1300 are played by the built-in engine; levels from 1400 are played by Stockfish with
 * its own strength limiter. They are on separate engine instances from analysis, so a bot's search never interrupts an evaluation.
 */
export class BotRouter {
  constructor(
    private readonly builtin: Engine,
    private readonly stockfish: StockfishClient | null,
  ) {}

  /** True when this copy of MoveWise includes Stockfish at all (it may still fail to start). */
  get hasStockfish(): boolean {
    return this.stockfish !== null;
  }

  get stockfishProblem(): string | null {
    if (!this.stockfish) return 'this copy of MoveWise does not include Stockfish';
    return this.stockfish.unavailableReason;
  }

  chooseMove(req: BotRequest): Promise<BotReply> {
    const level = getLevel(req.level);
    if (level.backend === 'builtin') return this.builtin.chooseMove({ ...req, level: level.id });
    if (!this.stockfish) return Promise.reject(new StockfishUnavailable(this.stockfishProblem ?? 'no engine'));
    return this.stockfish
      .chooseLimited(req, level.elo!, level.movetimeMs!)
      .then((r) => ({ ...r, engine: `Stockfish (limited to ${level.elo})` }))
      .catch((e: unknown) => {
        if (e instanceof EngineCancelled) throw e;
        if (this.stockfish!.unavailableReason) throw new StockfishUnavailable(this.stockfish!.unavailableReason);
        throw e;
      });
  }

  cancel(): void {
    this.builtin.cancel();
    this.stockfish?.cancel();
  }

  dispose(): void {
    this.builtin.dispose();
    this.stockfish?.dispose();
  }
}
