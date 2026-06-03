/**
 * 死活練習（Tsumego）純邏輯模組。
 *
 * 題庫格式（sanderland/tsumego，JSON）：
 *   { AB:[sgf...], AW:[sgf...], SZ:"19", C:"...", SOL:[[color, sgf, note, ""], ...] }
 *
 * 座標慣例（與 ui.js / gnugo-service.js 一致，務必別反）：
 *   SGF 字串第一字母 = column，第二字母 = row，皆自 'a' 起算。
 *   內部棋盤 board[row][col]（即 rules.js 的 board[x][y]，x=row、y=col）。
 *
 * 判定範圍：只判第一手關鍵點。SOL 多列視為「並列正解」，命中任一列即正確。
 */
import { createBoard, BLACK, WHITE } from './rules.js';

export const LETTERS = 'abcdefghijklmnopqrs';

/** SGF 字母座標 → { row, col }。非法座標丟錯（快速失敗）。 */
export function sgfToRC(coord) {
  const col = LETTERS.indexOf(coord[0]);
  const row = LETTERS.indexOf(coord[1]);
  if (col < 0 || row < 0) {
    throw new Error(`Invalid SGF coord: ${JSON.stringify(coord)}`);
  }
  return { row, col };
}

/** { row, col } → SGF 字母座標（sgfToRC 的反向）。 */
export function rcToSgf(row, col) {
  return LETTERS[col] + LETTERS[row];
}

/** 'B' → BLACK、'W' → WHITE。 */
export function colorToCode(color) {
  return color === 'B' ? BLACK : WHITE;
}

/**
 * 把題庫原始 JSON 轉成統一內部格式。
 * 回傳 { size, toPlay, addBlack[], addWhite[], answers[], desc }。
 * answers 每筆為 { color, row, col }。
 */
export function parseProblem(raw) {
  const size = parseInt(raw.SZ, 10) || 19;
  const addBlack = (raw.AB || []).map(sgfToRC);
  const addWhite = (raw.AW || []).map(sgfToRC);
  const answers = (raw.SOL || []).map(([color, coord]) => ({ color, ...sgfToRC(coord) }));

  // 該下方由正解第一手的顏色決定；無 SOL 時退而由說明文字判斷（少見）。
  let toPlay = 'B';
  if (answers.length) toPlay = answers[0].color;
  else if (/white/i.test(raw.C || '')) toPlay = 'W';

  return { size, toPlay, addBlack, addWhite, answers, desc: raw.C || '' };
}

/** 依題目擺好初始盤面，回傳 board[row][col]。重用 rules.js 的 createBoard。 */
export function buildBoardFromProblem(problem) {
  const board = createBoard(problem.size);
  for (const { row, col } of problem.addBlack) board[row][col] = BLACK;
  for (const { row, col } of problem.addWhite) board[row][col] = WHITE;
  return board;
}

/** 玩家在 (row, col) 落子是否為正解（命中任一並列正解即可）。 */
export function checkAnswer(problem, row, col) {
  return problem.answers.some(a => a.row === row && a.col === col);
}

/**
 * 計算「局部裁切顯示」的視窗範圍（含所有棋子與正解點，外加 margin），
 * 並裁切到盤內。回傳 { minRow, maxRow, minCol, maxCol }（皆含端點）。
 * 無任何棋子時回傳整盤。
 */
export function computeViewport(problem, margin = 2) {
  const last = problem.size - 1;
  const points = [...problem.addBlack, ...problem.addWhite, ...problem.answers];
  if (points.length === 0) {
    return { minRow: 0, maxRow: last, minCol: 0, maxCol: last };
  }

  let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity;
  for (const { row, col } of points) {
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
  }

  const clamp = (v) => Math.max(0, Math.min(last, v));
  return {
    minRow: clamp(minRow - margin),
    maxRow: clamp(maxRow + margin),
    minCol: clamp(minCol - margin),
    maxCol: clamp(maxCol + margin)
  };
}

// 命名空間匯出，與 rules.js 的 GoRules 風格一致。
export const Tsumego = {
  LETTERS, sgfToRC, rcToSgf, colorToCode,
  parseProblem, buildBoardFromProblem, checkAnswer, computeViewport
};
