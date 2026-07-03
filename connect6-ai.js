// connect6-ai.js — 連六棋 AI（V1 貪婪雙落子；純邏輯、無 DOM、可單元測試）。
//
// 策略：每回合依序選 1~2 子，每一子皆「立即致勝 → 擋對手立即六 → 攻守啟發式評分」。
// 候選點與五子棋共用 candidates()（已有子鄰近 2 格內的空點）大幅剪枝，空盤下天元。
// V1 不做完整成對搜尋 / 雙威脅窮舉防守（留給 V2）；守法以「連五迫著」高權重近似。
import { EMPTY, opponent, inBounds } from './rules.js';
import { checkWin } from './connect6-rules.js';
import { candidates } from './gomoku-ai.js';

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

// 6 門檻型態分值：(連續同色數, 開放端數) → 分。連 5（有開放端）＝迫著，活四次之。
function patternValue(count, openEnds) {
  if (count >= 6) return 1e8;                                            // 六連（勝）
  if (count === 5) return openEnds >= 1 ? 1e6 : 0;                       // 開放五（迫著）
  if (count === 4) return openEnds === 2 ? 5e4 : openEnds === 1 ? 5e3 : 0; // 活四 / 沖四
  if (count === 3) return openEnds === 2 ? 1e3 : openEnds === 1 ? 100 : 0; // 活三 / 眠三
  if (count === 2) return openEnds === 2 ? 100 : openEnds === 1 ? 10 : 0;
  if (count === 1) return openEnds === 2 ? 10 : openEnds === 1 ? 2 : 0;
  return 0;
}

// 假設 (r,c) 已是 player，算某方向上「最長連續同色 + 兩端開放數」。
function dirCount(board, size, r, c, player, dr, dc) {
  let count = 1, openEnds = 0;
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

/** 在 board 上選「一子」（bestTurn 會連呼兩次，第二次時 board 已含第一子）。 */
function bestOne(board, size, player, level, rng) {
  const opp = opponent(player);
  const cands = candidates(board, size);
  // 空盤：下天元（或最接近中心的空點）
  if (!cands.length) {
    const mid = (size / 2) | 0;
    return board[mid][mid] === EMPTY ? { r: mid, c: mid } : null;
  }
  // a) 我方立即勝手
  for (const { r, c } of cands) {
    board[r][c] = player;
    const won = checkWin(board, size, r, c, player).won;
    board[r][c] = EMPTY;
    if (won) return { r, c };
  }
  // b) 擋對手立即勝手
  for (const { r, c } of cands) {
    board[r][c] = opp;
    const won = checkWin(board, size, r, c, opp).won;
    board[r][c] = EMPTY;
    if (won) return { r, c };
  }
  // c) 啟發式評分：自身攻擊力 + 對手在此點的威脅（擋）
  const scored = cands.map(({ r, c }) => {
    const attack = placeScore(board, size, r, c, player);
    const defend = placeScore(board, size, r, c, opp);
    let score = attack + defend * 0.95; // 連六棋對手一手兩子，防守權重略高於五子棋
    if (level >= 3) {
      // 兩手預看：我下此手後，扣掉對手最強的單手反擊（近似）
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

/**
 * 求 AI 這回合要下的 1~2 子。
 * @param {number} quota 本回合可下子數（整局第一回合＝1，其餘＝2）
 * @returns {Array<{r:number,c:number}>} 長度 1 或 2；已致勝則提早結束不下第二子。
 */
export function bestTurn(board, size, player, level = 2, quota = 2, rng = Math.random) {
  const work = board.map((row) => row.slice()); // 在副本上試放，不動原盤
  const moves = [];
  for (let i = 0; i < quota; i++) {
    const m = bestOne(work, size, player, level, rng);
    if (!m) break;
    work[m.r][m.c] = player;
    moves.push({ r: m.r, c: m.c });
    if (checkWin(work, size, m.r, m.c, player).won) break; // 已贏，無需第二子
  }
  return moves;
}

export const Connect6AI = { placeScore, bestTurn };
