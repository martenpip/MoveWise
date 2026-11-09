import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START_FEN } from '../src/chess/types';
import { MATE } from '../src/engine/search';
import {
  MATE_SCORE,
  UciSession,
  goCommand,
  isUciMove,
  parseBestMove,
  parseInfo,
  positionCommand,
  toWhiteScore,
  whiteToMoveAfter,
  type UciTransport,
} from '../src/engine/uci';

/* ---------- pure helpers ---------- */

test('the mate score matches the built-in engine, so both engines feed the same UI code', () => {
  assert.equal(MATE_SCORE, MATE);
});

test('parseInfo reads depth, score, nodes and the principal variation', () => {
  const i = parseInfo('info depth 15 seldepth 24 multipv 1 score cp 26 nodes 130620 nps 526693 hashfull 51 time 248 pv e2e4 e7e5 g1f3');
  assert.ok(i);
  assert.equal(i.depth, 15);
  assert.equal(i.seldepth, 24);
  assert.equal(i.multipv, 1);
  assert.equal(i.cp, 26);
  assert.equal(i.nodes, 130620);
  assert.deepEqual(i.pv, ['e2e4', 'e7e5', 'g1f3']);
  assert.equal(i.bound, undefined);
});

test('parseInfo reads mate scores, bounds, promotions, and ignores free text and other lines', () => {
  assert.equal(parseInfo('info depth 5 score mate -3 pv e1e2')?.mate, -3);
  assert.equal(parseInfo('info depth 9 score cp 120 lowerbound nodes 1')?.bound, 'lower');
  assert.equal(parseInfo('info depth 9 score cp -40 upperbound nodes 1')?.bound, 'upper');
  assert.deepEqual(parseInfo('info depth 3 score cp 900 pv e7e8q e8e1')?.pv, ['e7e8q', 'e8e1']);
  // Free text may contain anything, including words that look like fields.
  const s = parseInfo('info string NNUE evaluation using nn-1234.nnue depth 99 score cp 7');
  assert.deepEqual(s, {});
  assert.equal(parseInfo('bestmove e2e4'), null);
  assert.equal(parseInfo('readyok'), null);
});

test('parseBestMove reads moves, ponder moves, and "(none)" for mate or stalemate', () => {
  assert.deepEqual(parseBestMove('bestmove e2e4 ponder e7e5'), { move: 'e2e4', ponder: 'e7e5' });
  assert.deepEqual(parseBestMove('bestmove a7a8q'), { move: 'a7a8q', ponder: null });
  assert.deepEqual(parseBestMove('bestmove (none)'), { move: '', ponder: null });
  assert.equal(parseBestMove('info depth 1'), null);
  assert.ok(isUciMove('e1g1') && isUciMove('b7b8n') && !isUciMove('e9e4') && !isUciMove('(none)'));
});

test('scores are converted to White’s point of view whoever is to move', () => {
  assert.deepEqual(toWhiteScore({ cp: 50 }, true), { scoreCp: 50, mate: null });
  assert.deepEqual(toWhiteScore({ cp: 50 }, false), { scoreCp: -50, mate: null });
  assert.deepEqual(toWhiteScore({ cp: 0 }, false), { scoreCp: 0, mate: null });
  // Side to move mates in 2.
  assert.deepEqual(toWhiteScore({ mate: 2 }, true), { scoreCp: MATE_SCORE, mate: 2 });
  assert.deepEqual(toWhiteScore({ mate: 2 }, false), { scoreCp: -MATE_SCORE, mate: -2 });
  // Side to move is being mated in 3.
  assert.deepEqual(toWhiteScore({ mate: -3 }, true), { scoreCp: -MATE_SCORE, mate: -3 });
  assert.deepEqual(toWhiteScore({ mate: -3 }, false), { scoreCp: MATE_SCORE, mate: 3 });
  // `mate 0`: the side to move is checkmated right now.
  assert.equal(toWhiteScore({ mate: 0 }, true).scoreCp, -MATE_SCORE);
  assert.equal(toWhiteScore({ mate: 0 }, false).scoreCp, MATE_SCORE);
  assert.ok(Object.is(toWhiteScore({ mate: 0 }, true).mate, 0), 'no negative zero');
  assert.ok(Object.is(toWhiteScore({ cp: 0 }, true).scoreCp, 0), 'no negative zero');
});

