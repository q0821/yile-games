// stats.test.js — stats.js（對電腦累計戰績）reducer 全覆蓋 + loadStats 容錯測試。
//
// 每個測試都建新 sandbox（sandboxWithStats 內含全新的 in-memory localStorage mock，
// 經 ctx.localStorage 可直接檢查/操作），互不污染；loadStats/saveStats 的容錯測試
// 直接改 mock 的方法模擬損毀資料與 storage 失效。
const { sandboxWithStats } = require('./helpers');

let S;
let mockStorage;

beforeEach(() => {
  const ctx = sandboxWithStats();
  S = ctx.GameStats;
  mockStorage = ctx.localStorage;
});

describe('recordGame', () => {
  test('記錄一勝', () => {
    const s = S.recordGame(S.emptyStats(), 'go', 'win');
    expect(s.go).toEqual({ w: 1, l: 0, d: 0 });
  });

  test('記錄一敗', () => {
    const s = S.recordGame(S.emptyStats(), 'chess', 'loss');
    expect(s.chess).toEqual({ w: 0, l: 1, d: 0 });
  });

  test('記錄一和', () => {
    const s = S.recordGame(S.emptyStats(), 'othello', 'draw');
    expect(s.othello).toEqual({ w: 0, l: 0, d: 1 });
  });

  test('同棋累計多局', () => {
    let s = S.emptyStats();
    s = S.recordGame(s, 'gomoku', 'win');
    s = S.recordGame(s, 'gomoku', 'win');
    s = S.recordGame(s, 'gomoku', 'loss');
    expect(s.gomoku).toEqual({ w: 2, l: 1, d: 0 });
  });

  test('不可變：原 stats 不被修改', () => {
    const orig = S.emptyStats();
    const s = S.recordGame(orig, 'go', 'win');
    expect(orig).toEqual({});
    expect(s).not.toBe(orig);
  });

  test('不可變：既有資料的物件也不被就地修改', () => {
    const orig = S.recordGame(S.emptyStats(), 'go', 'win');
    const next = S.recordGame(orig, 'go', 'win');
    expect(orig.go).toEqual({ w: 1, l: 0, d: 0 });
    expect(next.go).toEqual({ w: 2, l: 0, d: 0 });
    expect(next).not.toBe(orig);
  });

  test('非法 outcome 不記錄，原樣回傳同一參考', () => {
    const orig = S.emptyStats();
    const s = S.recordGame(orig, 'go', 'giveup');
    expect(s).toBe(orig);
    expect(s).toEqual({});
  });

  test('undefined outcome 不記錄', () => {
    const orig = S.recordGame(S.emptyStats(), 'go', 'win');
    const s = S.recordGame(orig, 'go', undefined);
    expect(s).toBe(orig);
  });
});

describe('totals', () => {
  test('直接取值＋normalize', () => {
    let s = S.emptyStats();
    s = S.recordGame(s, 'xiangqi', 'win');
    s = S.recordGame(s, 'xiangqi', 'win');
    s = S.recordGame(s, 'xiangqi', 'loss');
    s = S.recordGame(s, 'xiangqi', 'draw');
    expect(S.totals(s, 'xiangqi')).toEqual({ w: 2, l: 1, d: 1 });
  });

  test('查無棋種回全 0', () => {
    const s = S.recordGame(S.emptyStats(), 'go', 'win');
    expect(S.totals(s, 'connect6')).toEqual({ w: 0, l: 0, d: 0 });
  });

  test('空 stats 回全 0', () => {
    expect(S.totals(S.emptyStats(), 'go')).toEqual({ w: 0, l: 0, d: 0 });
  });

  test('舊巢狀資料讀入不爆炸：舊版分難度結構退化為全 0', () => {
    // 舊版結構殘留：{ go: { L5: { w: 1, l: 0, d: 0 } } }；新版直接取 go.w/l/d，
    // 該物件沒有這些欄位，normalize 保底為 0，不應 NaN 或拋錯。
    const legacy = { go: { L5: { w: 1, l: 0, d: 0 } } };
    expect(S.totals(legacy, 'go')).toEqual({ w: 0, l: 0, d: 0 });
  });
});

describe('formatRecord', () => {
  test('全 0 回空字串', () => {
    expect(S.formatRecord({ w: 0, l: 0, d: 0 })).toBe('');
  });

  test('只有勝', () => {
    expect(S.formatRecord({ w: 3, l: 0, d: 0 })).toBe('對電腦累計 3 勝');
  });

  test('只有敗', () => {
    expect(S.formatRecord({ w: 0, l: 2, d: 0 })).toBe('對電腦累計 2 敗');
  });

  test('只有和', () => {
    expect(S.formatRecord({ w: 0, l: 0, d: 1 })).toBe('對電腦累計 1 和');
  });

  test('勝敗和皆有', () => {
    expect(S.formatRecord({ w: 12, l: 8, d: 1 })).toBe('對電腦累計 12 勝 8 敗 1 和');
  });

  test('勝敗、無和', () => {
    expect(S.formatRecord({ w: 5, l: 4, d: 0 })).toBe('對電腦累計 5 勝 4 敗');
  });

  test('未傳入值時視同全 0，回空字串', () => {
    expect(S.formatRecord(undefined)).toBe('');
  });
});

describe('loadStats / saveStats', () => {
  test('無既有資料回 emptyStats()', () => {
    expect(S.loadStats()).toEqual({});
  });

  test('saveStats 後可用 loadStats 讀回同樣內容', () => {
    const s = S.recordGame(S.emptyStats(), 'go', 'win');
    S.saveStats(s);
    expect(S.loadStats()).toEqual(s);
  });

  test('損毀 JSON 容錯回 emptyStats()', () => {
    mockStorage.setItem(S.STATS_KEY, '{not valid json');
    expect(S.loadStats()).toEqual({});
  });

  test('值為陣列（非 plain object）容錯回 emptyStats()', () => {
    mockStorage.setItem(S.STATS_KEY, JSON.stringify([1, 2, 3]));
    expect(S.loadStats()).toEqual({});
  });

  test('值為字串字面值容錯回 emptyStats()', () => {
    mockStorage.setItem(S.STATS_KEY, JSON.stringify('hello'));
    expect(S.loadStats()).toEqual({});
  });

  test('值為數字字面值容錯回 emptyStats()', () => {
    mockStorage.setItem(S.STATS_KEY, JSON.stringify(42));
    expect(S.loadStats()).toEqual({});
  });

  test('localStorage 不可用（getItem 拋錯）容錯回 emptyStats()', () => {
    mockStorage.getItem = () => { throw new Error('storage disabled'); };
    expect(S.loadStats()).toEqual({});
  });

  test('saveStats 寫入失敗不拋錯', () => {
    mockStorage.setItem = () => { throw new Error('quota exceeded'); };
    expect(() => S.saveStats(S.emptyStats())).not.toThrow();
  });
});
