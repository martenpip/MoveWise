// Takes the README screenshots from the real running app (dist/ served locally, headless Chromium, dark theme, 1280x800).
// The data is a set of sample games played by the app's own bots (scripts/make-sample-games.mts), imported through the app's normal
// import, then reviewed in the app so the Game Review and the Mistake Notebook hold real results.
// Usage: npm run build && npx tsx scripts/make-sample-games.mts /tmp/sample.json && node scripts/screenshots.mjs /tmp/sample.json
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = ROOT + 'screenshots/';
const sample = process.argv[2];
if (!sample) throw new Error('usage: node scripts/screenshots.mjs <sample-games.json>');
mkdirSync(OUT, { recursive: true });
const PORT = 4395;
const BASE = `http://localhost:${PORT}/`;
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', cwd: ROOT });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
const page = await context.newPage();
page.on('dialog', (d) => d.accept());
const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}${name}.png` }); console.log('shot', name); };
const go = async (hash) => { await page.goto(BASE + hash); await page.waitForTimeout(300); };
try {
  await page.goto(BASE);
  await page.waitForSelector('.dash-head');
  await go('#/settings');
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(sample);
  await page.waitForTimeout(1500);

  // Review two games the player lost, so the Review and the Notebook have real content.
  for (const [id, side] of [['sample-3', 'White'], ['sample-5', 'White']]) {
    await go(`#/games/${id}/review`);
    await page.waitForSelector('button.choice:has(b:text-is("Quick"))');
    await page.click('button.choice:has(b:text-is("Quick"))');
    await page.click(`button:text-is("I played ${side}")`);
    await page.click('button:text-is("Start review")');
    await page.waitForSelector('[data-testid="review-engine"]', { timeout: 280000 });
    if (id === 'sample-3') {
      await page.waitForSelector('svg.rv-graph-svg');
      await shot('06-game-review');
      await page.click('button:has-text("All moves")');
      const blunder = page.locator('.movelist button[aria-label*="Blunder"], .movelist button[aria-label*="blunder"]').first();
      if (await blunder.count()) await blunder.click(); else await page.locator('.movelist button').nth(20).click();
      await page.waitForTimeout(800);
      await shot('07-move-analysis');
    }
  }

  await go('#/');
  await page.waitForSelector('[data-testid="home-next"]');
  await shot('01-home');

  await go('#/play');
  await page.waitForSelector('[data-testid="mode-normal"]');
  await page.selectOption('#level', 'r1000');
  await shot('03-bot-selection');

  // A Trainer game: the welcome, then a warning before a blunder.
  await page.click('[data-testid="mode-trainer"]');
  await page.selectOption('#level', 'r300');
  await page.click('button:has-text("Start game")');
  await page.waitForSelector('[data-testid="trainer-panel"]');
  const sq = async (f, r) => { await page.evaluate(() => window.scrollTo(0, 0)); const b = await page.locator('svg.board').first().boundingBox(); await page.mouse.click(b.x + ((f + 0.5) / 8) * b.width, b.y + ((8 - r - 0.5) / 8) * b.height); };
  await sq(4, 1); await sq(4, 3);
  await page.waitForFunction(() => document.querySelectorAll('.movelist button, .movelist li').length >= 2, null, { timeout: 30000 });
  await sq(3, 0); await sq(7, 4); // Qh5
  let warned = true;
  try { await page.waitForSelector('[data-testid="trainer-warning"]', { timeout: 20000 }); } catch { warned = false; }
  if (!warned) {
    await page.waitForFunction(() => document.querySelectorAll('.movelist button, .movelist li').length >= 4, null, { timeout: 30000 });
    await sq(7, 4); await sq(5, 6); // Qxf7 (a queen for a pawn when defended)
    await page.waitForSelector('[data-testid="trainer-warning"]', { timeout: 30000 });
  }
  await shot('04-play-with-trainer');
  await page.click('[data-testid="trainer-reconsider"]');
  await page.click('button:has-text("Resign")');
  await page.waitForSelector('[data-testid="game-results"]');
  await page.locator('[data-testid="game-results"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('02-game-results');

  // The Trainer voice settings exactly as this browser offers them (headless Chromium has no installed voices).
  await go('#/settings');
  await page.waitForSelector('[data-testid="trainer-settings"]');
  await page.locator('[data-testid="trainer-settings"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -80));
  await shot('05-trainer-voice-settings');

  await go('#/puzzles');
  await shot('08-puzzles');
  await go('#/academy');
  await shot('09-academy');
  await go('#/notebook');
  await page.waitForSelector('[data-testid="notebook-page"]');
  await shot('10-mistake-notebook');
  await go('#/profile');
  await shot('11-profile');
} finally {
  await browser.close();
  server.kill();
}
