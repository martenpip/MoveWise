// Verifies the Academy's chess content with the real Stockfish: every accepted move in an exercise or question must not
// lose material or evaluation against the engine's best move, and every evaluation claim a lesson makes must hold.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Position } from '../src/chess/position';
import { COURSES } from '../src/academy/curriculum';
import { StockfishClient } from '../src/engine/stockfish';
import type { Claim, Question, Step } from '../src/academy/types';
import { realTransport, TEST_BUILD } from './nodeEngine';

const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
after(() => engine.dispose());

const cp = (r: { scoreCp: number; mate: number | null }) => (r.mate !== null ? (r.mate > 0 ? 100000 - r.mate : -100000 - r.mate) : r.scoreCp);
const DEPTH = 14;

interface Case { label: string; fen: string; accepted: string[]; soft: boolean }
const cases: Case[] = [];
const claims: Array<{ label: string; claim: Claim }> = [];
for (const c of COURSES) for (const ch of c.chapters) for (const l of ch.lessons) {
  for (const s of l.steps as Step[]) if (s.kind === 'move') cases.push({ label: `${l.id}/${s.id}`, fen: s.board.fen, accepted: [s.line[0]!, ...(s.alt ?? [])], soft: !!s.soft });
  for (const q of l.check as Question[]) if (q.kind === 'move') cases.push({ label: `${l.id}/${q.id}`, fen: q.board.fen, accepted: q.answers, soft: !!q.soft });
  for (const cl of l.claims ?? []) claims.push({ label: l.id, claim: cl });
}

/** Loss in centipawns, from the mover's side, of playing `uci` instead of the engine's best move. */
async function loss(fen: string, uci: string, depth = DEPTH, maxTimeMs = 600): Promise<{ loss: number; best: number; after: number; bestMove: string }> {
  const p = new Position(fen);
  const sign = p.turn === 0 ? 1 : -1;
  const base = await engine.evaluate({ startFen: fen, moves: [], depth, maxTimeMs });
  const best = sign * cp(base);
  const q = new Position(fen);
  q.makeMove(q.parseUci(uci)!);
  const over = q.legalMoves().length === 0;
  const v = over ? (q.inCheck() ? 100000 : 0) : sign * cp(await engine.evaluate({ startFen: fen, moves: [uci], depth, maxTimeMs }));
  return { loss: best - v, best, after: v, bestMove: base.uci };
}

test('the curriculum has engine-checkable move content', () => {
  assert.ok(cases.length >= 100, `${cases.length} move cases`);
});

test('real Stockfish: no accepted move in any exercise or question throws away material or the evaluation', { timeout: 20 * 60_000 }, async () => {
  const flagged: string[] = [];
  for (const c of cases) {
    for (const a of c.accepted) {
      const limit = c.soft ? 250 : 60; // soft = a principle-based choice, only required to be sound
      const bad = (x: { loss: number; best: number; after: number }) => x.loss > limit && !(x.best > 400 && x.after > 400);
      let r = await loss(c.fen, a);
      // A time-limited search at depth 14 can swing with machine load. The tolerance is not loosened: a move that fails is measured
      // again, much deeper and with more time, and must fail there too to be reported; a move that really loses still fails.
      if (bad(r)) r = await loss(c.fen, a, 22, 8000);
      if (bad(r)) flagged.push(`${c.label} ${a}: ${r.best} -> ${r.after} (engine prefers ${r.bestMove})`);
    }
  }
  assert.deepEqual(flagged, []);
});

test('lessons make evaluation claims, and real Stockfish: every one of them holds', { timeout: 5 * 60_000 }, async () => {
  assert.ok(claims.length >= 5, 'the endgame lessons state their evaluations as claims');
  const bad: string[] = [];
  const holds = (says: string, white: number): boolean =>
    says === 'white-winning' ? white >= 250 :
    says === 'black-winning' ? white <= -250 :
    says === 'white-better' ? white >= 40 :
    says === 'black-better' ? white <= -40 :
    Math.abs(white) <= 50;
  for (const { label, claim } of claims) {
    let r = await engine.evaluate({ startFen: claim.fen, moves: [], depth: 18, maxTimeMs: 1500 });
    let white = cp(r); // the engine reports from White’s point of view
    // A borderline result at depth 18 can swing with timing. The tolerance is not loosened: a claim that fails is searched again,
    // much deeper, and must hold there; a claim that is really wrong still fails.
    if (!holds(claim.says, white)) {
      r = await engine.evaluate({ startFen: claim.fen, moves: [], depth: 26, maxTimeMs: 12_000 });
      white = cp(r);
    }
    if (!holds(claim.says, white)) bad.push(`${label}: says ${claim.says}, engine ${white} at depth ${r.depth}`);
  }
  assert.deepEqual(bad, []);
});
