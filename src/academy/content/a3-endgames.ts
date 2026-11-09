import type { Chapter, Course } from '../types';
import { ask, board, choice, demo, lesson, move, pq, pz, read, tf } from './dsl';

const L = (l: string) => ({ lesson: l });

/* ----------------------------- king and pawn endings ----------------------------- */

const OPP_B = '8/3k4/8/3K4/3P4/8/8/8 b - - 0 1';
const OPP_W = '8/3k4/8/3K4/3P4/8/8/8 w - - 0 1';

const opposition = lesson(
  'end-opposition', 'Opposition and key squares', 'Pawn endings', 14,
  ['Explain the opposition: kings facing each other with one square between', 'Know that the side to move gives way', 'Use the key squares in front of a pawn'],
  [
    read(['Two kings can never touch, so when they face each other with one square between them, the player who has to move must step aside. The other king then walks forward. This is the opposition.', 'In king and pawn endings the opposition often decides whether the pawn queens or the game is drawn.'], board(OPP_B, { marks: [{ sq: 'd5', tone: 'good' }, { sq: 'd7', tone: 'bad' }] }), 'Kings face to face'),
    ask('opp-black', 'Black to move. White has the opposition. Who is winning?', ['White', 'Black', 'It is a draw'], 0, ['Black must move its king away. What does that allow?'], 'Black has to give way, so the White king steps forward and escorts the pawn. White wins.', { board: board(OPP_B), wrong: { 2: 'It would be a draw if White had to move. Here it is Black who has to give way.' } }),
    ask('opp-white', 'Now it is White to move in the same position. What is the result?', ['A draw', 'White wins', 'Black wins'], 0, ['This time White is the one who must give way.'], 'With White to move, the opposition is Black’s. White cannot make progress and the game is drawn. The side to move loses the opposition.', { board: board(OPP_W), wrong: { 1: 'White would win only if Black were to move.' } }),
    read(['A pawn’s key squares are the squares in front of it. If your king reaches one of them, the pawn queens whoever has the move. For a pawn on d5 with the king on d6, Black cannot stop it.'], board('3k4/8/3K4/3P4/8/8/8/8 w - - 0 1', { marks: [{ sq: 'd6', tone: 'good' }, { sq: 'c6', tone: 'good' }, { sq: 'e6', tone: 'good' }] }), 'Key squares'),
    move('key-step', 'White to move. Take the opposition and keep the king ahead of the pawn.', '3k4/8/3K4/3P4/8/8/8/8 w - - 0 1', ['d6e6'], ['The king is already on a key square. Keep it there and make progress.', 'Step sideways so Black’s king cannot come forward.'], 'The king steps aside, then the pawn advances behind it. Both Ke6 and Kc6 win here.', { alt: ['d6c6'], soft: true }),
    move('opp-gain', 'White to move. Win the opposition with the king, not the pawn. Only one move wins.', '8/1K6/3k4/8/2P5/8/8/8 w - - 0 1', ['b7b6'], ['Push the pawn and Black’s king gets in front of it. Think about where your own king must be.', 'Step to the square from which the king faces Black’s king across the c-file squares.'], 'Kb6 wins. It keeps the king ahead of the pawn and leaves Black without a useful move. Pushing the pawn too soon (c5+) lets Black’s king take the opposition and draw.'),
  ],
  [
    choice('op-1', 'What is the opposition?', ['Kings facing each other with one square between, the side to move must give way', 'Trading queens', 'Castling on opposite sides'], 0, 'The player who has to move loses ground.', L('end-opposition')),
    tf('op-2', 'Kings are allowed to touch.', false, 'Kings may never stand on adjacent squares.', L('end-opposition')),
    choice('op-3', 'The side that must move when kings face each other usually…', ['Gives ground', 'Wins the pawn', 'Takes the opposition'], 0, 'Zugzwang: the player to move has to step aside.', L('end-opposition')),
  ],
  {
    concepts: ['endgame.opposition', 'endgame.key-squares'], puzzleThemes: ['pawnEndgame'], reviewPhases: ['endgame'],
    claims: [{ fen: OPP_B, says: 'white-winning' }, { fen: OPP_W, says: 'equal' }, { fen: '3k4/8/3K4/3P4/8/8/8/8 w - - 0 1', says: 'white-winning' }, { fen: '8/1K6/3k4/8/2P5/8/8/8 w - - 0 1', says: 'white-winning' }],
  },
);

