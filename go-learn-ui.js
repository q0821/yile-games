import { LESSONS, PROBLEM_IDS, lessonBoard, lessonAnswer, lessonSolutions } from './go-lessons.js';
import { getGroup } from './rules.js';
import { readProgress, writeProgress, beginProblem, recordAnswer, reviewIds } from './go-learn-progress.js';
import { mountLearnBoard } from './go-learn-board.js';

let disposeBoard;
let lessonIndex = 0;
let problemIndex = 0;
let finished = false;
let progress;
let storage;
let writable = false;
let storageMessage = '';
let reviewQueue = null;
let reviewIndex = 0;
const TITLES = {
  liberties: '這串黑棋有幾口氣？', capture: '黑先，吃掉有金圈的白棋',
  escape: '黑先，救出有金圈的黑棋', connect: '黑先，連起有金圈的兩串黑棋',
  cut: '黑先，阻止兩串白棋直接連接', 'capture-rescue': '黑先，用吃子救出目標黑棋',
};
const RETRY = {
  liberties: '再數一次：只算上下左右的空點，同一個空點不要重複算。',
  capture: '這一步還吃不到目標白棋。找找它最後一口氣，原盤面已保留。',
  escape: '這一步還沒讓目標黑棋增加到兩口氣。試著延伸或連接，原盤面已保留。',
  connect: '兩串目標黑棋還沒有連在一起並保有兩口氣，原盤面已保留。',
  cut: '找找兩串白棋共用的直接連接點，原盤面已保留。',
  'capture-rescue': '要同時提掉白棋、讓目標黑棋有兩口氣。只延伸還不算完成，原盤面已保留。',
};
function persist() {
  if (writable) storageMessage = writeProgress(storage, progress);
}
function selectProblem(id) {
  lessonIndex = LESSONS.findIndex(lesson => lesson.problems.some(p => p.id === id));
  problemIndex = LESSONS[lessonIndex].problems.findIndex(p => p.id === id);
  progress = beginProblem(progress, id);
  persist(); resetProblem();
}
function startReview() {
  reviewQueue = reviewIds(progress);
  reviewIndex = 0;
  if (reviewQueue.length) selectProblem(reviewQueue[0]);
  render(); $('learnTitle')?.focus();
}
let board;
let markers = [];
let message = '';
const $ = id => document.getElementById(id);

function resetProblem() {
  board = lessonBoard(LESSONS[lessonIndex].problems[problemIndex]);
  finished = false;
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
    progress = recordAnswer(progress, 'correct');
    message = `${progress.attempt.assisted ? '已跟著解答完成。' : '答對了！'}${problem.explanation}`;
    if (progress.records[problem.id].review) message += ' 本題保留在待複習，下次不看解說、第一次答對就會移除。';
  } else {
    progress = recordAnswer(progress, 'wrong');
    message = result.reason || RETRY[lesson.id];
  }
  persist();
  render();
  $('learnFeedback').focus();
}

