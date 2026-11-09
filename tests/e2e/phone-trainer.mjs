// Phone Trainer warning end-to-end. Run `npm run build` first, then `node tests/e2e/phone-trainer.mjs`.
// On a phone, the Trainer's "Before you play that move" warning and its two buttons must appear right under the board, on screen
// without any scrolling, so a person never has to scroll down to answer them.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT || 4419);
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', cwd: ROOT });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
let failed = false;
const assert = (c, m) => { if (!c) throw new Error(m); };
try {
  console.log('MoveWise phone Trainer warning end-to-end');
  const VIEW = { width: 390, height: 844 };
  const ctx = await browser.newContext({ viewport: VIEW, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(`http://localhost:${PORT}/#/play`);
  await page.waitForSelector('[data-testid="mode-trainer"]');
  await page.selectOption('#level', 'r100');
  await page.click('[data-testid="mode-trainer"]');
  await page.click('button:has-text("Start game")');
  await page.waitForSelector('[data-testid="trainer-panel"]');
  const tap = async (sq) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await page.locator('svg.board').boundingBox();
    const f = 'abcdefgh'.indexOf(sq[0]);
    const r = Number(sq[1]) - 1;
    await page.touchscreen.tap(box.x + ((f + 0.5) / 8) * box.width, box.y + ((7 - r + 0.5) / 8) * box.height);
  };
  const plies = () => page.locator('.ms-move').count();
  const warningShown = (ms) => page.waitForSelector('[data-testid="trainer-warning"]', { timeout: ms }).then(() => true, () => false);
  // The level-100 bot answers at random, so the queen blunder (Qh5, then Qxf7) is not always available. Try new games until it is.
  let blunder = null;
  for (let attempt = 0; attempt < 6 && !blunder; attempt++) {
    if (attempt > 0) {
      await page.click('button:has-text("Resign")');
      await page.waitForSelector('[data-testid="game-results"]');
      await page.click('button:has-text("Play again")');
      await page.waitForSelector('[data-testid="mode-trainer"]');
      await page.click('[data-testid="mode-trainer"]');
      await page.click('button:has-text("Start game")');
      await page.waitForSelector('[data-testid="trainer-panel"]');
    }
    await tap('e2'); await tap('e4');
    await page.waitForFunction(() => document.querySelectorAll('.ms-move').length >= 2, null, { timeout: 20000 });
    await tap('d1'); await tap('h5');
    if (await warningShown(6000)) { blunder = ['d1', 'h5']; break; }
    if ((await plies()) < 3) continue; // Qh5 was not possible
    await page.waitForFunction(() => document.querySelectorAll('.ms-move').length >= 4, null, { timeout: 20000 });
    await tap('h5'); await tap('f7');
    if (await warningShown(6000)) blunder = ['h5', 'f7'];
  }
  assert(blunder, 'no blunder could be set up in 6 games');
  assert((await page.locator('[data-testid="trainer-warning"]').count()) === 1, 'the warning must be drawn once, not twice');
  // Wherever the page was scrolled to, the warning's buttons must be on screen: check both from the top and as left by the browser.
  const onScreen = async (label) => {
    const bar = await page.locator('nav.tabbar').boundingBox();
    const limit = bar ? bar.y : VIEW.height - 70;
    const re = await page.locator('[data-testid="trainer-reconsider"]').boundingBox();
    const pa = await page.locator('[data-testid="trainer-play-anyway"]').boundingBox();
    for (const [name, b] of [['Let me reconsider', re], ['Play the move anyway', pa]]) {
      assert(b.y >= 0 && b.y + b.height <= limit, `${label}: "${name}" is hidden or off screen (y ${Math.round(b.y)}..${Math.round(b.y + b.height)}, the tab bar starts at ${Math.round(limit)})`);
    }
  };
  await page.evaluate(() => window.scrollTo(0, 0));
  await onScreen('at the top of the page');
  const board = await page.locator('svg.board').boundingBox();
  const warn = await page.locator('[data-testid="trainer-warning"]').boundingBox();
  assert(warn.y >= board.y + board.height - 2 && warn.y - (board.y + board.height) < 90, 'the warning sits right under the board');
  console.log('  ok   the warning and both buttons are on screen without scrolling, right under the board');
  const before = await plies();
  await page.click('[data-testid="trainer-reconsider"]');
  assert((await page.locator('[data-testid="trainer-warning"]').count()) === 0, 'the warning goes away after "Let me reconsider"');
  assert((await plies()) === before, 'reconsidering does not play the move');
  console.log('  ok   "Let me reconsider" works from the phone position');
  // Play it anyway, from the same spot.
  await tap(blunder[0]); await tap(blunder[1]);
  await page.waitForSelector('[data-testid="trainer-warning"]', { timeout: 30000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await onScreen('second warning');
  await page.click('[data-testid="trainer-play-anyway"]');
  await page.waitForFunction((n) => document.querySelectorAll('.ms-move').length > n, before, { timeout: 10000 });
  console.log('  ok   "Play the move anyway" plays the move');
  console.log('MoveWise phone Trainer warning end-to-end: all steps passed');
} catch (e) {
  failed = true;
  try { const pg = browser.contexts()[0].pages()[0]; console.log('  moves: ' + (await pg.locator('.ms-scroll').innerText()).replace(/\n/g, ' ')); await pg.screenshot({ path: process.env.E2E_SHOTS ? process.env.E2E_SHOTS + '/phone-fail.png' : '/tmp/phone-fail.png' }); } catch { /* ignore */ }
  console.log('  FAIL ' + String(e && e.message ? e.message : e));
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
