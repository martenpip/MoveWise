/**
 * UCI plumbing for Stockfish (or any UCI engine). Pure TypeScript with no DOM, no Worker and no React, so the
 * same code runs in the browser (over a Worker) and in Node tests (over the engine's own Node interface).
 *
 * Only the small slice of UCI that MoveWise needs is implemented: handshake, `position`, `go`, `stop`, and
 * reading `info` / `bestmove`. Nothing here knows which Stockfish build is on the other end.
 */

/** Mate score used by the built-in engine (`MATE` in search.ts). A unit test keeps the two in sync. */
export const MATE_SCORE = 30000;

/* ------------------------------ Parsing ------------------------------ */

export interface UciInfo {
  depth?: number;
  seldepth?: number;
  multipv?: number;
  /** Centipawns from the side to move's point of view. */
  cp?: number;
  /** Moves to mate from the side to move's point of view: positive = the side to move mates; 0 = it is mated. */
  mate?: number;
  /** Set when the score is only a bound (an aspiration-window fail), which should not be shown as a result. */
  bound?: 'lower' | 'upper';
  nodes?: number;
  nps?: number;
  time?: number;
  pv?: string[];
}

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
export const isUciMove = (s: string): boolean => UCI_MOVE.test(s);

const int = (s: string | undefined): number | undefined => {
  if (s === undefined || !/^-?\d+$/.test(s)) return undefined;
  return Number(s);
};

/** Parse one `info ...` line. Returns null for any other line. Unknown fields are skipped. */
export function parseInfo(line: string): UciInfo | null {
  if (!line.startsWith('info ')) return null;
  const t = line.trim().split(/\s+/);
  const out: UciInfo = {};
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth': out.depth = int(t[++i]); break;
      case 'seldepth': out.seldepth = int(t[++i]); break;
      case 'multipv': out.multipv = int(t[++i]); break;
      case 'nodes': out.nodes = int(t[++i]); break;
      case 'nps': out.nps = int(t[++i]); break;
      case 'time': out.time = int(t[++i]); break;
      case 'score': {
        const kind = t[++i];
        const v = int(t[++i]);
        if (kind === 'cp') out.cp = v;
        else if (kind === 'mate') out.mate = v;
        const b = t[i + 1];
        if (b === 'lowerbound' || b === 'upperbound') {
          out.bound = b === 'lowerbound' ? 'lower' : 'upper';
          i++;
        }
        break;
      }
      case 'pv':
        out.pv = t.slice(i + 1).filter(isUciMove);
        i = t.length; // pv runs to the end of the line
        break;
      case 'string':
        i = t.length; // free text runs to the end of the line
        break;
      default:
        break;
    }
  }
  return out;
}

export interface UciBestMove {
  /** The move in UCI notation, or '' when the position has no legal move (mate or stalemate). */
  move: string;
  ponder: string | null;
}

/** Parse a `bestmove` line. Returns null for any other line. */
export function parseBestMove(line: string): UciBestMove | null {
  const m = /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/.exec(line);
  if (!m) return null;
  const move = m[1]!;
  return { move: isUciMove(move) ? move : '', ponder: m[2] && isUciMove(m[2]) ? m[2] : null };
}

/* ------------------------------ Scores ------------------------------ */

export interface WhiteScore {
  /** Centipawns from White's point of view; ±MATE_SCORE for a forced mate (same convention as the built-in engine). */
  scoreCp: number;
  /** Moves to mate from White's point of view (positive = White mates), or null. */
  mate: number | null;
}

/** Convert UCI's side-to-move scores to the White-perspective numbers the rest of MoveWise uses. */
export function toWhiteScore(info: Pick<UciInfo, 'cp' | 'mate'>, whiteToMove: boolean): WhiteScore {
  const sign = whiteToMove ? 1 : -1;
  if (info.mate !== undefined) {
    // `mate 0` means the side to move has been checkmated, so the OTHER side is the one delivering mate.
    const forWhite = info.mate === 0 ? -sign : Math.sign(info.mate) * sign;
    return { scoreCp: forWhite > 0 ? MATE_SCORE : -MATE_SCORE, mate: forWhite * Math.abs(info.mate) + 0 };
  }
  return { scoreCp: (info.cp ?? 0) * sign + 0, mate: null };
}

