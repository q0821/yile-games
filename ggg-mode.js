import { loadProblem, startAttempt, playMove, coordinate } from './ggg-problem.js';
import { sgfMove, sgfPoint } from './sgf-tree.js';
import { loadGggProgress, saveGggProgress, recordGgg } from './ggg-progress.js';

const BASE = 'go-problems/ggg/';
let manifest, progress, storage, writable, storageError = '';
let problem, attempt, browse = null, reviewOnly = false;
let requestSeq = 0;
const cache = new Map();
const $ = id => document.getElementById(id);
const active = () => location.hash === '#tsumego';
function button(label, action) {
  const el = document.createElement('button'); el.type = 'button'; el.textContent = label;
  el.addEventListener('click', action); return el;
}
function paragraph(text, className = '') {
  const el = document.createElement('p'); el.textContent = text; el.className = className; return el;
}
function persist() { if (writable) storageError = saveGggProgress(storage, progress); }
function frame() {
  $('tsumegoScreen').innerHTML = `<header class="mode-header"><a class="mode-back" href="#home">回首頁</a><h2 class="mode-title">圍棋死活與手筋</h2></header>
    <p>Go Game Guru 入門題，沿著原譜練習多手攻防。若還沒學過規則，可先做<a href="#learn">圍棋入門練習</a>。</p>
    <div id="gggContent" aria-live="polite"></div>
    <footer class="ggg-credit"><p>題目與原文解說：Go Game Guru（An Younggil、David Ormerod）。免費、非商業學習用途。</p>
    <p><a href="https://github.com/gogameguru/go-problems" target="_blank" rel="noopener noreferrer">原始來源</a> · <a href="go-problems/ggg/LICENSE" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0 授權全文</a> · <a href="go-problems/ggg/NOTICE.md" target="_blank" rel="noopener noreferrer">署名與改作說明</a></p>
    <p>原始 SGF 未修改；互動介面為本專案新增，英文解說保留原文。舊題庫已停用，原有解題進度保留且分開記錄。</p></footer>`;
}
function fail(retry) {
  console.error('[ggg] 題庫載入或解析失敗。');
  frame(); $('gggContent').append(paragraph('題目載入失敗，請確認網路後重試。'), button('重新載入', retry));
}
async function read(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('題目無法取得');
  return response;
}
export async function enterGggMode() {
  const token = ++requestSeq;
  frame(); $('gggContent').textContent = '正在載入題庫…';
  try {
    if (!manifest) {
      const data = await (await read(BASE + 'index.json')).json();
      if (!Array.isArray(data.problems) || data.problems.length !== 140
        || data.problems.some(p => !/^ggg-easy-\d+$/.test(p.id) || p.file !== `${p.id}.sgf`)
        || new Set(data.problems.map(p => p.id)).size !== data.problems.length) throw new Error('題庫索引不完整');
      if (token !== requestSeq || !active()) return;
      manifest = data;
    }
    if (!progress) {
      try { storage = window.localStorage; } catch { storage = null; }
      const loaded = loadGggProgress(storage, manifest.problems.map(p => p.id));
      progress = loaded.progress; writable = loaded.writable; storageError = loaded.error;
    }
    if (token !== requestSeq || !active()) return;
    await selectProblem(progress.current, true);
  } catch {
    if (token === requestSeq && active()) fail(enterGggMode);
  }
}
async function selectProblem(id, resume = false) {
  const token = ++requestSeq;
  frame(); $('gggContent').textContent = '正在載入題目…';
  try {
    const meta = manifest.problems.find(p => p.id === id);
    if (!meta) throw new Error('未知題目');
    let loaded = cache.get(id);
    if (!loaded) loaded = loadProblem(await (await read(BASE + meta.file)).text(), id);
    if (token !== requestSeq || !active()) return;
    cache.set(id, loaded); problem = loaded;
    if (!resume) progress = { ...progress, current: id, assisted: false, mistaken: false };
    attempt = { ...startAttempt(problem), assisted: progress.assisted, mistaken: progress.mistaken };
    browse = null; persist(); render();
  } catch {
    if (token === requestSeq && active()) fail(() => selectProblem(id, resume));
  }
}
function queue() { return manifest.problems.filter(p => !reviewOnly || progress.records[p.id]?.review); }
function render() {
  frame(); const root = $('gggContent');
  if (storageError) root.append(paragraph(storageError, 'ggg-warning'));
  const modes = document.createElement('div'); modes.className = 'learn-actions';
  const all = button('全部題目', () => { reviewOnly = false; selectProblem(progress.current); });
  all.setAttribute('aria-pressed', String(!reviewOnly));
  const review = button('複習錯題', () => {
    reviewOnly = true;
    const next = queue()[0];
    if (next) selectProblem(next.id); else renderEmpty();
  });
  review.setAttribute('aria-pressed', String(reviewOnly)); modes.append(all, review); root.append(modes);
  const solved = Object.values(progress.records).filter(r => r.solved).length;
  const pending = Object.values(progress.records).filter(r => r.review).length;
  const stats = paragraph(`已自行完成 ${solved}／${manifest.problems.length} 題，待複習 ${pending} 題。`); stats.id = 'gggStats'; root.append(stats);
  const chooser = document.createElement('label'); chooser.textContent = '選擇題目 ';
  const select = document.createElement('select'); select.id = 'gggSelect';
  // 本輪答對後仍保留目前題目，按下一題才離開，避免畫面與選單不同步。
  const options = manifest.problems.filter(p => !reviewOnly || progress.records[p.id]?.review || p.id === problem.id);
  for (const p of options) {
    const option = document.createElement('option'); option.value = p.id;
    option.textContent = `第 ${Number(p.id.split('-').at(-1))} 題${progress.records[p.id]?.solved ? '（已解）' : ''}`;
    option.selected = p.id === problem.id; select.append(option);
  }
  select.addEventListener('change', () => selectProblem(select.value)); chooser.append(select); root.append(chooser);
  const heading = document.createElement('h3'); heading.id = 'gggTitle'; heading.tabIndex = -1;
  heading.textContent = `${problem.player === 1 ? '黑' : '白'}先，第 ${Number(problem.id.split('-').at(-1))} 題${browse ? '，查看原譜' : ''}`; root.append(heading);
  const nodeId = browse ? browse.at(-1) : attempt.node;
  const node = problem.nodes[nodeId];
  renderBoard(root, nodeId);
  const feedback = paragraph(statusText(), 'learn-feedback'); feedback.id = 'gggFeedback'; feedback.role = 'status'; feedback.tabIndex = -1; root.append(feedback);
  const comment = node.props.C?.[0];
  if (comment) {
    const label = paragraph('作者原文解說（英文）'); label.className = 'learn-caption';
    const text = paragraph(comment, 'ggg-comment'); text.id = 'gggComment'; text.lang = 'en'; root.append(label, text);
  }
  if (browse) {
    const branches = document.createElement('div'); branches.className = 'learn-actions'; branches.id = 'gggBranches';
    for (const [i,id] of node.children.entries()) {
      const move = sgfMove(problem.nodes[id], problem.size);
      branches.append(button(`變化 ${i+1}：${move.color === 1 ? '黑' : '白'} ${coordinate(move.point, problem.size)}`, () => { browse.push(id); render(); $('gggFeedback').focus(); }));
    }
    root.append(branches);
  }
  const actions = document.createElement('div'); actions.className = 'learn-actions';
  const reset = button('重新挑戰', () => {
    // 保留本題已看解答／答錯紀錄，需另一次選題才視為新挑戰。
    attempt = { ...startAttempt(problem), assisted: progress.assisted, mistaken: progress.mistaken };
    browse = null; render(); $('gggTitle').focus();
  });
  const reveal = button('看解答', () => {
    attempt = { ...attempt, assisted: true }; progress = recordGgg(progress, attempt); persist();
    browse = [problem.root]; render(); $('gggFeedback').focus();
  });
  actions.append(reset, reveal);
  if (browse) {
    const previous = button('上一手', () => { browse.pop(); render(); $('gggFeedback').focus(); }); previous.disabled = browse.length < 2;
    const next = button('示範下一手', () => {
      const children = problem.nodes[browse.at(-1)].children;
      const chosen = children.find(id => problem.reachable.has(id)) ?? children[0];
      if (chosen !== undefined) browse.push(chosen);
      render(); $('gggFeedback').focus();
    }); next.disabled = !node.children.length;
    actions.append(previous, next);
  } else {
    const inspect = button('查看本次變化', () => {
      attempt = { ...attempt, assisted: true }; progress = recordGgg(progress, attempt); persist();
      browse = [...attempt.history]; render(); $('gggFeedback').focus();
    });
    inspect.disabled = !attempt.done; actions.append(inspect);
    if (node.children.some(id => sgfMove(problem.nodes[id], problem.size).point === null)) actions.append(button('虛手', () => submit(null)));
  }
  const nextProblem = button('下一題', () => {
    const eligible = queue();
    const next = eligible.find(p => manifest.problems.indexOf(p) > manifest.problems.findIndex(p => p.id === problem.id)) || eligible[0];
    if (next) selectProblem(next.id); else renderEmpty();
  }); actions.append(nextProblem); root.append(actions);
  const source = document.createElement('a'); source.href = BASE + `${problem.id}.sgf`; source.download = `${problem.id}.sgf`; source.textContent = '下載本題原始 SGF'; root.append(source);
  root.append(paragraph('電腦應手來自原譜；完成表示走到本次變化的作者正解標記，其他應手可在原譜中查看。進度僅保存在這個瀏覽器。', 'learn-caption'));
}
function renderEmpty() {
  frame(); $('gggContent').append(paragraph('目前沒有待複習的題目。'), button('返回全部題目', () => { reviewOnly = false; selectProblem(progress.current); }));
}
function statusText() {
  if (browse) return problem.marked.has(browse.at(-1)) ? '原譜在這裡標示正解。查看解答不列入自行完成。' : '正在查看原譜，可選擇分支或逐手示範。沒有正解標記的分支不另行判斷死活。';
  if (attempt.status === 'correct') return attempt.assisted ? '已跟著解答完成這個變化，不列入自行完成。' : '本次解答變化完成！可以再查看其他應手。';
  if (attempt.status === 'unlisted') return '原譜未收錄這個落點，盤面保持原狀。這不代表它必定錯誤，可換一手或看解答。';
  if (attempt.status === 'variation') return '這手進入未通往作者正解標記的參考變化。可查看後續原譜，再重新挑戰。';
  return attempt.node === problem.root ? '請在棋盤落子，試著走完原譜中的解答。' : '已依原譜應手，請繼續。尚未走到作者標記的正解。';
}
function submit(point) {
  if (browse || attempt.done) return;
  attempt = playMove(problem, attempt, point); progress = recordGgg(progress, attempt); persist();
  render(); $('gggFeedback').focus();
}
function renderBoard(root, nodeId) {
  const { minRow, maxRow, minCol, maxCol } = problem.viewport;
  const wrapper = document.createElement('div'); wrapper.className = 'ggg-board-wrap';
  const grid = document.createElement('div'); grid.id = 'gggBoard'; grid.className = 'ggg-board'; grid.role = 'group';
  grid.setAttribute('aria-label', `${problem.size} 路棋盤的局部視窗`);
  const cols = maxCol-minCol+1; grid.style.setProperty('--cols', cols);
  const board = problem.positions.get(nodeId).board;
  const props = problem.nodes[nodeId].props;
  const labels = new Map((props.LB || []).map(value => [sgfPoint(value.slice(0,2), problem.size).join(','), value.slice(3)]));
  for (const value of props.TR || []) labels.set(sgfPoint(value, problem.size).join(','), '△');
  const last = sgfMove(problem.nodes[nodeId], problem.size)?.point;
  for (let r = minRow; r <= maxRow; r++) for (let c = minCol; c <= maxCol; c++) {
    const color = board[r][c]; const coord = coordinate([r,c],problem.size);
    const label = labels.get(`${r},${c}`) || (last?.[0] === r && last?.[1] === c ? '●' : '');
    const cell = button('', () => submit([r,c])); cell.className = 'ggg-point';
    cell.setAttribute('aria-label', `${coord}，${color === 1 ? '黑棋' : color === 2 ? '白棋' : '空點'}${label ? `，標記 ${label}` : ''}`);
    cell.disabled = !!browse || attempt.done;
    if (r === 0) cell.classList.add('edge-top'); if (r === problem.size-1) cell.classList.add('edge-bottom');
    if (c === 0) cell.classList.add('edge-left'); if (c === problem.size-1) cell.classList.add('edge-right');
    if (color) { const stone = document.createElement('span'); stone.className = `learn-stone ${color === 1 ? 'black' : 'white'}`; cell.append(stone); }
    if (label) { const mark = document.createElement('span'); mark.className = `ggg-mark ${color === 1 ? 'on-black' : ''}`; mark.textContent = label; cell.append(mark); }
    grid.append(cell);
  }
  wrapper.append(grid); root.append(wrapper);
  root.append(paragraph(`局部視窗：${coordinate([maxRow,minCol],problem.size)} 至 ${coordinate([minRow,maxCol],problem.size)}。寬棋形可左右捲動。`, 'learn-caption'));
}
