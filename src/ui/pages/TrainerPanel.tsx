import { useEffect, useRef, useSyncExternalStore } from 'react';
import { classifyVoice, type SpeechManager } from '../../trainer/speech';
import type { TrainerMessage, TrainerPrefs } from '../../trainer/types';
import { useApp } from '../app';

export function useSpeechState(speech: SpeechManager) {
  return useSyncExternalStore(
    (cb) => speech.subscribe(cb),
    () => speech.getState(),
  );
}

const KIND_LABEL: Record<TrainerMessage['kind'], string> = {
  welcome: 'Trainer',
  warning: 'Before you move',
  'bot-move': 'My move',
  'your-move': 'Your move',
  threat: 'Heads up',
  result: 'Game over',
};

export interface PendingWarning {
  text: string;
  from: number;
  to: number;
  promo: number;
}

interface PanelProps {
  messages: TrainerMessage[];
  checking: boolean;
  warning: PendingWarning | null;
  onReconsider: () => void;
  onPlayAnyway: () => void;
  /** True when the warning is shown somewhere else on the page (under the board on a phone), so it is not drawn here too. */
  warningElsewhere?: boolean;
}

/**
 * The pre-move warning with its two choices. On a phone it is drawn right under the board, so the buttons are on screen without
 * scrolling; on larger screens it stays in the Trainer panel beside the board.
 */
export function TrainerWarning({ warning, onReconsider, onPlayAnyway }: { warning: PendingWarning; onReconsider: () => void; onPlayAnyway: () => void }) {
  const reconsiderRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    reconsiderRef.current?.focus();
  }, [warning]);
  return (
    <div className="trainer-warning" role="alert" data-testid="trainer-warning">
      <strong>Before you play that move</strong>
      <p style={{ margin: '6px 0' }}>{warning.text}</p>
      <div className="btn-row">
        <button ref={reconsiderRef} className="btn primary" type="button" onClick={onReconsider} data-testid="trainer-reconsider">
          Let me reconsider
        </button>
        <button className="btn" type="button" onClick={onPlayAnyway} data-testid="trainer-play-anyway">
          Play the move anyway
        </button>
      </div>
    </div>
  );
}

/** The Trainer's messages beside the board, with the pre-move warning and the speech controls. Text is always shown; speech only adds to it. */
export function TrainerPanel({ messages, checking, warning, onReconsider, onPlayAnyway, warningElsewhere }: PanelProps) {
  const { speech, settings, updateSettings } = useApp();
  const st = useSpeechState(speech);
  const prefs = settings.trainer;
  const set = (patch: Partial<TrainerPrefs>) => updateSettings({ trainer: { ...prefs, ...patch } });
  const latest = [...messages].reverse().slice(0, 4);
  const canSpeak = st.status === 'ready';

  return (
    <section className="card trainer-card" aria-labelledby="h-trainer" data-testid="trainer-panel">
      <h2 id="h-trainer" className="h3-look" style={{ marginTop: 0 }}>Your Trainer</h2>
      {warning && !warningElsewhere && <TrainerWarning warning={warning} onReconsider={onReconsider} onPlayAnyway={onPlayAnyway} />}
      {checking && !warning && <p className="muted small" role="status">Checking your move…</p>}
      <div aria-live="polite" data-testid="trainer-messages">
        {latest.length === 0 && !warning && <p className="muted">I will comment on key moments. Make your first move when you are ready.</p>}
        {latest.map((m, i) => (
          <p key={m.id} className={`trainer-msg${i === 0 ? ' newest' : ''}`} data-kind={m.kind}>
            <span className="trainer-kind">{KIND_LABEL[m.kind]}.</span> {m.text}
          </p>
        ))}
      </div>
      <div className="btn-row trainer-voice" role="group" aria-label="Spoken coaching">
        <label className="switch" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={prefs.speech} disabled={st.status === 'unsupported'} onChange={(e) => set({ speech: e.target.checked })} />
          <span>Speak aloud</span>
        </label>
        <button className="btn small" type="button" onClick={() => speech.stop()} disabled={!st.speaking}>
          Stop
        </button>
        <button className="btn small" type="button" onClick={() => speech.replay()} disabled={!canSpeak || !st.last}>
          Replay latest
        </button>
      </div>
      {st.status === 'unsupported' && <p className="muted small">This browser cannot speak, so the Trainer writes only. Nothing else changes.</p>}
      {st.status === 'no-voice' && st.choice?.message && <p className="muted small">{st.choice.message}</p>}
      {prefs.speech && st.choice?.message && st.status === 'ready' && <p className="muted small">{st.choice.message}</p>}
      {st.error && <p className="muted small" role="status">Speech did not work this time ({st.error}). The advice above is unaffected.</p>}
    </section>
  );
}

