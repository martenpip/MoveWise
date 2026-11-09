import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineCancelled } from '../src/engine/client';
import type { BotReply, EvalRequest } from '../src/engine/engine';
import { analyseReview } from '../src/review/analyse';
import { newReview, progressOf, runReview, toPositionEval, type ReviewEngine } from '../src/review/runner';
import { summarise } from '../src/review/summary';
import { MATE_CP, REVIEW_PRESETS, RULES_ENGINE, searchEngines } from '../src/review/types';
import { START_FEN } from '../src/chess/types';
import { SCHOLAR_MOVES } from './review-fixtures';

const reply = (over: Partial<BotReply> = {}): BotReply => ({ uci: 'e2e4', scoreCp: 20, mate: null, depth: 17, nodes: 1000, pv: ['e2e4', 'e7e5'], engine: 'Stockfish 19 (lite)', ...over });
const game = { id: 'g1', startFen: START_FEN, uciMoves: SCHOLAR_MOVES };

class StubEngine implements ReviewEngine {
  requests: EvalRequest[] = [];
  cancels = 0;
  constructor(private readonly respond: (req: EvalRequest, n: number) => Promise<BotReply> | BotReply = () => reply()) {}
  async evaluate(req: EvalRequest): Promise<BotReply> {
    this.requests.push(req);
    return this.respond(req, this.requests.length);
  }
  cancel(): void {
    this.cancels++;
  }
}

test('a stored position keeps the engine’s name, converts mates to the shared scale and trims the line', () => {
  const engines: string[] = [];
  const a = toPositionEval(reply({ scoreCp: 99999, mate: 3, pv: new Array(30).fill('e2e4') }), engines);
  assert.equal(a.cp, MATE_CP);
  assert.equal(a.mate, 3);
  assert.equal(a.pv.length, 10);
  const b = toPositionEval(reply({ mate: -2, scoreCp: -30000, engine: 'Built-in engine' }), engines);
  assert.equal(b.cp, -MATE_CP);
  assert.deepEqual(engines, ['Stockfish 19 (lite)', 'Built-in engine']);
  assert.equal(b.e, 1);
  const c = toPositionEval(reply({ scoreCp: 12.6, pv: [], uci: 'g1f3' }), engines);
  assert.equal(c.cp, 13);
  assert.deepEqual(c.pv, ['g1f3']);
  assert.equal(toPositionEval(reply({ engine: undefined }), engines).e, 2); // never claims a name it was not given
  assert.equal(engines[2], 'Unknown engine');
});

test('every position is analysed in order from the start of the game, and the finished game is decided by the rules', async () => {
  const review = newReview(game, REVIEW_PRESETS.quick, 'black', 5);
  const engine = new StubEngine((req) => reply({ uci: req.moves.length < SCHOLAR_MOVES.length ? SCHOLAR_MOVES[req.moves.length]! : '' }));
  const seen: number[] = [];
  const outcome = await runReview(review, { engine, onProgress: (d) => seen.push(d) });
  assert.equal(outcome, 'complete');
  assert.equal(review.complete, true);
  assert.equal(engine.requests.length, 7); // the checkmate position needs no engine
  engine.requests.forEach((r, i) => {
    assert.equal(r.startFen, START_FEN);
    assert.deepEqual(r.moves, SCHOLAR_MOVES.slice(0, i));
    assert.equal(r.maxTimeMs, REVIEW_PRESETS.quick.movetimeMs);
    assert.equal(r.depth, REVIEW_PRESETS.quick.depth);
  });
  const last = review.positions[7]!;
  assert.equal(last.final, true);
  assert.equal(last.cp, MATE_CP); // Black is mated: White's score
  assert.equal(last.depth, 0);
  assert.deepEqual(review.engines, ['Stockfish 19 (lite)', RULES_ENGINE]);
  assert.deepEqual(searchEngines(review.engines), ['Stockfish 19 (lite)']);
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(progressOf(review), { done: 8, total: 8 });
  // the rules-decided position does not count as "the built-in engine" in the summary caveats
  assert.deepEqual(summarise(analyseReview(review), '1-0', [], 'beginner').caveats, []);
});

test('stalemate and draws by rule are scored 0 without asking the engine', async () => {
  const fen = '7k/5K2/8/8/8/8/8/6Q1 w - - 0 1'; // Qg6 stalemates Black: the king on h8 has no move and is not in check
  const g = { id: 's', startFen: fen, uciMoves: ['g1g6'] };
  const review = newReview(g, REVIEW_PRESETS.quick, 'white');
  const engine = new StubEngine();
  assert.equal(await runReview(review, { engine }), 'complete');
  assert.equal(engine.requests.length, 1);
  assert.equal(review.positions[1]!.cp, 0);
  assert.equal(review.positions[1]!.final, true);
});

test('cancelling keeps what was done and a later run only analyses what is missing', async () => {
  const review = newReview(game, REVIEW_PRESETS.standard, 'black');
  const ctl = new AbortController();
  const engine = new StubEngine((_req, n) => {
    if (n === 4) ctl.abort();
    return reply();
  });
  assert.equal(await runReview(review, { engine, signal: ctl.signal }), 'cancelled');
  assert.equal(review.complete, false);
  assert.ok(engine.cancels >= 1, 'the engine is told to stop');
  const done = progressOf(review).done;
  assert.equal(done, 3); // the answer that arrived after the stop was discarded
  const resume = new StubEngine();
  assert.equal(await runReview(review, { engine: resume }), 'complete');
  assert.equal(resume.requests.length, 4); // positions 3..6; the final position is decided by the rules
  assert.equal(review.positions.every(Boolean), true);
  // already-analysed positions were not asked about again
  const asked = new Set(resume.requests.map((r) => r.moves.length));
  for (let i = 0; i < done; i++) assert.equal(asked.has(i), false, `position ${i} was re-analysed`);
  // a finished review is left alone
  const again = new StubEngine();
  assert.equal(await runReview(review, { engine: again }), 'complete');
  assert.equal(again.requests.length, 0);
});

test('an engine that is cancelled from outside ends the run cleanly; any other failure is reported', async () => {
  const review = newReview(game, REVIEW_PRESETS.quick, 'black');
  const cancelled = new StubEngine((_r, n) => {
    if (n === 3) throw new EngineCancelled();
    return reply();
  });
  assert.equal(await runReview(review, { engine: cancelled }), 'cancelled');
  assert.equal(progressOf(review).done, 2);
  const failing = new StubEngine(() => {
    throw new Error('engine exploded');
  });
  await assert.rejects(runReview(newReview(game, REVIEW_PRESETS.quick, 'black'), { engine: failing }), /engine exploded/);
});

test('a review of a game whose moves do not replay is refused before the engine is used', async () => {
  const bad = newReview({ id: 'bad', startFen: START_FEN, uciMoves: ['e2e4', 'e2e4'] }, REVIEW_PRESETS.quick, null);
  const engine = new StubEngine();
  await assert.rejects(runReview(bad, { engine }), /Illegal move/);
  assert.equal(engine.requests.length, 0);
});

test('a result that arrives after cancellation is discarded', async () => {
  const review = newReview(game, REVIEW_PRESETS.quick, 'black');
  const ctl = new AbortController();
  const engine = new StubEngine(async () => {
    ctl.abort();
    return reply();
  });
  assert.equal(await runReview(review, { engine, signal: ctl.signal }), 'cancelled');
  assert.equal(progressOf(review).done, 0);
});
