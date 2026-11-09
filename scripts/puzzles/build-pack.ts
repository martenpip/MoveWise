/**
 * Builds the bundled starter puzzle pack from slices of the Lichess puzzle database (CC0).
 *
 *   tsx scripts/puzzles/build-pack.ts <slice-dir> [--verify]
 *
 * Stage 1 selects a theme-balanced, rating-spread set from the slices. Every candidate must pass the rules engine
 * (`checkPuzzle`): legal FEN, every move legal, and mate puzzles really end in checkmate with the labelled length.
 * Stage 2 (`--verify`) runs the real Stockfish over each puzzle. A puzzle is kept only if its first solution move is
 * within 120 centipawns of Stockfish's own best move and leaves the player with a clear advantage (or equality, for
 * puzzles tagged as defence / equality). Mate puzzles are verified by the rules engine alone (the solution ends in
 * checkmate), so no engine opinion is needed. Verification results are cached in `<slice-dir>/verify-cache.json`.
 *
 * The output is written to public/puzzles/lichess-starter.json together with a report of what was kept and rejected.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Position } from '../../src/chess/position';
import { StockfishClient } from '../../src/engine/stockfish';
import { BUNDLED_PACK_ID, PACK_FORMAT, PACK_VERSION, type PackPuzzle, type PuzzlePack } from '../../src/puzzles/types';
import { KEPT_THEMES, TRACKED } from '../../src/puzzles/themes';
import { checkPuzzle } from '../../src/puzzles/validate';
import { TEST_BUILD, realTransport } from '../../tests/nodeEngine';

const dir = process.argv[2];
if (!dir) throw new Error('usage: build-pack.ts <slice-dir> [--verify]');
const verify = process.argv.includes('--verify');

/* ------------------------------ stage 1: parse and select ------------------------------ */
interface Row { id: string; fen: string; moves: string[]; rating: number; rd: number; pop: number; plays: number; themes: string[]; all: string[] }
const rows = new Map<string, Row>();
const sliceFiles = readdirSync(dir).filter((f) => /^slice_\d+\.csv$/.test(f)).sort((a, b) => parseInt(a.slice(6)) - parseInt(b.slice(6)));
const hashes: string[] = [];
let malformed = 0;
for (const f of sliceFiles) {
  const buf = readFileSync(join(dir, f));
  hashes.push(createHash('sha256').update(buf).digest('hex'));
  const lines = buf.toString('utf8').split('\n').slice(1, -1); // first and last lines of a byte range are partial
  for (const l of lines) {
    const p = l.split(',');
    if (p.length < 9 || p[0]!.length !== 5 || !p[1]!.includes(' ')) { malformed++; continue; }
    rows.set(p[0]!, { id: p[0]!, fen: p[1]!, moves: p[2]!.split(' '), rating: +p[3]!, rd: +p[4]!, pop: +p[5]!, plays: +p[6]!, all: p[7]!.split(' '), themes: p[7]!.split(' ').filter((t) => KEPT_THEMES.has(t)) });
  }
}
console.log(`parsed ${rows.size} unique puzzles from ${sliceFiles.length} slices (${malformed} malformed lines skipped)`);

let invalid = 0;
const pool: Row[] = [];
for (const r of rows.values()) {
  if (r.rd > 100 || r.pop < 88 || r.plays < 300) continue;
  if (r.moves.length > 12 && !r.themes.includes('mate')) continue;
  if (!r.themes.some((t) => TRACKED.has(t) || /^mateIn/.test(t))) continue;
  const c = checkPuzzle(r);
  if (!c.ok) { invalid++; continue; }
  pool.push(r);
}
console.log(`${pool.length} pass the quality filter and the rules-engine check (${invalid} failed the rules check)`);

/** Per-theme quotas. Quotas are before verification; rejected puzzles are not replaced. */
const QUOTA: Record<string, number> = {
  fork: 170, pin: 140, skewer: 110, discoveredAttack: 110, doubleCheck: 45, deflection: 110, attraction: 100, capturingDefender: 70,
  backRankMate: 80, intermezzo: 70, interference: 40, clearance: 70, sacrifice: 100, quietMove: 60, hangingPiece: 100,
  trappedPiece: 70, xRayAttack: 35, zugzwang: 35, defensiveMove: 110, equality: 50, exposedKing: 60,
  mateIn1: 150, mateIn2: 170, mateIn3: 120, mateIn4: 60, mateIn5: 18,
  smotheredMate: 45, anastasiaMate: 30, arabianMate: 30, hookMate: 25, dovetailMate: 20, bodenMate: 20, doubleBishopMate: 20,
  endgame: 120, pawnEndgame: 50, rookEndgame: 60, bishopEndgame: 35, knightEndgame: 35, queenEndgame: 35, queenRookEndgame: 20,
  promotion: 50, underPromotion: 12, enPassant: 12, castling: 6, attackingF2F7: 35, advancedPawn: 45, kingsideAttack: 50, queensideAttack: 35,
};
for (const k of Object.keys(QUOTA)) QUOTA[k] = Math.round(QUOTA[k]! * 1.8); // overlapping themes mean many puzzles count for several quotas
const chosen = new Map<string, Row>();
// Most specific (rarest) themes first, so rare themes are not crowded out.
const order = Object.keys(QUOTA).sort((a, b) => pool.filter((r) => r.themes.includes(a)).length - pool.filter((r) => r.themes.includes(b)).length);
for (const t of order) {
  const have = [...chosen.values()].filter((r) => r.themes.includes(t)).length;
  const need = QUOTA[t]! - have;
  if (need <= 0) continue;
  const cands = pool.filter((r) => r.themes.includes(t) && !chosen.has(r.id)).sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));
  // Evenly spaced through the rating range, so every theme has easy and hard examples.
  for (let i = 0; i < Math.min(need, cands.length); i++) {
    const pick = cands[Math.floor(((i + 0.5) * cands.length) / Math.min(need, cands.length))]!;
    chosen.set(pick.id, pick);
  }
}
console.log(`selected ${chosen.size} candidates`);

