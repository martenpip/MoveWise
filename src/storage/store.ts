import type { AchievementState } from '../profile/achievementTypes';
import { mergeAchievementStates } from '../profile/achievements';
import type { ActivityEvent, Profile } from '../profile/types';
import type { DailyRecord } from '../puzzles/daily';
import type { LearningPosition } from '../puzzles/learn';
import type { AcademyRecord } from '../academy/types';
import { fromLearningPosition } from '../notebook/legacy';
import type { NotebookEntry } from '../notebook/types';
import type { RushScore } from '../puzzles/rush';
import type { PuzzlePack } from '../puzzles/types';
import { reviewEventId, type GameReview } from '../review/types';
import { buildBackup, parseBackup, validateNotebook, validateAchievements, validateAcademy, newerRecord, validateActivity, validateCurrentGame, validateDaily, validateGame, validateLearning, validateProfile, validateRush, validateReview, validateSettings } from './backup';
import { checkPack } from '../puzzles/library';
import { DEFAULT_SETTINGS, EMPTY_PUZZLE_DATA, type BackupFile, type CurrentGame, type SavedGame, type Settings, type Store } from './types';

const DB_NAME = 'movewise';
const DB_VERSION = 6; // 3 added 'reviews'; 4 added the four puzzle stores; 5 added 'academy'; 6 added 'notebook' (and copied older practice positions into it). Existing stores and data are never altered or removed by an upgrade.
const GAMES = 'games';
const KV = 'kv';
const ACTIVITY = 'activity';
const REVIEWS = 'reviews';
const PZ_DAILY = 'puzzleDaily';
const PZ_RUSH = 'puzzleRush';
const PZ_PACKS = 'puzzlePacks';
const PZ_LEARN = 'learningPositions';
const ACADEMY = 'academy';
const NOTEBOOK = 'notebook';

/** In-memory store: used when IndexedDB is unavailable (private mode, blocked storage) and in tests. */
export class MemoryStore implements Store {
  readonly persistent = false;
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private games = new Map<string, SavedGame>();
  private current: CurrentGame | null = null;
  private profile: Profile | null = null;
  private activity = new Map<string, ActivityEvent>();
  private achievements: AchievementState | null = null;
  private reviews = new Map<string, GameReview>();
  private daily = new Map<string, DailyRecord>();
  private rush = new Map<string, RushScore>();
  private packs = new Map<string, PuzzlePack>();
  private learning = new Map<string, LearningPosition>();
  private academy = new Map<string, AcademyRecord>();
  private notebook = new Map<string, NotebookEntry>();

