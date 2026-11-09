import { useEffect, useMemo, useState } from 'react';
import { autoEntries, entryFromPly, entryIdFor, type GameInfo } from '../../notebook/capture';
import { saveFromReview, saveMove } from '../../notebook/service';
import type { ReviewAnalysis } from '../../review/analyse';
import type { SavedGame } from '../../storage/types';
import { useApp } from '../app';

const infoOf = (g: SavedGame): GameInfo => ({ gameId: g.id, white: g.white, black: g.black, playedAt: g.createdAt });

/** Ids of the Notebook entries that already exist, so the buttons can say what has been saved. */
function useSaved(): Set<string> {
  const { store, dataVersion } = useApp();
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    store.listNotebook().then((l) => live && setIds(new Set(l.map((e) => e.id)))).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, dataVersion]);
  return ids;
}

/** Button in the move panel: saves this position to the Notebook by hand, whatever its verdict. */
export function SaveMoveToNotebook({ analysis, ply, game }: { analysis: ReviewAnalysis; ply: number; game: SavedGame }) {
  const { store, notifyDataChanged, toast } = useApp();
  const saved = useSaved();
  const p = analysis.plies.find((x) => x.ply === ply);
  const entry = useMemo(() => (p ? entryFromPly(analysis, p, infoOf(game), 0, true) : null), [analysis, p, game]);
  if (!p || !entry) return null;
  const has = saved.has(entry.id) || saved.has(entryIdFor(p.fenBefore));
  return (
    <div className="rv-line-card" data-testid="save-to-notebook">
      <div className="muted small">Mistake Notebook</div>
      <p style={{ margin: '4px 0' }}>
        {has
          ? 'This position is in your Notebook. It will come back as an exercise on a spaced schedule.'
          : 'Save this position to practise it later: you will be asked to find the best move, with hints if you need them.'}
      </p>
      <div className="btn-row">
        {!has && (
          <button
            className="btn small primary"
            type="button"
            onClick={async () => {
              try {
                const r = await saveMove(store, analysis, ply, infoOf(game));
                if (!r) toast('This position cannot be practised: there is no better move to find.', 'info');
                else {
                  notifyDataChanged();
                  toast('Saved to your Notebook.', 'ok');
                }
              } catch {
                toast('This could not be saved on this device.', 'error');
              }
            }}
          >
            Save to Notebook
          </button>
        )}
        <a className="btn small" href="#/notebook">{has ? 'Open the Notebook' : 'See the Notebook'}</a>
      </div>
    </div>
  );
}

/** Summary card: which mistakes from this game qualify for the Notebook, whether they were saved, and a way to save them now. */
export function NotebookSummary({ analysis, game }: { analysis: ReviewAnalysis; game: SavedGame }) {
  const { store, settings, notifyDataChanged, toast } = useApp();
  const saved = useSaved();
  const candidates = useMemo(() => autoEntries(analysis, infoOf(game), 0), [analysis, game]);
  if (!analysis.perspective) return null;
  const inBook = candidates.filter((c) => saved.has(c.id)).length;
  const missing = candidates.length - inBook;
  return (
    <section className="card" aria-labelledby="h-rv-notebook" data-testid="notebook-summary">
      <h2 id="h-rv-notebook" style={{ marginTop: 0 }}>Mistake Notebook</h2>
      {candidates.length === 0 ? (
        <p>No clear mistakes from your side met the saving rules in this game, so nothing was added. Slight inaccuracies are not saved automatically. You can still save any move by hand from the Move tab.</p>
      ) : (
        <p>
          {candidates.length} {candidates.length === 1 ? 'mistake' : 'mistakes'} from your side {candidates.length === 1 ? 'was' : 'were'} worth practising. {inBook} {inBook === 1 ? 'is' : 'are'} in your Notebook
          {settings.notebook.autoSave ? '; positions are saved automatically when a review finishes.' : '. Automatic saving is switched off.'}
        </p>
      )}
      <div className="btn-row">
        {missing > 0 && (
          <button
            className="btn primary"
            type="button"
            onClick={async () => {
              try {
                await saveFromReview(store, analysis, infoOf(game));
                notifyDataChanged();
                toast('Saved to your Notebook.', 'ok');
              } catch {
                toast('This could not be saved on this device.', 'error');
              }
            }}
          >
            Save {missing === 1 ? 'it' : `these ${missing}`} to the Notebook
          </button>
        )}
        <a className="btn" href="#/notebook">Open the Notebook</a>
      </div>
    </section>
  );
}
