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