const TRI = '8/8/1k6/4K3/3P4/8/8/8 w - - 0 1';
const triangulation = lesson(
  'end-triangulation', 'Triangulation: losing a tempo', 'Pawn endings', 14,
  ['Explain why the move matters more than the position in a king and pawn ending', 'See that a king can lose a tempo by going round a triangle while the defender cannot', 'Know the limits: it only helps when the defender cannot waste a move as well'],
  [
    read(['In the last lesson the same position was won with Black to move and drawn with White to move. Nothing on the board changed, only whose turn it was. That is the whole idea: sometimes you want a position you could reach with the opponent to move, and a plain king move does not get you there.', 'A king can go the long way round. Two moves would take it from one square to the next, but three moves around a triangle of squares bring it back to where it started with the opponent having used a move. That is triangulation: you pass the move on.'], board(OPP_B, { marks: [{ sq: 'd5', tone: 'good' }, { sq: 'd7', tone: 'bad' }] }), 'The same position, a different side to move'),
    ask('tri-tempo', 'In the position above Black is to move and loses. If it were White to move, what would the result be?', ['A draw', 'White still wins', 'Black wins'], 0, ['The position is the same as in the opposition lesson, only with the other side to move.'], 'A draw. This is why a lost tempo is so valuable: it turns a drawn position into a won one.', { board: board(OPP_B), wrong: { 1: 'White to move has to give way, so the win disappears.' } }),
    demo('A king takes a walk', board(TRI), [
      ['e5d6', 'The White king steps to d6, in front of the pawn.'],
      ['b6b7', 'Black’s king can only shuffle between two squares.'],
      ['d6d5', 'White’s king goes round: d5.'],
      ['b7b8', 'Black shuffles again.'],
      ['d5e5', 'The second corner of the triangle: e5.'],
      ['b8b7', 'Black has only the same two squares.'],
      ['e5d6', 'White is back on d6, with the right side to move. The pawn will go forward behind the king.'],
    ], 'This is the engine’s own line from this position. White would also win by a plain king advance here, so it shows how the manoeuvre works rather than why only it works.'),
    ask('tri-why', 'What does triangulation achieve?', ['It passes the move to the opponent', 'It wins a pawn at once', 'It gives checkmate'], 0, ['Think about whose turn it is when you get back to the same square.'], 'The king takes three moves for what could be done in two, which hands the move over. The idea only works when the defending king cannot waste a tempo too.', { wrong: { 1: 'No pawn is won. The point is whose turn it is.' } }),
    ask('tri-limit', 'When does triangulation fail?', ['When the defender has a spare move, or can triangulate too', 'When the pawn is on the fourth rank', 'When the kings are far apart'], 0, ['If both sides can lose a tempo, nobody gains one.'], 'The defending king must be confined to squares where it can only go back and forth. If it can also walk a triangle, or if there is a spare pawn move, the tempo comes straight back.', { wrong: { 1: 'The rank of the pawn is not the point.' } }),
  ],
  [
    choice('tr-1', 'How many moves does a king need to triangulate?', ['Three', 'One', 'Ten'], 0, 'A king goes round a triangle of squares, three moves, to lose one tempo.', L('end-triangulation')),
    tf('tr-2', 'Triangulation helps you pass the move to the opponent.', true, 'It loses a tempo so that the opponent is the one who must give way.', L('end-triangulation')),
    choice('tr-3', 'Triangulation works best when…', ['The defender cannot lose a tempo as well', 'Both kings are in the corner', 'There are many pieces on the board'], 0, 'If the defender can also triangulate, nothing is gained.', L('end-triangulation')),
  ],
  { concepts: ['endgame.triangulation'], reviewPhases: ['endgame'], claims: [{ fen: TRI, says: 'white-winning' }, { fen: OPP_W, says: 'equal' }] },
);

