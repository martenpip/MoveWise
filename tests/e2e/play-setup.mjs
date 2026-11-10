// Play setup end-to-end (phone-sized): the setup is simple, the player chooses the game mode and the side, and Start is always on screen.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT || 4421);
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', cwd: ROOT });
await new Promise((r) => setTimeout(r, 800));
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
let failed = false;
const open = async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  await page.goto(`http://localhost:${PORT}/#/play`);
  await page.waitForSelector('[data-testid="mode-normal"]');
  return page;
};
try {
  console.log('MoveWise Play setup');
  let page = await open();
  // Everything a player needs is visible at once: the mode, the side, the opponent and the Start button, without scrolling.
  for (const id of ['mode-normal', 'mode-trainer', 'side-white', 'side-random', 'side-black']) assert(await page.locator(`[data-testid="${id}"]`).isVisible(), `${id} is not visible`);
  const start = page.locator('button:has-text("Start game")');
  const sb = await start.boundingBox();
  const tabTop = await page.locator('nav.tabbar').evaluate((n) => n.getBoundingClientRect().top);
  assert(sb.y + sb.height <= tabTop + 1, `Start game is hidden behind the tab bar (bottom ${Math.round(sb.y + sb.height)}, tab bar ${Math.round(tabTop)})`);
  assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, 'the page scrolls sideways');
  console.log('  ok   mode, side, opponent and Start are all visible on a phone');

  // The opponent shown is the opponent played: the list, the chips and the card agree (an old saved name such as "casual" once showed Bot 100).
  const shown = await page.locator('#level').evaluate((s) => s.options[s.selectedIndex].text);
  const card = await page.locator('.opp-name b').innerText();
  assert(shown === card, `the list says ${shown} but the card says ${card}`);
  await page.click('.chip:has-text("Hard")');
  assert((await page.locator('#level').inputValue()) === 'r1500' && (await page.locator('.opp-name b').innerText()) === 'Bot 1500', 'the Hard chip should select Bot 1500');
  console.log('  ok   the opponent list, chips and card agree');

  // Choosing Black: the bot moves first and the player's pieces are at the bottom.
  await page.click('.chip:has-text("Beginner")');
  await page.click('[data-testid="side-black"]');
  assert((await page.locator('[data-testid="side-black"]').getAttribute('aria-pressed')) === 'true', 'Black is not marked as chosen');
  await start.click();
  await page.waitForSelector('svg.board');
  await page.waitForSelector('.ms-move', { state: 'attached', timeout: 20000 });
  const first = await page.locator('.ms-move').first().innerText();
  assert(first.length > 0, 'the bot (White) should have made the first move');
  assert((await page.locator('.player-strip').first().innerText()).includes('White'), 'with Black chosen, White (the bot) is shown at the top');
  console.log('  ok   playing Black: the bot moved first and the board shows White at the top');
  await page.context().close();

  // Choosing White: it is the player's move straight away.
  page = await open();
  await page.click('[data-testid="side-white"]');
  await page.click('button:has-text("Start game")');
  await page.waitForSelector('svg.board');
  await page.waitForSelector('.status-line:has-text("Your move")', { timeout: 10000 });
  console.log('  ok   playing White: it is your move');
  await page.context().close();

  // Random gives a real game either way.
  page = await open();
  await page.click('[data-testid="side-random"]');
  await page.click('button:has-text("Start game")');
  await page.waitForSelector('svg.board');
  console.log('  ok   Random starts a game');
} catch (e) {
  failed = true;
  console.error('  FAIL ' + (e instanceof Error ? e.message : e));
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
