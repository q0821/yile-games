import { EMPTY, getGroup, getNeighbors, tryPlaceStone } from './rules.js';

/** 單步陪練：刻意不搜尋後續變化，不代表正式棋力級位。 */
export function beginnerMove(state, rng = Math.random) {
  const { board, size, currentPlayer: color, koPoint, moveHistory = [] } = state;
  // 教學局讓玩家能主動結束；避免陪練在對方收手後繼續填滿棋盤。
  if (moveHistory.at(-1)?.pass) return { pass: true };
  const moves = [];
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (board[x][y] !== EMPTY) continue;
      const neighbors = getNeighbors(size, x, y);
      if (neighbors.every(([r, c]) => board[r][c] === color)) continue;
      const result = tryPlaceStone(board, size, x, y, color, koPoint);
      if (!result.valid) continue;
      const group = getGroup(result.newBoard, size, x, y);
      const friends = neighbors.filter(([r, c]) => board[r][c] === color);
      const rescue = friends.some(([r, c]) => getGroup(board, size, r, c).liberties.size === 1)
        && group.liberties.size > 1;
      const score = result.captured * 4 + (rescue ? 3 : 0) + Math.min(friends.length, 2)
        - (group.liberties.size === 1 ? 5 : 0);
      moves.push({ x, y, score, safe: group.liberties.size > 1 || result.captured > 0 });
    }
  }
  if (!moves.length) return { pass: true };
  const safe = moves.filter(m => m.safe);
  const pool = safe.length ? safe : moves;
  // 只有 35% 採最好的單步戰術，其餘在一般落點抽選，確保不受 KataGo 候選池限制。
  const bestScore = Math.max(...pool.map(m => m.score));
  const choices = rng() < 0.35 ? pool.filter(m => m.score === bestScore) : pool;
  const choice = choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))];
  return { x: choice.x, y: choice.y };
}
