// node scripts/check-go-shapes.cjs [preview URL]
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const {SHAPE_TOPICS,SHAPE_UNITS,topicFrames}=await import('../go-shape-lessons.js');
 const b=await chromium.launch({headless:true});const base=process.argv[2]||'http://127.0.0.1:4175';
 try{
  const context=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`${base}/#learn`);await p.getByRole('button',{name:'棋形教室',exact:true}).click();
  const old=await p.evaluate(()=>localStorage.getItem('gogame_learn_progress_v1'));
  async function select(t){await p.locator('#shapeUnits').getByRole('button',{name:SHAPE_UNITS.find(u=>u.id===t.unit).title,exact:true}).click();await p.locator('#shapeTopic').selectOption(t.id);}
  for(const t of SHAPE_TOPICS){
   await select(t);await p.locator('#shapeBoard canvas').waitFor();const frames=topicFrames(t);
   for(let i=1;i<frames.length;i++)await p.locator('#shapeSteps').getByRole('button',{name:'下一步',exact:true}).click();
   assert.equal(await p.locator('#shapeSteps').getByRole('button',{name:'下一步',exact:true}).isDisabled(),true);
   assert.ok((await p.locator('#shapeFeedback').innerText()).includes(frames.at(-1).text));
   await p.getByRole('button',{name:'開始練習',exact:true}).click();
   for(const [i,q]of t.questions.entries()){
    const option=p.locator('#shapeOptions').getByRole('button',{name:q.options[q.correct],exact:true});await option.focus();await p.keyboard.press('Enter');
    assert.match(await p.locator('#shapeFeedback').innerText(),/答對了/);
    if(i===0)await p.locator('#shapeActions').getByRole('button',{name:'下一題',exact:true}).click();
   }
  }
  assert.match(await p.locator('#shapeSummary').innerText(),/36／36 題，待複習 0/);
  assert.equal(await p.evaluate(()=>localStorage.getItem('gogame_learn_progress_v1')),old);
  // 看答案、返回介紹與跨重整不得洗掉本輪的提示狀態。
  await select(SHAPE_TOPICS[0]);await p.getByRole('button',{name:'開始練習',exact:true}).click();await p.getByRole('button',{name:'再練一次',exact:true}).click();
  await p.getByRole('button',{name:'返回介紹',exact:true}).click();await p.getByRole('button',{name:'開始練習',exact:true}).click();
  await p.reload();await p.getByRole('button',{name:'棋形教室',exact:true}).click();
  const q=SHAPE_TOPICS[0].questions[0];await p.locator('#shapeOptions').getByRole('button',{name:q.options[q.correct],exact:true}).click();assert.match(await p.locator('#shapeFeedback').innerText(),/跟著解說/);
  await p.getByRole('button',{name:'複習教室錯題（1）',exact:true}).click();
  await p.locator('#shapeOptions').getByRole('button',{name:q.options[q.correct],exact:true}).click();assert.match(await p.locator('#shapeSummary').innerText(),/待複習 0/);
  await p.getByRole('button',{name:'完成本輪複習',exact:true}).click();assert.match(await p.locator('#shapeFeedback').innerText(),/本輪複習完成/);
  for(const t of [SHAPE_TOPICS[0],SHAPE_TOPICS.find(t=>t.id==='snapback')]){
   await select(t);
   for(const width of [320,390,768,1440]){
    await p.setViewportSize({width,height:1000});await p.locator('#shapeBoard canvas').waitFor();
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await p.locator('.learn-card').screenshot({path:`/tmp/gogame-shapes-${t.id}-${width}.png`});
   }
  }
  await p.getByRole('button',{name:'基礎練習',exact:true}).click();await p.locator('#learnBoard canvas').waitFor();assert.match(await p.locator('#learnSummary').innerText(),/／21/);
  assert.deepEqual(errors,[]);
  // 新瀏覽器讀到損壞資料時不能覆寫，且仍能學習。
  const blocked=await b.newPage({serviceWorkers:'block'});await blocked.goto(`${base}/#learn`);await blocked.evaluate(()=>localStorage.setItem('gogame_shape_progress_v1','broken'));
  await blocked.getByRole('button',{name:'棋形教室',exact:true}).click();assert.match(await blocked.locator('#shapeStorage').innerText(),/原資料未覆寫/);
  await blocked.getByRole('button',{name:'開始練習',exact:true}).click();await blocked.getByRole('button',{name:'看解答',exact:true}).click();assert.equal(await blocked.evaluate(()=>localStorage.getItem('gogame_shape_progress_v1')),'broken');
  const unavailable=await b.newPage({serviceWorkers:'block'});await unavailable.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}}));await unavailable.goto(`${base}/#learn`);await unavailable.getByRole('button',{name:'棋形教室',exact:true}).click();assert.match(await unavailable.locator('#shapeStorage').innerText(),/只暫存在本頁/);await unavailable.getByRole('button',{name:'開始練習',exact:true}).click();await unavailable.getByRole('button',{name:'看解答',exact:true}).click();assert.match(await unavailable.locator('#shapeFeedback').innerText(),/解答/);
  const fresh=await b.newPage({serviceWorkers:'block'});await fresh.goto(`${base}/#learn`);await fresh.getByRole('button',{name:'棋形教室',exact:true}).click();await fresh.getByRole('button',{name:'開始練習',exact:true}).click();
  await fresh.locator('#shapeOptions').getByRole('button',{name:q.options[(q.correct+1)%3],exact:true}).click();
  await fresh.reload();await fresh.getByRole('button',{name:'棋形教室',exact:true}).click();await fresh.locator('#shapeOptions').getByRole('button',{name:q.options[q.correct],exact:true}).click();assert.match(await fresh.locator('#shapeSummary').innerText(),/1／36 題，待複習 1/);
  await fresh.getByRole('button',{name:'下一題',exact:true}).click();await fresh.getByRole('button',{name:'看解答',exact:true}).click();assert.match(await fresh.locator('#shapeSummary').innerText(),/1／36 題，待複習 2/);
  const quota=await b.newPage({serviceWorkers:'block'});await quota.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});await quota.goto(`${base}/#learn`);await quota.getByRole('button',{name:'棋形教室',exact:true}).click();await quota.getByRole('button',{name:'開始練習',exact:true}).click();await quota.locator('#shapeOptions').getByRole('button',{name:q.options[q.correct],exact:true}).click();assert.match(await quota.locator('#shapeStorage').innerText(),/無法儲存/);assert.match(await quota.locator('#shapeSummary').innerText(),/1／36/);
  console.log('PASS 18 topics, 36 quizzes, all demo steps, keyboard, hint persistence, review, old progress, storage failures, 4 widths');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
