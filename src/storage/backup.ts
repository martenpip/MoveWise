import { sanitizeSoundPrefs } from '../audio/kinds';
import type { AchievementState } from '../profile/achievementTypes';
import { normaliseState } from '../profile/achievements';
import { AVATAR_COLORS, AVATAR_PIECES, MAX_NAME_LENGTH, DEFAULT_NAME, PUZZLE_MODES, type ActivityEvent, type Profile, type PuzzleMode } from '../profile/types';
import { MATE_CP, MAX_PV_PLIES, REVIEW_VERSION, type GameReview, type PositionEval } from '../review/types';
import { checkPuzzle } from '../puzzles/validate';
import { checkPack } from '../puzzles/library';
import type { DailyRecord } from '../puzzles/daily';
import type { LearningPosition } from '../puzzles/learn';
import type { AcademyRecord } from '../academy/types';
import { HISTORY_LIMIT, GRADES, type NotebookEntry } from '../notebook/types';
import { DEFAULT_TRAINER_PREFS, type TrainerPrefs } from '../trainer/types';
import { RUSH_MINUTES, type RushScore } from '../puzzles/rush';
import { BACKUP_VERSION, BOARD_THEMES, DEFAULT_SETTINGS, type BackupFile, type CurrentGame, type SavedGame, type PuzzleData, type Settings } from './types';

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function validateGame(v: unknown): SavedGame {
  if (!isObj(v)) throw new Error('Game entry is not an object');
  const { id, createdAt, white, black, startFen, uciMoves, result } = v;
  if (typeof id !== 'string' || !id) throw new Error('Game is missing an id');
  if (typeof createdAt !== 'number') throw new Error('Game is missing a date');
  if (typeof startFen !== 'string') throw new Error('Game is missing a start position');
  if (!Array.isArray(uciMoves) || !uciMoves.every((m) => typeof m === 'string'))
    throw new Error('Game moves are malformed');
  if (typeof result !== 'string' || !RESULTS.has(result)) throw new Error('Game result is malformed');
  return {
    id,
    createdAt,
    white: typeof white === 'string' ? white : 'White',
    black: typeof black === 'string' ? black : 'Black',
    human: v.human === 'white' || v.human === 'black' ? v.human : null,
    botLevel: typeof v.botLevel === 'string' ? v.botLevel : null,
    botPersonality: typeof v.botPersonality === 'string' ? v.botPersonality : null,
    startFen,
    uciMoves: uciMoves as string[],
    result: result as SavedGame['result'],
    reason: typeof v.reason === 'string' ? v.reason : null,
    source: v.source === 'imported' ? 'imported' : 'played',
    takebacks: typeof v.takebacks === 'number' && v.takebacks > 0 ? Math.floor(v.takebacks) : 0,
    ...(v.mode === 'trainer' ? { mode: 'trainer' as const } : {}),
  };
}

export function validateTrainer(v: unknown): TrainerPrefs {
  const d = DEFAULT_TRAINER_PREFS;
  if (!isObj(v)) return d;
  return {
    speech: typeof v.speech === 'boolean' ? v.speech : d.speech,
    voiceGender: v.voiceGender === 'male' || v.voiceGender === 'female' ? v.voiceGender : d.voiceGender,
    voiceURI: typeof v.voiceURI === 'string' && v.voiceURI.length <= 300 ? v.voiceURI : null,
    volume: typeof v.volume === 'number' && Number.isFinite(v.volume) ? Math.min(1, Math.max(0, v.volume)) : d.volume,
    warnings: typeof v.warnings === 'boolean' ? v.warnings : d.warnings,
    detail: v.detail === 'concise' || v.detail === 'beginner' ? v.detail : d.detail,
  };
}

