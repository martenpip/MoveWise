/**
 * The installed puzzle collection: the bundled starter pack (shipped with the app and cached for offline use) plus any packs
 * the player has installed from a file. Nothing is ever downloaded automatically.
 */
import { PACK_FORMAT, PACK_VERSION, BUNDLED_PACK_ID, type PackInfo, type PackPuzzle, type Puzzle, type PuzzlePack } from './types';
import { KEPT_THEMES } from './themes';
import { checkPuzzle, toPuzzle } from './validate';

export interface Library {
  puzzles: Puzzle[];
  byId: Map<string, Puzzle>;
  packs: Array<PackInfo & { count: number; bundled: boolean }>;
  /** Packs that could not be read, with the reason (shown in pack management). */
  problems: string[];
}

export function buildLibrary(packs: Array<{ pack: PuzzlePack; bundled: boolean }>, problems: string[] = []): Library {
  const byId = new Map<string, Puzzle>();
  const infos: Library['packs'] = [];
  for (const { pack, bundled } of packs) {
    let count = 0;
    for (const raw of pack.puzzles) {
      if (byId.has(raw.id)) continue; // the first pack to define an id wins (the bundled one)
      byId.set(raw.id, toPuzzle(raw, pack.id));
      count++;
    }
    const { puzzles: _omit, format: _f, formatVersion: _v, ...info } = pack;
    infos.push({ ...info, count, bundled });
  }
  return { puzzles: [...byId.values()], byId, packs: infos, problems };
}

export interface PackCheck {
  pack: PuzzlePack | null;
  accepted: number;
  rejected: Array<{ id: string; reason: string }>;
  error?: string;
}

/** Validates a pack object from a file: every puzzle must replay on the rules engine. Invalid puzzles are dropped and counted. */
export function checkPack(raw: unknown, maxPuzzles = 100_000): PackCheck {
  const bad = (error: string): PackCheck => ({ pack: null, accepted: 0, rejected: [], error });
  if (typeof raw !== 'object' || raw === null) return bad('This is not a puzzle pack.');
  const r = raw as Record<string, unknown>;
  if (r.format !== PACK_FORMAT) return bad('This file is not a MoveWise puzzle pack.');
  if (typeof r.formatVersion !== 'number' || r.formatVersion > PACK_VERSION) return bad('This pack was made by a newer version of MoveWise.');
  for (const k of ['id', 'name', 'license', 'attribution', 'source']) if (typeof r[k] !== 'string' || !(r[k] as string).trim()) return bad(`The pack is missing "${k}". A pack must say where its puzzles come from and under which licence.`);
  if (!Array.isArray(r.puzzles) || r.puzzles.length === 0) return bad('The pack has no puzzles.');
  if (r.puzzles.length > maxPuzzles) return bad(`The pack has more than ${maxPuzzles} puzzles.`);
  const good: PackPuzzle[] = [];
  const rejected: PackCheck['rejected'] = [];
  const seen = new Set<string>();
  for (const p of r.puzzles as Record<string, unknown>[]) {
    const id = typeof p?.id === 'string' ? p.id : '?';
    if (typeof p?.fen !== 'string' || typeof p?.moves !== 'string' || typeof p?.rating !== 'number' || !Array.isArray(p?.themes) || seen.has(id)) {
      rejected.push({ id, reason: 'malformed or duplicate' });
      continue;
    }
    const themes = (p.themes as unknown[]).filter((t): t is string => typeof t === 'string' && KEPT_THEMES.has(t));
    const c = checkPuzzle({ id, fen: p.fen, moves: p.moves.split(' '), rating: p.rating, themes });
    if (!c.ok) { rejected.push({ id, reason: c.error ?? 'invalid' }); continue; }
    seen.add(id);
    good.push({ id, fen: p.fen, moves: p.moves, rating: Math.round(p.rating), rd: typeof p.rd === 'number' ? p.rd : 100, themes });
  }
  if (!good.length) return { pack: null, accepted: 0, rejected, error: 'No puzzle in the pack passed validation.' };
  const info: PuzzlePack = {
    format: PACK_FORMAT, formatVersion: PACK_VERSION,
    id: String(r.id), name: String(r.name), description: typeof r.description === 'string' ? r.description : '',
    license: String(r.license), attribution: String(r.attribution), source: String(r.source),
    version: typeof r.version === 'number' ? r.version : 1, createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
    puzzles: good,
  };
  return { pack: info, accepted: good.length, rejected };
}

/** Turns a Lichess-format CSV (PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,...) into a pack object for `checkPack`. */
export function csvToPack(text: string, meta: { id: string; name: string; license: string; attribution: string; source: string }): unknown {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0]?.split(',') ?? [];
  const col = (n: string) => head.indexOf(n);
  const [iId, iFen, iMoves, iRating, iRd, iThemes] = ['PuzzleId', 'FEN', 'Moves', 'Rating', 'RatingDeviation', 'Themes'].map(col);
  if ([iId, iFen, iMoves, iRating, iThemes].some((i) => i! < 0)) return null;
  const puzzles = lines.slice(1).map((l) => {
    const c = l.split(',');
    return { id: `${meta.id}:${c[iId!]}`, fen: c[iFen!], moves: c[iMoves!], rating: Number(c[iRating!]), rd: iRd! >= 0 ? Number(c[iRd!]) : 100, themes: (c[iThemes!] ?? '').split(' ').filter(Boolean) };
  });
  return { format: PACK_FORMAT, formatVersion: PACK_VERSION, ...meta, description: `Imported from a CSV file (${puzzles.length} rows).`, version: 1, createdAt: new Date().toISOString().slice(0, 10), puzzles };
}

export const isBundled = (id: string): boolean => id === BUNDLED_PACK_ID;
