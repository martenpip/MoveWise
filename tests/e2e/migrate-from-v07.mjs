// Upgrade test: data (a saved game and real Academy lesson progress) written by a REAL v0.7 build must survive the move to the current build (IndexedDB stays at v5).
// Not part of `npm run check` because it needs a built copy of the v0.6 release:
//   V07_DIR=/path/to/extracted/v0.7 (already built, with its dist/)  node tests/e2e/migrate-from-v07.mjs
// Both builds are served on the SAME port, so they share one origin and one IndexedDB, in one persistent browser profile.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const NEW_ROOT = new URL('../..', import.meta.url).pathname;
const OLD_ROOT = process.env.V07_DIR;
if (!OLD_ROOT) throw new Error('Set V07_DIR to the extracted, built v0.7 project.');
const PORT = Number(process.env.E2E_PORT || 4399);
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
  console.log('MoveWise upgrade from v0.7 (real IndexedDB, same origin)');
  let server = await serve(OLD_ROOT);
  let context = await chromium.launchPersistentContext(profileDir, { viewport: { width: 1200, height: 1000 }, acceptDownloads: true });
  let page = context.pages()[0] ?? (await context.newPage());
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE);
  await page.waitForSelector('.status-chip:has-text("Offline-ready")', { timeout: 20000 });
  await page.goto(BASE + '#/games');
  await page.fill('textarea[aria-label="PGN text"]', PGN);
  await page.click('button:has-text("Import PGN")');
  await page.waitForSelector('li:has-text("Alice vs Bob")');
  await page.goto(BASE + '#/academy');
  await page.waitForSelector('text=Where would you like to start?');
  await page.click('button.ac-level:has-text("I am new to chess")');
  await page.click('a.btn:has-text("Start: What is chess?")');
  await page.waitForSelector('h1:text-is("What is chess?")');
  for (let i = 0; i < 2; i++) await page.click('.ac-nav button.primary');
  await page.click('.ac-option:has-text("One")');
  await page.click('.ac-nav button.primary');
  await page.click('.ac-option:has-text("Trap the enemy king")');
  await page.click('.ac-nav button.primary');
  await page.click('.ac-option:has-text("64")');
  await page.click('button:has-text("Next question")');
  await page.click('.ac-option:has-text("Who traps the enemy king")');
  await page.click('button:has-text("Next question")');
  await page.click('.ac-option:text-is("False")');
  await page.click('button:has-text("See result")');
  await page.waitForSelector('text=Lesson complete.');
  await page.goto(BASE + '#/academy/course/beginner');
  await page.waitForSelector('li:has(strong:text-is("What is chess?")) .badge:has-text("Completed")');
  const before = await inspectDb(page);
  assert(before.version === 5, `v0.7 should use IndexedDB version 5, found ${before.version}`);
  assert(before.counts.games === 1 && before.counts.academy >= 2, `v0.7 data: ${JSON.stringify(before.counts)}`);
  log(`v0.7 wrote real data: version ${before.version}, ${before.counts.games} game, ${before.counts.academy} academy records`);
  await context.close();
  server.kill();
  await new Promise((r) => setTimeout(r, 500));

  server = await serve(NEW_ROOT);
  context = await chromium.launchPersistentContext(profileDir, { viewport: { width: 1200, height: 1000 }, acceptDownloads: true });
  page = context.pages()[0] ?? (await context.newPage());
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE);
  // The browser still holds the v0.7 service worker; its update notice is how a real player gets the new version.
  if (process.env.DBG) console.log(await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return JSON.stringify({ a: r?.active?.scriptURL, w: !!r?.waiting, i: !!r?.installing, ctl: !!navigator.serviceWorker.controller }); }));
  const notice = await page.waitForSelector('.notice.update', { timeout: 8000 }).catch(() => null);
  if (notice) { log('the installed v0.7 app offers "Reload to update"'); await page.click('.notice.update button'); await page.waitForTimeout(2500); }
  for (let i = 0; i < 4; i++) {
    await page.goto(BASE + '#/academy');
    await page.reload();
    if (await page.locator('text=of 113 lessons completed').count()) break;
    await page.waitForTimeout(2500);
  }
  await page.waitForSelector('text=of 113 lessons completed', { timeout: 15000 }).catch(async () => { throw new Error('progress line: ' + ((await page.locator('main').innerText()).match(/.{0,40}lessons completed.{0,20}/) || ['none'])[0]); });
  log('the new build is running on the same origin');
  const after = await inspectDb(page);
  assert(after.version === 6, `IndexedDB should be upgraded from 5 to 6, found ${after.version}`);
  assert(after.names.includes('notebook'), 'missing the new notebook store');
  assert(after.counts.notebook === (before.counts.learningPositions || 0), `the notebook holds exactly the old practice positions, found ${after.counts.notebook}`);
  for (const n of before.names) assert(after.names.includes(n), `a store disappeared: ${n}`);
  for (const n of before.names) assert(after.counts[n] === before.counts[n], `store ${n} changed: ${before.counts[n]} -> ${after.counts[n]}`);
  log(`all ${before.names.length} stores kept with identical record counts`);
  await page.goto(BASE + '#/academy/course/beginner');
  await page.waitForSelector('li:has(strong:text-is("What is chess?")) .badge:has-text("Completed")');
  log('the lesson completed in v0.7 is still Completed');
  await page.goto(BASE + '#/academy');
  await page.waitForSelector('text=1 of 113 lessons completed', { timeout: 15000 });
  log('the dashboard counts it out of the new 113 lessons');
  await page.goto(BASE + '#/academy/course/strategy');
  await page.waitForSelector('text=Identifying weaknesses');
  log('the new Strategic planning course opens on the upgraded database');
  await page.goto(BASE + '#/games');
  await page.waitForSelector('li:has-text("Alice vs Bob")');
  log('the saved game is still listed');
  assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  console.log('\nUpgrade from v0.7: all checks passed.');
  await context.close();
  server.kill();
} catch (e) {
  failed = true;
  console.log(`  FAIL ${e && e.message ? e.message : e}`);
}
process.exit(failed ? 1 : 0);
