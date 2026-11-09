// End-to-end offline test. Run `npm run build` first, then `node tests/e2e/offline.mjs`.
// Starts its own static server for dist/, drives Chromium with Playwright, and cuts the network
// after the service worker has cached the app.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = Number(process.env.E2E_PORT || 4391);
const BASE = `http://localhost:${PORT}/`;

const server = spawn('node', ['scripts/serve.mjs'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
  cwd: new URL('../..', import.meta.url).pathname,
});
await new Promise((r) => setTimeout(r, 800));

const results = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ok   ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e && e.message ? e.message : e) });
    // Keep a screenshot of the failing state for debugging (set E2E_SHOTS to choose the folder).
    try {
      await page.screenshot({ path: `${process.env.E2E_SHOTS || '.'}/e2e-failure.png` });
    } catch {
      /* ignore */
    }
    console.log(`  FAIL ${name}\n       ${String(e && e.message ? e.message : e).split("\n").slice(0, process.env.E2E_FULL ? 12 : 1).join("\n       ")}`);
    throw e;
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.on('dialog', (d) => d.accept());
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
const external = [];
page.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
});

/** Click the centre of a square (white orientation unless flipped=true). */
async function squareCentre(sq, flipped = false) {
  // Raw coordinates ignore the sticky header, so make sure the whole board is visible first.
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await page.locator('svg.board').boundingBox();
  const file = 'abcdefgh'.indexOf(sq[0]);
  const rank = Number(sq[1]) - 1;
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank : 7 - rank;
  return { x: box.x + ((col + 0.5) / 8) * box.width, y: box.y + ((row + 0.5) / 8) * box.height };
}
async function click(sq, flipped) {
  const { x, y } = await squareCentre(sq, flipped);
  await page.mouse.click(x, y);
}
async function drag(from, to) {
  const a = await squareCentre(from);
  const b = await squareCentre(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}
const moveCount = () => page.locator('.movelist button').count();
const waitMoves = (n, timeout = 20000) =>
  page.waitForFunction((n) => document.querySelectorAll('.movelist button').length >= n, n, { timeout });

try {
  console.log('MoveWise offline end-to-end');

  await step('first load works and the offline copy is installed', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.dash-head');
    await page.waitForSelector('.status-chip:has-text("Offline-ready")', { timeout: 15000 });
  });

  await step('start a game as White and play e4; the bot answers from the worker', async () => {
    await page.goto(BASE + '#/play');
    await page.click('text=Start game');
    await page.waitForSelector('svg.board');
    await click('e2');
    await click('e4');
    await waitMoves(2);
    const first = await page.locator('.movelist button').first().innerText();
    assert(first === 'e4', `first move should be e4, got ${first}`);
  });

  await step('an illegal move attempt does nothing', async () => {
    const before = await moveCount();
    await click('a1'); // rook is blocked by its own pawn/knight: no destinations
    await click('a5');
    assert((await moveCount()) === before, 'move list changed after illegal move');
  });

  await step('network cut: reload while offline still loads the app', async () => {
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('text=Resume game', { timeout: 15000 });
    const chip = await page.locator('.status-chip').innerText();
    assert(/Offline/.test(chip), `status chip should say Offline, got "${chip}"`);
  });

  await step('offline: the game in progress is restored after reload', async () => {
    await page.click('text=Resume game');
    await page.waitForSelector('svg.board');
    await waitMoves(2);
    assert((await page.locator('.movelist button').first().innerText()) === 'e4', 'restored game lost its first move');
  });

  await step('offline: keep playing; the engine worker still answers', async () => {
    const before = await moveCount();
    await click('d2');
    await click('d4');
    await waitMoves(before + 2);
  });

  await step('offline: take back returns to the player’s turn', async () => {
    const before = await moveCount();
    await page.click('text=Take back');
    await page.waitForFunction((n) => document.querySelectorAll('.movelist button').length === n - 2, before, { timeout: 5000 });
    await page.waitForSelector('.status-line:has-text("Your move")');
  });

  await step('offline: resign saves the game to history', async () => {
    await page.click('button:has-text("Resign")');
    await page.waitForSelector('text=Saved to your game history', { timeout: 10000 });
  });

  await step('offline: the saved game appears in Games after a reload (IndexedDB)', async () => {
    await page.goto(BASE + '#/games');
    await page.reload();
    await page.waitForSelector('.list li', { timeout: 10000 });
    const text = await page.locator('.list li').first().innerText();
    assert(/bot/i.test(text) && /You/.test(text), `unexpected row: ${text}`);
  });

  await step('offline: replay opens and the engine analyses a position', async () => {
    await page.click('.list li a >> nth=0');
    await page.waitForSelector('svg.board');
    await page.locator('label:has-text("Analyze this position") input').check();
    await page.waitForSelector('dt:has-text("Evaluation")', { timeout: 20000 });
  });

  await step('offline: backup export contains the saved game', async () => {
    await page.goto(BASE + '#/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Export backup')]);
    const json = JSON.parse(readFileSync(await download.path(), 'utf8'));
    assert(json.app === 'MoveWise' && json.games.length === 1, `backup should hold 1 game, has ${json.games?.length}`);
  });

  await step('analysis board: drag and drop works', async () => {
    await page.goto(BASE + '#/analysis');
    await page.waitForSelector('svg.board');
    await drag('d2', 'd4');
    await waitMoves(1);
    assert((await page.locator('.movelist button').first().innerText()) === 'd4', 'drag did not play d4');
  });

  await step('analysis board: loading a FEN and promoting a pawn', async () => {
    await page.fill('input[aria-label="FEN"]', '7k/P7/8/8/8/8/8/K7 w - - 0 1');
    await page.click('text=Load FEN');
    await click('a7');
    await click('a8');
    await page.waitForSelector('[role="dialog"] button[aria-label="Promote to Queen"]');
    await page.click('button[aria-label="Promote to Queen"]');
    await waitMoves(1);
    const san = await page.locator('.movelist button').first().innerText();
    assert(san === 'a8=Q+', `expected a8=Q+ (queen on a8 checks the king on h8), got ${san}`);
  });

  await step('analysis board: an invalid FEN is rejected with a message', async () => {
    await page.fill('input[aria-label="FEN"]', 'definitely not a fen');
    await page.click('text=Load FEN');
    await page.waitForSelector('.notice.error');
  });

  await step('analysis board: engine analysis runs offline', async () => {
    await page.fill('input[aria-label="FEN"]', '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
    await page.click('text=Load FEN');
    await page.waitForSelector('dd:has-text("Ra8#")', { timeout: 20000 });
  });

  await step('keyboard: arrow keys and Enter can make a move', async () => {
    await page.goto(BASE + '#/analysis');
    await page.waitForSelector('svg.board');
    await page.click('button:has-text("Reset")'); // same-hash navigation keeps the previous position
    await page.locator('svg.board').focus();
    // cursor starts on e2 for White; select it, move up twice to e4, confirm.
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await waitMoves(1);
    assert((await page.locator('.movelist button').first().innerText()) === 'e4', 'keyboard move did not play e4');
  });

  await step('dark is the default theme, even on a device that prefers light', async () => {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    const p = await ctx.newPage();
    await p.goto(BASE);
    await p.waitForSelector('.dash-head');
    const t = await p.evaluate(() => document.documentElement.dataset.theme);
    await ctx.close();
    assert(t === 'dark', `fresh install should be dark, got ${t}`);
  });

  await step('offline: the theme switches to light and survives a reload', async () => {
    await page.goto(BASE + '#/settings');
    await page.getByRole('button', { name: /^Light/ }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.waitForTimeout(400); // let the IndexedDB write commit, as a person would
    await page.reload();
    await page.waitForSelector('text=Look and feel');
    assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'light theme lost after reload');
  });

  await step('offline: a board theme can be chosen and the pieces still render', async () => {
    await page.getByRole('button', { name: /^Slate/ }).click();
    await page.waitForFunction(() => document.documentElement.dataset.board === 'slate');
    await page.goto(BASE + '#/analysis');
    await page.waitForSelector('svg.board');
    const n = await page.locator('svg.board g.piece').count();
    assert(n >= 32, `expected 32 pieces on the board, found ${n}`);
  });

  await step('offline: profile shows the saved game, and edits persist', async () => {
    await page.goto(BASE + '#/profile');
    await page.waitForSelector('text=MOVEWISE RATING', { timeout: 10000 });
    await page.click('button:has-text("Edit profile")');
    await page.fill('#pf-name', 'Test Player');
    await page.click('button:has-text("Save")');
    await page.waitForSelector('h1:has-text("Test Player")');
    await page.waitForTimeout(400); // let the IndexedDB write commit before reloading
    await page.reload();
    await page.waitForSelector('h1:has-text("Test Player"), h2:has-text("Test Player")', { timeout: 10000 });
    const body = await page.locator('main').innerText();
    assert(/FIDE/.test(body), 'the profile must say the rating is not a FIDE rating');
  });

  await step('offline: backup export now carries the profile', async () => {
    await page.goto(BASE + '#/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Export backup')]);
    const json = JSON.parse(readFileSync(await download.path(), 'utf8'));
    assert(json.profile && json.profile.displayName === 'Test Player', 'profile missing from the backup');
    assert(json.version === 3, `backup version should be 3, got ${json.version}`);
  });

  await step('no external network requests were made', async () => {
    assert(external.length === 0, `external requests: ${external.join(', ')}`);
  });
  await step('no uncaught page errors', async () => {
    assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  });
} catch {
  /* reported below */
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
process.exit(failed.length ? 1 : 0);
