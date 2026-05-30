import {
  createBoard, BLACK, WHITE,
  estimateBlackLead, leadForPlayer, computePointsLost, ratePointsLost,
} from '../rules.js';

describe('ratePointsLost', () => {
  test('classifies by thresholds', () => {
    expect(ratePointsLost(0, 2, 6)).toBe('good');
    expect(ratePointsLost(2, 2, 6)).toBe('good');
    expect(ratePointsLost(2.1, 2, 6)).toBe('question');
    expect(ratePointsLost(6, 2, 6)).toBe('question');
    expect(ratePointsLost(6.1, 2, 6)).toBe('bad');
    expect(ratePointsLost(20, 2, 6)).toBe('bad');
  });
});

describe('leadForPlayer', () => {
  test('keeps Black perspective, flips for White', () => {
    expect(leadForPlayer(5, BLACK)).toBe(5);
    expect(leadForPlayer(5, WHITE)).toBe(-5);
    expect(leadForPlayer(-3, WHITE)).toBe(3);
  });
});

describe('estimateBlackLead', () => {
  const caps = { black: 0, white: 0 };

  test('returns a finite number for an empty board', () => {
    const lead = estimateBlackLead(createBoard(9), 9, caps, 'chinese', 7.5);
    expect(Number.isFinite(lead)).toBe(true);
  });

  test('more Black control raises Black lead', () => {
    const empty = estimateBlackLead(createBoard(9), 9, caps, 'chinese', 7.5);
    const b = createBoard(9);
    for (let x = 0; x < 4; x++) for (let y = 0; y < 9; y++) b[x][y] = BLACK;
    const blackHeavy = estimateBlackLead(b, 9, caps, 'chinese', 7.5);
    expect(blackHeavy).toBeGreaterThan(empty);
  });
});

describe('computePointsLost', () => {
  const caps = { black: 0, white: 0 };

  test('zero when the played move equals the best move', () => {
    const prev = createBoard(9);
    const move = { player: BLACK, x: 4, y: 4, pass: false };
    expect(computePointsLost(prev, 9, move, [4, 4], caps, 'chinese', 7.5)).toBe(0);
  });

  test('zero when there is no best move to compare against', () => {
    const prev = createBoard(9);
    const move = { player: BLACK, x: 4, y: 4, pass: false };
    expect(computePointsLost(prev, 9, move, null, caps, 'chinese', 7.5)).toBe(0);
  });

  test('zero for a pass', () => {
    const prev = createBoard(9);
    const move = { player: BLACK, pass: true };
    expect(computePointsLost(prev, 9, move, [4, 4], caps, 'chinese', 7.5)).toBe(0);
  });
});
