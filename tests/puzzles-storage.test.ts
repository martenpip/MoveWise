import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBackup, parseBackup, validateDaily, validateLearning, validateRush } from '../src/storage/backup';
import { MemoryStore } from '../src/storage/store';
import { BACKUP_VERSION, DEFAULT_SETTINGS, EMPTY_PUZZLE_DATA, type SavedGame } from '../src/storage/types';
import { START_FEN } from '../src/chess/types';
import { makeEvent } from '../src/puzzles/attempt';
import { checkPack } from '../src/puzzles/library';
import { toPuzzle } from '../src/puzzles/validate';
import { puzzleStats } from '../src/profile/training';
import { evaluateAchievements } from '../src/profile/achievements';
import { buildRating } from '../src/profile/rating';
import type { PuzzlePack } from '../src/puzzles/types';
import type { LearningPosition } from '../src/puzzles/learn';
import type { ActivityEvent } from '../src/profile/types';

const pack = JSON.parse(readFileSync(new URL('../public/puzzles/lichess-starter.json', import.meta.url), 'utf8')) as PuzzlePack;
const sample = pack.puzzles.slice(0, 3);
const puzzle = toPuzzle(sample[0]!, pack.id);

const savedGame = (id: string): SavedGame => ({
  id, createdAt: 1, white: 'You', black: 'Bot', human: 'white', botLevel: 'casual', botPersonality: 'balanced',
  startFen: START_FEN, uciMoves: ['e2e4'], result: '*', reason: null, source: 'played',
} as unknown as SavedGame);

const position = (id = 'g1:5'): LearningPosition => ({
  id, gameId: id.split(':')[0]!, ply: Number(id.split(':')[1]), createdAt: 5, scored: false,
  moves: puzzle.moves.slice(0, 2), fen: puzzle.fen, played: { uci: 'a2a3', san: 'a3' }, best: { uci: puzzle.moves[1]!, san: 'x' },
  engine: 'Stockfish 19 (lite)', winLoss: 22, tags: [], themes: [], tries: 0,
});

test('the bundled pack is a valid pack: every puzzle replays, and its licence and source are stated', () => {
  const c = checkPack(pack);
  assert.ok(c.pack);
  assert.equal(c.rejected.length, 0, JSON.stringify(c.rejected.slice(0, 3)));
  assert.equal(c.accepted, pack.puzzles.length);
  assert.equal(pack.license, 'CC0-1.0');
  assert.match(pack.attribution, /Lichess/);
});

test('daily records, rush scores, packs and learning positions are stored, listed and removed', async () => {
  const s = new MemoryStore();
  await s.putDaily({ date: '2026-07-01', puzzleId: puzzle.id, targetRating: 1000, pickedAt: 1 });
  assert.equal((await s.getDaily('2026-07-01'))?.puzzleId, puzzle.id);
  assert.equal((await s.listDaily()).length, 1);
  await s.putRush({ id: 'r1', at: 1, minutes: 3, solved: 4, strikes: 3, best: 1200 });
  assert.equal((await s.listRush())[0]!.solved, 4);
  const c = checkPack({ ...pack, id: 'mine', name: 'Mine', puzzles: sample });
  await s.putPack(c.pack!);
  assert.equal((await s.listPacks()).length, 1);
  await s.deletePack('mine');
  assert.equal((await s.listPacks()).length, 0);
  await s.putLearning(position());
  assert.equal((await s.getLearning('g1:5'))?.tries, 0);
  await s.deleteLearning('g1:5');
  assert.equal(await s.getLearning('g1:5'), undefined);
});

test('deleting a game also removes the practice positions taken from it, and only those', async () => {
  const s = new MemoryStore();
  await s.putGame(savedGame('g1'));
  await s.putGame(savedGame('g2'));
  await s.putLearning(position('g1:5'));
  await s.putLearning(position('g2:7'));
  await s.deleteGame('g1');
  assert.deepEqual((await s.listLearning()).map((p) => p.id), ['g2:7']);
});

