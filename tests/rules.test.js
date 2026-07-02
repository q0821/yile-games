const { sandboxWithRules } = require('./helpers');

let GoRules;
beforeAll(() => {
  ({ GoRules } = sandboxWithRules());
});

const { EMPTY, BLACK, WHITE } = (() => ({ EMPTY: 0, BLACK: 1, WHITE: 2 }))();

// ─── helpers ────────────────────────────────────────────────────────────────

/** Build a board from a string template.
 *  '.' = EMPTY, 'B' = BLACK, 'W' = WHITE
 *  Rows separated by '|'; columns left→right = y 0→n.
 *  e.g. board3('B..|.W.|...') produces a 3×3 board.
 */
function boardFromString(template) {
  const rows = template.split('|');
  const size = rows.length;
  const b = Array.from({ length: size }, () => Array(size).fill(EMPTY));
  rows.forEach((row, x) => {
    [...row].forEach((ch, y) => {
      if (ch === 'B') b[x][y] = BLACK;
      else if (ch === 'W') b[x][y] = WHITE;
    });
  });
  return b;
}

// ─── createBoard ─────────────────────────────────────────────────────────────

describe('createBoard', () => {
  test('creates n×n board filled with EMPTY', () => {
    const b = GoRules.createBoard(9);
    expect(b).toHaveLength(9);
    b.forEach(row => {
      expect(row).toHaveLength(9);
      row.forEach(cell => expect(cell).toBe(EMPTY));
    });
  });

  test('different sizes', () => {
    for (const size of [9, 13, 19]) {
      const b = GoRules.createBoard(size);
      expect(b).toHaveLength(size);
      expect(b[0]).toHaveLength(size);
    }
  });
});

// ─── cloneBoard ──────────────────────────────────────────────────────────────

describe('cloneBoard', () => {
  test('creates independent copy', () => {
    const original = GoRules.createBoard(5);
    original[2][3] = BLACK;
    const clone = GoRules.cloneBoard(original);
    expect(clone[2][3]).toBe(BLACK);
    clone[2][3] = WHITE;
    expect(original[2][3]).toBe(BLACK); // original unchanged
  });

  test('row arrays are independent', () => {
    const b = GoRules.createBoard(3);
    const c = GoRules.cloneBoard(b);
    c[0][0] = BLACK;
    expect(b[0][0]).toBe(EMPTY);
  });
});

// ─── opponent ────────────────────────────────────────────────────────────────

describe('opponent', () => {
  test('BLACK → WHITE', () => expect(GoRules.opponent(BLACK)).toBe(WHITE));
  test('WHITE → BLACK', () => expect(GoRules.opponent(WHITE)).toBe(BLACK));
});

// ─── inBounds ────────────────────────────────────────────────────────────────

describe('inBounds', () => {
  test('centre is in bounds', () => expect(GoRules.inBounds(9, 4, 4)).toBe(true));
  test('corners are in bounds', () => {
    expect(GoRules.inBounds(9, 0, 0)).toBe(true);
    expect(GoRules.inBounds(9, 8, 8)).toBe(true);
  });
  test('negative coords are out', () => {
    expect(GoRules.inBounds(9, -1, 0)).toBe(false);
    expect(GoRules.inBounds(9, 0, -1)).toBe(false);
  });
  test('coords equal to size are out', () => {
    expect(GoRules.inBounds(9, 9, 0)).toBe(false);
    expect(GoRules.inBounds(9, 0, 9)).toBe(false);
  });
});

// ─── getNeighbors ────────────────────────────────────────────────────────────

describe('getNeighbors', () => {
  test('corner has 2 neighbours', () => {
    const n = GoRules.getNeighbors(9, 0, 0);
    expect(n).toHaveLength(2);
  });
  test('edge has 3 neighbours', () => {
    const n = GoRules.getNeighbors(9, 0, 4);
    expect(n).toHaveLength(3);
  });
  test('centre has 4 neighbours', () => {
    const n = GoRules.getNeighbors(9, 4, 4);
    expect(n).toHaveLength(4);
  });
  test('all returned coords are in bounds', () => {
    const n = GoRules.getNeighbors(9, 0, 0);
    n.forEach(([x, y]) => expect(GoRules.inBounds(9, x, y)).toBe(true));
  });
});

// ─── getGroup ────────────────────────────────────────────────────────────────

