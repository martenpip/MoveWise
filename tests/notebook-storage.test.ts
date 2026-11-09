import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseReview } from '../src/review/analyse';
import { autoEntries } from '../src/notebook/capture';
import { fromLearningPosition } from '../src/notebook/legacy';
import { recordAttempt, removeEntry, saveFromReview, saveMove } from '../src/notebook/service';
import { parseNotebook, validateNotebook, validateSettings } from '../src/storage/backup';
import { MemoryStore } from '../src/storage/store';
import { DEFAULT_SETTINGS, type SavedGame } from '../src/storage/types';
import { START_FEN } from '../src/chess/types';
import type { LearningPosition } from '../src/puzzles/learn';
import { hungKnight, HUNG_MOVES } from './review-fixtures';
import { at } from './helpers';

const NOW = at(2026, 3, 10, 9);
const info = (id: string) => ({ gameId: id, white: 'You', black: 'Bot', playedAt: NOW });
const game = (id: string): SavedGame => ({
  id, createdAt: NOW, white: 'You', black: 'Bot', human: 'white', botLevel: 'casual', botPersonality: 'balanced',
  startFen: START_FEN, uciMoves: HUNG_MOVES, result: '1-0', reason: null, source: 'played', takebacks: 0,
});

test('notebook: settings default to auto-save and tolerate garbage', () => {
  assert.equal(DEFAULT_SETTINGS.notebook.autoSave, true);
  assert.equal(validateSettings({}).notebook.autoSave, true);
  assert.equal(validateSettings({ notebook: { autoSave: false } }).notebook.autoSave, false);
  assert.equal(validateSettings({ notebook: { autoSave: 'no' } }).notebook.autoSave, true);
  assert.equal(validateSettings({ notebook: 7 }).notebook.autoSave, true);
});

test('notebook: saving the same review twice never duplicates entries', async () => {
  const store = new MemoryStore();
  const analysis = analyseReview(hungKnight());
  const a = await saveFromReview(store, analysis, info('g1'), NOW);
  assert.ok(a.added.length >= 1);
  const b = await saveFromReview(store, analysis, info('g1'), NOW + 1000);
  assert.equal(b.added.length, 0);
  assert.equal((await store.listNotebook()).length, a.added.length);
});

test('notebook: deleting the game keeps the saved entries', async () => {
  const store = new MemoryStore();
  await store.putGame(game('g1'));
  await saveFromReview(store, analyseReview(hungKnight()), info('g1'), NOW);
  const before = (await store.listNotebook()).length;
  assert.ok(before > 0);
  await store.deleteGame('g1');
  assert.equal((await store.listNotebook()).length, before);
});

test('notebook: backup round trip preserves entries and schedule', async () => {
  const a = new MemoryStore();
  await saveFromReview(a, analyseReview(hungKnight()), info('g1'), NOW);
  const [e] = await a.listNotebook();
  await recordAttempt(a, e.id, { wrong: 0, hints: 0, solved: true, revealed: false }, NOW + 5000);
  const file = JSON.parse(JSON.stringify(await a.exportAll()));
  const b = new MemoryStore();
  await b.importAll(file);
  const got = await b.getNotebook(e.id);
  assert.ok(got);
  assert.equal(got.srs.attempts, 1);
  assert.equal(got.srs.lastGrade, 'easy');
});

test('notebook: import keeps the newer local copy', async () => {
  const a = new MemoryStore();
  await saveFromReview(a, analyseReview(hungKnight()), info('g1'), NOW);
  const old = JSON.parse(JSON.stringify(await a.exportAll()));
  const [e] = await a.listNotebook();
  await recordAttempt(a, e.id, { wrong: 0, hints: 0, solved: true, revealed: false }, NOW + 9999);
  await a.importAll(old);
  assert.equal((await a.getNotebook(e.id))!.srs.attempts, 1);
});

test('notebook: validation drops malformed entries and clamps numbers', async () => {
  const a = new MemoryStore();
  await saveFromReview(a, analyseReview(hungKnight()), info('g1'), NOW);
  const [e] = await a.listNotebook();
  const bad = JSON.parse(JSON.stringify(e));
  bad.srs.ease = 99;
  bad.srs.intervalDays = 1e9;
  const ok = validateNotebook(bad);
  assert.ok(ok);
  assert.ok(ok.srs.ease <= 3.0);
  assert.ok(ok.srs.intervalDays <= 365);
  assert.throws(() => validateNotebook({ ...e, id: 'nb:forged' }));
  assert.throws(() => validateNotebook({ ...e, fen: 'nonsense' }));
  assert.throws(() => validateNotebook(null));
  assert.throws(() => validateNotebook('x'));
  const parsed = parseNotebook([e, { ...e, id: 'nb:forged' }, null, 'x']);
  assert.equal(parsed.length, 1);
});

test('notebook: manual save works for any move and merges with an auto save', async () => {
  const store = new MemoryStore();
  const analysis = analyseReview(hungKnight());
  const auto = autoEntries(analysis, info('g1'), NOW);
  assert.ok(auto.length > 0);
  const ply = auto[0].origin.ply!;
  const first = await saveMove(store, analysis, ply, info('g1'), NOW);
  assert.ok(first && !first.existed);
  const again = await saveMove(store, analysis, ply, info('g1'), NOW + 1);
  assert.ok(again && again.existed);
  assert.equal((await store.listNotebook()).length, 1);
  assert.equal(await saveMove(store, analysis, 9999, info('g1'), NOW), null);
});

test('notebook: removeEntry deletes and recordAttempt on a missing id is a no-op', async () => {
  const store = new MemoryStore();
  await saveFromReview(store, analyseReview(hungKnight()), info('g1'), NOW);
  const [e] = await store.listNotebook();
  assert.equal(await recordAttempt(store, 'nb:none', { wrong: 0, hints: 0, solved: true, revealed: false }, NOW), null);
  await removeEntry(store, e.id);
  assert.equal(await store.getNotebook(e.id), undefined);
});

test('notebook: clearAll empties the notebook', async () => {
  const store = new MemoryStore();
  await saveFromReview(store, analyseReview(hungKnight()), info('g1'), NOW);
  await store.clearAll();
  assert.equal((await store.listNotebook()).length, 0);
});

test('notebook: legacy practice positions convert, and bad ones are skipped', () => {
  const lp: LearningPosition = {
    id: 'g1:5', gameId: 'g1', ply: 5, createdAt: NOW, scored: true,
    moves: ['e5f3', 'g1f3'], fen: '4k3/8/8/4n3/8/5N2/8/4K3 w - - 0 1',
    played: { uci: 'a', san: 'Nxe5' }, best: { uci: 'g1f3', san: 'Nf3' }, engine: 'sf', winLoss: 20, tags: ['hung-piece'], themes: [],
    tries: 0,
  };
  const bad = fromLearningPosition({ ...lp, moves: ['zzzz'] });
  assert.equal(bad, null);
  const bad2 = fromLearningPosition({ ...lp, fen: 'not a fen' });
  assert.equal(bad2, null);
});
