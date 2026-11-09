import type { Course } from '../types';
import { boardChapter } from './b1-board';
import { piecesChapter } from './b2-pieces';
import { rulesChapter } from './b3-rules';
import { firstGameChapter } from './b4-first-game';
import { principlesChapter } from './b5-principles';
import { board, choice, empty, mq, sq, tf } from './dsl';

export const beginnerCourse: Course = {
  id: 'beginner', title: 'Chess from zero', level: 'beginner',
  blurb: 'No experience needed. Learn the board, every piece, every rule and the ideas behind good moves.',
  requires: [],
  chapters: [boardChapter, piecesChapter, rulesChapter, firstGameChapter, principlesChapter],
  assessment: [
    sq('ba-1', 'Click the square e3.', empty(), ['e3'], 'File e, rank 3.', { lesson: 'files-ranks' }),
    choice('ba-2', 'How does a pawn capture?', ['One square diagonally forward', 'Straight ahead', 'Sideways'], 0, 'Pawns capture diagonally forward.', { lesson: 'the-pawn' }),
    mq('ba-3', 'Capture the undefended queen.', 'k7/8/4q3/8/3N4/8/8/7K w - - 0 1', ['d4e6'], 'The knight attacks e6.', { lesson: 'the-knight' }),
    mq('ba-4', 'Give checkmate in one move.', '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', ['g1g7'], 'Qg7#, protected by the king.', { lesson: 'checkmate', mate: true }),
    tf('ba-5', 'Stalemate is a win for the player who is not stalemated.', false, 'Stalemate is a draw.', { lesson: 'stalemate' }),
    mq('ba-6', 'Castle kingside.', '4k3/8/8/8/8/8/8/4K2R w K - 0 1', ['e1g1'], 'The king goes to g1, the rook to f1.', { lesson: 'castling', soft: true }),
    mq('ba-7', 'Black has just played d7–d5. Capture en passant.', '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', ['e5d6'], 'Capture as if the pawn had moved one square.', { lesson: 'en-passant' }),
    choice('ba-8', 'In the opening, which should you do?', ['Develop knights and bishops', 'Bring the queen out first', 'Move the same piece repeatedly'], 0, 'Develop your minor pieces.', { lesson: 'develop-minor' }),
    mq('ba-9', 'White threatens Qxf7#. Defend.', 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', ['g7g6', 'd8e7', 'd8f6', 'g8h6'], 'Several moves stop the mate.', { lesson: 'guided-game-2', orientation: 'black' }),
    mq('ba-10', 'The knight attacks your bishop, which is loose. Move it to safety.', '4k3/8/8/2n5/4B3/8/8/4K3 w - - 0 1', ['e4d5', 'e4c2', 'e4b1', 'e4f3', 'e4g2', 'e4h1', 'e4c6', 'e4a8', 'e4f5', 'e4g6', 'e4h7'], 'Any safe square works. The knight covers d3 and b7.', { lesson: 'undefended-pieces', soft: true }),
    sq('ba-11', 'Black’s rook has just moved to a4. Which white piece does it attack?', board('4k3/8/8/8/r2N4/8/8/4K3 w - - 0 1'), ['d4'], 'The rook attacks along the rank.', { lesson: 'spot-threats' }),
    choice('ba-12', 'How many pawns is a rook usually worth?', ['5', '3', '9'], 0, 'About five pawns.', { lesson: 'pieces-together' }),
  ],
};
