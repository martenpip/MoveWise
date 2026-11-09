import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_SOUNDS, DEFAULT_SOUND_PREFS, SOUND_META, gainFor, sanitizeSoundPrefs, type SoundKind, type SoundPrefs } from '../src/audio/kinds';
import { SoundManager, type SoundBackend } from '../src/audio/manager';
import { replaySound, soundForMove } from '../src/audio/moveSound';
import { Game } from '../src/chess/game';
import { MemoryStore } from '../src/storage/store';
import { DEFAULT_SETTINGS } from '../src/storage/types';
import { validateSettings } from '../src/storage/backup';

/** A fake audio backend with a controllable clock, recording what would have been played. */
function fake(ready = true) {
  const b = {
    isReady: ready,
    t: 10,
    played: [] as Array<{ kind: SoundKind; gain: number; at: number }>,
    lengths: {} as Partial<Record<SoundKind, number>>,
    ready() { return this.isReady; },
    now() { return this.t; },
    play(kind: SoundKind, gain: number, at: number) {
      this.played.push({ kind, gain, at });
      return this.lengths[kind] ?? 0.2;
    },
  };
  return b satisfies SoundBackend & Record<string, unknown>;
}
const prefs = (patch: Partial<SoundPrefs> = {}): SoundPrefs => ({ ...DEFAULT_SOUND_PREFS, ...patch });
const kinds = (b: ReturnType<typeof fake>) => b.played.map((p) => p.kind);

/* ------------------------- move classification ------------------------- */

const play = (sans: string[], from?: string) => {
  const g = new Game(from);
  return sans.map((s) => g.playSan(s));
};

test('move info comes from the rules engine: normal moves and captures', () => {
  const [e4, d5, exd5] = play(['e4', 'd5', 'exd5']);
  assert.equal(soundForMove(e4!.info), 'move');
  assert.equal(soundForMove(d5!.info), 'move');
  assert.equal(soundForMove(exd5!.info), 'capture');
});

test('en passant counts as a capture', () => {
  const m = play(['e4', 'a6', 'e5', 'd5', 'exd6']);
  assert.equal(m[4]!.info.capture, true);
  assert.equal(soundForMove(m[4]!.info), 'capture');
});

test('check, checkmate, castling and promotion each get their own sound', () => {
  const check = play(['e4', 'e5', 'Qh5', 'Nc6', 'Qxf7'])[4]!; // Qxf7+ is a capture AND check -> check wins
  assert.equal(check.info.check, true);
  assert.equal(soundForMove(check.info), 'check');

  const mate = play(['f3', 'e5', 'g4', 'Qh4'])[3]!; // fool's mate
  assert.equal(mate.info.checkmate, true);
  assert.equal(mate.info.check, false, 'mate is reported as mate, not as plain check');
  assert.equal(soundForMove(mate.info), 'checkmate');

  const castle = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O'])[6]!;
  assert.equal(castle.info.castle, true);
  assert.equal(soundForMove(castle.info), 'castle');

  const promo = play(['a8=Q+'], '7k/P7/8/8/8/8/8/K7 w - - 0 1')[0]!;
  assert.equal(promo.info.promotion > 0, true);
  assert.equal(soundForMove(promo.info), 'check', 'a promotion that gives check sounds as check');
  const quiet = play(['a8=Q'], '8/P6k/8/8/8/8/8/K7 w - - 0 1')[0]!;
  assert.equal(soundForMove(quiet.info), 'promotion');
});

test('promotion by capture is still one promotion sound', () => {
  const m = play(['axb8=Q'], '1n6/P7/7k/8/8/8/8/K7 w - - 0 1')[0]!;
  assert.equal(m.info.capture, true);
  assert.equal(soundForMove(m.info), 'promotion');
});

test('redo and replay entries keep their info', () => {
  const g = new Game();
  g.playSan('e4');
  g.playSan('d5');
  g.playSan('exd5');
  g.undo();
  assert.equal(g.redo()!.info.capture, true);
});

/* ---------------------------- replay sounds ---------------------------- */

test('replay: one step forward sounds, jumps and loading are silent', () => {
  const g = new Game();
  for (const s of ['e4', 'd5', 'exd5', 'Qxd5']) g.playSan(s);
  const p = { replay: true, undo: false };
  assert.equal(replaySound(g.moves, 0, 1, p), 'move');
  assert.equal(replaySound(g.moves, 2, 3, p), 'capture');
  assert.equal(replaySound(g.moves, 0, 4, p), null, 'jump to end is silent');
  assert.equal(replaySound(g.moves, 4, 0, p), null, 'jump to start is silent');
  assert.equal(replaySound(g.moves, 2, 2, p), null, 'no movement, no sound');
});