describe('getGroup', () => {
  test('returns empty result for EMPTY cell', () => {
    const b = GoRules.createBoard(9);
    const { stones, liberties } = GoRules.getGroup(b, 9, 4, 4);
    expect(stones).toHaveLength(0);
    expect(liberties.size).toBe(0);
  });

  test('single stone in corner has 2 liberties', () => {
    const b = GoRules.createBoard(9);
    b[0][0] = BLACK;
    const { stones, liberties } = GoRules.getGroup(b, 9, 0, 0);
    expect(stones).toHaveLength(1);
    expect(liberties.size).toBe(2);
  });

  test('single stone in centre has 4 liberties', () => {
    const b = GoRules.createBoard(9);
    b[4][4] = BLACK;
    const { stones, liberties } = GoRules.getGroup(b, 9, 4, 4);
    expect(stones).toHaveLength(1);
    expect(liberties.size).toBe(4);
  });

  test('two connected stones share liberties', () => {
    //  B B .    (0,0) and (0,1) connected
    //  . . .    liberties: (1,0), (0,2), (1,1) = 3 distinct
    //  . . .
    const b = boardFromString('BB.|...|...');
    const { stones, liberties } = GoRules.getGroup(b, 3, 0, 0);
    expect(stones).toHaveLength(2);
    expect(liberties.size).toBe(3);
  });

  test('stones are only counted once when group is large', () => {
    // 3-stone L-shape
    const b = boardFromString('BB.|B..|...');
    const { stones } = GoRules.getGroup(b, 3, 0, 0);
    expect(stones).toHaveLength(3);
  });

  test('enemy stones are not part of group', () => {
    // B W
    const b = GoRules.createBoard(9);
    b[4][4] = BLACK;
    b[4][5] = WHITE;
    const { stones } = GoRules.getGroup(b, 9, 4, 4);
    expect(stones).toHaveLength(1);
  });
});

// ─── tryPlaceStone ───────────────────────────────────────────────────────────

describe('tryPlaceStone', () => {
  test('returns valid:true for a simple placement', () => {
    const b = GoRules.createBoard(9);
    const result = GoRules.tryPlaceStone(b, 9, 4, 4, BLACK, null);
    expect(result.valid).toBe(true);
    expect(result.newBoard[4][4]).toBe(BLACK);
    expect(result.captured).toBe(0);
    expect(result.newKo).toBeNull();
  });

  test('returns valid:false when cell is occupied', () => {
    const b = GoRules.createBoard(9);
    b[4][4] = WHITE;
    const result = GoRules.tryPlaceStone(b, 9, 4, 4, BLACK, null);
    expect(result.valid).toBe(false);
  });

  test('occupied cell reports reason:occupied', () => {
    const b = GoRules.createBoard(9);
    b[4][4] = WHITE;
    const result = GoRules.tryPlaceStone(b, 9, 4, 4, BLACK, null);
    expect(result.reason).toBe('occupied');
  });

  test('does not mutate original board', () => {
    const b = GoRules.createBoard(9);
    GoRules.tryPlaceStone(b, 9, 4, 4, BLACK, null);
    expect(b[4][4]).toBe(EMPTY);
  });

  test('captures opponent stones with no liberties', () => {
    // Surround a single white stone with black:
    //  . B .
    //  B W B
    //  . B .
    const b = GoRules.createBoard(9);
    b[3][4] = BLACK; b[5][4] = BLACK; b[4][3] = BLACK;
    b[4][4] = WHITE;
    // Place black at (4,5) to capture
    const result = GoRules.tryPlaceStone(b, 9, 4, 5, BLACK, null);
    expect(result.valid).toBe(true);
    expect(result.captured).toBe(1);
    expect(result.newBoard[4][4]).toBe(EMPTY);
  });

  test('suicide is invalid', () => {
    // Black tries to play into a surrounded position with no liberties
    //  W W .
    //  W . W
    //  . W .
    //  Playing at (1,1) for BLACK would have no liberties after capture check
    const b = GoRules.createBoard(5);
    b[0][1] = WHITE; b[0][2] = WHITE; // won't matter — simpler:
    // Surround (0,0) on a 5x5
    b[0][1] = WHITE;
    b[1][0] = WHITE;
    const result = GoRules.tryPlaceStone(b, 5, 0, 0, BLACK, null);
    expect(result.valid).toBe(false); // suicide
  });

  test('suicide move reports reason:suicide', () => {
    const b = GoRules.createBoard(5);
    b[0][1] = WHITE;
    b[1][0] = WHITE;
    const result = GoRules.tryPlaceStone(b, 5, 0, 0, BLACK, null);
    expect(result.reason).toBe('suicide');
  });

  test('ko point blocks replaying the capture', () => {
    // Classic ko: white just captured at (2,2), koPoint = [2,2]
    const b = GoRules.createBoard(9);
    b[2][2] = EMPTY;
    const koPoint = [2, 2];
    const result = GoRules.tryPlaceStone(b, 9, 2, 2, BLACK, koPoint);
    expect(result.valid).toBe(false);
  });

  test('ko point move reports reason:ko', () => {
    const b = GoRules.createBoard(9);
    b[2][2] = EMPTY;
    const koPoint = [2, 2];
    const result = GoRules.tryPlaceStone(b, 9, 2, 2, BLACK, koPoint);
    expect(result.reason).toBe('ko');
  });

  test('ko point is set after a single-stone capture that creates ko', () => {
    // Set up a basic ko shape manually:
    //  . B W .
    //  B W . W  <- black plays at (1,2) to capture W at (1,1) — creates ko at (1,1)
    //  . B W .
    const b = GoRules.createBoard(7);
    // Black stones surrounding (1,1) on 3 sides + white chain
    b[0][1] = BLACK; b[2][1] = BLACK; b[1][0] = BLACK; // black surrounds
    b[1][1] = WHITE;                                     // white to capture
    b[0][2] = WHITE; b[2][2] = WHITE; b[1][3] = WHITE; // white context (creates ko after capture)
    const result = GoRules.tryPlaceStone(b, 7, 1, 2, BLACK, null);
    expect(result.valid).toBe(true);
    expect(result.captured).toBe(1);
    expect(result.newKo).toEqual([1, 1]);
  });
});

