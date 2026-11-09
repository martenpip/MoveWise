import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setHapticsEnabled, tapHaptic } from '../src/ui/haptics';
import { validateSettings } from '../src/storage/backup';
import { DEFAULT_SETTINGS } from '../src/storage/types';

const g = globalThis as unknown as Record<string, unknown>;
function withDevice<T>(env: { vibrate?: (p: number) => boolean; coarse: boolean }, fn: () => T): T {
  const saved = { navigator: g.navigator, matchMedia: g.matchMedia };
  Object.defineProperty(g, 'navigator', { value: { vibrate: env.vibrate }, configurable: true });
  g.matchMedia = () => ({ matches: env.coarse });
  try { return fn(); } finally {
    Object.defineProperty(g, 'navigator', { value: saved.navigator, configurable: true });
    g.matchMedia = saved.matchMedia;
  }
}

test('haptics: a touch device with the Vibration API gets a short tap, longer for a capture', () => {
  const calls: number[] = [];
  withDevice({ vibrate: (p) => (calls.push(p), true), coarse: true }, () => { setHapticsEnabled(true); tapHaptic(); tapHaptic(true); });
  assert.deepEqual(calls, [10, 22]);
});

test('haptics: nothing happens when the setting is off, or on a device with a mouse', () => {
  const calls: number[] = [];
  withDevice({ vibrate: (p) => (calls.push(p), true), coarse: true }, () => { setHapticsEnabled(false); tapHaptic(); });
  withDevice({ vibrate: (p) => (calls.push(p), true), coarse: false }, () => { setHapticsEnabled(true); tapHaptic(); });
  assert.deepEqual(calls, []);
  setHapticsEnabled(true);
});

test('haptics: a browser that throws or has no API never breaks a move', () => {
  withDevice({ vibrate: () => { throw new Error('blocked'); }, coarse: true }, () => { setHapticsEnabled(true); assert.doesNotThrow(() => tapHaptic()); });
});

test('haptics setting: on by default, kept when saved, and junk falls back to the default', () => {
  assert.equal(DEFAULT_SETTINGS.haptics, true);
  assert.equal(validateSettings({}).haptics, true);
  assert.equal(validateSettings({ haptics: false }).haptics, false);
  assert.equal(validateSettings({ haptics: 'yes' }).haptics, true);
});
