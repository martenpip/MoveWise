// Academy end-to-end test (offline). Run `npm run build` first, then `node tests/e2e/academy.mjs`.
// Proves, in a real browser with the network cut: the Academy opens from the offline cache, a new learner picks a
// starting point, an interactive lesson is completed (read, answer, click squares on the board, knowledge check),
// progress survives a reload and resumes mid-lesson, wrong answers give feedback and can be retried, the result shows in
// the Profile, and no request leaves the app and no page error is raised.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT || 4396);
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
    console.log(`  FAIL ${name}\n       ${String(e && e.message ? e.message : e).split('\n').slice(0, process.env.E2E_FULL ? 12 : 1).join('\n       ')}`);
    throw e;
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch();
let failed = false;
try {
  console.log('MoveWise Academy end-to-end');
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const external = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });

  async function clickSquare(sq) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await page.locator('svg.board').first().boundingBox();
    const file = 'abcdefgh'.indexOf(sq[0]);
    const rank = Number(sq[1]) - 1;
    await page.mouse.click(box.x + ((file + 0.5) / 8) * box.width, box.y + ((7 - rank + 0.5) / 8) * box.height);
  }
  const stepText = () => page.locator('.ac-nav .muted').first().innerText();
  const next = () => page.click('.ac-nav button.primary');

  await step('first load installs the offline copy, then the network is cut', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.status-chip:has-text("Offline-ready")', { timeout: 15000 });
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.dash-head');
  });

  await step('offline: the Academy opens and asks where to start', async () => {
    await page.click('nav.nav a:has-text("Learn")');
    await page.waitForSelector('h1:text-is("Chess Academy")');
    await page.waitForSelector('text=Where would you like to start?');
    await page.click('button.ac-level:has-text("I am new to chess")');
    await page.waitForSelector('text=Your next step');
    assert(await page.locator('a.btn:has-text("Start: What is chess?")').isVisible(), 'first lesson should be offered');
    const evidence = await page.locator('section:has(h2:text-is("Based on your results"))').innerText();
    assert(/will not guess/.test(evidence), 'with no results the Academy must say it does not guess');
  });

  await step('a lesson opens and the exercises give feedback, hints and retries', async () => {
    await page.click('a.btn:has-text("Start: What is chess?")');
    await page.waitForSelector('h1:text-is("What is chess?")');
    assert(/Step 1 of 4/.test(await stepText()), 'should start at step 1');
    await next();
    await next();
    await page.waitForSelector('.ac-option');
    await page.click('.ac-option:has-text("Two")');
    await page.waitForSelector('.ac-feedback.bad');
    assert(await page.locator('.ac-nav button.primary').isDisabled(), 'next must stay locked until the exercise is solved');
    await page.click('button:has-text("Give me a hint")');
    await page.waitForSelector('.ac-hint');
    await page.click('.ac-option:has-text("One")');
    await page.waitForSelector('.ac-feedback.good');
    assert(await page.locator('.ac-nav button.primary').isEnabled(), 'next should unlock once solved');
  });

  await step('progress survives a reload and the lesson resumes where it stopped', async () => {
    await page.reload();
    await page.waitForSelector('h1:text-is("What is chess?")');
    assert(/Step 3 of 4/.test(await stepText()), `should resume at step 3, got: ${await stepText()}`);
    await next();
    await page.click('.ac-option:has-text("Trap the enemy king")');
    await page.waitForSelector('.ac-feedback.good');
    await next();
    await page.waitForSelector('text=knowledge check');
  });

  await step('the knowledge check: a wrong answer, then a retake, then a pass', async () => {
    await page.click('.ac-option:has-text("32")'); // wrong on purpose
    await page.waitForSelector('.ac-feedback.bad');
    await page.click('button:has-text("Next question")');
    await page.click('.ac-option:has-text("Who traps the enemy king")');
    await page.click('button:has-text("Next question")');
    await page.click('.ac-option:text-is("False")');
    await page.click('button:has-text("See result")');
    await page.waitForSelector('text=Check finished');
    assert(/2 of 3 correct/.test(await page.locator('.ac-score').innerText()), 'score should be 2 of 3');
    assert(await page.locator('text=Lesson complete.').isVisible(), '67% passes the lesson');
    assert(await page.locator('.ac-missed li').count() === 1, 'the missed question is listed for revisiting');
    await page.click('button:has-text("Practise the 1 I missed")');
    await page.waitForSelector('text=not scored');
    await page.click('.ac-option:has-text("64")');
    await page.click('button:has-text("See result")');
    await page.waitForSelector('text=Practice finished');
  });

  await step('clicking squares on the board works (coordinates lesson)', async () => {
    await page.goto(BASE + '#/academy/lesson/files-ranks');
    await page.waitForSelector('h1:text-is("Files, ranks and squares")');
    await next();
    await next();
    await page.waitForSelector('text=Find these squares');
    for (const s of ['e4', 'a1', 'h8']) {
      await clickSquare(s);
      await page.waitForSelector('.ac-feedback.good');
    }
    await clickSquare('a1'); // d5 is asked, so this is wrong
    await page.waitForSelector('.ac-feedback.bad');
    await clickSquare('d5');
    await page.waitForSelector('.ac-feedback.good:has-text("Letter for the file")');
    assert(await page.locator('.ac-nav button.primary').isEnabled(), 'exercise should be solved');
  });

  await step('a move exercise: a wrong move is explained, the right move is accepted (capturing lesson)', async () => {
    await page.goto(BASE + '#/academy/lesson/capturing');
    await page.waitForSelector('h1:text-is("Capturing and protection")');
    await next();
    await next();
    await page.waitForSelector('text=Capture the one that is not protected');
    await clickSquare('d1');
    await clickSquare('d5'); // protected pawn: the lesson explains why this loses the queen
    await page.waitForSelector('.ac-feedback.bad:has-text("exd5")');
    assert(await page.locator('.ac-nav button.primary').isDisabled(), 'a wrong move must not unlock the next step');
    await clickSquare('d1');
    await clickSquare('h5');
    await page.waitForSelector('.ac-feedback.good');
    assert(await page.locator('.ac-nav button.primary').isEnabled(), 'the exercise should be solved');
  });

  await step('the course page shows honest progress and the dashboard counts it', async () => {
    await page.goto(BASE + '#/academy/course/beginner');
    await page.waitForSelector('h1:text-is("Chess from zero")');
    const row = page.locator('li:has(strong:text-is("What is chess?"))');
    assert(/Completed/.test(await row.innerText()), 'What is chess? should be completed');
    assert(/Not started/.test(await page.locator('li:has(strong:text-is("Reading the board from both sides"))').innerText()), 'the unfinished lesson must not count as done');
    await page.goto(BASE + '#/academy');
    await page.waitForSelector('text=1 of ');
  });

  await step('the Profile shows the lesson and the First Lesson achievement', async () => {
    await page.goto(BASE + '#/profile');
    await page.waitForSelector('text=Lessons completed');
    const text = await page.locator('main').innerText();
    assert(/First Lesson/.test(text), 'First Lesson achievement should be shown');
  });

  await step('no external requests and no page errors', async () => {
    assert(external.length === 0, `external requests: ${external.join(', ')}`);
    assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  });
} catch {
  failed = true;
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? '\nFAILED' : '\nAll Academy end-to-end steps passed.');
process.exit(failed ? 1 : 0);
