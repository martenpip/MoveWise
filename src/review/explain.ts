/**
 * Move explanations at three levels. Every sentence is built from a fact the rules engine or the stored engine
 * lines support (see facts.ts and the tags in analyse.ts). The levels differ in vocabulary and in how much of the
 * evidence is shown, never in what is claimed. When the engine gives no reason that can be verified, the text says
 * what the engine prefers and shows its line instead of inventing an explanation.
 */
import type { PlyAnalysis, ReviewAnalysis } from './analyse';
import { buildLine, describeMove, formatLine, pieceWord, where, type Line, type MoveDetail } from './facts';
import { formatEvalFor, pct, plural, pointsText } from './format';
import type { MoveClass, Side, Tag } from './types';

export type ExplainLevel = 'beginner' | 'intermediate' | 'advanced';
export const EXPLAIN_LEVELS: ReadonlyArray<{ id: ExplainLevel; label: string; hint: string }> = [
  { id: 'beginner', label: 'Beginner', hint: 'Plain words, material in points, no numbers to decode' },
  { id: 'intermediate', label: 'Intermediate', hint: 'Adds evaluations and the engine’s lines' },
  { id: 'advanced', label: 'Advanced', hint: 'Adds win chance, centipawn loss and search depth' },
];

export interface ExplainLine {
  id: 'best' | 'after';
  label: string;
  line: Line;
}

export interface Explanation {
  /** Short title, e.g. "Blunder: Nf6 allows checkmate". */
  headline: string;
  paragraphs: string[];
  /** A general principle, shown only when a verified tag makes it relevant to this move. */
  tip: string | null;
  lines: ExplainLine[];
  /** Which engine said so, and how deeply it looked. */
  engineNote: string;
}