// ─── getLegalMoves ───────────────────────────────────────────────────────────

describe('getLegalMoves', () => {
  test('empty board has all intersections as legal', () => {
    const b = GoRules.createBoard(9);
    const moves = GoRules.getLegalMoves(b, 9, BLACK, null);
    expect(moves).toHaveLength(81);
  });

  test('occupied cells are not in legal moves', () => {
    const b = GoRules.createBoard(9);
    b[4][4] = BLACK;
    const moves = GoRules.getLegalMoves(b, 9, WHITE, null);
    expect(moves).toHaveLength(80);
    const hasOccupied = moves.some(([x, y]) => x === 4 && y === 4);
    expect(hasOccupied).toBe(false);
  });

  test('ko point is excluded', () => {
    const b = GoRules.createBoard(9);
    // Surround (4,4) so playing there would be pure ko
    b[3][4] = WHITE; b[5][4] = WHITE; b[4][3] = WHITE; b[4][5] = WHITE;
    const moves = GoRules.getLegalMoves(b, 9, BLACK, [4, 4]);
    const hasKo = moves.some(([x, y]) => x === 4 && y === 4);
    expect(hasKo).toBe(false);
  });
});

// ─── calculateScore ──────────────────────────────────────────────────────────

describe('calculateScore', () => {
  const emptyCaptures = { [BLACK]: 0, [WHITE]: 0 };

  test('empty board: white wins by komi (chinese rules)', () => {
    const b = GoRules.createBoard(9);
    const result = GoRules.calculateScore(b, 9, new Set(), emptyCaptures, 'chinese', 7.5);
    // No stones, no territory — komi gives white the win
    expect(result.white).toBe(7.5);
    expect(result.black).toBe(0);
  });

  test('black stone counts in chinese rules', () => {
    const b = GoRules.createBoard(9);
    b[4][4] = BLACK;
    const result = GoRules.calculateScore(b, 9, new Set(), emptyCaptures, 'chinese', 0);
    expect(result.blackStones).toBe(1);
  });

  test('dead stones are removed before scoring', () => {
    const b = GoRules.createBoard(9);
    b[4][4] = WHITE;
    const deadKey = 4 * 9 + 4;
    const result = GoRules.calculateScore(b, 9, new Set([deadKey]), emptyCaptures, 'chinese', 0);
    // Dead white stone is removed: white stone count = 0
    expect(result.whiteStones).toBe(0);
  });

  test('japanese rules: territory + prisoners, no stone count', () => {
    const b = GoRules.createBoard(9);
    const captures = { [BLACK]: 3, [WHITE]: 0 };
    const result = GoRules.calculateScore(b, 9, new Set(), captures, 'japanese', 6.5);
    // Black prisoners for white = captures[WHITE] + deadBlack = 0
    // White prisoners for black = captures[BLACK] + deadWhite = 3
    expect(result.blackStones).toBe(3); // prisoners counted as "stones" in japanese
    expect(result.white).toBeCloseTo(6.5, 5); // only komi
  });

  test('territory enclosed entirely by one colour is awarded', () => {
    // Black encloses top-left 2×2 corner on a 5×5
    //  B B B B B
    //  B . . . B  <- white territory inside?  No — enclosed by black → black territory
    //  B . . . B
    //  B . . . B
    //  B B B B B
    const b = GoRules.createBoard(5);
    for (let i = 0; i < 5; i++) { b[0][i] = BLACK; b[4][i] = BLACK; b[i][0] = BLACK; b[i][4] = BLACK; }
    const result = GoRules.calculateScore(b, 5, new Set(), emptyCaptures, 'chinese', 0);
    expect(result.blackTerritory).toBeGreaterThan(0);
    expect(result.whiteTerritory).toBe(0);
  });
});

