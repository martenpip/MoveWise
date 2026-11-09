import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START_FEN, WHITE, BLACK } from '../src/chess/types';
import { MIN_DEPTH, checkMove, shouldWarn, type TrainerEval, type TrainerEvaluation } from '../src/trainer/check';
import { botMoveText, newlyLoose, resultText, threatText, warningText, yourMoveText } from '../src/trainer/coach';
import { loosePieces } from '../src/trainer/facts';
import { MAX_SPOKEN_CHARS, SpeechManager, chooseVoice, classifyVoice, type SpeakOptions, type SpeechBackend, type VoiceInfo } from '../src/trainer/speech';
import { DEFAULT_TRAINER_PREFS } from '../src/trainer/types';
import { validateSettings, validateTrainer } from '../src/storage/backup';

/* ------------------------------ engine stub ------------------------------ */

const ev = (cp: number, uci: string, extra: Partial<TrainerEvaluation> = {}): TrainerEvaluation => ({ cp, mate: null, uci, pv: [uci], depth: 14, ...extra });

/** An evaluator answering from a table keyed by the moves played from the fen. */
const table = (answers: Record<string, TrainerEvaluation | null>): TrainerEval => async (_fen, moves) => {
  const k = moves.join(' ');
  if (!(k in answers)) throw new Error(`unexpected evaluation: "${k}"`);
  return answers[k]!;
};

// White queen on d1 can take the undefended black queen on d5; black queen defended by nothing.
const FREE_QUEEN = '4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1';

/* ------------------------------ move checks ------------------------------ */

test('check: a blunder is identified from the engine evaluations and carries the facts that explain it', async () => {
  const c = await checkMove(FREE_QUEEN, 'e1e2', table({
    '': ev(700, 'd1d5'),
    'e1e2': ev(-50, 'd5d1', { pv: ['d5d1', 'e2d1'] }),
  }));
  assert.equal(c.status, 'checked');
  if (c.status !== 'checked') return;
  assert.equal(c.verdict, 'blunder');
  assert.equal(c.best.san, 'Qxd5');
  assert.equal(c.playedSan, 'Ke2');
  assert.ok(c.loss > 15);
  assert.equal(shouldWarn(c), true);
});

test('check: the engine move is never warned about, and costs one evaluation', async () => {
  let calls = 0;
  const c = await checkMove(FREE_QUEEN, 'd1d5', async () => { calls++; return ev(700, 'd1d5'); });
  assert.equal(calls, 1);
  assert.ok(c.status === 'checked' && c.verdict === 'best' && c.loss === 0);
  assert.equal(shouldWarn(c), false);
});

test('check: a small slip is not warned about', async () => {
  const c = await checkMove(FREE_QUEEN, 'd1d2', table({ '': ev(100, 'd1d5'), 'd1d2': ev(70, 'd5d2') }));
  assert.ok(c.status === 'checked');
  assert.equal(shouldWarn(c), false);
});

test('check: no warning once the position is already lost', async () => {
  const c = await checkMove(FREE_QUEEN, 'e1e2', table({ '': ev(-1500, 'd1d5'), 'e1e2': ev(-2500, 'd5d1') }));
  assert.ok(c.status === 'checked');
  assert.equal(shouldWarn(c), false);
});

test('check: unavailable or too-shallow engine answers are reported honestly, never guessed', async () => {
  assert.deepEqual(await checkMove(FREE_QUEEN, 'e1e2', async () => null), { status: 'unavailable' });
  assert.deepEqual(await checkMove(FREE_QUEEN, 'e1e2', async () => { throw new Error('boom'); }), { status: 'unavailable' });
  const shallow = await checkMove(FREE_QUEEN, 'e1e2', table({ '': ev(700, 'd1d5', { depth: MIN_DEPTH - 1 }), 'e1e2': ev(-50, 'd5d1') }));
  assert.equal(shallow.status, 'inconclusive');
  assert.equal(shouldWarn(shallow), false);
  assert.equal(warningText(shallow), null);
  assert.equal(yourMoveText(shallow), null);
});

test('check: a move that allows mate is explained as such', async () => {
  const c = await checkMove(FREE_QUEEN, 'e1e2', table({ '': ev(700, 'd1d5'), 'e1e2': ev(-30000, 'd5d1', { mate: -2, pv: ['d5d1'] }) }));
  assert.ok(c.status === 'checked' && c.mateAgainst === 2);
  assert.match(warningText(c)!, /forced checkmate against you in 2 moves/);
});

