const { sandboxWithGomoku } = require('./helpers');

let GomokuRules, GomokuAI, BLACK, WHITE, EMPTY;
beforeAll(() => {
  const ctx = sandboxWithGomoku();
  ({ GomokuRules, GomokuAI, BLACK, WHITE, EMPTY } = ctx);
});

// ─── helpers ────────────────────────────────────────────────────────────────

/** Empty size×size board. */
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

// ─── gomoku-rules: canPlace ───────────────────────────────────────────────────

describe('canPlace', () => {
  const size = 7;

  test('in-bounds empty point is placeable', () => {
    const b = emptyBoard(size);
    expect(GomokuRules.canPlace(b, size, 3, 3)).toBe(true);
  });

  test('occupied point is not placeable', () => {
    const b = emptyBoard(size);
    b[3][3] = BLACK;
    expect(GomokuRules.canPlace(b, size, 3, 3)).toBe(false);
  });

  test('out-of-bounds point is not placeable', () => {
    const b = emptyBoard(size);
    expect(GomokuRules.canPlace(b, size, -1, 0)).toBe(false);
    expect(GomokuRules.canPlace(b, size, 0, size)).toBe(false);
    expect(GomokuRules.canPlace(b, size, size, size)).toBe(false);
  });
});

// ─── gomoku-rules: checkWin ───────────────────────────────────────────────────

describe('checkWin', () => {
  const size = 9;

  test('horizontal five wins', () => {
    const b = emptyBoard(size);
    const [r, c] = placeRun(b, 4, 2, 0, 1, 5, BLACK);
    const w = GomokuRules.checkWin(b, size, r, c, BLACK);
    expect(w.won).toBe(true);
    expect(w.line).toHaveLength(5);
  });

  test('vertical five wins', () => {
    const b = emptyBoard(size);
    const [r, c] = placeRun(b, 2, 4, 1, 0, 5, WHITE);
    expect(GomokuRules.checkWin(b, size, r, c, WHITE).won).toBe(true);
  });

  test('diagonal ↘ five wins', () => {
    const b = emptyBoard(size);
    const [r, c] = placeRun(b, 2, 2, 1, 1, 5, BLACK);
    expect(GomokuRules.checkWin(b, size, r, c, BLACK).won).toBe(true);
  });

  test('diagonal ↙ five wins', () => {
    const b = emptyBoard(size);
    const [r, c] = placeRun(b, 2, 6, 1, -1, 5, BLACK);
    expect(GomokuRules.checkWin(b, size, r, c, BLACK).won).toBe(true);
  });

  test('only four in a row does not win', () => {
    const b = emptyBoard(size);
    const [r, c] = placeRun(b, 4, 2, 0, 1, 4, BLACK);
    const w = GomokuRules.checkWin(b, size, r, c, BLACK);
    expect(w.won).toBe(false);
    expect(w.line).toHaveLength(0);
  });

  test('overline (six in a row) still wins — free-style gomoku, no overline ban', () => {
    const b = emptyBoard(size);
    const [r, c] = placeRun(b, 4, 1, 0, 1, 6, BLACK);
    const w = GomokuRules.checkWin(b, size, r, c, BLACK);
    expect(w.won).toBe(true);
    expect(w.line.length).toBeGreaterThanOrEqual(6);
  });

  test('win at board edge', () => {
    const b = emptyBoard(size);
    // last column, rows 0..4
    const [r, c] = placeRun(b, 0, size - 1, 1, 0, 5, BLACK);
    expect(GomokuRules.checkWin(b, size, r, c, BLACK).won).toBe(true);
  });

  test('checking a non-matching point returns not-won', () => {
    const b = emptyBoard(size);
    placeRun(b, 4, 2, 0, 1, 5, BLACK);
    // query the same line but as WHITE → no win for white
    expect(GomokuRules.checkWin(b, size, 4, 4, WHITE).won).toBe(false);
  });
});

// ─── gomoku-rules: isBoardFull ────────────────────────────────────────────────

describe('isBoardFull', () => {
  test('empty board is not full', () => {
    expect(GomokuRules.isBoardFull(emptyBoard(3), 3)).toBe(false);
  });

  test('completely filled board is full', () => {
    const size = 3;
    const b = Array.from({ length: size }, () => Array(size).fill(BLACK));
    expect(GomokuRules.isBoardFull(b, size)).toBe(true);
  });

  test('one empty cell means not full', () => {
    const size = 3;
    const b = Array.from({ length: size }, () => Array(size).fill(BLACK));
    b[1][1] = EMPTY;
    expect(GomokuRules.isBoardFull(b, size)).toBe(false);
  });
});