test('position and go commands', () => {
  assert.equal(positionCommand(START_FEN, []), 'position startpos');
  assert.equal(positionCommand(START_FEN, ['e2e4', 'e7e5']), 'position startpos moves e2e4 e7e5');
  const fen = '8/8/8/8/8/8/k7/K6Q w - - 0 1';
  assert.equal(positionCommand(fen, []), `position fen ${fen}`);
  assert.equal(positionCommand(fen, ['h1h2']), `position fen ${fen} moves h1h2`);
  assert.equal(goCommand({ depth: 18, movetimeMs: 1800 }), 'go depth 18 movetime 1800');
  assert.equal(goCommand({ movetimeMs: 300 }), 'go movetime 300');
  assert.equal(goCommand({ depth: 12 }), 'go depth 12');
  assert.equal(goCommand({}), 'go movetime 1000', 'never an unbounded search');
  assert.equal(goCommand({ depth: 0, movetimeMs: 1 }), 'go depth 1 movetime 10');
});

test('whiteToMoveAfter follows the start FEN and the number of moves', () => {
  assert.equal(whiteToMoveAfter(START_FEN, []), true);
  assert.equal(whiteToMoveAfter(START_FEN, ['e2e4']), false);
  assert.equal(whiteToMoveAfter(START_FEN, ['e2e4', 'e7e5']), true);
  const blackToMove = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  assert.equal(whiteToMoveAfter(blackToMove, []), false);
  assert.equal(whiteToMoveAfter(blackToMove, ['e7e5']), true);
});

/* ---------- UciSession against a scripted fake engine ---------- */

/** A fake engine we control line by line, so protocol edge cases are exact and fast. */
class FakeEngine implements UciTransport {
  sent: string[] = [];
  terminated = false;
  private handler: (l: string) => void = () => undefined;
  private errorHandler: (e: Error) => void = () => undefined;
  /** Called with every command the session sends; tests use it to script replies. */
  onSend: (line: string) => void = () => undefined;
  send(line: string): void {
    this.sent.push(line);
    this.onSend(line);
  }
  setHandler(h: (l: string) => void): void {
    this.handler = h;
  }
  setErrorHandler(h: (e: Error) => void): void {
    this.errorHandler = h;
  }
  terminate(): void {
    this.terminated = true;
  }
  say(...lines: string[]): void {
    for (const l of lines) this.handler(l);
  }
  fail(message: string): void {
    this.errorHandler(new Error(message));
  }
  /** Standard handshake replies. */
  answerHandshake(): void {
    this.onSend = (l) => {
      if (l === 'uci') this.say('id name Fake', 'uciok');
      if (l === 'isready') this.say('readyok');
    };
  }
}

const SEARCH = { position: 'position startpos', go: 'go depth 5', whiteToMove: true, timeoutMs: 5_000 };
const tick = () => new Promise<void>((r) => setTimeout(r, 5));

test('UciSession: handshake, then a search resolves with the last exact score and the bestmove', async () => {
  const fake = new FakeEngine();
  fake.answerHandshake();
  const s = new UciSession(fake);
  await s.init();
  assert.deepEqual(fake.sent, ['uci', 'isready']);

  const p = s.search(SEARCH);
  await tick();
  assert.deepEqual(fake.sent.slice(2), ['position startpos', 'go depth 5']);
  fake.say(
    'info depth 1 seldepth 1 multipv 1 score cp 10 nodes 20 pv e2e4',
    'info depth 2 seldepth 3 multipv 1 score cp 33 nodes 90 pv d2d4 d7d5',
    'info depth 3 score cp 500 upperbound nodes 100 pv a2a3', // a bound: must not become the result
    'info depth 2 multipv 2 score cp 999 nodes 100 pv a2a3', // a secondary line: must not become the result
    'bestmove d2d4 ponder d7d5',
  );
  const r = await p;
  assert.equal(r.bestMove, 'd2d4');
  assert.equal(r.scoreCp, 33);
  assert.equal(r.mate, null);
  assert.equal(r.depth, 2);
  assert.deepEqual(r.pv, ['d2d4', 'd7d5']);
});

test('UciSession: black to move flips the score; mate and "(none)" are reported correctly', async () => {
  const fake = new FakeEngine();
  fake.answerHandshake();
  const s = new UciSession(fake);
  await s.init();
  const p = s.search({ ...SEARCH, whiteToMove: false });
  await tick();
  fake.say('info depth 4 score cp 80 nodes 5 pv e7e5', 'bestmove e7e5');
  assert.equal((await p).scoreCp, -80);

  const q = s.search({ ...SEARCH, whiteToMove: true });
  await tick();
  fake.say('info depth 0 score mate 0', 'bestmove (none)'); // White is checkmated
  const m = await q;
  assert.equal(m.bestMove, '');
  assert.equal(m.scoreCp, -MATE_SCORE);
  assert.deepEqual(m.pv, []);
});

