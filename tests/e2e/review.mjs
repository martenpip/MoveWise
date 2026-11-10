// Game Review end-to-end test (offline). Run `npm run build` first, then `node tests/e2e/review.mjs`.
// Proves, in a real browser with the network cut: a game can be reviewed by Stockfish, the review names the engine that
// really ran, it is saved to IndexedDB and reopens after a reload, it feeds the Profile, and deleting the game removes it.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT || 4393);
const BASE = `http://localhost:${PORT}/`;
const SF = 'Stockfish 19 (lite)';
const PGN = '[White "Alice"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';

const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', cwd: ROOT });
await new Promise((r) => setTimeout(r, 800));

const results = [];
let page;
const step = async (name, fn) => {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false });
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
try {
  console.log('MoveWise Game Review end-to-end');
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const external = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });

  await step('first load installs the offline copy, then the network is cut', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.status-chip:has-text("Offline-ready")', { timeout: 15000 });
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.dash-head');
  });

  await step('offline: import Scholar’s mate, and its row offers a review', async () => {
    await page.goto(BASE + '#/games');
    await page.fill('textarea[aria-label="PGN text"]', PGN);
    await page.click('button:has-text("Import PGN")');
    await page.waitForSelector('li:has-text("Alice vs Bob") a:has-text("Review")');
  });

  await step('offline: the set-up screen names Stockfish before anything runs', async () => {
    await page.click('li:has-text("Alice vs Bob") a:text-is("Review")');
    await page.waitForSelector('[data-testid="review-engine-expected"]');
    const t = await page.locator('[data-testid="review-engine-expected"]').innerText();
    assert(t.includes(SF), `expected ${SF}, got ${t}`);
  });

  await step('offline: a Quick review of the game completes with Stockfish', async () => {
    await page.click('button.choice:has(b:text-is("Quick"))');
    await page.click('button:text-is("I played Black")');
    await page.click('button:text-is("Start review")');
    await page.waitForSelector('[data-testid="review-engine"]', { timeout: 120000 });
    const t = await page.locator('[data-testid="review-engine"]').innerText();
    assert(t.includes(SF) && !t.includes('not Stockfish'), `the engine line is wrong: ${t}`);
  });

  await step('the summary has a headline, accuracy, a lesson and the graph', async () => {
    assert((await page.locator('[data-testid="review-headline"]').innerText()).length > 20, 'no headline');
    assert((await page.locator('[data-testid="review-accuracy"]').innerText()).includes('%'), 'no accuracy');
    await page.waitForSelector('.rv-lesson h2');
    await page.waitForSelector('svg.rv-graph-svg');
  });

  await step('the blunder 3…Nf6 is found, explained and previewable', async () => {
    await page.click('button:has-text("All moves")');
    await page.click('.movelist button[aria-label^="3… Nf6"]');
    await page.waitForSelector('h2:has-text("Blunder")');
    const t = await page.locator('aside').innerText();
    assert(t.includes('Qxf7#') || t.includes('checkmate'), 'the explanation should mention the mate');
    assert(t.includes(`Evaluated by ${SF}`), 'the engine note is missing');
    // Like chess.com: a verdict badge on the piece's square, a coach line above the board, and a green arrow for the engine's move.
    await page.waitForSelector('svg.board g.board-badge.cls-blunder');
    assert((await page.locator('[data-testid="review-bubble"]').innerText()).includes('Nf6 is a blunder'), 'the coach line should say that Nf6 is a blunder');
    // The engine's move is drawn on the position it was chosen in (before the move), never on the position after it.
    assert((await page.locator('svg.board g.board-arrow').count()) === 0, 'no arrow should be drawn on the position after the move');
    const after = await page.locator('svg.board g.piece').count();
    await page.click('[data-testid="review-show-best"]');
    await page.waitForSelector('svg.board g.board-arrow.best');
    assert((await page.locator('[data-testid="review-bubble"]').innerText()).includes('Best was g6'), 'the coach line should name the best move');
    assert((await page.locator('svg.board g.board-badge').count()) === 0, 'no verdict badge while the best move is shown');
    await page.click('[data-testid="review-show-best"]');
    await page.waitForSelector('svg.board g.board-badge.cls-blunder');
    assert((await page.locator('svg.board g.piece').count()) === after, 'back on the played position');
    const tb = await page.locator('svg.board').boundingBox();
    const ts = await page.locator('.game-layout').evaluate((l) => l.lastElementChild.getBoundingClientRect().top);
    assert(Math.abs(ts - tb.y) <= 2, `the side cards should start level with the top of the board (${Math.round(ts)} vs ${Math.round(tb.y)})`);
    if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/review-blunder.png` });
    await page.click('button:has-text("Preview on the board")');
    await page.waitForSelector('.rv-variation');
    await page.waitForSelector('g.board-arrow');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.rv-variation', { state: 'detached' });
  });

  await step('the explanation level changes the text and is remembered', async () => {
    await page.click('button:has-text("This move")');
    const a = await page.locator('aside .card').filter({ has: page.locator('[data-testid="review-move-headline"]') }).innerText();
    await page.click('.rv-levels button:text-is("Advanced")');
    const b = await page.locator('aside .card').filter({ has: page.locator('[data-testid="review-move-headline"]') }).innerText();
    assert(a !== b, 'beginner and advanced text should differ');
    assert((await page.evaluate(() => localStorage.getItem('mw-review-level'))) === 'advanced', 'level was not saved');
  });

  await step('keyboard navigation moves through the game', async () => {
    await page.click('.rv-nav button[aria-label="Start of the game"]');
    await page.keyboard.press('ArrowRight');
    await page.waitForSelector('.board-wrap svg[aria-label*="move 1 of 7"]');
  });

  await step('reload while offline: the review reopens from IndexedDB', async () => {
    await page.reload();
    await page.waitForSelector('[data-testid="review-engine"]', { timeout: 20000 });
    assert((await page.locator('[data-testid="review-engine"]').innerText()).includes(SF), 'engine label lost');
  });

  await step('the Games list marks it reviewed, and the Profile shows chess quality', async () => {
    await page.goto(BASE + '#/games');
    await page.waitForSelector('li:has-text("Alice vs Bob") .badge:has-text("Reviewed")');
    await page.goto(BASE + '#/profile');
    await page.waitForSelector('section[aria-labelledby="h-qual"] .tiles', { timeout: 10000 });
    const t = await page.locator('section[aria-labelledby="h-qual"]').innerText();
    assert(t.includes('1 reviewed game'), `profile should count one reviewed game: ${t.slice(0, 200)}`);
  });

  await step('the review is stored in IndexedDB (version 3 reviews store)', async () => {
    const has = await page.evaluate(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('movewise');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const names = [...db.objectStoreNames];
      const n = names.includes('reviews') ? await new Promise((res) => { const q = db.transaction('reviews').objectStore('reviews').count(); q.onsuccess = () => res(q.result); }) : -1;
      db.close();
      return n;
    });
    assert(has === 1, `expected 1 stored review, found ${has}`);
  });

  await step('deleting the game also deletes its review', async () => {
    await page.goto(BASE + '#/games');
    await page.click('li:has-text("Alice vs Bob") a:text-is("Open")');
    await page.click('button:has-text("Delete")');
    await page.waitForSelector('text=No games yet', { timeout: 10000 }).catch(() => undefined);
    const n = await page.evaluate(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('movewise');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const c = await new Promise((res) => { const q = db.transaction('reviews').objectStore('reviews').count(); q.onsuccess = () => res(q.result); });
      db.close();
      return c;
    });
    assert(n === 0, `a review survived its game: ${n}`);
  });

  await step('no external network requests were made', async () => {
    assert(external.length === 0, `external requests: ${external.join(', ')}`);
  });
  await step('no uncaught page errors', async () => {
    assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  });
  await context.close();
} catch {
  /* reported below */
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
process.exit(failed.length ? 1 : 0);
