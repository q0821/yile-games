import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadProblem } from '../ggg-problem.js';
const dir = new URL('../public/go-problems/ggg/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('index.json',dir)));
if (manifest.problems.length !== 140 || manifest.license !== 'CC-BY-NC-SA-4.0') throw new Error('題庫數量或授權錯誤');
let nodes=0;
for (const meta of manifest.problems) {
  if (!/^ggg-easy-\d+\.sgf$/.test(meta.file) || meta.id+'.sgf' !== meta.file) throw new Error('題目路徑錯誤');
  const bytes = readFileSync(new URL(meta.file,dir));
  if(createHash('sha256').update(bytes).digest('hex')!==meta.sha256) throw new Error(`${meta.id} 原檔指紋不符`);
  nodes+=loadProblem(bytes.toString('utf8'),meta.id).nodes.length;
}
for (const file of ['LICENSE','README.md','NOTICE.md']) if (!readFileSync(new URL(file,dir),'utf8').trim()) throw new Error('缺少授權資訊');
console.log(`Go Game Guru：${manifest.problems.length} 題、${nodes} 節點與來源指紋驗證通過。`);
