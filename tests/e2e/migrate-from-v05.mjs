// Upgrade test: data written by a REAL v0.5 build must survive the move to the current build (IndexedDB v3 -> v4).
// Not part of `npm run check` because it needs a built copy of the v0.5 release:
//   V05_DIR=/path/to/extracted/v0.5 (already built, with its dist/)  node tests/e2e/migrate-from-v05.mjs
// Both builds are served on the SAME port, so they share one origin and one IndexedDB, in one persistent browser profile.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const NEW_ROOT = new URL('../..', import.meta.url).pathname;
const OLD_ROOT = process.env.V05_DIR;
if (!OLD_ROOT) throw new Error('Set V05_DIR to the extracted, built v0.5 project.');
const PORT = Number(process.env.E2E_PORT || 4398);
const BASE = `http://localhost:${PORT}/`;
const SF = 'Stockfish 19 (lite)';
const PGN = '[White "Alice"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';
const profileDir = mkdtempSync(join(tmpdir(), 'mw-profile-'));

const serve = async (cwd) => {
  const p = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', cwd });
  await new Promise((r) => setTimeout(r, 800));
  return p;
};
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
const log = (m) => console.log(`  ok   ${m}`);

/** Reads the raw IndexedDB: version, store names and record counts. */
const inspectDb = (page) =>
  page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('movewise');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const names = [...db.objectStoreNames];
    const counts = {};
    for (const n of names) counts[n] = await new Promise((res) => { const q = db.transaction(n).objectStore(n).count(); q.onsuccess = () => res(q.result); });
    const version = db.version;
    db.close();
    return { version, names, counts };
  });

