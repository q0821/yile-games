// gomoku-ai.js — 五子棋 AI（純邏輯、無 DOM、可單元測試；不依賴 KataGo）。
//
// 策略：威脅優先（立即勝手 / 擋對手立即勝手）+ 連子型態啟發式評分 +（高難度）兩手預看。
// 候選手只取「已有棋子鄰近 2 格內的空點」大幅剪枝，空盤則下天元。
// rng 可注入（預設 Math.random），方便測試重現；低難度用隨機弱化讓初學者也下得贏。
import { EMPTY, opponent, inBounds } from './rules.js';
import { checkWin } from './gomoku-rules.js';

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const NEAR = 2; // 候選手取已有子周圍幾格內

// 型態分值：(連續同色數, 開放端數) → 分。數字只需相對大小正確。
function patternValue(count, openEnds) {
  if (count >= 5) return 100000000;          // 五連（勝）
  if (count === 4) return openEnds === 2 ? 1000000 : openEnds === 1 ? 100000 : 0; // 活四 / 沖四
  if (count === 3) return openEnds === 2 ? 10000 : openEnds === 1 ? 1000 : 0;     // 活三 / 眠三
  if (count === 2) return openEnds === 2 ? 1000 : openEnds === 1 ? 100 : 0;       // 活二 / 眠二
  if (count === 1) return openEnds === 2 ? 100 : openEnds === 1 ? 10 : 0;
  return 0;
}

// 假設 (r,c) 已是 player，算某方向上「最長連續同色 + 兩端開放數」。
function dirCount(board, size, r, c, player, dr, dc) {
  let count = 1;
  let openEnds = 0;
  let nr = r + dr, nc = c + dc;
  while (inBounds(size, nr, nc) && board[nr][nc] === player) { count++; nr += dr; nc += dc; }
  if (inBounds(size, nr, nc) && board[nr][nc] === EMPTY) openEnds++;
  nr = r - dr; nc = c - dc;
  while (inBounds(size, nr, nc) && board[nr][nc] === player) { count++; nr -= dr; nc -= dc; }
  if (inBounds(size, nr, nc) && board[nr][nc] === EMPTY) openEnds++;
  return { count, openEnds };
}

/** 在 (r,c) 放 player 子的型態總分（試放→評→還原，不改動原盤）。 */
export function placeScore(board, size, r, c, player) {
  board[r][c] = player;
  let s = 0;
  for (const [dr, dc] of DIRS) {
    const { count, openEnds } = dirCount(board, size, r, c, player, dr, dc);
    s += patternValue(count, openEnds);
  }
  board[r][c] = EMPTY;
  return s;
}

/** 候選手：已有棋子周圍 NEAR 格內的空點（去重）。空盤回空陣列。 */
export function candidates(board, size) {
  const seen = new Set();
  const out = [];
  let hasStone = false;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === EMPTY) continue;
      hasStone = true;
      for (let dr = -NEAR; dr <= NEAR; dr++) {
        for (let dc = -NEAR; dc <= NEAR; dc++) {
          const nr = r + dr, nc = c + dc;
          if (!inBounds(size, nr, nc) || board[nr][nc] !== EMPTY) continue;
          const key = nr * size + nc;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ r: nr, c: nc });
        }
      }
    }
  }
  return hasStone ? out : [];
}

/**
 * 求 AI 一手。
 * @param {number} level 1=簡單(隨機弱化) / 2=普通(啟發式) / 3=困難(兩手預看)
 * @returns {{r:number,c:number}|null}
 */
export function bestMove(board, size, player, level = 2, rng = Math.random) {
  const opp = opponent(player);
  const cands = candidates(board, size);

  // 空盤：下天元（或最接近中心的空點）
  if (!cands.length) {
    const mid = (size / 2) | 0;
    return board[mid][mid] === EMPTY ? { r: mid, c: mid } : null;
  }

  // 1) 我方立即勝手
  for (const { r, c } of cands) {
    board[r][c] = player;
    const won = checkWin(board, size, r, c, player).won;
    board[r][c] = EMPTY;
    if (won) return { r, c };
  }
  // 2) 擋對手立即勝手
  for (const { r, c } of cands) {
    board[r][c] = opp;
    const won = checkWin(board, size, r, c, opp).won;
    board[r][c] = EMPTY;
    if (won) return { r, c };
  }

  // 3) 啟發式評分：自身攻擊力 + 對手在此點的威脅（擋）
  const scored = cands.map(({ r, c }) => {
    const attack = placeScore(board, size, r, c, player);
    const defend = placeScore(board, size, r, c, opp);
    let score = attack + defend * 0.9;
    if (level >= 3) {
      // 兩手預看：我下此手後，扣掉對手最強的反擊
      board[r][c] = player;
      const reply = candidates(board, size).reduce((mx, m) =>
        Math.max(mx, placeScore(board, size, m.r, m.c, opp)), 0);
      board[r][c] = EMPTY;
      score -= reply * 0.8;
    }
    return { r, c, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // 低難度：從前幾名隨機挑（弱化）；高難度：取最高分（同分隨機）
  if (level <= 1) {
    const k = Math.min(4, scored.length);
    return scored[Math.floor(rng() * k)];
  }
  const top = scored.filter((s) => s.score === scored[0].score);
  return top[Math.floor(rng() * top.length)];
}

export const GomokuAI = { placeScore, candidates, bestMove };
