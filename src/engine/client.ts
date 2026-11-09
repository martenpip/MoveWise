import type { BotReply, BotRequest, EvalRequest } from './engine';
import type { WorkerRequest, WorkerResponse } from './worker';

export class EngineCancelled extends Error {
  constructor() {
    super('Engine request cancelled');
  }
}

/** What an engine is, in words the interface can show. Never claim more than the engine really is. */
export interface EngineInfo {
  id: string;
  /** Shown next to evaluations, e.g. "Stockfish 19 (lite)". */
  name: string;
  kind: 'builtin' | 'stockfish';
}

/**
 * The seam between the app and any engine. `EngineClient` (the built-in engine) and `StockfishClient` both
 * implement it, so pages never care which one answers, and further Stockfish builds can be added behind it.
 *
 * Contract: `cancel()` rejects every pending request immediately with `EngineCancelled`, and a cancelled request
 * can never resolve afterwards. `dispose()` releases all resources.
 */
export interface Engine {
  readonly info: EngineInfo;
  chooseMove(payload: BotRequest): Promise<BotReply>;
  evaluate(payload: EvalRequest): Promise<BotReply>;
  cancel(): void;
  dispose(): void;
}

export const BUILTIN_ENGINE_INFO: EngineInfo = { id: 'builtin', name: 'Built-in engine', kind: 'builtin' };

interface Pending {
  resolve: (r: BotReply) => void;
  reject: (e: Error) => void;
}

/**
 * Talks to the engine Web Worker. The search itself is synchronous inside the worker,
 * so cancellation terminates the worker and starts a fresh one — this guarantees the
 * interface is never blocked and a stale answer can never arrive after a cancel.
 */
export class EngineClient implements Engine {
  readonly info: EngineInfo = BUILTIN_ENGINE_INFO;
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(private readonly workerUrl: string) {}

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(this.workerUrl);
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve({ ...msg.reply, engine: this.info.name });
      else p.reject(new Error(msg.error));
    };
    w.onerror = (ev) => {
      const err = new Error(ev.message || 'Engine worker failed');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    this.worker = w;
    return w;
  }

  private send(req: Omit<WorkerRequest, 'id'>): Promise<BotReply> {
    const id = this.nextId++;
    const w = this.ensureWorker();
    return new Promise<BotReply>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  chooseMove(payload: BotRequest): Promise<BotReply> {
    return this.send({ kind: 'move', payload });
  }

  evaluate(payload: EvalRequest): Promise<BotReply> {
    return this.send({ kind: 'eval', payload });
  }

  /** Abort all running work immediately. */
  cancel(): void {
    const err = new EngineCancelled();
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  dispose(): void {
    this.cancel();
  }
}
