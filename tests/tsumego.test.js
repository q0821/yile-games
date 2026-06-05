const { sandboxWithTsumego } = require('./helpers');

let ctx;
beforeAll(() => {
  ctx = sandboxWithTsumego();
});

const EMPTY = 0, BLACK = 1, WHITE = 2;

// 三筆真實樣本（取自 HANDOFF_TSUMEGO.md / 題庫）
const SAMPLE_BEGINNER = {
  AB: ['eb', 'fb', 'bc', 'cc', 'dc', 'be'],
  AW: ['da', 'ab', 'bb', 'cb', 'db'],
  SZ: '19', C: 'Black to play: Elementary',
  SOL: [['B', 'ba', 'Correct.', '']]
};

const SAMPLE_MULTI = {
  // 並列正解：兩個都是黑棋的關鍵點
  AB: ['ca', 'da', 'db', 'cc'],
  AW: ['aa', 'ba', 'bb', 'bc'],
  SZ: '19', C: 'Black to play',
  SOL: [['B', 'bb', '', ''], ['B', 'ea', '', '']]
};

// ─── sgfToRC / rcToSgf ────────────────────────────────────────────────────────

describe('sgfToRC', () => {
  test('第一字母是 column、第二字母是 row（本專案 SGF 座標慣例）', () => {
    // "ba" → col=indexOf('b')=1, row=indexOf('a')=0
    expect(ctx.sgfToRC('ba')).toEqual({ row: 0, col: 1 });
  });

  test('不對稱座標不會 row/col 反掉', () => {
    // "eb" → col=indexOf('e')=4, row=indexOf('b')=1
    expect(ctx.sgfToRC('eb')).toEqual({ row: 1, col: 4 });
  });

  test('19 路最後一點 "ss"', () => {
    expect(ctx.sgfToRC('ss')).toEqual({ row: 18, col: 18 });
  });

  test('非法座標丟錯', () => {
    expect(() => ctx.sgfToRC('zz')).toThrow();
  });
});

describe('rcToSgf', () => {
  test('與 sgfToRC 互為反向', () => {
    expect(ctx.rcToSgf(0, 1)).toBe('ba');
    expect(ctx.rcToSgf(1, 4)).toBe('eb');
    expect(ctx.rcToSgf(18, 18)).toBe('ss');
  });
});

// ─── parseProblem ─────────────────────────────────────────────────────────────

describe('parseProblem', () => {
  test('解析 size / toPlay / answers / 加子清單', () => {
    const p = ctx.parseProblem(SAMPLE_BEGINNER);
    expect(p.size).toBe(19);
    expect(p.toPlay).toBe('B');
    expect(p.answers).toEqual([{ color: 'B', row: 0, col: 1 }]);
    expect(p.addBlack).toContainEqual({ row: 1, col: 4 }); // eb
    expect(p.addWhite).toContainEqual({ row: 0, col: 3 }); // da
    expect(p.addBlack).toHaveLength(6);
    expect(p.addWhite).toHaveLength(5);
  });

  test('toPlay 由 SOL 第一手顏色決定', () => {
    const whiteToPlay = ctx.parseProblem({ AB: [], AW: [], SZ: '19', C: '', SOL: [['W', 'ba', '', '']] });
    expect(whiteToPlay.toPlay).toBe('W');
  });

  test('多列 SOL 全部解析為並列正解', () => {
    const p = ctx.parseProblem(SAMPLE_MULTI);
    expect(p.answers).toHaveLength(2);
    expect(p.answers).toContainEqual({ color: 'B', row: 1, col: 1 }); // bb
    expect(p.answers).toContainEqual({ color: 'B', row: 0, col: 4 }); // ea
  });
});

// ─── buildBoardFromProblem ────────────────────────────────────────────────────

describe('buildBoardFromProblem', () => {
  test('產生 size×size 盤並擺上黑白子', () => {
    const p = ctx.parseProblem(SAMPLE_BEGINNER);
    const board = ctx.buildBoardFromProblem(p);
    expect(board).toHaveLength(19);
    expect(board[1][4]).toBe(BLACK); // eb
    expect(board[0][3]).toBe(WHITE); // da
    expect(board[0][1]).toBe(EMPTY); // ba 是正解點，盤面應為空
  });

  test('擺子數量正確、其餘為空', () => {
    const p = ctx.parseProblem(SAMPLE_BEGINNER);
    const board = ctx.buildBoardFromProblem(p);
    let black = 0, white = 0;
    for (const row of board) for (const c of row) {
      if (c === BLACK) black++;
      else if (c === WHITE) white++;
    }
    expect(black).toBe(6);
    expect(white).toBe(5);
  });
});

// ─── checkAnswer ──────────────────────────────────────────────────────────────

describe('checkAnswer', () => {
  test('命中關鍵點為正解', () => {
    const p = ctx.parseProblem(SAMPLE_BEGINNER);
    expect(ctx.checkAnswer(p, 0, 1)).toBe(true); // ba
  });

  test('落在已有棋子或他處為非正解', () => {
    const p = ctx.parseProblem(SAMPLE_BEGINNER);
    expect(ctx.checkAnswer(p, 1, 4)).toBe(false); // 黑子位置
    expect(ctx.checkAnswer(p, 10, 10)).toBe(false);
  });

  test('並列正解：命中任一列都算對', () => {
    const p = ctx.parseProblem(SAMPLE_MULTI);
    expect(ctx.checkAnswer(p, 1, 1)).toBe(true); // bb
    expect(ctx.checkAnswer(p, 0, 4)).toBe(true); // ea
    expect(ctx.checkAnswer(p, 5, 5)).toBe(false);
  });
});

// ─── computeViewport（局部裁切顯示）─────────────────────────────────────────────

describe('computeViewport', () => {
  test('回傳含所有棋子與正解點、加上邊距並裁切到盤內', () => {
    const p = ctx.parseProblem(SAMPLE_BEGINNER);
    const vp = ctx.computeViewport(p, 2);
    // 棋子+正解 rows: 0..4, cols: 0..5；margin 2 後裁到 [0,size-1]
    expect(vp.minRow).toBe(0);
    expect(vp.maxRow).toBe(6);
    expect(vp.minCol).toBe(0);
    expect(vp.maxCol).toBe(7);
  });

  test('邊距不會超出盤面範圍', () => {
    const p = ctx.parseProblem(SAMPLE_BEGINNER);
    const vp = ctx.computeViewport(p, 100);
    expect(vp.minRow).toBe(0);
    expect(vp.minCol).toBe(0);
    expect(vp.maxRow).toBe(18);
    expect(vp.maxCol).toBe(18);
  });

  test('空題（無棋子）回傳整盤', () => {
    const p = ctx.parseProblem({ AB: [], AW: [], SZ: '19', C: '', SOL: [] });
    const vp = ctx.computeViewport(p, 2);
    expect(vp).toEqual({ minRow: 0, maxRow: 18, minCol: 0, maxCol: 18 });
  });
});
