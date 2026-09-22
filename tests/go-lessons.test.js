const { sandboxWithRules } = require('./helpers');
const r = sandboxWithRules();
const { LESSONS, lessonBoard, lessonAnswer, lessonSolutions } = r.localRequire('./go-lessons.js');

for (const lesson of LESSONS) for (const [index, problem] of lesson.problems.entries()) {
  test(`${lesson.title} 第 ${index + 1} 題有合法棋形及可實現目標`, () => {
    const board = lessonBoard(problem);
    for (const [x,y] of [...problem.black, ...problem.white]) {
      expect(r.getGroup(board, 5, x, y).liberties.size).toBeGreaterThan(0);
    }
    const solutions = lessonSolutions(lesson.id, problem);
    expect(solutions.length).toBeGreaterThan(0);
    if (lesson.id === 'liberties') {
      expect(lessonAnswer(lesson.id, problem, solutions.length).correct).toBe(true);
      expect(lessonAnswer(lesson.id, problem, solutions.length + 1).correct).toBe(false);
    } else {
      if (['capture', 'escape', 'capture-rescue'].includes(lesson.id)) expect(r.getGroup(board, 5, ...problem.target).liberties.size).toBe(1);
      for (const move of solutions) {
        expect(r.tryPlaceStone(board, 5, ...move, 1, null).valid).toBe(true);
        expect(lessonAnswer(lesson.id, problem, move).correct).toBe(true);
      }
      expect(lessonAnswer(lesson.id, problem, problem.target).correct).toBe(false);
      expect(lessonAnswer(lesson.id, problem, [-1, 0]).correct).toBe(false);
    }
  });
}

test('共用氣只算一次，解說的數量與規則一致', () => {
  expect(LESSONS[0].problems.map(p => lessonSolutions('liberties', p).length)).toEqual([4,3,2,6]);
});

 test('題目 ID 唯一，解答逐題有可觀察的教學結果', () => {
  const ids = LESSONS.flatMap(l => l.problems.map(p => p.id));
  expect(ids).toHaveLength(21);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every(id => typeof id === 'string')).toBe(true);
  const expected = {
    connect: [[[2,2]], [[2,1]], [[0,1]]],
    cut: [[[2,2]], [[2,1]], [[0,1]]],
    'capture-rescue': [[[1,3]], [[1,0]], [[1,0]]],
  };
  for (const [kind, moves] of Object.entries(expected)) {
    const lesson = LESSONS.find(l => l.id === kind);
    lesson.problems.forEach((p, i) => {
      expect(lessonSolutions(kind, p)).toEqual(moves[i]);
      expect(lessonAnswer(kind, p, [4,4]).correct).toBe(false);
    });
  }
});

test('吃子救棋不能只延伸，也不能只吃旁邊無關的棋', () => {
  const lesson = LESSONS.find(l => l.id === 'capture-rescue');
  expect(lessonAnswer(lesson.id, lesson.problems[0], [2,3]).correct).toBe(false);
});
