// GitHub Pages serves a project site under a sub-path (https://user.github.io/movewise/). This serves dist/ under /movewise/ and
// checks that everything resolves there: the page, the service worker and its scope, the manifest, the Stockfish files and a
// bot move from them, a reload on a deep route and offline use. Run `npm run build` first.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT || 4396);
const ORIGIN = `http://localhost:${PORT}`;
const BASE = `${ORIGIN}/movewise/`;
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT), BASE_PATH: '/movewise' }, stdio: 'ignore', cwd: ROOT });
await new Promise((r) => setTimeout(r, 800));
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
let failed = false;
const step = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { failed = true; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); throw e; } };
try {
  console.log('MoveWise sub-path (GitHub Pages) end-to-end');
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  page.on('pageerror', (e) => bad.push('pageerror ' + e.message));
  await step('the app loads under /movewise/ and installs the offline copy', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.status-chip:has-text("Offline-ready")', { timeout: 20000 });
  });
  await step('the service worker scope, the manifest and the icons stay inside /movewise/', async () => {
    const info = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const link = document.querySelector('link[rel="manifest"]').href;
      const m = await (await fetch(link)).json();
      return { scope: reg.scope, manifest: link, start: new URL(m.start_url, link).href, mscope: new URL(m.scope, link).href, icons: m.icons.map((i) => new URL(i.src, link).href) };
    });
    assert(info.scope === BASE, 'scope ' + info.scope);
    assert(info.start === BASE && info.mscope === BASE, `manifest start ${info.start} scope ${info.mscope}`);
    for (const u of info.icons) { const r = await page.request.get(u); assert(r.ok(), 'icon ' + u); }
  });
  await step('Stockfish loads from the sub-path and a Stockfish-backed bot moves (Bot 1500)', async () => {
    await page.goto(BASE + '#/play');
    await page.waitForSelector('[data-testid="mode-normal"]');
    await page.selectOption('#level', 'r1500');
    await page.click('button:has-text("Black")');
    await page.click('button:has-text("Start game")');
    await page.waitForFunction(() => document.querySelectorAll('.movelist button, .movelist li').length >= 1, null, { timeout: 45000 });
  });
  await step('a reload on a deep route keeps working, online and offline', async () => {
    await page.goto(BASE + '#/academy/lesson/pos-isolated-pawn');
    await page.reload();
    await page.waitForSelector('h1');
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('h1');
    assert(page.url().startsWith(BASE), 'url ' + page.url());
    await page.goto(BASE + '#/notebook');
    await page.waitForSelector('h1:has-text("Mistake Notebook")');
    await context.setOffline(false);
  });
  await step('nothing was requested outside /movewise/ and nothing failed', async () => {
    assert(bad.length === 0, bad.join('\n'));
  });
} catch {
  failed = true;
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? 'FAILED' : 'MoveWise sub-path end-to-end: all steps passed');
process.exit(failed ? 1 : 0);
