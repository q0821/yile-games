/**
 * 死活練習進度記錄。與對弈的 gogame_state 分開存。
 *
 * 純函數 reducer（recordResult / setLastIndex / solvedCount ...）不碰 localStorage，
 * 方便測試；loadProgress / saveProgress 是薄薄的 I/O 包裝。
 *
 * 進度結構：
 *   { [levelId]: { solved: { [problemId]: { correct: bool, firstTry: bool } }, lastIndex: number } }
 */
export const PROGRESS_KEY = 'gogame_tsumego_progress';

export function emptyProgress() {
  return {};
}

function ensureLevel(progress, levelId) {
  const lv = progress[levelId];
  return lv
    ? { solved: { ...lv.solved }, lastIndex: lv.lastIndex || 0 }
    : { solved: {}, lastIndex: 0 };
}

/**
 * 記錄一題的結果，回傳新的 progress（不可變）。
 * result：
 *   'correct'   答對（會記 firstTry：若之前沒答錯/沒看答案，則為首次即對）
 *   'attempted' 答錯過
 *   'revealed'  看了答案
 */
export function recordResult(progress, levelId, problemId, result) {
  const p = { ...progress };
  const lv = ensureLevel(progress, levelId);
  const prev = lv.solved[problemId];

  if (result === 'correct') {
    lv.solved[problemId] = {
      correct: true,
      // 只有「之前完全沒碰過」才算首次即對
      firstTry: prev ? !!prev.firstTry && prev.correct !== false : true
    };
  } else {
    // 答錯或看答案：標記碰過，且讓日後答對不算首次即對
    lv.solved[problemId] = {
      correct: prev ? !!prev.correct : false,
      firstTry: false
    };
  }

  p[levelId] = lv;
  return p;
}

/** 記錄某級別目前停在第幾題（給「繼續上次」用）。 */
export function setLastIndex(progress, levelId, index) {
  const p = { ...progress };
  const lv = ensureLevel(progress, levelId);
  lv.lastIndex = index;
  p[levelId] = lv;
  return p;
}

export function getLastIndex(progress, levelId) {
  return progress[levelId]?.lastIndex || 0;
}

/** 已答對（correct === true）的題數。 */
export function solvedCount(progress, levelId) {
  const solved = progress[levelId]?.solved;
  if (!solved) return 0;
  return Object.values(solved).filter(s => s.correct).length;
}

/** 首次即對的題數。 */
export function firstTryCount(progress, levelId) {
  const solved = progress[levelId]?.solved;
  if (!solved) return 0;
  return Object.values(solved).filter(s => s.correct && s.firstTry).length;
}

export function isSolved(progress, levelId, problemId) {
  return !!progress[levelId]?.solved?.[problemId]?.correct;
}

// ——— localStorage I/O（瀏覽器端） ———

export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : emptyProgress();
  } catch (_) {
    return emptyProgress();
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (_) { /* 無痕模式等寫入失敗就忽略 */ }
}

export const TsumegoProgress = {
  PROGRESS_KEY, emptyProgress, recordResult, setLastIndex, getLastIndex,
  solvedCount, firstTryCount, isSolved, loadProgress, saveProgress
};
