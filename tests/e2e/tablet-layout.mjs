// Tablet layout regression test. Run `npm run build` first, then `node tests/e2e/tablet-layout.mjs`.
// On a landscape tablet the board is as large as the screen height allows. The side cards must take the width that is left, so there is
// no wide empty gap between the board and the cards (it was about 270 px on an iPad). On a phone the layout stays a single column.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT || 4419);
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', cwd: ROOT });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
let failed = false;
try {
  console.log('MoveWise tablet layout');
  for (const [w, h] of [[1180, 760], [1024, 700], [1366, 900], [1080, 810]]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
    await page.goto(`http://localhost:${PORT}/#/play`);
    await page.click('button:has-text("Start game")');
    await page.waitForSelector('svg.board');
    const m = await page.evaluate(() => {
      const b = document.querySelector('svg.board').getBoundingClientRect();
      const side = document.querySelector('.game-layout').lastElementChild.getBoundingClientRect();
      return { boardRight: b.right, boardW: b.width, sideLeft: side.left, sideRight: side.right, vw: innerWidth, scrollW: document.documentElement.scrollWidth };
    });
    const gap = m.sideLeft - m.boardRight;
    if (gap > 40) throw new Error(`${w}x${h}: ${Math.round(gap)}px of empty space between the board and the cards`);
    if (gap < 8) throw new Error(`${w}x${h}: the board and the cards touch (${Math.round(gap)}px)`);
    if (m.scrollW > m.vw) throw new Error(`${w}x${h}: the page scrolls sideways`);
    if (m.sideRight > m.vw + 1) throw new Error(`${w}x${h}: the cards run off the screen`);
    if (m.boardW < 400) throw new Error(`${w}x${h}: the board is only ${Math.round(m.boardW)}px wide`);
    console.log(`  ok   ${w}x${h}: board ${Math.round(m.boardW)}px, gap ${Math.round(gap)}px`);
    await page.context().close();
  }
  // Pages with a toolbar under the board (Analysis) must not push the board off the left edge.
  const an = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  await an.goto(`http://localhost:${PORT}/#/analysis`);
  await an.waitForSelector('svg.board');
  const ab = await an.locator('svg.board').boundingBox();
  if (ab.x < 0 || ab.x + ab.width > 1200) throw new Error(`Analysis: the board is partly off screen (x ${Math.round(ab.x)}, width ${Math.round(ab.width)})`);
  console.log(`  ok   Analysis 1200x900: board fully on screen (${Math.round(ab.width)}px)`);
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  await phone.goto(`http://localhost:${PORT}/#/play`);
  await phone.click('button:has-text("Start game")');
  await phone.waitForSelector('svg.board');
  const pb = await phone.locator('svg.board').boundingBox();
  if (pb.width < 340) throw new Error(`on a phone the board is only ${Math.round(pb.width)}px wide`);
  console.log(`  ok   phone: board ${Math.round(pb.width)}px wide, single column`);
} catch (e) {
  failed = true;
  console.error('  FAIL ' + (e instanceof Error ? e.message : e));
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
