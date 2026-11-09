import type { StockfishBuild } from './builds';
import { EngineCancelled, type Engine, type EngineInfo } from './client';
import type { BotReply, BotRequest, EvalRequest, PositionSpec } from './engine';
import { getLevel } from './levels';
import { UciSession, goCommand, positionCommand, whiteToMoveAfter, type GoLimits, type UciTransport } from './uci';

export const MIN_UCI_ELO = 1320;
export const MAX_UCI_ELO = 3190;
/** Sent before every ordinary search so a strength-limited game can never leave the limiter switched on for analysis. */
const FULL_STRENGTH = ['setoption name UCI_LimitStrength value false'];

/** How long fetching the engine's WebAssembly may take before we give up on Stockfish. */
const FETCH_TIMEOUT_MS = 20_000;

/**
 * Runs a Stockfish.js build as a Web Worker and speaks UCI to it over `postMessage` (plain strings).
 *
 * The main thread fetches the .wasm itself and hands the worker a local blob URL (the documented Stockfish.js override,
 * a URL in the script's hash). That matters for three reasons:
 *  - Failure is detected at once. If the worker fetched the file and failed, the engine would only leave an unhandled
 *    promise rejection inside the worker, which is never reported to the page, and analysis would hang until a timeout.
 *  - It works offline exactly like the rest of the app: the fetch is answered by the service worker's precache.
 *  - The blob carries the right `application/wasm` type, so a static host that serves .wasm as something else still works.
 */
export async function workerTransport(build: StockfishBuild): Promise<UciTransport> {
  if (typeof WebAssembly !== 'object') throw new Error('this browser does not support WebAssembly');
  const wasmUrl = build.wasmUrl ?? build.scriptUrl.replace(/\.js$/i, '.wasm');
  let bytes: ArrayBuffer;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(wasmUrl, { signal: abort.signal });
    if (!res.ok) throw new Error(`the engine file was not found (HTTP ${res.status})`);
    bytes = await res.arrayBuffer();
  } catch (e) {
    const why = abort.signal.aborted ? 'timed out' : e instanceof Error ? e.message : String(e);
    throw new Error(`The Stockfish engine file could not be loaded (${why})`);
  } finally {
    clearTimeout(timer);
  }
  let blobUrl: string | null = URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }));
  const release = () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
  };
  const worker = new Worker(`${build.scriptUrl}#${encodeURIComponent(blobUrl)}`);
  let onLine: (line: string) => void = () => undefined;
  let onError: (e: Error) => void = () => undefined;
  worker.onmessage = (ev: MessageEvent<unknown>) => {
    release(); // any output means the engine has loaded its WebAssembly
    if (typeof ev.data === 'string') onLine(ev.data);
  };
  worker.onerror = (ev) => {
    release();
    onError(new Error(ev.message || 'The Stockfish worker failed to start'));
  };
  return {
    send: (line) => worker.postMessage(line),
    setHandler: (h) => {
      onLine = h;
    },
    setErrorHandler: (h) => {
      onError = h;
    },
    terminate: () => {
      release();
      worker.terminate();
    },
  };
}

export interface StockfishClientOptions {
  /** Replaces the Worker transport (used by tests). */
  transport?: (build: StockfishBuild) => UciTransport | Promise<UciTransport>;
  /** How long the engine may take to start after its files are loaded. Default 15 s. */
  initTimeoutMs?: number;
}

/**
 * The Stockfish engine behind the same `Engine` interface the built-in engine uses.
 *
 * - The WebAssembly is loaded lazily on first use and kept for the life of the page, so a position change costs a
 *   `stop` message, not a reload. Cancelling never produces a stale answer.
 * - If Stockfish cannot start (no WebAssembly, files missing, worker error) the client remembers why and rejects
 *   every later request, so the caller can fall back to the built-in engine instead of retrying forever.
 */
export class StockfishClient implements Engine {
  readonly info: EngineInfo;
  private session: UciSession | null = null;
  private starting: Promise<UciSession> | null = null;
  private failure: Error | null = null;
  /** Bumped by cancel(); a request that started before the bump must not run or resolve. */
  private epoch = 0;
  private readonly pending = new Set<(e: Error) => void>();

