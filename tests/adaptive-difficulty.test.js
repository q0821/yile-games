const { sandboxWithAdaptive } = require('./helpers');

let A;
beforeAll(() => {
  A = sandboxWithAdaptive();
});

describe('levelConfig', () => {
  test('clamps to valid range', () => {
    expect(A.levelConfig(0).level).toBe(1);
    expect(A.levelConfig(999).level).toBe(A.MAX_LEVEL);
  });
  test('higher level → more visits, fewer points allowed lost', () => {
    const lo = A.levelConfig(1), hi = A.levelConfig(A.MAX_LEVEL);
    expect(hi.visits).toBeGreaterThan(lo.visits);
    expect(hi.maxPointsLost).toBeLessThan(lo.maxPointsLost);
  });
  test('top level only plays the best move (maxPointsLost 0)', () => {
    expect(A.levelConfig(A.MAX_LEVEL).maxPointsLost).toBe(0);
  });
});

describe('nextLevel (ladder: win big to climb, lose big to drop)', () => {
  test('big win promotes', () => {
    expect(A.nextLevel(3, 10)).toEqual({ level: 4, change: 'up' });
    expect(A.nextLevel(3, 25)).toEqual({ level: 4, change: 'up' });
  });
  test('small win stays', () => {
    expect(A.nextLevel(3, 5)).toEqual({ level: 3, change: 'same' });
  });
  test('small loss stays (ladder does not pander)', () => {
    expect(A.nextLevel(5, -5)).toEqual({ level: 5, change: 'same' });
  });
  test('big loss demotes', () => {
    expect(A.nextLevel(5, -20)).toEqual({ level: 4, change: 'down' });
  });
  test('cannot go below min or above max', () => {
    expect(A.nextLevel(A.MIN_LEVEL, -50)).toEqual({ level: A.MIN_LEVEL, change: 'same' });
    expect(A.nextLevel(A.MAX_LEVEL, 50)).toEqual({ level: A.MAX_LEVEL, change: 'same' });
  });
});

describe('kyuLabel', () => {
  test('formats an estimated kyu', () => {
    expect(A.kyuLabel(1)).toMatch(/級/);
  });
});

describe('pickMove (random weakening)', () => {
  const moves = [
    { x: 0, y: 0, pointsLost: 0, order: 0 },
    { x: 1, y: 1, pointsLost: 3, order: 1 },
    { x: 2, y: 2, pointsLost: 12, order: 2 },
  ];
  test('top level picks only the best (pointsLost 0)', () => {
    const m = A.pickMove(moves, A.MAX_LEVEL, () => 0.99);
    expect(m).toEqual(moves[0]);
  });
  test('low level can pick a worse move within its tolerance', () => {
    // level 1 maxPointsLost is large → pool includes the 12-loss move; rng→last
    const m = A.pickMove(moves, 1, () => 0.99);
    expect(m.pointsLost).toBeGreaterThan(0);
  });
  test('never returns null for a non-empty list', () => {
    expect(A.pickMove(moves, 5, () => 0)).toBeTruthy();
  });
  test('empty list → null', () => {
    expect(A.pickMove([], 5)).toBeNull();
  });
});

describe('nextLevelForMode（手動選級模式不自動升降）', () => {
  test('manual 模式贏再多也不升級', () => {
    expect(A.nextLevelForMode(5, 30, 'manual')).toEqual({ level: 5, change: 'same' });
  });
  test('manual 模式輸再多也不降級', () => {
    expect(A.nextLevelForMode(5, -50, 'manual')).toEqual({ level: 5, change: 'same' });
  });
  test('manual 模式等級仍夾在合法範圍', () => {
    expect(A.nextLevelForMode(999, 0, 'manual')).toEqual({ level: A.MAX_LEVEL, change: 'same' });
  });
  test('auto 模式行為等同 nextLevel', () => {
    expect(A.nextLevelForMode(3, 10, 'auto')).toEqual(A.nextLevel(3, 10));
    expect(A.nextLevelForMode(5, -20, 'auto')).toEqual(A.nextLevel(5, -20));
  });
});
