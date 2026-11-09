import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SoundManager } from '../audio/manager';
import type { SoundKind } from '../audio/kinds';
import { WebAudioBackend } from '../audio/webaudio';
import { AnalysisEngine, loadEnginePreference } from '../engine/analysis';
import { bundledStockfishBuilds, isBuildUsable } from '../engine/builds';
import { BotRouter } from '../engine/botRouter';
import { EngineClient } from '../engine/client';
import { StockfishClient } from '../engine/stockfish';
import { SpeechManager, WebSpeechBackend } from '../trainer/speech';
import type { Achievement } from '../profile/achievements';
import { checkAchievements as syncStoredAchievements } from '../profile/achievementService';
import { DEFAULT_SETTINGS, type Settings, type Store } from '../storage/types';
import { AchievementBadge } from './AchievementBadge';
import { Logo, NavIcon, type NavIconName } from './icons';
import { setHapticsEnabled } from './haptics';
import { PieceDefs } from './pieces';

/* ----------------------------- Context ------------------------------ */

export type { SoundKind };

interface AppCtx {
  store: Store;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Engine used for bot moves. */
  botEngine: BotRouter;
  /** Spoken coaching (Web Speech API, voices installed on this device only). Separate from the chess sound effects. */
  speech: SpeechManager;
  /**
   * Separate engine for evaluation and analysis so it never interrupts a bot move. Uses Stockfish when it is
   * preferred and works, and falls back to the built-in engine. Bots always use `botEngine`.
   */
  evalEngine: AnalysisEngine;
  /** Play a sound if the person's sound settings allow it. Never throws, never blocks. */
  playSound: (kind: SoundKind) => void;
  /** Settings preview: ignores the per-category switches (but not the master switch or volume). */
  previewSound: (kind: SoundKind) => void;
  online: boolean;
  offlineReady: boolean;
  /** Show a short message. Errors stay until dismissed. */
  toast: (text: string, kind?: ToastKind) => void;
  /** Increments whenever games, profile or activity change, so pages reload their data. */
  dataVersion: number;
  notifyDataChanged: () => void;
  /** True when a newer version is installed and waiting for the person to reload. */
  updateReady: boolean;
  applyUpdate: () => void;
  /**
   * Look for achievements the saved data now earns, store them, and (unless `announce` is false) show the unlock
   * notification and play its sound. Safe to call at any time: an unlock is announced at most once.
   */
  checkAchievements: (opts?: { announce?: boolean }) => Promise<Achievement[]>;
}

/** 'notice' is a soft, positive heads-up (such as a new personal best) with its own quiet sound. */
export type ToastKind = 'info' | 'ok' | 'error' | 'notice';
interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
  /** Present for achievement unlocks, which get a richer card. */
  achievement?: Pick<Achievement, 'id' | 'title' | 'description' | 'icon' | 'rarity'>;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

/* ------------------------------ Router ------------------------------ */

