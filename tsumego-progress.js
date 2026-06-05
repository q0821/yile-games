/**
 * 死活練習進度記錄。與對弈的 gogame_state 分開存。
 *
 * 純函數 reducer（recordResult / setLastIndex / solvedCount ...）不碰 localStorage，
 * 方便測試；loadProgress / saveProgress 是薄薄的 I/O 包裝。
 *
 * 進度結構（向後相容：舊存檔沒有 _meta / cleared 也能正常讀）：
 *   {
 *     [levelId]: {
 *       solved: { [problemId]: { correct: bool, firstTry: bool, cleared?: bool } },
 *       lastIndex: number
 *     },
 *     _meta: { streak: number, bestStreak: number, daily: { [yyyy-mm-dd]: number } }
 *   }
 *
 *   cleared：曾經答錯/看答案後，又「乾淨地」一次答對 → 視為已通過複習，移出複習佇列。
 *   _meta：全域統計（連勝、最佳連勝、每日已解題數）。key 以 '_' 開頭，與 levelId 區隔。
 */
export const PROGRESS_KEY = 'gogame_tsumego_progress';
const META_KEY = '_meta';

export function emptyProgress() {
  return {};
}

/** 是否為級別資料 key（排除 _meta 等全域 key）。 */
function isLevelKey(key) {
  return typeof key === 'string' && key[0] !== '_';
}

function ensureLevel(progress, levelId) {
  const lv = progress[levelId];
  return lv
    ? { solved: { ...lv.solved }, lastIndex: lv.lastIndex || 0 }
    : { solved: {}, lastIndex: 0 };
}

function ensureMeta(progress) {
  const m = progress[META_KEY];
  return m
    ? { streak: m.streak || 0, bestStreak: m.bestStreak || 0, daily: { ...(m.daily || {}) } }
    : { streak: 0, bestStreak: 0, daily: {} };
}

/**
 * 記錄一題的結果，回傳新的 progress（不可變）。
 * result：
 *   'correct'   答對（會記 firstTry：若之前沒答錯/沒看答案，則為首次即對）
 *   'attempted' 答錯過
 *   'revealed'  看了答案
 * opts（皆 optional，舊呼叫者不傳也正常）：
 *   clean   本次作答是否「乾淨答對」（過程沒先答錯/沒看答案）。
 *           未提供時以「之前沒碰過」推斷。乾淨答對才累計連勝、且清掉複習旗標。
 *   today   'yyyy-mm-dd'。提供時，把「新解出的題」計入當日題數。
 */
export function recordResult(progress, levelId, problemId, result, opts = {}) {
  const p = { ...progress };
  const lv = ensureLevel(progress, levelId);
  const meta = ensureMeta(progress);
  const prev = lv.solved[problemId];

  if (result === 'correct') {
    const firstTry = prev ? !!prev.firstTry && prev.correct !== false : true;
    const clean = opts.clean !== undefined ? !!opts.clean : !prev;
    const rec = { correct: true, firstTry };
    if (clean || (prev && prev.cleared)) rec.cleared = true;
    lv.solved[problemId] = rec;

    const newlySolved = !(prev && prev.correct);
    if (clean) {
      meta.streak += 1;
      if (meta.streak > meta.bestStreak) meta.bestStreak = meta.streak;
    }
    // 非乾淨答對：連勝已在先前的答錯事件歸零，這裡不動。
    if (newlySolved && opts.today) {
      meta.daily[opts.today] = (meta.daily[opts.today] || 0) + 1;
    }
  } else {
    // 答錯或看答案：標記碰過、非首次即對、取消 cleared（回到複習佇列），連勝歸零。
    lv.solved[problemId] = {
      correct: prev ? !!prev.correct : false,
      firstTry: false
    };
    meta.streak = 0;
  }

  p[levelId] = lv;
  p[META_KEY] = meta;
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

// ——— 學習迴圈：複習佇列、統計 ———

/** 單題是否仍需複習：曾答錯/看答案（非首次即對，或根本沒解出），且尚未「乾淨」通過。 */
export function needsReview(rec) {
  if (!rec || rec.cleared) return false;
  return rec.correct === false || rec.firstTry === false;
}

/** 某級別待複習的 problemId 陣列。 */
export function reviewIds(progress, levelId) {
  const solved = progress[levelId]?.solved;
  if (!solved) return [];
  return Object.keys(solved).filter(id => needsReview(solved[id]));
}

/** 某級別待複習題數。 */
export function reviewCount(progress, levelId) {
  return reviewIds(progress, levelId).length;
}

/** 某級別一次過率（首次即對 / 已解出），無已解出時回 0。 */
export function firstTryRate(progress, levelId) {
  const s = solvedCount(progress, levelId);
  if (!s) return 0;
  return firstTryCount(progress, levelId) / s;
}

/** 全域目前連勝（連續乾淨答對）。 */
export function streak(progress) {
  return progress[META_KEY]?.streak || 0;
}

/** 全域最佳連勝。 */
export function bestStreak(progress) {
  return progress[META_KEY]?.bestStreak || 0;
}

/** 指定日期（yyyy-mm-dd）當日新解出的題數。 */
export function dailyCount(progress, today) {
  return progress[META_KEY]?.daily?.[today] || 0;
}

/** 全部級別已解出總題數（跳過 _meta 等全域 key）。 */
export function totalSolved(progress) {
  return Object.keys(progress)
    .filter(isLevelKey)
    .reduce((sum, lvId) => sum + solvedCount(progress, lvId), 0);
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
  solvedCount, firstTryCount, isSolved,
  needsReview, reviewIds, reviewCount, firstTryRate, streak, bestStreak, dailyCount, totalSolved,
  loadProgress, saveProgress
};
