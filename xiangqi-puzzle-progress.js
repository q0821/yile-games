// xiangqi-puzzle-progress.js — 象棋殘局已解進度（localStorage，與對弈/死活分開）。
// 以題目 FEN 當唯一識別；存已解 FEN 集合。
const KEY = 'xiangqi_puzzle_progress';

let solved = null;
function load() {
  if (solved) return solved;
  try { solved = new Set(JSON.parse(localStorage.getItem(KEY)) || []); }
  catch { solved = new Set(); }
  return solved;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify([...load()])); } catch { /* ignore */ } }

export function isSolved(fen) { return load().has(fen); }
export function markSolved(fen) { const s = load(); if (!s.has(fen)) { s.add(fen); persist(); } }
/** 給一組題目 FEN，回傳已解題數。 */
export function solvedCount(fens) { const s = load(); let n = 0; for (const f of fens) if (s.has(f)) n++; return n; }

export const XiangqiPuzzleProgress = { isSolved, markSolved, solvedCount };