function currentPath(): string {
  const raw = location.hash.replace(/^#/, '');
  return raw.split('?')[0] || '/';
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const on = () => setPath(currentPath());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}

export const go = (path: string): void => {
  location.hash = path;
};

/* ------------------------------ Provider ---------------------------- */

export function AppProvider({ store, initial, children }: { store: Store; initial: Settings; children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(initial);
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const toastId = useRef(0);
  const botEngine = useMemo(() => {
    const env = { crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated };
    const build = typeof WebAssembly === 'object' ? bundledStockfishBuilds().find((b) => isBuildUsable(b, env)) : undefined;
    return new BotRouter(new EngineClient(__WORKER_URL__), build ? new StockfishClient(build) : null);
  }, []);
  const speech = useMemo(() => {
    const manager = new SpeechManager(new WebSpeechBackend());
    manager.configure(initial.trainer);
    return manager;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sound = useMemo(() => {
    const backend = new WebAudioBackend();
    const manager = new SoundManager(backend);
    manager.configure(initial.sound);
    // A DOM event lets tests (and anything else) observe sounds without touching app internals.
    manager.onPlay((kind, gain) => window.dispatchEvent(new CustomEvent('mw:sound', { detail: { kind, gain } })));
    return { backend, manager };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const evalEngine = useMemo(() => {
    const env = { crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated };
    const build = typeof WebAssembly === 'object' ? bundledStockfishBuilds().find((b) => isBuildUsable(b, env)) : undefined;
    return new AnalysisEngine(new EngineClient(__WORKER_URL__), build ? new StockfishClient(build) : null, loadEnginePreference());
  }, []);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (text: string, kind: ToastKind = 'info') => {
      const id = ++toastId.current;
      if (kind === 'ok') sound.manager.play('success');
      else if (kind === 'error') sound.manager.play('error');
      else if (kind === 'notice') sound.manager.play('notify');
      setToasts((t) => [...t.slice(-3), { id, text, kind }]);
      if (kind !== 'error') setTimeout(() => dismissToast(id), 7000);
    },
    [dismissToast, sound],
  );
  const notifyDataChanged = useCallback(() => setDataVersion((v) => v + 1), []);

  /** Show unlock cards and play one achievement sound (the fuller one if any is rare). Never takes focus. */
  const announceAchievements = useCallback(
    (list: Achievement[]) => {
      if (!list.length) return;
      const shown = list.slice(0, 3);
      const items: ToastItem[] = shown.map((a) => ({
        id: ++toastId.current,
        text: a.title,
        kind: 'ok',
        achievement: { id: a.id, title: a.title, description: a.description, icon: a.icon, rarity: a.rarity },
      }));
      if (list.length > shown.length) {
        items.push({ id: ++toastId.current, text: `…and ${list.length - shown.length} more achievements. See them on your profile.`, kind: 'info' });
      }
      setToasts((t) => [...t.slice(-2), ...items]);
      sound.manager.play(list.some((a) => a.rarity === 'rare') ? 'achievementRare' : 'achievement');
      for (const it of items) setTimeout(() => dismissToast(it.id), 10000);
    },
    [sound, dismissToast],
  );

  const checkAchievements = useCallback(
    async (opts?: { announce?: boolean }): Promise<Achievement[]> => {
      try {
        const res = await syncStoredAchievements(store);
        // The first run only records what the existing history already earned, without fanfare.
        if (!res.firstRun && opts?.announce !== false) announceAchievements(res.newlyUnlocked);
        if (res.newlyUnlocked.length) setDataVersion((v) => v + 1);
        return res.newlyUnlocked;
      } catch {
        return []; // achievements are a bonus: never let them get in the way of playing
      }
    },
    [store, announceAchievements],
  );

  // On startup, record anything the saved history already earned (including a game that finished just before the
  // app was closed). Existing history is recorded silently the first time.
  useEffect(() => {
    void checkAchievements();
  }, [checkAchievements]);

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...settingsRef.current, ...patch };
      settingsRef.current = next;
      if (patch.sound) sound.manager.configure(next.sound); // applies to the very next sound, no restart needed
      if (patch.trainer) speech.configure(next.trainer);
      setSettings(next);
      store.putSettings(next).catch(() => toast('Your settings could not be saved on this device. They will reset when you close the app.', 'error'));
    },
    [store, toast, sound, speech],
  );

  // Theme + board theme live on <html> so CSS variables apply everywhere.
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b101c' : '#f4f0e5');
    };
    apply();
    root.dataset.board = settings.boardTheme;
    setHapticsEnabled(settings.haptics);
    try {
      // Mirrored so the inline script in index.html can theme the very first paint.
      localStorage.setItem('mw-theme', settings.theme);
      localStorage.setItem('mw-board', settings.boardTheme);
    } catch {
      /* storage may be blocked */
    }
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme, settings.boardTheme, settings.haptics]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Register the service worker; "offline ready" means this page is controlled and cached.
  // A newer version is never activated behind the person's back: it waits until they choose to reload.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;
    let reg: ServiceWorkerRegistration | undefined;
    const checkWaiting = () => {
      if (!cancelled && reg?.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') reg?.update().catch(() => undefined);
    };
    navigator.serviceWorker
      .register('./sw.js')
      .then((r) => {
        reg = r;
        checkWaiting();
        r.addEventListener('updatefound', () => {
          const nw = r.installing;
          nw?.addEventListener('statechange', () => nw.state === 'installed' && checkWaiting());
        });
        document.addEventListener('visibilitychange', onVisible);
        return navigator.serviceWorker.ready;
      })
      .then(async () => {
        const keys = await caches.keys();
        if (!cancelled && keys.some((k) => k.startsWith('movewise-'))) setOfflineReady(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waiting) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }, [waiting]);

  const playSound = useCallback((kind: SoundKind) => void sound.manager.play(kind), [sound]);
  const previewSound = useCallback((kind: SoundKind) => void sound.manager.preview(kind), [sound]);

  // Browsers only allow audio after a gesture: create/resume the audio context on the first press or key.
  useEffect(() => {
    const unlock = () => {
      if (!sound.backend.ready()) sound.backend.unlock();
    };
    const opts = { capture: true, passive: true } as const;
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.addEventListener(ev, unlock, opts);
    return () => {
      for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.removeEventListener(ev, unlock, opts);
    };
  }, [sound]);

  // Quiet, consistent interface sounds, attached once for every page. Not every interaction gets one.
  useEffect(() => {
    const NO_SOUND = '.board, .promo-overlay, [data-sound="none"]';
    const onClick = (e: MouseEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      const btn = t?.closest('button, [role="button"]');
      if (!btn || btn.closest(NO_SOUND) || (btn as HTMLButtonElement).disabled) return;
      if (btn.closest('.switch')) return; // checkboxes have their own sound
      playSound(btn.hasAttribute('aria-pressed') ? 'setting' : 'click');
    };
    const onChange = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.closest(NO_SOUND) || t.closest('[data-haptic]')) return;
      if (t.type === 'checkbox') playSound(t.checked ? 'toggleOn' : 'toggleOff');
      else if (t.type === 'radio') playSound('setting');
    };
    let lastPath = currentPath();
    const onHash = () => {
      const p = currentPath();
      if (p !== lastPath) playSound('nav');
      lastPath = p;
    };
    // Dialogs (e.g. the promotion picker) open and close with a soft sound.
    const hasDialog = (n: Node) => n instanceof Element && (n.matches('[role="dialog"]') || n.querySelector('[role="dialog"]') !== null);
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if ([...r.addedNodes].some(hasDialog)) playSound('modalOpen');
        else if ([...r.removedNodes].some(hasDialog)) playSound('modalClose');
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    window.addEventListener('hashchange', onHash);
    return () => {
      mo.disconnect();
      document.removeEventListener('click', onClick);
      document.removeEventListener('change', onChange);
      window.removeEventListener('hashchange', onHash);
    };
  }, [playSound]);

  useEffect(
    () => () => {
      botEngine.dispose();
      speech.dispose();
      evalEngine.dispose();
    },
    [botEngine, evalEngine, speech],
  );

  const value = useMemo<AppCtx>(
    () => ({ store, settings, updateSettings, botEngine, speech, evalEngine, playSound, previewSound, online, offlineReady, toast, dataVersion, notifyDataChanged, updateReady: waiting !== null, applyUpdate, checkAchievements }),
    [store, settings, updateSettings, botEngine, speech, evalEngine, playSound, previewSound, online, offlineReady, toast, dataVersion, notifyDataChanged, waiting, applyUpdate, checkAchievements],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) =>
          t.achievement ? (
            <div key={t.id} className={`toast achievement ${t.achievement.rarity}`} role="status">
              <AchievementBadge motif={t.achievement.icon} rarity={t.achievement.rarity} unlocked size={52} />
              <div className="toast-body">
                <span className="eyebrow">Achievement unlocked</span>
                <b>{t.achievement.title}</b>
                <span className="muted small">{t.achievement.description}</span>
                <a className="small" href={`#/profile?achievement=${t.achievement.id}`} onClick={() => dismissToast(t.id)}>
                  View details
                </a>
              </div>
              <button type="button" className="toast-close" aria-label="Dismiss message" onClick={() => dismissToast(t.id)}>
                ×
              </button>
              {t.achievement.rarity === 'rare' && (
                <span className="confetti" aria-hidden="true">
                  {Array.from({ length: 14 }, (_, i) => (
                    <i key={i} style={{ ['--i' as string]: i }} />
                  ))}
                </span>
              )}
            </div>
          ) : (
            <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
              <span>{t.text}</span>
              <button type="button" className="toast-close" aria-label="Dismiss message" onClick={() => dismissToast(t.id)}>
                ×
              </button>
            </div>
          ),
        )}
      </div>
    </Ctx.Provider>
  );
}

