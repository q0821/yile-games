export const GGG_PROGRESS_KEY = 'gogame_ggg_progress_v1';
export function newProgress(first) { return { version: 1, current: first, records: {}, assisted: false, mistaken: false }; }
export function loadGggProgress(storage, ids) {
  const fallback = newProgress(ids[0]);
  try {
    const raw = storage.getItem(GGG_PROGRESS_KEY);
    if (raw === null) return { progress: fallback, writable: true, error: '' };
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !parsed.records || typeof parsed.records !== 'object' || Array.isArray(parsed.records)) throw new Error('schema');
    for (const id of ids) {
      const record = parsed.records[id];
      if (!record) continue;
      if (typeof record.solved !== 'boolean' || typeof record.review !== 'boolean') throw new Error('record');
      fallback.records[id] = { solved: record.solved, review: record.review };
    }
    if (ids.includes(parsed.current)) {
      fallback.current = parsed.current;
      fallback.assisted = parsed.assisted === true; fallback.mistaken = parsed.mistaken === true;
    }
    return { progress: fallback, writable: true, error: '' };
  } catch {
    console.warn('[ggg] 無法讀取進度，原資料未覆寫。');
    return { progress: newProgress(ids[0]), writable: false, error: '無法讀取原有進度，這次只暫存在本頁；原資料未覆寫。' };
  }
}
export function saveGggProgress(storage, progress) {
  try { storage.setItem(GGG_PROGRESS_KEY, JSON.stringify(progress)); return ''; }
  catch { console.warn('[ggg] 無法儲存進度。'); return '無法儲存進度，這次變更只暫存在本頁。'; }
}
export function recordGgg(progress, state) {
  const old = progress.records[progress.current] || { solved: false, review: false };
  const assisted = progress.assisted || state.assisted;
  const mistaken = progress.mistaken || state.mistaken;
  const complete = state.status === 'correct';
  return { ...progress, assisted, mistaken, records: { ...progress.records,
    [progress.current]: { solved: old.solved || (complete && !assisted), review: complete && !assisted && !mistaken ? false : old.review || assisted || mistaken } } };
}