test('replay: stepping back is silent unless enabled; replay sounds can be turned off', () => {
  const g = new Game();
  g.playSan('e4');
  g.playSan('e5');
  assert.equal(replaySound(g.moves, 2, 1, { replay: true, undo: false }), null);
  assert.equal(replaySound(g.moves, 2, 1, { replay: true, undo: true }), 'move');
  assert.equal(replaySound(g.moves, 0, 1, { replay: false, undo: true }), null);
});

/* ------------------------------- manager ------------------------------- */

test('manager plays the sound for a kind at the configured gain', () => {
  const b = fake();
  const m = new SoundManager(b);
  m.configure(prefs({ volume: 0.5, boardVolume: 0.8 }));
  assert.equal(m.play('capture'), true);
  assert.deepEqual(kinds(b), ['capture']);
  assert.ok(Math.abs(b.played[0]!.gain - 0.4) < 1e-9);
});

test('master off silences everything, including achievements', () => {
  const b = fake();
  const m = new SoundManager(b);
  m.configure(prefs({ master: false }));
  for (const k of ALL_SOUNDS) {
    b.t += 1;
    assert.equal(m.play(k), false, k);
  }
  assert.equal(b.played.length, 0);
});

test('each category can be switched off on its own', () => {
  const cases: Array<[Partial<SoundPrefs>, SoundKind, SoundKind[]]> = [
    [{ board: false }, 'move', ['click', 'achievement']],
    [{ ui: false }, 'click', ['move', 'achievement']],
    [{ achievements: false }, 'achievement', ['move', 'click']],
  ];
  for (const [patch, off, on] of cases) {
    const b = fake();
    const m = new SoundManager(b);
    m.configure(prefs(patch));
    assert.equal(m.play(off), false, `${off} should be silent with ${JSON.stringify(patch)}`);
    for (const k of on) {
      b.t += 1;
      assert.equal(m.play(k), true, `${k} should still play`);
    }
  }
});

test('volume controls scale the gain; zero is silent', () => {
  assert.equal(gainFor('move', prefs({ volume: 0 })), 0);
  assert.equal(gainFor('click', prefs({ uiVolume: 0 })), 0);
  assert.ok(gainFor('move', prefs({ volume: 1, boardVolume: 1 })) > gainFor('move', prefs({ volume: 0.5, boardVolume: 1 })));
  assert.ok(gainFor('click', prefs({ volume: 1, uiVolume: 0.3 })) < gainFor('click', prefs({ volume: 1, uiVolume: 1 })));
  assert.equal(gainFor('achievement', prefs({ volume: 0.5 })), 0.5);
  const b = fake();
  const m = new SoundManager(b);
  m.configure(prefs({ volume: 0 }));
  assert.equal(m.play('move'), false);
});

test('changing preferences applies to the very next sound', () => {
  const b = fake();
  const m = new SoundManager(b);
  m.configure(prefs({ board: false }));
  assert.equal(m.play('move'), false);
  m.configure(prefs({ board: true }));
  b.t += 1;
  assert.equal(m.play('move'), true);
});

test('nothing plays before the browser allows audio', () => {
  const b = fake(false);
  const m = new SoundManager(b);
  assert.equal(m.play('move'), false);
  assert.equal(b.played.length, 0);
  b.isReady = true;
  assert.equal(m.play('move'), true);
});

test('the piece-select tick is optional and off by default', () => {
  const b = fake();
  const m = new SoundManager(b);
  m.configure(prefs());
  assert.equal(m.play('select'), false);
  m.configure(prefs({ selectSound: true }));
  assert.equal(m.play('select'), true);
});

test('one action never piles up sounds: identical or weaker sounds inside the window are dropped', () => {
  const b = fake();
  const m = new SoundManager(b);
  m.configure(prefs());
  m.play('move');
  b.t += 0.02;
  assert.equal(m.play('move'), false, 'a re-render cannot double a sound');
  assert.equal(m.play('click'), false, 'a UI click cannot layer on a board sound');
  assert.equal(m.play('modalClose'), false);
  b.t += 0.02;
  assert.equal(m.play('checkmate'), true, 'a more important sound still plays');
  b.t += 0.5;
  assert.equal(m.play('move'), true, 'later sounds are unaffected');
  assert.deepEqual(kinds(b), ['move', 'checkmate', 'move']);
});

