import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, type Achievement } from '../../profile/achievements';
import { AchievementBadge } from '../AchievementBadge';
import { formatDate } from '../shared';

type Filter = 'all' | 'earned' | 'locked';

/** `#/profile?achievement=id` (from an unlock notification) opens that achievement's details. */
function idFromHash(): string | null {
  const q = location.hash.split('?')[1];
  return q ? new URLSearchParams(q).get('achievement') : null;
}

const progressText = (a: Achievement): string => {
  const { current, target, unit } = a.progress;
  return `${current} / ${target}${unit ? ` ${unit}` : ''}`;
};
const percent = (a: Achievement): number => Math.floor(a.progress.pct * 100);

function ProgressBar({ a }: { a: Achievement }) {
  const p = percent(a);
  return (
    <div className="ach-progress">
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={`${a.title} progress`}>
        <span style={{ width: `${p}%` }} />
      </div>
      <span className="small">{progressText(a)}</span>
    </div>
  );
}

function Card({ a, onOpen }: { a: Achievement; onOpen: (id: string, el: HTMLElement) => void }) {
  const inactive = !a.available && !a.earned;
  return (
    <li>
      <button type="button" className={`ach-card ${a.earned ? 'earned' : 'locked'} ${inactive ? 'inactive' : ''}`} onClick={(e) => onOpen(a.id, e.currentTarget)} data-achievement={a.id}>
        <AchievementBadge motif={a.icon} rarity={a.rarity} unlocked={a.earned} size={56} />
        <span className="ach-text">
          <b>{a.title}</b>
          <span className="muted small">{a.description}</span>
          {a.earned ? (
            <span className="small ach-date">Unlocked{a.earnedAt ? ` ${formatDate(a.earnedAt)}` : ''}</span>
          ) : inactive ? (
            <span className="small muted">Not available yet: {a.unavailableReason}</span>
          ) : (
            <ProgressBar a={a} />
          )}
        </span>
      </button>
    </li>
  );
}

function Detail({ a, onClose }: { a: Achievement; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const inactive = !a.available && !a.earned;
  return (
    <div className="ach-backdrop" onClick={onClose}>
      <div className="ach-dialog" role="dialog" aria-modal="true" aria-labelledby="ach-d-title" onClick={(e) => e.stopPropagation()}>
        <AchievementBadge motif={a.icon} rarity={a.rarity} unlocked={a.earned} size={96} />
        <h3 id="ach-d-title">{a.title}</h3>
        <p className="muted">{a.description}</p>
        <dl className="kv">
          <dt>How to earn it</dt>
          <dd>{a.condition}</dd>
          <dt>Status</dt>
          <dd>{a.earned ? `Unlocked${a.earnedAt ? ` on ${formatDate(a.earnedAt)}` : ''}` : inactive ? 'Not available yet' : 'Locked'}</dd>
          <dt>Rarity</dt>
          <dd style={{ textTransform: 'capitalize' }}>{a.rarity}</dd>
          {!inactive && (
            <>
              <dt>Progress</dt>
              <dd>
                {a.earned ? 'Complete' : `${percent(a)}% complete`}
                {!a.earned && <ProgressBar a={a} />}
                {!a.earned && a.progress.detail && <div className="muted small">{a.progress.detail}</div>}
              </dd>
            </>
          )}
          {inactive && (
            <>
              <dt>Why not yet</dt>
              <dd>{a.unavailableReason} It will start counting as soon as that feature exists; nothing is missed in the meantime except what the feature itself would record.</dd>
            </>
          )}
        </dl>
        <div className="btn-row">
          <button ref={closeRef} type="button" className="btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function AchievementsSection({ achievements }: { achievements: Achievement[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(idFromHash);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const on = () => {
      const id = idFromHash();
      if (id) setOpenId(id);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    if (openId && !opener.current) document.getElementById('h-ach')?.scrollIntoView({ block: 'start' });
  }, [openId]);

  const close = () => {
    setOpenId(null);
    // Drop the query so the dialog does not reopen on reload, and put focus back where it came from.
    if (idFromHash()) history.replaceState(null, '', location.hash.split('?')[0]);
    opener.current?.focus();
    opener.current = null;
  };

  const active = achievements.filter((a) => a.available || a.earned);
  const earned = active.filter((a) => a.earned).length;
  const open = achievements.find((a) => a.id === openId) ?? null;
  const shows = (a: Achievement) => (filter === 'all' ? true : filter === 'earned' ? a.earned : !a.earned);

  return (
    <section className="card" aria-labelledby="h-ach">
      <div className="ach-head">
        <div>
          <h2 id="h-ach">Achievements</h2>
          <p className="muted small" aria-live="polite">
            {earned} of {active.length} unlocked · {Math.round((earned / Math.max(1, active.length)) * 100)}% complete. Each one comes from something you actually did.
          </p>
        </div>
        <div className="seg" role="group" aria-label="Show achievements">
          {(['all', 'earned', 'locked'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'earned' ? 'Unlocked' : 'Locked'}
            </button>
          ))}
        </div>
      </div>
      {CATEGORIES.map((cat) => {
        const inCat = achievements.filter((a) => a.category === cat.id);
        const list = inCat.filter(shows);
        if (!list.length) return null;
        const got = inCat.filter((a) => a.earned).length;
        const live = inCat.filter((a) => a.available || a.earned).length;
        return (
          <div key={cat.id} className="ach-cat">
            <h3>
              {cat.title}{' '}
              <span className="muted small">
                {live ? `${got} of ${live} unlocked` : 'Not available yet'}
              </span>
            </h3>
            <ul className="ach-list">
              {list.map((a) => (
                <Card
                  key={a.id}
                  a={a}
                  onOpen={(id, el) => {
                    opener.current = el;
                    setOpenId(id);
                  }}
                />
              ))}
            </ul>
          </div>
        );
      })}
      {open && <Detail a={open} onClose={close} />}
    </section>
  );
}
