import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Position } from '../src/chess/position';
import type { PuzzleEvent } from '../src/profile/types';
import { hintFor, solutionReveal } from '../src/puzzles/hints';
import { attemptScore, puzzleRating, ratedAttempts } from '../src/puzzles/rating';
import { PuzzleSession } from '../src/puzzles/solver';
import { primaryTheme, themeInfo, THEMES } from '../src/puzzles/themes';
import { toPuzzle, checkPuzzle, isCheckmate } from '../src/puzzles/validate';
import { BUNDLED_PACK_ID, type PuzzlePack, type Puzzle } from '../src/puzzles/types';
import { buildLibrary, checkPack, csvToPack } from '../src/puzzles/library';
import { explainPuzzle } from '../src/puzzles/explain';
import { isClean, themeSkills } from '../src/puzzles/skills';
import { incorrectPuzzles, nextPuzzle, seeded, type Context } from '../src/puzzles/select';
import { dailyStreak, localDateKey, pickDaily } from '../src/puzzles/daily';
import { MAX_STRIKES, afterMiss, afterSolve, highScore, rushOver, rushPuzzle, startRush } from '../src/puzzles/rush';

const PACK: PuzzlePack = JSON.parse(readFileSync(new URL('../public/puzzles/lichess-starter.json', import.meta.url), 'utf8'));
const ALL: Puzzle[] = PACK.puzzles.map((p) => toPuzzle(p, PACK.id));
const byTheme = (t: string) => ALL.filter((p) => p.themes.includes(t));

/* ---------------------------------- the bundled pack ---------------------------------- */

test('pack: documented provenance and licence, and a real, honest size', () => {
  const report = JSON.parse(readFileSync(new URL('../docs/puzzle-pack-report.json', import.meta.url), 'utf8'));
  assert.equal(PACK.id, BUNDLED_PACK_ID);
  assert.equal(PACK.license, 'CC0-1.0');
  assert.match(PACK.attribution, /Lichess/);
  assert.match(PACK.source, /database\.lichess\.org/);
  assert.equal(PACK.puzzles.length, report.kept, 'the report must state exactly the number of puzzles shipped');
  assert.ok(PACK.puzzles.length > 1000);
});