test('a backup carries puzzle data and restores it; the format version is unchanged', async () => {
  const s = new MemoryStore();
  await s.putDaily({ date: '2026-07-01', puzzleId: puzzle.id, targetRating: 1000, pickedAt: 1, solvedAt: 9, clean: true });
  await s.putRush({ id: 'r1', at: 1, minutes: 5, solved: 7, strikes: 1, best: 1300 });
  await s.putLearning(position());
  await s.addActivity(makeEvent({ puzzle, mode: 'practice', sittingId: 'a', at: 10, timeMs: 5000, hintsUsed: 0, wrongMoves: 0, usedSolution: false, solved: true, rated: true }));
  const file = await s.exportAll();
  assert.equal(file.version, BACKUP_VERSION);
  assert.equal(BACKUP_VERSION, 3);
  assert.equal(file.puzzles?.daily.length, 1);
  const t = new MemoryStore();
  await t.importAll(JSON.parse(JSON.stringify(file)));
  assert.equal((await t.getDaily('2026-07-01'))?.solvedAt, 9);
  assert.equal((await t.listRush()).length, 1);
  assert.equal((await t.listLearning()).length, 1);
  const act = await t.listActivity();
  assert.equal(act.length, 1);
  assert.equal(act[0]!.kind === 'puzzle' && act[0]!.rated, true);
});

test('backups made before puzzles existed still import, with empty puzzle data', () => {
  const old = { app: 'MoveWise', version: 3, exportedAt: 'x', settings: DEFAULT_SETTINGS, games: [], currentGame: null, profile: null, activity: [], achievements: null };
  const p = parseBackup(old);
  assert.deepEqual(p.puzzles, EMPTY_PUZZLE_DATA);
  assert.equal(buildBackup(DEFAULT_SETTINGS, [], null, null, [], null, [], null).puzzles, undefined);
});

test('invalid puzzle data in a backup is dropped, the rest imports', () => {
  const file = {
    app: 'MoveWise', version: 3, exportedAt: 'x', settings: DEFAULT_SETTINGS, games: [], currentGame: null, profile: null, activity: [], achievements: null,
    puzzles: {
      daily: [{ date: 'yesterday', puzzleId: 'x' }, { date: '2026-07-02', puzzleId: puzzle.id, targetRating: 900, pickedAt: 1 }],
      rush: [{ id: 'r', minutes: 7, solved: 1 }, { id: 'ok', at: 1, minutes: 10, solved: 2, strikes: 0, best: 1000 }],
      positions: [{ ...position(), moves: ['e2e4', 'a1a8'] }, position()],
      packs: [{ nonsense: true }, { ...pack, id: 'mine', name: 'Mine', puzzles: [...sample, { id: 'bad', fen: 'nope', moves: 'e2e4 e7e5', rating: 1000, rd: 50, themes: [] }] }],
    },
  };
  const p = parseBackup(file);
  assert.equal(p.puzzles.daily.length, 1);
  assert.equal(p.puzzles.rush.length, 1);
  assert.equal(p.puzzles.positions.length, 1);
  assert.equal(p.puzzles.packs.length, 1);
  assert.equal(p.puzzles.packs[0]!.puzzles.length, 3, 'the bad puzzle is dropped, the valid ones kept');
  assert.throws(() => validateDaily({ date: '2026-07-02' }));
  assert.throws(() => validateRush({ id: 'r', minutes: 4 }));
  assert.throws(() => validateLearning({ id: 'a', gameId: 'g', fen: 'bad', moves: [] }));
});

test('importing never overwrites a daily puzzle already chosen for that date', async () => {
  const s = new MemoryStore();
  await s.putDaily({ date: '2026-07-01', puzzleId: 'li:keep', targetRating: 1000, pickedAt: 1 });
  await s.importAll({
    app: 'MoveWise', version: 3, exportedAt: 'x', settings: DEFAULT_SETTINGS, games: [], currentGame: null, profile: null, activity: [], achievements: null,
    puzzles: { daily: [{ date: '2026-07-01', puzzleId: 'li:other', targetRating: 1000, pickedAt: 2 }, { date: '2026-07-03', puzzleId: 'li:new', targetRating: 1000, pickedAt: 2 }] },
  });
  assert.equal((await s.getDaily('2026-07-01'))?.puzzleId, 'li:keep');
  assert.equal((await s.getDaily('2026-07-03'))?.puzzleId, 'li:new');
});