export function validateSettings(v: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!isObj(v)) return d;
  const bot = isObj(v.bot) ? v.bot : {};
  return {
    theme: v.theme === 'dark' || v.theme === 'light' || v.theme === 'system' ? v.theme : d.theme,
    boardTheme: BOARD_THEMES.find((t) => t === v.boardTheme) ?? d.boardTheme,
    sound: sanitizeSoundPrefs(v.sound),
    showLegalMoves: typeof v.showLegalMoves === 'boolean' ? v.showLegalMoves : d.showLegalMoves,
    showEvalBar: typeof v.showEvalBar === 'boolean' ? v.showEvalBar : d.showEvalBar,
    haptics: typeof v.haptics === 'boolean' ? v.haptics : d.haptics,
    bot: {
      level: typeof bot.level === 'string' ? bot.level : d.bot.level,
      personality: typeof bot.personality === 'string' ? bot.personality : d.bot.personality,
      color: bot.color === 'white' || bot.color === 'black' || bot.color === 'random' ? bot.color : d.bot.color,
    },
    notebook: {
      autoSave: isObj(v.notebook) && typeof v.notebook.autoSave === 'boolean' ? v.notebook.autoSave : d.notebook.autoSave,
    },
    trainer: validateTrainer(v.trainer),
  };
}

export function validateCurrentGame(v: unknown): CurrentGame | null {
  if (!isObj(v)) return null;
  if (typeof v.startFen !== 'string' || !Array.isArray(v.uciMoves)) return null;
  if (v.human !== 'white' && v.human !== 'black') return null;
  return {
    startFen: v.startFen,
    uciMoves: v.uciMoves.filter((m): m is string => typeof m === 'string'),
    human: v.human,
    botLevel: typeof v.botLevel === 'string' ? v.botLevel : 'casual',
    botPersonality: typeof v.botPersonality === 'string' ? v.botPersonality : 'balanced',
    resigned: v.resigned === 'white' || v.resigned === 'black' ? v.resigned : null,
    takebacks: typeof v.takebacks === 'number' && v.takebacks > 0 ? Math.floor(v.takebacks) : 0,
    ...(v.mode === 'trainer' ? { mode: 'trainer' as const } : {}),
    updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : Date.now(),
  };
}

const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Clean a display name: strip control characters, collapse whitespace, clip the length. Never returns an empty name. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_NAME;
  // eslint-disable-next-line no-control-regex
  const t = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trim();
  return t || DEFAULT_NAME;
}

export function validateProfile(v: unknown): Profile | null {
  if (!isObj(v)) return null;
  const av = isObj(v.avatar) ? v.avatar : {};
  return {
    displayName: cleanName(v.displayName),
    avatar: {
      kind: av.kind === 'piece' ? 'piece' : 'initials',
      color: AVATAR_COLORS.find((c) => c === av.color) ?? 'gold',
      piece: AVATAR_PIECES.find((p) => p === av.piece) ?? 'knight',
    },
    startedAt: finite(v.startedAt, Date.now()),
    ratingEpoch: Math.max(0, finite(v.ratingEpoch, 0)),
  };
}

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function validateActivity(v: unknown): ActivityEvent {
  if (!isObj(v)) throw new Error('Activity entry is not an object');
  if (typeof v.id !== 'string' || !v.id) throw new Error('Activity entry is missing an id');
  const at = finite(v.at, NaN);
  if (!Number.isFinite(at)) throw new Error('Activity entry is missing a date');
  if (v.kind === 'puzzle') {
    return {
      id: v.id, kind: 'puzzle', at,
      puzzleId: typeof v.puzzleId === 'string' ? v.puzzleId : '',
      puzzleRating: finite(v.puzzleRating, 1500),
      solved: v.solved === true,
      timeMs: Math.max(0, finite(v.timeMs, 0)),
      hintsUsed: Math.max(0, finite(v.hintsUsed, 0)),
      themes: strArr(v.themes),
      ...(typeof v.puzzleRd === 'number' && Number.isFinite(v.puzzleRd) ? { puzzleRd: v.puzzleRd } : {}),
      ...(typeof v.mode === 'string' && PUZZLE_MODES.includes(v.mode as PuzzleMode) ? { mode: v.mode as PuzzleMode } : {}),
      ...(typeof v.rated === 'boolean' ? { rated: v.rated } : {}),
      ...(typeof v.wrongMoves === 'number' && v.wrongMoves >= 0 ? { wrongMoves: Math.floor(v.wrongMoves) } : {}),
      ...(typeof v.usedSolution === 'boolean' ? { usedSolution: v.usedSolution } : {}),
      ...(typeof v.retrySolved === 'boolean' ? { retrySolved: v.retrySolved } : {}),
    };
  }
  if (v.kind === 'lesson') {
    return {
      id: v.id, kind: 'lesson', at,
      lessonId: typeof v.lessonId === 'string' ? v.lessonId : '',
      topic: typeof v.topic === 'string' ? v.topic : '',
      completed: v.completed === true,
      score: typeof v.score === 'number' && v.score >= 0 && v.score <= 1 ? v.score : null,
      ...(v.assessment === 'chapter' || v.assessment === 'course' ? { assessment: v.assessment } : {}),
      ...(typeof v.passed === 'boolean' ? { passed: v.passed } : {}),
    };
  }
  if (v.kind === 'review') {
    const ph = isObj(v.phaseAcpl) ? v.phaseAcpl : {};
    const opt = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    return {
      id: v.id, kind: 'review', at,
      gameId: typeof v.gameId === 'string' ? v.gameId : '',
      acpl: Math.max(0, finite(v.acpl, 0)),
      accuracy: Math.min(100, Math.max(0, finite(v.accuracy, 0))),
      inaccuracies: Math.max(0, finite(v.inaccuracies, 0)),
      mistakes: Math.max(0, finite(v.mistakes, 0)),
      blunders: Math.max(0, finite(v.blunders, 0)),
      missedTactics: Math.max(0, finite(v.missedTactics, 0)),
      phaseAcpl: { opening: opt(ph.opening), middlegame: opt(ph.middlegame), endgame: opt(ph.endgame) },
      weaknesses: strArr(v.weaknesses),
    };
  }
  throw new Error('Activity entry has an unknown kind');
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const uciList = (v: unknown, max: number): string[] | null =>
  Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && x.length >= 4 && x.length <= 5) ? (v as string[]) : null;

