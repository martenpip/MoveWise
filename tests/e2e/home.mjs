// Home page end-to-end: a new player sees the three questions answered, no "planned features" list, and nothing leaves the device.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT || 4397);
const BASE = `http://localhost:${PORT}/`;
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', cwd: ROOT });
await new Promise((r) => setTimeout(r, 800));
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
let failed = false;
try {
  console.log('MoveWise Home end-to-end');
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  const external = [];
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });
  await page.goto(BASE);
  await page.waitForSelector('[data-testid="home-next"]');
  const text = await page.locator('main, #main').first().innerText();
  for (const q of ['What can I do now?', 'What should I practise?', 'How am I improving?']) assert(text.includes(q), 'missing: ' + q);
  assert(!/Still being built|Planned/.test(text), 'no roadmap on Home');
  assert((await page.locator('[data-testid="home-next"] a.btn').count()) >= 2, 'at least two actions');
  assert((await page.locator('[data-testid="home-improving"]').innerText()).includes('Nothing to measure yet'), 'a new player gets an honest empty state');
  const nav = await page.locator('nav a').allInnerTexts();
  assert(['Play', 'Puzzles', 'Learn', 'Game Review', 'Mistake Notebook', 'Profile'].every((n) => nav.some((t) => t.includes(n))), 'six navigation items: ' + nav.join('|'));
  assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text), 'no emoji');
  assert(external.length === 0, 'external: ' + external.join(','));
  console.log('  ok   Home answers the three questions for a new player');
} catch (e) {
  failed = true;
  console.log('  FAIL ' + (e && e.message));
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
