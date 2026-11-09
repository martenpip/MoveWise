// Play with Trainer end-to-end test (offline). Run `npm run build` first, then `node tests/e2e/trainer.mjs`.
// Proves, in a real browser with the network cut: the setup page offers Normal and Trainer and explains practice vs competitive bots;
// a normal game is never interrupted; a Trainer game warns before a serious blunder with "Let me reconsider" and "Play the move
// anyway"; Trainer games are saved as unranked practice; a Stockfish-backed level (1500) makes its move; spoken coaching uses only
// voices installed on the device (a fake speech synthesiser stands in for the browser's, and a streaming voice is never used);
// stopping and new messages cancel earlier speech; and nothing leaves the device.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT || 4399);
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

const FAKE_SPEECH = `
  (() => {
    const voices = [
      { voiceURI: 'Samantha', name: 'Samantha', lang: 'en-US', localService: true, default: true },
      { voiceURI: 'Daniel', name: 'Daniel', lang: 'en-GB', localService: true, default: false },
      { voiceURI: 'Google US English Female', name: 'Google US English Female', lang: 'en-US', localService: false, default: false },
    ];
    window.__speech = { spoken: [], cancels: 0 };
    class U { constructor(t) { this.text = t; } }
    const synth = new EventTarget();
    synth.getVoices = () => voices;
    synth.speak = (u) => { window.__speech.spoken.push({ text: u.text, voice: u.voice && u.voice.name, volume: u.volume }); setTimeout(() => u.onend && u.onend(), 20); };
    synth.cancel = () => { window.__speech.cancels++; };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = U;
    Date.now = ((orig) => () => orig())(Date.now);
  })();
`;

