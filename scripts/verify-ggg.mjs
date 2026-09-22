import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadProblem } from '../ggg-problem.js';
const dir = new URL('../public/go-problems/ggg/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('index.json',dir)));
const translations = JSON.parse(readFileSync(new URL('zh-Hant.json',dir)));
if (translations.license !== manifest.license || translations.sourceCommit !== manifest.commit) throw new Error('翻譯來源或授權不符');
if (manifest.problems.length !== 140 || manifest.license !== 'CC-BY-NC-SA-4.0') throw new Error('題庫數量或授權錯誤');
let nodes=0, comments=0;
for (const meta of manifest.problems) {
  if (!/^ggg-easy-\d+\.sgf$/.test(meta.file) || meta.id+'.sgf' !== meta.file) throw new Error('題目路徑錯誤');
  const bytes = readFileSync(new URL(meta.file,dir));
  if(createHash('sha256').update(bytes).digest('hex')!==meta.sha256) throw new Error(`${meta.id} 原檔指紋不符`);
  const problem = loadProblem(bytes.toString('utf8'),meta.id);
  nodes+=problem.nodes.length;
  for (const node of problem.nodes) for (const source of node.props.C || []) {
    if (typeof translations.entries[source] !== 'string' || !translations.entries[source].trim()) throw new Error(`${meta.id} 缺少中文翻譯`);
    comments++;
  }
}
for (const file of ['LICENSE','README.md','NOTICE.md']) if (!readFileSync(new URL(file,dir),'utf8').trim()) throw new Error('缺少授權資訊');
console.log(`Go Game Guru：${manifest.problems.length} 題、${nodes} 節點、${comments} 處中文解說與來源指紋驗證通過。`);
