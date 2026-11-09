// Board animation regression test (phone-sized viewport). Run `npm run build` first, then `node tests/e2e/board-slide.mjs`.
// React re-inserts the DOM nodes of pieces that did not move, and a browser restarts a CSS animation on a re-inserted element.
// A piece that had already slid used to slide again when the next move was played, which looked like a piece jumping back and forth.
// This plays several moves against a bot and fails if any piece that already slid is animated a second time.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT || 4418);
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', cwd: ROOT });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
let failed = false;
try {
  console.log('MoveWise board animation end-to-end');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/#/play`);
  await page.waitForSelector('[data-testid="mode-trainer"]');
  await page.selectOption('#level', 'r700');
  await page.click('button:has-text("Start game")');
  await page.waitForSelector('svg.board');
  // Count every animation start on a board piece, per piece element.
  await page.evaluate(() => {
    window.__starts = new Map();
    document.querySelector('svg.board').addEventListener('animationstart', (e) => {
      window.__starts.set(e.target, (window.__starts.get(e.target) || 0) + 1);
    }, true);
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await page.locator('svg.board').boundingBox();
  const tap = async (sq) => {
    const f = 'abcdefgh'.indexOf(sq[0]);
    const r = Number(sq[1]) - 1;
    await page.touchscreen.tap(box.x + ((f + 0.5) / 8) * box.width, box.y + ((7 - r + 0.5) / 8) * box.height);
  };
  for (const [a, b] of [['e2', 'e4'], ['d2', 'd4'], ['g1', 'f3'], ['b1', 'c3']]) {
    await tap(a);
    await tap(b);
    await page.waitForTimeout(1800);
  }
  const worst = await page.evaluate(() => Math.max(0, ...window.__starts.values()));
  const total = await page.evaluate(() => window.__starts.size);
  const leftover = await page.locator('svg.board .slide').count();
  if (total < 4) throw new Error(`only ${total} pieces slid; the moves were not played`);
  if (worst > 1) throw new Error(`a piece was animated ${worst} times; each move must slide once`);
  if (leftover !== 0) throw new Error(`${leftover} piece(s) still carry the slide class after the animation ended`);
  console.log(`  ok   ${total} pieces slid, each exactly once, and none keeps the slide class`);
  // On a phone the moves sit directly under the board, so nobody has to scroll to follow the game.
  await page.evaluate(() => window.scrollTo(0, 0));
  const b = await page.locator('svg.board').boundingBox();
  const strip = page.locator('.move-strip');
  if (!(await strip.isVisible())) throw new Error('the move strip is not shown on a phone');
  const sb = await strip.boundingBox();
  if (sb.y < b.y + b.height) throw new Error('the move strip is above the bottom of the board');
  if (sb.y - (b.y + b.height) > 110) throw new Error(`the move strip is ${Math.round(sb.y - b.y - b.height)}px below the board; it should sit right under it`);
  if ((await page.locator('.move-strip [aria-current="true"]').count()) !== 1) throw new Error('the current move is not marked in the strip');
  if (!(await page.locator('.moves-card').isHidden())) throw new Error('the side-panel move list should be hidden on a phone');
  console.log('  ok   on a phone the move strip sits right under the board and marks the current move');
  console.log('MoveWise board animation end-to-end: all steps passed');
} catch (e) {
  failed = true;
  console.log('  FAIL ' + String(e && e.message ? e.message : e));
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
