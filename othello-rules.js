// othello-rules.js — 黑白棋（Othello / 翻轉棋）純規則邏輯（無 DOM，可單元測試）。
//
// 棋子落在「格子內」（非交叉點）。起手中央 4 子斜放；黑先。落子需沿 8 方向夾住
// 至少一段對方子才合法，夾住的全翻成己方色。無合法手則 pass；雙方皆無手即終局。
// 座標沿用全專案慣例 board[row][col]（row 由上而下、col 由左而右）。
import { EMPTY, BLACK, WHITE, createBoard, opponent, inBounds } from './rules.js';

export const SIZE = 8;

// 8 個方向：上、下、左、右、四對角。
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

/** 起始盤：中央 (m-1,m-1)=白、(m-1,m)=黑、(m,m-1)=黑、(m,m)=白。 */
export function newBoard(size = SIZE) {
  const b = createBoard(size);
  const m = size / 2;
  b[m - 1][m - 1] = WHITE; b[m - 1][m] = BLACK;
  b[m][m - 1] = BLACK; b[m][m] = WHITE;
  return b;
}

/** 在 (r,c) 落 player 子會翻掉的對方子座標陣列（空陣列 = 非法手）。 */
export function flips(board, size, r, c, player) {
  if (!inBounds(size, r, c) || board[r][c] !== EMPTY) return [];
  const opp = opponent(player);
  const out = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let nr = r + dr, nc = c + dc;
    while (inBounds(size, nr, nc) && board[nr][nc] === opp) { line.push([nr, nc]); nr += dr; nc += dc; }
    // 線尾須是己方子（且中間至少夾到一個對方子）才成立
    if (line.length && inBounds(size, nr, nc) && board[nr][nc] === player) out.push(...line);
  }
  return out;
}

/** player 的所有合法手 [[r,c],...]。 */
export function legalMoves(board, size, player) {
  const moves = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === EMPTY && flips(board, size, r, c, player).length) moves.push([r, c]);
    }
  }
  return moves;
}

/** player 是否有合法手。 */
export function hasLegalMove(board, size, player) {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === EMPTY && flips(board, size, r, c, player).length) return true;
    }
  }
  return false;
}

/**
 * 套用一手（就地修改 board）。
 * @returns {Array<[number,number]>} 翻掉的子座標（空 = 非法手、不改動）。
 */
export function applyMove(board, size, r, c, player) {
  const fl = flips(board, size, r, c, player);
  if (!fl.length) return [];
  board[r][c] = player;
  for (const [fr, fc] of fl) board[fr][fc] = player;
  return fl;
}

/** 黑白子數。 */
export function score(board, size) {
  let black = 0, white = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === BLACK) black++;
      else if (board[r][c] === WHITE) white++;
    }
  }
  return { black, white };
}

/** 終局：雙方皆無合法手。 */
export function isGameOver(board, size) {
  return !hasLegalMove(board, size, BLACK) && !hasLegalMove(board, size, WHITE);
}

export const OthelloRules = { SIZE, newBoard, flips, legalMoves, hasLegalMove, applyMove, score, isGameOver };
