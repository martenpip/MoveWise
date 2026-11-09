// Stockfish end-to-end test (offline). Run `npm run build` first, then `node tests/e2e/stockfish.mjs`.
// Proves, in a real browser: only the lite single-threaded Stockfish ships; it is precached and answers with the network
// cut; the interface names the engine that really answered; the choice persists; bots are unchanged; and when
// Stockfish cannot start, analysis falls back to the built-in engine instead of breaking.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT || 4392);
const BASE = `http://localhost:${PORT}/`;

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

const MATE_IN_ONE = '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1';
const SF_NAME = 'Stockfish 19 (lite)';
const browser = await chromium.launch();

try {
  console.log('MoveWise Stockfish end-to-end');

  await step('the build ships only the lite single-threaded Stockfish, with its licence and source notice', async () => {
    const dir = `${ROOT}dist/assets/stockfish`;
    assert(existsSync(dir), 'dist/assets/stockfish is missing; run npm run build');
    const files = readdirSync(dir).sort();
    assert(
      JSON.stringify(files) === JSON.stringify(['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']),
      `unexpected engine files: ${files.join(', ')}`,
    );
    for (const f of ['MoveWise-LICENSE.txt', 'Stockfish-COPYING.txt', 'Stockfish-SOURCE.txt']) {
      assert(existsSync(`${ROOT}dist/licenses/${f}`), `missing dist/licenses/${f}`);
    }
    const source = readFileSync(`${ROOT}dist/licenses/Stockfish-SOURCE.txt`, 'utf8');
    assert(source.includes('stockfish 19.0.1') && source.includes('/tree/v19.0.1') && source.includes('/tree/sf_19'), 'source notice must name the exact version');
    assert(readFileSync(`${ROOT}dist/licenses/MoveWise-LICENSE.txt`, 'utf8').includes('Version 3, 29 June 2007'), 'the full GPL text must ship');
    const sw = readFileSync(`${ROOT}dist/sw.js`, 'utf8');
    for (const f of ['./assets/stockfish/stockfish-19-lite-single.js', './assets/stockfish/stockfish-19-lite-single.wasm', './licenses/Stockfish-SOURCE.txt']) {
      assert(sw.includes(f), `service worker does not precache ${f}`);
    }
  });

  /* -------------------- main journey: install, go offline, analyse -------------------- */
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const external = [];
  const engineRequests = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  context.on('request', (r) => {
    if (r.url().includes('/assets/stockfish/')) engineRequests.push(r.url().split('/').pop());
  });

  await step('first load installs the offline copy, and the engine files are in the cache with the right types', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.status-chip:has-text("Offline-ready")', { timeout: 15000 });
    const cached = await page.evaluate(async () => {
      const out = {};
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
          const hit = await cache.match('./assets/stockfish/' + f);
          if (hit) out[f] = { bytes: (await hit.arrayBuffer()).byteLength, type: hit.headers.get('content-type') };
        }
      }
      return out;
    });
    assert(cached['stockfish-19-lite-single.wasm']?.bytes > 1_000_000, 'the wasm is not in the cache');
    assert(cached['stockfish-19-lite-single.wasm'].type === 'application/wasm', `wasm served as ${cached['stockfish-19-lite-single.wasm'].type}`);
    assert(cached['stockfish-19-lite-single.js']?.bytes > 10_000, 'the engine script is not in the cache');
  });

  await step('the page needs no special headers (not cross-origin isolated) and still works', async () => {
    const isolated = await page.evaluate(() => crossOriginIsolated);
    assert(isolated === false, 'this test must run without COOP/COEP to prove the lite build needs none');
  });

  await step('network cut: reload while offline still loads the app', async () => {
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.dash-head');
  });

  await step('offline: the Analysis board is answered by Stockfish, and says so', async () => {
    await page.goto(BASE + '#/analysis');
    await page.fill('input[aria-label="FEN"]', MATE_IN_ONE);
    await page.click('text=Load FEN');
    await page.waitForSelector('dd:has-text("Ra8#")', { timeout: 30000 });
    await page.waitForSelector(`p:has-text("One line from ${SF_NAME}")`, { timeout: 10000 });
    const text = await page.locator('main').innerText();
    assert(!text.includes('not Stockfish'), 'the page must not claim the built-in engine answered');
    assert(engineRequests.includes('stockfish-19-lite-single.js') && engineRequests.includes('stockfish-19-lite-single.wasm'), `engine files were not requested: ${engineRequests.join(',')}`);
  });

  await step('offline: Stockfish also evaluates a quiet position and keeps up when the position changes quickly', async () => {
    await page.fill('input[aria-label="FEN"]', 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
    await page.click('text=Load FEN');
    await page.waitForSelector('dt:has-text("Evaluation")', { timeout: 30000 });
    // Rapid changes cancel in-flight searches; the last position must win.
    for (const fen of ['4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', '7k/8/8/8/8/8/8/KQ6 w - - 0 1', MATE_IN_ONE]) {
      await page.fill('input[aria-label="FEN"]', fen);
      await page.click('text=Load FEN');
    }
    await page.waitForSelector('dd:has-text("Ra8#")', { timeout: 30000 });
  });

  await step('offline: choosing the built-in engine in Settings switches analysis to it, and the choice persists', async () => {
    await page.goto(BASE + '#/settings');
    await page.waitForSelector('h2:has-text("Engines")');
    const status = await page.locator('section[aria-labelledby="h-engines"] p[role="status"]').innerText();
    assert(status.includes(SF_NAME), `status should name Stockfish, got: ${status}`);
    await page.click('section[aria-labelledby="h-engines"] button.choice:has(b:text-is("Built-in engine"))');
    assert((await page.evaluate(() => localStorage.getItem('mw-analysis-engine'))) === 'builtin', 'the choice was not saved');
    await page.goto(BASE + '#/analysis');
    await page.fill('input[aria-label="FEN"]', MATE_IN_ONE);
    await page.click('text=Load FEN');
    await page.waitForSelector('p:has-text("One line from Built-in engine (not Stockfish)")', { timeout: 30000 });
    await page.reload();
    await page.goto(BASE + '#/settings');
    await page.waitForSelector('section[aria-labelledby="h-engines"] button.choice[aria-pressed="true"]:has(b:text-is("Built-in engine"))');
  });

  await step('offline: switching back to Stockfish works', async () => {
    await page.click('section[aria-labelledby="h-engines"] button.choice:has(b:text-is("Stockfish 19 (lite)"))');
    await page.goto(BASE + '#/analysis');
    await page.fill('input[aria-label="FEN"]', MATE_IN_ONE);
    await page.click('text=Load FEN');
    await page.waitForSelector(`p:has-text("One line from ${SF_NAME}")`, { timeout: 30000 });
  });

  await step('bots below 1400 are still answered by the built-in engine, offline', async () => {
    await page.goto(BASE + '#/settings');
    const note = await page.locator('section[aria-labelledby="h-engines"]').innerText();
    assert(note.includes('Bots below 1400 use the built-in engine'), 'Settings must say bots are unchanged');
    await page.goto(BASE + '#/play');
    await page.waitForSelector('text=Start game');
    await page.click('text=Start game');
    await page.waitForSelector('svg.board');
    await page.evaluate(() => window.scrollTo(0, 0)); // raw coordinates ignore the sticky header
    const box = await page.locator('svg.board').boundingBox();
    const at = (file, rank) => ({ x: box.x + ((file + 0.5) / 8) * box.width, y: box.y + ((8 - rank + 0.5) / 8) * box.height });
    const from = at(4, 2);
    const to = at(4, 4);
    await page.mouse.click(from.x, from.y);
    await page.mouse.click(to.x, to.y);
    await page.waitForFunction(() => document.querySelectorAll('.movelist button').length >= 2, null, { timeout: 20000 });
  });

  await step('the licence and source notice open offline from Settings', async () => {
    await page.goto(BASE + '#/settings');
    const href = await page.locator('a:has-text("Licence and source code")').getAttribute('href');
    assert(href === './licenses/Stockfish-SOURCE.txt', `unexpected link ${href}`);
    const body = await page.evaluate(async (h) => (await fetch(h)).text(), href);
    assert(body.includes('stockfish 19.0.1') && body.includes('github.com/official-stockfish/Stockfish/tree/sf_19'), 'the notice is not readable offline');
  });

  await step('no external network requests were made', async () => {
    assert(external.length === 0, `external requests: ${external.join(', ')}`);
  });
  await step('no uncaught page errors', async () => {
    assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  });
  await context.close();

  /* -------------------- failure path: Stockfish cannot start -------------------- */
  const broken = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
  await broken.route('**/*.wasm', (route) => route.abort());
  page = await broken.newPage();

  await step('if Stockfish cannot start, analysis still works through the built-in engine', async () => {
    await page.goto(BASE + '#/analysis');
    await page.fill('input[aria-label="FEN"]', MATE_IN_ONE);
    await page.click('text=Load FEN');
    await page.waitForSelector('dd:has-text("Ra8#")', { timeout: 30000 });
    await page.waitForSelector('p:has-text("One line from Built-in engine (not Stockfish)")', { timeout: 10000 });
  });

  await step('and Settings explains that Stockfish could not start', async () => {
    await page.goto(BASE + '#/settings');
    await page.waitForSelector('section[aria-labelledby="h-engines"] p[role="status"]:has-text("could not start")', { timeout: 10000 });
  });
  await broken.close();
} catch {
  /* reported below */
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
process.exit(failed.length ? 1 : 0);