test('an attempt record: one id per sitting, no theme for an unscored exercise, never rated for custom or Rush', () => {
  const base = { puzzle, mode: 'practice' as const, sittingId: 's1', at: 1, timeMs: 1200, hintsUsed: 2, wrongMoves: 1, usedSolution: false, solved: true, rated: true };
  const e = makeEvent(base);
  assert.equal(e.id, 'puzzle:s1');
  assert.equal(e.rated, true);
  assert.equal(e.hintsUsed, 2);
  assert.ok(e.themes.length > 0);
  assert.equal(makeEvent({ ...base, mode: 'rush' }).rated, false);
  const custom = { ...puzzle, id: 'game:g:5', custom: { gameId: 'g', ply: 5, scored: false, played: 'a2a3' }, themes: ['fork'] };
  const c = makeEvent({ ...base, puzzle: custom, mode: 'game' });
  assert.equal(c.rated, false);
  assert.deepEqual(c.themes, []);
});

test('own-game exercises stay out of puzzle statistics and puzzle achievements', () => {
  const mk = (id: string, puzzleId: string, mode: 'practice' | 'game', at: number): ActivityEvent => makeEvent({ puzzle: { ...puzzle, id: puzzleId }, mode, sittingId: id, at, timeMs: 1000, hintsUsed: 0, wrongMoves: 0, usedSolution: false, solved: true, rated: mode === 'practice' });
  const act = [mk('a', 'li:one', 'practice', 1), mk('b', 'game:g:5', 'game', 2), mk('c', 'game:g:7', 'game', 3), mk('d', 'game:g:9', 'game', 4)];
  const stats = puzzleStats(act);
  assert.equal(stats.attempts, 1);
  const list = evaluateAchievements({ games: [], activity: act, rating: buildRating([]) });
  const get = (id: string) => list.find((a) => a.id === id)!;
  assert.equal(get('first-puzzle').earned, true);
  assert.equal(get('tactical-thinker').progress.current, 1, 'exercises do not count as puzzles');
  assert.equal(get('mistake-fixer').earned, true, 'three own-game exercises solved');
});

test('daily and rush achievements come only from real daily and rush solves', () => {
  const DAYMS = 86_400_000;
  const base = new Date(2026, 5, 1, 12).getTime();
  const ev = (id: string, mode: 'daily' | 'rush', at: number, solved = true): ActivityEvent => makeEvent({ puzzle: { ...puzzle, id: `li:${id}` }, mode, sittingId: id, at, timeMs: 1000, hintsUsed: 0, wrongMoves: 0, usedSolution: false, solved, rated: false });
  const week = Array.from({ length: 7 }, (_, i) => ev(`d${i}`, 'daily', base + i * DAYMS));
  const replay = ev('replay', 'daily', base + 100);
  const get = (act: ActivityEvent[], id: string) => evaluateAchievements({ games: [], activity: act, rating: buildRating([]) }).find((a) => a.id === id)!;
  assert.equal(get(week, 'daily-solver').earned, true);
  assert.equal(get(week, 'daily-habit').earned, true);
  assert.equal(get([...week.slice(0, 6), replay], 'daily-habit').earned, false, 'a replay on an already counted day adds no day');
  assert.equal(get([ev('x', 'daily', base, false)], 'daily-solver').earned, false, 'an unsolved daily earns nothing');
  const rush = Array.from({ length: 25 }, (_, i) => ev(`r${i}`, 'rush', base + i));
  assert.equal(get(rush, 'rush-runner').earned, true);
  assert.equal(get(rush.slice(0, 24), 'rush-runner').earned, false);
});