/* ------------------------------ stage 2: Stockfish verification ------------------------------ */
interface Verdict { ok: boolean; best?: number; played?: number; why?: string }
const cachePath = join(dir, 'verify-cache.json');
const cache: Record<string, Verdict> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};

const playerView = (cp: number, mate: number | null, whiteIsPlayer: boolean): number => {
  const v = mate !== null ? (mate > 0 ? 30000 - mate : -30000 - mate) : cp;
  return whiteIsPlayer ? v : -v;
};

async function verifyAll(list: Row[]): Promise<void> {
  const todo = list.filter((r) => !cache[r.id] && !r.themes.some((t) => t === 'mate' || /^mateIn/.test(t)));
  console.log(`verifying ${todo.length} puzzles with Stockfish (${list.length - todo.length} cached or verified by the rules alone)`);
  const workers = [0, 1].map(() => new StockfishClient(TEST_BUILD, { transport: () => realTransport() }));
  let next = 0, done = 0;
  const run = async (c: StockfishClient) => {
    for (;;) {
      const r = todo[next++];
      if (!r) return;
      try {
        const pos = new Position(r.fen);
        pos.makeMove(pos.parseUci(r.moves[0]!)!);
        const whiteIsPlayer = pos.turn === 0;
        const startFen = r.fen;
        const base = await c.evaluate({ startFen, moves: [r.moves[0]!], depth: 12, maxTimeMs: 250 });
        const after = await c.evaluate({ startFen, moves: r.moves.slice(0, 2), depth: 12, maxTimeMs: 250 });
        const best = playerView(base.scoreCp, base.mate, whiteIsPlayer);
        const played = playerView(after.scoreCp, after.mate, whiteIsPlayer);
        const defence = r.themes.includes('defensiveMove') || r.themes.includes('equality');
        const goodEnough = played >= best - 120 && (defence ? played >= -60 : played >= 100);
        cache[r.id] = goodEnough ? { ok: true, best, played } : { ok: false, best, played, why: played < best - 120 ? 'engine prefers a different first move' : 'no clear advantage after the solution move' };
      } catch (e) {
        cache[r.id] = { ok: false, why: `engine error: ${(e as Error).message}` };
      }
      if (++done % 100 === 0) { console.log(`  ${done}/${todo.length}`); writeFileSync(cachePath, JSON.stringify(cache)); }
    }
  };
  await Promise.all(workers.map(run));
  workers.forEach((w) => w.dispose());
  writeFileSync(cachePath, JSON.stringify(cache));
}

const candidates = [...chosen.values()];
if (verify) await verifyAll(candidates);
const isMate = (r: Row) => r.themes.some((t) => t === 'mate' || /^mateIn/.test(t));
const kept = candidates.filter((r) => (isMate(r) ? true : verify ? cache[r.id]?.ok === true : false));
const rejected = candidates.filter((r) => !kept.includes(r));
if (!verify) console.log('NOTE: run with --verify to include non-mate puzzles (they are only packaged after Stockfish agrees).');

/* ------------------------------ output ------------------------------ */
const puzzles: PackPuzzle[] = kept
  .sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id))
  .map((r) => ({ id: `li:${r.id}`, fen: r.fen, moves: r.moves.join(' '), rating: r.rating, rd: r.rd, themes: r.themes }));
const pack: PuzzlePack = {
  format: PACK_FORMAT,
  formatVersion: PACK_VERSION,
  id: BUNDLED_PACK_ID,
  name: 'Lichess starter collection',
  description: 'Real puzzles from games played on Lichess, selected for variety of theme and difficulty. Every solution was replayed on the MoveWise rules engine and (except mates) checked against Stockfish.',
  license: 'CC0-1.0',
  attribution: 'Puzzles from the Lichess puzzle database (https://database.lichess.org/#puzzles), released by Lichess under CC0 (public domain). Puzzle ids are Lichess ids. Ratings and theme tags are Lichess\'s.',
  source: 'https://database.lichess.org/#puzzles',
  version: 1,
  createdAt: new Date().toISOString().slice(0, 10),
  puzzles,
};
mkdirSync('public/puzzles', { recursive: true });
writeFileSync('public/puzzles/lichess-starter.json', JSON.stringify(pack));
const themeCounts: Record<string, number> = {};
for (const p of puzzles) for (const t of p.themes) themeCounts[t] = (themeCounts[t] ?? 0) + 1;
const report = {
  built: pack.createdAt,
  sliceCount: sliceFiles.length,
  sliceSha256: hashes,
  uniqueParsed: rows.size,
  passedFilter: pool.length,
  failedRulesCheck: invalid,
  candidates: candidates.length,
  verifiedWithStockfish: verify,
  kept: puzzles.length,
  rejectedByStockfish: rejected.length,
  rejectionReasons: rejected.reduce<Record<string, number>>((a, r) => { const w = cache[r.id]?.why ?? 'not verified'; a[w] = (a[w] ?? 0) + 1; return a; }, {}),
  ratingMin: puzzles[0]?.rating, ratingMax: puzzles[puzzles.length - 1]?.rating,
  themeCounts,
};
writeFileSync('docs/puzzle-pack-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, sliceSha256: undefined, themeCounts: undefined }, null, 1));
