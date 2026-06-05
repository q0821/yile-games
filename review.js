import { tryPlaceStone, createBoard, BLACK } from './rules.js';

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

/**
 * 純規則的客觀對局摘要（不做形勢/勝率臆測）。逐手重播，統計提子。
 * @returns { totalMoves, blackCaptured, whiteCaptured, biggest:{moveNumber,byPlayer,count}|null }
 *   blackCaptured = 黑方總共提掉的（白）子數；whiteCaptured 同理。
 *   biggest = 單手最大一次提子（並列時取最早發生者）。
 */
export function summarizeGame(moveHistory, size) {
  let b = createBoard(size);
  let blackCaptured = 0;
  let whiteCaptured = 0;
  let biggest = null;
  for (let i = 0; i < moveHistory.length; i++) {
    const m = moveHistory[i];
    if (m.pass) continue;
    const res = tryPlaceStone(b, size, m.x, m.y, m.player, null);
    if (!res.valid) continue;
    b = res.newBoard;
    const cap = res.captured || 0;
    if (cap > 0) {
      if (m.player === BLACK) blackCaptured += cap;
      else whiteCaptured += cap;
      if (!biggest || cap > biggest.count) {
        biggest = { moveNumber: i + 1, byPlayer: m.player, count: cap };
      }
    }
  }
  return { totalMoves: moveHistory.length, blackCaptured, whiteCaptured, biggest };
}

export const GoReview = { getReviewBoard, getReviewLastMove, summarizeGame };