function validatePositionEval(v: unknown, engineCount: number): PositionEval | null {
  if (v === null) return null;
  if (!isObj(v)) throw new Error('Review position is not an object');
  const cp = v.cp;
  if (typeof cp !== 'number' || !Number.isFinite(cp) || Math.abs(cp) > MATE_CP) throw new Error('Review position has a bad score');
  const mate = v.mate === null ? null : isInt(v.mate) && v.mate !== 0 ? v.mate : undefined;
  if (mate === undefined) throw new Error('Review position has a bad mate distance');
  const pv = uciList(v.pv, MAX_PV_PLIES);
  if (!pv) throw new Error('Review position has a bad line');
  const best = v.best === '' ? '' : typeof v.best === 'string' && v.best.length >= 4 && v.best.length <= 5 ? v.best : null;
  if (best === null) throw new Error('Review position has a bad best move');
  if (typeof v.depth !== 'number' || !Number.isFinite(v.depth) || v.depth < 0 || v.depth > 200) throw new Error('Review position has a bad depth');
  if (!isInt(v.e) || v.e < 0 || v.e >= engineCount) throw new Error('Review position names an unknown engine');
  return { cp, mate, best, pv, depth: v.depth, e: v.e, ...(v.final === true ? { final: true as const } : {}) };
}

/** A stored Game Review. Throws if anything is structurally wrong; a review is never "repaired" into something it was not. */
export function validateReview(v: unknown): GameReview {
  if (!isObj(v)) throw new Error('Review is not an object');
  if (v.version !== REVIEW_VERSION) throw new Error('Unsupported review version');
  if (typeof v.gameId !== 'string' || !v.gameId) throw new Error('Review has no game id');
  if (typeof v.startFen !== 'string' || !v.startFen) throw new Error('Review has no start position');
  const moves = uciList(v.moves, 1500);
  if (!moves) throw new Error('Review has a bad move list');
  if (!Array.isArray(v.engines) || v.engines.length > 8 || !v.engines.every((e) => typeof e === 'string' && e.length > 0 && e.length <= 60)) throw new Error('Review has a bad engine list');
  const engines = v.engines as string[];
  const st = v.settings;
  if (!isObj(st) || !(st.preset === 'quick' || st.preset === 'standard' || st.preset === 'thorough')) throw new Error('Review has bad settings');
  const movetimeMs = finite(st.movetimeMs, NaN);
  const depth = finite(st.depth, NaN);
  if (!(movetimeMs >= 50 && movetimeMs <= 120_000) || !(depth >= 1 && depth <= 99)) throw new Error('Review has bad settings');
  if (!Array.isArray(v.positions) || v.positions.length !== moves.length + 1) throw new Error('Review does not match its game');
  const positions = v.positions.map((p) => validatePositionEval(p, engines.length));
  const complete = v.complete === true;
  if (complete && positions.some((p) => p === null)) throw new Error('Review claims to be complete but is not');
  const perspective = v.perspective === 'white' || v.perspective === 'black' ? v.perspective : null;
  const createdAt = finite(v.createdAt, NaN);
  if (!Number.isFinite(createdAt)) throw new Error('Review has no date');
  return {
    version: REVIEW_VERSION,
    gameId: v.gameId,
    createdAt,
    updatedAt: finite(v.updatedAt, createdAt),
    startFen: v.startFen,
    moves,
    engines,
    settings: { preset: st.preset, movetimeMs, depth },
    positions,
    complete,
    perspective,
  };
}

