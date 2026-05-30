const { sandboxWithRules } = require('./helpers');

let GoRules;
beforeAll(() => {
  ({ GoRules } = sandboxWithRules());
});

const { BLACK, WHITE } = (() => ({ BLACK: 1, WHITE: 2 }))();

describe('ratePointsLost', () => {
  test('classifies by thresholds', () => {
    expect(GoRules.ratePointsLost(0, 2, 6)).toBe('good');
    expect(GoRules.ratePointsLost(2, 2, 6)).toBe('good');
    expect(GoRules.ratePointsLost(2.1, 2, 6)).toBe('question');
    expect(GoRules.ratePointsLost(6, 2, 6)).toBe('question');
    expect(GoRules.ratePointsLost(6.1, 2, 6)).toBe('bad');
    expect(GoRules.ratePointsLost(20, 2, 6)).toBe('bad');
  });
});

describe('leadForPlayer', () => {
  test('keeps Black perspective, flips for White', () => {
    expect(GoRules.leadForPlayer(5, BLACK)).toBe(5);
    expect(GoRules.leadForPlayer(5, WHITE)).toBe(-5);
    expect(GoRules.leadForPlayer(-3, WHITE)).toBe(3);
  });
});

describe('estimateBlackLead', () => {
  const caps = { [BLACK]: 0, [WHITE]: 0 };

  test('returns a finite number for an empty board', () => {
    const lead = GoRules.estimateBlackLead(GoRules.createBoard(9), 9, caps, 'chinese', 7.5);
    expect(Number.isFinite(lead)).toBe(true);
  });

  test('more Black control raises Black lead', () => {
    const empty = GoRules.estimateBlackLead(GoRules.createBoard(9), 9, caps, 'chinese', 7.5);
    const b = GoRules.createBoard(9);
    for (let x = 0; x < 4; x++) for (let y = 0; y < 9; y++) b[x][y] = BLACK;
    const blackHeavy = GoRules.estimateBlackLead(b, 9, caps, 'chinese', 7.5);
    expect(blackHeavy).toBeGreaterThan(empty);
  });
});

describe('computePointsLost', () => {
  const caps = { [BLACK]: 0, [WHITE]: 0 };

  test('zero when the played move equals the best move', () => {
    const prev = GoRules.createBoard(9);
    const move = { player: BLACK, x: 4, y: 4, pass: false };
    expect(GoRules.computePointsLost(prev, 9, move, [4, 4], caps, 'chinese', 7.5)).toBe(0);
  });

  test('zero when there is no best move to compare against', () => {
    const prev = GoRules.createBoard(9);
    const move = { player: BLACK, x: 4, y: 4, pass: false };
    expect(GoRules.computePointsLost(prev, 9, move, null, caps, 'chinese', 7.5)).toBe(0);
  });

  test('zero for a pass', () => {
    const prev = GoRules.createBoard(9);
    const move = { player: BLACK, pass: true };
    expect(GoRules.computePointsLost(prev, 9, move, [4, 4], caps, 'chinese', 7.5)).toBe(0);
  });
});
