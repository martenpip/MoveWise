// End-to-end test for sound and achievements, run with the network switched off.
// Run `npm run build` first, then `node tests/e2e/sound-achievements.mjs`.
//
// What it can and cannot prove: the app dispatches a `mw:sound` event each time the sound manager hands a sound to the
// real Web Audio backend (which only happens once the AudioContext is running after a user gesture). So these tests
// prove WHICH sound plays WHEN, in a real browser, offline. They cannot prove how a sound *sounds*; that is covered by
// tests/sound-render.mjs (rendered-spectrum checks) and, honestly, by nobody having listened to them yet.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = Number(process.env.E2E_PORT || 4392);
const BASE = `http://localhost:${PORT}/`;
const BOARD = new Set(['move', 'capture', 'check', 'checkmate', 'castle', 'promotion', 'illegal', 'select']);

const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', cwd: new URL('../..', import.meta.url).pathname });
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
    try { await page.screenshot({ path: `${process.env.E2E_SHOTS || '.'}/e2e-sound-failure.png` }); } catch { /* ignore */ }
    console.log(`  FAIL ${name}\n       ${String(e && e.message ? e.message : e).split('\n').slice(0, process.env.E2E_FULL ? 12 : 2).join('\n       ')}`);
    throw e;
  }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
// Record every sound the app plays, and every AudioContext it creates.
await context.addInitScript(() => {
  window.__snd = [];
  window.__ctxs = [];
  window.addEventListener('mw:sound', (e) => window.__snd.push(e.detail.kind));
  const AC = window.AudioContext;
  window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ctxs.push(this); } };
});
page = await context.newPage();
page.on('dialog', (d) => d.accept());
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
const external = [];
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });

const sounds = () => page.evaluate(() => window.__snd.slice());
const mark = () => page.evaluate(() => window.__snd.length);
const since = (n) => page.evaluate((n) => window.__snd.slice(n), n);
const boardSince = async (n) => (await since(n)).filter((k) => BOARD.has(k));
const settle = (ms = 250) => page.waitForTimeout(ms);

async function squareCentre(sq) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await page.locator('svg.board').boundingBox();
  const file = 'abcdefgh'.indexOf(sq[0]);
  const rank = Number(sq[1]) - 1;
  return { x: box.x + ((file + 0.5) / 8) * box.width, y: box.y + ((7 - rank + 0.5) / 8) * box.height };
}
async function click(sq) { const { x, y } = await squareCentre(sq); await page.mouse.click(x, y); }
const waitMoves = (n) => page.waitForFunction((n) => document.querySelectorAll('.movelist button').length >= n, n, { timeout: 20000 });
const setOpt = async (label, on) => {
  const box = page.locator(`label.switch:has-text("${label}") input`);
  if ((await box.isChecked()) !== on) await box.setChecked(on);
};

