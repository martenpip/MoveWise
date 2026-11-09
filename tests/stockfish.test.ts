import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { Position } from '../src/chess/position';
import { START_FEN } from '../src/chess/types';
import { AnalysisEngine, loadEnginePreference, saveEnginePreference, type StockfishLike } from '../src/engine/analysis';
import { isBuildUsable, type StockfishBuild } from '../src/engine/builds';
import { EngineCancelled, type Engine, type EngineInfo } from '../src/engine/client';
import { buildPosition, evaluatePosition, type BotReply, type EvalRequest } from '../src/engine/engine';
import { StockfishClient } from '../src/engine/stockfish';
import { MATE_SCORE, UciSession, goCommand, positionCommand, whiteToMoveAfter, type UciTransport } from '../src/engine/uci';

/**
 * These tests run the REAL Stockfish (the same lite, single-threaded WebAssembly build the app ships) in Node, through
 * the same UciSession the browser uses. Only the transport differs: Node's interface instead of a Web Worker.
 */
const enginePath = (createRequire(import.meta.url)('stockfish') as { findEngine(flavor: string): string }).findEngine('lite-single');

/**
 * Each transport is its own Stockfish process speaking UCI over stdio (the package's documented way to run it from
 * Node). A process per engine matters: the package's in-process Node API shares one engine object per process.
 */
function realTransport(): UciTransport {
  const child = spawn(process.execPath, [enginePath], { stdio: ['pipe', 'pipe', 'ignore'] });
  let handler: (line: string) => void = () => undefined;
  let errorHandler: (e: Error) => void = () => undefined;
  let terminated = false;
  let buffered = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffered += chunk;
    for (let nl = buffered.indexOf('\n'); nl >= 0; nl = buffered.indexOf('\n')) {
      const line = buffered.slice(0, nl).replace(/\r$/, '');
      buffered = buffered.slice(nl + 1);
      if (line) handler(line);
    }
  });
  child.stdin.on('error', () => undefined); // writing after the engine was killed is expected during cancel/dispose
  child.on('error', (e) => errorHandler(e));
  child.on('exit', () => {
    if (!terminated) errorHandler(new Error('The Stockfish process exited unexpectedly'));
  });
  return {
    send: (l) => void child.stdin.write(`${l}\n`),
    setHandler: (h) => {
      handler = h;
    },
    setErrorHandler: (h) => {
      errorHandler = h;
    },
    terminate: () => {
      terminated = true;
      child.kill();
    },
  };
}

const BUILD: StockfishBuild = {
  id: 'test-lite',
  name: 'Stockfish (test)',
  scriptUrl: 'unused-in-node',
  requiresCrossOriginIsolation: false,
  minAnalysisDepth: 10,
};

const isLegal = (startFen: string, moves: string[], uci: string): boolean => {
  const pos = buildPosition({ startFen, moves });
  return pos.parseUci(uci) !== undefined;
};

const search = (s: UciSession, fen: string, moves: string[] = [], depth = 10) =>
  s.search({
    position: positionCommand(fen, moves),
    go: goCommand({ depth, movetimeMs: 10_000 }),
    whiteToMove: whiteToMoveAfter(fen, moves),
    timeoutMs: 30_000,
  });

const session = new UciSession(realTransport());
after(() => session.dispose());

test('real Stockfish: handshake works and the opening position gives a legal move and a sane score', async () => {
  await session.init();
  const r = await search(session, START_FEN);
  assert.ok(isLegal(START_FEN, [], r.bestMove), `legal: ${r.bestMove}`);
  assert.ok(Math.abs(r.scoreCp) < 120, `near equal, got ${r.scoreCp}`);
  assert.equal(r.mate, null);
  assert.ok(r.depth >= 10 && r.nodes > 0);
  assert.ok(r.pv.length >= 1 && r.pv[0] === r.bestMove);
});

test('real Stockfish: finds mate in one for White and reports it from White’s point of view', async () => {
  const fen = '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1';
  const r = await search(session, fen);
  assert.equal(r.bestMove, 'a1a8');
  assert.equal(r.mate, 1);
  assert.equal(r.scoreCp, MATE_SCORE);
});

test('real Stockfish: finds mate in one for Black, reported as negative for White', async () => {
  const fen = 'r3k3/8/8/8/8/8/5PPP/6K1 b - - 0 1';
  const r = await search(session, fen);
  assert.equal(r.bestMove, 'a8a1');
  assert.equal(r.mate, -1);
  assert.equal(r.scoreCp, -MATE_SCORE);
});

