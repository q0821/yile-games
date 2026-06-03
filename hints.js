import { opponent, getGroup, tryPlaceStone } from './rules.js';

// ==================== CAPTURE HINTS ====================

export function getCaptureHints(board, size, player, koPoint) {
  const hints = [];
  const seen = new Set();
  const opp = opponent(player);

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (board[x][y] !== opp) continue;
      const group = getGroup(board, size, x, y);
      if (group.liberties.size === 1) {
        for (const libKey of group.liberties) {
          const lx = Math.floor(libKey / size);
          const ly = libKey % size;
          const key = `${lx},${ly}`;
          if (!seen.has(key)) {
            const result = tryPlaceStone(board, size, lx, ly, player, koPoint);
            if (result.valid) {
              hints.push([lx, ly]);
              seen.add(key);
            }
          }
        }
      }
    }
  }
  return hints;
}

export const GoHints = {
  getCaptureHints
};