const passed = lesson(
  'end-passed-pawns', 'Passed pawns and promotion', 'Pawn endings', 14,
  ['Know that a passed pawn has no pawn in front or beside it to stop it', 'Use the king to support the pawn', 'Calculate races to promotion'],
  [
    read(['A passed pawn has no enemy pawns in front of it or on the neighbouring files. It can run to the last rank. The further it has advanced, the more the enemy must worry.', 'In endings, count: can my pawn promote before the other king can catch it?'], undefined, 'Passed pawns'),
    pz('3BTYV', 'pawnEndgame'),
    pz('3DsN2', 'pawnEndgame'),
  ],
  [pq('zwIo0', 'advancedPawn', L('end-passed-pawns')), pq('BAfpK', 'advancedPawn', L('end-passed-pawns')), pq('oqCM6', 'advancedPawn', L('end-passed-pawns'))],
  { puzzleThemes: ['pawnEndgame', 'advancedPawn'], concepts: ['endgame.passed-pawn'], reviewPhases: ['endgame'] },
);

export const endgamePawns: Chapter = {
  id: 'endgame-pawns', title: 'King and pawn endings', blurb: 'Opposition, triangulation and passed pawns.',
  lessons: [opposition, triangulation, passed],
  check: [
    choice('egp-1', 'In the opposition, who must give way?', ['The side to move', 'The side not to move', 'The side with more pawns'], 0, 'The player to move has to step aside.', L('end-opposition')),
    tf('egp-2', 'Triangulation loses a tempo on purpose.', true, 'That is its whole point.', L('end-triangulation')),
    pq('R0fTF', 'pawnEndgame', L('end-passed-pawns')),
    pq('UE3AT', 'advancedPawn', L('end-passed-pawns')),
  ],
};

/* ------------------------------------ rook endings ------------------------------------ */

