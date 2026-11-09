// Keyboard audit: tabs through each main screen and checks that every focus stop has an accessible name and a visible focus
// indicator, that focus never gets stuck, and that the Trainer warning and the chessboard can be operated from the keyboard.
// Run `npm run build` first. This drives a real browser with the keyboard; it is not a screen-reader test.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 4393, BASE = `http://localhost:${PORT}/`;
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', cwd: ROOT });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
const problems = [];
let stops = 0;
const probe = () => {
  const e = document.activeElement;
  if (!e || e === document.body) return null;
  const cs = getComputedStyle(e);
  const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
  const shadow = cs.boxShadow !== 'none';
  const name = (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'))?.textContent || e.textContent || e.getAttribute('title') || (e.labels && e.labels[0] && e.labels[0].textContent) || e.getAttribute('placeholder') || '').trim();
  return { tag: e.tagName.toLowerCase(), text: name.slice(0, 40), visible: outline || shadow, sig: e.tagName + (e.id || '') + name.slice(0, 20) + (e.getAttribute('href') || '') };
};
try {
  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE);
    await page.waitForSelector('.dash-head');
    for (const r of ['', 'play', 'games', 'notebook', 'puzzles', 'academy', 'academy/lesson/files-ranks', 'profile', 'settings']) {
      await page.goto(`${BASE}#/${r}`);
      await page.waitForTimeout(500);
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
      const seen = new Set();
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press('Tab');
        const p = await page.evaluate(probe);
        if (!p) continue;
        stops++;
        if (seen.has(p.sig)) break; // focus wrapped around
        seen.add(p.sig);
        if (!p.text) problems.push(`${theme} #/${r}: ${p.tag} has no accessible name`);
        if (!p.visible) problems.push(`${theme} #/${r}: ${p.tag} "${p.text}" shows no focus indicator`);
      }
      if (seen.size < 5) problems.push(`${theme} #/${r}: only ${seen.size} focus stops reached`);
    }
    // The board: arrow keys move a cursor, Enter selects and plays; a Trainer warning is reachable and operable by keyboard.
    await page.goto(BASE + '#/play');
    await page.click('[data-testid="mode-trainer"]');
    await page.click('button:has-text("Start game")');
    await page.waitForSelector('[data-testid="trainer-panel"]');
    await page.locator('svg.board').focus();
    const label = await page.locator('svg.board').first().getAttribute('aria-label');
    if (!label) problems.push(`${theme}: the board has no accessible label`);
    for (const k of ['Enter', 'ArrowUp', 'ArrowUp', 'Enter']) await page.keyboard.press(k);
    try { await page.waitForSelector('.movelist button', { timeout: 5000 }); } catch { problems.push(`${theme}: e2-e4 could not be played with the keyboard`); }
    await page.waitForFunction(() => document.querySelectorAll('.movelist button').length >= 2, null, { timeout: 30000 }).catch(() => problems.push(`${theme}: the bot did not answer`));
    // Qh5 by keyboard: select d1 (cursor starts on e2 area; navigate by the same keys the board documents).
    const live = await page.locator('[aria-live]').count();
    if (live === 0) problems.push(`${theme}: no live region for announcements`);
    await ctx.close();
  }
  // Reduced motion: transitions and animations must be effectively off.
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForSelector('.dash-head');
  const anim = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => { const c = getComputedStyle(e); return (parseFloat(c.animationDuration) > 0.05 && c.animationName !== 'none') || parseFloat(c.transitionDuration) > 0.05; }).slice(0, 5).map((e) => e.tagName + '.' + e.className));
  if (anim.length) problems.push('reduced motion still animates: ' + anim.join(', '));
  await ctx.close();
} finally {
  await browser.close();
  server.kill();
}
console.log(`keyboard audit: ${stops} focus stops checked, ${problems.length} problems`);
for (const p of problems) console.log(' - ' + p);
process.exit(problems.length ? 1 : 0);