/* ------------------------------- Shell ------------------------------ */

const NAV: Array<{ path: string; label: string; icon: NavIconName }> = [
  { path: '/play', label: 'Play', icon: 'play' },
  { path: '/puzzles', label: 'Puzzles', icon: 'puzzles' },
  { path: '/academy', label: 'Learn', icon: 'academy' },
  { path: '/games', label: 'Game Review', icon: 'games' },
  { path: '/notebook', label: 'Mistake Notebook', icon: 'notebook' },
  { path: '/profile', label: 'Profile', icon: 'profile' },
];

const isActive = (route: string, path: string): boolean => (path === '/' ? route === '/' : route.startsWith(path));

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const { online, offlineReady, store, updateReady, applyUpdate } = useApp();
  const chip = !online
    ? { cls: 'bad', text: 'Offline' + (offlineReady ? ' · everything works' : '') }
    : offlineReady
      ? { cls: '', text: 'Offline-ready' }
      : { cls: 'warn', text: 'Preparing offline…' };

  return (
    <div className="app">
      <PieceDefs />
      <a href="#main" className="sr-only">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/" aria-label="MoveWise home">
            <Logo size={34} />
            <span className="brand-name">
              Move<b>Wise</b>
            </span>
          </a>
          <nav className="nav" aria-label="Main">
            {NAV.map((n) => (
              <a key={n.path} href={`#${n.path}`} aria-current={isActive(route, n.path) ? 'page' : undefined}>
                <NavIcon name={n.icon} />
                {n.label}
              </a>
            ))}
          </nav>
          <a className="settings-link" href="#/settings" aria-label="Settings" aria-current={isActive(route, '/settings') ? 'page' : undefined}>
            <NavIcon name="settings" />
          </a>
          <span className={`status-chip ${chip.cls}`} role="status">
            <span className="dot" aria-hidden="true" />
            {chip.text}
          </span>
        </div>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {!store.persistent && (
          <div className="notice error" role="alert">
            <b>Your browser blocked local storage.</b> You can still play, but games and settings will be lost when you close
            this tab. Use Settings → Export to keep a copy.
          </div>
        )}
        {updateReady && (
          <div className="notice update" role="status">
            <span>
              <b>A new version of MoveWise is ready.</b> Your games and settings are kept; a game in progress resumes after the reload.
            </span>
            <button className="btn small primary" type="button" onClick={applyUpdate}>
              Reload to update
            </button>
          </div>
        )}
        {children}
      </main>
      <footer className="footer">
        <div className="tag">LEARN. PLAY. IMPROVE.</div>
        MoveWise is free, ad-free and open source. Your games stay on this device.
      </footer>
      <nav className="tabbar" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.path} href={`#${n.path}`} aria-current={isActive(route, n.path) ? 'page' : undefined}>
            <NavIcon name={n.icon} />
            <span className="tab-label">{n.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

export { DEFAULT_SETTINGS };