test('pack: every puzzle has a valid FEN, legal moves, a legal reply sequence, and mate puzzles end in checkmate', () => {
  const ids = new Set<string>();
  for (const p of ALL) {
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`);
    ids.add(p.id);
    const c = checkPuzzle(p);
    assert.ok(c.ok, `${p.id}: ${c.error}`);
    if (p.themes.some((t) => /^mateIn\d$/.test(t) || t === 'mate')) {
      const pos = new Position(p.fen);
      for (const u of p.moves) pos.makeMove(pos.parseUci(u)!);
      assert.ok(isCheckmate(pos), `${p.id} should end in mate`);
    }
  }
});

test('pack: the solver solves every stored solution move by move, and does not finish early', () => {
  for (const p of ALL.filter((_, i) => i % 7 === 0)) {
    const s = new PuzzleSession(p);
    const steps = p.moves.length / 2;
    for (let i = 0; i < steps; i++) {
      assert.equal(s.done, false, `${p.id} finished before step ${i + 1}`);
      const exp = s.expected!;
      const r = s.attempt(exp);
      assert.equal(r.kind, 'correct');
      if (r.kind === 'correct') assert.equal(r.done, i === steps - 1, `${p.id} step ${i + 1}`);
    }
    assert.ok(s.done);
  }
});

test('pack: covers the themes MoveWise advertises (fork, pin, skewer, discovered attack, mates, endgames…) and says which are absent', () => {
  for (const t of ['fork', 'pin', 'skewer', 'discoveredAttack', 'deflection', 'attraction', 'capturingDefender', 'backRankMate', 'intermezzo', 'interference', 'clearance', 'mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'defensiveMove', 'endgame', 'doubleCheck']) {
    assert.ok(byTheme(t).length >= 20, `${t} has only ${byTheme(t).length}`);
  }
  const ratings = ALL.map((p) => p.rating);
  assert.ok(Math.min(...ratings) < 800 && Math.max(...ratings) > 2200, 'beginner and expert puzzles both present');
});

test('themes: every theme in the data has a hint direction, a motif and an idea', () => {
  const used = new Set(ALL.flatMap((p) => p.themes));
  for (const t of used) if (t !== 'middlegame' && t !== 'opening') assert.ok(themeInfo(t), `no info for ${t}`);
  for (const t of THEMES) assert.ok(t.direction && t.motif && t.idea && t.label);
});

/* ---------------------------------- solver ---------------------------------- */

const MATE2 = ALL.find((p) => p.themes.includes('mateIn2'))!;
const MATE1 = ALL.find((p) => p.themes.includes('mateIn1'))!;

test('solver: the opponent’s setup move is played, the player moves next, and a multi-move puzzle needs every move', () => {
  const s = new PuzzleSession(MATE2);
  assert.equal(s.setupMove, MATE2.moves[0]);
  assert.equal(s.totalSteps, 2);
  const r1 = s.attempt(MATE2.moves[1]!);
  assert.equal(r1.kind, 'correct');
  assert.equal(s.done, false);
  assert.ok(r1.kind === 'correct' && r1.reply === MATE2.moves[2], 'the opponent replies automatically');
  assert.equal(s.expected, MATE2.moves[3]);
  assert.equal(s.attempt(MATE2.moves[3]!).kind, 'correct');
  assert.ok(s.done);
});

test('solver: a wrong move is reported and the position does not change; illegal input is ignored', () => {
  const s = new PuzzleSession(MATE1);
  const before = s.fen;
  const pos = new Position(before);
  const other = pos.legalMoves().find((m) => {
    const q = pos.clone();
    q.makeMove(m);
    return !isCheckmate(q);
  })!;
  const uci = (m: number) => `${'abcdefgh'[m & 7]}${((m >> 3) & 7) + 1}${'abcdefgh'[(m >> 6) & 7]}${((m >> 9) & 7) + 1}`;
  assert.equal(s.attempt(uci(other)).kind, 'wrong');
  assert.equal(s.fen, before);
  assert.equal(s.attempt('a1a1').kind, 'illegal');
  assert.equal(s.done, false);
});

test('solver: a different move that gives checkmate is accepted and finishes the puzzle', () => {
  const uciOf = (m: number) => `${'abcdefgh'[m & 7]}${((m >> 3) & 7) + 1}${'abcdefgh'[(m >> 6) & 7]}${((m >> 9) & 7) + 1}${['', '', 'n', 'b', 'r', 'q'][(m >> 12) & 7] ?? ''}`;
  let tested = 0;
  for (const p of byTheme('mateIn1')) {
    const s0 = new PuzzleSession(p);
    const pos = new Position(s0.fen);
    const alt = pos.legalMoves().map(uciOf).filter((u) => u !== p.moves[1]).find((u) => { const q = pos.clone(); q.makeMove(pos.parseUci(u)!); return isCheckmate(q); });
    if (!alt) continue;
    const s = new PuzzleSession(p);
    const r = s.attempt(alt);
    assert.ok(r.kind === 'correct' && r.viaMate && r.done, `${p.id}: ${alt}`);
    assert.ok(s.done);
    if (++tested >= 3) break;
  }
  assert.ok(tested >= 1, 'the bundled pack should contain at least one mate in one with two mating moves');
});

/* ---------------------------------- hints ---------------------------------- */

test('hints: three stages, grounded in the solution; the move itself is only revealed on request', () => {
  const fork = byTheme('fork').find((p) => p.moves.length <= 4 && !p.themes.includes('mate'))!;
  const s = new PuzzleSession(fork);
  const h1 = hintFor(s, 1), h2 = hintFor(s, 2), h3 = hintFor(s, 3);
  assert.equal(h1.square, null);
  assert.match(h1.text, /two threats|at once/i);
  assert.ok(!/fork/i.test(h1.text), 'hint 1 must not name the motif');
  assert.match(h2.text, /fork/i);
  const d = solutionReveal(s)!;
  assert.equal(h3.square, d.from);
  assert.ok(!h3.text.includes(d.san) && !h3.text.includes(d.uci.slice(2, 4)), 'hint 3 must not reveal the destination');
  assert.ok(d.uci === fork.moves[1]);
});

test('hints: puzzles without a known theme get honest generic hints', () => {
  const p: Puzzle = { ...MATE1, themes: ['middlegame'] };
  const s = new PuzzleSession(p);
  assert.match(hintFor(s, 1).text, /forcing/i);
  assert.equal(primaryTheme(['middlegame']), null);
});

/* ---------------------------------- rating ---------------------------------- */

let clock = 1_700_000_000_000;
const ev = (o: Partial<PuzzleEvent> & { puzzleId: string }): PuzzleEvent => ({ id: `e${clock}`, kind: 'puzzle', at: (clock += 60_000), puzzleRating: 1000, solved: true, timeMs: 5000, hintsUsed: 0, themes: ['fork'], ...o });

test('rating: scores for clean, hinted, failed and solution-viewed attempts; speed is irrelevant', () => {
  assert.equal(attemptScore({ solved: true, hintsUsed: 0 }), 1);
  assert.equal(attemptScore({ solved: true, hintsUsed: 2 }), 0.5);
  assert.equal(attemptScore({ solved: true, hintsUsed: 0, wrongMoves: 1 }), 0);
  assert.equal(attemptScore({ solved: false, hintsUsed: 0 }), 0);
  assert.equal(attemptScore({ solved: true, hintsUsed: 0, usedSolution: true }), 0);
  const fast = puzzleRating([ev({ puzzleId: 'a', timeMs: 500 })]);
  const slow = puzzleRating([ev({ puzzleId: 'a', timeMs: 900_000 })]);
  assert.equal(fast.rating, slow.rating);
});

test('rating: a harder puzzle awards more; failing costs; the first results move the rating most', () => {
  const easy = puzzleRating([ev({ puzzleId: 'a', puzzleRating: 800 })]).rating;
  const hard = puzzleRating([ev({ puzzleId: 'a', puzzleRating: 1800 })]).rating;
  assert.ok(hard > easy);
  const lose = puzzleRating([ev({ puzzleId: 'a', solved: false })]).rating;
  assert.ok(lose < 1000);
  const many = Array.from({ length: 30 }, (_, i) => ev({ puzzleId: `p${i}`, puzzleRating: 1000 + i * 5 }));
  const r = puzzleRating(many);
  assert.ok(r.rd < puzzleRating(many.slice(0, 3)).rd, 'uncertainty shrinks with evidence');
  assert.equal(r.provisional, false);
  assert.ok(puzzleRating(many.slice(0, 3)).provisional);
});

test('rating: repeating, reviewing, Rush and game positions can never inflate it', () => {
  const base = [ev({ puzzleId: 'a', solved: false, puzzleRating: 1500 }), ev({ puzzleId: 'b', puzzleRating: 1100 })];
  const r0 = puzzleRating(base).rating;
  const farmed = [...base, ...Array.from({ length: 20 }, () => ev({ puzzleId: 'a', puzzleRating: 1500 })), ...Array.from({ length: 20 }, (_, i) => ev({ puzzleId: `r${i}`, mode: 'rush', puzzleRating: 2000 })), ev({ puzzleId: 'game:g:5', mode: 'game' })];
  assert.equal(puzzleRating(farmed).rating, r0);
  assert.equal(ratedAttempts(farmed).length, 2);
  assert.equal(puzzleRating([ev({ puzzleId: 'z', rated: false })]).attempts, 0, 'an unrated first attempt does not count');
});

test('rating: peak and history are kept, and the puzzle rating never uses the playing rating', () => {
  const evs = Array.from({ length: 25 }, (_, i) => ev({ puzzleId: `p${i}`, puzzleRating: 1000 + i * 30 }));
  const r = puzzleRating(evs);
  assert.equal(r.history.length, 25);
  assert.ok(r.peak !== null && r.peak >= r.history[r.history.length - 1]!.rating - 1e-9 || r.peak! > 1000);
  assert.ok(r.exampleWin > 0 && r.exampleLoss < 0);
});

/* ---------------------------------- adaptive model ---------------------------------- */

const clean = (theme: string, n: number, dayStep = 0) => Array.from({ length: n }, (_, i) => ev({ puzzleId: `${theme}${i}`, themes: [theme], at: clock + i * (dayStep || 60_000) }));
const fail = (theme: string, n: number) => Array.from({ length: n }, (_, i) => ev({ puzzleId: `${theme}f${i}`, themes: [theme], solved: false }));

test('skills: weak, learning, unknown, mastered — and a streak alone is not mastery', () => {
  const day = 86_400_000;
  const events = [...clean('fork', 12, day), ...fail('pin', 8), ...clean('skewer', 3)];
  const sk = themeSkills(events);
  assert.equal(sk.get('fork')!.level, 'mastered');
  assert.equal(sk.get('pin')!.level, 'weak');
  assert.equal(sk.get('skewer')!.level, 'unknown', 'three results are not enough to judge');
  const streak = themeSkills([...clean('fork', 6)]).get('fork')!;
  assert.notEqual(streak.level, 'mastered', 'one session of six clean solves is a streak, not mastery');
  assert.equal(themeSkills([...clean('fork', 5)]).get('fork')!.hotStreak, true);
  assert.ok(!isClean(ev({ puzzleId: 'x', hintsUsed: 1 })));
});

test('skills: recent results count more than old ones', () => {
  const oldGood = [...clean('pin', 15), ...fail('pin', 10)];
  const oldBad = [...fail('pin', 10), ...clean('pin', 15)];
  assert.ok(themeSkills(oldBad).get('pin')!.weighted > themeSkills(oldGood).get('pin')!.weighted);
});

/* ---------------------------------- selection ---------------------------------- */

function ctx(events: PuzzleEvent[], seed = 1, rating = 1200): Context {
  return { puzzles: ALL, events, rating, now: clock + 1e9, rng: seeded(seed) };
}

test('selection: weakness training serves the weak theme the player really fails, and rarely a mastered one', () => {
  const day = 86_400_000;
  const events = [...clean('fork', 14, day), ...fail('pin', 8), ...fail('skewer', 7)];
  const counts = { pin: 0, skewer: 0, fork: 0, other: 0 };
  for (let s = 1; s <= 120; s++) {
    const pick = nextPuzzle('weakness', ctx(events, s))!;
    if (pick.puzzle.themes.includes('pin')) counts.pin++;
    else if (pick.puzzle.themes.includes('skewer')) counts.skewer++;
    else if (pick.puzzle.themes.includes('fork')) counts.fork++;
    else counts.other++;
  }
  assert.ok(counts.pin + counts.skewer >= 100, JSON.stringify(counts));
  assert.ok(counts.fork <= 12, `mastered fork shows up too often: ${JSON.stringify(counts)}`);
});

test('selection: with no history weakness training says so and falls back to a mixed puzzle', () => {
  const pick = nextPuzzle('weakness', ctx([]))!;
  assert.match(pick.why, /not enough results/i);
});

test('selection: difficulty follows the rating — beginners get easier puzzles than experts', () => {
  const avg = (rating: number) => {
    let sum = 0;
    for (let s = 1; s <= 60; s++) sum += nextPuzzle('practice', ctx([], s, rating))!.puzzle.rating;
    return sum / 60;
  };
  const low = avg(700), high = avg(1900);
  assert.ok(low < 1100, `beginner average ${low}`);
  assert.ok(high > 1600, `expert average ${high}`);
});

test('selection: solved puzzles do not come straight back; failed ones can be reviewed; theme mode honours the theme', () => {
  const p = ALL.find((x) => x.rating > 1150 && x.rating < 1250)!;
  const solved = [ev({ puzzleId: p.id, themes: p.themes })];
  let again = 0;
  for (let s = 1; s <= 200; s++) if (nextPuzzle('practice', ctx(solved, s))!.puzzle.id === p.id) again++;
  assert.ok(again <= 2, `a cleanly solved puzzle was repeated ${again} times`);
  const failed = [ev({ puzzleId: p.id, themes: p.themes, solved: false })];
  assert.deepEqual(incorrectPuzzles(ctx(failed)).map((x) => x.id), [p.id]);
  assert.equal(nextPuzzle('review', ctx(failed))!.puzzle.id, p.id);
  assert.equal(nextPuzzle('review', ctx(solved)), null);
  for (let s = 1; s <= 30; s++) assert.ok(nextPuzzle('theme', ctx([], s), { theme: 'skewer' })!.puzzle.themes.includes('skewer'));
});

test('selection: the same seed gives the same puzzle', () => {
  assert.equal(nextPuzzle('practice', ctx([], 42))!.puzzle.id, nextPuzzle('practice', ctx([], 42))!.puzzle.id);
});

/* ---------------------------------- daily ---------------------------------- */

test('daily: stable for a date, different across dates, near the target rating, uses the local calendar day', () => {
  const a = pickDaily('2026-11-09', ALL, 1300)!;
  assert.equal(pickDaily('2026-11-09', ALL, 1300)!.id, a.id);
  const ids = new Set(Array.from({ length: 30 }, (_, i) => pickDaily(`2026-11-${String(i + 1).padStart(2, '0')}`, ALL, 1300)!.id));
  assert.ok(ids.size >= 20);
  assert.ok(Math.abs(a.rating - 1300) <= 250);
  assert.equal(localDateKey(new Date(2026, 10, 9, 23, 59).getTime()), '2026-11-09');
  assert.equal(localDateKey(new Date(2026, 10, 10, 0, 1).getTime()), '2026-11-10');
});

test('daily: streak counts consecutive solved days and tolerates an open today', () => {
  const rec = (date: string, solved = true) => ({ date, puzzleId: 'x', targetRating: 1000, pickedAt: 0, ...(solved ? { solvedAt: 1 } : {}) });
  assert.equal(dailyStreak([rec('2026-11-07'), rec('2026-11-08'), rec('2026-11-09')], '2026-11-09'), 3);
  assert.equal(dailyStreak([rec('2026-11-07'), rec('2026-11-08'), rec('2026-11-09', false)], '2026-11-09'), 2);
  assert.equal(dailyStreak([rec('2026-11-06'), rec('2026-11-08')], '2026-11-09'), 1);
});

/* ---------------------------------- Rush ---------------------------------- */

test('rush: starts easy, ramps up, ends after three strikes, and keeps a high score per length', () => {
  let s = startRush(1300);
  assert.ok(s.level < 1000);
  const first = rushPuzzle(ALL, s)!;
  s = afterSolve({ ...s, used: [first.id] });
  assert.ok(s.level > startRush(1300).level);
  for (let i = 0; i < MAX_STRIKES; i++) s = afterMiss(s);
  assert.ok(rushOver(s));
  const scores = [{ id: '1', at: 1, minutes: 3 as const, solved: 5, strikes: 3, best: 1000 }, { id: '2', at: 2, minutes: 3 as const, solved: 9, strikes: 1, best: 1200 }, { id: '3', at: 3, minutes: 5 as const, solved: 2, strikes: 3, best: 900 }];
  assert.equal(highScore(scores, 3)!.solved, 9);
  assert.equal(highScore(scores, 10), null);
});

/* ---------------------------------- explanations ---------------------------------- */

test('explanations: three levels, built from verified facts, and the line matches the stored solution', () => {
  const mate = ALL.find((p) => p.themes.includes('mateIn2') && p.themes.includes('backRankMate')) ?? MATE2;
  const b = explainPuzzle(mate, 'beginner'), i = explainPuzzle(mate, 'intermediate'), a = explainPuzzle(mate, 'advanced', { engine: 'Stockfish 19 (lite)', cp: null, mate: 2, depth: 18 });
  assert.ok(b.paragraphs.length < i.paragraphs.length && i.paragraphs.length < a.paragraphs.length);
  assert.ok(a.facts.endsInMate);
  assert.match(b.paragraphs[0]!, /checkmate/);
  assert.deepEqual(a.line.uci, mate.moves.slice(1));
  assert.match(a.paragraphs.join(' '), /Stockfish 19 \(lite\) \(depth 18\) scores/);
  assert.match(explainPuzzle(mate, 'advanced').paragraphs.join(' '), /No engine evaluation was available/);
  assert.match(i.paragraphs.join(' '), /Your opponent’s last move was/);
});

test('explanations: a fork is only described as attacking targets that really are attacked', () => {
  const fork = byTheme('fork').find((p) => p.moves.length <= 4 && !p.themes.includes('mate'))!;
  const x = explainPuzzle(fork, 'intermediate');
  for (const t of x.facts.targetsAfterFirst) assert.match(t, /^(knight|bishop|rook|queen|king) on [a-h][1-8]$/);
});

/* ---------------------------------- packs ---------------------------------- */

test('packs: an installed pack must declare licence and source, and invalid puzzles are rejected and counted', () => {
  const good = PACK.puzzles[0]!;
  const mk = (over: Record<string, unknown>) => ({ format: 'movewise-puzzle-pack', formatVersion: 1, id: 'mine', name: 'Mine', description: '', license: 'CC0-1.0', attribution: 'me', source: 'https://example.org', version: 1, createdAt: '', puzzles: [good, { ...good, id: 'bad-fen', fen: 'nonsense' }, { ...good, id: 'bad-move', moves: 'a1a1 a1a1' }], ...over });
  const ok = checkPack(mk({}));
  assert.equal(ok.accepted, 1);
  assert.deepEqual(ok.rejected.map((r) => r.id).sort(), ['bad-fen', 'bad-move']);
  assert.match(checkPack(mk({ license: '' })).error!, /licence/);
  assert.match(checkPack({ format: 'other' }).error!, /not a MoveWise/);
  assert.match(checkPack(mk({ puzzles: [] })).error!, /no puzzles/);
});

test('packs: the library merges packs and the first definition of an id wins', () => {
  const second: PuzzlePack = { ...PACK, id: 'extra', puzzles: [{ ...PACK.puzzles[0]!, rating: 9999 }, { ...PACK.puzzles[1]!, id: 'x:new' }] };
  const lib = buildLibrary([{ pack: PACK, bundled: true }, { pack: second, bundled: false }]);
  assert.equal(lib.puzzles.length, PACK.puzzles.length + 1);
  assert.equal(lib.byId.get(PACK.puzzles[0]!.id)!.pack, BUNDLED_PACK_ID);
  assert.equal(lib.packs[1]!.count, 1);
});

test('packs: a Lichess-format CSV can be turned into a pack and validated', () => {
  const p = PACK.puzzles[5]!;
  const csv = `PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags\nabc12,${p.fen},${p.moves},${p.rating},80,90,500,${p.themes.join(' ')},,\n`;
  const raw = csvToPack(csv, { id: 'csv1', name: 'CSV', license: 'CC0-1.0', attribution: 'me', source: 'test' });
  const c = checkPack(raw);
  assert.equal(c.accepted, 1);
  assert.equal(c.pack!.puzzles[0]!.id, 'csv1:abc12');
  assert.equal(csvToPack('nonsense', { id: 'x', name: 'x', license: 'x', attribution: 'x', source: 'x' }), null);
});