// ─── estimateDeadStones ──────────────────────────────────────────────────────

describe('estimateDeadStones', () => {
  test('returns empty Set on empty board', () => {
    const b = GoRules.createBoard(9);
    const dead = GoRules.estimateDeadStones(b, 9);
    expect(dead.size).toBe(0);
  });

  test('result is a Set (duck-typed: has .has method)', () => {
    // estimateDeadStones always returns a Set regardless of board state
    const b = GoRules.createBoard(9);
    b[4][4] = BLACK;
    const dead = GoRules.estimateDeadStones(b, 9);
    expect(typeof dead.has).toBe('function');
  });

  test('secure living group is not marked dead', () => {
    // Black stones with clear territory are alive
    const b = GoRules.createBoard(9);
    b[4][4] = BLACK; b[4][5] = BLACK;
    const dead = GoRules.estimateDeadStones(b, 9);
    expect(dead.has(4 * 9 + 4)).toBe(false);
    expect(dead.has(4 * 9 + 5)).toBe(false);
  });
});

// ─── handicap (S6) ────────────────────────────────────────────────────────────

describe('handicapPoints', () => {
  test('count < 2 回空陣列', () => {
    expect(GoRules.handicapPoints(19, 0)).toEqual([]);
    expect(GoRules.handicapPoints(19, 1)).toEqual([]);
  });

  test('不支援的尺寸回空陣列', () => {
    expect(GoRules.handicapPoints(7, 4)).toEqual([]);
  });

  test('19 路讓 2 子＝左下、右上星位（4/16 線→0-indexed 3/15）', () => {
    expect(GoRules.handicapPoints(19, 2)).toEqual([[15, 3], [3, 15]]);
  });

  test('19 路讓 5 子＝四角＋天元', () => {
    expect(GoRules.handicapPoints(19, 5)).toEqual([
      [15, 3], [3, 15], [3, 3], [15, 15], [9, 9]
    ]);
  });

  test('19 路讓 9 子＝全部 9 個星位、含天元', () => {
    const pts = GoRules.handicapPoints(19, 9);
    expect(pts.length).toBe(9);
    expect(pts).toContainEqual([9, 9]);       // 天元
    expect(pts).toContainEqual([3, 9]);       // 上邊
    expect(pts).toContainEqual([15, 9]);      // 下邊
  });

  test('各尺寸天元位置正確（13→6,6；9→4,4）', () => {
    expect(GoRules.handicapPoints(13, 5)).toContainEqual([6, 6]);
    expect(GoRules.handicapPoints(9, 5)).toContainEqual([4, 4]);
  });

  test('讓子點皆落在盤內且不重複', () => {
    for (const size of [9, 13, 19]) {
      for (let n = 2; n <= 9; n++) {
        const pts = GoRules.handicapPoints(size, n);
        expect(pts.length).toBe(n);
        const keys = new Set(pts.map(([r, c]) => r * size + c));
        expect(keys.size).toBe(n); // 無重複
        for (const [r, c] of pts) {
          expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThan(size);
          expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThan(size);
        }
      }
    }
  });
});

describe('placeHandicap', () => {
  test('在星位擺上對應數量的黑子、其餘為空', () => {
    const b = GoRules.placeHandicap(19, 4);
    let black = 0;
    for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) {
      if (b[r][c] === BLACK) black++;
      else expect(b[r][c]).toBe(EMPTY);
    }
    expect(black).toBe(4);
    for (const [r, c] of GoRules.handicapPoints(19, 4)) expect(b[r][c]).toBe(BLACK);
  });

  test('count < 2 回空盤', () => {
    const b = GoRules.placeHandicap(19, 0);
    expect(b.every(row => row.every(v => v === EMPTY))).toBe(true);
  });
});