test('a quick select then move both sound; a move is never swallowed by a select', () => {
  const b = fake();
  const m = new SoundManager(b);
  m.configure(prefs({ selectSound: true }));
  m.play('select');
  b.t += 0.03;
  assert.equal(m.play('move'), true);
});

test('achievements wait for a ringing board sound instead of overlapping it', () => {
  const b = fake();
  b.lengths.checkmate = 1.6;
  const m = new SoundManager(b);
  m.configure(prefs());
  m.play('checkmate');
  b.t += 0.3;
  assert.equal(m.play('achievement'), true);
  const [mate, ach] = b.played;
  assert.ok(ach!.at >= mate!.at + 1.6, `achievement should start after the mate sound (${ach!.at} vs ${mate!.at + 1.6})`);
  // but never an unbounded wait
  const b2 = fake();
  b2.lengths.checkmate = 30;
  const m2 = new SoundManager(b2);
  m2.configure(prefs());
  m2.play('checkmate');
  m2.play('achievementRare');
  assert.ok(b2.played[1]!.at - b2.t <= 2.5 + 1e-9);
});

test('preview ignores category switches and the cooldown but not the master switch', () => {
  const b = fake();
  const m = new SoundManager(b);
  m.configure(prefs({ board: false }));
  assert.equal(m.preview('capture'), true);
  assert.equal(m.preview('capture'), true);
  m.configure(prefs({ master: false }));
  assert.equal(m.preview('capture'), false);
});

test('listeners hear exactly the sounds that were played', () => {
  const b = fake();
  const m = new SoundManager(b);
  const heard: string[] = [];
  m.onPlay((k) => heard.push(k));
  m.configure(prefs({ ui: false }));
  m.play('click');
  m.play('move');
  assert.deepEqual(heard, ['move']);
});

test('every sound kind has metadata and a sensible category', () => {
  for (const k of ALL_SOUNDS) assert.ok(SOUND_META[k], k);
  assert.equal(SOUND_META.checkmate.priority > SOUND_META.capture.priority, true);
  assert.equal(SOUND_META.capture.priority >= SOUND_META.move.priority, true);
  assert.equal(SOUND_META.click.category, 'ui');
  assert.equal(SOUND_META.achievementRare.category, 'achievements');
});

/* ------------------------- persistence / migration ---------------------- */

test('sound preferences are validated: junk and out-of-range values fall back safely', () => {
  assert.deepEqual(sanitizeSoundPrefs(undefined), DEFAULT_SOUND_PREFS);
  assert.deepEqual(sanitizeSoundPrefs(true), DEFAULT_SOUND_PREFS, 'the old single boolean is replaced by the new defaults');
  const s = sanitizeSoundPrefs({ master: 'yes', volume: 7, boardVolume: -1, uiVolume: NaN, board: false });
  assert.equal(s.master, true);
  assert.equal(s.volume, 1);
  assert.equal(s.boardVolume, 0);
  assert.equal(s.uiVolume, DEFAULT_SOUND_PREFS.uiVolume);
  assert.equal(s.board, false);
});

test('defaults are on at a moderate volume', () => {
  assert.equal(DEFAULT_SOUND_PREFS.master, true);
  assert.ok(DEFAULT_SOUND_PREFS.volume > 0.3 && DEFAULT_SOUND_PREFS.volume < 0.9);
  assert.ok(DEFAULT_SOUND_PREFS.uiVolume < DEFAULT_SOUND_PREFS.boardVolume, 'interface sounds are quieter than board sounds');
});

test('old settings (sound: boolean) load with the new defaults', () => {
  const s = validateSettings({ ...DEFAULT_SETTINGS, sound: false });
  assert.deepEqual(s.sound, DEFAULT_SOUND_PREFS);
});

test('sound preferences survive export, import and reload', async () => {
  const a = new MemoryStore();
  const custom = prefs({ master: true, board: false, volume: 0.35, uiVolume: 0.2, undo: true, selectSound: true });
  await a.putSettings({ ...DEFAULT_SETTINGS, sound: custom });
  const backup = JSON.parse(JSON.stringify(await a.exportAll()));
  const b = new MemoryStore();
  await b.importAll(backup);
  assert.deepEqual((await b.getSettings()).sound, custom);
});
