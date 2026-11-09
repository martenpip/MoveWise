import { useEffect, useState } from 'react';
import { DEFAULT_SOUND_PREFS, type SoundKind, type SoundPrefs } from '../../audio/kinds';
import { KNIGHT, WHITE, BLACK, makePiece } from '../../chess/types';
import { saveEnginePreference, type EnginePreference } from '../../engine/analysis';
import { BOARD_THEMES, type BoardTheme, type ThemeChoice } from '../../storage/types';
import { useApp } from '../app';
import { PieceG } from '../pieces';
import { downloadText } from '../shared';
import { TrainerVoiceSettings } from './TrainerPanel';

const THEMES: Array<[ThemeChoice, string, string]> = [
  ['dark', 'Dark', 'Easy on the eyes for long sessions'],
  ['light', 'Light', 'Parchment and ink'],
  ['system', 'Match device', "Follows your device's setting"],
];
const BOARD_NAMES: Record<BoardTheme, string> = {
  walnut: 'Walnut',
  slate: 'Slate',
  moss: 'Moss',
  midnight: 'Midnight',
  graphite: 'Graphite',
  ember: 'Ember',
};

/** Two squares with a white and a black knight, so piece readability is visible before choosing. */
function BoardPreview({ theme }: { theme: BoardTheme }) {
  return (
    <svg data-board={theme} viewBox="0 0 90 45" width="92" height="46" aria-hidden="true" focusable="false" className="board-preview">
      <rect width="45" height="45" fill="var(--sq-light)" />
      <rect x="45" width="45" height="45" fill="var(--sq-dark)" />
      <PieceG piece={makePiece(KNIGHT, WHITE)} />
      <g transform="translate(45 0)">
        <PieceG piece={makePiece(KNIGHT, BLACK)} />
      </g>
    </svg>
  );
}

const PREVIEWS: Array<[SoundKind, string]> = [
  ['move', 'Move'],
  ['capture', 'Capture'],
  ['castle', 'Castling'],
  ['check', 'Check'],
  ['checkmate', 'Checkmate'],
  ['promotion', 'Promotion'],
  ['illegal', 'Illegal move'],
  ['click', 'Button'],
  ['success', 'Success'],
  ['error', 'Error'],
  ['achievement', 'Achievement'],
  ['achievementRare', 'Rare achievement'],
];

function SoundSection() {
  const { settings, updateSettings, previewSound, playSound } = useApp();
  const p = settings.sound;
  const set = (patch: Partial<SoundPrefs>) => updateSettings({ sound: { ...p, ...patch } });
  const off = !p.master;
  const sw = (key: 'board' | 'ui' | 'achievements' | 'selectSound' | 'replay' | 'undo', label: string, hint?: string) => (
    <label className="switch">
      <input type="checkbox" checked={p[key]} disabled={off} onChange={(e) => set({ [key]: e.target.checked })} />
      <span>
        {label}
        {hint && <span className="muted small"> {hint}</span>}
      </span>
    </label>
  );
  const slider = (key: 'volume' | 'boardVolume' | 'uiVolume', label: string, previewKind: SoundKind) => (
    <label className="slider-row">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(p[key] * 100)}
        disabled={off}
        aria-valuetext={`${Math.round(p[key] * 100)} percent`}
        onChange={(e) => set({ [key]: Number(e.target.value) / 100 })}
        // Let go of the slider and hear the new level; dragging itself stays silent.
        onPointerUp={() => previewSound(previewKind)}
        onKeyUp={() => previewSound(previewKind)}
      />
      <output>{Math.round(p[key] * 100)}%</output>
    </label>
  );
  return (
    <section className="card" aria-labelledby="h-sound">
      <h2 id="h-sound">Sound</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Every sound is made on your device as you play, so nothing is downloaded and it all works offline. Your browser only allows
        audio after you have tapped or clicked once on the page.
      </p>
      <label className="switch">
        <input type="checkbox" checked={p.master} onChange={(e) => set({ master: e.target.checked })} />
        <span><b>Sound</b> <span className="muted small">{p.master ? 'On' : 'Off: nothing will play'}</span></span>
      </label>
      <div className="sound-group" aria-disabled={off}>
        {sw('board', 'Board sounds', 'Moves, captures, check, checkmate, castling, promotion')}
        {sw('ui', 'Interface sounds', 'Buttons, navigation, dialogs and confirmations')}
        {sw('achievements', 'Achievement sounds', 'Unlocks and rating notices. You still see the notification when this is off.')}
        {sw('selectSound', 'Tick when picking up a piece', 'Very quiet')}
        {sw('replay', 'Sound when stepping forward through a game', 'Replay, analysis and move list')}
        {sw('undo', 'Sound when stepping back or taking back a move')}
      </div>
      <div className="sound-group">
        {slider('volume', 'Volume', 'move')}
        {slider('boardVolume', 'Board', 'move')}
        {slider('uiVolume', 'Interface', 'click')}
      </div>
      <div className="field">
        <span className="label" id="preview-l">Preview</span>
        <div className="btn-row" role="group" aria-labelledby="preview-l">
          {PREVIEWS.map(([kind, label]) => (
            <button key={kind} type="button" className="btn small" data-sound="none" disabled={off} onClick={() => previewSound(kind)}>
              {label}
            </button>
          ))}
        </div>
        {off && <p className="muted small">Turn sound on to preview.</p>}
      </div>
      <div className="btn-row">
        <button
          type="button"
          className="btn small"
          data-sound="none"
          onClick={() => {
            set({ ...DEFAULT_SOUND_PREFS });
            // The reset applies at once; confirm it audibly if sound is now on.
            setTimeout(() => playSound('setting'), 0);
          }}
        >
          Reset sound preferences
        </button>
      </div>
    </section>
  );
}

