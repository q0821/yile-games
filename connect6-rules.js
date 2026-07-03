// connect6-rules.js — 連六棋（Connect6）純規則邏輯（無 DOM，可單元測試）。
//
// 交大吳毅成發明，用圍棋棋具玩：19 路盤、黑白子。唯一合法性條件是「界內 + 該點為空」；
// 勝負在落子當下以「同色連成 6 子（含以上，長連也算）」判定。回合結構（每手兩子）屬於
// mode 層職責，本檔只管單一落子的合法性與連子判定。座標沿用全專案慣例 board[row][col]。
import { EMPTY, createBoard, inBounds } from './rules.js';
import { canPlace as gomokuCanPlace, isBoardFull as gomokuIsBoardFull } from './gomoku-rules.js';

export const SIZE = 19;     // 標準連六棋盤（同圍棋 19 路）
export const WIN_LEN = 6;   // 連 6 子勝

// 四個掃描方向：水平、垂直、主對角(↘)、副對角(↙)。
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

/** 建立空棋盤（重用 rules.createBoard）。 */
export function newBoard(size = SIZE) { return createBoard(size); }

// 「界內且為空」與五子棋同義，直接重用其實作（避免重複）。
export const canPlace = gomokuCanPlace;
export const isBoardFull = gomokuIsBoardFull;

/**
 * 以剛落下的 (r,c)（已是 player 的子）為中心，檢查是否連成 6 子以上。
 * @returns {{ won:boolean, line:Array<[number,number]> }} line 為勝利連線（含端點），供渲染高亮。
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

export const Connect6Rules = { SIZE, WIN_LEN, newBoard, canPlace, checkWin, isBoardFull };
