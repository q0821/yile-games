import { BLACK, WHITE, EMPTY, createBoard, getGroup, inBounds, tryPlaceStone } from './rules.js';

// 本專案依基本規則自行編寫，未轉錄外部題集。座標為 [row, col]，5 路小盤。
export const LESSONS = [
  { id: 'liberties', title: '數氣', intro: '氣是棋子上下左右相鄰的空交叉點。連在一起的棋共用氣，同一個空點只算一次。',
    problems: [
      { id: 'liberties-centre', black: [[2,2]], white: [], target: [2,2], explanation: '中央的一顆棋有上下左右四口氣，斜角不算。' },
      { id: 'liberties-edge', black: [[0,2]], white: [], target: [0,2], explanation: '棋盤外沒有交叉點，所以邊上的這顆棋只有三口氣。' },
      { id: 'liberties-corner', black: [[0,0]], white: [], target: [0,0], explanation: '角落只有右邊與下方兩口氣。' },
      { id: 'liberties-shared', black: [[2,2],[2,3],[3,2]], white: [[1,2]], target: [2,2], explanation: '整串棋共用六口氣。兩顆棋都碰到的空點，只算一口氣；白棋佔住的位置不算。' },
    ] },
  { id: 'capture', title: '一手吃子', intro: '輪到黑棋。找出白棋最後一口氣，下在那裡就能提掉有金圈的白棋。',
    problems: [
      { id: 'capture-centre', white: [[2,2]], black: [[1,2],[2,1],[3,2]], target: [2,2], explanation: '填住右邊最後一口氣，白棋沒有氣，就會被提走。' },
      { id: 'capture-corner', white: [[0,0]], black: [[1,0]], target: [0,0], explanation: '角落只有兩個方向。下在右邊，便封住白棋最後一口氣。' },
      { id: 'capture-chain', white: [[1,1],[1,2]], black: [[0,1],[0,2],[1,0],[2,1],[2,2]], target: [1,1], explanation: '兩顆相連的白棋共用最後一口氣。填住右邊，兩顆一起提走。' },
      { id: 'capture-edge', white: [[0,1],[0,2]], black: [[0,0],[1,1],[1,2]], target: [0,1], explanation: '棋盤邊界不是氣。這串白棋只剩右邊的空點，填住就能吃掉。' },
    ] },
  { id: 'escape', title: '逃出叫吃', intro: '輪到黑棋。有金圈的黑棋只剩一口氣，這叫「被叫吃」。下一手讓這串棋至少有兩口氣。',
    problems: [
      { id: 'escape-centre', black: [[2,2]], white: [[1,2],[2,1],[3,2]], target: [2,2], explanation: '向右延伸，連成一串後增加到三口氣，就不會被對手下一手直接提掉。' },
      { id: 'escape-corner', black: [[0,0]], white: [[1,0]], target: [0,0], explanation: '從角落往右延伸，讓整串棋增加到兩口氣。' },
      { id: 'escape-chain', black: [[1,1],[1,2]], white: [[0,1],[0,2],[1,0],[2,1],[2,2]], target: [1,1], explanation: '向右延伸可以一起救出兩顆黑棋，連起來後有三口氣。' },
      { id: 'escape-edge', black: [[0,1],[0,2]], white: [[0,0],[1,1],[1,2]], target: [0,1], explanation: '沿著邊往右延伸，這串黑棋會有兩口氣。脫離叫吃只代表這一步救到棋，仍要注意後續攻防。' },
    ] },
  { id: 'connect', title: '連接自己的棋', intro: '輪到黑棋。下一手把有金圈的兩串黑棋連成一串，並保有至少兩口氣。',
    problems: [
      { id: 'connect-gap', black: [[2,1],[2,3]], white: [[1,2]], target: [2,1], other: [2,3], explanation: '填上兩串黑棋中間的空點，就能連成一串，共用氣。' },
      { id: 'connect-diagonal', black: [[1,1],[2,2]], white: [[1,2]], target: [1,1], other: [2,2], explanation: '斜角相鄰不算相連。下在左下方，讓兩串黑棋透過上下左右連在一起。' },
      { id: 'connect-edge', black: [[0,0],[0,2],[1,2]], white: [[1,0]], target: [0,0], other: [0,2], explanation: '沿著邊連接，可以把角落被叫吃的黑棋接回同伴，整串棋一起共用氣。' },
    ] },
  { id: 'cut', title: '阻止直接連接', intro: '輪到黑棋。兩串有金圈的白棋目前只有一個共用的直接連接點。先佔住它；這不代表白棋永遠無法連回去。',
    problems: [
      { id: 'cut-gap', black: [], white: [[2,1],[2,3]], target: [2,1], other: [2,3], explanation: '下在兩串白棋中間，佔住它們共用的連接點，讓白棋不能下一手直接連接。' },
      { id: 'cut-diagonal', black: [[1,2]], white: [[1,1],[2,2]], target: [1,1], other: [2,2], explanation: '右上方已有黑棋，再佔住左下方，白棋就不能透過這兩個點直接連接。' },
      { id: 'cut-edge', black: [[1,3]], white: [[0,0],[0,2],[1,2]], target: [0,0], other: [0,2], explanation: '佔住邊上的共同空點，阻止兩串白棋直接連接；後面仍要留意黑棋本身的氣。' },
    ] },
  { id: 'capture-rescue', title: '吃子救棋', intro: '輪到黑棋。這次要提掉白棋，讓有金圈的黑棋至少有兩口氣。只向外延伸不算完成本題。',
    problems: [
      { id: 'rescue-centre', black: [[2,2],[1,1],[0,2]], white: [[1,2],[2,1],[3,2]], target: [2,2], explanation: '提掉上方白棋，空出來的位置就成為黑棋的新氣。救棋除了延伸，也能靠吃子。' },
      { id: 'rescue-edge', black: [[0,1]], white: [[0,0],[0,2]], target: [0,1], explanation: '下在左側白棋下方，提掉角落白棋。目標黑棋便有左邊與下方兩口氣。' },
      { id: 'rescue-chain', black: [[0,1],[0,2]], white: [[0,0],[0,3],[1,2]], target: [0,1], explanation: '提掉角落白棋，就替整串黑棋增加一口氣，同時救出相連的兩顆棋。' },
    ] },
];

