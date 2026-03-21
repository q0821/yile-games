const { sandboxWithTimer } = require('./helpers');

let GoTimer;
beforeAll(() => {
  ({ GoTimer } = sandboxWithTimer());
});

// ─── formatTime ───────────────────────────────────────────────────────────────

describe('GoTimer.formatTime', () => {
  test('0 seconds → "00:00"', () => {
    expect(GoTimer.formatTime(0)).toBe('00:00');
  });

  test('59 seconds → "00:59"', () => {
    expect(GoTimer.formatTime(59)).toBe('00:59');
  });

  test('60 seconds → "01:00"', () => {
    expect(GoTimer.formatTime(60)).toBe('01:00');
  });

  test('600 seconds (10 min) → "10:00"', () => {
    expect(GoTimer.formatTime(600)).toBe('10:00');
  });

  test('3661 seconds → "61:01"', () => {
    expect(GoTimer.formatTime(3661)).toBe('61:01');
  });

  test('single-digit seconds zero-padded', () => {
    expect(GoTimer.formatTime(65)).toBe('01:05');
  });
});
