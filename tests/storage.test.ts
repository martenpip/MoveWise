import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, validateCurrentGame, validateGame, validateProfile, validateSettings } from '../src/storage/backup';
import { MemoryStore } from '../src/storage/store';
import { BOARD_THEMES, DEFAULT_SETTINGS, type SavedGame } from '../src/storage/types';
import { START_FEN } from '../src/chess/types';

const game = (id: string, t: number): SavedGame => ({
  id,
  createdAt: t,
  white: 'You',
  black: 'Bot',
  human: 'white',
  botLevel: 'casual',
  botPersonality: 'balanced',
  startFen: START_FEN,
  uciMoves: ['e2e4', 'e7e5'],
  result: '1-0',
  reason: 'resignation',
  source: 'played',
  takebacks: 0,
});

test('backup export then import restores games and settings', async () => {
  const a = new MemoryStore();
  await a.putGame(game('g1', 1));
  await a.putGame(game('g2', 2));
  await a.putSettings({ ...DEFAULT_SETTINGS, theme: 'dark', sound: { ...DEFAULT_SETTINGS.sound, volume: 0.4, board: false } });
  const backup = JSON.parse(JSON.stringify(await a.exportAll()));

  const b = new MemoryStore();
  const res = await b.importAll(backup);
  assert.equal(res.games, 2);
  assert.deepEqual((await b.listGames()).map((g) => g.id), ['g2', 'g1']); // newest first
  assert.equal((await b.getSettings()).theme, 'dark');
});

test('import rejects foreign or corrupt files and applies nothing', async () => {
  const s = new MemoryStore();
  await assert.rejects(() => s.importAll({ hello: 'world' }), /not a MoveWise backup/);
  await assert.rejects(() => s.importAll({ app: 'MoveWise', version: 99, games: [] }), /Unsupported/);
  await assert.rejects(
    () => s.importAll({ app: 'MoveWise', version: 1, games: [game('ok', 1), { id: 'bad' }] }),
    /Game 2/,
  );
  assert.equal((await s.listGames()).length, 0);
});

test('clearAll resets everything', async () => {
  const s = new MemoryStore();
  await s.putGame(game('g', 1));
  await s.clearAll();
  assert.equal((await s.listGames()).length, 0);
});

test('backup round-trips the profile and activity records', async () => {
  const a = new MemoryStore();
  await a.putGame(game('g1', 1));
  await a.putProfile({ displayName: 'Ada', avatar: { kind: 'piece', color: 'teal', piece: 'queen' }, startedAt: 1234, ratingEpoch: 99 });
  await a.addActivity({ id: 'p1', kind: 'puzzle', at: 5, puzzleId: 'x', puzzleRating: 1400, solved: true, timeMs: 8000, hintsUsed: 0, themes: ['fork'] });
  const backup = JSON.parse(JSON.stringify(await a.exportAll()));
  assert.equal(backup.version, 3);

  const b = new MemoryStore();
  const res = await b.importAll(backup);
  assert.deepEqual(res, { games: 1, activity: 1, achievements: 0 });
  assert.deepEqual(await b.getProfile(), { displayName: 'Ada', avatar: { kind: 'piece', color: 'teal', piece: 'queen' }, startedAt: 1234, ratingEpoch: 99 });
  assert.equal((await b.listActivity()).length, 1);
});

test('version 1 backups (no profile or activity) still import', async () => {
  const s = new MemoryStore();
  const res = await s.importAll({ app: 'MoveWise', version: 1, settings: {}, games: [game('old', 1)], currentGame: null });
  assert.equal(res.games, 1);
  assert.equal(await s.getProfile(), null);
});

test('profile validation cleans names and rejects nothing silently dangerous', () => {
  assert.equal(cleanName('  Ada\u0000   Lovelace  '), 'Ada Lovelace');
  assert.equal(cleanName(''), 'Player');
  assert.equal(cleanName(42), 'Player');
  assert.equal(cleanName('x'.repeat(100)).length, 24);
  const p = validateProfile({ displayName: '<b>Eve</b>', avatar: { kind: 'bogus', color: 'nope', piece: 7 }, startedAt: 'yesterday', ratingEpoch: -5 })!;
  assert.equal(p.displayName, '<b>Eve</b>'); // stored as plain text; the UI never injects it as HTML
  assert.deepEqual(p.avatar, { kind: 'initials', color: 'gold', piece: 'knight' });
  assert.equal(p.ratingEpoch, 0);
  assert.equal(validateProfile('nope'), null);
});

test('activity validation rejects malformed records and bad kinds', async () => {
  const s = new MemoryStore();
  const base = { app: 'MoveWise', version: 2, games: [] };
  await assert.rejects(() => s.importAll({ ...base, activity: [{ id: 'a', kind: 'dance', at: 1 }] }), /unknown kind/);
  await assert.rejects(() => s.importAll({ ...base, activity: [{ kind: 'puzzle', at: 1 }] }), /missing an id/);
  await assert.rejects(() => s.importAll({ ...base, activity: [{ id: 'a', kind: 'puzzle' }] }), /missing a date/);
  assert.equal((await s.listActivity()).length, 0);
});

test('take-backs survive validation and default to zero', () => {
  assert.equal(validateGame({ ...game('t', 1), takebacks: 3 }).takebacks, 3);
  assert.equal(validateGame({ ...game('t', 1), takebacks: -2 }).takebacks, 0);
  assert.equal(validateGame(game('t', 1)).takebacks, 0);
  assert.equal(validateCurrentGame({ startFen: START_FEN, uciMoves: [], human: 'white' })!.takebacks, 0);
});

test('clearAll also removes the profile and activity', async () => {
  const s = new MemoryStore();
  await s.putProfile({ displayName: 'Ada', avatar: { kind: 'initials', color: 'gold', piece: 'knight' }, startedAt: 1, ratingEpoch: 0 });
  await s.addActivity({ id: 'l1', kind: 'lesson', at: 1, lessonId: 'a', topic: 'forks', completed: true, score: 1 });
  await s.clearAll();
  assert.equal(await s.getProfile(), null);
  assert.equal((await s.listActivity()).length, 0);
});

test('a new installation defaults to the dark theme and an invalid theme falls back to dark', () => {
  assert.equal(DEFAULT_SETTINGS.theme, 'dark');
  assert.equal(validateSettings(undefined).theme, 'dark');
  assert.equal(validateSettings({ theme: 'purple' }).theme, 'dark');
  assert.equal(validateSettings({ theme: 'light' }).theme, 'light');
  assert.equal(validateSettings({ theme: 'system' }).theme, 'system');
});

test('every board theme survives validation and unknown ones fall back', () => {
  for (const t of BOARD_THEMES) assert.equal(validateSettings({ boardTheme: t }).boardTheme, t);
  assert.equal(validateSettings({ boardTheme: 'neon' }).boardTheme, DEFAULT_SETTINGS.boardTheme);
  assert.ok(BOARD_THEMES.length >= 6);
});
