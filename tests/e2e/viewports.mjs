// Viewport end-to-end test. Run `npm run build` first, then `node tests/e2e/viewports.mjs`.
// Opens every top-level page and key sub-pages at 360, 375, 390, 768 and desktop widths, in the dark and light themes, and checks:
// no horizontal overflow, the six navigation items are all visible and at least 44 px wide/tall, their labels fit inside them,
// and boards fit the viewport. Set E2E_SHOTS to a folder to save screenshots.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT || 4397);
const BASE = `http://localhost:${PORT}/`;
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', cwd: ROOT });
await new Promise((r) => setTimeout(r, 800));

const WIDTHS = [[360, 740], [375, 812], [390, 844], [768, 1024], [1024, 768], [1101, 800], [1100, 800], [1280, 900], [1920, 1080]];
const ROUTES = ['#/', '#/play', '#/analysis', '#/games', '#/notebook', '#/notebook/review', '#/puzzles', '#/puzzles/themes', '#/academy', '#/academy/course/positional', '#/academy/lesson/pos-isolated-pawn', '#/profile', '#/settings'];
const problems = [];
const browser = await chromium.launch();
try {
  for (const theme of ['dark', 'light']) for (const [w, h] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(BASE);
    await page.waitForSelector('#root *');
    for (const route of ROUTES) {
      await page.evaluate((r) => { location.hash = r; }, route);
      await page.waitForTimeout(350);
      const tag = `${w}px ${theme} ${route}`;
      const r = await page.evaluate(() => {
        const de = document.documentElement;
        const boards = [...document.querySelectorAll('.board')].map((b) => { const q = b.getBoundingClientRect(); return { l: q.left, r: q.right, w: q.width }; });
        const tabs = [...document.querySelectorAll('.tabbar a')].map((a) => {
          const q = a.getBoundingClientRect(); const lab = [...a.querySelectorAll('span')].pop();
          return { w: q.width, h: q.height, l: q.left, r: q.right, vis: q.width > 0 && getComputedStyle(a).display !== 'none', labelW: lab ? lab.scrollWidth : 0, labelFit: lab ? lab.scrollWidth <= lab.clientWidth + 1 : true };
        });
        const navVisible = [...document.querySelectorAll('.nav a')].filter((a) => a.getBoundingClientRect().width > 0).length;
        return { sw: de.scrollWidth, iw: window.innerWidth, boards, tabs, navVisible };
      });
      if (r.sw > r.iw + 1) problems.push(`${tag}: horizontal overflow (${r.sw} > ${r.iw})`);
      for (const b of r.boards) if (b.l < -1 || b.r > r.iw + 1) problems.push(`${tag}: board outside viewport (${Math.round(b.l)}..${Math.round(b.r)})`);
      if (w <= 1100) {
        if (r.tabs.length !== 6) problems.push(`${tag}: expected 6 tab items, found ${r.tabs.length}`);
        r.tabs.forEach((t, i) => {
          if (!t.vis) problems.push(`${tag}: tab ${i} hidden`);
          if (t.w < 44 || t.h < 44) problems.push(`${tag}: tab ${i} too small (${Math.round(t.w)}x${Math.round(t.h)})`);
          if (!t.labelFit) problems.push(`${tag}: tab ${i} label clipped`);
          if (t.l < -1 || t.r > r.iw + 1) problems.push(`${tag}: tab ${i} off screen`);
        });
      } else if (r.navVisible !== 6) problems.push(`${tag}: expected 6 top nav items, found ${r.navVisible}`);
    }
    if (errs.length) problems.push(`${w}px ${theme}: page errors ${errs.join('; ')}`);
    if (process.env.E2E_SHOTS && theme === 'dark') { await page.evaluate(() => { location.hash = '#/academy'; }); await page.waitForTimeout(300); await page.screenshot({ path: `${process.env.E2E_SHOTS}/vp-${w}.png` }); }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
const uniq = [...new Set(problems)];
console.log(`MoveWise viewports: ${WIDTHS.length * 2 * ROUTES.length} page checks, ${uniq.length} problems`);
for (const p of uniq.slice(0, 60)) console.log('  ' + p);
process.exit(uniq.length ? 1 : 0);
