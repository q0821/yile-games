const { sandboxWithHints } = require('./helpers');

let GoHints, GoRules;
beforeAll(() => {
  ({ GoHints, GoRules } = sandboxWithHints());
});

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

function makeBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(EMPTY));
}

// ─── getCaptureHints ──────────────────────────────────────────────────────────

describe('getCaptureHints', () => {
  test('returns empty array when no captures available', () => {
    const b = makeBoard(9);
    b[4][4] = BLACK;
    const hints = GoHints.getCaptureHints(b, 9, WHITE, null);
    expect(hints).toHaveLength(0);
  });

  test('finds the liberty of an opponent stone in atari', () => {
    // Black stone at (0,0) on 9×9: liberties are (0,1) and (1,0)
    // Surround it on one side so it has only 1 liberty
    const b = makeBoard(9);
    b[0][0] = BLACK;
    b[0][1] = WHITE; // blocks one liberty → last liberty = (1,0)
    const hints = GoHints.getCaptureHints(b, 9, WHITE, null);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toEqual([1, 0]);
  });

  test('does not include capture when ko blocks it', () => {
    // Same atari setup but (1,0) is the ko point
    const b = makeBoard(9);
    b[0][0] = BLACK;
    b[0][1] = WHITE;
    const hints = GoHints.getCaptureHints(b, 9, WHITE, [1, 0]);
    expect(hints).toHaveLength(0);
  });

  test('finds multiple separate atari positions', () => {
    const b = makeBoard(9);
    // Two separate black stones each in atari
    b[0][0] = BLACK; b[0][1] = WHITE; // atari at (1,0)
    b[8][8] = BLACK; b[8][7] = WHITE; // atari at (7,8)
    const hints = GoHints.getCaptureHints(b, 9, WHITE, null);
    expect(hints).toHaveLength(2);
  });

  test('group in atari counts as one hint (single liberty)', () => {
    // Two connected black stones with one shared last liberty
    //  B B .
    //  W W .
    //  . . .
    const b = makeBoard(9);
    b[0][0] = BLACK; b[0][1] = BLACK;
    b[1][0] = WHITE; b[1][1] = WHITE;
    // Liberties of black group: (0,2)
    const hints = GoHints.getCaptureHints(b, 9, WHITE, null);
    const has02 = hints.some(([x, y]) => x === 0 && y === 2);
    expect(has02).toBe(true);
  });
});

// ─── getGamePhase ─────────────────────────────────────────────────────────────

describe('getGamePhase', () => {
  describe('9×9 board (threshold = 10)', () => {
    test('move 0 is opening', () => expect(GoHints.getGamePhase(0, 9)).toBe('opening'));
    test('move 9 is opening', () => expect(GoHints.getGamePhase(9, 9)).toBe('opening'));
    test('move 10 is middle', () => expect(GoHints.getGamePhase(10, 9)).toBe('middle'));
    test('move 29 is middle', () => expect(GoHints.getGamePhase(29, 9)).toBe('middle'));
    test('move 30 is endgame', () => expect(GoHints.getGamePhase(30, 9)).toBe('endgame'));
  });

  describe('13×13 board (threshold = 20)', () => {
    test('move 19 is opening', () => expect(GoHints.getGamePhase(19, 13)).toBe('opening'));
    test('move 20 is middle', () => expect(GoHints.getGamePhase(20, 13)).toBe('middle'));
    test('move 60 is endgame', () => expect(GoHints.getGamePhase(60, 13)).toBe('endgame'));
  });

  describe('19×19 board (threshold = 30)', () => {
    test('move 29 is opening', () => expect(GoHints.getGamePhase(29, 19)).toBe('opening'));
    test('move 30 is middle', () => expect(GoHints.getGamePhase(30, 19)).toBe('middle'));
    test('move 90 is endgame', () => expect(GoHints.getGamePhase(90, 19)).toBe('endgame'));
  });
});

// ─── getGuidanceLabel ─────────────────────────────────────────────────────────

describe('getGuidanceLabel', () => {
  const baseCtx9 = (b) => ({ board: b, size: 9, currentPlayer: BLACK });

  describe('opening phase', () => {
    test('empty corner → 佔角', () => {
      const b = makeBoard(9);
      const label = GoHints.getGuidanceLabel(0, 0, 0, 'opening', baseCtx9(b));
      expect(label).toBe('佔角');
    });

    test('corner with neighbour → 守角', () => {
      const b = makeBoard(9);
      b[0][1] = WHITE; // neighbour of (0,0)
      const label = GoHints.getGuidanceLabel(0, 0, 0, 'opening', baseCtx9(b));
      expect(label).toBe('守角');
    });

    test('edge point → 拓邊', () => {
      const b = makeBoard(9);
      // (0, 4) is on the top edge but not a corner (margin=2 for 9×9)
      const label = GoHints.getGuidanceLabel(0, 4, 0, 'opening', baseCtx9(b));
      expect(label).toBe('拓邊');
    });

    test('centre point → 佈局', () => {
      const b = makeBoard(9);
      const label = GoHints.getGuidanceLabel(4, 4, 0, 'opening', baseCtx9(b));
      expect(label).toBe('佈局');
    });
  });

  describe('middle phase', () => {
    test('adjacent to opponent with 1 liberty → 攻擊', () => {
      const b = makeBoard(9);
      // White stone at (4,5) surrounded on 3 sides → 1 liberty at (4,6)
      b[3][5] = BLACK; b[5][5] = BLACK; b[4][4] = BLACK;
      b[4][5] = WHITE;
      // Playing at (4,6) is adjacent to white which has 1 liberty
      const label = GoHints.getGuidanceLabel(4, 6, 0, 'middle', baseCtx9(b));
      expect(label).toBe('攻擊');
    });

    test('adjacent to own group with few liberties → 補強', () => {
      const b = makeBoard(9);
      // Black stone at (4,4) with only 2 liberties: (3,4) and (5,4) occupied by white
      b[3][4] = WHITE; b[5][4] = WHITE; b[4][3] = WHITE;
      b[4][4] = BLACK; // black group with 1 liberty: (4,5)
      // Hint is at (4,5): adjacent to own group that has 1 liberty → 補強
      const label = GoHints.getGuidanceLabel(4, 5, 0, 'middle', baseCtx9(b));
      expect(label).toBe('補強');
    });

    test('side move in middle → 拓邊', () => {
      const b = makeBoard(9);
      const label = GoHints.getGuidanceLabel(0, 4, 0, 'middle', baseCtx9(b));
      expect(label).toBe('拓邊');
    });

    test('centre move in middle → 中腹', () => {
      const b = makeBoard(9);
      const label = GoHints.getGuidanceLabel(4, 4, 0, 'middle', baseCtx9(b));
      expect(label).toBe('中腹');
    });
  });

  describe('endgame phase', () => {
    test('any position → 收官', () => {
      const b = makeBoard(9);
      expect(GoHints.getGuidanceLabel(0, 0, 0, 'endgame', baseCtx9(b))).toBe('收官');
      expect(GoHints.getGuidanceLabel(4, 4, 0, 'endgame', baseCtx9(b))).toBe('收官');
    });
  });
});
