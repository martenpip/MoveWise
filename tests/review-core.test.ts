import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseReview, phaseOf, ENDGAME_MATERIAL, OPENING_PLIES } from '../src/review/analyse';
import { explainPly, type ExplainLevel } from '../src/review/explain';
import { buildReviewEvent } from '../src/review/event';
import { learningItems } from '../src/review/notebook';
import { ACPL_CLAMP, centipawnLoss, classByLoss, gameAccuracy, harmonicMean, moveAccuracy, winPct } from '../src/review/score';
import { summarise } from '../src/review/summary';
import type { ReviewEvent } from '../src/profile/types';
import { formatEval, formatEvalFor } from '../src/review/format';
import { MATE_CP } from '../src/review/types';
import { FORCED_FEN, forcedMove, hungKnight, makeReview, missedQueen, scholar, cleanGame, thrownAdvantage } from './review-fixtures';

const near = (a: number, b: number, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

/* ------------------------------ the numbers ------------------------------ */

test('win chance: 50% at equality, symmetric, rising, and ~100% for a mate', () => {
  near(winPct(0), 50);
  near(winPct(100), 59.1, 0.1);
  near(winPct(100) + winPct(-100), 100, 1e-9);
  assert.ok(winPct(300) > winPct(200) && winPct(200) > winPct(100));
  assert.ok(winPct(MATE_CP) > 99.99 && winPct(-MATE_CP) < 0.01);
});

test('move accuracy: 100 for no loss, falls with the drop, never outside 0..100', () => {
  near(moveAccuracy(55, 55), 100, 0.01);
  near(moveAccuracy(55, 60), 100, 0.01); // a gain is not a loss
  near(moveAccuracy(60, 50), 63.6, 0.1); // 103.1668·e^(−0.4354) − 3.1669
  assert.ok(moveAccuracy(60, 40) < moveAccuracy(60, 50));
  assert.equal(moveAccuracy(100, 0) >= 0, true);
  assert.ok(moveAccuracy(100, 0) < 1);
});

test('centipawn loss clamps scores to ±1000 and respects who moved', () => {
  assert.equal(centipawnLoss(50, -30, 'white'), 80);
  assert.equal(centipawnLoss(-50, 30, 'black'), 80); // Black's view: +50 then −30
  assert.equal(centipawnLoss(100, 300, 'white'), 0); // improving is not a loss
  assert.equal(centipawnLoss(MATE_CP, -MATE_CP, 'white'), 2 * ACPL_CLAMP);
  assert.equal(centipawnLoss(5000, 1000, 'white'), 0); // both clamp to 1000
});

test('classification thresholds sit exactly at 1, 5, 10 and 15 points', () => {
  assert.equal(classByLoss(0), 'best');
  assert.equal(classByLoss(1), 'best');
  assert.equal(classByLoss(1.01), 'good');
  assert.equal(classByLoss(4.99), 'good');
  assert.equal(classByLoss(5), 'inaccuracy');
  assert.equal(classByLoss(9.99), 'inaccuracy');
  assert.equal(classByLoss(10), 'mistake');
  assert.equal(classByLoss(14.99), 'mistake');
  assert.equal(classByLoss(15), 'blunder');
});

test('game accuracy: perfect play is ~100, one blunder pulls it below the plain average, empty is null', () => {
  const flat = new Array(21).fill(50);
  const perfect = Array.from({ length: 20 }, (_, i) => ({ ply: i + 1, accuracy: 100 }));
  near(gameAccuracy(flat, perfect)!, 100, 0.01);
  const withBlunder = [...perfect.slice(0, 19), { ply: 20, accuracy: 0 }];
  const plain = 95;
  const acc = gameAccuracy(flat, withBlunder)!;
  assert.ok(acc < plain, `blended accuracy ${acc} should be below the plain mean ${plain}`);
  assert.equal(gameAccuracy(flat, []), null);
  near(harmonicMean([100, 100]), 100, 1e-9);
  assert.ok(harmonicMean([100, 0]) < 50);
});

test('evaluation text: signs, mates, and the side it is shown from', () => {
  assert.equal(formatEval({ cp: 123, mate: null }), '+1.2');
  assert.equal(formatEval({ cp: -80, mate: null }), '−0.8');
  assert.equal(formatEval({ cp: 0, mate: null }), '0.0');
  assert.equal(formatEval({ cp: MATE_CP, mate: 3 }), 'M3');
  assert.equal(formatEval({ cp: -MATE_CP, mate: -2 }), '−M2');
  assert.equal(formatEvalFor({ cp: 123, mate: null }, 'black'), '−1.2');
  assert.equal(formatEvalFor({ cp: MATE_CP, mate: 1 }, 'black'), '−M1');
});

/* ------------------------------ phases ------------------------------ */

test('phases: opening to ply 20, endgame when the pieces thin out, and the endgame never reverts', () => {
  assert.equal(phaseOf(1, 62, false), 'opening');
  assert.equal(phaseOf(OPENING_PLIES, 62, false), 'opening');
  assert.equal(phaseOf(OPENING_PLIES + 1, 62, false), 'middlegame');
  assert.equal(phaseOf(5, ENDGAME_MATERIAL, false), 'endgame');
  assert.equal(phaseOf(5, ENDGAME_MATERIAL + 1, false), 'opening');
  assert.equal(phaseOf(30, 40, true), 'endgame');
});

/* ------------------------------ analysis ------------------------------ */

test('Scholar’s mate: Black’s 3…Nf6 is a blunder that allows mate, and 4.Qxf7# is the found mate', () => {
  const a = analyseReview(scholar('black'));
  assert.equal(a.plies.length, 7);
  const nf6 = a.plies[5]!;
  assert.equal(nf6.san, 'Nf6');
  assert.equal(nf6.cls, 'blunder');
  assert.ok(nf6.tags.includes('allowed-mate'));
  assert.equal(nf6.mateAfter, -1);
  assert.ok(nf6.winLoss > 40);
  const mate = a.plies[6]!;
  assert.equal(mate.san, 'Qxf7#');
  assert.equal(mate.cls, 'best');
  assert.ok(mate.tags.includes('found-mate'));
  assert.equal(mate.winLoss, 0);
  // the rest of Black's moves matched or were within a point of the engine's choice
  assert.deepEqual(a.sides.black.counts, { forced: 0, best: 1, good: 1, inaccuracy: 0, mistake: 0, blunder: 1 });
  assert.equal(a.sides.white.counts.blunder, 0);
  assert.ok(a.sides.black.acpl! > a.sides.white.acpl!);
  assert.ok(a.sides.black.accuracy! < a.sides.white.accuracy!);
  assert.equal(a.winSeries.length, 8);
  assert.equal(a.meanDepth, 18);
});

test('every analysed move is legal, in order, and carries its before/after positions', () => {
  const a = analyseReview(scholar());
  a.plies.forEach((p, i) => {
    assert.equal(p.ply, i + 1);
    assert.equal(p.color, i % 2 === 0 ? 'white' : 'black');
    assert.ok(p.fenBefore.split(' ')[1] === (p.color === 'white' ? 'w' : 'b'));
  });
});

test('a knight left to be captured is tagged hung-piece, using the engine’s own reply', () => {
  const a = analyseReview(hungKnight());
  const p = a.plies[4]!;
  assert.equal(p.san, 'Nxe5');
  assert.equal(p.cls, 'blunder');
  assert.ok(p.refutationCapturesMoved);
  assert.ok(p.tags.includes('hung-piece'), p.tags.join());
  assert.equal(p.materialIfPlayed, -200); // won a pawn, lost a knight
  assert.equal(p.materialIfBest, 0);
});

test('missing a free queen is tagged missed-capture and counts as a missed tactic', () => {
  const a = analyseReview(missedQueen());
  const p = a.plies[0]!;
  assert.equal(p.cls, 'blunder');
  assert.ok(p.tags.includes('missed-capture'));
  assert.ok(p.tags.includes('threw-away-advantage')); // from a won position to level: also true, and reported
  assert.equal(p.materialIfBest, 900);
  assert.equal(buildReviewEvent(a, 5)!.missedTactics, 1);
});

test('a clear advantage thrown away is tagged, and an ordinary inaccuracy is not', () => {
  const a = analyseReview(thrownAdvantage());
  assert.ok(a.plies[0]!.tags.includes('threw-away-advantage'));
  const small = makeReview({
    moves: ['e2e4', 'e7e5'],
    evals: [{ cp: 30, best: 'd2d4' }, { cp: -45, best: 'e7e5' }, { cp: -40, best: 'g1f3' }],
    perspective: 'white',
  });
  const p = analyseReview(small).plies[0]!;
  assert.equal(p.cls, 'inaccuracy');
  assert.deepEqual(p.tags, []);
});

test('a forced move is never judged and never counted', () => {
  const a = analyseReview(forcedMove());
  assert.equal(a.plies[0]!.cls, 'forced');
  assert.equal(a.sides.black.judged, 0);
  assert.equal(a.sides.black.acpl, null);
  assert.equal(a.sides.black.accuracy, null);
  assert.equal(buildReviewEvent(a, 1), null); // nothing honest to record
  void FORCED_FEN;
});

test('search noise cannot create a negative loss or a free gain', () => {
  const r = makeReview({ moves: ['e2e4', 'e7e5'], perspective: 'white', evals: [{ cp: 10, best: 'd2d4' }, { cp: 120, best: 'e7e5' }, { cp: 100, best: 'g1f3' }] });
  const p = analyseReview(r).plies[0]!;
  assert.equal(p.winLoss, 0);
  assert.equal(p.cpLoss, 0);
  assert.equal(p.cls, 'best');
});

test('an unfinished or mismatched review is refused, not guessed at', () => {
  const r = scholar();
  r.positions[3] = null;
  r.complete = false;
  assert.throws(() => analyseReview(r), /not finished/);
  const bad = scholar();
  bad.moves = [...bad.moves, 'a2a3'];
  assert.throws(() => analyseReview(bad), /does not match/);
  const illegal = scholar();
  illegal.moves[0] = 'e2e5';
  assert.throws(() => analyseReview(illegal), /illegal/);
});

/* ------------------------------ critical moments ------------------------------ */

test('critical moments: the player’s blunder, and the opponent’s error with whether it was exploited', () => {
  const black = analyseReview(scholar('black')).critical;
  assert.deepEqual(black.map((c) => [c.ply, c.kind]), [[6, 'allowed-mate']]);
  const white = analyseReview(scholar('white')).critical;
  assert.deepEqual(white.map((c) => [c.ply, c.kind, c.exploited]), [[6, 'opponent-error', true]]);
  const hung = analyseReview(hungKnight('black')).critical;
  assert.equal(hung[0]!.kind, 'opponent-error');
  assert.equal(hung[0]!.exploited, true); // …Nxe5 was the engine's move
  const neutral = analyseReview(scholar(null)).critical;
  assert.equal(neutral.length, 1);
});

/* ------------------------------ explanations ------------------------------ */

const LEVELS: ExplainLevel[] = ['beginner', 'intermediate', 'advanced'];

test('explanations: three levels say the same true thing with growing evidence', () => {
  const a = analyseReview(scholar('black'));
  const nf6 = a.plies[5]!;
  const [b, i, v] = LEVELS.map((l) => explainPly(nf6, l, a, 'black'));
  for (const e of [b!, i!, v!]) {
    assert.match(e.headline, /Blunder: Nf6 allows checkmate/);
    assert.match(e.paragraphs.join(' '), /Qxf7#/); // the real mating move
    assert.ok(e.tip && /check/i.test(e.tip));
  }
  const beginnerText = b!.paragraphs.join(' ');
  assert.doesNotMatch(beginnerText, /centipawn|%|→/);
  assert.match(i!.paragraphs.join(' '), /forced mate in 1/);
  assert.match(i!.paragraphs.join(' '), /→/); // evaluation shift
  assert.match(v!.paragraphs.join(' '), /Win chance .*%.*centipawn loss/);
  assert.ok(v!.paragraphs.join(' ').length > beginnerText.length);
  assert.match(b!.engineNote, /Stockfish 19 \(lite\) to depth 18/);
  // the engine's line is offered so the player can step through it
  assert.ok(i!.lines.some((l) => l.id === 'after' && l.line.uci[0] === 'h5f7'));
});

test('explanations speak about “you” only for the player’s own moves', () => {
  const a = analyseReview(hungKnight('white'));
  const mine = explainPly(a.plies[4]!, 'intermediate', a, 'white').paragraphs.join(' ');
  assert.match(mine, /you end up 2 points of material behind where you started/);
  const theirs = explainPly(a.plies[4]!, 'intermediate', a, 'black').paragraphs.join(' ');
  assert.match(theirs, /your opponent ends up 2 points/);
  const neutral = explainPly(a.plies[4]!, 'intermediate', a, null).paragraphs.join(' ');
  assert.match(neutral, /White ends up 2 points/);
  assert.match(mine, /Nxe5/);
  assert.match(mine, /knight that moved to e5 can be captured by the knight on c6/);
});

test('missed capture and thrown advantage are described from the stored facts', () => {
  const m = analyseReview(missedQueen());
  const t = explainPly(m.plies[0]!, 'beginner', m, 'white');
  assert.match(t.headline, /missed a way to win material/);
  assert.match(t.paragraphs.join(' '), /Qxd5 wins about 9 points/);
  const th = analyseReview(thrownAdvantage());
  assert.match(explainPly(th.plies[0]!, 'beginner', th, 'white').headline, /gives away an advantage/);
});

test('good moves get praise only for what is verified; forced moves are not judged', () => {
  const a = analyseReview(scholar('white'));
  const mate = explainPly(a.plies[6]!, 'beginner', a, 'white');
  assert.equal(mate.headline, 'Best move: Qxf7#');
  assert.match(mate.paragraphs.join(' '), /You found a forced checkmate in 1/);
  assert.equal(mate.tip, null);
  const f = analyseReview(forcedMove());
  assert.match(explainPly(f.plies[0]!, 'advanced', f, 'black').paragraphs[0]!, /only legal move/);
});

test('with no verifiable cause the explanation says what the engine prefers and shows its line', () => {
  const r = makeReview({
    moves: ['e2e4', 'e7e5'],
    perspective: 'white',
    evals: [{ cp: 30, best: 'd2d4', pv: ['d2d4', 'd7d5'] }, { cp: -45, best: 'e7e5', pv: ['e7e5', 'g1f3'] }, { cp: -40 }],
  });
  const a = analyseReview(r);
  const e = explainPly(a.plies[0]!, 'beginner', a, 'white');
  assert.equal(e.headline, 'Inaccuracy: e4');
  assert.match(e.paragraphs.join(' '), /Stockfish 19 \(lite\) preferred d4/);
  assert.equal(e.tip, null); // no tag, so no generic advice dressed up as a diagnosis
  assert.ok(e.lines.some((l) => l.id === 'best'));
});

test('every move named in an explanation is legal in the position it is about', () => {
  for (const r of [scholar('black'), hungKnight(), missedQueen(), thrownAdvantage()]) {
    const a = analyseReview(r);
    for (const p of a.plies) {
      for (const level of LEVELS) {
        const ex = explainPly(p, level, a, r.perspective);
        for (const l of ex.lines) assert.equal(l.line.uci.length, l.line.san.length);
      }
      assert.ok(p.bestLine.uci.length === p.bestLine.san.length);
    }
  }
});

/* ------------------------------ summary ------------------------------ */

const ev = (over: Partial<ReviewEvent>): ReviewEvent => ({
  id: 'review:x', kind: 'review', at: 1, gameId: 'x', acpl: 40, accuracy: 70, inaccuracies: 1, mistakes: 1, blunders: 0, missedTactics: 0,
  phaseAcpl: { opening: null, middlegame: null, endgame: null }, weaknesses: [], ...over,
});

test('summary: the headline quotes the real numbers, the lesson is the costliest move', () => {
  const a = analyseReview(scholar('black'));
  const s = summarise(a, '1-0', [], 'intermediate');
  assert.match(s.headline, /^You lost\. Your accuracy was \d+% \(error-prone\), with an average loss of \d+ centipawns over 3 decisions\.$/);
  assert.equal(s.lesson.ply, 6);
  assert.match(s.lesson.title, /move 3… \(Nf6\)/);
  assert.match(s.lesson.paragraphs.join(' '), /force checkmate/);
  assert.ok(s.weaknesses.some((w) => w.id === 'costly-errors' && w.ply === 6));
  assert.ok(s.weaknesses.some((w) => w.id === 'tag-allowed-mate'));
  assert.ok(s.focus.startsWith('For your next games:'));
  assert.equal(s.comparison, null); // no history
});

test('summary: comparison and recurring patterns need real history', () => {
  const a = analyseReview(scholar('black'));
  const two = [ev({ accuracy: 70 }), ev({ accuracy: 80 })];
  assert.equal(summarise(a, '1-0', two, 'beginner').comparison, null);
  const hist = [ev({ at: 1, accuracy: 80, weaknesses: ['allowed-mate'] }), ev({ at: 2, accuracy: 80, weaknesses: ['allowed-mate'] }), ev({ at: 3, accuracy: 80 })];
  const s = summarise(a, '1-0', hist, 'beginner');
  assert.match(s.comparison!, /points below your average of 80% over your last 3 reviewed games/);
  assert.equal(s.recurring.length, 1);
  assert.match(s.recurring[0]!.text, /allowing a forced checkmate also showed up in 2 of your last 3 reviewed games/);
  assert.match(s.focus, /look at every check your opponent could give/);
});

test('summary: strengths are earned from rules, with the numbers behind them', () => {
  const clean = analyseReview(cleanGame());
  const s = summarise(clean, '1/2-1/2', [], 'beginner');
  assert.ok(s.strengths.some((x) => x.id === 'no-blunders'), JSON.stringify(s.strengths));
  assert.ok(s.strengths.some((x) => x.id === 'engine-matches' && /10 of 10 moves/.test(x.text)));
  assert.match(s.lesson.paragraphs[0]!, /within 1 point/);
  assert.equal(s.weaknesses[0]!.id, 'none');
  const white = analyseReview(scholar('white'));
  const w = summarise(white, '1-0', [], 'beginner');
  assert.ok(w.strengths.some((x) => x.id === 'found-tactics' && x.ply === 7));
});

test('summary: a neutral view when no side is chosen, and limits are stated honestly', () => {
  const s = summarise(analyseReview(scholar(null)), '1-0', [], 'beginner');
  assert.equal(s.side, null);
  assert.match(s.headline, /^White: .*Black: /);
  assert.match(s.focus, /Choose which side/);
  assert.ok(s.lesson.ply === 6);
  const builtin = analyseReview(scholar('black', ['Built-in engine']));
  assert.ok(summarise(builtin, '1-0', [], 'beginner').caveats.some((c) => /built-in engine/i.test(c)));
  const shallow = scholar('black');
  shallow.positions.forEach((p) => p && !p.final && (p.depth = 8));
  assert.ok(summarise(analyseReview(shallow), '1-0', [], 'beginner').caveats.some((c) => /shallow/.test(c)));
  assert.deepEqual(summarise(analyseReview(scholar('black')), '1-0', [], 'beginner').caveats, []);
});

test('every completed game teaches something: a lesson and a focus always exist', () => {
  for (const r of [scholar('black'), scholar('white'), scholar(null), hungKnight(), missedQueen(), thrownAdvantage(), forcedMove(), cleanGame()]) {
    for (const level of LEVELS) {
      const s = summarise(analyseReview(r), '1-0', [], level);
      assert.ok(s.lesson.paragraphs.join('').length > 20, `${r.gameId}: lesson`);
      assert.ok(s.focus.length > 20, `${r.gameId}: focus`);
      assert.ok(s.headline.length > 10);
    }
  }
});

/* ------------------------------ profile record and notebook ------------------------------ */

test('the Profile record carries the player’s figures only', () => {
  const e = buildReviewEvent(analyseReview(scholar('black')), 42)!;
  assert.equal(e.id, 'review:scholar');
  assert.equal(e.kind, 'review');
  assert.equal(e.gameId, 'scholar');
  assert.equal(e.at, 42);
  assert.equal(e.blunders, 1);
  assert.equal(e.mistakes, 0);
  assert.deepEqual(e.weaknesses, ['allowed-mate']);
  assert.ok(e.phaseAcpl.opening! > 100); // Black's three opening moves include the blunder
  assert.equal(e.phaseAcpl.middlegame, null); // no moves in these phases: nothing is reported
  assert.equal(e.phaseAcpl.endgame, null);
  assert.equal(buildReviewEvent(analyseReview(scholar(null)), 1), null);
});

test('learning items are the player’s mistakes with a verified solution, ready for a future trainer', () => {
  const items = learningItems(analyseReview(scholar('black')));
  assert.equal(items.length, 1);
  const it = items[0]!;
  assert.equal(it.id, 'scholar:6');
  assert.equal(it.sideToMove, 'black');
  assert.equal(it.solution.move, 'g7g6');
  assert.equal(it.played.move, 'g8f6');
  assert.deepEqual(it.tags, ['allowed-mate']);
  assert.equal(it.fen.split(' ')[1], 'b');
  assert.equal(it.engine, 'Stockfish 19 (lite)');
  assert.deepEqual(learningItems(analyseReview(scholar(null))), []);
  assert.equal(learningItems(analyseReview(cleanGame())).length, 0);
});