test('real Stockfish: a checkmated position has no move and a decided score', async () => {
  const fen = 'R5k1/5ppp/8/8/8/8/8/4K3 b - - 0 1'; // Black is checkmated
  const r = await search(session, fen);
  assert.equal(r.bestMove, '');
  assert.equal(r.scoreCp, MATE_SCORE, 'White has won');
  assert.deepEqual(r.pv, []);
});

test('real Stockfish: a stalemated position has no move and a zero score', async () => {
  const fen = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'; // Black is stalemated
  const r = await search(session, fen);
  assert.equal(r.bestMove, '');
  assert.equal(r.scoreCp, 0);
  assert.equal(r.mate, null);
});

test('real Stockfish: move history is honoured (position after 1.e4 e5)', async () => {
  const moves = ['e2e4', 'e7e5'];
  const r = await search(session, START_FEN, moves);
  assert.ok(isLegal(START_FEN, moves, r.bestMove), `legal: ${r.bestMove}`);
  assert.ok(Math.abs(r.scoreCp) < 150);
});

test('real Stockfish and the built-in engine agree on which side is winning, whoever is to move', async () => {
  const cases = ['k7/8/8/8/8/8/8/KQ6 w - - 0 1', 'k7/8/8/8/8/8/8/KQ6 b - - 0 1', 'kq6/8/8/8/8/8/8/K7 w - - 0 1', 'kq6/8/8/8/8/8/8/K7 b - - 0 1'];
  for (const fen of cases) {
    const sf = await search(session, fen);
    const builtin = evaluatePosition({ startFen: fen, moves: [], depth: 4, maxTimeMs: 1000 });
    assert.equal(Math.sign(sf.scoreCp), Math.sign(builtin.scoreCp), `${fen}: stockfish ${sf.scoreCp} vs built-in ${builtin.scoreCp}`);
    assert.ok(Math.abs(sf.scoreCp) > 500, `a queen up is decisive: ${fen}`);
  }
});

test('real Stockfish: cancel interrupts a long search quickly, and the next search is correct and not stale', async () => {
  const fen = '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1';
  const long = session.search({
    position: positionCommand(START_FEN, []),
    go: 'go infinite',
    whiteToMove: true,
    timeoutMs: 60_000,
  });
  await new Promise((r) => setTimeout(r, 300));
  const t0 = Date.now();
  session.cancel(new EngineCancelled());
  await assert.rejects(long, EngineCancelled);
  const r = await search(session, fen); // waits for the stopped search to drain
  assert.ok(Date.now() - t0 < 4_000, `recovered in ${Date.now() - t0} ms`);
  assert.equal(r.bestMove, 'a1a8', 'the answer belongs to the new position, not the cancelled one');
  assert.equal(r.mate, 1);
});

/* ---------- StockfishClient (the Engine implementation the app uses) ---------- */

test('StockfishClient.evaluate returns a complete reply labelled with the engine name', async () => {
  const client = new StockfishClient(BUILD, { transport: realTransport });
  try {
    const req: EvalRequest = { startFen: START_FEN, moves: ['d2d4'], depth: 8, maxTimeMs: 3000 };
    const r = await client.evaluate(req);
    assert.equal(r.engine, 'Stockfish (test)');
    assert.ok(isLegal(START_FEN, ['d2d4'], r.uci));
    assert.ok(r.depth >= BUILD.minAnalysisDepth, 'at least the build’s minimum analysis depth');
    assert.ok(r.pv.length > 0 && r.nodes > 0);
    assert.equal(client.isReady, true);
    assert.equal(client.unavailableReason, null);
  } finally {
    client.dispose();
  }
});

test('StockfishClient.chooseMove plays a legal best move within the level’s time budget', async () => {
  const client = new StockfishClient(BUILD, { transport: realTransport });
  try {
    const t0 = Date.now();
    const r = await client.chooseMove({ startFen: START_FEN, moves: [], level: 'beginner', personality: 'balanced', seed: 1 });
    assert.ok(isLegal(START_FEN, [], r.uci));
    assert.ok(Date.now() - t0 < 5_000);
  } finally {
    client.dispose();
  }
});

