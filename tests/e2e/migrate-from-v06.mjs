// Upgrade test: data written by a REAL v0.6 build must survive the move to the current build (IndexedDB v4 -> v5).
// Not part of `npm run check` because it needs a built copy of the v0.6 release:
//   V06_DIR=/path/to/extracted/v0.6 (already built, with its dist/)  node tests/e2e/migrate-from-v06.mjs
// Both builds are served on the SAME port, so they share one origin and one IndexedDB, in one persistent browser profile.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const NEW_ROOT = new URL('../..', import.meta.url).pathname;
const OLD_ROOT = process.env.V06_DIR;
if (!OLD_ROOT) throw new Error('Set V06_DIR to the extracted, built v0.6 project.');
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
  console.log('MoveWise upgrade from v0.6 (real IndexedDB, same origin)');

  /* ---------- 1. the old build creates real data ---------- */
  let server = await serve(OLD_ROOT);
  let context = await chromium.launchPersistentContext(profileDir, { viewport: { width: 1200, height: 1000 }, acceptDownloads: true });
  let page = context.pages()[0] ?? (await context.newPage());
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE);
  await page.waitForSelector('.status-chip:has-text("Offline-ready")', { timeout: 20000 });
  assert(!(await page.locator('nav.nav a:has-text("Academy")').count()), 'the old build should not have an Academy section');
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
  await page.goto(BASE + '#/puzzles');
  await page.waitForSelector('[data-testid=daily-start]');
  await page.click('[data-testid=daily-start]');
  await page.waitForSelector('[data-testid=puzzle-instruction]');
  await page.goto(BASE + '#/settings');
  await page.waitForSelector('text=Your data');
  const before = await inspectDb(page);
  assert(before.version === 4, `the old build should use IndexedDB version 4, found ${before.version}`);
  assert(!before.names.includes('academy'), 'the old database should not have the academy store');
  assert(before.counts.puzzleDaily === 1, 'the old build should have stored a daily puzzle');
  assert(before.counts.games === 1 && before.counts.reviews === 1, `old data: ${JSON.stringify(before.counts)}`);
  log(`v0.6 wrote a real database: version ${before.version}, ${before.counts.games} game, ${before.counts.reviews} review, ${before.counts.activity} activity records`);
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
  // The browser still holds the v0.6 service worker. Its update notice is how a real player gets the new version.
  const hasLearn = () => page.locator('nav.nav a:has-text("Learn")').count();
  if (!(await hasLearn())) {
    await page.waitForSelector('.notice.update', { timeout: 20000 });
    log('the installed v0.6 app offers "Reload to update"');
    await page.click('.notice.update button');
    await page.waitForSelector('nav.nav a:has-text("Learn")', { timeout: 20000 });
  }
  log('the new build is running on the same origin');

  const after = await inspectDb(page);
  assert(after.version === 6, `IndexedDB should be upgraded to version 6, found ${after.version}`);
  assert(after.names.includes('academy'), 'missing the new academy store');
  assert(after.names.includes('notebook'), 'missing the new notebook store');
  for (const n of before.names) assert(after.names.includes(n), `an old store disappeared: ${n}`);
  for (const n of before.names) assert(after.counts[n] === before.counts[n], `store ${n} changed: ${before.counts[n]} -> ${after.counts[n]}`);
  assert(after.counts.academy === 0, 'the academy store starts empty: nothing is invented');
  assert(after.counts.notebook === (before.counts.learningPositions || 0), `the notebook holds exactly the old practice positions (${before.counts.learningPositions || 0}), found ${after.counts.notebook}`);
  log(`database upgraded 4 -> 6: all ${before.names.length} old stores kept with identical record counts; the academy store was added empty; the notebook holds the ${before.counts.learningPositions || 0} old practice positions`);

  await page.goto(BASE + '#/games');
  await page.waitForSelector('li:has-text("Alice vs Bob") .badge:has-text("Reviewed")', { timeout: 15000 });
  log('the v0.6 game is listed and still marked Reviewed');
  await page.click('li:has-text("Alice vs Bob") a:text-is("Reopen review")');
  await page.waitForSelector('[data-testid="review-engine"]', { timeout: 20000 });
  assert((await page.locator('[data-testid="review-engine"]').innerText()).includes(SF), 'the stored review lost its engine label');
  log('the v0.6 review reopens from storage without being run again');

  await page.goto(BASE + '#/profile');
  await page.waitForSelector('section[aria-labelledby="h-qual"] .tiles');
  assert((await page.locator('section[aria-labelledby="h-qual"]').innerText()).includes('1 reviewed game'), 'the Profile lost the reviewed game');
  assert((await page.locator('section[aria-labelledby="h-tac"]').innerText()).includes('puzzle'), 'the puzzle section should still render');
  assert((await page.locator('section[aria-labelledby="h-academy"]').innerText()).includes('No Academy lessons yet'), 'Academy statistics should start empty, not invented');
  log('the Profile still shows the reviewed game; puzzle statistics start honestly empty');

  /* ---------- 3. the new feature works on the upgraded database ---------- */
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
  const end = await inspectDb(page);
  assert(end.counts.academy >= 2, `lesson record and meta should be stored: ${JSON.stringify(end.counts)}`);
  for (const n of before.names) if (n !== 'activity') assert(end.counts[n] === before.counts[n], `old store ${n} must be untouched: ${before.counts[n]} -> ${end.counts[n]}`);
  assert(end.counts.activity === before.counts.activity + 1, 'exactly one activity event (the lesson) was added');
  log('a lesson was completed on the upgraded database; only the academy store and one activity event were added');
  await page.reload();
  await page.waitForSelector('h1:text-is("What is chess?")');
  await page.goto(BASE + '#/academy/course/beginner');
  await page.waitForSelector('li:has(strong:text-is("What is chess?")) .badge:has-text("Completed")');
  log('the lesson progress survives a reload');

  assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  console.log('\nUpgrade from v0.6: all checks passed.');
  await context.close();
  server.kill();
} catch (e) {
  failed = true;
  console.log(`  FAIL ${e && e.message ? e.message : e}`);
}
process.exit(failed ? 1 : 0);
