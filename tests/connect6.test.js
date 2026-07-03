const { sandboxWithConnect6 } = require('./helpers');

let Connect6Rules, Connect6AI, BLACK, WHITE, EMPTY;
beforeAll(() => {
  const ctx = sandboxWithConnect6();
  ({ Connect6Rules, Connect6AI, BLACK, WHITE, EMPTY } = ctx);
});

// ─── helpers ────────────────────────────────────────────────────────────────

function emptyBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(EMPTY));
}

/** Place a run of `player` stones along (dr,dc) starting at (r,c). Returns the last cell. */
function placeRun(board, r, c, dr, dc, n, player) {
  let last = [r, c];
  for (let i = 0; i < n; i++) {
    const rr = r + dr * i, cc = c + dc * i;
    board[rr][cc] = player;
    last = [rr, cc];
  }
  return last;
}

// ─── connect6-rules: 常數 ─────────────────────────────────────────────────────

describe('Connect6Rules constants', () => {
  test('19 路盤、連 6 勝', () => {
    expect(Connect6Rules.SIZE).toBe(19);
    expect(Connect6Rules.WIN_LEN).toBe(6);
  });
});

// ─── connect6-rules: canPlace ─────────────────────────────────────────────────

describe('canPlace', () => {
  const size = 9;
  test('界內空點可下', () => {
    expect(Connect6Rules.canPlace(emptyBoard(size), size, 3, 3)).toBe(true);
  });
  test('已有子不可下', () => {
    const b = emptyBoard(size); b[3][3] = BLACK;
    expect(Connect6Rules.canPlace(b, size, 3, 3)).toBe(false);
  });
  test('界外不可下', () => {
    const b = emptyBoard(size);
    expect(Connect6Rules.canPlace(b, size, -1, 0)).toBe(false);
    expect(Connect6Rules.canPlace(b, size, 0, size)).toBe(false);
  });
});

// ─── connect6-rules: checkWin ─────────────────────────────────────────────────

describe('checkWin', () => {
  const size = 11;

  test('橫向六連判勝', () => {
    const b = emptyBoard(size);
    const [r, c] = placeRun(b, 4, 2, 0, 1, 6, BLACK);
    const w = Connect6Rules.checkWin(b, size, r, c, BLACK);
    expect(w.won).toBe(true);
    expect(w.line).toHaveLength(6);
  });

  test('直向六連判勝', () => {
    const b = emptyBoard(size);
    const [r, c] = placeRun(b, 1, 4, 1, 0, 6, WHITE);
    expect(Connect6Rules.checkWin(b, size, r, c, WHITE).won).toBe(true);
  });

  test('主對角 ↘ 六連判勝', () => {
    const b = emptyBoard(size);
    const [r, c] = placeRun(b, 1, 1, 1, 1, 6, BLACK);
    expect(Connect6Rules.checkWin(b, size, r, c, BLACK).won).toBe(true);
  });

  test('副對角 ↙ 六連判勝', () => {
    const b = emptyBoard(size);
    const [r, c] = placeRun(b, 1, 9, 1, -1, 6, BLACK);
    expect(Connect6Rules.checkWin(b, size, r, c, BLACK).won).toBe(true);
  });

  test('長連（七連）也判勝', () => {
    const b = emptyBoard(size);
    const [r, c] = placeRun(b, 4, 1, 0, 1, 7, BLACK);
    const w = Connect6Rules.checkWin(b, size, r, c, BLACK);
    expect(w.won).toBe(true);
    expect(w.line.length).toBeGreaterThanOrEqual(6);
  });

  test('只有五連不判勝', () => {
    const b = emptyBoard(size);
    const [r, c] = placeRun(b, 4, 2, 0, 1, 5, BLACK);
    const w = Connect6Rules.checkWin(b, size, r, c, BLACK);
    expect(w.won).toBe(false);
    expect(w.line).toHaveLength(0);
  });

  test('邊界六連判勝', () => {
    const b = emptyBoard(size);
    const [r, c] = placeRun(b, 0, size - 1, 1, 0, 6, BLACK);
    expect(Connect6Rules.checkWin(b, size, r, c, BLACK).won).toBe(true);
  });
});

// ─── connect6-rules: isBoardFull ──────────────────────────────────────────────

describe('isBoardFull', () => {
  test('空盤不算滿', () => {
    expect(Connect6Rules.isBoardFull(emptyBoard(3), 3)).toBe(false);
  });
  test('全滿算滿', () => {
    const b = Array.from({ length: 3 }, () => Array(3).fill(BLACK));
    expect(Connect6Rules.isBoardFull(b, 3)).toBe(true);
  });
});

// ─── connect6-ai: bestTurn ────────────────────────────────────────────────────

describe('bestTurn', () => {
  const size = 11;

  test('quota=2 回傳 2 子', () => {
    const b = emptyBoard(size);
    b[5][5] = BLACK; // 有子讓 candidates 非空
    const moves = Connect6AI.bestTurn(b, size, WHITE, 2, 2);
    expect(moves).toHaveLength(2);
    // 兩子不同點
    expect(moves[0].r === moves[1].r && moves[0].c === moves[1].c).toBe(false);
  });

  test('quota=1（首回合）回傳 1 子；空盤下天元', () => {
    const b = emptyBoard(size);
    const moves = Connect6AI.bestTurn(b, size, BLACK, 2, 1);
    expect(moves).toHaveLength(1);
    const mid = (size / 2) | 0;
    expect(moves[0]).toEqual({ r: mid, c: mid });
  });

  test('存在致勝點時第一子即取勝（補成六）', () => {
    const b = emptyBoard(size);
    placeRun(b, 4, 2, 0, 1, 5, BLACK); // 黑五連，(4,1) 或 (4,7) 可成六
    const moves = Connect6AI.bestTurn(b, size, BLACK, 2, 2);
    const first = moves[0];
    b[first.r][first.c] = BLACK;
    expect(Connect6Rules.checkWin(b, size, first.r, first.c, BLACK).won).toBe(true);
    // 已致勝，提早結束只下一子
    expect(moves).toHaveLength(1);
  });

  test('對手五連能成六時，AI 會擋（其中一子落在完成點）', () => {
    const b = emptyBoard(size);
    placeRun(b, 4, 2, 0, 1, 5, WHITE); // 白五連威脅 (4,1)/(4,7)
    const moves = Connect6AI.bestTurn(b, size, BLACK, 2, 2);
    const blocks = moves.some(
      (m) => (m.r === 4 && m.c === 1) || (m.r === 4 && m.c === 7)
    );
    expect(blocks).toBe(true);
  });

  test('placeScore 不改動盤面', () => {
    const b = emptyBoard(size);
    placeRun(b, 4, 2, 0, 1, 4, BLACK);
    const snap = JSON.stringify(b);
    Connect6AI.placeScore(b, size, 4, 6, BLACK);
    expect(JSON.stringify(b)).toBe(snap);
  });

  test('bestTurn 不改動原盤（在副本上試放）', () => {
    const b = emptyBoard(size);
    b[5][5] = BLACK;
    const snap = JSON.stringify(b);
    Connect6AI.bestTurn(b, size, WHITE, 2, 2);
    expect(JSON.stringify(b)).toBe(snap);
  });
});
