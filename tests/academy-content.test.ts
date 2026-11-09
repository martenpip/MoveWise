import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COURSES, CURRICULUM_INDEX, PATHS, TOTAL_LESSONS } from '../src/academy/curriculum';
import { TP } from '../src/academy/content/tactic-positions';
import { validateCurriculum } from '../src/academy/validate';
import { Position } from '../src/chess/position';
import { isCheckmate } from '../src/puzzles/validate';
import { THEMES } from '../src/puzzles/themes';
import { ACADEMY_SECTIONS } from '../src/academy/curriculum';
import { TAG_LABEL } from '../src/review/explain';
import type { PuzzlePack } from '../src/puzzles/types';
import type { Question, Step } from '../src/academy/types';

const lessons = CURRICULUM_INDEX.order.map((l) => l.lesson);
const pack = JSON.parse(readFileSync(new URL('../public/puzzles/lichess-starter.json', import.meta.url), 'utf8')) as PuzzlePack;

test('every line, position and answer in the curriculum is validated against the rules engine', () => {
  assert.deepEqual(validateCurriculum(COURSES, PATHS), []);
  assert.equal(lessons.length, TOTAL_LESSONS);
  assert.equal(new Set(lessons.map((l) => l.id)).size, lessons.length, 'lesson ids are unique');
  const qids = [...lessons.flatMap((l) => l.check), ...COURSES.flatMap((c) => [...c.chapters.flatMap((ch) => ch.check), ...c.assessment])].map((q) => q.id);
  assert.equal(new Set(qids).size, qids.length, 'question ids are unique across the whole curriculum');
});

test('the Beginner course covers the five required chapters', () => {
  const b = COURSES.find((c) => c.id === 'beginner')!;
  assert.equal(b.level, 'beginner');
  assert.deepEqual(b.chapters.map((c) => c.id), ['beginner-board', 'beginner-pieces', 'beginner-rules', 'beginner-first-game', 'beginner-principles']);
  const principles = b.chapters[4]!;
  assert.equal(principles.lessons.length, 8, 'eight principles');
  const ids = new Set(b.chapters.flatMap((c) => c.lessons.map((l) => l.id)));
  for (const id of ['the-king', 'the-queen', 'the-rook', 'the-bishop', 'the-knight', 'the-pawn', 'castling', 'en-passant', 'promotion', 'checkmate', 'stalemate', 'draws']) assert.ok(ids.has(id), `lesson ${id}`);
});

test('the Tactical Awareness course teaches the required tactical ideas', () => {
  const t = COURSES.find((c) => c.id === 'tactics')!;
  assert.equal(t.level, 'intermediate');
  assert.deepEqual(t.requires, ['beginner']);
  const ids = new Set(t.chapters.flatMap((c) => c.lessons.map((l) => l.id)));
  for (const id of ['tac-forks', 'tac-pins', 'tac-skewers', 'tac-discovered', 'tac-deflection', 'tac-attraction', 'tac-removing-defender', 'tac-interference', 'tac-clearance', 'tac-zwischenzug', 'tac-back-rank', 'tac-sacrifices']) assert.ok(ids.has(id), `lesson ${id}`);
});

test('size rules: lesson checks 2-5, chapter checks 4-8, course assessments 8-14, at most three hints, nothing empty', () => {
  for (const l of lessons) {
    assert.ok(l.check.length >= 2 && l.check.length <= 5, `${l.id} check size ${l.check.length}`);
    assert.ok(l.objectives.length >= 2 && l.objectives.length <= 3, `${l.id} objectives`);
    assert.ok(l.steps.some((s) => s.kind !== 'read' && s.kind !== 'demo'), `${l.id} has an interactive exercise`);
    for (const s of l.steps as Step[]) if ('hints' in s) assert.ok(s.hints.length >= 1 && s.hints.length <= 3, `${l.id}/${s.id} hints`);
    for (const q of l.check) assert.ok(q.explain.trim().length > 10, `${q.id} explanation`);
  }
  for (const c of COURSES) {
    assert.ok(c.assessment.length >= 8 && c.assessment.length <= 14, `${c.id} assessment size`);
    for (const ch of c.chapters) assert.ok(ch.check.length >= 4 && ch.check.length <= 8, `${ch.id} check size`);
  }
});

test('every question that names a lesson names one in its own course; assessment questions cover several lessons', () => {
  for (const c of COURSES) {
    const own = new Set(c.chapters.flatMap((ch) => ch.lessons.map((l) => l.id)));
    const check = (q: Question) => { if (q.lesson) assert.ok(own.has(q.lesson), `${q.id} -> ${q.lesson}`); };
    c.assessment.forEach(check);
    c.chapters.forEach((ch) => ch.check.forEach(check));
    assert.ok(new Set(c.assessment.map((q) => q.lesson)).size >= 5, `${c.id} assessment spreads over the course`);
  }
});

