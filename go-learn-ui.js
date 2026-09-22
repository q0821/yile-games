import { LESSONS, lessonBoard, lessonAnswer, lessonSolutions } from './go-lessons.js';
import { getGroup } from './rules.js';

let lessonIndex = 0;
let problemIndex = 0;
let finished = false;
let revealed = false;
const solved = new Set();
let board;
let markers = [];
let message = '';
const $ = id => document.getElementById(id);

function resetProblem() {
  board = lessonBoard(LESSONS[lessonIndex].problems[problemIndex]);
  finished = false;
  revealed = false;
  markers = [];
  message = '先觀察有金圈的棋串，再選答案。';
}

function button(text, action, className = '') {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = text;
  el.className = className;
  el.addEventListener('click', action);
  return el;
}

function submit(answer) {
  if (finished) return;
  const lesson = LESSONS[lessonIndex];
  const problem = lesson.problems[problemIndex];
  const result = lessonAnswer(lesson.id, problem, answer);
  if (result.correct) {
    finished = true;
    board = result.board;
    markers = lesson.id === 'liberties' ? lessonSolutions(lesson.id, problem) : [answer];
    if (!revealed) solved.add(`${lesson.id}-${problemIndex}`);
    message = `${revealed ? '已跟著解答完成。' : '答對了！'}${problem.explanation}`;
  } else {
    message = result.reason || (lesson.id === 'liberties'
      ? '再數一次：只算上下左右的空點，同一個空點不要重複算。'
      : lesson.id === 'capture' ? '這一步還吃不到目標白棋。找找它最後一口氣，原盤面已保留。'
        : '這一步還沒讓目標黑棋增加到兩口氣。試著延伸或連接，原盤面已保留。');
  }
  render();
  $('learnFeedback').focus();
}

function render() {
  const root = $('goLearnScreen');
  const lesson = LESSONS[lessonIndex];
  const problem = lesson.problems[problemIndex];
  // 固定模板，題目與訊息都透過 textContent 填入。
  root.innerHTML = `<header class="mode-header"><a class="mode-back" href="#home">回首頁</a><h2 class="mode-title">圍棋入門</h2></header>
    <p class="learn-lead">先學會照顧一串棋，再開始一盤棋。</p>
    <nav class="learn-tabs" aria-label="練習主題"></nav>
    <div class="learn-card"><p id="learnProgress" class="learn-progress"></p><h3 id="learnTitle"></h3><p id="learnIntro"></p>
    <div id="learnBoard" class="learn-board" role="group" aria-label="五路練習棋盤，金圈為目標棋串"></div>
    <p class="learn-caption">金圈標出目標棋串。棋子落在交叉點上。</p>
    <div id="learnChoices" class="learn-choices" role="group" aria-label="選擇氣的數量"></div>
    <p id="learnFeedback" class="learn-feedback" role="status" aria-live="polite" aria-atomic="true"></p>
    <div id="learnActions" class="learn-actions"></div></div>
    <footer class="learn-footer"><p id="learnSummary"></p><a href="#play">到圍棋對弈，試試「新手設定」</a><p class="learn-caption">本頁進度保留到重新整理為止。</p></footer>`;
  const tabs = root.querySelector('.learn-tabs');
  LESSONS.forEach((item, i) => {
    const tab = button(`${i + 1}. ${item.title}`, () => {
      lessonIndex = i; problemIndex = 0; resetProblem(); render(); $('learnTitle').focus();
    });
    tab.setAttribute('aria-pressed', String(i === lessonIndex));
    tabs.append(tab);
  });
  $('learnProgress').textContent = `第 ${problemIndex + 1} 題，共 ${lesson.problems.length} 題`;
  $('learnTitle').textContent = lesson.id === 'liberties' ? '這串黑棋有幾口氣？' : lesson.id === 'capture' ? '黑先，吃掉有金圈的白棋' : '黑先，救出有金圈的黑棋';
  $('learnTitle').tabIndex = -1;
  $('learnIntro').textContent = lesson.intro;
  const target = new Set(getGroup(lessonBoard(problem), 5, ...problem.target).stones.map(([r,c]) => `${r},${c}`));
  const marked = new Set(markers.map(([r,c]) => `${r},${c}`));
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const color = board[r][c];
    const cell = button('', () => submit([r,c]), 'learn-point');
    cell.dataset.row = r; cell.dataset.col = c;
    const coord = `${'ABCDE'[c]}${5-r}`;
    const isTarget = target.has(`${r},${c}`) && color !== 0;
    cell.setAttribute('aria-label', `${coord}，${color === 1 ? '黑棋' : color === 2 ? '白棋' : '空點'}${isTarget ? '，目標棋串' : ''}${marked.has(`${r},${c}`) ? '，解答標記' : ''}`);
    // 數氣題的棋盤僅供觀察，保留可讀的棋子標籤。
    cell.disabled = finished || lesson.id === 'liberties';
    if (color) {
      const stone = document.createElement('span');
      stone.className = `learn-stone ${color === 1 ? 'black' : 'white'}${isTarget ? ' target' : ''}`;
      cell.append(stone);
    }
    if (marked.has(`${r},${c}`)) {
      const dot = document.createElement('span'); dot.className = 'learn-mark'; dot.textContent = '●'; cell.append(dot);
    }
    $('learnBoard').append(cell);
  }
  if (lesson.id === 'liberties') for (let n = 1; n <= 8; n++) {
    const choice = button(`${n} 口氣`, () => submit(n)); choice.disabled = finished;
    $('learnChoices').append(choice);
  }
  else $('learnChoices').hidden = true;
  $('learnFeedback').textContent = message;
  const actions = $('learnActions');
  actions.append(button('再做一次', () => { resetProblem(); render(); $('learnTitle').focus(); }));
  const reveal = button('看解說', () => {
    revealed = true; finished = true;
    markers = lessonSolutions(lesson.id, problem);
    message = `解答：${lesson.id === 'liberties' ? `共有 ${markers.length} 口氣。` : '金色圓點是可行的落點。'}${problem.explanation} 按「再做一次」試試。`;
    render(); $('learnFeedback').focus();
  });
  reveal.disabled = finished;
  actions.append(reveal);
  const next = button(problemIndex === 3 ? (lessonIndex === 2 ? '再練數氣' : '下一個主題') : '下一題', () => {
    problemIndex++;
    if (problemIndex === lesson.problems.length) { problemIndex = 0; lessonIndex = (lessonIndex + 1) % LESSONS.length; }
    resetProblem(); render(); $('learnTitle').focus();
  }, 'primary');
  next.disabled = !finished;
  actions.append(next);
  $('learnFeedback').tabIndex = -1;
  $('learnSummary').textContent = solved.size === 12 ? '十二題都解出來了！可以到小棋盤練習一局。' : `本次已自行解出 ${solved.size}／12 題。`;
}

export function enterGoLearn() {
  if (!board) resetProblem();
  render();
}
