// Authoring helper: FEN (and a drawing) after SAN moves from a start FEN. `npx tsx scripts/fen-after.mts "e4 e5 Nf3" ["<fen>"]`
import { Position } from '../src/chess/position';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const [san, fen = START] = process.argv.slice(2);
const p = new Position(fen);
const out: string[] = [];
for (const s of (san ?? '').split(/\s+/).filter((x) => x && !/\d+\./.test(x))) {
  const m = p.legalMoves().find((mv) => p.toSan(mv).replace(/[+#]/g, '') === s.replace(/[+#]/g, ''));
  if (m === undefined) { console.log('ILLEGAL', s, 'after', out.join(' ')); process.exit(1); }
  const uci = (p as any).moveToUci ? (p as any).moveToUci(m) : '';
  out.push(s + (uci ? `(${uci})` : ''));
  p.makeMove(m);
}
console.log(p.toFen());
p.toFen().split(' ')[0]!.split('/').forEach((row, i) => console.log(`${8 - i} ` + [...row].map((c) => (/\d/.test(c) ? '. '.repeat(Number(c)) : c + ' ')).join('')));
console.log('  a b c d e f g h\n' + out.join(' '));