export function SettingsPage() {
  const { settings, updateSettings, store, online, offlineReady, notifyDataChanged, checkAchievements, evalEngine } = useApp();
  const [enginePref, setEnginePref] = useState<EnginePreference>(evalEngine.getPreference());
  const chooseEngine = (p: EnginePreference) => {
    setEnginePref(p);
    evalEngine.setPreference(p);
    saveEnginePreference(p);
  };
  const stockfish = evalEngine.stockfishInfo;
  const engineStatus = !stockfish
    ? 'Stockfish is not included in this copy of MoveWise.'
    : evalEngine.stockfishProblem
      ? `Stockfish could not start on this device (${evalEngine.stockfishProblem}). The built-in engine is being used instead.`
      : enginePref === 'builtin'
        ? 'Analysis is using the built-in engine.'
        : evalEngine.stockfishReady
          ? `${stockfish.name} is ready.`
          : `${stockfish.name} starts the first time you use analysis.`;
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined);
    void navigator.storage
      ?.estimate?.()
      .then((e) => e.usage !== undefined && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB used by MoveWise on this device`))
      .catch(() => undefined);
  }, []);

  const exportData = async () => {
    try {
      const backup = await store.exportAll();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadText(`movewise-backup-${stamp}.json`, JSON.stringify(backup, null, 2), 'application/json');
      setMsg({ kind: 'ok', text: `Exported ${backup.games.length} games, your profile and settings.` });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Export failed.' });
    }
  };

  const importData = async (file: File | undefined) => {
    if (!file) return;
    try {
      const raw: unknown = JSON.parse(await file.text());
      const res = await store.importAll(raw);
      const fresh = await store.getSettings();
      updateSettings(fresh);
      // Record anything the imported games earn, quietly: an import is not a moment to celebrate.
      await checkAchievements({ announce: false });
      notifyDataChanged();
      setMsg({ kind: 'ok', text: `Imported ${res.games} games${res.activity ? `, ${res.activity} activity records` : ''}${res.achievements ? `, ${res.achievements} unlocked achievements` : ''}, your profile and settings. Your rating and statistics are recalculated from the games.` });
    } catch (e) {
      setMsg({ kind: 'error', text: `Nothing was changed. ${e instanceof Error ? e.message : 'The file could not be read.'}` });
    }
  };

  const clearAll = async () => {
    if (!window.confirm('Delete all games, your profile and rating history, and reset settings on this device? Export a backup first if you want to keep them.')) return;
    await store.clearAll();
    updateSettings({ ...(await store.getSettings()) });
    notifyDataChanged();
    setMsg({ kind: 'ok', text: 'All local data deleted.' });
  };

  const keepData = async () => {
    const ok = await navigator.storage?.persist?.();
    setPersisted(!!ok);
    setMsg(ok ? { kind: 'ok', text: 'Your browser agreed to keep MoveWise data.' } : { kind: 'error', text: 'The browser declined. Exporting backups is the safest option.' });
  };

  return (
    <div className="stack" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Settings</h1>
      {msg && <div className={`notice ${msg.kind}`} role="status">{msg.text}</div>}

      <section className="card" aria-labelledby="h-look">
        <h2 id="h-look">Look and feel</h2>
        <div className="field">
          <span className="label" id="theme-l">App theme</span>
          <div className="choice-grid" role="group" aria-labelledby="theme-l">
            {THEMES.map(([v, label, hint]) => (
              <button key={v} type="button" className="choice" aria-pressed={settings.theme === v} onClick={() => updateSettings({ theme: v })}>
                <b>{label}</b>
                <span className="muted small">{hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label" id="board-l">Board colours</span>
          <p className="muted small" style={{ margin: 0 }}>Independent of the app theme. Every option keeps both piece colours easy to read.</p>
          <div className="choice-grid boards" role="group" aria-labelledby="board-l">
            {BOARD_THEMES.map((v) => (
              <button key={v} type="button" className="choice board-choice" aria-pressed={settings.boardTheme === v} onClick={() => updateSettings({ boardTheme: v })}>
                <BoardPreview theme={v} />
                <b>{BOARD_NAMES[v]}</b>
              </button>
            ))}
          </div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={settings.showLegalMoves} onChange={(e) => updateSettings({ showLegalMoves: e.target.checked })} />
          <span>Show legal moves when a piece is selected</span>
        </label>
        <label className="switch">
          <input type="checkbox" checked={settings.showEvalBar} onChange={(e) => updateSettings({ showEvalBar: e.target.checked })} />
          <span>Show engine evaluation bar in games</span>
        </label>
      </section>

      <SoundSection />

      <TrainerVoiceSettings />

      <section className="card" aria-labelledby="h-engines">
        <h2 id="h-engines">Engines</h2>
        <div className="field">
          <span className="label" id="engine-l">Analysis engine</span>
          <p className="muted small" style={{ margin: 0 }}>Used for the evaluation bar, the Analysis board and game replay. It runs on this device, with no connection.</p>
          <div className="choice-grid" role="group" aria-labelledby="engine-l">
            {stockfish && (
              <button type="button" className="choice" aria-pressed={enginePref === 'stockfish'} onClick={() => chooseEngine('stockfish')}>
                <b>{stockfish.name}</b>
                <span className="muted small">Far stronger than the built-in engine</span>
              </button>
            )}
            <button type="button" className="choice" aria-pressed={enginePref === 'builtin'} onClick={() => chooseEngine('builtin')}>
              <b>Built-in engine</b>
              <span className="muted small">MoveWise’s own engine; far weaker than Stockfish</span>
            </button>
          </div>
        </div>
        <p className="muted small" role="status">{engineStatus}</p>
        <p className="muted small">Bots below 1400 use the built-in engine; from 1400 the opponent is Stockfish with its strength limiter. Analysis and review use Stockfish at full strength.</p>
        {stockfish && (
          <p className="muted small">
            Stockfish is free software under the GPL-3.0.{' '}
            <a href="./licenses/Stockfish-SOURCE.txt" target="_blank" rel="noopener">Licence and source code</a>
            {' · '}
            <a href="./licenses/Stockfish-COPYING.txt" target="_blank" rel="noopener">Full licence text</a>
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="h-offline">
        <h2 id="h-offline">Offline and storage</h2>
        <dl className="kv">
          <dt>Connection</dt>
          <dd>{online ? 'Online' : 'Offline'} — MoveWise never needs it</dd>
          <dt>Offline copy</dt>
          <dd>{offlineReady ? 'Installed: the app and engine are saved on this device' : 'Not ready yet (needs one visit with a connection)'}</dd>
          <dt>Game storage</dt>
          <dd>{store.persistent ? 'Saved in this browser (IndexedDB)' : 'Not saved — browser storage is blocked'}</dd>
          <dt>Engines</dt>
          <dd>{stockfish ? `Bots: built-in engine up to 1300, Stockfish from 1400. Analysis: ${stockfish.name} or the built-in engine (see Engines above).` : 'Built-in MoveWise engine, running in a background worker'}</dd>
        </dl>
        {usage && <p className="muted small" style={{ marginTop: 8 }}>{usage}</p>}
        {persisted === false && (
          <p style={{ marginTop: 8 }}>
            <button className="btn small" type="button" onClick={() => void keepData()}>Ask the browser to keep my data</button>
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="h-data">
        <h2 id="h-data">Your data</h2>
        <p className="muted">Everything is stored on this device only. Export a backup file to move it elsewhere or keep it safe.</p>
        <div className="btn-row">
          <button className="btn primary" type="button" onClick={() => void exportData()}>Export backup</button>
          <label className="btn">
            Import backup
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void importData(e.target.files?.[0])} />
          </label>
          <button className="btn danger" type="button" onClick={() => void clearAll()}>Delete all data</button>
        </div>
      </section>

      <section className="card flat" aria-labelledby="h-about">
        <h2 id="h-about">About MoveWise</h2>
        <p>Learn. Play. Improve. Free forever, no ads, no accounts, no trackers, no network calls for normal use.</p>
        <p className="muted small">Open source under the GPL-3.0-or-later. See the README and THIRD_PARTY_NOTICES in the project for dependencies and licences.</p>
      </section>
    </div>
  );
}
