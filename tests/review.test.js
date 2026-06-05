const { sandboxWithReview } = require('./helpers');

let ctx, summarizeGame, BLACK, WHITE;
beforeAll(() => {
  ctx = sandboxWithReview();
  summarizeGame = ctx.GoReview.summarizeGame;
  BLACK = ctx.BLACK;
  WHITE = ctx.WHITE;
});

describe('summarizeGame', () => {
  test('無提子的對局：提子數為 0、biggest 為 null', () => {
    const moves = [
      { x: 2, y: 2, player: BLACK },
      { x: 6, y: 6, player: WHITE },
      { x: 2, y: 6, player: BLACK },
    ];
    const s = summarizeGame(moves, 9);
    expect(s.totalMoves).toBe(3);
    expect(s.blackCaptured).toBe(0);
    expect(s.whiteCaptured).toBe(0);
    expect(s.biggest).toBeNull();
  });

  test('黑提白角一子：黑提子數 1、biggest 記在該手', () => {
    // 白佔角 (0,0)，黑填 (0,1) 與 (1,0) → 第 4 手黑提白一子
    const moves = [
      { x: 0, y: 0, player: WHITE },
      { x: 0, y: 1, player: BLACK },
      { x: 4, y: 4, player: WHITE },
      { x: 1, y: 0, player: BLACK },
    ];
    const s = summarizeGame(moves, 9);
    expect(s.blackCaptured).toBe(1);
    expect(s.whiteCaptured).toBe(0);
    expect(s.biggest).toEqual({ moveNumber: 4, byPlayer: BLACK, count: 1 });
  });

  test('pass 不影響統計', () => {
    const moves = [
      { x: 0, y: 0, player: WHITE },
      { pass: true, player: BLACK },
      { x: 0, y: 1, player: BLACK },
      { x: 4, y: 4, player: WHITE },
      { x: 1, y: 0, player: BLACK },
    ];
    const s = summarizeGame(moves, 9);
    expect(s.totalMoves).toBe(5);
    expect(s.blackCaptured).toBe(1);
    expect(s.biggest.moveNumber).toBe(5);
  });
});
