// Speech against the browser's REAL speechSynthesis (no fake). The sandbox browser has the API but no installed voices, so this
// proves the honest-fallback behaviour on a real implementation: the app does not claim a voice, offers no speaking controls that
// would do nothing, keeps the written coaching, does not throw, and sends nothing out. It cannot prove how real voices sound:
// that needs a device with voices installed (see docs/trainer.md). Also covers a browser with no speech API at all.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT || 4391);
const BASE = `http://localhost:${PORT}/`;
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore', cwd: ROOT });
await new Promise((r) => setTimeout(r, 800));
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch();
let failed = false;
const step = async (n, f) => { try { await f(); console.log('  ok   ' + n); } catch (e) { failed = true; console.log('  FAIL ' + n + '\n       ' + (e && e.message)); } };
try {
  console.log('MoveWise speech against the real browser API');
  for (const mode of ['real-api-no-voices', 'no-api']) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    if (mode === 'no-api') await ctx.addInitScript(() => { delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; });
    const page = await ctx.newPage();
    const errors = [], external = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });
    await step(`[${mode}] the browser reports what it really has`, async () => {
      await page.goto(BASE + '#/settings');
      await page.waitForSelector('[data-testid="trainer-settings"]');
      await page.waitForTimeout(3000); // voice discovery retries for a couple of seconds before concluding there are none
      const info = await page.evaluate(() => ({ api: 'speechSynthesis' in window, voices: 'speechSynthesis' in window ? speechSynthesis.getVoices().length : 0 }));
      assert(mode === 'no-api' ? !info.api : info.api && info.voices === 0, JSON.stringify(info));
    });
    await step(`[${mode}] the settings say plainly that speech is unavailable and offer nothing that cannot work`, async () => {
      const t = await page.locator('[data-testid="trainer-settings"]').innerText();
      assert(mode === 'no-api' ? /does not support speech/.test(t) : /No voices are installed/.test(t), 'message: ' + t.slice(0, 300));
      // With the API but no voice the preference may still be saved (it applies if a voice appears); with no API at all it cannot.
      if (mode === 'no-api') assert(await page.getByLabel('Speak important Trainer messages aloud').isDisabled(), 'the speak switch should be disabled without the API');
      const preview = page.locator('[data-testid="voice-preview"]');
      assert((await preview.count()) === 0 || (await preview.isDisabled()), 'preview must not be usable without a voice');
      assert(!/installed on this device:?\s*\d/.test(t) && (await page.locator('#voice-pick option').count()) === 0, 'no voice may be listed');
    });
    await step(`[${mode}] a Trainer game still coaches in writing, and nothing is spoken or sent out`, async () => {
      await page.goto(BASE + '#/play');
      await page.click('[data-testid="mode-trainer"]');
      await page.click('button:has-text("Start game")');
      await page.waitForSelector('[data-testid="trainer-messages"] .trainer-msg');
      assert((await page.locator('[data-testid="trainer-messages"]').innerText()).includes('Hello. I am your Trainer'), 'the written welcome is missing');
      assert(!(await page.evaluate(() => 'speechSynthesis' in window && speechSynthesis.speaking)), 'something is being spoken');
      assert(errors.length === 0, 'page errors: ' + errors.join('; '));
      assert(external.length === 0, 'external requests: ' + external.join(', '));
    });
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? 'FAILED' : 'MoveWise real-API speech checks: all steps passed');
process.exit(failed ? 1 : 0);