test('Phase 5 hooks: every lesson has concept ids, valid puzzle themes and valid Game Review tags', () => {
  const themes = new Set(THEMES.map((t) => t.id));
  const seen = new Set<string>();
  for (const l of lessons) {
    assert.ok(l.concepts && l.concepts.length > 0, `${l.id} has concepts`);
    for (const c of l.concepts!) {
      assert.match(c, /^[a-z]+\.[a-z0-9-]+$/, `${l.id}: concept "${c}"`);
      seen.add(c);
    }
    for (const t of l.puzzleThemes ?? []) assert.ok(themes.has(t), `${l.id}: unknown puzzle theme ${t}`);
    for (const t of l.reviewTags ?? []) assert.ok(t in TAG_LABEL, `${l.id}: unknown review tag ${t}`);
  }
  assert.ok(seen.size >= 40, 'many distinct concepts');
});

test('Profile sections list every lesson exactly once', () => {
  const all = Object.values(ACADEMY_SECTIONS).flat();
  assert.equal(all.length, lessons.length);
  assert.equal(new Set(all).size, all.length);
});

test('tactics positions are well-formed Lichess puzzles: legal solution lines, stated themes, and agreement with the bundled pack', () => {
  const byId = new Map(pack.puzzles.map((p) => [p.id, p]));
  let inPack = 0;
  const entries = Object.entries(TP);
  assert.ok(entries.length >= 100, `${entries.length} positions`);
  for (const [id, tp] of entries) {
    assert.match(id, /^[A-Za-z0-9]{5}$/, 'Lichess puzzle id');
    assert.ok(tp.themes.length > 0 && tp.rating > 0, id);
    const pos = new Position(tp.fen);
    for (const u of tp.line) {
      const m = pos.parseUci(u);
      assert.ok(m !== undefined, `${id}: ${u} is legal`);
      pos.makeMove(m!);
    }
    assert.equal(tp.line.length, tp.san.length);
    const p = byId.get(`li:${id}`);
    assert.ok(p, `${id} is in the bundled pack`);
    {
      inPack++;
      const start = new Position(p.fen);
      start.makeMove(start.parseUci(p.moves.split(' ')[0]!)!);
      assert.equal(start.toFen().split(' ').slice(0, 4).join(' '), tp.fen.split(' ').slice(0, 4).join(' '), `${id}: position after the set-up move`);
      assert.deepEqual(tp.line, p.moves.split(' ').slice(1), `${id}: solution line`);
    }
  }
  assert.equal(inPack, entries.length, 'every position comes from the bundled pack');
});

/* Rule facts the lessons rely on, checked with the rules engine rather than trusted. */
const status = (fen: string, uci?: string) => {
  const p = new Position(fen);
  if (uci) p.makeMove(p.parseUci(uci)!);
  return { mate: isCheckmate(p), stalemate: !p.inCheck() && p.legalMoves().length === 0, check: p.inCheck() };
};

test('stalemate and checkmate examples are what the lessons say they are', () => {
  const fen = '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1';
  assert.deepEqual(status(fen, 'f1f7'), { mate: false, stalemate: true, check: false }, 'Qf7 is stalemate');
  assert.deepEqual(status(fen, 'f1f8'), { mate: true, stalemate: false, check: true }, 'Qf8 is mate');
  assert.equal(status('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8').mate, true, 'back-rank mate');
  assert.equal(status('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', 'g1g7').mate, true, 'queen mate protected by the king');
});

test('castling lesson positions: the allowed castles are legal and the blocked one is not', () => {
  const legal = (fen: string, uci: string) => new Position(fen).parseUci(uci) !== undefined;
  assert.ok(legal('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'e1g1'));
  assert.ok(legal('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1', 'e1c1'));
  // the lesson's "cannot castle through an attacked square" position
  const cant = lessons.find((l) => l.id === 'castling')!.steps.find((s) => s.kind === 'ask' && s.id === 'cant-castle');
  assert.ok(cant && cant.kind === 'ask' && cant.board);
  assert.equal(legal(cant!.kind === 'ask' ? cant!.board!.fen : '', 'e1g1'), false, 'castling through the bishop\'s diagonal is illegal');
});

test('en passant and promotion examples are legal as taught', () => {
  const ep = lessons.find((l) => l.id === 'en-passant')!;
  const moves = ep.steps.filter((s) => s.kind === 'move');
  assert.ok(moves.length > 0);
  for (const m of moves) if (m.kind === 'move') {
    const pos = new Position(m.board.fen);
    const mv = pos.parseUci(m.line[0]!);
    assert.ok(mv !== undefined, `${m.id}: ${m.line[0]} is legal`);
  }
  const promo = lessons.find((l) => l.id === 'promotion')!;
  assert.ok(promo.steps.some((s) => s.kind === 'move' && /[qrbn]$/.test(s.line[0]!)), 'a promotion exercise names the promotion piece');
});
