import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/storage/store';
import { DEFAULT_SETTINGS } from '../src/storage/types';
import { DEFAULT_TRAINER_PREFS } from '../src/trainer/types';

test('release data: Trainer preferences and Trainer game mode survive export and import', async () => {
  const a = new MemoryStore();
  await a.putSettings({ ...DEFAULT_SETTINGS, trainer: { ...DEFAULT_TRAINER_PREFS, speech: true, voiceGender: 'male', voiceURI: 'v1', volume: 0.3, detail: 'concise' } });
  await a.putGame({ id: 'g1', createdAt: 1, white: 'You', black: 'Bot 300', human: 'white', botLevel: 'r300', botPersonality: 'balanced', startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', uciMoves: ['e2e4', 'e7e5'], result: '1-0', reason: 'resignation', source: 'played', takebacks: 0, mode: 'trainer' });
  const file = JSON.parse(JSON.stringify(await a.exportAll()));
  const b = new MemoryStore();
  await b.importAll(file);
  const s = await b.getSettings();
  assert.deepEqual(s.trainer, { ...DEFAULT_TRAINER_PREFS, speech: true, voiceGender: 'male', voiceURI: 'v1', volume: 0.3, detail: 'concise' });
  assert.equal((await b.getGame('g1'))!.mode, 'trainer');
});

test('release data: a backup from before v0.8 (no trainer, notebook or mode fields) imports with defaults and keeps its games', async () => {
  const a = new MemoryStore();
  await a.putGame({ id: 'old', createdAt: 5, white: 'You', black: 'Casual', human: 'white', botLevel: 'casual', botPersonality: 'balanced', startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', uciMoves: ['e2e4'], result: '1/2-1/2', reason: null, source: 'played', takebacks: 0 });
  const file = JSON.parse(JSON.stringify(await a.exportAll()));
  delete file.settings.trainer;
  delete file.settings.notebook;
  delete file.notebook;
  file.version = 2;
  const b = new MemoryStore();
  await b.importAll(file);
  const s = await b.getSettings();
  assert.deepEqual(s.trainer, DEFAULT_TRAINER_PREFS);
  assert.equal(s.notebook.autoSave, true);
  assert.equal((await b.getGame('old'))!.botLevel, 'casual', 'the saved level id is kept, not rewritten');
  assert.equal((await b.getGame('old'))!.mode, undefined);
  assert.equal((await b.listNotebook()).length, 0);
});

test('release data: a malformed backup is rejected without touching existing data', async () => {
  const a = new MemoryStore();
  await a.putGame({ id: 'keep', createdAt: 1, white: 'You', black: 'Bot', human: 'white', botLevel: 'r500', botPersonality: 'balanced', startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', uciMoves: ['e2e4'], result: '1-0', reason: null, source: 'played', takebacks: 0 });
  await assert.rejects(a.importAll({ app: 'MoveWise', version: 3, games: 'nope' }));
  await assert.rejects(a.importAll('garbage'));
  assert.equal((await a.listGames()).length, 1);
});