  constructor(
    readonly build: StockfishBuild,
    private readonly options: StockfishClientOptions = {},
  ) {
    this.info = { id: build.id, name: build.name, kind: 'stockfish' };
  }

  /** Why Stockfish cannot be used on this device right now, or null if it can (or has not been tried yet). */
  get unavailableReason(): string | null {
    return this.failure ? this.failure.message : null;
  }

  /** True once the engine has started and answered the UCI handshake. */
  get isReady(): boolean {
    return this.session !== null && !this.session.isDead;
  }

  private ensureSession(): Promise<UciSession> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.session && !this.session.isDead) return Promise.resolve(this.session);
    if (this.starting) return this.starting;
    this.starting = (async () => {
      try {
        const make = this.options.transport ?? workerTransport;
        const session = new UciSession(await make(this.build), { initTimeoutMs: this.options.initTimeoutMs ?? 15_000 });
        await session.init();
        this.session = session;
        return session;
      } catch (e) {
        this.failure = e instanceof Error ? e : new Error(String(e));
        throw this.failure;
      } finally {
        this.starting = null;
      }
    })();
    return this.starting;
  }

  /** Run `job` once the engine is up; rejects immediately (not after loading) if cancelled in the meantime. */
  private run(job: (session: UciSession) => Promise<BotReply>): Promise<BotReply> {
    return new Promise<BotReply>((resolve, reject) => {
      const myEpoch = this.epoch;
      this.pending.add(reject);
      (async () => {
        const session = await this.ensureSession();
        if (myEpoch !== this.epoch) throw new EngineCancelled();
        return job(session);
      })()
        .then(resolve, reject)
        .finally(() => this.pending.delete(reject));
    });
  }

  private async search(session: UciSession, spec: PositionSpec, limits: GoLimits, options: string[] = FULL_STRENGTH): Promise<BotReply> {
    const r = await session.search({
      options,
      position: positionCommand(spec.startFen, spec.moves),
      go: goCommand(limits),
      whiteToMove: whiteToMoveAfter(spec.startFen, spec.moves),
      timeoutMs: (limits.movetimeMs ?? 1000) + 5000,
    });
    return { uci: r.bestMove, scoreCp: r.scoreCp, mate: r.mate, depth: r.depth, nodes: r.nodes, pv: r.pv, engine: this.info.name };
  }

  /**
   * Stockfish's best move within the time budget of the requested level. Level strength, mistake temperature and
   * playing style are features of the built-in engine and are NOT applied here, so this is not one of the rated
   * bots. It exists for features that want the strongest available move (hints, review), not for rated games.
   */
  chooseMove(req: BotRequest): Promise<BotReply> {
    const level = req.levelSpec ?? getLevel(req.level);
    return this.run((s) => this.search(s, req, { movetimeMs: level.limits.maxTimeMs }));
  }

  /**
   * A move from Stockfish with its own strength limiter (`UCI_LimitStrength` / `UCI_Elo`). Used for the stronger bot levels.
   * The Elo value is Stockfish's own scale, which is not a human rating (see docs/bots.md).
   */
  chooseLimited(spec: PositionSpec, elo: number, movetimeMs: number): Promise<BotReply> {
    const e = Math.max(MIN_UCI_ELO, Math.min(MAX_UCI_ELO, Math.round(elo)));
    return this.run((s) => this.search(s, spec, { movetimeMs }, [`setoption name UCI_LimitStrength value true`, `setoption name UCI_Elo value ${e}`]));
  }

  evaluate(req: EvalRequest): Promise<BotReply> {
    return this.run((s) =>
      this.search(s, req, { depth: Math.max(req.depth, this.build.minAnalysisDepth), movetimeMs: req.maxTimeMs }),
    );
  }

  cancel(): void {
    this.epoch++;
    const err = new EngineCancelled();
    for (const reject of this.pending) reject(err);
    this.pending.clear();
    this.session?.cancel(err);
  }

  dispose(): void {
    this.cancel();
    this.session?.dispose();
    this.session = null;
  }
}