  async getSettings() {
    return this.settings;
  }
  async putSettings(s: Settings) {
    this.settings = s;
  }
  async listGames() {
    return [...this.games.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
  async getGame(id: string) {
    return this.games.get(id);
  }
  async putGame(g: SavedGame) {
    this.games.set(g.id, g);
  }
  async deleteGame(id: string) {
    this.games.delete(id);
    await this.deleteReview(id);
    for (const [k, l] of this.learning) if (l.gameId === id) this.learning.delete(k);
  }
  async listDaily() {
    return [...this.daily.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  }
  async getDaily(date: string) {
    return this.daily.get(date);
  }
  async putDaily(r: DailyRecord) {
    this.daily.set(r.date, r);
  }
  async listRush() {
    return [...this.rush.values()].sort((a, b) => b.at - a.at);
  }
  async putRush(s: RushScore) {
    this.rush.set(s.id, s);
  }
  async listPacks() {
    return [...this.packs.values()];
  }
  async putPack(p: PuzzlePack) {
    this.packs.set(p.id, p);
  }
  async deletePack(id: string) {
    this.packs.delete(id);
  }
  async listLearning() {
    return [...this.learning.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
  async getLearning(id: string) {
    return this.learning.get(id);
  }
  async putLearning(l: LearningPosition) {
    this.learning.set(l.id, l);
  }
  async deleteLearning(id: string) {
    this.learning.delete(id);
  }
  async listAcademy() {
    return [...this.academy.values()];
  }
  async listNotebook() {
    return [...this.notebook.values()];
  }
  async getNotebook(id: string) {
    return this.notebook.get(id);
  }
  async putNotebook(e: NotebookEntry) {
    this.notebook.set(e.id, e);
  }
  async deleteNotebook(id: string) {
    this.notebook.delete(id);
  }
  async putAcademy(r: AcademyRecord) {
    this.academy.set(r.id, r);
  }
  async getReview(gameId: string) {
    return this.reviews.get(gameId);
  }
  async listReviews() {
    return [...this.reviews.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async putReview(r: GameReview) {
    this.reviews.set(r.gameId, r);
  }
  async deleteReview(gameId: string) {
    this.reviews.delete(gameId);
    this.activity.delete(reviewEventId(gameId));
  }
  async deleteActivity(id: string) {
    this.activity.delete(id);
  }
  async getCurrentGame() {
    return this.current;
  }
  async putCurrentGame(g: CurrentGame | null) {
    this.current = g;
  }
  async getProfile() {
    return this.profile;
  }
  async putProfile(p: Profile) {
    this.profile = p;
  }
  async listActivity() {
    return [...this.activity.values()].sort((a, b) => a.at - b.at);
  }
  async addActivity(e: ActivityEvent) {
    this.activity.set(e.id, e);
  }
  async getAchievements() {
    return this.achievements;
  }
  async putAchievements(s: AchievementState) {
    this.achievements = s;
  }
  async exportAll(): Promise<BackupFile> {
    return buildBackup(this.settings, await this.listGames(), this.current, this.profile, await this.listActivity(), this.achievements, await this.listReviews(), { daily: await this.listDaily(), rush: await this.listRush(), packs: await this.listPacks(), positions: await this.listLearning() }, await this.listAcademy(), await this.listNotebook());
  }
  async importAll(file: unknown) {
    const parsed = parseBackup(file);
    this.settings = parsed.settings;
    for (const g of parsed.games) this.games.set(g.id, g);
    for (const a of parsed.activity) this.activity.set(a.id, a);
    for (const r of parsed.reviews) this.reviews.set(r.gameId, r);
    for (const d of parsed.puzzles.daily) this.daily.set(d.date, this.daily.get(d.date) ?? d);
    for (const r of parsed.puzzles.rush) this.rush.set(r.id, r);
    for (const p of parsed.puzzles.packs) this.packs.set(p.id, p);
    for (const l of parsed.puzzles.positions) this.learning.set(l.id, l);
    for (const a of parsed.academy) this.academy.set(a.id, newerRecord(this.academy.get(a.id), a));
    for (const n of parsed.notebook) this.notebook.set(n.id, newerRecord(this.notebook.get(n.id), n));
    for (const l of parsed.puzzles.positions) {
      const legacy = fromLearningPosition(l);
      if (legacy && !this.notebook.has(legacy.id)) this.notebook.set(legacy.id, legacy);
    }
    if (parsed.currentGame) this.current = parsed.currentGame;
    if (parsed.profile) this.profile = parsed.profile;
    // Unlocks from the file are added to the ones already here; none are ever lost by importing.
    this.achievements = mergeAchievementStates(this.achievements, parsed.achievements);
    return { games: parsed.games.length, activity: parsed.activity.length, achievements: parsed.achievements?.unlocked.length ?? 0 };
  }
  async clearAll() {
    this.achievements = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.games.clear();
    this.activity.clear();
    this.reviews.clear();
    this.daily.clear();
    this.rush.clear();
    this.packs.clear();
    this.learning.clear();
    this.academy.clear();
    this.notebook.clear();
    this.current = null;
    this.profile = null;
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class IdbStore implements Store {
  readonly persistent = true;
  constructor(private readonly db: IDBDatabase) {}

  static open(): Promise<IdbStore> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = req.result;
        const before = ev.oldVersion;
        if (!db.objectStoreNames.contains(GAMES)) db.createObjectStore(GAMES, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
        if (!db.objectStoreNames.contains(ACTIVITY)) db.createObjectStore(ACTIVITY, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(REVIEWS)) db.createObjectStore(REVIEWS, { keyPath: 'gameId' });
        if (!db.objectStoreNames.contains(PZ_DAILY)) db.createObjectStore(PZ_DAILY, { keyPath: 'date' });
        if (!db.objectStoreNames.contains(PZ_RUSH)) db.createObjectStore(PZ_RUSH, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(PZ_PACKS)) db.createObjectStore(PZ_PACKS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(PZ_LEARN)) db.createObjectStore(PZ_LEARN, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(ACADEMY)) db.createObjectStore(ACADEMY, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(NOTEBOOK)) db.createObjectStore(NOTEBOOK, { keyPath: 'id' });
        // Version 6: practice positions saved by Game Review (stores from version 4) are COPIED into the notebook. The originals stay.
        const upgrade = req.transaction;
        if (upgrade && before >= 4 && before < 6 && db.objectStoreNames.contains(PZ_LEARN)) {
          const nb = upgrade.objectStore(NOTEBOOK);
          upgrade.objectStore(PZ_LEARN).openCursor().onsuccess = (e2) => {
            const cur = (e2.target as IDBRequest<IDBCursorWithValue | null>).result;
            if (!cur) return;
            try {
              const entry = fromLearningPosition(cur.value);
              if (entry) nb.add(entry).onerror = (err) => err.preventDefault(); // already there: keep the existing one
            } catch {
              /* a damaged old position is skipped, never blocks the upgrade */
            }
            cur.continue();
          };
        }
      };
      req.onsuccess = () => {
        // If a newer version of the app (in another tab) needs to upgrade the database, let go of it instead of blocking it.
        req.result.onversionchange = () => req.result.close();
        resolve(new IdbStore(req.result));
      };
      req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'));
      req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
    });
  }

  private kvGet(key: string): Promise<unknown> {
    return request(this.db.transaction(KV, 'readonly').objectStore(KV).get(key));
  }
  private async kvPut(key: string, value: unknown): Promise<void> {
    const tx = this.db.transaction(KV, 'readwrite');
    if (value === null) tx.objectStore(KV).delete(key);
    else tx.objectStore(KV).put(value, key);
    await txDone(tx);
  }

  async getSettings(): Promise<Settings> {
    return validateSettings(await this.kvGet('settings'));
  }
  putSettings(s: Settings): Promise<void> {
    return this.kvPut('settings', s);
  }
  async listGames(): Promise<SavedGame[]> {
    const all = (await request(this.db.transaction(GAMES, 'readonly').objectStore(GAMES).getAll())) as unknown[];
    const games: SavedGame[] = [];
    for (const g of all) {
      try {
        games.push(validateGame(g));
      } catch {
        /* skip corrupt rows rather than failing the whole list */
      }
    }
    return games.sort((a, b) => b.createdAt - a.createdAt);
  }
  async getGame(id: string): Promise<SavedGame | undefined> {
    const g = await request(this.db.transaction(GAMES, 'readonly').objectStore(GAMES).get(id));
    return g === undefined ? undefined : validateGame(g);
  }
  async putGame(g: SavedGame): Promise<void> {
    const tx = this.db.transaction(GAMES, 'readwrite');
    tx.objectStore(GAMES).put(g);
    await txDone(tx);
  }
  async deleteGame(id: string): Promise<void> {
    const tx = this.db.transaction([GAMES, REVIEWS, ACTIVITY, PZ_LEARN], 'readwrite');
    tx.objectStore(GAMES).delete(id);
    tx.objectStore(REVIEWS).delete(id);
    tx.objectStore(ACTIVITY).delete(reviewEventId(id));
    const learn = tx.objectStore(PZ_LEARN);
    learn.openCursor().onsuccess = (ev) => {
      const cur = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cur) return;
      if ((cur.value as { gameId?: string }).gameId === id) cur.delete();
      cur.continue();
    };
    await txDone(tx);
  }
  private async all<T>(store: string, validate: (v: unknown) => T): Promise<T[]> {
    const raw = (await request(this.db.transaction(store, 'readonly').objectStore(store).getAll())) as unknown[];
    const out: T[] = [];
    for (const r of raw) {
      try {
        out.push(validate(r));
      } catch {
        /* skip damaged rows */
      }
    }
    return out;
  }
  private async put(store: string, value: unknown): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    await txDone(tx);
  }
  async listDaily(): Promise<DailyRecord[]> {
    return (await this.all(PZ_DAILY, validateDaily)).sort((a, b) => (a.date < b.date ? 1 : -1));
  }
  async getDaily(date: string): Promise<DailyRecord | undefined> {
    const r = await request(this.db.transaction(PZ_DAILY, 'readonly').objectStore(PZ_DAILY).get(date));
    try {
      return r === undefined ? undefined : validateDaily(r);
    } catch {
      return undefined;
    }
  }
  putDaily(r: DailyRecord): Promise<void> {
    return this.put(PZ_DAILY, r);
  }
  async listRush(): Promise<RushScore[]> {
    return (await this.all(PZ_RUSH, validateRush)).sort((a, b) => b.at - a.at);
  }
  putRush(s: RushScore): Promise<void> {
    return this.put(PZ_RUSH, s);
  }
  async listPacks(): Promise<PuzzlePack[]> {
    return this.all(PZ_PACKS, (v) => {
      const c = checkPack(v);
      if (!c.pack) throw new Error(c.error);
      return c.pack;
    });
  }
  putPack(p: PuzzlePack): Promise<void> {
    return this.put(PZ_PACKS, p);
  }
  async deletePack(id: string): Promise<void> {
    const tx = this.db.transaction(PZ_PACKS, 'readwrite');
    tx.objectStore(PZ_PACKS).delete(id);
    await txDone(tx);
  }
  async listLearning(): Promise<LearningPosition[]> {
    return (await this.all(PZ_LEARN, validateLearning)).sort((a, b) => b.createdAt - a.createdAt);
  }
  async getLearning(id: string): Promise<LearningPosition | undefined> {
    const r = await request(this.db.transaction(PZ_LEARN, 'readonly').objectStore(PZ_LEARN).get(id));
    try {
      return r === undefined ? undefined : validateLearning(r);
    } catch {
      return undefined;
    }
  }
  putLearning(l: LearningPosition): Promise<void> {
    return this.put(PZ_LEARN, l);
  }
  async deleteLearning(id: string): Promise<void> {
    const tx = this.db.transaction(PZ_LEARN, 'readwrite');
    tx.objectStore(PZ_LEARN).delete(id);
    await txDone(tx);
  }
  async listAcademy(): Promise<AcademyRecord[]> {
    return this.all(ACADEMY, validateAcademy);
  }
  putAcademy(r: AcademyRecord): Promise<void> {
    return this.put(ACADEMY, r);
  }
  async listNotebook(): Promise<NotebookEntry[]> {
    return this.all(NOTEBOOK, validateNotebook);
  }
  async getNotebook(id: string): Promise<NotebookEntry | undefined> {
    const r = await request(this.db.transaction(NOTEBOOK, 'readonly').objectStore(NOTEBOOK).get(id));
    if (r === undefined) return undefined;
    try {
      return validateNotebook(r);
    } catch {
      return undefined;
    }
  }
  putNotebook(e: NotebookEntry): Promise<void> {
    return this.put(NOTEBOOK, e);
  }
  async deleteNotebook(id: string): Promise<void> {
    const tx = this.db.transaction(NOTEBOOK, 'readwrite');
    tx.objectStore(NOTEBOOK).delete(id);
    await txDone(tx);
  }
  async getReview(gameId: string): Promise<GameReview | undefined> {
    const r = await request(this.db.transaction(REVIEWS, 'readonly').objectStore(REVIEWS).get(gameId));
    if (r === undefined) return undefined;
    try {
      return validateReview(r);
    } catch {
      return undefined; // a damaged review is treated as absent; it can be run again
    }
  }
  async listReviews(): Promise<GameReview[]> {
    const all = (await request(this.db.transaction(REVIEWS, 'readonly').objectStore(REVIEWS).getAll())) as unknown[];
    const out: GameReview[] = [];
    for (const r of all) {
      try {
        out.push(validateReview(r));
      } catch {
        /* skip damaged rows */
      }
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async putReview(r: GameReview): Promise<void> {
    const tx = this.db.transaction(REVIEWS, 'readwrite');
    tx.objectStore(REVIEWS).put(r);
    await txDone(tx);
  }
  async deleteReview(gameId: string): Promise<void> {
    const tx = this.db.transaction([REVIEWS, ACTIVITY], 'readwrite');
    tx.objectStore(REVIEWS).delete(gameId);
    tx.objectStore(ACTIVITY).delete(reviewEventId(gameId));
    await txDone(tx);
  }
  async deleteActivity(id: string): Promise<void> {
    const tx = this.db.transaction(ACTIVITY, 'readwrite');
    tx.objectStore(ACTIVITY).delete(id);
    await txDone(tx);
  }
  async getCurrentGame(): Promise<CurrentGame | null> {
    return validateCurrentGame(await this.kvGet('currentGame'));
  }
  putCurrentGame(g: CurrentGame | null): Promise<void> {
    return this.kvPut('currentGame', g);
  }
  async getProfile(): Promise<Profile | null> {
    return validateProfile(await this.kvGet('profile'));
  }
  putProfile(p: Profile): Promise<void> {
    return this.kvPut('profile', p);
  }
  async listActivity(): Promise<ActivityEvent[]> {
    const all = (await request(this.db.transaction(ACTIVITY, 'readonly').objectStore(ACTIVITY).getAll())) as unknown[];
    const out: ActivityEvent[] = [];
    for (const e of all) {
      try {
        out.push(validateActivity(e));
      } catch {
        /* skip corrupt rows */
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }
  async addActivity(e: ActivityEvent): Promise<void> {
    const tx = this.db.transaction(ACTIVITY, 'readwrite');
    tx.objectStore(ACTIVITY).put(e);
    await txDone(tx);
  }
  async getAchievements(): Promise<AchievementState | null> {
    return validateAchievements(await this.kvGet('achievements'));
  }
  putAchievements(s: AchievementState): Promise<void> {
    return this.kvPut('achievements', s);
  }
  async exportAll(): Promise<BackupFile> {
    return buildBackup(await this.getSettings(), await this.listGames(), await this.getCurrentGame(), await this.getProfile(), await this.listActivity(), await this.getAchievements(), await this.listReviews(), { daily: await this.listDaily(), rush: await this.listRush(), packs: await this.listPacks(), positions: await this.listLearning() }, await this.listAcademy(), await this.listNotebook());
  }
  async importAll(file: unknown): Promise<{ games: number; activity: number; achievements: number }> {
    const parsed = parseBackup(file); // validate everything before writing anything
    const mergedAchievements = mergeAchievementStates(await this.getAchievements(), parsed.achievements);
    // Read before the transaction opens: awaiting inside one would let it commit early.
    const existingDaily = new Set((await this.listDaily()).map((d) => d.date));
    const existingAcademy = new Map((await this.listAcademy()).map((a) => [a.id, a]));
    const existingNotebook = new Map((await this.listNotebook()).map((n) => [n.id, n]));
    const tx = this.db.transaction([GAMES, KV, ACTIVITY, REVIEWS, PZ_DAILY, PZ_RUSH, PZ_PACKS, PZ_LEARN, ACADEMY, NOTEBOOK], 'readwrite');
    const games = tx.objectStore(GAMES);
    for (const g of parsed.games) games.put(g);
    const act = tx.objectStore(ACTIVITY);
    for (const a of parsed.activity) act.put(a);
    const revs = tx.objectStore(REVIEWS);
    for (const r of parsed.reviews) revs.put(r);
    const pz = parsed.puzzles ?? EMPTY_PUZZLE_DATA;
    // A day's puzzle that already exists here keeps its stored choice (the daily puzzle must not change unexpectedly).
    for (const d of pz.daily) if (!existingDaily.has(d.date)) tx.objectStore(PZ_DAILY).put(d);
    for (const r of pz.rush) tx.objectStore(PZ_RUSH).put(r);
    for (const p of pz.packs) tx.objectStore(PZ_PACKS).put(p);
    for (const l of pz.positions) tx.objectStore(PZ_LEARN).put(l);
    // Academy progress merges by `updatedAt`: importing an older backup never overwrites newer progress made here.
    for (const a of parsed.academy) {
      const keep = newerRecord(existingAcademy.get(a.id), a);
      if (keep === a) tx.objectStore(ACADEMY).put(a);
    }
    // Notebook entries merge by `updatedAt`; practice positions from an older backup become entries too, unless the position is already here.
    for (const n of parsed.notebook) {
      const keep = newerRecord(existingNotebook.get(n.id), n);
      if (keep === n) { tx.objectStore(NOTEBOOK).put(n); existingNotebook.set(n.id, n); }
    }
    for (const l of pz.positions) {
      const legacy = fromLearningPosition(l);
      if (legacy && !existingNotebook.has(legacy.id)) { tx.objectStore(NOTEBOOK).put(legacy); existingNotebook.set(legacy.id, legacy); }
    }
    tx.objectStore(KV).put(parsed.settings, 'settings');
    if (parsed.currentGame) tx.objectStore(KV).put(parsed.currentGame, 'currentGame');
    if (parsed.profile) tx.objectStore(KV).put(parsed.profile, 'profile');
    if (mergedAchievements) tx.objectStore(KV).put(mergedAchievements, 'achievements');
    await txDone(tx);
    return { games: parsed.games.length, activity: parsed.activity.length, achievements: parsed.achievements?.unlocked.length ?? 0 };
  }
  async clearAll(): Promise<void> {
    const tx = this.db.transaction([GAMES, KV, ACTIVITY, REVIEWS, PZ_DAILY, PZ_RUSH, PZ_PACKS, PZ_LEARN, ACADEMY, NOTEBOOK], 'readwrite');
    for (const n of [PZ_DAILY, PZ_RUSH, PZ_PACKS, PZ_LEARN, ACADEMY, NOTEBOOK]) tx.objectStore(n).clear();
    tx.objectStore(REVIEWS).clear();
    tx.objectStore(GAMES).clear();
    tx.objectStore(KV).clear();
    tx.objectStore(ACTIVITY).clear();
    await txDone(tx);
  }
}

/** Open persistent storage, falling back to memory (and saying so) if the browser refuses. */
export async function openStore(): Promise<Store> {
  try {
    return await IdbStore.open();
  } catch {
    return new MemoryStore();
  }
}