export interface ParsedBackup {
  settings: Settings;
  games: SavedGame[];
  currentGame: CurrentGame | null;
  profile: Profile | null;
  activity: ActivityEvent[];
  achievements: AchievementState | null;
  reviews: GameReview[];
  puzzles: PuzzleData;
  academy: AcademyRecord[];
  notebook: NotebookEntry[];
}

const MAX_ACHIEVEMENT_RECORDS = 500;

/** Stored achievement unlocks. Anything malformed is dropped rather than trusted; null means "not set up". */
export function validateDaily(v: unknown): DailyRecord {
  if (!isObj(v) || typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || typeof v.puzzleId !== 'string' || !v.puzzleId) throw new Error('Daily puzzle record is invalid');
  return {
    date: v.date, puzzleId: v.puzzleId, targetRating: finite(v.targetRating, 1000), pickedAt: finite(v.pickedAt, 0),
    ...(typeof v.solvedAt === 'number' && Number.isFinite(v.solvedAt) ? { solvedAt: v.solvedAt } : {}),
    ...(typeof v.clean === 'boolean' ? { clean: v.clean } : {}),
  };
}

export function validateRush(v: unknown): RushScore {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || !(RUSH_MINUTES as readonly number[]).includes(v.minutes as number)) throw new Error('Rush score is invalid');
  return { id: v.id, at: finite(v.at, 0), minutes: v.minutes as RushScore['minutes'], solved: Math.max(0, Math.floor(finite(v.solved, 0))), strikes: Math.max(0, Math.floor(finite(v.strikes, 0))), best: finite(v.best, 0) };
}

export function validateLearning(v: unknown): LearningPosition {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || typeof v.gameId !== 'string' || typeof v.fen !== 'string' || !Array.isArray(v.moves)) throw new Error('Learning position is invalid');
  const moves = v.moves.filter((m): m is string => typeof m === 'string');
  const c = checkPuzzle({ id: v.id, fen: v.fen, moves, rating: 1500, themes: [] });
  if (!c.ok) throw new Error(`Learning position is invalid: ${c.error}`);
  const mv = (x: unknown) => (isObj(x) && typeof x.uci === 'string' && typeof x.san === 'string' ? { uci: x.uci, san: x.san } : { uci: '', san: '' });
  return {
    id: v.id, gameId: v.gameId, ply: Math.max(0, Math.floor(finite(v.ply, 0))), createdAt: finite(v.createdAt, 0), scored: v.scored === true,
    moves, fen: v.fen, played: mv(v.played), best: mv(v.best), engine: typeof v.engine === 'string' ? v.engine : '', winLoss: finite(v.winLoss, 0), tags: strArr(v.tags),
    themes: Array.isArray(v.themes) ? v.themes.filter(isObj).map((t) => ({ theme: String(t.theme ?? ''), reason: String(t.reason ?? '') })).filter((t) => t.theme) : [],
    tries: Math.max(0, Math.floor(finite(v.tries, 0))),
    ...(typeof v.lastTriedAt === 'number' ? { lastTriedAt: v.lastTriedAt } : {}),
    ...(typeof v.solvedAt === 'number' ? { solvedAt: v.solvedAt } : {}),
  };
}

