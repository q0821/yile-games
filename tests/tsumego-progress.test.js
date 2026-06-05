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

describe('複習佇列（needsReview / reviewIds）', () => {
  test('首次即對的題不需複習', () => {
    const p = P.recordResult(P.emptyProgress(), 'beginner', 'a/001', 'correct');
    expect(P.reviewCount(p, 'beginner')).toBe(0);
  });

  test('只答錯沒解出 → 進複習佇列', () => {
    const p = P.recordResult(P.emptyProgress(), 'beginner', 'a/003', 'attempted');
    expect(P.reviewIds(p, 'beginner')).toEqual(['a/003']);
  });

  test('答錯再答對（非乾淨）→ 仍在複習佇列', () => {
    let p = P.recordResult(P.emptyProgress(), 'beginner', 'a/001', 'attempted');
    p = P.recordResult(p, 'beginner', 'a/001', 'correct', { clean: false });
    expect(P.isSolved(p, 'beginner', 'a/001')).toBe(true);
    expect(P.reviewCount(p, 'beginner')).toBe(1);
  });

  test('複習時「乾淨」答對 → 移出複習佇列（cleared）', () => {
    let p = P.recordResult(P.emptyProgress(), 'beginner', 'a/001', 'attempted');
    p = P.recordResult(p, 'beginner', 'a/001', 'correct', { clean: false }); // 先掙扎解出
    expect(P.reviewCount(p, 'beginner')).toBe(1);
    p = P.recordResult(p, 'beginner', 'a/001', 'correct', { clean: true });  // 回頭乾淨答對
    expect(P.reviewCount(p, 'beginner')).toBe(0);
  });

  test('看答案後也進複習佇列', () => {
    const p = P.recordResult(P.emptyProgress(), 'beginner', 'a/002', 'revealed');
    expect(P.reviewCount(p, 'beginner')).toBe(1);
  });
});

describe('連勝（streak / bestStreak）', () => {
  test('連續乾淨答對累計連勝與最佳連勝', () => {
    let p = P.emptyProgress();
    p = P.recordResult(p, 'beginner', 'a/001', 'correct'); // clean 由「沒碰過」推斷
    p = P.recordResult(p, 'beginner', 'a/002', 'correct');
    p = P.recordResult(p, 'beginner', 'a/003', 'correct');
    expect(P.streak(p)).toBe(3);
    expect(P.bestStreak(p)).toBe(3);
  });

  test('答錯使連勝歸零，但最佳連勝保留', () => {
    let p = P.emptyProgress();
    p = P.recordResult(p, 'beginner', 'a/001', 'correct');
    p = P.recordResult(p, 'beginner', 'a/002', 'correct');
    p = P.recordResult(p, 'beginner', 'a/099', 'attempted');
    expect(P.streak(p)).toBe(0);
    expect(P.bestStreak(p)).toBe(2);
  });
});

describe('今日題數（dailyCount）', () => {
  test('提供 today 時計入當日新解出的題', () => {
    let p = P.emptyProgress();
    p = P.recordResult(p, 'beginner', 'a/001', 'correct', { today: '2026-06-05' });
    p = P.recordResult(p, 'beginner', 'a/002', 'correct', { today: '2026-06-05' });
    expect(P.dailyCount(p, '2026-06-05')).toBe(2);
    expect(P.dailyCount(p, '2026-06-06')).toBe(0);
  });

  test('重複解同一題不重複計入當日', () => {
    let p = P.recordResult(P.emptyProgress(), 'beginner', 'a/001', 'correct', { today: '2026-06-05' });
    p = P.recordResult(p, 'beginner', 'a/001', 'correct', { today: '2026-06-05' });
    expect(P.dailyCount(p, '2026-06-05')).toBe(1);
  });

  test('未提供 today 時不記錄當日（向後相容）', () => {
    const p = P.recordResult(P.emptyProgress(), 'beginner', 'a/001', 'correct');
    expect(P.dailyCount(p, '2026-06-05')).toBe(0);
  });
});

describe('向後相容：舊存檔（無 _meta / cleared）', () => {
  test('舊格式 progress 可正常讀統計、不報錯', () => {
    const legacy = { beginner: { solved: { 'a/001': { correct: true, firstTry: true } }, lastIndex: 5 } };
    expect(P.solvedCount(legacy, 'beginner')).toBe(1);
    expect(P.streak(legacy)).toBe(0);
    expect(P.dailyCount(legacy, '2026-06-05')).toBe(0);
    expect(P.totalSolved(legacy)).toBe(1);
    // 在舊存檔上再記錄，不會壞
    const p = P.recordResult(legacy, 'beginner', 'a/002', 'correct');
    expect(P.solvedCount(p, 'beginner')).toBe(2);
    expect(legacy.beginner.solved['a/002']).toBeUndefined(); // 不可變
  });

  test('totalSolved 跳過 _meta 等全域 key', () => {
    let p = P.recordResult(P.emptyProgress(), 'beginner', 'a/001', 'correct');
    p = P.recordResult(p, 'advanced', 'c/001', 'correct');
    expect(P.totalSolved(p)).toBe(2);
  });
});