// ─── gomoku-ai: candidates ────────────────────────────────────────────────────

describe('candidates', () => {
  test('empty board yields no candidates', () => {
    expect(GomokuAI.candidates(emptyBoard(9), 9)).toEqual([]);
  });

  test('single centre stone yields nearby empties within 2, excluding the stone', () => {
    const size = 9;
    const b = emptyBoard(size);
    b[4][4] = BLACK;
    const cands = GomokuAI.candidates(b, size);
    // 5×5 neighbourhood minus the occupied centre = 24
    expect(cands).toHaveLength(24);
    for (const { r, c } of cands) {
      expect(Math.abs(r - 4)).toBeLessThanOrEqual(2);
      expect(Math.abs(c - 4)).toBeLessThanOrEqual(2);
      expect(b[r][c]).toBe(EMPTY);
    }
    expect(cands.some((m) => m.r === 4 && m.c === 4)).toBe(false);
  });

  test('candidates are de-duplicated across overlapping neighbourhoods', () => {
    const size = 9;
    const b = emptyBoard(size);
    b[4][4] = BLACK;
    b[4][5] = WHITE; // overlapping neighbourhoods
    const cands = GomokuAI.candidates(b, size);
    const keys = new Set(cands.map((m) => `${m.r},${m.c}`));
    expect(keys.size).toBe(cands.length);
  });
});

// ─── gomoku-ai: placeScore ────────────────────────────────────────────────────

describe('placeScore', () => {
  const size = 9;

  test('completing five scores higher than making an open three', () => {
    const four = emptyBoard(size);
    placeRun(four, 4, 2, 0, 1, 4, BLACK); // four in a row, gap at (4,6) completes five
    const winScore = GomokuAI.placeScore(four, size, 4, 6, BLACK);

    const two = emptyBoard(size);
    placeRun(two, 4, 3, 0, 1, 2, BLACK); // play (4,5) makes an open three
    const threeScore = GomokuAI.placeScore(two, size, 4, 5, BLACK);

    expect(winScore).toBeGreaterThan(threeScore);
  });

  test('placeScore does not mutate the board (try-place-then-restore)', () => {
    const b = emptyBoard(size);
    placeRun(b, 4, 2, 0, 1, 4, BLACK);
    const snapshot = JSON.stringify(b);
    GomokuAI.placeScore(b, size, 4, 6, BLACK);
    expect(JSON.stringify(b)).toBe(snapshot);
  });
});

// ─── gomoku-ai: bestMove ──────────────────────────────────────────────────────

describe('bestMove', () => {
  const size = 9;
  const mid = (size / 2) | 0;

  test('on an empty board plays the centre point (tengen)', () => {
    const m = GomokuAI.bestMove(emptyBoard(size), size, BLACK, 2);
    expect(m).toEqual({ r: mid, c: mid });
  });

  test('takes the immediate winning move when available', () => {
    const b = emptyBoard(size);
    placeRun(b, 4, 2, 0, 1, 4, BLACK); // black four → completing makes five
    const m = GomokuAI.bestMove(b, size, BLACK, 2);
    b[m.r][m.c] = BLACK;
    expect(GomokuRules.checkWin(b, size, m.r, m.c, BLACK).won).toBe(true);
  });

  test('blocks the opponent immediate winning move', () => {
    const b = emptyBoard(size);
    placeRun(b, 4, 2, 0, 1, 4, WHITE); // white four threatens to win
    const m = GomokuAI.bestMove(b, size, BLACK, 2);
    // the chosen point must be one of white's two completing points (4,1)/(4,6)
    const blocks = (m.r === 4 && m.c === 1) || (m.r === 4 && m.c === 6);
    expect(blocks).toBe(true);
  });

  test('winning takes priority over blocking', () => {
    const b = emptyBoard(size);
    placeRun(b, 2, 2, 0, 1, 4, BLACK); // black can win on row 2
    placeRun(b, 6, 2, 0, 1, 4, WHITE); // white also threatens on row 6
    const m = GomokuAI.bestMove(b, size, BLACK, 2);
    b[m.r][m.c] = BLACK;
    expect(GomokuRules.checkWin(b, size, m.r, m.c, BLACK).won).toBe(true);
  });

  test('injected rng makes the choice deterministic', () => {
    const b1 = emptyBoard(size);
    b1[4][4] = BLACK;
    const b2 = emptyBoard(size);
    b2[4][4] = BLACK;
    const rng = () => 0; // always pick the first candidate
    expect(GomokuAI.bestMove(b1, size, WHITE, 1, rng))
      .toEqual(GomokuAI.bestMove(b2, size, WHITE, 1, rng));
  });
});
