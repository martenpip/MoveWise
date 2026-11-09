import { EngineCancelled, type Engine, type EngineInfo } from './client';
import type { BotReply, BotRequest, EvalRequest } from './engine';

export type EnginePreference = 'stockfish' | 'builtin';

/** A Stockfish engine that can report whether it is usable. `StockfishClient` implements this. */
export interface StockfishLike extends Engine {
  readonly isReady: boolean;
  readonly unavailableReason: string | null;
}

/**
 * The engine behind evaluation and analysis (the evaluation bar, the Analysis board and game replay).
 *
 * It uses Stockfish when the person prefers it and it works, and the built-in engine otherwise: if Stockfish cannot
 * start or fails during a request, that request is answered by the built-in engine and Stockfish is not retried for
 * the rest of the page's life, so analysis never breaks. Bots are NOT routed through here: rated games keep using
 * the built-in engine, whose level strengths the rating is calibrated against.
 */
export class AnalysisEngine implements Engine {
  private failure: Error | null = null;

  constructor(
    private readonly builtin: Engine,
    private readonly stockfish: StockfishLike | null,
    private preference: EnginePreference = 'stockfish',
  ) {}

  /** The engine that will answer the next request. */
  get info(): EngineInfo {
    return this.usesStockfish() ? this.stockfish!.info : this.builtin.info;
  }

  get hasStockfish(): boolean {
    return this.stockfish !== null;
  }

  get stockfishInfo(): EngineInfo | null {
    return this.stockfish ? this.stockfish.info : null;
  }

  /** True once Stockfish has started successfully (it loads the first time analysis is used). */
  get stockfishReady(): boolean {
    return this.stockfish !== null && this.failure === null && this.stockfish.isReady;
  }

  getPreference(): EnginePreference {
    return this.preference;
  }

  setPreference(p: EnginePreference): void {
    if (p === this.preference) return;
    this.cancel();
    this.preference = p;
  }

  /** Why Stockfish is not being used even though it is preferred, or null. */
  get stockfishProblem(): string | null {
    if (!this.stockfish) return 'This copy of MoveWise does not include Stockfish.';
    return this.failure ? this.failure.message : this.stockfish.unavailableReason;
  }

  private usesStockfish(): boolean {
    return this.preference === 'stockfish' && this.stockfish !== null && this.failure === null && this.stockfish.unavailableReason === null;
  }

  private async answer(request: (e: Engine) => Promise<BotReply>): Promise<BotReply> {
    if (this.usesStockfish()) {
      try {
        return await request(this.stockfish!);
      } catch (e) {
        if (e instanceof EngineCancelled) throw e;
        this.failure = e instanceof Error ? e : new Error(String(e));
      }
    }
    return request(this.builtin);
  }

  evaluate(req: EvalRequest): Promise<BotReply> {
    return this.answer((e) => e.evaluate(req));
  }

  chooseMove(req: BotRequest): Promise<BotReply> {
    return this.answer((e) => e.chooseMove(req));
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

/* ------------------------------ Preference ------------------------------ */

const PREF_KEY = 'mw-analysis-engine';

/**
 * The saved choice, read from localStorage like the theme. It is deliberately NOT part of the stored settings or the
 * backup file, so the data formats are unchanged. Anything unreadable means "stockfish" (used only if it works).
 */
export function loadEnginePreference(storage: Pick<Storage, 'getItem'> | undefined = safeLocalStorage()): EnginePreference {
  try {
    return storage?.getItem(PREF_KEY) === 'builtin' ? 'builtin' : 'stockfish';
  } catch {
    return 'stockfish';
  }
}

export function saveEnginePreference(p: EnginePreference, storage: Pick<Storage, 'setItem'> | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(PREF_KEY, p);
  } catch {
    /* storage blocked: the choice simply lasts until the page closes */
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
