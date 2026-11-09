/**
 * Opening recognition: a small table of well-known opening lines (SAN from the standard start position).
 * The longest line that matches the start of a game names its opening. This is deliberately a short, readable
 * table, not a full ECO database: games that leave it early are reported as "Other / unrecognised".
 * Every line is replayed and checked for legality by tests/profile.test.ts.
 */
import { Position } from '../chess/position';
import { START_FEN, moveToUci } from '../chess/types';

const LINES: Array<[string, string]> = [
  ['e4', "King's Pawn Opening"],
  ['e4 e5', "King's Pawn Game"],
  ['e4 e5 Nf3', "King's Knight Opening"],
  ['e4 e5 Nf3 Nc6', "King's Knight Opening: …Nc6"],
  ['e4 e5 Nf3 Nc6 Bb5', 'Ruy Lopez'],
  ['e4 e5 Nf3 Nc6 Bb5 a6', 'Ruy Lopez: Morphy Defense'],
  ['e4 e5 Nf3 Nc6 Bb5 Nf6', 'Ruy Lopez: Berlin Defense'],
  ['e4 e5 Nf3 Nc6 Bc4', 'Italian Game'],
  ['e4 e5 Nf3 Nc6 Bc4 Bc5', 'Italian Game: Giuoco Piano'],
  ['e4 e5 Nf3 Nc6 Bc4 Nf6', 'Italian Game: Two Knights Defense'],
  ['e4 e5 Nf3 Nc6 d4', 'Scotch Game'],
  ['e4 e5 Nf3 Nc6 Nc3 Nf6', 'Four Knights Game'],
  ['e4 e5 Nf3 Nf6', "Petrov's Defense"],
  ['e4 e5 Nf3 d6', 'Philidor Defense'],
  ['e4 e5 f4', "King's Gambit"],
  ['e4 e5 Nc3', 'Vienna Game'],
  ['e4 e5 Bc4', "Bishop's Opening"],
  ['e4 e5 d4', 'Center Game'],
  ['e4 c5', 'Sicilian Defense'],
  ['e4 c5 Nf3', 'Sicilian Defense: Open'],
  ['e4 c5 c3', 'Sicilian Defense: Alapin'],
  ['e4 c5 Nc3', 'Sicilian Defense: Closed'],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', 'Sicilian Defense: Najdorf'],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', 'Sicilian Defense: Dragon'],
  ['e4 e6', 'French Defense'],
  ['e4 e6 d4 d5', 'French Defense: Main line'],
  ['e4 c6', 'Caro-Kann Defense'],
  ['e4 c6 d4 d5', 'Caro-Kann Defense: Main line'],
  ['e4 d5', 'Scandinavian Defense'],
  ['e4 d6', 'Pirc / Modern Setup'],
  ['e4 g6', 'Modern Defense'],
  ['e4 Nf6', "Alekhine's Defense"],
  ['d4', "Queen's Pawn Opening"],
  ['d4 d5', "Queen's Pawn Game"],
  ['d4 d5 c4', "Queen's Gambit"],
  ['d4 d5 c4 e6', "Queen's Gambit Declined"],
  ['d4 d5 c4 dxc4', "Queen's Gambit Accepted"],
  ['d4 d5 c4 c6', 'Slav Defense'],
  ['d4 d5 Nf3 Nf6 Bf4', 'London System'],
  ['d4 Nf6 Nf3 d5 Bf4', 'London System'],
  ['d4 Nf6', 'Indian Defense'],
  ['d4 Nf6 Bg5', 'Trompowsky Attack'],
  ['d4 Nf6 c4 g6', 'Indian Defense: Fianchetto'],
  ['d4 Nf6 c4 g6 Nc3 Bg7', "King's Indian Defense"],
  ['d4 Nf6 c4 g6 Nc3 d5', 'Grünfeld Defense'],
  ['d4 Nf6 c4 e6 Nc3 Bb4', 'Nimzo-Indian Defense'],
  ['d4 Nf6 c4 e6 Nf3 b6', "Queen's Indian Defense"],
  ['d4 f5', 'Dutch Defense'],
  ['c4', 'English Opening'],
  ['Nf3', 'Réti / Zukertort Opening'],
  ['Nf3 d5 c4', 'Réti Opening'],
  ['f4', "Bird's Opening"],
  ['b3', 'Nimzowitsch-Larsen Attack'],
  ['b4', 'Polish Opening'],
  ['g3', "King's Fianchetto Opening"],
];

export interface OpeningLine {
  name: string;
  san: string;
  uci: string[];
}

function toUci(san: string): string[] {
  const pos = new Position(START_FEN);
  const out: string[] = [];
  for (const tok of san.split(' ')) {
    const m = pos.parseSan(tok);
    if (m === undefined) throw new Error(`Opening table: illegal move "${tok}" in "${san}"`);
    out.push(moveToUci(m));
    pos.makeMove(m);
  }
  return out;
}

export const OPENING_LINES: OpeningLine[] = LINES.map(([san, name]) => ({ san, name, uci: toUci(san) })).sort(
  (a, b) => b.uci.length - a.uci.length,
);

/** Name of the opening, or null if the game does not begin with any line in the table. Only games from the standard start position can match. */
export function identifyOpening(startFen: string, uciMoves: string[]): OpeningLine | null {
  if (startFen.split(' ').slice(0, 4).join(' ') !== START_FEN.split(' ').slice(0, 4).join(' ')) return null;
  for (const line of OPENING_LINES) {
    if (line.uci.length > uciMoves.length) continue;
    if (line.uci.every((m, i) => uciMoves[i] === m)) return line;
  }
  return null;
}
