// gomoku-rules.js — 五子棋純規則邏輯（無 DOM，可單元測試）。
//
// 與圍棋完全獨立：無提子、無氣、無劫、無禁手（自由五子棋）。唯一合法性條件是
// 「界內 + 該點為空」；勝負在落子當下以「同色連成 5 子（含以上）」判定。
// 重用 rules.js 的盤面常數與基礎工具，座標沿用全專案慣例 board[row][col]
// （row 由上而下、col 由左而右）。
import { EMPTY, createBoard, inBounds } from './rules.js';

export const SIZE = 15;     // 標準五子棋盤
export const WIN_LEN = 5;   // 連 5 子勝

// 四個掃描方向：水平、垂直、主對角(↘)、副對角(↙)。
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

/** 建立空棋盤（重用 rules.createBoard）。 */
export function newBoard(size = SIZE) {
  return createBoard(size);
}

/** 是否可在 (r,c) 落子：界內且為空。 */
export function canPlace(board, size, r, c) {
  return inBounds(size, r, c) && board[r][c] === EMPTY;
}

/**
 * 以剛落下的 (r,c)（已是 player 的子）為中心，檢查是否連成 5 子以上。
 * @returns {{ won:boolean, line:Array<[number,number]> }}  line 為勝利連線（含端點），供渲染高亮。
 */
export function checkWin(board, size, r, c, player) {
  if (!inBounds(size, r, c) || board[r][c] !== player) return { won: false, line: [] };
  for (const [dr, dc] of DIRS) {
    const cells = [[r, c]];
    // 正向延伸
    let nr = r + dr, nc = c + dc;
    while (inBounds(size, nr, nc) && board[nr][nc] === player) { cells.push([nr, nc]); nr += dr; nc += dc; }
    // 反向延伸（插在前面，保持線的順序）
    nr = r - dr; nc = c - dc;
    while (inBounds(size, nr, nc) && board[nr][nc] === player) { cells.unshift([nr, nc]); nr -= dr; nc -= dc; }
    if (cells.length >= WIN_LEN) return { won: true, line: cells };
  }
  return { won: false, line: [] };
}

/** 棋盤是否已滿（無人連五時的和局判定）。 */
export function isBoardFull(board, size) {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === EMPTY) return false;
    }
  }
  return true;
}

export const GomokuRules = { SIZE, WIN_LEN, newBoard, canPlace, checkWin, isBoardFull };