const LUC = '3K4/3P1k2/8/8/8/8/1r6/4R3 w - - 0 1';
const LUC_AFTER_CHECK = '3K4/3P2k1/8/8/8/8/1r6/5R2 w - - 2 2';
const lucena = lesson(
  'end-lucena', 'The Lucena position', 'Rook endings', 14,
  ['Recognise the Lucena position: a pawn on the 7th, its king on the queening square’s edge, and the enemy king cut off', 'Know that it is a win', 'Know the idea of “building a bridge”'],
  [
    read(['One of the most important rook endings: your pawn is on the seventh rank, your king stands in front of it on the queening square, and the enemy king is cut off by your rook along a file. It is a win, but your own king is in the pawn’s way and must step out without being checked to death.', 'The method is to “build a bridge”: first drive the enemy king one file further away with a check, then bring the rook to the fourth rank. From there it can step in front of the checking rook and shield your king.'], board(LUC, { marks: [{ sq: 'd8', tone: 'good' }, { sq: 'd7', tone: 'good' }, { sq: 'e1', tone: 'good' }] }), 'Lucena'),
    demo('Building the bridge', board(LUC), [
      ['e1f1', 'The rook checks first, driving the enemy king further from the pawn.'],
      ['f7g7', 'The king steps away from the pawn.'],
      ['f1f4', 'The bridge: the rook goes to the fourth rank.'],
      ['b2b1', 'Black waits with a rook move. One possible reply.'],
      ['f4d4', 'The rook now guards the d-file, so the king can step out from d8.'],
      ['g7f6', 'Black brings the king closer.'],
      ['d8c7', 'The king leaves the pawn’s path.'],
      ['b1c1', 'Black checks from the side.'],
      ['c7b6', 'The king walks towards the checking rook.'],
      ['c1b1', 'Black checks again.'],
      ['b6c6', 'Still stepping out, still shielded.'],
      ['b1c1', 'Another check.'],
      ['c6d6', 'Now the king stands next to the rook on d4 and the pawn queens. This is one line against one defence; other Black moves lose in other ways, which is why the engine confirms the position is winning.'],
    ], 'White to move. Black’s rook is on b2 and keeps giving checks; the bridge answers them.'),
    ask('luc-win', 'White has a pawn on d7, king on d8 and a rook, against a rook and a king that is cut off from the pawn. Result with correct play?', ['White wins', 'A draw', 'Black wins'], 0, ['This is the famous Lucena position.'], 'The Lucena position is a win for the side with the pawn, thanks to the bridge.', { board: board(LUC) }),
    move('luc-first', 'White to move. Start the winning plan with a check that pushes the enemy king further away.', LUC, ['e1f1'], ['The king in front of the pawn needs shelter from checks.', 'Check along the f-file.'], 'Rf1+ pushes the Black king one file further away. Next comes Rf4, the bridge. Other first moves also win here, such as Rc1; the point is the plan.', { soft: true }),
    move('luc-bridge', 'Black has stepped to g7. Build the bridge.', LUC_AFTER_CHECK, ['f1f4'], ['The rook goes to the fourth rank.', 'From f4 it can later block a check along the d-file or the rank.'], 'Rf4 is the bridge. From the fourth rank the rook can block the checks that Black will give when the king steps out.', { soft: true }),
  ],
  [
    choice('lu-1', 'The Lucena position is…', ['A win for the side with the pawn', 'A draw', 'A win for the defender'], 0, 'The bridge method wins it.', L('end-lucena')),
    choice('lu-2', 'What does “building a bridge” mean?', ['Putting the rook on the fourth rank to block checks', 'Moving the king far away', 'Trading rooks'], 0, 'The rook on the fourth rank can interpose against the checking rook.', L('end-lucena')),
    tf('lu-3', 'In the Lucena position the pawn is on the seventh rank.', true, 'It is about to queen, but the enemy rook keeps giving checks.', L('end-lucena')),
  ],
  { concepts: ['endgame.lucena', 'endgame.rook'], puzzleThemes: ['rookEndgame'], reviewPhases: ['endgame'], claims: [{ fen: LUC, says: 'white-winning' }, { fen: LUC_AFTER_CHECK, says: 'white-winning' }] },
);

