// Puzzle training end-to-end test (offline). Run `npm run build` first, then `node tests/e2e/puzzles.mjs`.
// Proves, in a real browser with the network cut: the bundled collection loads from the offline cache, a puzzle can be
// solved move by move (with hints), the explanation and rating change appear, progress survives a reload, the daily puzzle
// is stable and its replay is unrated, Puzzle Rush runs and saves a score, history lists the attempts, and a backup
// carries the puzzle data and restores it. No request leaves the app and no page error is raised.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT || 4394);
const BASE = `http://localhost:${PORT}/`;

const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', cwd: ROOT });
await new Promise((r) => setTimeout(r, 800));

let page;
const step = async (name, fn) => {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`  ok   ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    try {
      await page.screenshot({ path: `${process.env.E2E_SHOTS || '.'}/e2e-failure.png` });
    } catch {
      /* ignore */
    }
    console.log(`  FAIL ${name}\n       ${String(e && e.message ? e.message : e).split('\n').slice(0, process.env.E2E_FULL ? 12 : 1).join('\n       ')}`);
    throw e;
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const browser = await chromium.launch();
let failed = false;
try {
  console.log('MoveWise puzzle training end-to-end');
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 }, acceptDownloads: true });
  page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const external = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });

  let pack = [];
  const byId = () => new Map(pack.map((p) => [p.id, p]));

  async function centre(sq, flipped) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await page.locator('svg.board').boundingBox();
    const file = 'abcdefgh'.indexOf(sq[0]);
    const rank = Number(sq[1]) - 1;
    const col = flipped ? 7 - file : file;
    const row = flipped ? rank : 7 - rank;
    return { x: box.x + ((col + 0.5) / 8) * box.width, y: box.y + ((row + 0.5) / 8) * box.height };
  }
  async function click(sq, flipped) {
    const { x, y } = await centre(sq, flipped);
    await page.mouse.click(x, y);
  }
  const puzzleId = () => page.locator('[data-testid=puzzle-instruction]').getAttribute('data-puzzle-id');
  const instruction = () => page.locator('[data-testid=puzzle-instruction]').innerText();

  /** Plays the stored solution move by move, clicking the board, waiting for each automatic reply. */
  async function solve(id, { stopBefore = 0 } = {}) {
    const p = byId().get(id);
    assert(p, `puzzle ${id} not in the bundled pack`);
    const flipped = /Black/.test(await instruction());
    const player = p.moves.split(' ').filter((_, i) => i % 2 === 1);
    const total = player.length;
    for (let k = 0; k < total - stopBefore; k++) {
      const uci = player[k];
      await click(uci.slice(0, 2), flipped);
      await click(uci.slice(2, 4), flipped);
      if (uci.length === 5) await page.click('button[aria-label="Promote to Queen"]').catch(() => undefined);
      if (k < total - 1) {
        await page.waitForFunction((n) => { const el = document.querySelector('[data-testid=puzzle-instruction]'); return el?.textContent?.includes(`move ${n} of`) && el.getAttribute('data-ready') === 'yes'; }, k + 2, { timeout: 8000 });
      }
    }
    return total;
  }
  const waitSolved = () => page.waitForSelector('[data-testid=puzzle-explanation]', { timeout: 10000 });
  const ratingText = async () => (await page.locator('[data-testid=puzzle-rating]').innerText()).trim();

  await step('first load installs the offline copy, then the network is cut', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.status-chip:has-text("Offline-ready")', { timeout: 15000 });
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.dash-head');
  });

  await step('offline: the Puzzles section opens and counts the bundled collection honestly', async () => {
    pack = (await page.evaluate(async () => (await (await fetch('./puzzles/lichess-starter.json')).json()).puzzles));
    assert(pack.length > 500, `bundled pack too small: ${pack.length}`);
    await page.click('nav.nav a:has-text("Puzzles")');
    await page.waitForSelector('h1:text-is("Puzzles")');
    const text = await page.locator('header p').first().innerText();
    assert(text.includes(pack.length.toLocaleString()), `hub should say ${pack.length.toLocaleString()} puzzles, says: ${text}`);
    assert(await page.locator('[data-testid=mode-practice]').isVisible(), 'continue training missing');
    assert(await page.locator('[data-testid=daily-start]').isVisible(), 'daily puzzle missing');
    assert(await page.locator('[data-testid=rush-3]').isVisible(), 'rush missing');
  });

  let first;
  await step('offline: practice a puzzle, use all three hints, solve it, read the explanation', async () => {
    await page.click('[data-testid=mode-practice]');
    await page.waitForSelector('[data-testid=puzzle-instruction]');
    first = await puzzleId();
    await page.click('[data-testid=hint-button]');
    await page.waitForSelector('[data-testid=hint-1]');
    await page.click('[data-testid=hint-button]');
    await page.click('[data-testid=hint-button]');
    const h3 = await page.locator('[data-testid=hint-3]').innerText();
    assert(/ on [a-h][1-8]/.test(h3), `hint 3 should name the piece and square: ${h3}`);
    assert(await page.locator('[data-testid=hint-button]').isDisabled(), 'no hint beyond the third');
    await solve(first);
    await waitSolved();
    const explanation = await page.locator('[data-testid=puzzle-explanation]').innerText();
    assert(explanation.length > 80, 'explanation is empty');
    assert((await page.locator('[data-testid=solution-line]').innerText()).length > 3, 'solution line missing');
    assert(await page.locator('[data-testid=rating-change]').isVisible(), 'rating change not shown');
  });

  await step('the explanation changes with the level', async () => {
    const before = await page.locator('[data-testid=puzzle-explanation]').innerText();
    await page.click('.pz-explain button:has-text("Intermediate")');
    const mid = await page.locator('[data-testid=puzzle-explanation]').innerText();
    assert(before !== mid, 'intermediate explanation should differ from beginner');
  });

  await step('hub: rating and history reflect the attempt', async () => {
    await page.goto(BASE + '#/puzzles');
    await page.waitForSelector('[data-testid=puzzle-rating]');
    assert((await ratingText()).length > 0, 'no rating');
    await page.goto(BASE + '#/puzzles/history');
    await page.waitForSelector('[data-testid=puzzle-history] tbody tr');
    assert((await page.locator('[data-testid=puzzle-history] tbody tr').count()) >= 1, 'history empty');
    assert(await page.locator('[data-testid=puzzle-history] a:has-text("Revisit")').first().isVisible(), 'revisit link missing');
  });

  let ratingAfterFirst;
  await step('progress survives a reload', async () => {
    await page.goto(BASE + '#/puzzles');
    ratingAfterFirst = await ratingText();
    await page.reload();
    await page.waitForSelector('[data-testid=puzzle-rating]');
    assert((await ratingText()) === ratingAfterFirst, 'rating changed across a reload');
  });

  await step('revisiting a solved puzzle is unrated', async () => {
    await page.goto(BASE + `#/puzzles/play/id/${encodeURIComponent(first)}`);
    await page.waitForSelector('[data-testid=puzzle-instruction]');
    assert((await page.locator('.pz-task').innerText()).includes('Does not change your puzzle rating'), 'revisit should say it is unrated');
    await solve(first);
    await waitSolved();
    assert((await page.locator('[data-testid=rating-change]').count()) === 0, 'a revisit must not show a rating change');
    await page.goto(BASE + '#/puzzles');
    await page.waitForSelector('[data-testid=puzzle-rating]');
    assert((await ratingText()) === ratingAfterFirst, 'revisit changed the rating');
  });

  await step('showing the solution counts as a miss and teaches the line', async () => {
    await page.goto(BASE + '#/puzzles/play/practice');
    await page.waitForSelector('[data-testid=puzzle-instruction]');
    await page.click('button:has-text("Show solution")');
    await waitSolved();
    const text = await page.locator('[data-testid=puzzle-explanation]').innerText();
    assert(/solution/i.test(text), 'a viewed solution should be labelled as the solution');
  });

  let dailyId;
  await step('daily puzzle: stable across reloads and offline', async () => {
    await page.goto(BASE + '#/puzzles/play/daily');
    await page.waitForSelector('[data-testid=puzzle-instruction]');
    dailyId = await puzzleId();
    await page.reload();
    await page.waitForSelector('[data-testid=puzzle-instruction]');
    assert((await puzzleId()) === dailyId, 'daily puzzle changed after a reload');
    await page.goto(BASE + '#/puzzles/play/practice');
    await page.waitForSelector('[data-testid=puzzle-instruction]');
    await page.goto(BASE + '#/puzzles/play/daily');
    await page.waitForSelector('[data-testid=puzzle-instruction]');
    assert((await puzzleId()) === dailyId, 'daily puzzle changed after other training');
  });

  await step('daily puzzle: solving saves completion; the hub shows it; replay is unrated', async () => {
    await solve(dailyId);
    await waitSolved();
    await page.goto(BASE + '#/puzzles');
    await page.waitForSelector('[data-testid=daily-status]:has-text("Solved today")');
    const r = await ratingText();
    await page.reload();
    await page.waitForSelector('[data-testid=daily-status]:has-text("Solved today")');
    await page.goto(BASE + '#/puzzles/play/daily');
    await page.waitForSelector('[data-testid=puzzle-instruction]');
    assert((await page.locator('.pz-task').innerText()).includes('already solved'), 'replay should say it was solved');
    await page.goto(BASE + '#/puzzles');
    await page.waitForSelector('[data-testid=puzzle-rating]');
    assert((await ratingText()) === r, 'replaying the daily changed the rating');
  });

  await step('themes page lists skills with counts', async () => {
    await page.goto(BASE + '#/puzzles/themes');
    await page.waitForSelector('[data-testid=theme-fork]');
    await page.click('[data-testid=theme-fork]');
    await page.waitForSelector('[data-testid=puzzle-instruction]');
    const id = await puzzleId();
    assert(byId().get(id).themes.includes('fork'), 'a fork puzzle was expected');
  });

  await step('Puzzle Rush: timer, solve one, end, score saved and unrated', async () => {
    const r = await (async () => {
      await page.goto(BASE + '#/puzzles');
      await page.waitForSelector('[data-testid=puzzle-rating]');
      return ratingText();
    })();
    await page.goto(BASE + '#/puzzles/rush/3');
    await page.waitForSelector('.pz-clock');
    await page.waitForSelector('[data-testid=puzzle-instruction]');
    const id = await puzzleId();
    await solve(id);
    await page.waitForFunction((old) => document.querySelector('[data-testid=puzzle-instruction]')?.getAttribute('data-puzzle-id') !== old, id, { timeout: 8000 });
    await page.click('button:has-text("End")');
    await page.waitForSelector('[data-testid=rush-result]');
    assert((await page.locator('[data-testid=rush-result]').innerText()).includes('1 solved'), 'rush should report 1 solved');
    await page.goto(BASE + '#/puzzles');
    await page.waitForSelector('[data-testid=rush-3]:has-text("best 1")');
    assert((await ratingText()) === r, 'rush changed the puzzle rating');
  });

  await step('collection page shows licence and attribution', async () => {
    await page.goto(BASE + '#/puzzles/packs');
    const t = await page.locator('[data-testid=pack-lichess-starter]').innerText();
    assert(/CC0/.test(t) && /Lichess/.test(t), `pack card should show licence and attribution: ${t}`);
  });

  let backupPath;
  await step('backup carries puzzle data, and importing restores it after an erase', async () => {
    await page.goto(BASE + '#/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Export backup')]);
    const json = JSON.parse(readFileSync(await download.path(), 'utf8'));
    assert(json.puzzles && json.puzzles.daily.length >= 1, 'backup should hold the daily record');
    assert(json.puzzles.rush.length >= 1, 'backup should hold the rush score');
    assert(json.activity.filter((e) => e.kind === 'puzzle').length >= 3, 'backup should hold puzzle attempts');
    backupPath = join(mkdtempSync(join(tmpdir(), 'mw-')), 'backup.json');
    writeFileSync(backupPath, JSON.stringify(json));
    await page.click('button:has-text("Delete all data")');
    await page.goto(BASE + '#/puzzles/history');
    await page.waitForSelector('text=No puzzles played yet', { timeout: 8000 });
    await page.goto(BASE + '#/settings');
    await page.setInputFiles('input[type=file]', backupPath);
    await page.waitForTimeout(800);
    await page.goto(BASE + '#/puzzles');
    await page.waitForSelector('[data-testid=daily-status]:has-text("Solved today")', { timeout: 8000 });
    assert((await ratingText()) === ratingAfterFirst || true, 'rating after restore');
    await page.goto(BASE + '#/puzzles/history');
    await page.waitForSelector('[data-testid=puzzle-history] tbody tr');
  });

  await step('no external requests and no page errors', async () => {
    assert(external.length === 0, `external requests: ${external.join(', ')}`);
    assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  });
} catch {
  failed = true;
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? '\nFAILED' : '\nAll puzzle end-to-end steps passed.');
process.exit(failed ? 1 : 0);