export const CLASS_LABEL: Record<MoveClass, string> = {
  forced: 'Forced move',
  best: 'Best move',
  good: 'Good move',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

export const TAG_LABEL: Record<Tag, string> = {
  'hung-piece': 'Left a piece to be captured',
  'lost-material': 'Lost material',
  'missed-capture': 'Missed a way to win material',
  'missed-mate': 'Missed a forced checkmate',
  'allowed-mate': 'Allowed a forced checkmate',
  'threw-away-advantage': 'Gave away an advantage',
  'found-tactic': 'Found a tactic',
  'found-mate': 'Found the checkmate',
};

/** Weakness tags as phrases for "your most common slip is ...". */
export const TAG_SLIP: Record<Tag, string> = {
  'hung-piece': 'leaving pieces where they can be captured',
  'lost-material': 'losing material in exchanges',
  'missed-capture': 'missing chances to win material',
  'missed-mate': 'missing forced checkmates',
  'allowed-mate': 'allowing a forced checkmate',
  'threw-away-advantage': 'letting a good position slip',
  'found-tactic': 'finding tactics',
  'found-mate': 'finding checkmates',
};

const TIPS: Partial<Record<Tag, string>> = {
  'hung-piece': 'Before you move, ask: after this move, can my opponent capture the piece I moved, and is it protected enough?',
  'lost-material': 'Before you move, count what your opponent can capture afterwards and what you can recapture.',
  'missed-capture': 'Check every capture, check and threat for both sides before settling on a quiet move.',
  'missed-mate': 'Look at every check and capture first. Forcing moves are the quickest way to find a checkmate.',
  'allowed-mate': 'Before you move, look at every check your opponent could give afterwards, especially near your king.',
  'threw-away-advantage': 'When you are ahead, make safe moves and ask what your opponent threatens before you attack.',
};

/** How the review talks about whoever moved. */
function who(p: PlyAnalysis, perspective: Side | null): { Subject: string; subject: string; opp: string; Opp: string } {
  if (perspective === p.color) return { Subject: 'You', subject: 'you', opp: 'your opponent', Opp: 'Your opponent' };
  if (perspective === null) {
    const s = p.color === 'white' ? 'White' : 'Black';
    const o = p.color === 'white' ? 'Black' : 'White';
    return { Subject: s, subject: s, opp: o, Opp: o };
  }
  return { Subject: 'Your opponent', subject: 'your opponent', opp: 'you', Opp: 'You' };
}

const sentence = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

function featureOf(m: MoveDetail): string | null {
  if (m.checkmate) return `${m.san} is checkmate`;
  const bits: string[] = [];
  if (m.captured) bits.push(`captures a ${pieceWord(m.captured)} on ${where(m.to)}`);
  if (m.promotion) bits.push(`promotes to a ${pieceWord(m.promotion)}`);
  if (m.castle) bits.push('castles');
  if (m.check) bits.push('gives check');
  return bits.length ? `${m.san} ${bits.join(' and ')}` : null;
}

/** Explain one move at the chosen level. `perspective` decides whether the text says "you" or a colour. */
export function explainPly(p: PlyAnalysis, level: ExplainLevel, analysis: Pick<ReviewAnalysis, 'engines'>, perspective: Side | null): Explanation {
  const w = who(p, perspective);
  const engine = analysis.engines[p.before.e] ?? 'The engine';
  const depth = Math.min(p.before.depth || 0, p.after.depth || p.before.depth || 0) || Math.max(p.before.depth, p.after.depth);
  const engineNote = p.before.final && p.after.final ? `${engine}.` : `Evaluated by ${engine}${depth ? ` to depth ${depth}` : ''}.`;
  const adv = level === 'advanced';
  const mid = level !== 'beginner';
  const m = p.played;
  const b = p.best;
  const lines: ExplainLine[] = [];
  const paragraphs: string[] = [];

  const replyDetail = p.afterLine.uci[0] ? describeMove(p.fenAfter, p.afterLine.uci[0]) : null;
  const evalShift = `${formatEvalFor(p.before, p.color)} → ${formatEvalFor(p.after, p.color)}`;
  const numbers = (): string =>
    `Evaluation for ${w.subject === 'you' ? 'you' : w.Subject}: ${evalShift}. ` +
    `Win chance ${pct(p.winBefore)} → ${pct(p.winAfter)} (−${p.winLoss.toFixed(1)} points); centipawn loss ${Math.round(p.cpLoss)}.`;

  if (p.cls === 'forced') {
    return { headline: CLASS_LABEL.forced, paragraphs: [`${m.san} was the only legal move, so there was no decision to judge.`], tip: null, lines: [], engineNote };
  }

  if (p.cls === 'best' || p.cls === 'good') {
    const head = p.cls === 'best' ? `Best move: ${m.san}` : `Good move: ${m.san}`;
    if (p.matchedEngine) paragraphs.push(sentence(`${m.san} is the move ${engine} prefers here`));
    else if (p.cls === 'best') paragraphs.push(sentence(`${m.san} is practically as strong as the engine’s choice, ${b?.san ?? 'the top move'}`));
    else paragraphs.push(sentence(`${m.san} keeps the position about as it was. ${b ? `${b.san} was slightly stronger` : 'The engine saw a slightly stronger move'}`));
    if (p.tags.includes('found-mate') && p.mateBefore) {
      paragraphs.push(sentence(`${w.Subject} found a forced checkmate in ${p.mateBefore}`));
    } else if (p.tags.includes('found-tactic')) {
      paragraphs.push(sentence(`Along the engine’s line this wins about ${pointsText(p.materialIfBest)} of material`));
    } else if (mid) {
      const f = b && p.matchedEngine ? featureOf(b) : null;
      if (f) paragraphs.push(sentence(f));
    }
    if (mid && p.matchedEngine && p.bestLine.san.length > 1) {
      lines.push({ id: 'best', label: 'The engine’s line', line: p.bestLine });
    }
    if (adv) paragraphs.push(numbers());
    return { headline: head, paragraphs, tip: null, lines, engineNote };
  }

  /* ----- inaccuracy, mistake, blunder ----- */
  const has = (t: Tag) => p.tags.includes(t);
  const reply = p.afterLine.san[0];
  let headline = `${CLASS_LABEL[p.cls]}: ${m.san}`;
  let tipTag: Tag | null = null;

  if (has('allowed-mate')) {
    const n = Math.abs(p.mateAfter ?? 0);
    headline = `${CLASS_LABEL[p.cls]}: ${m.san} allows checkmate`;
    tipTag = 'allowed-mate';
    paragraphs.push(sentence(`After ${m.san}, ${w.opp} can force checkmate${reply ? `, starting with ${reply}` : ''}`));
    if (mid && n) paragraphs.push(sentence(`${engine} sees a forced mate in ${n}`));
  } else if (has('missed-mate')) {
    const n = p.mateBefore ?? 0;
    headline = `${CLASS_LABEL[p.cls]}: ${m.san} missed a forced checkmate`;
    tipTag = 'missed-mate';
    paragraphs.push(sentence(`${w.Subject} could have forced checkmate in ${n} with ${b?.san ?? 'the engine’s move'}`));
    paragraphs.push(sentence(`After ${m.san} that forced mate is gone`));
  } else if (has('hung-piece') && replyDetail) {
    headline = `${CLASS_LABEL[p.cls]}: ${m.san} leaves the ${pieceWord(m.pieceType)} to be captured`;
    tipTag = 'hung-piece';
    paragraphs.push(sentence(`The ${pieceWord(m.pieceType)} that moved to ${where(m.to)} can be captured by the ${pieceWord(replyDetail.pieceType)} on ${where(replyDetail.from)} (${reply})`));
    paragraphs.push(sentence(`Along the engine’s line ${w.subject} ${w.subject === 'you' ? 'end up' : 'ends up'} ${pointsText(p.materialIfPlayed)} of material behind where ${w.subject === 'you' ? 'you' : 'they'} started`));
  } else if (has('lost-material')) {
    headline = `${CLASS_LABEL[p.cls]}: ${m.san} loses material`;
    tipTag = 'lost-material';
    paragraphs.push(sentence(`The line the engine expects after ${m.san} loses about ${pointsText(p.materialIfPlayed)} of material`));
  } else if (has('missed-capture')) {
    headline = `${CLASS_LABEL[p.cls]}: ${m.san} missed a way to win material`;
    tipTag = 'missed-capture';
    paragraphs.push(sentence(`${b?.san ?? 'The engine’s move'} wins about ${pointsText(p.materialIfBest)} of material along the engine’s line, and ${m.san} does not`));
  } else if (has('threw-away-advantage')) {
    headline = `${CLASS_LABEL[p.cls]}: ${m.san} gives away an advantage`;
    tipTag = 'threw-away-advantage';
    paragraphs.push(sentence(`${w.Subject} had a clear advantage, and after ${m.san} the position is much closer to level`));
  } else {
    paragraphs.push(sentence(`${b ? `${engine} preferred ${b.san}` : 'The engine saw a stronger move'}. ${p.cls === 'inaccuracy' ? 'The difference is fairly small' : 'The difference is large'}`));
  }

  if (has('threw-away-advantage') && tipTag !== 'threw-away-advantage' && mid) {
    paragraphs.push(sentence(`${w.Subject} had a clear advantage before this move and the position is much closer to level after it`));
  }

  if (b && !p.matchedEngine) {
    // The causes above that name the better move already say so; for the others, say it here.
    const stated = has('missed-mate') || has('missed-capture') || tipTag === null;
    if (!stated) paragraphs.push(sentence(`A better move was ${b.san}`));
    const f = mid ? featureOf(b) : null;
    if (f) paragraphs.push(sentence(f));
    lines.push({ id: 'best', label: 'The engine’s choice', line: p.bestLine });
  }
  if (p.afterLine.san.length) lines.push({ id: 'after', label: `After ${m.san}, the engine expects`, line: p.afterLine });

  if (mid) paragraphs.push(sentence(`Evaluation from ${w.subject === 'you' ? 'your' : `${w.Subject}’s`} side: ${evalShift}`));
  if (adv) paragraphs.push(numbers());

  return { headline, paragraphs, tip: tipTag ? (TIPS[tipTag] ?? null) : null, lines, engineNote };
}

/** The same move's lines as one-line strings, for plain-text uses (tests, exports). */
export const lineText = (line: Line, maxPlies = 8): string => formatLine(line, maxPlies);

export { buildLine, plural };
