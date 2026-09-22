const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const {loadProblem} = await import('../ggg-problem.js');
  const dir = 'public/go-problems/ggg/';
  const manifest = JSON.parse(fs.readFileSync(dir+'index.json'));
  const translations = JSON.parse(fs.readFileSync(dir+'zh-Hant.json')).entries;
  let target;
  for (const meta of manifest.problems) {
    const problem = loadProblem(fs.readFileSync(dir+meta.file,'utf8'),meta.id);
    const node = problem.nodes.find(n => n.props.C?.[0]?.length > 250 && n.props.LB?.length >= 2);
    if (node) { target={problem,node,meta}; break; }
  }
  assert.ok(target, '需要一個真實長解說與棋盤標記案例');
  const b=await chromium.launch({headless:true});
  try {
    const c=await b.newContext({reducedMotion:'reduce',serviceWorkers:'block'});
    const p=await c.newPage(); const errors=[]; p.on('pageerror',e=>errors.push(e.message));
    const base=process.argv[2] || 'http://127.0.0.1:4175';
    await p.goto(base+'/#tsumego');
    await p.locator('#gggCommentZh').waitFor();
    for (const width of [390,768,1440]) {
      await p.setViewportSize({width,height:900});
      await p.waitForFunction(()=> {
        const board=document.querySelector('.ggg-board-stage');
        return board.getBoundingClientRect().width<=document.querySelector('.ggg-board-wrap').clientWidth;
      });
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await p.screenshot({path:`/tmp/ggg-final-${width}.png`,fullPage:true});
    }
    await p.locator('#gggSelect').selectOption(target.meta.id);
    await p.locator('#gggTitle').filter({hasText:`第 ${Number(target.meta.id.split('-').at(-1))} 題`}).waitFor();
    await p.getByRole('button',{name:'看解答',exact:true}).click();
    const path=[];let id=target.node.id;
    while(id!==target.problem.root) {path.unshift(id);id=target.problem.parents.get(id);}
    let current=target.problem.root;
    for(const id of path){await p.locator('#gggBranches button').nth(target.problem.nodes[current].children.indexOf(id)).click();current=id;}
    assert.equal(await p.locator('#gggCommentZh').textContent(),translations[target.node.props.C[0]]);
    for(const label of target.node.props.LB) {
      assert.ok(await p.locator('#gggBoard').getByRole('button',{name:new RegExp(`標記 ${label.slice(3)}$`)}).count()>0);
    }
    assert.equal(await p.locator('#gggComment').isVisible(),false);
    await p.getByText('查看英文原文',{exact:true}).click();
    assert.equal(await p.locator('#gggComment').textContent(),target.node.props.C[0]);
    for(const width of [390,768,1440]) {
      await p.setViewportSize({width,height:900});
      await p.screenshot({path:`/tmp/ggg-long-${width}.png`,fullPage:true});
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    const injected='<img src=x onerror="window.gggInjected=true">';
    await p.route('**/go-problems/ggg/*.sgf',r=>r.fulfill({status:200,body:fs.readFileSync(dir+target.meta.file,'utf8').replace('C[','C['+injected)}));
    await p.reload();
    await p.getByText('此段中文翻譯尚未提供，請參考英文原文。',{exact:true}).waitFor();
    assert.equal(await p.locator('#gggComment').isVisible(),true);
    assert.ok((await p.locator('#gggComment').textContent()).includes(injected));
    assert.equal(await p.locator('#gggComment img').count(),0);
    assert.equal(await p.evaluate(()=>window.gggInjected),undefined);
    assert.deepEqual(errors,[]);
    console.log(`PASS：三種寬度、${target.meta.id} 長解說及棋盤標記、中英文對照、缺譯提示與原文 HTML 不執行。`);
  } finally {await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
