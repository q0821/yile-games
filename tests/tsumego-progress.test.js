const { sandboxWithTsumegoProgress } = require('./helpers');

let P;
beforeAll(() => {
  P = sandboxWithTsumegoProgress().TsumegoProgress;
});

describe('recordResult', () => {
  test('首次即對：correct + firstTry', () => {
    const p = P.recordResult(P.emptyProgress(), 'beginner', 'a/001', 'correct');
    expect(P.isSolved(p, 'beginner', 'a/001')).toBe(true);
    expect(P.solvedCount(p, 'beginner')).toBe(1);
    expect(P.firstTryCount(p, 'beginner')).toBe(1);
  });

  test('先答錯再答對：算解出但非首次即對', () => {
    let p = P.recordResult(P.emptyProgress(), 'beginner', 'a/001', 'attempted');
    p = P.recordResult(p, 'beginner', 'a/001', 'correct');
    expect(P.isSolved(p, 'beginner', 'a/001')).toBe(true);
    expect(P.solvedCount(p, 'beginner')).toBe(1);
    expect(P.firstTryCount(p, 'beginner')).toBe(0);
  });

  test('看答案再答對：非首次即對', () => {
    let p = P.recordResult(P.emptyProgress(), 'beginner', 'a/002', 'revealed');
    p = P.recordResult(p, 'beginner', 'a/002', 'correct');
    expect(P.firstTryCount(p, 'beginner')).toBe(0);
    expect(P.isSolved(p, 'beginner', 'a/002')).toBe(true);
  });

  test('只答錯、沒答對：不算 solved', () => {
    const p = P.recordResult(P.emptyProgress(), 'beginner', 'a/003', 'attempted');
    expect(P.isSolved(p, 'beginner', 'a/003')).toBe(false);
    expect(P.solvedCount(p, 'beginner')).toBe(0);
  });

  test('不可變：原 progress 不被修改', () => {
    const orig = P.emptyProgress();
    const p = P.recordResult(orig, 'beginner', 'a/001', 'correct');
    expect(orig).toEqual({});
    expect(p).not.toBe(orig);
  });

  test('重複答對不會重複計數', () => {
    let p = P.recordResult(P.emptyProgress(), 'beginner', 'a/001', 'correct');
    p = P.recordResult(p, 'beginner', 'a/001', 'correct');
    expect(P.solvedCount(p, 'beginner')).toBe(1);
  });

  test('不同級別各自計數', () => {
    let p = P.recordResult(P.emptyProgress(), 'beginner', 'a/001', 'correct');
    p = P.recordResult(p, 'advanced', 'c/001', 'correct');
    expect(P.solvedCount(p, 'beginner')).toBe(1);
    expect(P.solvedCount(p, 'advanced')).toBe(1);
  });
});

describe('lastIndex', () => {
  test('預設為 0', () => {
    expect(P.getLastIndex(P.emptyProgress(), 'beginner')).toBe(0);
  });

  test('設定後可讀回，且不影響 solved', () => {
    let p = P.recordResult(P.emptyProgress(), 'beginner', 'a/001', 'correct');
    p = P.setLastIndex(p, 'beginner', 42);
    expect(P.getLastIndex(p, 'beginner')).toBe(42);
    expect(P.solvedCount(p, 'beginner')).toBe(1);
  });
});