/** Full voice settings, used on the Settings page. */
export function TrainerVoiceSettings() {
  const { speech, settings, updateSettings } = useApp();
  const st = useSpeechState(speech);
  const prefs = settings.trainer;
  const set = (patch: Partial<TrainerPrefs>) => updateSettings({ trainer: { ...prefs, ...patch } });
  const usable = st.choice?.usable ?? [];
  return (
    <section className="card" aria-labelledby="h-trainer-set" data-testid="trainer-settings">
      <h2 id="h-trainer-set" style={{ marginTop: 0 }}>Trainer and spoken coaching</h2>
      <p className="muted small">
        The Trainer comments on your games in writing. If you want, it can also speak the important moments. Speech uses voices installed on this device through your browser, so nothing about your games is sent anywhere.
      </p>
      <label className="switch">
        <input type="checkbox" checked={prefs.warnings} onChange={(e) => set({ warnings: e.target.checked })} />
        <span>Warn me before a serious blunder</span>
      </label>
      <div className="field">
        <span className="label" id="detail-label">Explanations</span>
        <div className="seg" role="group" aria-labelledby="detail-label">
          <button type="button" aria-pressed={prefs.detail === 'beginner'} onClick={() => set({ detail: 'beginner' })}>Explain the idea</button>
          <button type="button" aria-pressed={prefs.detail === 'concise'} onClick={() => set({ detail: 'concise' })}>Short and direct</button>
        </div>
      </div>
      <label className="switch">
        <input type="checkbox" checked={prefs.speech} disabled={st.status === 'unsupported'} onChange={(e) => set({ speech: e.target.checked })} />
        <span>Speak important Trainer messages aloud</span>
      </label>
      {st.status === 'unsupported' && <p className="notice" role="status">This browser does not support speech synthesis. The Trainer works in writing only.</p>}
      {st.status === 'loading' && <p className="muted small" role="status">Looking for voices installed on this device…</p>}
      {st.status === 'no-voice' && st.choice?.message && <p className="notice" role="status">{st.choice.message}</p>}
      {(st.status === 'ready' || st.status === 'no-voice') && st.choice && (
        <>
          <div className="field">
            <span className="label" id="gender-label">Voice</span>
            <div className="seg" role="group" aria-labelledby="gender-label">
              <button type="button" aria-pressed={prefs.voiceGender === 'female' && !prefs.voiceURI} onClick={() => set({ voiceGender: 'female', voiceURI: null })}>Female</button>
              <button type="button" aria-pressed={prefs.voiceGender === 'male' && !prefs.voiceURI} onClick={() => set({ voiceGender: 'male', voiceURI: null })}>Male</button>
            </div>
          </div>
          {usable.length > 0 && (
            <div className="field">
              <label htmlFor="voice-pick">Installed voice</label>
              <select id="voice-pick" value={prefs.voiceURI ?? ''} onChange={(e) => set({ voiceURI: e.target.value || null })}>
                <option value="">Choose automatically{st.choice.voice ? ` (${st.choice.voice.name})` : ''}</option>
                {usable.map((v) => (
                  <option key={v.uri} value={v.uri}>{v.name} ({v.lang}{classifyVoice(v) === 'unknown' ? '' : `, sounds ${classifyVoice(v)}`})</option>
                ))}
              </select>
            </div>
          )}
          {st.choice.message && st.status === 'ready' && <p className="muted small" role="status" data-testid="voice-limit">{st.choice.message}</p>}
          {st.choice.hiddenRemote > 0 && <p className="muted small">{st.choice.hiddenRemote} {st.choice.hiddenRemote === 1 ? 'voice' : 'voices'} that stream from an online service {st.choice.hiddenRemote === 1 ? 'is' : 'are'} hidden, because using {st.choice.hiddenRemote === 1 ? 'it' : 'them'} would send the Trainer text over the network.</p>}
          <div className="field">
            <label htmlFor="trainer-volume">Trainer volume</label>
            <input id="trainer-volume" type="range" min={0} max={1} step={0.05} value={prefs.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
            <span className="muted small">Separate from the chess sound effects.</span>
          </div>
          <div className="btn-row">
            <button className="btn" type="button" onClick={() => speech.preview()} disabled={st.status !== 'ready'} data-testid="voice-preview">Preview voice</button>
            <button className="btn" type="button" onClick={() => speech.stop()} disabled={!st.speaking}>Stop</button>
            <button className="btn" type="button" onClick={() => speech.replay()} disabled={st.status !== 'ready' || !st.last}>Replay latest</button>
          </div>
          {st.error && <p className="muted small" role="status">Speech did not work this time ({st.error}).</p>}
        </>
      )}
      <p className="muted small">
        Which voices exist depends on your browser and operating system. Browsers do not say whether a voice is male or female, so MoveWise judges that from the voice's name and tells you when it had to settle for the closest match.
      </p>
    </section>
  );
}