/* ------------------------------ Commands ----------------------------- */

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** `position` command from a start FEN plus UCI moves (so repetition history stays correct). */
export function positionCommand(startFen: string, moves: readonly string[]): string {
  const base = startFen === START_FEN ? 'position startpos' : `position fen ${startFen}`;
  return moves.length ? `${base} moves ${moves.join(' ')}` : base;
}

/** True when it is White's turn after playing `moves` from `startFen`. */
export function whiteToMoveAfter(startFen: string, moves: readonly string[]): boolean {
  const startsWhite = (startFen.split(' ')[1] ?? 'w') !== 'b';
  return startsWhite === (moves.length % 2 === 0);
}

export interface GoLimits {
  depth?: number;
  movetimeMs?: number;
}

/** `go` command. Stockfish stops at whichever limit it reaches first. */
export function goCommand(limits: GoLimits): string {
  const parts = ['go'];
  if (limits.depth !== undefined) parts.push('depth', String(Math.max(1, Math.floor(limits.depth))));
  if (limits.movetimeMs !== undefined) parts.push('movetime', String(Math.max(10, Math.floor(limits.movetimeMs))));
  if (parts.length === 1) parts.push('movetime', '1000'); // never an unbounded search by accident
  return parts.join(' ');
}

/* ------------------------------ Session ------------------------------ */

/** A line-oriented channel to a UCI engine. Implemented over a Worker in the app and over Node in tests. */
export interface UciTransport {
  send(line: string): void;
  /** Register the single handler for lines coming from the engine. */
  setHandler(handler: (line: string) => void): void;
  /** Optional: be told when the engine fails (for example a Worker error because the WebAssembly would not load). */
  setErrorHandler?(handler: (error: Error) => void): void;
  terminate(): void;
}

export interface UciSearchRequest {
  /** `setoption` lines sent immediately before the position (used to switch strength limiting on or off for this search). */
  options?: string[];
  position: string;
  go: string;
  whiteToMove: boolean;
  /** Give up (and treat the engine as dead) if no `bestmove` arrives by then. */
  timeoutMs: number;
}

export interface UciSearchResult {
  /** Best move in UCI notation, '' if there is no legal move. */
  bestMove: string;
  scoreCp: number;
  mate: number | null;
  depth: number;
  nodes: number;
  pv: string[];
}

export interface UciSessionOptions {
  /** How long the `uci` / `isready` handshake may take (the first load also compiles the WebAssembly). */
  initTimeoutMs?: number;
  /** How long a stopped search may take to report `bestmove` before the engine is declared dead. */
  stopTimeoutMs?: number;
}

interface ActiveSearch {
  req: UciSearchRequest;
  resolve: (r: UciSearchResult) => void;
  reject: (e: Error) => void;
  /** Newest info line that carried an exact score. */
  last: UciInfo | null;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * One engine conversation. Runs one search at a time (later searches wait their turn) and supports cancelling a
 * search with `stop` instead of killing the engine, so the WebAssembly does not have to be reloaded for every
 * position change. If the engine ever stops answering, the session marks itself dead so the owner can replace it.
 */
export class UciSession {
  private active: ActiveSearch | null = null;
  /** A cancelled search whose `bestmove` has not arrived yet. */
  private draining = false;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private idleWaiters: Array<() => void> = [];
  private handshake: { until: (line: string) => boolean; done: () => void; fail: (e: Error) => void } | null = null;
  private dead: Error | null = null;

  constructor(
    private readonly transport: UciTransport,
    private readonly options: UciSessionOptions = {},
  ) {
    transport.setHandler((line) => this.onLine(line));
    transport.setErrorHandler?.((e) => this.kill(e));
  }

  get isDead(): boolean {
    return this.dead !== null;
  }

