import { PROBLEM_IDS } from './go-lessons.js';

export const LEARN_PROGRESS_KEY = 'gogame_learn_progress_v1';
const known = new Set(PROBLEM_IDS);
export function emptyProgress() {
  return { version: 1, records: {}, current: PROBLEM_IDS[0], attempt: { assisted: false, mistaken: false } };
}
export function readProgress(storage) {
  try {
    const raw = storage.getItem(LEARN_PROGRESS_KEY);
    if (raw === null) return { progress: emptyProgress(), writable: true, error: '' };
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !value.records || typeof value.records !== 'object' || Array.isArray(value.records)) {
      throw new Error('invalid-schema');
    }
    const progress = emptyProgress();
    for (const id of PROBLEM_IDS) {
      const record = value.records[id];
      if (!record) continue;
      if (typeof record.solved !== 'boolean' || typeof record.review !== 'boolean') throw new Error('invalid-record');
      progress.records[id] = { solved: record.solved, review: record.review };
    }
    if (known.has(value.current)) {
      progress.current = value.current;
      progress.attempt = {
        assisted: value.attempt?.assisted === true,
        mistaken: value.attempt?.mistaken === true,
      };
    }
    return { progress, writable: true, error: '' };
  } catch {
    console.warn('[go-learn] 無法讀取練習進度，原有資料未覆寫。');
    return { progress: emptyProgress(), writable: false, error: '無法讀取原有進度，這次練習只暫存在本頁。原有資料未覆寫。' };
  }
}
export function writeProgress(storage, progress) {
  try {
    storage.setItem(LEARN_PROGRESS_KEY, JSON.stringify(progress));
    return '';
  } catch {
    console.warn('[go-learn] 無法儲存練習進度。');
    return '無法儲存進度，這次變更只暫存在本頁。請確認瀏覽器允許儲存資料。';
  }
}
export function beginProblem(progress, id) {
  if (!known.has(id)) throw new Error('未知的練習題目');
  return { ...progress, current: id, attempt: { assisted: false, mistaken: false } };
}
export function recordAnswer(progress, outcome) {
  const id = progress.current;
  const previous = progress.records[id] || { solved: false, review: false };
  const attempt = { ...progress.attempt };
  if (outcome === 'reveal') attempt.assisted = true;
  else if (outcome === 'wrong') attempt.mistaken = true;
  else if (outcome !== 'correct') throw new Error('未知的解題結果');
  const clean = outcome === 'correct' && !attempt.assisted && !attempt.mistaken;
  const record = {
    solved: previous.solved || (outcome === 'correct' && !attempt.assisted),
    review: clean ? false : previous.review || outcome !== 'correct',
  };
  return { ...progress, attempt, records: { ...progress.records, [id]: record } };
}
export function reviewIds(progress) {
  return PROBLEM_IDS.filter(id => progress.records[id]?.review);
}