test('check: for Black the sign of the evaluation is read from Black\'s side', async () => {
  const fen = '3qk3/8/8/8/3Q4/8/8/4K3 b - - 0 1';
  const good = await checkMove(fen, 'd8d4', table({ '': ev(-700, 'd8d4') }));
  assert.ok(good.status === 'checked' && good.loss === 0);
  const bad = await checkMove(fen, 'e8e7', table({ '': ev(-700, 'd8d4'), 'e8e7': ev(50, 'd4d8') }));
  assert.ok(bad.status === 'checked' && bad.verdict === 'blunder' && shouldWarn(bad));
});

/* ------------------------------ what the Trainer says ------------------------------ */

test('coach: the warning names the move, the engine\'s choice and a consequence that the engine line supports', async () => {
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  // Qh5 is fine here; use a plain hang instead: Bishop to b5 is fine. Use the free-queen fixture with a losing reply line.
  const c = await checkMove(FREE_QUEEN, 'd1d4', table({
    '': ev(700, 'd1d5'),
    'd1d4': ev(-600, 'd5d4', { pv: ['d5d4'] }),
  }));
  assert.ok(c.status === 'checked');
  const text = warningText(c, 'beginner')!;
  assert.match(text, /Qd4/);
  assert.match(text, /Qxd5/);
  assert.match(text, /look again|play it anyway/i);
  assert.doesNotMatch(warningText(c, 'concise')!, /look again/i);
  assert.ok(fen.length > 0);
});

