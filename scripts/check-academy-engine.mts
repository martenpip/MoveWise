// Authoring helper (the same checks run in tests/academy-engine.test.ts): checks every move exercise/question against real Stockfish.
//   npx tsx scripts/check-academy-engine.mts [lessonIdPrefix]
import { Position } from '../src/chess/position';
import { COURSES } from '../src/academy/curriculum';
import { StockfishClient } from '../src/engine/stockfish';
import { realTransport, TEST_BUILD } from '../tests/nodeEngine';
import type { Question, Step } from '../src/academy/types';

const only = process.argv[2] ?? '';
const engine = new StockfishClient(TEST_BUILD, { transport: realTransport });
const score = (r: { scoreCp: number; mate: number | null }) => (r.mate !== null ? (r.mate > 0 ? 100000 - r.mate : -100000 - r.mate) : r.scoreCp);
let bad = 0, n = 0;
async function check(label: string, fen: string, accepted: string[], soft: boolean) {
  const p = new Position(fen);
  const white = p.turn === 0;
  const base = await engine.evaluate({ startFen: fen, moves: [], depth: 16, maxTimeMs: 800 });
  const best = (white ? 1 : -1) * score(base);
  for (const a of accepted) {
    const q = new Position(fen);
    q.makeMove(q.parseUci(a)!);
    const over = q.legalMoves().length === 0;
    const after = over ? null : await engine.evaluate({ startFen: fen, moves: [a], depth: 16, maxTimeMs: 800 });
    const v = over ? (q.inCheck() ? 100000 : 0) : (white ? 1 : -1) * score(after!);
    const loss = best - v;
    n++;
    const limit = soft ? 250 : 60;
    if (loss > limit && !(best > 400 && v > 400)) { bad++; console.log(`  LOSS ${label} ${a}: best ${best} -> ${v} (${loss}cp worse; engine prefers ${base.uci})`); }
  }
  if (!soft && !accepted.includes(base.uci)) {
    const q = new Position(fen);
    q.makeMove(q.parseUci(accepted[0]!)!);
    const bestV = best, firstV = q.legalMoves().length === 0 ? (q.inCheck() ? 100000 : 0) : (white ? 1 : -1) * score(await engine.evaluate({ startFen: fen, moves: [accepted[0]!], depth: 16, maxTimeMs: 800 }));
    if (bestV - firstV > 30) console.log(`  note ${label}: engine's top move is ${base.uci}; stored ${accepted[0]} scores ${firstV} vs ${bestV}`);
  }
}
for (const c of COURSES) for (const ch of c.chapters) {
  for (const l of ch.lessons) {
    if (!l.id.startsWith(only)) continue;
    for (const s of l.steps as Step[]) {
      if (s.kind === 'move') await check(`${l.id}/${s.id}`, s.board.fen, [s.line[0]!, ...(s.alt ?? [])], !!s.soft);
    }
    for (const q of l.check as Question[]) if (q.kind === 'move') await check(`${l.id}/${q.id}`, q.board.fen, q.answers, !!q.soft);
  }
}
console.log(`${n} accepted moves checked, ${bad} lose material or eval against the engine`);
engine.dispose();
process.exit(bad ? 1 : 0);