/** Puzzle data from a file: anything that does not validate is dropped (and a pack that fails entirely is skipped), the rest imports. */
export function parsePuzzleData(raw: unknown): PuzzleData {
  const out: PuzzleData = { daily: [], rush: [], packs: [], positions: [] };
  if (!isObj(raw)) return out;
  const each = <T>(list: unknown, f: (x: unknown) => T, sink: T[]) => {
    if (!Array.isArray(list)) return;
    for (const x of list) {
      try {
        sink.push(f(x));
      } catch {
        /* skip */
      }
    }
  };
  each(raw.daily, validateDaily, out.daily);
  each(raw.rush, validateRush, out.rush);
  each(raw.positions, validateLearning, out.positions);
  each(raw.packs, (p) => {
    const c = checkPack(p);
    if (!c.pack) throw new Error(c.error);
    return c.pack;
  }, out.packs);
  return out;
}

const LEVELS = ['new', 'rules', 'regular', 'advanced'];
const attempt = (a: unknown) => {
  if (!isObj(a)) return null;
  const correct = strArr(a.correct);
  const total = Math.max(0, Math.floor(finite(a.total, 0)));
  if (!total) return null;
  return { at: finite(a.at, 0), total, correct, score: Math.min(1, Math.max(0, finite(a.score, correct.length / total))) };
};
const attempts = (v: unknown) => (Array.isArray(v) ? v.map(attempt).filter((x): x is NonNullable<ReturnType<typeof attempt>> => x !== null).slice(-50) : []);

/** One Academy progress record. Throws if it is not one; anything unreadable inside it is dropped. */
export function validateAcademy(v: unknown): AcademyRecord {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || v.id.length > 120) throw new Error('Academy record is invalid');
  const updatedAt = finite(v.updatedAt, 0);
  if (v.kind === 'lesson' && typeof v.lessonId === 'string' && v.id === `lesson:${v.lessonId}`) {
    const exercises: Record<string, { attempts: number; solved: boolean; clean: boolean; hints: number }> = {};
    if (isObj(v.exercises)) {
      for (const [k, e] of Object.entries(v.exercises)) {
        if (!isObj(e) || k.length > 80) continue;
        exercises[k] = { attempts: Math.max(0, Math.floor(finite(e.attempts, 0))), solved: e.solved === true, clean: e.clean === true, hints: Math.max(0, Math.floor(finite(e.hints, 0))) };
      }
    }
    return {
      id: v.id, kind: 'lesson', lessonId: v.lessonId, startedAt: finite(v.startedAt, updatedAt), updatedAt, step: Math.max(0, Math.floor(finite(v.step, 0))),
      exercises, checks: attempts(v.checks), missed: strArr(v.missed),
      ...(typeof v.completedAt === 'number' && Number.isFinite(v.completedAt) ? { completedAt: v.completedAt } : {}),
    };
  }
  if (v.kind === 'assessment' && typeof v.assessmentId === 'string' && v.id === `assess:${v.assessmentId}` && (v.scope === 'chapter' || v.scope === 'course')) {
    return {
      id: v.id, kind: 'assessment', assessmentId: v.assessmentId, scope: v.scope, startedAt: finite(v.startedAt, updatedAt), updatedAt, attempts: attempts(v.attempts),
      ...(v.placed === true ? { placed: true } : {}),
      ...(typeof v.passedAt === 'number' && Number.isFinite(v.passedAt) ? { passedAt: v.passedAt } : {}),
    };
  }
  if (v.kind === 'meta' && v.id === 'meta') {
    return {
      id: 'meta', kind: 'meta', updatedAt, opened: strArr(v.opened).slice(0, 40),
      ...(typeof v.level === 'string' && LEVELS.includes(v.level) ? { level: v.level as 'new' | 'rules' | 'regular' | 'advanced' } : {}),
      ...(typeof v.lastLessonId === 'string' && v.lastLessonId.length <= 80 ? { lastLessonId: v.lastLessonId } : {}),
    };
  }
  throw new Error('Academy record is invalid');
}

/** Academy records from a file: any that do not validate are dropped, the rest import. */
export function parseAcademy(raw: unknown): AcademyRecord[] {
  const out: AcademyRecord[] = [];
  if (!Array.isArray(raw)) return out;
  for (const r of raw) {
    try {
      out.push(validateAcademy(r));
    } catch {
      /* skip */
    }
  }
  return out;
}

