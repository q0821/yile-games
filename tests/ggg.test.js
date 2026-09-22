const fs = require('node:fs');
const crypto = require('node:crypto');
const { sandboxWithRules, createMockLocalStorage } = require('./helpers');
const r = sandboxWithRules();
const sgf = r.localRequire('./sgf-tree.js');
const game = r.localRequire('./ggg-problem.js');
const progress = r.localRequire('./ggg-progress.js');
const dir = 'public/go-problems/ggg/';
const manifest = JSON.parse(fs.readFileSync(dir+'index.json'));
const read = id => game.loadProblem(fs.readFileSync(dir+id+'.sgf','utf8'),id);

test('繁中翻譯完整覆蓋註解，保留棋盤標記、來源網址與同授權', () => {
  const translations = JSON.parse(fs.readFileSync(dir+'zh-Hant.json','utf8'));
  const sources = manifest.problems.flatMap(p => read(p.id).nodes.flatMap(n => n.props.C || []));
  const unique = new Set(sources);
  expect(sources).toHaveLength(676);
  expect(Object.keys(translations.entries).sort()).toEqual([...unique].sort());
  expect(unique.size).toBe(151);
  expect(translations.license).toBe(manifest.license);
  expect(translations.sourceCommit).toBe(manifest.commit);
  for (const source of unique) {
    const zh = translations.entries[source];
    expect(zh).toMatch(/[\u4e00-\u9fff]/);
    const marks = s => [...new Set(s.match(/\b[A-Z]\b/g) || [])].sort();
    expect(marks(zh)).toEqual(marks(source));
    expect(zh.match(/https?:\/\/\S+/g) || []).toEqual(source.match(/https?:\/\/\S+/g) || []);
  }
});

test('SGF 序列、分支、多值、跳脫右括號及續行不會互相混淆', () => {
  const tree = sgf.parseSgf('(;SZ[5]AB[aa][bb]C[a\\]b\\\nnext](;B[cc];W[dd])(;B[ee]C[Correct]))');
  expect(tree.nodes[0].props.C).toEqual(['a]bnext']);
  expect(tree.nodes[0].props.AB).toEqual(['aa','bb']);
  expect(tree.nodes[0].children).toEqual([1,3]);
  expect(tree.nodes[1].children).toEqual([2]);
  expect(sgf.sgfPoints(['aa:bb'],5)).toEqual([[0,0],[0,1],[1,0],[1,1]]);
});
test.each(['(;C[unfinished)', '(;SZ[19]SZ[9])', '(;GM[2])', '(;B[aa])(;B[bb])'])('格式錯誤不默默接受：%s', text => {
  expect(() => sgf.parseSgf(text)).toThrow();
});
test('題庫 manifest 固定提交與授權，沒有把模板或其他難度混入', () => {
  expect(manifest.problems).toHaveLength(140);
  expect(manifest.commit).toBe('eee12b2e39d59dbe81a8b9eaa7d4f103978d9224');
  expect(manifest.license).toBe('CC-BY-NC-SA-4.0');
  expect(new Set(manifest.problems.map(p=>p.id)).size).toBe(140);
  expect(fs.readFileSync(dir+'LICENSE','utf8')).toContain('NonCommercial');
});
for (const meta of manifest.problems) test(`${meta.id}：原檔指紋、全部分支合法、正解可完整作答`, () => {
  const bytes = fs.readFileSync(dir+meta.file);
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(meta.sha256);
  const problem = read(meta.id);
  expect(problem.positions.size).toBe(problem.nodes.length);
  expect(problem.marked.size).toBeGreaterThan(0);
  let state = game.startAttempt(problem);
  let steps = 0;
  while (!state.done && steps++ < 100) {
    const next = problem.nodes[state.node].children.find(id => problem.reachable.has(id));
    const move = sgf.sgfMove(problem.nodes[next],problem.size);
    expect(move.color).toBe(problem.player);
    state = game.playMove(problem,state,move.point);
  }
  expect(state.status).toBe('correct');
  expect(state.assisted).toBe(false);
  expect(state.mistaken).toBe(false);
});
test('第一題第一手正確不能計完成，必須回應白棋後走到正解', () => {
  const p = read('ggg-easy-01');
  let state = game.playMove(p,game.startAttempt(p),sgf.sgfPoint('rs',19));
  expect(state.done).toBe(false);
  expect(state.history).toHaveLength(3);
  state = game.playMove(p,state,sgf.sgfPoint('ns',19));
  expect(state.status).toBe('correct');
  const alternative = game.playMove(p,game.playMove(p,game.startAttempt(p),sgf.sgfPoint('rs',19)),sgf.sgfPoint('ps',19));
  expect(alternative.status).toBe('correct');
});
test('未收錄落點不改盤，已收錄參考分支不冒充正解', () => {
  const p = read('ggg-easy-01');
  const start = game.startAttempt(p);
  const unknown = game.playMove(p,start,[0,0]);
  expect(unknown.status).toBe('unlisted'); expect(unknown.node).toBe(start.node);
  const variation = game.playMove(p,start,sgf.sgfPoint('rq',19));
  expect(variation.status).toBe('variation');
  expect(variation.mistaken).toBe(true);
  expect(variation.node).not.toBe(start.node);
});
test('提示與重新整理不誤記自行完成，舊題庫進度不動', () => {
  const storage = createMockLocalStorage(); storage.setItem('gogame_tsumego_progress','old');
  const ids = manifest.problems.map(p=>p.id);
  let saved = progress.newProgress(ids[0]);
  saved = progress.recordGgg(saved,{assisted:true,mistaken:false,status:'playing'});
  progress.saveGggProgress(storage,saved);
  saved = progress.loadGggProgress(storage,ids).progress;
  saved = progress.recordGgg(saved,{assisted:false,mistaken:false,status:'correct'});
  expect(saved.records[ids[0]]).toEqual({solved:false,review:true});
  expect(storage.getItem('gogame_tsumego_progress')).toBe('old');
  saved = progress.recordGgg({...saved,assisted:false,mistaken:false},{assisted:false,mistaken:false,status:'correct'});
  expect(saved.records[ids[0]]).toEqual({solved:true,review:false});
});
test('損壞進度不覆寫，寫入失敗不是成功', () => {
  const storage = createMockLocalStorage(); storage.setItem(progress.GGG_PROGRESS_KEY,'bad-json');
  const log=jest.spyOn(console,'warn').mockImplementation(()=>{});
  expect(progress.loadGggProgress(storage,manifest.problems.map(p=>p.id)).writable).toBe(false);
  expect(storage.getItem(progress.GGG_PROGRESS_KEY)).toBe('bad-json');
  expect(progress.saveGggProgress({setItem(){throw Error('secret');}},progress.newProgress('ggg-easy-01'))).toMatch(/無法儲存/);
  expect(log.mock.calls.flat().join('')).not.toContain('secret'); log.mockRestore();
});