try {
  console.log('MoveWise sound + achievements end-to-end (offline)');

  await step('install the offline copy, then cut the network and reload', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.status-chip:has-text("Offline-ready")', { timeout: 15000 });
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.dash-head');
  });

  await step('nothing plays on load, and no audio context is started before a gesture', async () => {
    await settle(700);
    assert((await sounds()).length === 0, `sounds on load: ${await sounds()}`);
    const states = await page.evaluate(() => window.__ctxs.map((c) => c.state));
    assert(!states.includes('running'), `audio running before any gesture: ${states}`);
  });

  await step('the first click starts the audio context (autoplay policy)', async () => {
    await page.mouse.click(5, 5);
    await page.waitForFunction(() => window.__ctxs.length > 0 && window.__ctxs.some((c) => c.state === 'running'), null, { timeout: 5000 });
  });

  await step('human move and bot reply each play exactly one board sound', async () => {
    await page.goto(BASE + '#/play');
    await page.click('text=Start game');
    await page.waitForSelector('svg.board');
    const n = await mark();
    await click('e2');
    await click('e4');
    await waitMoves(2);
    await settle(400);
    assert(JSON.stringify(await boardSince(n)) === JSON.stringify(['move', 'move']), `board sounds: ${await boardSince(n)}`);
  });

  await step('an illegal attempt gives the quiet illegal sound once; selecting is silent by default', async () => {
    const n = await mark();
    await click('d2'); // select: tick is off by default
    await settle(150);
    assert((await boardSince(n)).length === 0, `select should be silent, got ${await boardSince(n)}`);
    await click('d6');
    await settle(250);
    assert(JSON.stringify(await boardSince(n)) === JSON.stringify(['illegal']), `got ${await boardSince(n)}`);
  });

  await step('finishing a game: result sound, one unlock toast, one achievement sound', async () => {
    const n = await mark();
    await page.click('button:has-text("Resign")');
    await page.waitForSelector('text=Saved to your game history', { timeout: 10000 });
    await page.waitForSelector('.toast.achievement', { timeout: 10000 });
    await page.waitForFunction((n) => window.__snd.slice(n).some((k) => k.startsWith('achievement')), n, { timeout: 8000 });
    await settle(500);
    const got = await since(n);
    assert(got.includes('resultLoss'), `no result sound: ${got}`);
    assert(got.filter((k) => k.startsWith('achievement')).length === 1, `achievement sound count: ${got}`);
    const text = await page.locator('.toast.achievement').first().innerText();
    assert(/First Steps/.test(text) && /View details/.test(text), `toast text: ${text}`);
    assert((await page.locator('.toast.achievement .confetti').count()) === 0, 'confetti is only for rare unlocks');
  });

  await step('"View details" opens the achievement; Escape closes it', async () => {
    await page.locator('.toast.achievement a:has-text("View details")').first().click();
    await page.waitForSelector('[role="dialog"]:has-text("First Steps")');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="dialog"]', { state: 'detached' });
  });

  await step('replay: opening is silent, one step forward is one sound, stepping back is silent, jumps are silent', async () => {
    await page.goto(BASE + '#/games');
    await page.waitForSelector('.list li');
    const open = await mark();
    await page.click('.list li a >> nth=0');
    await page.waitForSelector('svg.board');
    await settle(400);
    assert((await boardSince(open)).length === 0, `opening a game made noise: ${await boardSince(open)}`);
    await page.locator('.movelist button').first().click(); // jump to ply 1
    await settle(250);
    assert((await boardSince(open)).length === 0, 'jump should be silent');
    const n = await mark();
    await page.keyboard.press('ArrowRight');
    await settle(300);
    assert((await boardSince(n)).length === 1, `one step forward should be one sound, got ${await boardSince(n)}`);
    const m = await mark();
    await page.keyboard.press('ArrowLeft');
    await settle(300);
    assert((await boardSince(m)).length === 0, 'stepping back is silent while the undo sound is off');
  });

  await step('profile: unlocked and locked achievements, progress, inactive features', async () => {
    await page.goto(BASE + '#/profile');
    await page.waitForSelector('.ach-card');
    const first = page.locator('.ach-card[data-achievement="first-game"]');
    assert(/earned/.test((await first.getAttribute('class')) ?? ''), 'first-game should be unlocked');
    const ten = page.locator('.ach-card[data-achievement="ten-games"]');
    assert(/locked/.test((await ten.getAttribute('class')) ?? ''), 'ten-games should be locked');
    assert(/1\s*\/\s*10/.test(await ten.innerText()), `progress text: ${await ten.innerText()}`);
    assert((await ten.locator('[role="progressbar"]').getAttribute('aria-valuenow')) !== null, 'progress bar has no value');
    assert(!/not available yet/i.test(await page.locator('.ach-card[data-achievement="first-lesson"]').innerText()), 'lesson achievement is available now that the Academy exists');
    await page.getByRole('group', { name: 'Show achievements' }).getByRole('button', { name: 'Unlocked' }).click();
    assert((await page.locator('.ach-card.locked').count()) === 0, 'Unlocked filter still shows locked cards');
    await page.getByRole('group', { name: 'Show achievements' }).getByRole('button', { name: 'All', exact: true }).click();
  });

  await step('every special move has its own sound, driven by the real position', async () => {
    await page.goto(BASE + '#/analysis');
    await page.waitForSelector('svg.board');
    const cases = [
      ['capture', '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'e4', 'd5'],
      ['castle', '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1', 'g1'],
      ['check', '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1', 'a8'],
      ['checkmate', '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', 'a1', 'a8'],
      ['promotion', '8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a7', 'a8'],
    ];
    for (const [kind, fen, from, to] of cases) {
      await page.fill('input[aria-label="FEN"]', fen);
      await page.click('text=Load FEN');
      await settle(200);
      const n = await mark();
      await click(from);
      await click(to);
      if (kind === 'promotion') await page.click('button[aria-label="Promote to Queen"]');
      await waitMoves(1);
      await settle(350);
      const got = await boardSince(n);
      assert(JSON.stringify(got) === JSON.stringify([kind]), `${kind}: expected exactly [${kind}], got [${got}]`);
    }
  });

  await step('settings: master mute silences everything, and it persists across a reload', async () => {
    await page.goto(BASE + '#/settings');
    await page.waitForSelector('#h-sound');
    await page.locator('label.switch:has-text("Sound") input').first().uncheck();
    await settle(500);
    await page.reload();
    await page.waitForSelector('#h-sound');
    assert(!(await page.locator('label.switch:has-text("Sound") input').first().isChecked()), 'master switch not remembered');
    const n = await mark();
    await page.goto(BASE + '#/analysis');
    await page.waitForSelector('svg.board');
    await click('e2'); await click('e4');
    await waitMoves(1);
    await page.mouse.click(5, 5);
    await settle(400);
    assert((await since(n)).length === 0, `muted but heard: ${await since(n)}`);
    await page.goto(BASE + '#/settings');
    await page.locator('label.switch:has-text("Sound") input').first().check();
  });

  await step('settings: board sounds off keeps UI sounds; preview ignores category switches; changes apply at once', async () => {
    await page.waitForSelector('#h-sound');
    await setOpt('Board sounds', false);
    await settle(200);
    const n = await mark();
    await page.goto(BASE + '#/analysis');
    await page.waitForSelector('svg.board');
    await click('d2'); await click('d4');
    await waitMoves(1);
    await settle(300);
    assert((await boardSince(n)).length === 0, `board sounds off but heard ${await boardSince(n)}`);
    assert((await since(n)).includes('nav'), 'the interface sounds should still play');
    await page.goto(BASE + '#/settings');
    const p = await mark();
    await page.getByRole('button', { name: 'Capture', exact: true }).click();
    await settle(200);
    assert(JSON.stringify(await since(p)) === JSON.stringify(['capture']), `preview: ${await since(p)}`);
    await setOpt('Board sounds', true);
  });

  await step('settings: volume persists and "Reset sound preferences" restores the defaults', async () => {
    const slider = page.locator('.slider-row:has-text("Volume") input').first();
    await slider.fill('30');
    await settle(500);
    await page.reload();
    await page.waitForSelector('#h-sound');
    assert((await page.locator('.slider-row:has-text("Volume") input').first().inputValue()) === '30', 'volume not remembered');
    await page.getByRole('button', { name: 'Reset sound preferences' }).click();
    await settle(300);
    assert((await page.locator('.slider-row:has-text("Volume") input').first().inputValue()) === '70', 'reset did not restore the default volume');
  });

  await step('import 8 games silently, switch achievement sounds off, unlock the 10th-game badge: toast yes, sound no', async () => {
    const games = Array.from({ length: 8 }, (_, i) => ({
      id: `seed${i}`, createdAt: Date.now() - (20 - i) * 3_600_000, white: 'You', black: 'Bot', human: 'white', botLevel: 'casual', botPersonality: 'balanced',
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', uciMoves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'], result: '1-0', reason: 'checkmate', source: 'played', takebacks: 0,
    }));
    const dir = mkdtempSync(join(tmpdir(), 'mw-e2e-'));
    const file = join(dir, 'seed.json');
    writeFileSync(file, JSON.stringify({ app: 'MoveWise', version: 3, games }));
    await page.goto(BASE + '#/settings');
    const before = await mark();
    await page.locator('input[type="file"]').setInputFiles(file);
    await page.waitForSelector('text=/Imported/i', { timeout: 8000 });
    await settle(500);
    assert(!(await since(before)).some((k) => k.startsWith('achievement')), 'importing must not announce achievements');
    await setOpt('Achievement sounds', false);
    await settle(300);
    // Game 10 (the 9th is already saved: 8 imported + 1 resigned earlier). Resign again.
    await page.goto(BASE + '#/play');
    await page.click('text=Start game');
    await page.waitForSelector('svg.board');
    await click('e2'); await click('e4');
    await waitMoves(2);
    const n = await mark();
    await page.click('button:has-text("Resign")');
    await page.waitForSelector('text=Saved to your game history', { timeout: 10000 });
    await page.waitForSelector('.toast.achievement:has-text("Getting Serious")', { timeout: 10000 });
    await settle(600);
    assert(!(await since(n)).some((k) => k.startsWith('achievement')), `achievement sound played although switched off: ${await since(n)}`);
    await setOptAfter();
  });
  async function setOptAfter() {
    await page.goto(BASE + '#/settings');
    await setOpt('Achievement sounds', true);
  }

  await step('backup carries achievements; delete-all then import restores them', async () => {
    await page.goto(BASE + '#/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Export backup')]);
    const path = await download.path();
    const json = JSON.parse(readFileSync(path, 'utf8'));
    assert(json.version === 3, `backup version ${json.version}`);
    const ids = (json.achievements?.unlocked ?? []).map((r) => r.id);
    assert(ids.includes('first-game') && ids.includes('ten-games'), `achievements in backup: ${ids}`);
    await page.click('text=Delete all data');
    await settle(600);
    await page.goto(BASE + '#/profile');
    await page.waitForSelector('.ach-card');
    assert(/locked/.test((await page.locator('.ach-card[data-achievement="first-game"]').getAttribute('class')) ?? ''), 'delete-all should clear achievements');
    await page.goto(BASE + '#/settings');
    await page.locator('input[type="file"]').setInputFiles(path);
    await page.waitForSelector('text=/Imported/i', { timeout: 8000 });
    await page.goto(BASE + '#/profile');
    await page.waitForSelector('.ach-card.earned[data-achievement="ten-games"]');
  });

  await step('reduced motion switches off the unlock animation and confetti', async () => {
    const probe = () => page.evaluate(() => {
      document.querySelector('#probe')?.remove();
      const d = document.createElement('div');
      d.id = 'probe';
      d.className = 'toast achievement';
      d.innerHTML = '<span class="confetti"><i style="--i:1"></i></span>';
      document.querySelector('.toasts, body').appendChild(d);
      const toast = getComputedStyle(d).animationName;
      const confetti = getComputedStyle(d.querySelector('.confetti')).display;
      d.remove();
      return { toast, confetti };
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const r = await probe();
    assert(r.toast === 'none' && r.confetti === 'none', `reduced motion: ${JSON.stringify(r)}`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const n = await probe();
    assert(n.toast !== 'none' && n.confetti !== 'none', `normal motion: ${JSON.stringify(n)}`);
  });

  await step('no external network requests were made', async () => {
    assert(external.length === 0, `external requests: ${external.join(', ')}`);
  });
  await step('no uncaught page errors', async () => {
    assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  });
} catch {
  /* reported below */
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
process.exit(failed.length ? 1 : 0);
