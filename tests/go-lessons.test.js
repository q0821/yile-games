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
      expect(r.getGroup(board, 5, ...problem.target).liberties.size).toBe(1);
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