test('coach: praise is only given for the engine\'s move, and a good-enough move gets no comment', async () => {
  const best = await checkMove(FREE_QUEEN, 'd1d5', async () => ev(700, 'd1d5'));
  assert.match(yourMoveText(best)!, /Qxd5/);
  const same = await checkMove(FREE_QUEEN, 'd1d2', table({ '': ev(700, 'd1d5'), 'd1d2': ev(695, 'd5d2') }));
  assert.match(yourMoveText(same)!, /as good as the engine's first choice/);
  const fine = await checkMove(FREE_QUEEN, 'd1d2', table({ '': ev(700, 'd1d5'), 'd1d2': ev(600, 'd5d2') }));
  assert.ok(fine.status === 'checked' && fine.verdict === 'good');
  assert.equal(yourMoveText(fine), null);
});

test('coach: the bot explains its move from what the move does on the board', () => {
  const capture = botMoveText('4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1', 'd1d5', 30);
  assert.match(capture, /Qxd5/);
  assert.match(capture, /takes your queen/);
  const castle = botMoveText('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1', 30);
  assert.match(castle, /king/);
  const mate = botMoveText('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d8', 30);
  assert.match(mate, /checkmate/i);
  const develop = botMoveText(START_FEN, 'g1f3', 1);
  assert.match(develop, /knight/);
  assert.doesNotMatch(develop, /winning|trap|plan to/i, 'no invented threats or plans');
});

test('coach: threats are stated only when a piece is really attacked and loose', () => {
  assert.equal(threatText(START_FEN, WHITE), null);
  const loose = '4k3/8/8/3q4/8/8/8/3QK3 b - - 0 1';
  assert.deepEqual(loosePieces(loose, BLACK).map((l) => l.why), ['undefended']);
  assert.match(threatText(loose, BLACK)!, /queen on d5 can be captured and nothing defends it/);
  assert.equal(threatText('4k3/8/8/3q4/8/8/3P4/3QK3 w - - 0 1', WHITE), null);
});

test('coach: moving a piece onto an attacked square is reported as newly loose', () => {
  const fen = '4k3/8/8/4p3/8/8/8/3QK3 w - - 0 1';
  assert.deepEqual(newlyLoose(fen, 'd1d4', WHITE), ['queen on d4']);
  assert.deepEqual(newlyLoose(fen, 'd1d2', WHITE), []);
});

test('coach: result messages do not claim more than the result', () => {
  assert.match(resultText('1-0', 'white'), /You won/);
  assert.match(resultText('1-0', 'black'), /review/);
  assert.match(resultText('1/2-1/2', 'white'), /drawn/);
});

/* ------------------------------ speech ------------------------------ */

const voice = (name: string, o: Partial<VoiceInfo> = {}): VoiceInfo => ({ uri: name, name, lang: 'en-GB', local: true, isDefault: false, ...o });

test('voices: gender is judged from the name and left unknown when the name does not say', () => {
  assert.equal(classifyVoice({ name: 'Google UK English Female' }), 'female');
  assert.equal(classifyVoice({ name: 'Google UK English Male' }), 'male');
  assert.equal(classifyVoice({ name: 'Microsoft Zira - English (United States)' }), 'female');
  assert.equal(classifyVoice({ name: 'Daniel' }), 'male');
  assert.equal(classifyVoice({ name: 'Microsoft Natural Voice 7' }), 'unknown');
  assert.equal(classifyVoice({ name: 'Germany Voice' }), 'unknown', '"man" inside a word is not a match');
});

test('voices: the preferred gender is matched exactly when an installed voice has it', () => {
  const vs = [voice('Daniel'), voice('Samantha', { lang: 'en-US' })];
  const f = chooseVoice(vs, { voiceGender: 'female', voiceURI: null });
  assert.equal(f.voice!.name, 'Samantha');
  assert.ok(f.exact && f.message === null);
  const m = chooseVoice(vs, { voiceGender: 'male', voiceURI: null });
  assert.equal(m.voice!.name, 'Daniel');
});

test('voices: when no voice matches, the closest installed one is used and the limitation is stated', () => {
  const r = chooseVoice([voice('Daniel')], { voiceGender: 'female', voiceURI: null });
  assert.equal(r.voice!.name, 'Daniel');
  assert.equal(r.exact, false);
  assert.match(r.message!, /No female English voice was found/);
  assert.match(r.message!, /judged from the voice's name/);
});

test('voices: a voice that streams from a server is never selected, even if it is the only match', () => {
  const r = chooseVoice([voice('Google US English Female', { local: false }), voice('Daniel')], { voiceGender: 'female', voiceURI: null });
  assert.equal(r.voice!.name, 'Daniel');
  assert.equal(r.hiddenRemote, 1);
  const none = chooseVoice([voice('Google US English Female', { local: false })], { voiceGender: 'female', voiceURI: null });
  assert.equal(none.voice, null);
  assert.match(none.message!, /unavailable/);
  const picked = chooseVoice([voice('Google US English Female', { local: false }), voice('Daniel')], { voiceGender: 'female', voiceURI: 'Google US English Female' });
  assert.equal(picked.voice!.name, 'Daniel', 'an explicit choice of a remote voice is ignored');
});

test('voices: an explicit pick of an installed voice wins over the gender preference; non-English voices are not offered', () => {
  const vs = [voice('Samantha'), voice('Daniel'), voice('Amelie', { lang: 'fr-FR' })];
  const r = chooseVoice(vs, { voiceGender: 'female', voiceURI: 'Daniel' });
  assert.equal(r.voice!.name, 'Daniel');
  assert.ok(r.usable.every((v) => v.lang.startsWith('en')));
  assert.equal(chooseVoice([voice('Amelie', { lang: 'fr-FR' })], { voiceGender: 'female', voiceURI: null }).voice, null);
});

class FakeBackend implements SpeechBackend {
  supported = true;
  voices: VoiceInfo[] = [];
  spoken: Array<{ text: string; o: SpeakOptions }> = [];
  cancels = 0;
  cbs = new Set<() => void>();
  throwOnSpeak = false;
  getVoices() { return this.voices; }
  onVoicesChanged(cb: () => void) { this.cbs.add(cb); return () => this.cbs.delete(cb); }
  speak(text: string, o: SpeakOptions) { if (this.throwOnSpeak) throw new Error('synthesis failed'); this.spoken.push({ text, o }); }
  cancel() { this.cancels++; }
  loaded(v: VoiceInfo[]) { this.voices = v; for (const c of this.cbs) c(); }
}
const prefs = { ...DEFAULT_TRAINER_PREFS, speech: true };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('speech: nothing is spoken while spoken coaching is off, but the text is remembered for replay', () => {
  const b = new FakeBackend();
  b.voices = [voice('Samantha')];
  const m = new SpeechManager(b);
  m.configure({ ...prefs, speech: false });
  assert.equal(m.speak('Watch out'), false);
  assert.equal(b.spoken.length, 0);
  assert.equal(m.getState().last, 'Watch out');
  assert.equal(m.replay(), true, 'replay is an explicit request');
  assert.equal(b.spoken.length, 1);
  m.dispose();
});

test('speech: a new message cancels the one still speaking, and the old one\'s end callback cannot clear the new one', () => {
  const b = new FakeBackend();
  b.voices = [voice('Samantha')];
  const m = new SpeechManager(b);
  m.configure(prefs);
  m.speak('first');
  const firstEnd = b.spoken[0]!.o.onEnd;
  m.speak('second');
  assert.equal(b.spoken.length, 2);
  assert.ok(b.cancels >= 2, 'cancelled before each utterance');
  firstEnd();
  assert.equal(m.getState().speaking, true, 'the late end of the stale utterance is ignored');
  b.spoken[1]!.o.onEnd();
  assert.equal(m.getState().speaking, false);
  m.dispose();
});

test('speech: stop cancels and ignores late callbacks; volume comes from the Trainer setting, not the sound effects', () => {
  const b = new FakeBackend();
  b.voices = [voice('Samantha')];
  const m = new SpeechManager(b);
  m.configure({ ...prefs, volume: 0.3 });
  m.speak('hello');
  assert.equal(b.spoken[0]!.o.volume, 0.3);
  m.stop();
  assert.equal(m.getState().speaking, false);
  b.spoken[0]!.o.onError('late');
  assert.equal(m.getState().error, null);
  m.dispose();
});

test('speech: voices that load late are picked up, and "loading" turns into "no voice" only after the retries', async () => {
  const b = new FakeBackend();
  const m = new SpeechManager(b, 3, 5);
  assert.equal(m.getState().status, 'loading');
  b.loaded([voice('Daniel')]);
  assert.equal(m.getState().status, 'ready');
  m.dispose();
  const empty = new FakeBackend();
  const m2 = new SpeechManager(empty, 3, 5);
  assert.equal(m2.getState().status, 'loading');
  await wait(60);
  assert.equal(m2.getState().status, 'no-voice');
  assert.equal(m2.speak('hi'), false);
  m2.dispose();
});

test('speech: an unsupported browser and a failing synthesiser both leave the app working', () => {
  const none = new FakeBackend();
  none.supported = false;
  const m = new SpeechManager(none);
  m.configure(prefs);
  assert.equal(m.getState().status, 'unsupported');
  assert.equal(m.speak('hi'), false);
  assert.equal(m.preview(), false);
  m.dispose();
  const bad = new FakeBackend();
  bad.voices = [voice('Samantha')];
  bad.throwOnSpeak = true;
  const m2 = new SpeechManager(bad);
  m2.configure(prefs);
  assert.equal(m2.speak('hi'), false);
  assert.match(m2.getState().error!, /synthesis failed/);
  m2.dispose();
});

test('speech: spoken text is bounded so long messages are not cut off mid-sentence by the browser', () => {
  const b = new FakeBackend();
  b.voices = [voice('Samantha')];
  const m = new SpeechManager(b);
  m.configure(prefs);
  m.speak('Sentence one is here. '.repeat(60));
  assert.ok(b.spoken[0]!.text.length <= MAX_SPOKEN_CHARS);
  assert.ok(b.spoken[0]!.text.endsWith('.'));
  m.dispose();
});

test('speech: changing the voice preference re-selects the voice', () => {
  const b = new FakeBackend();
  b.voices = [voice('Samantha'), voice('Daniel')];
  const m = new SpeechManager(b);
  m.configure({ ...prefs, voiceGender: 'female' });
  assert.equal(m.getState().choice!.voice!.name, 'Samantha');
  m.configure({ ...prefs, voiceGender: 'male' });
  assert.equal(m.getState().choice!.voice!.name, 'Daniel');
  m.dispose();
});

/* ------------------------------ settings ------------------------------ */

test('trainer settings: defaults are quiet, values are validated, old settings files load', () => {
  assert.equal(DEFAULT_TRAINER_PREFS.speech, false);
  assert.equal(validateSettings({}).trainer.speech, false);
  assert.deepEqual(validateTrainer({ speech: true, voiceGender: 'male', voiceURI: 'x', volume: 9, warnings: false, detail: 'concise' }), { speech: true, voiceGender: 'male', voiceURI: 'x', volume: 1, warnings: false, detail: 'concise' });
  assert.deepEqual(validateTrainer({ speech: 'yes', voiceGender: 'robot', volume: -3, detail: 'x' }), { ...DEFAULT_TRAINER_PREFS, volume: 0 });
});
