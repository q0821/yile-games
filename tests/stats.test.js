// stats.test.js — stats.js（對電腦累計戰績）reducer 全覆蓋 + loadStats 容錯測試。
//
// 載入方式：沿用 tests/helpers.js 的 vm sandbox 機制，不自帶 loader。
// helpers.js 沒有 export createSandbox（只 export 各 sandboxWithXxx 工廠），
// 而每個工廠回傳的 ctx 都帶有 ctx.localRequire（可載入任意來源檔）；這裡借用
// sandboxWithTsumegoProgress()（stats.js 的模仿對象，同為純 reducer、無 DOM 依賴）
// 取得 ctx，先注入 in-memory localStorage mock 再 localRequire('./stats.js')。
// stats.js 的 loadStats/saveStats 在呼叫當下才解析全域 localStorage，
// 所以注入 ctx.localStorage 即可生效；每個測試都建新 sandbox＋新 mock，互不污染。
const { sandboxWithTsumegoProgress } = require('./helpers');

function createMockLocalStorage() {
  let store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; }
  };
}

let S;
let mockStorage;

beforeEach(() => {
  const ctx = sandboxWithTsumegoProgress();
  mockStorage = createMockLocalStorage();
  ctx.localStorage = mockStorage;
  S = ctx.localRequire('./stats.js');
});

describe('recordGame', () => {
  test('記錄一勝', () => {
    const s = S.recordGame(S.emptyStats(), 'go', 'L5', 'win');
    expect(s.go.L5).toEqual({ w: 1, l: 0, d: 0 });
  });

  test('記錄一敗', () => {
    const s = S.recordGame(S.emptyStats(), 'chess', 'L2', 'loss');
    expect(s.chess.L2).toEqual({ w: 0, l: 1, d: 0 });
  });

  test('記錄一和', () => {
    const s = S.recordGame(S.emptyStats(), 'othello', 'L1', 'draw');
    expect(s.othello.L1).toEqual({ w: 0, l: 0, d: 1 });
  });

  test('同棋同難度累計多局', () => {
    let s = S.emptyStats();
    s = S.recordGame(s, 'gomoku', 'L1', 'win');
    s = S.recordGame(s, 'gomoku', 'L1', 'win');
    s = S.recordGame(s, 'gomoku', 'L1', 'loss');
    expect(s.gomoku.L1).toEqual({ w: 2, l: 1, d: 0 });
  });

  test('不可變：原 stats 不被修改', () => {
    const orig = S.emptyStats();
    const s = S.recordGame(orig, 'go', 'L5', 'win');
    expect(orig).toEqual({});
    expect(s).not.toBe(orig);
  });

  test('不可變：既有資料的物件也不被就地修改', () => {
    const orig = S.recordGame(S.emptyStats(), 'go', 'L5', 'win');
    const next = S.recordGame(orig, 'go', 'L5', 'win');
    expect(orig.go.L5).toEqual({ w: 1, l: 0, d: 0 });
    expect(next.go.L5).toEqual({ w: 2, l: 0, d: 0 });
    expect(next).not.toBe(orig);
    expect(next.go).not.toBe(orig.go);
  });

  test('非法 outcome 不記錄，原樣回傳同一參考', () => {
    const orig = S.emptyStats();
    const s = S.recordGame(orig, 'go', 'L5', 'giveup');
    expect(s).toBe(orig);
    expect(s).toEqual({});
  });

  test('undefined outcome 不記錄', () => {
    const orig = S.recordGame(S.emptyStats(), 'go', 'L5', 'win');
    const s = S.recordGame(orig, 'go', 'L5', undefined);
    expect(s).toBe(orig);
  });

  test('difficulty 為 undefined 時記入 unknown', () => {
    const s = S.recordGame(S.emptyStats(), 'shogi', undefined, 'win');
    expect(s.shogi.unknown).toEqual({ w: 1, l: 0, d: 0 });
  });

  test('difficulty 為空字串時記入 unknown', () => {
    const s = S.recordGame(S.emptyStats(), 'shogi', '', 'loss');
    expect(s.shogi.unknown).toEqual({ w: 0, l: 1, d: 0 });
  });
});

describe('totals', () => {
  test('跨難度加總', () => {
    let s = S.emptyStats();
    s = S.recordGame(s, 'xiangqi', 'L1', 'win');
    s = S.recordGame(s, 'xiangqi', 'L2', 'win');
    s = S.recordGame(s, 'xiangqi', 'L2', 'loss');
    s = S.recordGame(s, 'xiangqi', 'L3', 'draw');
    expect(S.totals(s, 'xiangqi')).toEqual({ w: 2, l: 1, d: 1 });
  });

  test('查無棋種回全 0', () => {
    const s = S.recordGame(S.emptyStats(), 'go', 'L5', 'win');
    expect(S.totals(s, 'connect6')).toEqual({ w: 0, l: 0, d: 0 });
  });

  test('空 stats 回全 0', () => {
    expect(S.totals(S.emptyStats(), 'go')).toEqual({ w: 0, l: 0, d: 0 });
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
    const s = S.recordGame(S.emptyStats(), 'go', 'L5', 'win');
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
