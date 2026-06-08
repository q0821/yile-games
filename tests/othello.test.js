const { sandboxWithOthello } = require('./helpers');

let Rules, AI, BLACK, WHITE, EMPTY;
beforeAll(() => {
  const ctx = sandboxWithOthello();
  ({ OthelloRules: Rules, OthelloAI: AI, BLACK, WHITE, EMPTY } = ctx);
});

const SIZE = 8;

/** 8×8 盤：8 列以 '/' 分隔，'.'=空、'B'=黑、'W'=白。 */
function boardFrom(tpl) {
  const rows = tpl.split('/');
  return rows.map((row) => [...row].map((ch) => (ch === 'B' ? BLACK : ch === 'W' ? WHITE : EMPTY)));
}
function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
}
function sortMoves(ms) { return ms.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); }

// ─── 起始盤 ───

describe('newBoard', () => {
  test('8×8，中央四子正確、其餘空', () => {
    const b = Rules.newBoard(SIZE);
    expect(b).toHaveLength(8);
    expect(b[3][3]).toBe(WHITE);
    expect(b[3][4]).toBe(BLACK);
    expect(b[4][3]).toBe(BLACK);
    expect(b[4][4]).toBe(WHITE);
    const s = Rules.score(b, SIZE);
    expect(s).toEqual({ black: 2, white: 2 });
  });
});

// ─── 合法手 / 翻子 ───

describe('legalMoves / flips', () => {
  test('黑方開局有 4 個合法手（標準四點）', () => {
    const b = Rules.newBoard(SIZE);
    const moves = sortMoves(Rules.legalMoves(b, SIZE, BLACK));
    expect(moves).toHaveLength(4);
    expect(moves).toEqual([[2, 3], [3, 2], [4, 5], [5, 4]]);
  });

  test('開局黑下 (2,3) 夾翻 (3,3)', () => {
    const b = Rules.newBoard(SIZE);
    expect(Rules.flips(b, SIZE, 2, 3, BLACK)).toEqual([[3, 3]]);
  });

  test('夾不到對方子 → 非法（空陣列）', () => {
    const b = Rules.newBoard(SIZE);
    expect(Rules.flips(b, SIZE, 0, 0, BLACK)).toEqual([]);   // 角落起手不合法
    expect(Rules.flips(b, SIZE, 2, 2, BLACK)).toEqual([]);   // 沒夾到
  });

  test('已有子的格不可下', () => {
    const b = Rules.newBoard(SIZE);
    expect(Rules.flips(b, SIZE, 3, 3, BLACK)).toEqual([]);
  });

  test('一手可同時往多方向夾翻', () => {
    // 中央白被黑三面包，黑下中心同時翻多顆
    // 列 r=2..4，黑在外圈、白在內，黑下 (3,3) 往上/左/右翻
    const b = boardFrom(
      '......../' +
      '......../' +
      '...B..../' +
      '.BWoWB../'.replace('o', '.') + // (3,1)B (3,2)W (3,3). (3,4)W (3,5)B
      '...B..../' +
      '......../' +
      '......../' +
      '........'
    );
    const fl = Rules.flips(b, SIZE, 3, 3, BLACK);
    // 左翻 (3,2)W、右翻 (3,4)W、上翻 (2,3)? (2,3)=B 非白 → 不翻；下 (4,3)B 非白
    const set = new Set(fl.map((x) => x.join(',')));
    expect(set.has('3,2')).toBe(true);
    expect(set.has('3,4')).toBe(true);
  });
});

// ─── applyMove / score ───

describe('applyMove', () => {
  test('套用後落子+翻子皆變己方色，回傳翻子', () => {
    const b = Rules.newBoard(SIZE);
    const fl = Rules.applyMove(b, SIZE, 2, 3, BLACK);
    expect(fl).toEqual([[3, 3]]);
    expect(b[2][3]).toBe(BLACK);
    expect(b[3][3]).toBe(BLACK);
    expect(Rules.score(b, SIZE)).toEqual({ black: 4, white: 1 });
  });

  test('非法手不改動、回空', () => {
    const b = Rules.newBoard(SIZE);
    const snap = JSON.stringify(b);
    expect(Rules.applyMove(b, SIZE, 0, 0, BLACK)).toEqual([]);
    expect(JSON.stringify(b)).toBe(snap);
  });
});

// ─── pass / 終局 ───

describe('hasLegalMove / isGameOver', () => {
  test('開局雙方皆有手、未終局', () => {
    const b = Rules.newBoard(SIZE);
    expect(Rules.hasLegalMove(b, SIZE, BLACK)).toBe(true);
    expect(Rules.hasLegalMove(b, SIZE, WHITE)).toBe(true);
    expect(Rules.isGameOver(b, SIZE)).toBe(false);
  });

  test('滿盤即終局（雙方皆無手）', () => {
    const full = Array.from({ length: SIZE }, () => Array(SIZE).fill(BLACK));
    expect(Rules.isGameOver(full, SIZE)).toBe(true);
  });
});

// ─── AI ───

describe('AI bestMove', () => {
  test('回傳合法手', () => {
    const b = Rules.newBoard(SIZE);
    const mv = AI.bestMove(b, SIZE, BLACK, 2);
    const legal = Rules.legalMoves(b, SIZE, BLACK).some(([r, c]) => r === mv.r && c === mv.c);
    expect(legal).toBe(true);
  });

  test('無合法手回 null', () => {
    const full = Array.from({ length: SIZE }, () => Array(SIZE).fill(WHITE));
    expect(AI.bestMove(full, SIZE, BLACK, 2)).toBe(null);
  });

  test('注入 rng 使選擇可重現', () => {
    const b = Rules.newBoard(SIZE);
    const rng = () => 0;
    expect(AI.bestMove(b, SIZE, BLACK, 2, rng)).toEqual(AI.bestMove(Rules.newBoard(SIZE), SIZE, BLACK, 2, rng));
  });
});

describe('AI evaluate（位置權重）', () => {
  test('佔角優於佔角旁 X 位', () => {
    const corner = emptyBoard(); corner[0][0] = BLACK;
    const xsquare = emptyBoard(); xsquare[1][1] = BLACK;
    expect(AI.evaluate(corner, SIZE, BLACK)).toBeGreaterThan(AI.evaluate(xsquare, SIZE, BLACK));
  });
});
