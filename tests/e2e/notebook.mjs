// Mistake Notebook end-to-end test (offline). Run `npm run build` first, then `node tests/e2e/notebook.mjs`.
// Proves, in a real browser with the network cut: saved positions are listed and filtered, an exercise gives progressive hints,
// rejects a wrong move, accepts the best move, and schedules the next review; the result survives a reload; a review session
// walks through the due positions; revealing the answer marks a position as needing practice; and no request leaves the app.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT || 4398);
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
    try { await page.screenshot({ path: `${process.env.E2E_SHOTS || '.'}/e2e-failure.png` }); } catch { /* ignore */ }
    console.log(`  FAIL ${name}\n       ${String(e && e.message ? e.message : e).split('\n').slice(0, 3).join('\n       ')}`);
    throw e;
  }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

const NOW = Date.now();
const DAY = 86_400_000;
const sched = (o = {}) => ({ reps: 0, lapses: 0, ease: 2.5, intervalDays: 0, due: NOW - 1000, lastReviewed: null, attempts: 0, lastGrade: null, history: [], ...o });
const entry = (fen, bestUci, bestSan, extra = {}) => ({
  id: 'nb:' + fen.split(' ').slice(0, 4).join(' '), fen, sideToMove: 'white', moveNumber: 20, previous: null,
  played: { uci: 'g1f1', san: 'Kf1' }, best: { uci: bestUci, san: bestSan, line: [bestUci], lineSan: bestSan }, alternatives: [],
  evalBefore: 900, evalAfter: 0, winLoss: 45, cpLoss: 900, severity: 'blunder', kind: 'missed-mate',
  explanation: 'The enemy king has no escape squares, so the rook finishes the game.', themes: ['mate'], tags: ['missed-mate'], phase: 'middlegame',
  origin: { gameId: 'gone', ply: 39, label: 'You vs Bot, saved game', opponent: 'Bot', playedAt: NOW - DAY }, occurrences: [{ gameId: 'gone', ply: 39, uci: 'g1f1', at: NOW - DAY }],
  engine: 'Stockfish', savedAt: NOW - DAY, updatedAt: NOW - DAY, srs: sched(), ...extra,
});
const A = entry('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d8', 'Rd8#');
const C = entry('7k/8/6K1/8/8/8/8/R7 w - - 0 1', 'a1a8', 'Ra8#', { played: { uci: 'g6g5', san: 'Kg5' }, savedAt: NOW - 2 * DAY, updatedAt: NOW - 2 * DAY });
const B = entry('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'e1e2', 'Ke2', { severity: 'mistake', kind: 'mistake', themes: ['endgame'], tags: [], phase: 'endgame', winLoss: 12, srs: sched({ reps: 2, attempts: 2, intervalDays: 10, due: NOW + 10 * DAY, lastReviewed: NOW - DAY, lastGrade: 'good' }) });

const browser = await chromium.launch();
let failed = false;
try {
  console.log('MoveWise Mistake Notebook end-to-end');
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const external = [];
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });
  async function clickSquare(sq) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await page.locator('svg.board').first().boundingBox();
    const file = 'abcdefgh'.indexOf(sq[0]);
    const rank = Number(sq[1]) - 1;
    await page.mouse.click(box.x + ((file + 0.5) / 8) * box.width, box.y + ((7 - rank + 0.5) / 8) * box.height);
  }
  const seed = (entries) => page.evaluate(async (list) => {
    const db = await new Promise((res, rej) => { const q = indexedDB.open('movewise'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    await new Promise((res, rej) => { const tx = db.transaction('notebook', 'readwrite'); for (const e of list) tx.objectStore('notebook').put(e); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
  }, entries);
  const stored = (id) => page.evaluate(async (key) => {
    const db = await new Promise((res, rej) => { const q = indexedDB.open('movewise'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    const v = await new Promise((res) => { const q = db.transaction('notebook').objectStore('notebook').get(key); q.onsuccess = () => res(q.result); });
    db.close();
    return v;
  }, id);

  await step('first load installs the offline copy, then the network is cut', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.status-chip:has-text("Offline-ready")', { timeout: 15000 });
    await seed([A, B, C]);
    await context.setOffline(true);
    await page.goto(BASE + '#/notebook');
    await page.reload();
    await page.waitForSelector('[data-testid="notebook-page"]');
  });

  await step('the navigation has six main items and the Notebook is one of them', async () => {
    const labels = await page.locator('.nav a').allInnerTexts();
    assert(labels.join('|') === 'Play|Puzzles|Learn|Game Review|Mistake Notebook|Profile', 'nav: ' + labels.join('|'));
    assert((await page.locator('.nav a[aria-current="page"]').innerText()) === 'Mistake Notebook', 'Notebook is not current');
  });

  await step('the page shows what is due and lists every saved position', async () => {
    await page.waitForSelector('[data-testid="nb-list"]');
    assert((await page.locator('[data-testid="nb-row"]').count()) === 3, 'expected 3 rows');
    assert((await page.locator('[data-testid="nb-due-summary"]').innerText()).includes('2 positions are ready'), 'due summary: ' + (await page.locator('[data-testid="nb-due-summary"]').innerText()));
  });

  await step('views and filters narrow the list', async () => {
    await page.click('[data-testid="nb-view-upcoming"]');
    assert((await page.locator('[data-testid="nb-row"]').count()) === 1, 'upcoming should have 1');
    await page.click('[data-testid="nb-view-all"]');
    await page.selectOption('select[aria-label="Filter by severity"]', 'mistake');
    assert((await page.locator('[data-testid="nb-row"]').count()) === 1, 'severity filter');
    await page.selectOption('select[aria-label="Filter by severity"]', 'any');
    await page.selectOption('select[aria-label="Filter by theme"]', 'mate');
    assert((await page.locator('[data-testid="nb-row"]').count()) === 2, 'theme filter');
    await page.selectOption('select[aria-label="Filter by theme"]', 'any');
    await page.selectOption('select[aria-label="Filter by game"]', 'gone');
    assert((await page.locator('[data-testid="nb-row"]').count()) === 3, 'game filter');
    await page.selectOption('select[aria-label="Filter by game"]', 'any');
    await page.click('[data-testid="nb-view-retained"]');
    assert(await page.locator('[data-testid="nb-empty"]').isVisible(), 'retained view should be empty');
    await page.click('[data-testid="nb-view-all"]');
  });

  await step('a position opens with hints that become more direct, and a wrong move is not accepted', async () => {
    await page.goto(BASE + '#/notebook/e/' + encodeURIComponent(A.id));
    await page.waitForSelector('[data-testid="nb-exercise"]');
    await page.click('button:has-text("Give me a hint")');
    await page.click('button:has-text("Another hint")');
    await page.click('button:has-text("Another hint")');
    const hints = await page.locator('.nb-hints li').allInnerTexts();
    assert(hints.length === 3, 'three hints');
    assert(/rook on d1/.test(hints[2]), 'direct hint: ' + hints[2]);
    assert(await page.locator('button:has-text("No more hints")').isDisabled(), 'hint button should be disabled after 3');
    await clickSquare('g1');
    await clickSquare('f1');
    await page.waitForSelector('[data-testid="nb-message"].error', { timeout: 15000 });
    assert(/played|reconsider|Look again|not the move|differ/i.test(await page.locator('[data-testid="nb-message"]').innerText()), 'wrong-move message');
  });

  await step('the best move is accepted, explained and scheduled', async () => {
    await page.click('button:has-text("Try again")');
    await clickSquare('d1');
    await clickSquare('d8');
    await page.waitForSelector('[data-testid="nb-explain"]', { timeout: 15000 });
    assert(/Rd8#/.test(await page.locator('[data-testid="nb-explain"]').innerText()), 'explanation names the move');
    await page.waitForSelector('[data-testid="nb-next"]');
    const e = await stored(A.id);
    assert(e.srs.attempts === 1 && e.srs.lastGrade === 'hard', 'scheduled as hard after 3 hints and a wrong move: ' + JSON.stringify(e.srs));
    assert(e.srs.due > Date.now() + 12 * 3600_000, 'next review is at least half a day away');
  });

  await step('the result survives a reload', async () => {
    await page.reload();
    await page.waitForSelector('[data-testid="nb-exercise"]');
    const e = await stored(A.id);
    assert(e.srs.attempts === 1, 'attempt persisted');
  });

  await step('a review session shows only what is due, and revealing the answer marks it for practice', async () => {
    await page.goto(BASE + '#/notebook');
    await page.waitForSelector('[data-testid="nb-start"]');
    assert((await page.locator('[data-testid="nb-due-summary"]').innerText()).includes('1 position is ready'), 'one position is due now');
    await page.click('[data-testid="nb-start"]');
    await page.waitForSelector('text=Review 1 of 1');
    await page.click('button:has-text("Show the answer")');
    await page.waitForSelector('[data-testid="nb-explain"]');
    await page.waitForSelector('[data-testid="nb-next"]');
    const e = await stored(C.id);
    assert(e.srs.lastGrade === 'failed' && e.srs.due < Date.now() + 15 * 60_000, 'failed positions come back within minutes');
    await page.click('button:has-text("Finish")');
    await page.waitForSelector('[data-testid="nb-session-done"]');
    await page.click('a:has-text("Back to the Notebook")');
    await page.waitForSelector('[data-testid="nb-list"]');
    await page.click('[data-testid="nb-view-needs-practice"]');
    assert((await page.locator('[data-testid="nb-row"]').count()) === 1, 'needs-practice has the failed position');
  });

  await step('a position can be removed and a reload keeps it removed', async () => {
    await page.goto(BASE + '#/notebook/e/' + encodeURIComponent(B.id));
    await page.click('button:has-text("Remove from the Notebook")');
    await page.waitForSelector('[data-testid="nb-list"]');
    await page.reload();
    await page.waitForSelector('[data-testid="nb-list"]');
    assert((await page.locator('[data-testid="nb-row"]').count()) === 2, 'two left');
    assert((await stored(B.id)) === undefined, 'removed from storage');
  });

  await step('the app made no external requests and raised no page errors', async () => {
    assert(external.length === 0, 'external: ' + external.join(', '));
    assert(errors.length === 0, 'errors: ' + errors.join('; '));
  });
} catch {
  failed = true;
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? 'FAILED' : 'MoveWise Notebook end-to-end: all steps passed');
process.exit(failed ? 1 : 0);