const PHIL = '4k3/8/r7/3PK3/7R/8/8/8 b - - 0 1';
const PHIL_SIXTH = '4k3/8/3P2r1/4K3/7R/8/8/8 b - - 0 2';
const philidor = lesson(
  'end-philidor', 'The Philidor position', 'Rook endings', 14,
  ['Know the defensive setup: the rook on the sixth rank', 'Know that it holds a draw', 'Know what to do when the pawn advances'],
  [
    read(['When you defend a rook ending against a pawn, put your rook on the sixth rank, so the enemy king cannot cross it. Keep your king in front of the pawn.', 'When the pawn advances to the sixth rank, drop the rook to the first rank and give checks from behind. This is the Philidor position, and it is a draw.'], board(PHIL), 'Philidor'),
    ask('phil-result', 'This position, with Black to move, is…', ['A draw', 'A win for White', 'A win for Black'], 0, ['The black rook is on the sixth rank, and the king stands in front of the pawn.'], 'With the rook on the sixth rank and the king on the pawn’s file, Black holds the draw.', { board: board(PHIL), wrong: { 1: 'White cannot make progress: the king cannot step past the rook’s sixth rank.' } }),
    move('phil-checks', 'The pawn has reached the sixth rank. Black to move: send the rook to the first rank, behind the pawn, to prepare checks from behind. Several rook moves hold the draw; this is the standard one.', PHIL_SIXTH, ['g6g1'], ['The rook is no longer needed on the sixth rank. Where can it check from far away?', 'Go to the back rank.'], 'Rg1 (or any safe rook move along the g-file) keeps the rook far from the king and ready to check from behind. The king cannot hide from checks and the pawn cannot advance safely.', { alt: ['g6g2', 'g6g3'], soft: true }),
    ask('phil-plan', 'In the Philidor defence, where should the defender’s rook stay while the pawn is on the fifth rank?', ['On the sixth rank', 'On the first rank', 'Far away on the side'], 0, ['Keep the enemy king from advancing.'], 'The rook cuts the king off along the sixth rank. When the pawn reaches the sixth, switch to checks from behind.', { wrong: { 1: 'That is the plan once the pawn reaches the sixth rank, not before.' } }),
  ],
  [
    choice('ph-1', 'The Philidor position is…', ['A draw', 'A win for the attacker', 'Always a win for the defender'], 0, 'Correct defence holds the draw.', L('end-philidor')),
    choice('ph-2', 'The defender’s rook starts on which rank?', ['The sixth', 'The first', 'The fifth'], 0, 'The sixth rank keeps the king from advancing.', L('end-philidor')),
    tf('ph-3', 'The defender should check from behind when the pawn reaches the sixth rank.', true, 'The checks from behind drive the king away.', L('end-philidor')),
  ],
  { concepts: ['endgame.philidor', 'endgame.rook'], reviewPhases: ['endgame'], claims: [{ fen: PHIL, says: 'equal' }, { fen: PHIL_SIXTH, says: 'equal' }] },
);

const rookEndings = lesson(
  'end-rook-endings', 'Rook endings: active rooks', 'Rook endings', 14,
  ['Know the rules of thumb: rooks belong behind passed pawns, and an active rook beats a passive one', 'Cut the enemy king off', 'Use checks with a purpose'],
  [
    read(['Rook endings are the most common endings. Three rules of thumb help: put your rook behind a passed pawn (yours or theirs), keep your rook active rather than defending, and cut the enemy king off from the action.', 'A pawn down with an active rook is often better than a passive rook that holds the material.'], undefined, 'Rules of thumb'),
    ask('rook-behind', 'Where should a rook usually stand relative to a passed pawn?', ['Behind it', 'In front of it', 'Next to the king'], 0, ['The rook gets more scope as the pawn advances.'], 'Behind the pawn the rook defends it, and the pawn’s advance gives the rook more space. In front of it the rook gets pushed back.'),
    pz('KdWra', 'rookEndgame'),
    pz('XOZ9m', 'rookEndgame'),
  ],
  [pq('4mM6S', 'rookEndgame', L('end-rook-endings')), pq('Fv3jS', 'rookEndgame', L('end-rook-endings')), pq('Nrl2l', 'rookEndgame', L('end-rook-endings'))],
  { puzzleThemes: ['rookEndgame'], concepts: ['endgame.rook'], reviewPhases: ['endgame'] },
);

export const endgameRooks: Chapter = {
  id: 'endgame-rooks', title: 'Rook endings', blurb: 'Lucena, Philidor and the rules of thumb for rooks.',
  lessons: [lucena, philidor, rookEndings],
  check: [
    choice('er-1', 'Which position is a win thanks to the bridge?', ['Lucena', 'Philidor', 'Stalemate'], 0, 'The bridge is the winning method in the Lucena position.', L('end-lucena')),
    choice('er-2', 'Which position is a drawing defence for the weaker side?', ['Philidor', 'Lucena', 'The bridge'], 0, 'The Philidor setup holds the draw.', L('end-philidor')),
    choice('er-3', 'Where does a rook usually belong in relation to a passed pawn?', ['Behind it', 'In front of it', 'Anywhere'], 0, 'Behind the pawn.', L('end-rook-endings')),
    pq('fLYK4', 'rookEndgame', L('end-rook-endings')),
  ],
};

/* ------------------------------ minor pieces, queens, conversion ------------------------------ */