test('StockfishClient.cancel rejects at once with EngineCancelled, even while the engine is still loading, and then recovers', async () => {
  const client = new StockfishClient(BUILD, { transport: realTransport });
  try {
    const req: EvalRequest = { startFen: START_FEN, moves: [], depth: 8, maxTimeMs: 3000 };
    const first = client.evaluate(req);
    client.cancel();
    await assert.rejects(first, EngineCancelled);
    const second = await client.evaluate(req);
    assert.ok(isLegal(START_FEN, [], second.uci));
    // Cancel in the middle of a search, then ask again.
    const third = client.evaluate({ ...req, depth: 40, maxTimeMs: 20_000 });
    await new Promise((r) => setTimeout(r, 200));
    client.cancel();
    await assert.rejects(third, EngineCancelled);
    const fourth = await client.evaluate(req);
    assert.ok(isLegal(START_FEN, [], fourth.uci));
  } finally {
    client.dispose();
  }
});

test('StockfishClient remembers why it failed and does not retry', async () => {
  let attempts = 0;
  const client = new StockfishClient(BUILD, {
    transport: () => {
      attempts++;
      throw new Error('WebAssembly is not supported here');
    },
  });
  const req: EvalRequest = { startFen: START_FEN, moves: [], depth: 8, maxTimeMs: 1000 };
  await assert.rejects(client.evaluate(req), /WebAssembly is not supported/);
  await assert.rejects(client.evaluate(req), /WebAssembly is not supported/);
  assert.equal(attempts, 1);
  assert.match(client.unavailableReason ?? '', /WebAssembly is not supported/);
  assert.equal(client.isReady, false);
});

test('StockfishClient fails fast when the engine files cannot be loaded (async transport)', async () => {
  const client = new StockfishClient(BUILD, {
    transport: async () => {
      throw new Error('The Stockfish engine file could not be loaded (Failed to fetch)');
    },
  });
  const t0 = Date.now();
  await assert.rejects(client.evaluate({ startFen: START_FEN, moves: [], depth: 8, maxTimeMs: 1000 }), /could not be loaded/);
  assert.ok(Date.now() - t0 < 1000);
  assert.match(client.unavailableReason ?? '', /could not be loaded/);
});

/* ---------- AnalysisEngine: preference and fallback ---------- */

const REQ: EvalRequest = { startFen: START_FEN, moves: [], depth: 8, maxTimeMs: 1000 };
const reply = (engine: string): BotReply => ({ uci: 'e2e4', scoreCp: 10, mate: null, depth: 8, nodes: 1, pv: ['e2e4'], engine });

class StubEngine implements StockfishLike {
  calls = 0;
  cancels = 0;
  ready = false;
  problem: string | null = null;
  constructor(
    readonly info: EngineInfo,
    private readonly behaviour: () => Promise<BotReply>,
  ) {}
  get isReady(): boolean {
    return this.ready;
  }
  get unavailableReason(): string | null {
    return this.problem;
  }
  evaluate(): Promise<BotReply> {
    this.calls++;
    return this.behaviour();
  }
  chooseMove(): Promise<BotReply> {
    this.calls++;
    return this.behaviour();
  }
  cancel(): void {
    this.cancels++;
  }
  dispose(): void {}
}

const builtinInfo: EngineInfo = { id: 'builtin', name: 'Built-in engine', kind: 'builtin' };
const sfInfo: EngineInfo = { id: 'sf', name: 'Stockfish 19 (lite)', kind: 'stockfish' };

test('AnalysisEngine uses Stockfish by default and the built-in engine when preferred', async () => {
  const builtin = new StubEngine(builtinInfo, async () => reply('Built-in engine'));
  const sf = new StubEngine(sfInfo, async () => reply('Stockfish 19 (lite)'));
  const a = new AnalysisEngine(builtin, sf);
  assert.equal((await a.evaluate(REQ)).engine, 'Stockfish 19 (lite)');
  assert.equal(builtin.calls, 0);
  a.setPreference('builtin');
  assert.equal((await a.evaluate(REQ)).engine, 'Built-in engine');
  assert.equal(sf.calls, 1);
  assert.equal(a.info.kind, 'builtin');
  a.setPreference('stockfish');
  assert.equal(a.info.kind, 'stockfish');
});

