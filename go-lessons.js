import { BLACK, WHITE, EMPTY, createBoard, getGroup, inBounds, tryPlaceStone } from './rules.js';

// 本專案依基本規則自行編寫，未轉錄外部題集。座標為 [row, col]，5 路小盤。
export const LESSONS = [
  { id: 'liberties', title: '數氣', intro: '氣是棋子上下左右相鄰的空交叉點。連在一起的棋共用氣，同一個空點只算一次。',
    problems: [
      { black: [[2,2]], white: [], target: [2,2], explanation: '中央的一顆棋有上下左右四口氣，斜角不算。' },
      { black: [[0,2]], white: [], target: [0,2], explanation: '棋盤外沒有交叉點，所以邊上的這顆棋只有三口氣。' },
      { black: [[0,0]], white: [], target: [0,0], explanation: '角落只有右邊與下方兩口氣。' },
      { black: [[2,2],[2,3],[3,2]], white: [[1,2]], target: [2,2], explanation: '整串棋共用六口氣。兩顆棋都碰到的空點，只算一口氣；白棋佔住的位置不算。' },
    ] },
  { id: 'capture', title: '一手吃子', intro: '輪到黑棋。找出白棋最後一口氣，下在那裡就能提掉有金圈的白棋。',
    problems: [
      { white: [[2,2]], black: [[1,2],[2,1],[3,2]], target: [2,2], explanation: '填住右邊最後一口氣，白棋沒有氣，就會被提走。' },
      { white: [[0,0]], black: [[1,0]], target: [0,0], explanation: '角落只有兩個方向。下在右邊，便封住白棋最後一口氣。' },
      { white: [[1,1],[1,2]], black: [[0,1],[0,2],[1,0],[2,1],[2,2]], target: [1,1], explanation: '兩顆相連的白棋共用最後一口氣。填住右邊，兩顆一起提走。' },
      { white: [[0,1],[0,2]], black: [[0,0],[1,1],[1,2]], target: [0,1], explanation: '棋盤邊界不是氣。這串白棋只剩右邊的空點，填住就能吃掉。' },
    ] },
  { id: 'escape', title: '逃出叫吃', intro: '輪到黑棋。有金圈的黑棋只剩一口氣，這叫「被叫吃」。下一手讓這串棋至少有兩口氣。',
    problems: [
      { black: [[2,2]], white: [[1,2],[2,1],[3,2]], target: [2,2], explanation: '向右延伸，連成一串後增加到三口氣，就不會被對手下一手直接提掉。' },
      { black: [[0,0]], white: [[1,0]], target: [0,0], explanation: '從角落往右延伸，讓整串棋增加到兩口氣。' },
      { black: [[1,1],[1,2]], white: [[0,1],[0,2],[1,0],[2,1],[2,2]], target: [1,1], explanation: '向右延伸可以一起救出兩顆黑棋，連起來後有三口氣。' },
      { black: [[0,1],[0,2]], white: [[0,0],[1,1],[1,2]], target: [0,1], explanation: '沿著邊往右延伸，這串黑棋會有兩口氣。脫離叫吃只代表這一步救到棋，仍要注意後續攻防。' },
    ] },
];

export function lessonBoard(problem) {
  const board = createBoard(5);
  for (const [x,y] of problem.black) board[x][y] = BLACK;
  for (const [x,y] of problem.white) board[x][y] = WHITE;
  return board;
}

export function lessonAnswer(kind, problem, answer) {
  const board = lessonBoard(problem);
  const group = getGroup(board, 5, ...problem.target);
  if (kind === 'liberties') return { correct: answer === group.liberties.size, board };
  if (!Array.isArray(answer) || !inBounds(5, ...answer)) return { correct: false, board };
  const [x,y] = answer;
  const result = tryPlaceStone(board, 5, x, y, BLACK, null);
  if (!result.valid) return { correct: false, board, reason: '這裡不能落子，請選空交叉點。' };
  const correct = kind === 'capture'
    ? group.stones.every(([r,c]) => result.newBoard[r][c] === EMPTY)
    : group.stones.every(([r,c]) => result.newBoard[r][c] === BLACK)
      && getGroup(result.newBoard, 5, ...problem.target).liberties.size >= 2;
  return { correct, board: result.newBoard };
}

export function lessonSolutions(kind, problem) {
  if (kind === 'liberties') return [...getGroup(lessonBoard(problem), 5, ...problem.target).liberties]
    .map(key => [Math.floor(key / 5), key % 5]);
  const answers = [];
  for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
    if (lessonAnswer(kind, problem, [x,y]).correct) answers.push([x,y]);
  }
  return answers;
}