test('UciSession: cancel stops the search, rejects it, discards the late answer, and the next search is clean', async () => {
  const fake = new FakeEngine();
  fake.answerHandshake();
  const s = new UciSession(fake);
  await s.init();

  const first = s.search(SEARCH);
  await tick();
  const boom = new Error('cancelled');
  s.cancel(boom);
  await assert.rejects(first, boom);
  assert.equal(fake.sent.at(-1), 'stop');

  // A second search must wait until the engine confirms the stopped search with its bestmove.
  const second = s.search({ ...SEARCH, position: 'position startpos moves e2e4' });
  await tick();
  assert.ok(!fake.sent.includes('position startpos moves e2e4'), 'must not start before the stopped search drains');
  fake.say('info depth 9 score cp 999 pv a2a3', 'bestmove a2a3'); // the cancelled search's late answer
  await tick();
  assert.ok(fake.sent.includes('position startpos moves e2e4'), 'starts once the engine is idle');
  fake.say('info depth 3 score cp 7 pv e7e5', 'bestmove e7e5');
  const r = await second;
  assert.equal(r.bestMove, 'e7e5', 'the stale answer never reaches the new search');
  assert.equal(r.scoreCp, 7);
});

test('UciSession: two queued searches run one after the other, never together', async () => {
  const fake = new FakeEngine();
  fake.answerHandshake();
  const s = new UciSession(fake);
  await s.init();
  const a = s.search({ ...SEARCH, position: 'position startpos moves a2a3' });
  const b = s.search({ ...SEARCH, position: 'position startpos moves b2b3' });
  const c = s.search({ ...SEARCH, position: 'position startpos moves c2c3' });
  await tick();
  assert.equal(fake.sent.filter((l) => l.startsWith('position')).length, 1, 'only the first has started');
  fake.say('info depth 1 score cp 1 pv a2a3', 'bestmove a2a3');
  assert.equal((await a).bestMove, 'a2a3');
  await tick();
  assert.equal(fake.sent.filter((l) => l.startsWith('position')).length, 2);
  fake.say('info depth 1 score cp 2 pv b2b3', 'bestmove b2b3');
  assert.equal((await b).bestMove, 'b2b3');
  await tick();
  fake.say('info depth 1 score cp 3 pv c2c3', 'bestmove c2c3');
  assert.equal((await c).bestMove, 'c2c3');
});

test('UciSession: an engine that never stops is declared dead and its transport terminated', async () => {
  const fake = new FakeEngine();
  fake.answerHandshake();
  const s = new UciSession(fake, { stopTimeoutMs: 30 });
  await s.init();
  const p = s.search(SEARCH);
  await tick();
  s.cancel(new Error('x'));
  await assert.rejects(p);
  const next = s.search(SEARCH); // waits for the drain, which never comes
  await assert.rejects(next, /did not stop/);
  assert.equal(s.isDead, true);
  assert.equal(fake.terminated, true);
});

test('UciSession: a search that never answers times out and kills the session', async () => {
  const fake = new FakeEngine();
  fake.answerHandshake();
  const s = new UciSession(fake);
  await s.init();
  await assert.rejects(s.search({ ...SEARCH, timeoutMs: 30 }), /did not answer in time/);
  assert.equal(s.isDead, true);
  assert.equal(fake.terminated, true);
});

test('UciSession: a transport error during start-up fails init immediately, not after the timeout', async () => {
  const fake = new FakeEngine(); // never answers `uci`
  const s = new UciSession(fake, { initTimeoutMs: 60_000 });
  const started = Date.now();
  const init = s.init();
  fake.fail('wasm failed to load');
  await assert.rejects(init, /wasm failed to load/);
  assert.ok(Date.now() - started < 2_000);
  assert.equal(fake.terminated, true);
  await assert.rejects(s.search(SEARCH), /wasm failed to load/);
});

test('UciSession: the handshake times out if the engine is silent', async () => {
  const fake = new FakeEngine();
  const s = new UciSession(fake, { initTimeoutMs: 40 });
  await assert.rejects(s.init(), /did not start within/);
  assert.equal(s.isDead, true);
});

test('UciSession: dispose rejects a running search and refuses new ones', async () => {
  const fake = new FakeEngine();
  fake.answerHandshake();
  const s = new UciSession(fake);
  await s.init();
  const p = s.search(SEARCH);
  await tick();
  s.dispose();
  await assert.rejects(p, /shut down/);
  await assert.rejects(s.search(SEARCH), /shut down/);
});