// 已發布題目的 ID 不隨主題排序或文案更動；新增題目必須明確指定 ID。
for (const lesson of LESSONS) for (const problem of lesson.problems) {
  problem.source = '本專案自行編寫，依圍棋規則驗證';
}
export const PROBLEM_IDS = LESSONS.flatMap(lesson => lesson.problems.map(p => p.id));

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
  let correct = false;
  if (kind === 'capture') {
    correct = group.stones.every(([r,c]) => result.newBoard[r][c] === EMPTY);
  } else if (kind === 'escape' || kind === 'capture-rescue') {
    correct = group.stones.every(([r,c]) => result.newBoard[r][c] === BLACK)
      && getGroup(result.newBoard, 5, ...problem.target).liberties.size >= 2;
    if (kind === 'capture-rescue') correct &&= problem.white.some(([r,c]) => result.newBoard[r][c] === EMPTY);
  } else if (kind === 'connect') {
    const connected = getGroup(result.newBoard, 5, ...problem.target);
    correct = connected.liberties.size >= 2
      && connected.stones.some(([r,c]) => r === problem.other[0] && c === problem.other[1]);
  } else if (kind === 'cut') {
    const other = getGroup(board, 5, ...problem.other);
    const key = x * 5 + y;
    correct = group.liberties.has(key) && other.liberties.has(key)
      && [...group.liberties].filter(lib => other.liberties.has(lib)).length === 1
      && [...group.stones, ...other.stones].every(([r,c]) => result.newBoard[r][c] === WHITE);
  }
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