const SIDES = ['white', 'black'] as const;
const KINDS = ['blunder', 'mistake', 'inaccuracy', 'missed-mate', 'missed-tactic', 'hung-piece', 'allowed-mate', 'manual'] as const;
const SEVERITIES = ['blunder', 'mistake', 'inaccuracy', 'manual'] as const;
const str = (v: unknown, max: number, fallback = ''): string => (typeof v === 'string' ? v.slice(0, max) : fallback);
const optNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const uciOk = (v: unknown): v is string => typeof v === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(v);

/** One Mistake Notebook entry. Throws if it is not one; schedule numbers are clamped rather than trusted. */
export function validateNotebook(v: unknown): NotebookEntry {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id.startsWith('nb:') || v.id.length > 120 || typeof v.fen !== 'string' || v.fen.length > 100) throw new Error('Notebook entry is invalid');
  if (v.id !== `nb:${v.fen.split(' ').slice(0, 4).join(' ')}`) throw new Error('Notebook entry id does not match its position');
  if (!SIDES.includes(v.sideToMove as 'white')) throw new Error('Notebook entry is invalid');
  const best = v.best;
  if (!isObj(best) || !uciOk(best.uci) || typeof best.san !== 'string') throw new Error('Notebook entry has no best move');
  const played = isObj(v.played) && uciOk(v.played.uci) ? { uci: v.played.uci, san: str(v.played.san, 20) } : null;
  const prev = isObj(v.previous) && uciOk(v.previous.uci) && typeof v.previous.fen === 'string' ? { fen: v.previous.fen.slice(0, 100), uci: v.previous.uci } : null;
  const s = isObj(v.srs) ? v.srs : {};
  const grade = (g: unknown) => (GRADES.includes(g as 'good') ? (g as 'good') : null);
  const history = Array.isArray(s.history)
    ? s.history.flatMap((h) => (isObj(h) && grade(h.grade) && typeof h.at === 'number' && Number.isFinite(h.at) ? [{ at: h.at, grade: grade(h.grade)! }] : [])).slice(-HISTORY_LIMIT)
    : [];
  const o = isObj(v.origin) ? v.origin : {};
  const savedAt = finite(v.savedAt, 0);
  return {
    id: v.id, fen: v.fen, sideToMove: v.sideToMove as 'white' | 'black',
    moveNumber: Math.max(1, Math.floor(finite(v.moveNumber, 1))), previous: prev, played,
    best: { uci: best.uci, san: str(best.san, 20), line: Array.isArray(best.line) ? best.line.filter(uciOk).slice(0, 12) : [best.uci], lineSan: str(best.lineSan, 300) },
    alternatives: Array.isArray(v.alternatives) ? v.alternatives.filter(uciOk).slice(0, 12) : [],
    evalBefore: optNum(v.evalBefore), evalAfter: optNum(v.evalAfter), winLoss: optNum(v.winLoss), cpLoss: optNum(v.cpLoss),
    severity: SEVERITIES.includes(v.severity as 'blunder') ? (v.severity as NotebookEntry['severity']) : 'mistake',
    kind: KINDS.includes(v.kind as 'blunder') ? (v.kind as NotebookEntry['kind']) : 'mistake',
    explanation: str(v.explanation, 1200), themes: strArr(v.themes).slice(0, 12), tags: strArr(v.tags).slice(0, 12),
    phase: v.phase === 'opening' || v.phase === 'middlegame' || v.phase === 'endgame' ? v.phase : null,
    origin: { gameId: typeof o.gameId === 'string' ? o.gameId.slice(0, 80) : null, ply: optNum(o.ply), label: str(o.label, 160, 'A saved position'), opponent: typeof o.opponent === 'string' ? o.opponent.slice(0, 80) : null, playedAt: optNum(o.playedAt) },
    occurrences: Array.isArray(v.occurrences)
      ? v.occurrences.flatMap((x) => (isObj(x) ? [{ gameId: typeof x.gameId === 'string' ? x.gameId.slice(0, 80) : null, ply: optNum(x.ply), uci: uciOk(x.uci) ? x.uci : null, at: finite(x.at, 0) }] : [])).slice(0, 50)
      : [],
    engine: str(v.engine, 60), savedAt, updatedAt: finite(v.updatedAt, savedAt),
    srs: {
      reps: Math.max(0, Math.floor(finite(s.reps, 0))), lapses: Math.max(0, Math.floor(finite(s.lapses, 0))),
      ease: Math.min(3, Math.max(1.3, finite(s.ease, 2.5))), intervalDays: Math.min(365, Math.max(0, Math.floor(finite(s.intervalDays, 0)))),
      due: finite(s.due, savedAt), lastReviewed: optNum(s.lastReviewed), attempts: Math.max(0, Math.floor(finite(s.attempts, 0))), lastGrade: grade(s.lastGrade), history,
    },
  };
}