const bishops = lesson(
  'end-bishops', 'Bishop endings', 'Minor-piece endings', 12,
  ['Know that bishops of opposite colours often draw', 'Keep pawns off the bishop’s colour', 'Find tactics in bishop endings'],
  [
    read(['Bishop endings are about colour. A bishop can only ever reach squares of its own colour, so pawns on the opposite colour are safe from it and pawns on the same colour can be attacked.', 'When each side has a bishop of a different colour, the ending is often a draw even a pawn or two down, because neither bishop can attack the other’s pawns.'], undefined, 'Colour matters'),
    ask('endbishop-colour', 'A bishop can only move on…', ['Squares of one colour', 'Both colours', 'Dark squares only'], 0, ['Every diagonal stays on the same colour.'], 'A bishop stays on its starting colour for the whole game.', { wrong: { 2: 'A light-squared bishop only reaches light squares.' } }),
    pz('9aiUr', 'bishopEndgame'),
    pz('qPXYv', 'bishopEndgame'),
  ],
  [pq('R55E0', 'bishopEndgame', L('end-bishops')), pq('aZ8d3', 'bishopEndgame', L('end-bishops')), pq('MHYch', 'bishopEndgame', L('end-bishops'))],
  { puzzleThemes: ['bishopEndgame'], concepts: ['endgame.bishop'], reviewPhases: ['endgame'] },
);

const knights = lesson(
  'end-knights', 'Knight endings', 'Minor-piece endings', 12,
  ['Know that knights are short-range and need the king close', 'Use the knight to fork and to stop pawns', 'Recognise how like king and pawn endings they are'],
  [
    read(['Knight endings resemble pawn endings: the knight is slow, so the king and the pawns matter most. A knight is best near the action, and a knight on the edge is weak.', 'Look for forks and for ways to block a passed pawn on the square in front of it.'], undefined, 'Short-range pieces'),
    ask('knight-edge', 'In endings, where is the knight usually best?', ['Close to the pawns and the king', 'On the edge of the board', 'Far from the action'], 0, ['It can only jump short distances.'], 'The knight needs to be near the action. On the edge it controls few squares.', { wrong: { 1: 'A knight on the edge controls fewer squares.' } }),
    pz('7zqIz', 'knightEndgame'),
    pz('s1UVf', 'knightEndgame'),
  ],
  [pq('c7f3q', 'knightEndgame', L('end-knights')), pq('XQgI0', 'knightEndgame', L('end-knights')), pq('iVeVH', 'knightEndgame', L('end-knights'))],
  { puzzleThemes: ['knightEndgame'], concepts: ['endgame.knight'], reviewPhases: ['endgame'] },
);

const queens = lesson(
  'end-queens', 'Queen endings', 'Minor-piece endings', 12,
  ['Know that checks matter most in queen endings', 'Know that a passed pawn is strong but perpetual check is a danger', 'Calculate checks'],
  [
    read(['Queen endings are full of checks. A king in the open can be harassed by perpetual check, so a pawn advantage often is not enough, and a passed pawn becomes strong only if its king is safe.', 'Before pushing a pawn, check whether the opponent has a perpetual.'], undefined, 'Checks'),
    ask('queen-perp', 'In queen endings, what must you check before pushing a passed pawn?', ['Whether the opponent has a perpetual check', 'Whether the rooks are traded', 'Whether bishops are on the board'], 0, ['Open kings are vulnerable.'], 'A queen can give check forever if your king is exposed. Make sure it has cover before the pawn goes forward.'),
    pz('c9OjR', 'queenEndgame'),
    pz('1apEZ', 'queenEndgame'),
  ],
  [pq('7yoiw', 'queenEndgame', L('end-queens')), pq('KiqGK', 'queenEndgame', L('end-queens')), pq('3GROw', 'queenEndgame', L('end-queens'))],
  { puzzleThemes: ['queenEndgame'], concepts: ['endgame.queen'], reviewPhases: ['endgame'] },
);