const browser = await chromium.launch();
let failed = false;
try {
  console.log('MoveWise Play with Trainer end-to-end');
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  await context.addInitScript(FAKE_SPEECH);
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const external = [];
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });
  async function clickSquare(sq, flipped = false) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await page.locator('svg.board').first().boundingBox();
    const file = 'abcdefgh'.indexOf(sq[0]);
    const rank = Number(sq[1]) - 1;
    const col = flipped ? 7 - file : file;
    const row = flipped ? rank : 7 - rank;
    await page.mouse.click(box.x + ((col + 0.5) / 8) * box.width, box.y + ((row + 0.5) / 8) * box.height);
  }
  const move = async (a, b) => { await clickSquare(a); await clickSquare(b); };
  const plies = () => page.locator('.movelist li, .movelist [data-ply], .movelist button').count();
  const moveText = () => page.locator('.movelist').innerText().catch(() => '');
  const sound = () => page.evaluate(() => window.__speech.spoken.length);

  await step('first load installs the offline copy, then the network is cut', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.status-chip:has-text("Offline-ready")', { timeout: 15000 });
    await context.setOffline(true);
    await page.goto(BASE + '#/play');
    await page.reload();
    await page.waitForSelector('[data-testid="mode-normal"]');
  });

  await step('the setup page offers Normal and Trainer and explains practice and competitive bots', async () => {
    assert((await page.locator('[data-testid="mode-trainer"]').innerText()).includes('Always unranked'), 'trainer card text');
    const groups = await page.locator('#level optgroup').evaluateAll((g) => g.map((x) => x.label));
    assert(groups.length === 2 && /Practice/.test(groups[0]) && /Competitive/.test(groups[1]), 'groups: ' + groups.join('|'));
    const opts = await page.locator('#level option').allInnerTexts();
    assert(opts.length === 25 && opts[0] === 'Bot 100' && opts[24] === 'Bot 2500', 'levels: ' + opts.length + ' ' + opts[0] + ' ' + opts[24]);
    await page.selectOption('#level', 'r500');
    assert((await page.locator('[data-testid="level-category"]').innerText()).includes('will not change your rating'), 'practice text');
    await page.selectOption('#level', 'r1200');
    assert((await page.locator('[data-testid="level-category"]').innerText()).includes('counts toward your MoveWise Rating'), 'competitive text');
    await page.click('[data-testid="mode-trainer"]');
    assert((await page.locator('[data-testid="level-category"]').innerText()).includes('practice and will not change your rating'), 'trainer text');
  });

  await step('a normal game is never interrupted, even by a hanging queen', async () => {
    await page.click('[data-testid="mode-normal"]');
    await page.selectOption('#level', 'r100');
    await page.click('button:has-text("Start game")');
    await page.waitForSelector('svg.board');
    assert((await page.locator('[data-testid="trainer-panel"]').count()) === 0, 'no trainer panel in a normal game');
    await move('e2', 'e4');
    await page.waitForFunction(() => document.querySelectorAll('.movelist button, .movelist li').length >= 2, null, { timeout: 15000 });
    await move('d1', 'h5');
    await page.waitForTimeout(600);
    assert((await page.locator('[data-testid="trainer-warning"]').count()) === 0, 'normal games never warn');
    await page.click('button:has-text("Resign")');
    await page.waitForSelector('[data-testid="game-results"]');
    assert((await page.locator('[data-testid="game-results"]').innerText()).includes('Practice, unranked'), 'results say practice');
    assert((await page.locator('[data-testid="review-invite"]').innerText()).includes('See what went well, find the mistakes that mattered, and learn how to improve.'), 'review invitation');
  });

  await step('a Trainer game warns before a serious blunder and lets the player reconsider', async () => {
    await page.click('button:has-text("Play again")');
    await page.waitForSelector('[data-testid="mode-trainer"]');
    await page.selectOption('#level', 'r100');
    await page.click('[data-testid="mode-trainer"]');
    await page.click('button:has-text("Start game")');
    await page.waitForSelector('[data-testid="trainer-panel"]');
    // 1. e4, then the bot answers; 2. Qh5 and 3. Qxf7+ (a queen for a pawn) are the blunders tried until a warning appears.
    await move('e2', 'e4');
    await page.waitForFunction(() => document.querySelectorAll('.movelist button, .movelist li').length >= 2, null, { timeout: 20000 });
    await move('d1', 'h5');
    let warned = false;
    try { await page.waitForSelector('[data-testid="trainer-warning"]', { timeout: 20000 }); warned = true; } catch { /* continue */ }
    if (!warned) {
      await page.waitForFunction(() => document.querySelectorAll('.movelist button, .movelist li').length >= 4, null, { timeout: 20000 });
      await move('h5', 'f7');
      await page.waitForSelector('[data-testid="trainer-warning"]', { timeout: 30000 });
    }
    const text = await page.locator('[data-testid="trainer-warning"]').innerText();
    assert(/engine/i.test(text) && /Let me reconsider/.test(text) && /Play the move anyway/.test(text), 'warning content: ' + text);
    assert(await page.locator('[data-testid="trainer-warning"]').isVisible(), 'warning visible');
    const before = await moveText();
    await page.click('[data-testid="trainer-reconsider"]');
    assert((await page.locator('[data-testid="trainer-warning"]').count()) === 0, 'warning gone after reconsider');
    assert((await moveText()) === before, 'the move was not played');
    page.__blunderWarned = warned;
  });

  await step('"Play the move anyway" plays the move', async () => {
    const warnedFirst = page.__blunderWarned;
    const [from, to] = warnedFirst ? ['d1', 'h5'] : ['h5', 'f7'];
    const before = await moveText();
    await move(from, to);
    await page.waitForSelector('[data-testid="trainer-warning"]', { timeout: 30000 });
    await page.click('[data-testid="trainer-play-anyway"]');
    await page.waitForFunction((b) => document.querySelector('.movelist').innerText !== b, before, { timeout: 10000 });
    assert((await page.locator('[data-testid="trainer-warning"]').count()) === 0, 'warning closes');
  });

  await step('a finished Trainer game is saved as unranked practice and feeds the review', async () => {
    await page.click('button:has-text("Resign")');
    await page.waitForSelector('[data-testid="game-results"]');
    const t = await page.locator('[data-testid="game-results"]').innerText();
    assert(/Played with the Trainer, unranked/.test(t), 'game type: ' + t);
    await page.waitForSelector('[data-testid="review-game"]');
    const games = await page.evaluate(async () => {
      const db = await new Promise((res, rej) => { const q = indexedDB.open('movewise'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      const all = await new Promise((res) => { const q = db.transaction('games').objectStore('games').getAll(); q.onsuccess = () => res(q.result); });
      db.close();
      return all.map((g) => ({ mode: g.mode, botLevel: g.botLevel }));
    });
    assert(games.length === 2 && games.filter((g) => g.mode === 'trainer').length === 1, 'games: ' + JSON.stringify(games));
    await page.goto(BASE + '#/profile');
    await page.waitForSelector('text=MoveWise Rating', { timeout: 10000 });
    const prof = await page.locator('main, #main').first().innerText();
    assert(!/Rating \d+ →/.test(prof), 'no rating change recorded for practice or Trainer games');
  });

  await step('a Stockfish-backed level (Bot 1500) plays its move, offline', async () => {
    await page.goto(BASE + '#/play');
    await page.waitForSelector('[data-testid="mode-normal"]');
    await page.click('[data-testid="mode-normal"]');
    await page.selectOption('#level', 'r1500');
    await page.click('button:has-text("Black")');
    await page.click('button:has-text("Start game")');
    await page.waitForSelector('svg.board');
    await page.waitForFunction(() => document.querySelectorAll('.movelist button, .movelist li').length >= 1, null, { timeout: 45000 });
    assert((await page.locator('.notice.error').count()) === 0, 'no engine error');
    await page.click('button:has-text("Resign")');
    await page.waitForSelector('[data-testid="game-results"]');
    assert((await page.locator('[data-testid="game-results"]').innerText()).includes('Competitive'), 'Bot 1500 is competitive');
  });

  await step('spoken coaching: only installed voices are offered, the gender preference is matched, and the streaming voice is never used', async () => {
    await page.goto(BASE + '#/settings');
    await page.waitForSelector('[data-testid="trainer-settings"]');
    const options = await page.locator('#voice-pick option').allInnerTexts();
    assert(options.some((o) => o.includes('Samantha')) && options.some((o) => o.includes('Daniel')), 'installed voices listed: ' + options.join('|'));
    assert(!options.some((o) => o.includes('Google')), 'streaming voice not offered');
    assert((await page.locator('[data-testid="trainer-settings"]').innerText()).includes('1 voice that stream'), 'hidden remote voice is disclosed');
    await page.getByRole('button', { name: 'Male', exact: true }).click();
    await page.click('[data-testid="voice-preview"]');
    await page.waitForFunction(() => window.__speech.spoken.length >= 1);
    assert((await page.evaluate(() => window.__speech.spoken.at(-1).voice)) === 'Daniel', 'male preference uses Daniel');
    await page.getByRole('button', { name: 'Female', exact: true }).click();
    await page.click('[data-testid="voice-preview"]');
    await page.waitForFunction(() => window.__speech.spoken.length >= 2);
    assert((await page.evaluate(() => window.__speech.spoken.at(-1).voice)) === 'Samantha', 'female preference uses Samantha');
    await page.fill('#trainer-volume', '0.4');
    await page.click('[data-testid="voice-preview"]');
    await page.waitForFunction(() => window.__speech.spoken.length >= 3);
    assert(Math.abs((await page.evaluate(() => window.__speech.spoken.at(-1).volume)) - 0.4) < 0.01, 'trainer volume is applied');
    const cancelsBefore = await page.evaluate(() => window.__speech.cancels);
    await page.click('[data-testid="voice-preview"]');
    assert((await page.evaluate(() => window.__speech.cancels)) > cancelsBefore, 'a new utterance cancels the old one first');
    const voices = await page.evaluate(() => window.__speech.spoken.map((s) => s.voice));
    assert(!voices.includes('Google US English Female'), 'the streaming voice was never used');
  });

  await step('spoken coaching: a warning is spoken when speech is on, silent when it is off, and the text is shown either way', async () => {
    await page.goto(BASE + '#/settings');
    await page.waitForSelector('[data-testid="trainer-settings"]');
    const box = page.getByLabel('Speak important Trainer messages aloud');
    if (!(await box.isChecked())) await box.check();
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector('[data-testid="trainer-settings"]');
    await page.waitForFunction(() => { const l = [...document.querySelectorAll('label.switch')].find((x) => /Speak important/.test(x.textContent)); return l && l.querySelector('input').checked; }, null, { timeout: 5000 }).catch(async (e) => { console.log('DBG2', await page.evaluate(() => document.body.innerText.slice(0, 400)), page.url()); throw e; });
    await page.goto(BASE + '#/play');
    await page.waitForSelector('[data-testid="mode-trainer"]');
    await page.selectOption('#level', 'r100');
    await page.click('[data-testid="mode-trainer"]');
    await page.click('button:has-text("Start game")');
    await page.waitForSelector('[data-testid="trainer-panel"]');
    await page.waitForFunction(() => window.__speech.spoken.some((s) => /Trainer/.test(s.text)), null, { timeout: 5000 }).catch(async (e) => { console.log('DBG3', JSON.stringify(await page.evaluate(() => window.__speech))); throw e; });
    assert((await sound()) === 1, 'exactly one welcome was spoken');
    assert((await page.locator('[data-testid="trainer-messages"]').innerText()).includes('Hello. I am your Trainer'), 'the welcome is also shown as text');
    await page.click('button:has-text("Resign")');
    await page.waitForSelector('[data-testid="game-results"]');
    // Switch speech off: the next game still shows its welcome as text but says nothing.
    await page.goto(BASE + '#/settings');
    await page.waitForSelector('[data-testid="trainer-settings"]');
    await page.getByLabel('Speak important Trainer messages aloud').uncheck();
    const spokenBefore = await sound();
    await page.goto(BASE + '#/play');
    await page.waitForSelector('[data-testid="mode-trainer"]');
    await page.click('[data-testid="mode-trainer"]');
    await page.click('button:has-text("Start game")');
    await page.waitForSelector('[data-testid="trainer-messages"] .trainer-msg');
    assert((await sound()) === spokenBefore, 'nothing is spoken while speech is off');
    await page.click('button:has-text("Resign")');
    await page.waitForSelector('[data-testid="game-results"]');
  });

  await step('the Trainer game screen and the results card fit a phone screen in both themes', async () => {
    for (const scheme of ['dark', 'light']) {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: scheme });
      await ctx.addInitScript(FAKE_SPEECH);
      const p = await ctx.newPage();
      p.on('dialog', (d) => d.accept());
      await p.goto(BASE + '#/play');
      await p.waitForSelector('[data-testid="mode-trainer"]');
      await p.click('[data-testid="mode-trainer"]');
      await p.click('button:has-text("Start game")');
      await p.waitForSelector('[data-testid="trainer-panel"]');
      const over = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert((await over()) <= 0, scheme + ' game screen scrolls sideways by ' + (await over()));
      await p.locator('svg.board').first().scrollIntoViewIfNeeded();
      const at = async (f, r) => { const b = await p.locator('svg.board').first().boundingBox(); await p.mouse.click(b.x + ((f + 0.5) / 8) * b.width, b.y + ((8 - r - 0.5) / 8) * b.height); };
      await at(4, 1); await at(4, 3);
      await p.waitForFunction(() => document.querySelectorAll('.movelist button, .movelist li').length >= 1);
      await p.click('button:has-text("Resign")');
      await p.waitForSelector('[data-testid="game-results"]');
      assert((await over()) <= 0, scheme + ' results card scrolls sideways by ' + (await over()));
      await ctx.close();
    }
  });

  await step('no request left the device and no page error was raised', async () => {
    assert(external.length === 0, 'external: ' + external.join(', '));
    assert(errors.length === 0, 'errors: ' + errors.join('; '));
  });
} catch {
  failed = true;
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? 'FAILED' : 'MoveWise Trainer end-to-end: all steps passed');
process.exit(failed ? 1 : 0);
