// othello-ai.js — 黑白棋 AI（純邏輯、無 DOM、可單元測試）。
//
// negamax + alpha-beta；評估 = 位置權重（角最重、X/C 位危險）+ 機動性，終盤改重子數。
// 假設標準 8×8。難度三段：1=淺層+隨機弱化、2=中等、3=較深。rng 可注入（測試可重現）。
import { EMPTY, BLACK, WHITE, opponent } from './rules.js';
import { legalMoves, hasLegalMove, applyMove, score, isGameOver, SIZE } from './othello-rules.js';

// 8×8 位置權重（角 120、角旁 X/C 位為負，避免送角）。
const WEIGHTS = [
  [120, -20, 20, 5, 5, 20, -20, 120],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [5, -5, 3, 3, 3, 3, -5, 5],
  [20, -5, 15, 3, 3, 15, -5, 20],
  [-20, -40, -5, -5, -5, -5, -40, -20],
  [120, -20, 20, 5, 5, 20, -20, 120],
];

const DEPTH_BY_LEVEL = { 1: 1, 2: 3, 3: 5 };

function cloneBoard(board) { return board.map((row) => row.slice()); }

function countEmpties(board, size) {
  let n = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (board[r][c] === EMPTY) n++;
  return n;
}

/** 評估（player 視角，正 = 對 player 有利）。 */
export function evaluate(board, size, player) {
  const opp = opponent(player);
  let pos = 0, mine = 0, theirs = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = board[r][c];
      if (v === EMPTY) continue;
      const w = (size === 8) ? WEIGHTS[r][c] : 1;
      if (v === player) { pos += w; mine++; } else { pos -= w; theirs++; }
    }
  }
  const myMob = legalMoves(board, size, player).length;
  const opMob = legalMoves(board, size, opp).length;
  const mobility = (myMob + opMob) ? (100 * (myMob - opMob)) / (myMob + opMob) : 0;
  // 終盤（剩 ≤ 10 空）以子數為主，前中盤以位置+機動為主
  if (countEmpties(board, size) <= 10) return 1000 * (mine - theirs) + pos + 2 * mobility;
  return pos + 8 * mobility;
}

function negamax(board, size, player, depth, alpha, beta) {
  if (depth === 0 || isGameOver(board, size)) return evaluate(board, size, player);
  const moves = legalMoves(board, size, player);
  if (!moves.length) {
    // 無手 → pass 給對手（不遞減 depth，避免雙 pass 無限；終局已由 isGameOver 擋）
    return -negamax(board, size, opponent(player), depth, -beta, -alpha);
  }
  let val = -Infinity;
  for (const [r, c] of moves) {
    const nb = cloneBoard(board);
    applyMove(nb, size, r, c, player);
    val = Math.max(val, -negamax(nb, size, opponent(player), depth - 1, -beta, -alpha));
    alpha = Math.max(alpha, val);
    if (alpha >= beta) break;
  }
  return val;
}

/**
 * 求 AI 一手。
 * @returns {{r:number,c:number}|null} 無合法手回 null。
 */
export function bestMove(board, size, player, level = 2, rng = Math.random) {
  const moves = legalMoves(board, size, player);
  if (!moves.length) return null;
  // 簡單：多數時間隨機弱化（仍偶爾下好手），讓初學者贏得了
  if (level <= 1) {
    const pick = moves[Math.floor(rng() * moves.length)];
    return { r: pick[0], c: pick[1] };
  }
  const depth = DEPTH_BY_LEVEL[level] ?? 3;
  let best = [], bestVal = -Infinity;
  for (const [r, c] of moves) {
    const nb = cloneBoard(board);
    applyMove(nb, size, r, c, player);
    const val = -negamax(nb, size, opponent(player), depth - 1, -Infinity, Infinity);
    if (val > bestVal) { bestVal = val; best = [[r, c]]; }
    else if (val === bestVal) best.push([r, c]);
  }
  const pick = best[Math.floor(rng() * best.length)];
  return { r: pick[0], c: pick[1] };
}

export const OthelloAI = { evaluate, bestMove };
