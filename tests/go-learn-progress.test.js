const { sandboxWithRules, createMockLocalStorage } = require('./helpers');
const r = sandboxWithRules();
const p = r.localRequire('./go-learn-progress.js');
const ids = r.localRequire('./go-lessons.js').PROBLEM_IDS;

test('錯答再答對可算解出，但要另一次第一次答對才清除錯題', () => {
  let state = p.emptyProgress();
  state = p.recordAnswer(state, 'wrong');
  state = p.recordAnswer(state, 'correct');
  expect(state.records[ids[0]]).toEqual({ solved: true, review: true });
  state = p.beginProblem(state, ids[0]);
  state = p.recordAnswer(state, 'correct');
  expect(state.records[ids[0]]).toEqual({ solved: true, review: false });
});
test('看解說與重新整理不能冒充自行解出，舊死活進度原樣保留', () => {
  const storage = createMockLocalStorage();
  storage.setItem('gogame_tsumego_progress', '舊紀錄');
  let state = p.recordAnswer(p.emptyProgress(), 'reveal');
  expect(p.writeProgress(storage, state)).toBe('');
  state = p.readProgress(storage).progress;
  state = p.recordAnswer(state, 'correct');
  expect(state.records[ids[0]]).toEqual({ solved: false, review: true });
  expect(storage.getItem('gogame_tsumego_progress')).toBe('舊紀錄');
});
test('上次題目、錯答狀態與已解題可還原，未知 ID 不列入', () => {
  const storage = createMockLocalStorage();
  let state = p.beginProblem(p.emptyProgress(), ids[10]);
  state = p.recordAnswer(state, 'wrong');
  state.records.unknown = { solved: true, review: true };
  p.writeProgress(storage, state);
  const loaded = p.readProgress(storage);
  expect(loaded.progress.current).toBe(ids[10]);
  expect(loaded.progress.attempt.mistaken).toBe(true);
  expect(p.reviewIds(loaded.progress)).toEqual([ids[10]]);
  expect(loaded.progress.records.unknown).toBeUndefined();
});
test.each(['{broken', '{"version":99,"records":{}}', '{"version":1,"records":[]}'])('損壞或新版資料不可覆寫：%s', raw => {
  const storage = createMockLocalStorage(); storage.setItem(p.LEARN_PROGRESS_KEY, raw);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const loaded = p.readProgress(storage);
  expect(loaded.writable).toBe(false);
  expect(loaded.error).toMatch(/無法讀取/);
  expect(storage.getItem(p.LEARN_PROGRESS_KEY)).toBe(raw);
  expect(warn).toHaveBeenCalled(); warn.mockRestore();
});
test('儲存失敗可觀察，沒有假成功或洩漏原始資料', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const error = p.writeProgress({ setItem() { throw new Error('secret'); } }, p.emptyProgress());
  expect(error).toMatch(/無法儲存/);
  expect(warn.mock.calls.flat().join('')).not.toContain('secret');
  warn.mockRestore();
});