/** Notebook entries from a file: any that do not validate are dropped, the rest import. */
export function parseNotebook(raw: unknown): NotebookEntry[] {
  const out: NotebookEntry[] = [];
  if (!Array.isArray(raw)) return out;
  for (const r of raw) {
    try {
      out.push(validateNotebook(r));
    } catch {
      /* skip */
    }
  }
  return out;
}

/** Newer record wins; on a tie the one already here is kept. */
export const newerRecord = <T extends { updatedAt: number }>(have: T | undefined, incoming: T): T => (have && have.updatedAt >= incoming.updatedAt ? have : incoming);

export function validateAchievements(v: unknown): AchievementState | null {
  if (!isObj(v) || !Array.isArray(v.unlocked)) return null;
  const unlocked = v.unlocked
    .filter((r): r is Record<string, unknown> => isObj(r))
    .filter((r) => typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 64 && typeof r.unlockedAt === 'number' && Number.isFinite(r.unlockedAt))
    .slice(0, MAX_ACHIEVEMENT_RECORDS)
    .map((r) => ({
      id: r.id as string,
      unlockedAt: r.unlockedAt as number,
      recordedAt: typeof r.recordedAt === 'number' && Number.isFinite(r.recordedAt) ? r.recordedAt : (r.unlockedAt as number),
    }));
  const initialisedAt = typeof v.initialisedAt === 'number' && Number.isFinite(v.initialisedAt) ? v.initialisedAt : Date.now();
  return normaliseState({ version: 1, initialisedAt, unlocked });
}

/** Parse and validate a backup file (version 1, 2 or 3). Throws a readable error; never partially applies. */
export function parseBackup(raw: unknown): ParsedBackup {
  if (!isObj(raw) || raw.app !== 'MoveWise') throw new Error('This is not a MoveWise backup file');
  if (raw.version !== 1 && raw.version !== 2 && raw.version !== 3) throw new Error(`Unsupported backup version: ${String(raw.version)}`);
  if (!Array.isArray(raw.games)) throw new Error('Backup has no games list');
  const games = raw.games.map((g, i) => {
    try {
      return validateGame(g);
    } catch (e) {
      throw new Error(`Game ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  const activityRaw = Array.isArray(raw.activity) ? raw.activity : [];
  const activity = activityRaw.map((a, i) => {
    try {
      return validateActivity(a);
    } catch (e) {
      throw new Error(`Activity record ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  // Reviews are derived data: one that does not validate is dropped (it can be run again), the rest of the file still imports.
  const reviews: GameReview[] = [];
  if (Array.isArray(raw.reviews)) {
    for (const r of raw.reviews) {
      try {
        reviews.push(validateReview(r));
      } catch {
        /* skip */
      }
    }
  }
  return {
    settings: validateSettings(raw.settings),
    reviews,
    games,
    currentGame: validateCurrentGame(raw.currentGame),
    profile: validateProfile(raw.profile),
    activity,
    achievements: validateAchievements(raw.achievements),
    puzzles: parsePuzzleData(raw.puzzles),
    academy: parseAcademy(raw.academy),
    notebook: parseNotebook(raw.notebook),
  };
}

export function buildBackup(
  settings: Settings,
  games: SavedGame[],
  currentGame: CurrentGame | null,
  profile: Profile | null,
  activity: ActivityEvent[],
  achievements: AchievementState | null = null,
  reviews: GameReview[] = [],
  puzzles: PuzzleData | null = null,
  academy: AcademyRecord[] = [],
  notebook: NotebookEntry[] = [],
): BackupFile {
  return {
    app: 'MoveWise',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    games,
    currentGame,
    profile,
    activity,
    achievements,
    ...(reviews.length ? { reviews } : {}),
    ...(academy.length ? { academy } : {}),
    ...(notebook.length ? { notebook } : {}),
    ...(puzzles && (puzzles.daily.length || puzzles.rush.length || puzzles.packs.length || puzzles.positions.length) ? { puzzles } : {}),
  };
}
