const { sandboxWithAdaptiveChess } = require('./helpers');

let A;
beforeAll(() => {
  A = sandboxWithAdaptiveChess();
});

describe('levelConfig', () => {
  test('clamps to valid range', () => {
    expect(A.levelConfig(0)).toEqual(A.levelConfig(1));
    expect(A.levelConfig(999)).toEqual(A.levelConfig(A.MAX_LEVEL));
  });
  test('higher level → deeper search, tighter window', () => {
    const lo = A.levelConfig(1), hi = A.levelConfig(A.MAX_LEVEL);
    expect(hi.depth).toBeGreaterThan(lo.depth);
    expect(hi.window).toBeLessThan(lo.window);
  });
  test('top level only plays best move (window 0, multipv 1)', () => {
    expect(A.levelConfig(A.MAX_LEVEL).window).toBe(0);
    expect(A.levelConfig(A.MAX_LEVEL).multipv).toBe(1);
  });
});

describe('MANUAL_TO_LEVEL maps 簡單/普通/困難', () => {
  test('three anchors are valid, ascending levels', () => {
    const e = A.MANUAL_TO_LEVEL[1], n = A.MANUAL_TO_LEVEL[2], h = A.MANUAL_TO_LEVEL[3];
    expect(e).toBeLessThan(n);
    expect(n).toBeLessThan(h);
    expect(A.clampLevel(h)).toBe(h); // 在合法範圍內
  });
});

describe('nextLevel (連勝連敗階梯，2 盤才升降)', () => {
  test('單盤 ai 輸 → 計數 +1、等級不動', () => {
    expect(A.nextLevel(5, 0, 'ai-lost')).toEqual({ level: 5, streak: 1, change: 'same' });
  });
  test('連 2 盤 ai 輸 → 升一級、計數歸零', () => {
    const r1 = A.nextLevel(5, 0, 'ai-lost'); // streak 1
    expect(A.nextLevel(5, r1.streak, 'ai-lost')).toEqual({ level: 6, streak: 0, change: 'up' });
  });
  test('單盤 ai 贏 → 計數 -1、等級不動', () => {
    expect(A.nextLevel(5, 0, 'ai-won')).toEqual({ level: 5, streak: -1, change: 'same' });
  });
  test('連 2 盤 ai 贏 → 降一級、計數歸零', () => {
    const r1 = A.nextLevel(5, 0, 'ai-won'); // streak -1
    expect(A.nextLevel(5, r1.streak, 'ai-won')).toEqual({ level: 4, streak: 0, change: 'down' });
  });
  test('反向結果使計數從新方向重新起算（不會直接升降）', () => {
    // 先 ai 輸一盤（+1），再 ai 贏一盤 → 應變成 -1、不降級
    expect(A.nextLevel(5, 1, 'ai-won')).toEqual({ level: 5, streak: -1, change: 'same' });
  });
  test('和棋 → 計數歸零、等級不動', () => {
    expect(A.nextLevel(5, 1, 'draw')).toEqual({ level: 5, streak: 0, change: 'same' });
    expect(A.nextLevel(5, -1, 'draw')).toEqual({ level: 5, streak: 0, change: 'same' });
  });
  test('已達最高級：連敗也不溢位（封頂、change same）', () => {
    const top = A.MAX_LEVEL;
    const r = A.nextLevel(top, 1, 'ai-lost');
    expect(r.level).toBe(top);
    expect(r.change).toBe('same');
    expect(Math.abs(r.streak)).toBeLessThanOrEqual(2);
  });
  test('已達最低級：連勝也不溢位（封頂、change same）', () => {
    const r = A.nextLevel(A.MIN_LEVEL, -1, 'ai-won');
    expect(r.level).toBe(A.MIN_LEVEL);
    expect(r.change).toBe('same');
    expect(Math.abs(r.streak)).toBeLessThanOrEqual(2);
  });
});

describe('levelLabel', () => {
  test('格式為「第 N 級」並夾範圍', () => {
    expect(A.levelLabel(3)).toBe('第 3 級');
    expect(A.levelLabel(999)).toBe(`第 ${A.MAX_LEVEL} 級`);
  });
});