const conversion = lesson(
  'end-conversion', 'Converting an advantage', 'Technique', 14,
  ['Know the steps: keep it simple, trade pieces not pawns, make a passed pawn', 'Activate your king in the ending', 'Promote the pawn'],
  [
    read(['A won position still has to be won. Steps: keep it simple (trade pieces when you are ahead, and avoid trading pawns), bring your king to the centre, create a passed pawn, then push it with the king’s help.', 'Do not rush. Check what the opponent can do with each of your moves.'], undefined, 'A checklist'),
    ask('convert-trade', 'You are a piece up. What is the usual approach?', ['Trade pieces, not pawns', 'Trade pawns, not pieces', 'Avoid all trades'], 0, ['Fewer enemy pieces means fewer chances for them.'], 'Trading pieces simplifies toward a won ending. Trading pawns keeps fewer pawns for you to promote with.', { wrong: { 1: 'With fewer pawns on the board your advantage may be too small to win.' } }),
    pz('HSuTc', 'promotion'),
    pz('leQ9A', 'promotion'),
  ],
  [pq('SeWgv', 'promotion', L('end-conversion')), pq('talZb', 'promotion', L('end-conversion')), pq('6LWep', 'promotion', L('end-conversion'))],
  { puzzleThemes: ['promotion', 'advancedPawn'], concepts: ['endgame.conversion'], reviewPhases: ['endgame'], reviewTags: ['threw-away-advantage'] },
);

export const endgameMinor: Chapter = {
  id: 'endgame-minor', title: 'Bishops, knights, queens and technique', blurb: 'The other endings, and how to turn an advantage into a win.',
  lessons: [bishops, knights, queens, conversion],
  check: [
    pq('Fv0c2', 'bishopEndgame', L('end-bishops')),
    pq('4ouwq', 'knightEndgame', L('end-knights')),
    pq('ooz0C', 'queenEndgame', L('end-queens')),
    pq('aa9pO', 'promotion', L('end-conversion')),
    choice('em-1', 'A bishop can reach…', ['Only squares of its own colour', 'Any square', 'Only the edge'], 0, 'Colour is fixed.', L('end-bishops')),
    tf('em-2', 'When ahead in material, trading pieces usually helps you.', true, 'Fewer enemy pieces means fewer counter-chances.', L('end-conversion')),
  ],
};

export const endgameCourse: Course = {
  id: 'endgames', title: 'Endgame theory', level: 'advanced',
  blurb: 'The ideas behind king and pawn endings, the great rook endings, the other pieces, and how to convert an advantage.',
  requires: ['tactics'],
  chapters: [endgamePawns, endgameRooks, endgameMinor],
  assessment: [
    choice('eg-a1', 'In the opposition, who must give way?', ['The side to move', 'The side not to move', 'Black'], 0, 'The player to move.', L('end-opposition')),
    choice('eg-a2', 'Which famous position is won by “building a bridge”?', ['Lucena', 'Philidor', 'Opposition'], 0, 'The bridge wins the Lucena position.', L('end-lucena')),
    choice('eg-a3', 'The Philidor defender’s rook stands on…', ['The sixth rank', 'The first rank', 'The fifth rank'], 0, 'To keep the king back.', L('end-philidor')),
    tf('eg-a4', 'Triangulation loses a tempo on purpose.', true, 'That is its point.', L('end-triangulation')),
    choice('eg-a5', 'Where should a rook usually stand relative to a passed pawn?', ['Behind it', 'In front of it', 'Next to the king'], 0, 'Behind.', L('end-rook-endings')),
    tf('eg-a6', 'A bishop can change colour.', false, 'Never.', L('end-bishops')),
    pq('R27jO', 'rookEndgame', L('end-rook-endings')),
    pq('fMw51', 'queenEndgame', L('end-queens')),
    pq('Ck6yo', 'knightEndgame', L('end-knights')),
    pq('aXW45', 'bishopEndgame', L('end-bishops')),
  ],
};