  /** UCI handshake: `uci` → `uciok`, then `isready` → `readyok`. */
  async init(): Promise<void> {
    const timeout = this.options.initTimeoutMs ?? 30_000;
    await this.expect('uci', (l) => l === 'uciok', timeout, 'start');
    await this.expect('isready', (l) => l === 'readyok', timeout, 'get ready');
  }

  private expect(command: string, until: (line: string) => boolean, timeoutMs: number, what: string): Promise<void> {
    if (this.dead) return Promise.reject(this.dead);
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.kill(new Error(`Stockfish did not ${what} within ${Math.round(timeoutMs / 1000)} s`));
      }, timeoutMs);
      this.handshake = {
        until,
        done: () => {
          clearTimeout(timer);
          this.handshake = null;
          resolve();
        },
        fail: (e) => {
          clearTimeout(timer);
          this.handshake = null;
          reject(e);
        },
      };
      this.transport.send(command);
    });
  }

  /** Run a search. Waits for any earlier search (or a cancelled search's drain) to finish first. */
  async search(req: UciSearchRequest): Promise<UciSearchResult> {
    // A loop, not a single wait: waiters are released together, and the first one to run claims the engine.
    while (!this.dead && (this.active || this.draining)) await this.whenIdle();
    if (this.dead) throw this.dead;
    return new Promise<UciSearchResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        const a = this.active;
        this.active = null;
        this.kill(new Error('Stockfish did not answer in time'));
        a?.reject(this.dead!);
      }, req.timeoutMs);
      this.active = { req, resolve, reject, last: null, timer };
      for (const o of req.options ?? []) this.transport.send(o);
      this.transport.send(req.position);
      this.transport.send(req.go);
    });
  }

  /** Abort the running search (if any) with `reason`. The engine is told to `stop`; its late answer is discarded. */
  cancel(reason: Error): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    clearTimeout(a.timer);
    this.draining = true;
    this.drainTimer = setTimeout(() => {
      if (this.draining) this.kill(new Error('Stockfish did not stop when asked'));
    }, this.options.stopTimeoutMs ?? 2_000);
    this.transport.send('stop');
    a.reject(reason);
  }

  dispose(): void {
    this.kill(new Error('Stockfish was shut down'));
  }

  private whenIdle(): Promise<void> {
    if (this.dead || (!this.active && !this.draining)) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  private releaseIdleWaiters(): void {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const w of waiters) w();
  }

  private kill(reason: Error): void {
    if (this.dead) return;
    this.dead = reason;
    this.draining = false;
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.handshake?.fail(reason);
    const a = this.active;
    this.active = null;
    if (a) {
      clearTimeout(a.timer);
      a.reject(reason);
    }
    this.transport.terminate();
    this.releaseIdleWaiters();
  }

  private onLine(line: string): void {
    if (this.dead) return;
    if (this.handshake && this.handshake.until(line)) {
      this.handshake.done();
      return;
    }
    const best = parseBestMove(line);
    if (best) {
      if (this.draining) {
        this.draining = false;
        if (this.drainTimer) clearTimeout(this.drainTimer);
        this.releaseIdleWaiters();
        return;
      }
      const a = this.active;
      if (!a) return;
      this.active = null;
      clearTimeout(a.timer);
      const info = a.last ?? {};
      const w = toWhiteScore(info, a.req.whiteToMove);
      a.resolve({
        bestMove: best.move,
        scoreCp: w.scoreCp,
        mate: w.mate,
        depth: info.depth ?? 0,
        nodes: info.nodes ?? 0,
        pv: info.pv && info.pv.length ? info.pv : best.move ? [best.move] : [],
      });
      this.releaseIdleWaiters();
      return;
    }
    const a = this.active;
    if (!a) return;
    const info = parseInfo(line);
    // Keep the newest exact score from the main line; bounds are in-progress aspiration fails.
    if (info && (info.cp !== undefined || info.mate !== undefined) && !info.bound && (info.multipv ?? 1) === 1) {
      a.last = info;
    }
  }
}
