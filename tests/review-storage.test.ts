import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReview, parseBackup } from '../src/storage/backup';
import { MemoryStore } from '../src/storage/store';
import { BACKUP_VERSION, type SavedGame } from '../src/storage/types';
import { START_FEN } from '../src/chess/types';
import { analyseReview } from '../src/review/analyse';
import { saveReview } from '../src/review/persist';
import { reviewEventId } from '../src/review/types';
import { qualityStats, reviews as reviewEvents } from '../src/profile/training';
import { scholar, hungKnight, SCHOLAR_MOVES } from './review-fixtures';

const savedGame = (id: string): SavedGame => ({
  id, createdAt: 1, white: 'You', black: 'Bot', human: 'black', botLevel: 'casual', botPersonality: 'balanced',
  startFen: START_FEN, uciMoves: SCHOLAR_MOVES, result: '1-0', reason: 'checkmate', source: 'played',
});

test('a saved review is stored once per game, written to the Profile, and replaced (not duplicated) when saved again', async () => {
  const s = new MemoryStore();
  await s.putGame(savedGame('scholar'));
  assert.equal(await saveReview(s, scholar('black'), 10), true);
  assert.equal((await s.getReview('scholar'))?.complete, true);
  assert.equal((await s.listReviews()).length, 1);
  let act = await s.listActivity();
  assert.equal(act.length, 1);
  assert.equal(act[0]!.id, reviewEventId('scholar'));
  await saveReview(s, scholar('black'), 20);
  act = await s.listActivity();
  assert.equal(act.length, 1);
  assert.equal(act[0]!.at, 20);
  const q = qualityStats(act);
  assert.equal(q.reviewedGames, 1);
  assert.equal(q.blundersPerGame, 1);
  assert.deepEqual(q.weaknesses, [{ tag: 'allowed-mate', count: 1 }]);
});

test('an unfinished review is kept for resuming and writes nothing to the Profile; no perspective means no Profile record', async () => {
  const s = new MemoryStore();
  const partial = scholar('black');
  partial.positions[4] = null;
  partial.complete = false;
  assert.equal(await saveReview(s, partial), false);
  assert.equal((await s.getReview('scholar'))?.positions[4], null);
  assert.equal((await s.listActivity()).length, 0);
  assert.equal(await saveReview(s, scholar('black')), true);
  assert.equal(await saveReview(s, scholar(null)), false); // now viewed as "not me": the Profile record goes away
  assert.equal((await s.listActivity()).length, 0);
  assert.equal(reviewEvents(await s.listActivity()).length, 0);
});

test('deleting a game removes its review and its Profile record; deleting only the review keeps the game', async () => {
  const s = new MemoryStore();
  await s.putGame(savedGame('scholar'));
  await s.putGame(savedGame('hung'));
  await saveReview(s, scholar('black'));
  await saveReview(s, hungKnight('white'));
  assert.equal((await s.listActivity()).length, 2);
  await s.deleteReview('hung');
  assert.ok(await s.getGame('hung'));
  assert.equal(await s.getReview('hung'), undefined);
  assert.deepEqual((await s.listActivity()).map((a) => a.id), [reviewEventId('scholar')]);
  await s.deleteGame('scholar');
  assert.equal(await s.getReview('scholar'), undefined);
  assert.equal((await s.listActivity()).length, 0);
});

test('backups carry reviews without changing the backup version, and older files still import', async () => {
  const a = new MemoryStore();
  await a.putGame(savedGame('scholar'));
  await saveReview(a, scholar('black'));
  const file = await a.exportAll();
  assert.equal(file.version, BACKUP_VERSION);
  assert.equal(file.version, 3);
  assert.equal(file.reviews?.length, 1);
  const b = new MemoryStore();
  await b.importAll(JSON.parse(JSON.stringify(file)));
  const back = await b.getReview('scholar');
  assert.ok(back?.complete);
  assert.deepEqual(analyseReview(back!).plies.map((p) => p.cls), analyseReview(scholar('black')).plies.map((p) => p.cls));
  assert.equal((await b.listActivity()).length, 1);

  const none = new MemoryStore();
  const plain = await none.exportAll();
  assert.equal('reviews' in plain, false); // nothing reviewed: the file is exactly as before
  const old = { app: 'MoveWise', version: 2, games: [savedGame('x')] };
  assert.deepEqual(parseBackup(old).reviews, []);
});

test('a damaged review in a backup is dropped; everything else in the file still imports', () => {
  const good = scholar('black');
  const broken = JSON.parse(JSON.stringify(scholar('white')));
  broken.gameId = 'broken';
  broken.positions[2].e = 7;
  const parsed = parseBackup({ app: 'MoveWise', version: 3, games: [savedGame('a')], reviews: [good, broken, 'junk', null] });
  assert.equal(parsed.games.length, 1);
  assert.deepEqual(parsed.reviews.map((r) => r.gameId), ['scholar']);
});

test('review validation refuses anything structurally wrong instead of repairing it', () => {
  const ok = () => JSON.parse(JSON.stringify(scholar()));
  assert.doesNotThrow(() => validateReview(ok()));
  const cases: Array<[string, (r: any) => void, RegExp]> = [
    ['version', (r) => (r.version = 2), /version/],
    ['no game id', (r) => (r.gameId = ''), /game id/],
    ['positions length', (r) => r.positions.pop(), /does not match/],
    ['claims complete but is not', (r) => (r.positions[3] = null), /complete/],
    ['bad move', (r) => (r.moves[1] = 'xx'), /move list/],
    ['bad score', (r) => (r.positions[1].cp = 'a'), /score/],
    ['score out of range', (r) => (r.positions[1].cp = 99999), /score/],
    ['bad mate', (r) => (r.positions[6].mate = 0), /mate/],
    ['bad line', (r) => (r.positions[1].pv = [1]), /line/],
    ['bad best', (r) => (r.positions[1].best = 'toolong'), /best/],
    ['unknown engine', (r) => (r.positions[1].e = 3), /engine/],
    ['settings', (r) => (r.settings.preset = 'turbo'), /settings/],
    ['time limit', (r) => (r.settings.movetimeMs = 5), /settings/],
    ['not an object', () => undefined, /object/],
  ];
  for (const [name, mutate, re] of cases) {
    const r = ok();
    mutate(r);
    assert.throws(() => validateReview(name === 'not an object' ? 5 : r), re, name);
  }
  const partial = ok();
  partial.positions[3] = null;
  partial.complete = false;
  assert.equal(validateReview(partial).complete, false); // an unfinished review is valid
  const odd = ok();
  odd.perspective = 'purple';
  assert.equal(validateReview(odd).perspective, null);
});