let failed = false;
try {
  console.log('MoveWise upgrade from v0.5 (real IndexedDB, same origin)');

  /* ---------- 1. the old build creates real data ---------- */
  let server = await serve(OLD_ROOT);
  let context = await chromium.launchPersistentContext(profileDir, { viewport: { width: 1200, height: 1000 }, acceptDownloads: true });
  let page = context.pages()[0] ?? (await context.newPage());
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE);
  await page.waitForSelector('.status-chip:has-text("Offline-ready")', { timeout: 20000 });
  assert(!(await page.locator('nav.nav a:has-text("Puzzles")').count()), 'the old build should not have a Puzzles section');
  await page.goto(BASE + '#/games');
  await page.fill('textarea[aria-label="PGN text"]', PGN);
  await page.click('button:has-text("Import PGN")');
  await page.waitForSelector('li:has-text("Alice vs Bob") a:has-text("Review")');
  await page.click('li:has-text("Alice vs Bob") a:text-is("Review")');
  await page.waitForSelector('[data-testid="review-engine-expected"]');
  await page.click('button.choice:has(b:text-is("Quick"))');
  await page.click('button:text-is("I played Black")');
  await page.click('button:text-is("Start review")');
  await page.waitForSelector('[data-testid="review-engine"]', { timeout: 120000 });
  await page.goto(BASE + '#/settings');
  await page.waitForSelector('text=Your data');
  const before = await inspectDb(page);
  assert(before.version === 3, `the old build should use IndexedDB version 3, found ${before.version}`);
  assert(!before.names.includes('puzzleDaily'), 'the old database should not have puzzle stores');
  assert(before.counts.games === 1 && before.counts.reviews === 1, `old data: ${JSON.stringify(before.counts)}`);
  log(`v0.5 wrote a real database: version ${before.version}, ${before.counts.games} game, ${before.counts.reviews} review, ${before.counts.activity} activity records`);
  await context.close();
  server.kill();
  await new Promise((r) => setTimeout(r, 500));

  /* ---------- 2. the new build opens the SAME database ---------- */
  server = await serve(NEW_ROOT);
  context = await chromium.launchPersistentContext(profileDir, { viewport: { width: 1200, height: 1000 }, acceptDownloads: true });
  page = context.pages()[0] ?? (await context.newPage());
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE);
  // The browser still holds the v0.5 service worker. Its update notice is how a real player gets the new version.
  const hasPuzzles = () => page.locator('nav.nav a:has-text("Puzzles")').count();
  if (!(await hasPuzzles())) {
    await page.waitForSelector('.notice.update', { timeout: 20000 });
    log('the installed v0.5 app offers "Reload to update"');
    await page.click('.notice.update button');
    await page.waitForSelector('nav.nav a:has-text("Puzzles")', { timeout: 20000 });
  }
  log('the new build is running on the same origin');

  const after = await inspectDb(page);
  assert(after.version === 4, `IndexedDB should be upgraded to version 4, found ${after.version}`);
  for (const n of ['puzzleDaily', 'puzzleRush', 'puzzlePacks', 'learningPositions']) assert(after.names.includes(n), `missing new store ${n}`);
  for (const n of before.names) assert(after.names.includes(n), `an old store disappeared: ${n}`);
  for (const n of before.names) assert(after.counts[n] === before.counts[n], `store ${n} changed: ${before.counts[n]} -> ${after.counts[n]}`);
  log(`database upgraded 3 -> 4: all ${before.names.length} old stores kept with identical record counts; ${after.names.length - before.names.length} new stores added`);

  await page.goto(BASE + '#/games');
  await page.waitForSelector('li:has-text("Alice vs Bob") .badge:has-text("Reviewed")', { timeout: 15000 });
  log('the v0.5 game is listed and still marked Reviewed');
  await page.click('li:has-text("Alice vs Bob") a:text-is("Reopen review")');
  await page.waitForSelector('[data-testid="review-engine"]', { timeout: 20000 });
  assert((await page.locator('[data-testid="review-engine"]').innerText()).includes(SF), 'the stored review lost its engine label');
  log('the v0.5 review reopens from storage without being run again');

  await page.goto(BASE + '#/profile');
  await page.waitForSelector('section[aria-labelledby="h-qual"] .tiles');
  assert((await page.locator('section[aria-labelledby="h-qual"]').innerText()).includes('1 reviewed game'), 'the Profile lost the reviewed game');
  assert((await page.locator('section[aria-labelledby="h-tac"]').innerText()).includes('No puzzles played yet'), 'puzzle stats should start empty, not invented');
  log('the Profile still shows the reviewed game; puzzle statistics start honestly empty');

  /* ---------- 3. the new features work on the upgraded database ---------- */
  await page.goto(BASE + '#/puzzles');
  await page.waitForSelector('[data-testid=daily-start]');
  await page.click('[data-testid=daily-start]');
  await page.waitForSelector('[data-testid=puzzle-instruction]');
  const id = await page.locator('[data-testid=puzzle-instruction]').getAttribute('data-puzzle-id');
  await page.reload();
  await page.waitForSelector('[data-testid=puzzle-instruction]');
  assert((await page.locator('[data-testid=puzzle-instruction]').getAttribute('data-puzzle-id')) === id, 'the daily puzzle changed after a reload');
  const mid = await inspectDb(page);
  assert(mid.counts.puzzleDaily === 1, 'the daily choice should be stored in the new store');
  log('the daily puzzle is chosen, stored in the new store and stable after a reload');

  await page.goto(BASE + '#/games');
  await page.click('li:has-text("Alice vs Bob") a:text-is("Reopen review")');
  await page.waitForSelector('[data-testid="review-engine"]', { timeout: 20000 });
  await page.waitForSelector('[data-testid="notebook-summary"]', { timeout: 10000 });
  const saveBtn = page.locator('[data-testid="notebook-summary"] button:has-text("to the Notebook")');
  if (await saveBtn.count()) await saveBtn.click();
  await page.waitForTimeout(600);
  await page.goto(BASE + '#/notebook');
  await page.waitForSelector('[data-testid="notebook-page"]');
  const end = await inspectDb(page);
  assert(end.names.includes('notebook'), 'the new database should have a notebook store');
  assert(end.counts.games === 1 && end.counts.reviews === 1, 'the old game and review must be untouched');
  log(`the v0.5 review feeds the Notebook (${end.counts.notebook} saved); the old game and review are untouched`);

  const row = page.locator('[data-testid="nb-row"]').first();
  if (await row.count()) {
    await row.click();
    await page.waitForSelector('[data-testid="nb-exercise"]');
    log('a saved position opens as an exercise');
  } else {
    log('this game had no mistake that met the saving rules, so the Notebook is empty by design');
  }

  assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  console.log('\nUpgrade from v0.5: all checks passed.');
  await context.close();
  server.kill();
} catch (e) {
  failed = true;
  console.log(`  FAIL ${e && e.message ? e.message : e}`);
}
process.exit(failed ? 1 : 0);
