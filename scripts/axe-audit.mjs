// Automated accessibility audit with axe-core across the main screens, dark and light, desktop and phone width.
// axe-core is not a project dependency (it is MPL-2.0 and only used for this audit): install it anywhere and point AXE_PATH at it.
//   npm install --prefix /tmp/axe axe-core && AXE_PATH=/tmp/axe/node_modules/axe-core/axe.min.js node scripts/axe-audit.mjs <sample-games.json>
// The sample file is made by scripts/make-sample-games.mts. Prints every violation (rule, impact, target) and exits 1 if any remain.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('..', import.meta.url).pathname;
const AXE = readFileSync(process.env.AXE_PATH || '', 'utf8');
const sample = process.argv[2];
const PORT = 4394, BASE = `http://localhost:${PORT}/`;
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', cwd: ROOT });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
const found = new Map();
let checked = 0;
async function scan(page, label) {
  await page.waitForTimeout(400);
  await page.evaluate(AXE);
  const res = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } }));
  checked++;
  for (const v of res.violations) for (const n of v.nodes) {
    const key = `${v.id}|${n.target.join(' ')}`;
    if (!found.has(key)) found.set(key, { id: v.id, impact: v.impact, target: n.target.join(' '), where: [], help: v.help });
    found.get(key).where.push(label);
  }
}
try {
  for (const theme of ['dark', 'light']) for (const [w, h] of [[1280, 900], [360, 740]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE);
    await page.waitForSelector('.dash-head');
    await page.goto(BASE + '#/settings');
    await page.getByRole('button', { name: theme === 'dark' ? /^Dark/ : /^Light/ }).click();
    if (sample) { await page.locator('input[type="file"][accept*="json"]').setInputFiles(sample); await page.waitForTimeout(1200); }
    const L = (n) => `${theme} ${w}px ${n}`;
    for (const r of ['', 'play', 'analysis', 'games', 'games/sample-3', 'games/sample-3/review', 'notebook', 'puzzles', 'puzzles/themes', 'academy', 'academy/course/beginner', 'academy/lesson/files-ranks', 'profile', 'settings']) {
      await page.goto(`${BASE}#/${r}`);
      await scan(page, L('#/' + r));
    }
    // Play setup in Trainer mode, then the Trainer game screen and the results card.
    await page.goto(BASE + '#/play');
    await page.waitForSelector('[data-testid="mode-trainer"]');
    await page.click('[data-testid="mode-trainer"]');
    await scan(page, L('play setup, Trainer'));
    await page.click('button:has-text("Start game")');
    await page.waitForSelector('[data-testid="trainer-panel"]');
    await scan(page, L('Trainer game'));
    await page.locator('svg.board').focus();
    for (const k of ['Enter', 'ArrowUp', 'ArrowUp', 'Enter']) await page.keyboard.press(k);
    await page.waitForSelector('.movelist button');
    await scan(page, L('Trainer game after a move'));
    await page.click('button:has-text("Resign")');
    await page.waitForSelector('[data-testid="game-results"]');
    await scan(page, L('results'));
    // A Review with results, on the first pass only (it takes a while).
    if (theme === 'dark' && w === 1280 && sample) {
      await page.goto(BASE + '#/games/sample-3/review');
      await page.click('button.choice:has(b:text-is("Quick"))');
      await page.click('button:text-is("I played White")');
      await page.click('button:text-is("Start review")');
      await page.waitForSelector('[data-testid="review-engine"]', { timeout: 280000 });
      await scan(page, L('review result'));
      await page.click('button:has-text("All moves")');
      await page.locator('.movelist button').nth(12).click();
      await scan(page, L('review move'));
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(`axe: ${checked} page states scanned, ${found.size} distinct violations`);
for (const v of found.values()) console.log(`- [${v.impact}] ${v.id}: ${v.help}\n    ${v.target}\n    on: ${[...new Set(v.where)].slice(0, 4).join('; ')}${v.where.length > 4 ? '; ...' : ''}`);
process.exit(found.size ? 1 : 0);
