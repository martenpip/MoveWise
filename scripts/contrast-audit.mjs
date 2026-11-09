// Contrast audit (WCAG AA) for every page in both themes. axe-core could not be installed, so this
// computes text/background contrast from computed styles. Usage: node scripts/contrast-audit.mjs [backup.json]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = 4411, BASE = `http://localhost:${PORT}/`;
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
const bad = new Map();
const probe = () => {
  const parse = (c) => { const m = c.match(/[\d.e-]+/g).map(Number); const k = c.startsWith('color(') ? 255 : 1; const a = c.includes('/') ? m[m.length - 1] : (c.startsWith('color(') ? 1 : (m[3] ?? 1)); return { r: m[0] * k, g: m[1] * k, b: m[2] * k, a }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) chain.push(parse(getComputedStyle(e).backgroundColor)); let bg = parse(getComputedStyle(document.body).backgroundColor); if (bg.a < 1) bg = over(bg, { r: 255, g: 255, b: 255, a: 1 }); for (const c of chain.reverse()) if (c.a > 0) bg = over(c, bg); return bg; };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n; (n = walker.nextNode()); ) {
    const el = n.parentElement; if (!n.textContent.trim() || seen.has(el)) continue; seen.add(el);
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('svg')) continue;
    // Avatars sit on a CSS gradient that backgroundColor cannot see; their ink is checked against both gradient stops below.
    if (el.closest('.avatar')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const bg = bgOf(el); const fg = over(parse(cs.color), bg);
    const [a, b] = [lum(fg), lum(bg)]; const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio < need) out.push({ text: n.textContent.trim().slice(0, 40), ratio: +ratio.toFixed(2), need, cls: el.className?.toString?.().slice(0, 30) });
  }
  return out;
};
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(() => 0);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept()); // the Resign confirmation
  await page.goto(BASE);
  await page.waitForSelector('.dash-head');
  await page.goto(`${BASE}#/settings`);
  await page.getByRole('button', { name: theme === 'dark' ? /^Dark/ : /^Light/ }).click();
  await page.waitForTimeout(600);
  for (const route of ['', 'play', 'analysis', 'games', 'profile', 'settings', 'puzzles', 'puzzles/themes', 'puzzles/history', 'puzzles/packs', 'puzzles/games', 'puzzles/play/practice', 'academy', 'academy/course/beginner', 'academy/lesson/files-ranks', 'academy/lesson/capturing', 'academy/assess/beginner-board', 'academy/place/beginner', 'notebook', 'notebook/review']) {
    await page.goto(`${BASE}#/${route}`);
    await page.waitForTimeout(500);
    for (const f of await page.evaluate(probe)) bad.set(`${theme} /${route} "${f.text}" ${f.cls}`, f);
  }
  // Play with Trainer: the setup page, the game screen with the coach panel and its voice controls, and the results card.
  await page.goto(`${BASE}#/play`);
  await page.waitForSelector('[data-testid="mode-trainer"]');
  await page.click('[data-testid="mode-trainer"]');
  for (const f of await page.evaluate(probe)) bad.set(`${theme} play setup (Trainer) "${f.text}" ${f.cls}`, f);
  await page.click('button:has-text("Start game")');
  await page.waitForSelector('[data-testid="trainer-panel"]');
  await page.waitForTimeout(400);
  for (const f of await page.evaluate(probe)) bad.set(`${theme} Trainer game screen "${f.text}" ${f.cls}`, f);
  await page.locator('svg.board').focus();
  for (const k of ['Enter', 'ArrowUp', 'ArrowUp', 'Enter']) await page.keyboard.press(k);
  await page.waitForSelector('.movelist button');
  await page.click('button:has-text("Resign")');
  await page.waitForSelector('[data-testid="game-results"]');
  for (const f of await page.evaluate(probe)) bad.set(`${theme} game results card "${f.text}" ${f.cls}`, f);
  // Academy: the level picker, exercise feedback (wrong and right), a hint, the check result with missed questions.
  await page.goto(`${BASE}#/academy/lesson/what-is-chess`);
  await page.waitForSelector('.ac-nav');
  await page.click('.ac-nav button.primary');
  await page.click('.ac-nav button.primary');
  await page.click('.ac-option:has-text("Two")');
  await page.click('button:has-text("Give me a hint")');
  await page.waitForSelector('.ac-feedback.bad');
  for (const f of await page.evaluate(probe)) bad.set(`${theme} academy exercise wrong + hint "${f.text}" ${f.cls}`, f);
  await page.click('.ac-option:has-text("One")');
  await page.waitForSelector('.ac-feedback.good');
  for (const f of await page.evaluate(probe)) bad.set(`${theme} academy exercise right "${f.text}" ${f.cls}`, f);
  await page.click('.ac-nav button.primary');
  await page.click('.ac-option:has-text("Trap the enemy king")');
  await page.click('.ac-nav button.primary');
  await page.click('.ac-option:has-text("32")');
  await page.waitForSelector('.ac-feedback.bad');
  for (const f of await page.evaluate(probe)) bad.set(`${theme} academy check wrong answer "${f.text}" ${f.cls}`, f);
  await page.click('button:has-text("Next question")');
  await page.click('.ac-option:has-text("Who traps the enemy king")');
  await page.click('button:has-text("Next question")');
  await page.click('.ac-option:text-is("False")');
  await page.click('button:has-text("See result")');
  await page.waitForSelector('.ac-result');
  for (const f of await page.evaluate(probe)) bad.set(`${theme} academy check result "${f.text}" ${f.cls}`, f);
  await page.goto(`${BASE}#/academy`);
  await page.waitForSelector('text=Your progress');
  for (const f of await page.evaluate(probe)) bad.set(`${theme} academy dashboard with progress "${f.text}" ${f.cls}`, f);
  // Achievement states: unlocked cards, the detail dialog and a real unlock toast (play a game and resign).
  await page.goto(`${BASE}#/play`);
  await page.click('text=Start game');
  await page.waitForSelector('svg.board');
  await page.locator('svg.board').focus();
  for (const k of ['Enter', 'ArrowUp', 'ArrowUp', 'Enter']) await page.keyboard.press(k); // e2-e4 (Resign needs a move first)
  await page.waitForSelector('.movelist button');
  await page.click('button:has-text("Resign")');
  await page.waitForSelector('.toast.achievement', { timeout: 10000 });
  await page.waitForTimeout(700);
  for (const f of await page.evaluate(probe)) bad.set(`${theme} unlock toast "${f.text}" ${f.cls}`, f);
  await page.goto(`${BASE}#/profile`);
  await page.waitForSelector('.ach-card.earned');
  await page.waitForTimeout(400);
  for (const f of await page.evaluate(probe)) bad.set(`${theme} /profile with unlocks "${f.text}" ${f.cls}`, f);
  for (const sel of ['.ach-card.earned', '.ach-card.locked']) {
    await page.locator(sel).first().click();
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(300);
    for (const f of await page.evaluate(probe)) bad.set(`${theme} achievement dialog (${sel}) "${f.text}" ${f.cls}`, f);
    await page.keyboard.press('Escape');
  }
  // Game Review: set-up, summary, a move with its explanation and a previewed line, the move list, and the unfinished-run card.
  await page.goto(`${BASE}#/games`);
  await page.fill('textarea[aria-label="PGN text"]', '[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
  await page.click('button:has-text("Import PGN")');
  await page.click('li:has-text("Alice vs Bob") a:text-is("Review")');
  await page.waitForSelector('[data-testid="review-engine-expected"]');
  for (const f of await page.evaluate(probe)) bad.set(`${theme} review set-up "${f.text}" ${f.cls}`, f);
  await page.click('button.choice:has(b:text-is("Quick"))');
  await page.click('button:text-is("I played Black")');
  await page.click('button:text-is("Start review")');
  await page.waitForSelector('[data-testid="review-engine"]', { timeout: 120000 });
  await page.waitForTimeout(400);
  for (const f of await page.evaluate(probe)) bad.set(`${theme} review summary "${f.text}" ${f.cls}`, f);
  await page.click('button:has-text("All moves")');
  for (const f of await page.evaluate(probe)) bad.set(`${theme} review move list "${f.text}" ${f.cls}`, f);
  await page.click('.movelist button[aria-label^="3… Nf6"]');
  await page.click('button:has-text("Preview on the board")');
  await page.waitForTimeout(300);
  for (const f of await page.evaluate(probe)) bad.set(`${theme} review move + preview "${f.text}" ${f.cls}`, f);
  await page.locator('.rv-method summary').click();
  for (const f of await page.evaluate(probe)) bad.set(`${theme} review method "${f.text}" ${f.cls}`, f);
  await ctx.close();
}
await browser.close(); server.kill();
// Avatar initials: ink against both ends of each gradient (read from the source so the check cannot drift).
{
  const { readFileSync } = await import('node:fs');
  const lumHex = (h) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const src = readFileSync(new URL('../src/ui/Avatar.tsx', import.meta.url), 'utf8');
  let n = 0;
  for (const m of src.matchAll(/(\w+): \{ from: '(#\w+)', to: '(#\w+)', ink: '(#\w+)'/g)) {
    n++;
    for (const bg of [m[2], m[3]]) {
      const [a, b] = [lumHex(bg), lumHex(m[4])];
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < 4.5) bad.set(`avatar ${m[1]} ${bg}`, { ratio: +ratio.toFixed(2), need: 4.5 });
    }
  }
  if (n !== 6) bad.set('avatar audit could not read the 6 avatar styles', { ratio: 0, need: 4.5 });
}
for (const [k, v] of bad) console.log(`${v.ratio} < ${v.need}  ${k}`);
console.log(bad.size ? `${bad.size} low-contrast text items` : 'No text below WCAG AA contrast on any page, either theme.');