test('AnalysisEngine falls back to the built-in engine when Stockfish fails, and does not retry Stockfish', async () => {
  const builtin = new StubEngine(builtinInfo, async () => reply('Built-in engine'));
  const sf = new StubEngine(sfInfo, async () => {
    throw new Error('worker crashed');
  });
  const a = new AnalysisEngine(builtin, sf);
  const r = await a.evaluate(REQ);
  assert.equal(r.engine, 'Built-in engine', 'the request is still answered');
  assert.equal(a.stockfishProblem, 'worker crashed');
  await a.evaluate(REQ);
  assert.equal(sf.calls, 1, 'Stockfish is not retried after it failed');
  assert.equal(builtin.calls, 2);
  assert.equal(a.stockfishReady, false);
});

test('AnalysisEngine never treats a cancel as a failure', async () => {
  const builtin = new StubEngine(builtinInfo, async () => reply('Built-in engine'));
  const sf = new StubEngine(sfInfo, async () => {
    throw new EngineCancelled();
  });
  const a = new AnalysisEngine(builtin, sf);
  await assert.rejects(a.evaluate(REQ), EngineCancelled);
  assert.equal(builtin.calls, 0, 'no fallback for a cancelled request');
  assert.equal(a.stockfishProblem, null, 'and Stockfish is still considered healthy');
  sf.problem = null;
  assert.equal((await new AnalysisEngine(builtin, null).evaluate(REQ)).engine, 'Built-in engine');
});

test('AnalysisEngine without Stockfish works and says so; cancel and dispose reach both engines', async () => {
  const builtin = new StubEngine(builtinInfo, async () => reply('Built-in engine'));
  const a = new AnalysisEngine(builtin, null);
  assert.equal(a.hasStockfish, false);
  assert.equal(a.stockfishInfo, null);
  assert.match(a.stockfishProblem ?? '', /does not include Stockfish/);
  assert.equal((await a.evaluate(REQ)).engine, 'Built-in engine');

  const sf = new StubEngine(sfInfo, async () => reply('Stockfish 19 (lite)'));
  const both = new AnalysisEngine(builtin, sf);
  both.cancel();
  assert.equal(builtin.cancels, 1);
  assert.equal(sf.cancels, 1);
});

test('AnalysisEngine reflects an engine that reports a start-up problem', async () => {
  const builtin = new StubEngine(builtinInfo, async () => reply('Built-in engine'));
  const sf = new StubEngine(sfInfo, async () => reply('Stockfish 19 (lite)'));
  sf.problem = 'no WebAssembly';
  const a = new AnalysisEngine(builtin, sf);
  assert.equal(a.stockfishProblem, 'no WebAssembly');
  assert.equal((await a.evaluate(REQ)).engine, 'Built-in engine');
  assert.equal(sf.calls, 0);
});

test('the engine preference is stored outside settings and survives bad storage', () => {
  const store = new Map<string, string>();
  const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(loadEnginePreference(fake), 'stockfish', 'default');
  saveEnginePreference('builtin', fake);
  assert.equal(loadEnginePreference(fake), 'builtin');
  saveEnginePreference('stockfish', fake);
  assert.equal(loadEnginePreference(fake), 'stockfish');
  store.set('mw-analysis-engine', 'garbage');
  assert.equal(loadEnginePreference(fake), 'stockfish', 'unknown values fall back to the default');
  const throwing = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(loadEnginePreference(throwing), 'stockfish');
  assert.doesNotThrow(() => saveEnginePreference('builtin', throwing));
  assert.equal(loadEnginePreference(undefined), 'stockfish');
});

test('builds that need cross-origin isolation are only offered where it is available', () => {
  const lite: StockfishBuild = { ...BUILD, requiresCrossOriginIsolation: false };
  const threaded: StockfishBuild = { ...BUILD, id: 'threaded', requiresCrossOriginIsolation: true };
  assert.equal(isBuildUsable(lite, { crossOriginIsolated: false }), true);
  assert.equal(isBuildUsable(threaded, { crossOriginIsolated: false }), false);
  assert.equal(isBuildUsable(threaded, { crossOriginIsolated: true }), true);
});

test('every Engine implementation exposes the same contract', () => {
  const engine: Engine = new StockfishClient(BUILD, { transport: realTransport });
  for (const m of ['chooseMove', 'evaluate', 'cancel', 'dispose'] as const) assert.equal(typeof engine[m], 'function');
  assert.equal(engine.info.kind, 'stockfish');
  engine.dispose();
  // sanity: Position is exercised through buildPosition above
  assert.ok(new Position(START_FEN));
});
