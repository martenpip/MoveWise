import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkMotif, CHECKED_THEMES } from '../src/puzzles/motif';
import { COURSES } from '../src/academy/curriculum';
import { TP } from '../src/academy/content/tactic-positions';
import type { PuzzlePack } from '../src/puzzles/types';

/** A puzzle is [the opponent's move, then ours]; each case here has a quiet pawn move to start. */
const yes = (fen: string, moves: string[], theme: string) => assert.equal(checkMotif({ fen, moves }, theme), 'confirmed', `${theme} should be found`);
const no = (fen: string, moves: string[], theme: string) => assert.equal(checkMotif({ fen, moves }, theme), 'not-found', `${theme} should not be found`);

test('motif: a knight fork of king and rook is found, and a quiet king move is not a fork', () => {
  const fen = 'r3k3/7p/8/1N6/8/8/8/4K3 b - - 0 1';
  yes(fen, ['h7h6', 'b5c7'], 'fork');
  no(fen, ['h7h6', 'e1e2'], 'fork');
});

test('motif: a rook move that pins a knight to its king is a pin; the same rook elsewhere is not', () => {
  const fen = '4k3/4n2p/8/8/8/8/8/R5K1 b - - 0 1';
  yes(fen, ['h7h6', 'a1e1'], 'pin');
  no(fen, ['h7h6', 'a1a2'], 'pin');
});

test('motif: a rook check with a rook behind the king is a skewer', () => {
  const fen = '8/7p/8/4k2r/8/8/8/R3K3 b - - 0 1';
  yes(fen, ['h7h6', 'a1a5'], 'skewer');
  no(fen, ['h7h6', 'a1a2'], 'skewer');
});

test('motif: moving a bishop off the e-file uncovers the rook (discovered attack), and a double check is two checkers', () => {
  yes('4k3/7p/8/8/8/8/4B3/4R1K1 b - - 0 1', ['h7h6', 'e2d3'], 'discoveredAttack');
  yes('4k3/7p/4N3/8/8/8/8/4R1K1 b - - 0 1', ['h7h6', 'e6c7'], 'doubleCheck');
  no('4k3/7p/4N3/8/8/8/8/4R1K1 b - - 0 1', ['h7h6', 'e6d4'], 'doubleCheck');
});

test('motif: a rook mate on the back rank is a back-rank mate', () => {
  yes('6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1', ['g8h8', 'a1a8'], 'backRankMate');
  no('6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1', ['g8h8', 'a1a2'], 'backRankMate');
});

test('motif: themes without a detector are reported as unchecked, never as confirmed', () => {
  for (const t of ['deflection', 'attraction', 'interference', 'clearance', 'intermezzo', 'zugzwang']) {
    assert.ok(!CHECKED_THEMES.has(t));
    assert.equal(checkMotif({ fen: '6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1', moves: ['g8h8', 'a1a8'] }, t), 'unchecked');
  }
});

test('motif: on the bundled collection every detector finds most of its tagged puzzles but does not fire on everything', () => {
  const pack = JSON.parse(readFileSync(new URL('../public/puzzles/lichess-starter.json', import.meta.url), 'utf8')) as PuzzlePack;
  for (const t of CHECKED_THEMES) {
    const tagged = pack.puzzles.filter((p) => p.themes.includes(t));
    const other = pack.puzzles.filter((p) => !p.themes.includes(t));
    const hit = tagged.filter((p) => checkMotif({ fen: p.fen, moves: p.moves.split(' ') }, t) === 'confirmed').length;
    const stray = other.filter((p) => checkMotif({ fen: p.fen, moves: p.moves.split(' ') }, t) === 'confirmed').length;
    assert.ok(hit / tagged.length >= 0.7, `${t}: confirmed ${hit}/${tagged.length}`);
    assert.ok(stray / other.length <= 0.4, `${t}: fires on ${stray}/${other.length} untagged puzzles`);
  }
});

test('lesson puzzles: every puzzle a lesson uses for a checkable theme shows that pattern in its own position', () => {
  const byFen = new Map(Object.entries(TP).map(([id, t]) => [t.fen, id]));
  const pack = JSON.parse(readFileSync(new URL('../public/puzzles/lichess-starter.json', import.meta.url), 'utf8')) as PuzzlePack;
  const byId = new Map(pack.puzzles.map((p) => [p.id.slice(3), p]));
  const bad: string[] = [];
  let checked = 0;
  for (const c of COURSES) for (const ch of c.chapters) for (const l of ch.lessons) {
    const themes = (l.puzzleThemes ?? []).filter((t) => CHECKED_THEMES.has(t));
    if (!themes.length) continue;
    const ids = new Set<string>();
    for (const s of l.steps) {
      if (s.kind === 'move' && s.id.startsWith('ex-')) ids.add(s.id.slice(3));
      if (s.kind === 'demo') { const id = byFen.get(s.board.fen); if (id) ids.add(id); }
    }
    for (const q of l.check) if (q.kind === 'move' && q.id.startsWith('q-')) ids.add(q.id.slice(2));
    for (const id of ids) {
      const p = byId.get(id);
      if (!p) continue;
      checked++;
      if (!themes.some((t) => checkMotif({ fen: p.fen, moves: p.moves.split(' ') }, t) === 'confirmed')) bad.push(`${l.id}: ${id}`);
    }
  }
  assert.ok(checked >= 40, `${checked} lesson puzzles were checked`);
  assert.deepEqual(bad, []);
});