function render() {
  disposeBoard?.(); disposeBoard = null;
  const root = $('goLearnScreen');
  const lesson = LESSONS[lessonIndex];
  const problem = lesson.problems[problemIndex];
  // 固定模板，題目與訊息都透過 textContent 填入。
  root.innerHTML = `<header class="mode-header"><a class="mode-back" href="#home">回首頁</a><h2 class="mode-title">圍棋入門</h2></header>
    <p class="learn-lead">先學會照顧一串棋，再開始一盤棋。</p>
    <div id="learnPractice" class="learn-actions" aria-label="練習方式"></div>
    <p id="learnStorage" role="status"></p>
    <nav class="learn-tabs" aria-label="練習主題"></nav>
    <div class="learn-card"><p id="learnProgress" class="learn-progress"></p><h3 id="learnTitle"></h3><p id="learnIntro"></p>
    <div id="learnBoard" class="learn-board" role="group" aria-label="五路練習棋盤，金圈為目標棋串"></div>
    <p class="learn-caption">金圈標出目標棋串。棋子落在交叉點上。</p>
    <div id="learnChoices" class="learn-choices" role="group" aria-label="選擇氣的數量"></div>
    <p id="learnFeedback" class="learn-feedback" role="status" aria-live="polite" aria-atomic="true"></p>
    <div id="learnActions" class="learn-actions"></div></div>
    <footer class="learn-footer"><p id="learnSummary"></p><a href="#play">到圍棋對弈，試試「新手設定」</a><p class="learn-caption">進度保存在這個瀏覽器，不會跨裝置同步。錯答或看解說的題目會加入待複習。</p></footer>`;
  $('learnStorage').textContent = storageMessage;
  $('learnStorage').hidden = !storageMessage;
  const all = button('全部練習', () => {
    reviewQueue = null; selectProblem(progress.current); render(); $('learnTitle').focus();
  });
  all.setAttribute('aria-pressed', String(reviewQueue === null));
  const review = button(`複習錯題（${reviewIds(progress).length}）`, startReview);
  review.setAttribute('aria-pressed', String(reviewQueue !== null));
  $('learnPractice').append(all, review);
  const solvedCount = Object.values(progress.records).filter(record => record.solved).length;
  $('learnSummary').textContent = `已自行解出 ${solvedCount}／${PROBLEM_IDS.length} 題，待複習 ${reviewIds(progress).length} 題。`;
  if (reviewQueue && reviewIndex >= reviewQueue.length) {
    root.querySelector('.learn-tabs').hidden = true;
    const card = root.querySelector('.learn-card');
    card.replaceChildren();
    const heading = document.createElement('h3');
    heading.id = 'learnTitle'; heading.tabIndex = -1;
    heading.textContent = reviewIds(progress).length ? '本輪複習完成' : '目前沒有待複習的題目';
    const note = document.createElement('p');
    note.textContent = reviewIds(progress).length ? '本輪答錯或看過解說的題目仍保留，可稍後再練。' : '答錯或看過解說的題目會出現在這裡。';
    card.append(heading, note);
    if (reviewIds(progress).length) card.append(button('再複習一輪', startReview));
    return;
  }
  const tabs = root.querySelector('.learn-tabs');
  LESSONS.forEach((item, i) => {
    const tab = button(`${i + 1}. ${item.title}`, () => {
      reviewQueue = null; selectProblem(item.problems[0].id); render(); $('learnTitle').focus();
    });
    tab.setAttribute('aria-pressed', String(i === lessonIndex));
    tabs.append(tab);
  });
  $('learnProgress').textContent = reviewQueue ? `錯題複習 ${reviewIndex + 1}／${reviewQueue.length}` : `第 ${problemIndex + 1} 題，共 ${lesson.problems.length} 題`;
  $('learnTitle').textContent = TITLES[lesson.id];
  $('learnTitle').tabIndex = -1;
  $('learnIntro').textContent = lesson.intro;
  const target = new Set([problem.target, ...(problem.other ? [problem.other] : [])].flatMap(point => getGroup(lessonBoard(problem), 5, ...point).stones.map(([r,c]) => `${r},${c}`)));
  const marked = new Set(markers.map(([r,c]) => `${r},${c}`));
  disposeBoard = mountLearnBoard($('learnBoard'), board, target, marked, finished || lesson.id === 'liberties', submit);
  if (lesson.id === 'liberties') for (let n = 1; n <= 8; n++) {
    const choice = button(`${n} 口氣`, () => submit(n)); choice.disabled = finished;
    $('learnChoices').append(choice);
  }
  else $('learnChoices').hidden = true;
  $('learnFeedback').textContent = message;
  const actions = $('learnActions');
  actions.append(button('再做一次', () => { resetProblem(); render(); $('learnTitle').focus(); }));
  const reveal = button('看解說', () => {
    progress = recordAnswer(progress, 'reveal'); persist(); finished = true;
    markers = lessonSolutions(lesson.id, problem);
    message = `解答：${lesson.id === 'liberties' ? `共有 ${markers.length} 口氣。` : '金色圓點是可行的落點。'}${problem.explanation} 按「再做一次」試試。`;
    render(); $('learnFeedback').focus();
  });
  reveal.disabled = finished;
  actions.append(reveal);
  const lastInLesson = problemIndex === lesson.problems.length - 1;
  const nextText = reviewQueue ? (reviewIndex === reviewQueue.length - 1 ? '完成本輪複習' : '下一題')
    : lastInLesson ? (lessonIndex === LESSONS.length - 1 ? '再練數氣' : '下一個主題') : '下一題';
  const next = button(nextText, () => {
    if (reviewQueue) {
      reviewIndex++;
      if (reviewIndex < reviewQueue.length) selectProblem(reviewQueue[reviewIndex]);
    } else {
      const nextId = PROBLEM_IDS[(PROBLEM_IDS.indexOf(problem.id) + 1) % PROBLEM_IDS.length];
      selectProblem(nextId);
    }
    render(); $('learnTitle').focus();
  }, 'primary');
  next.disabled = !finished;
  actions.append(next);
  $('learnFeedback').tabIndex = -1;

}

export function enterGoLearn() {
  if (!progress) {
    try { storage = window.localStorage; } catch { storage = null; }
    const loaded = readProgress(storage);
    progress = loaded.progress; writable = loaded.writable; storageMessage = loaded.error;
    lessonIndex = LESSONS.findIndex(lesson => lesson.problems.some(p => p.id === progress.current));
    problemIndex = LESSONS[lessonIndex].problems.findIndex(p => p.id === progress.current);
    resetProblem();
  }
  render();
}
