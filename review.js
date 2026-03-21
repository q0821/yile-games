import { tryPlaceStone, createBoard } from './rules.js';
import { GnuGoService } from './gnugo-service.js';

export function buildSGFUpTo(n, moveHistory, size, komi) {
  return GnuGoService.buildSGFUpTo(moveHistory, size, komi, n);
}

export function getReviewBoard(moveHistory, currentReviewMove, size) {
  let b = createBoard(size);
  for (let i = 0; i < currentReviewMove; i++) {
    const m = moveHistory[i];
    if (m.pass) continue;
    const result = tryPlaceStone(b, size, m.x, m.y, m.player, null);
    if (result.valid) b = result.newBoard;
  }
  return b;
}

export function getReviewLastMove(moveHistory, currentReviewMove) {
  for (let i = currentReviewMove - 1; i >= 0; i--) {
    if (!moveHistory[i].pass) return [moveHistory[i].x, moveHistory[i].y];
  }
  return null;
}

export const GoReview = { buildSGFUpTo, getReviewBoard, getReviewLastMove };
