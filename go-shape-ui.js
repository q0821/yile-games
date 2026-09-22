import { SHAPE_UNITS, SHAPE_TOPICS, SHAPE_QUESTIONS, topicFrames } from './go-shape-lessons.js';
import { readShapeProgress, saveShapeProgress, beginShapeAttempt, answerShape, shapeReviewIds } from './go-shape-progress.js';
import { mountLearnBoard } from './go-learn-board.js';

export function mountShapeClassroom(root,back) {
  let storage;try{storage=window.localStorage;}catch{storage=null;}
  const loaded=readShapeProgress(storage);
  let progress=loaded.progress,error=loaded.error,step=0,disposeBoard,feedback='',reviewQueue=null,reviewIndex=0;
  const $=id=>root.querySelector(`#${id}`);
  const topic=()=>SHAPE_TOPICS.find(t=>t.id===progress.topic);
  const currentQuestion=()=>topic().questions.find(q=>q.id===progress.question);
  const save=()=>{if(loaded.writable) error=saveShapeProgress(storage,progress);};
  const button=(text,action,disabled=false,primary=false)=>{
    const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=disabled;
    if(primary)b.className='primary';b.addEventListener('click',action);return b;
  };
  const redraw=(focus='shapeTitle')=>{render();$(focus)?.focus();};
  function study() {
    // 已開始作答後返回介紹，視為參考解說，跨換頁仍保留此狀態。
    for(const q of topic().questions) if(progress.attempts[q.id]&&!progress.attempts[q.id].finished) progress=answerShape(progress,q.id,'study');
  }
  function openTopic(id) {study();progress={...progress,topic:id,question:null};study();step=0;feedback='';reviewQueue=null;save();redraw();}
  function openQuestion(id,fresh=false) {
    const t=SHAPE_TOPICS.find(t=>t.questions.some(q=>q.id===id));
    progress={...progress,topic:t.id,question:id};
    if(!progress.attempts[id]||fresh)progress=beginShapeAttempt(progress,id);
    feedback='';save();redraw();
  }
  function answer(choice) {
    const q=currentQuestion();if(!q||progress.attempts[q.id]?.finished)return;
    const correct=choice===q.correct;
    progress=answerShape(progress,q.id,correct?'correct':'wrong');
    feedback=correct?`${progress.attempts[q.id].assisted?'已跟著解說完成。':'答對了！'}${q.explanation}`:'還不對，請再觀察棋盤與題目。也可以按「看解答」了解原因。';
    if(correct&&progress.records[q.id].review)feedback+=' 本題保留在待複習，下次不看解答、第一次答對才會移除。';
    save();redraw('shapeFeedback');
  }
  function startReview() {
    reviewQueue=shapeReviewIds(progress);reviewIndex=0;
    if(reviewQueue.length)openQuestion(reviewQueue[0],true);
    else {feedback='目前沒有待複習的題目。';redraw('shapeFeedback');}
  }
  function render() {
    disposeBoard?.();disposeBoard=null;
    const t=topic(),q=currentQuestion();
    root.innerHTML=`<header class="mode-header"><a class="mode-back" href="#home">回首頁</a><h2 class="mode-title">圍棋入門</h2></header>
      <div id="shapeSections" class="learn-actions" aria-label="入門內容"></div>
      <p class="learn-lead">認識一種棋形，看懂它，再自己試試。</p>
      <nav id="shapeUnits" class="learn-tabs" aria-label="教室單元"></nav>
      <label class="shape-topic-label" for="shapeTopic">選擇主題<select id="shapeTopic"></select></label>
      <p id="shapeStorage" role="status"></p>
      <article class="learn-card"><p id="shapePosition" class="learn-progress"></p><h3 id="shapeTitle" tabindex="-1"></h3>
      <p id="shapeIntro"></p><div id="shapeBoard" class="learn-board shape-board" role="group"></div>
      <p id="shapeCaption" class="learn-caption"></p><div id="shapeSteps" class="learn-actions"></div>
      <div id="shapeOptions" class="shape-options" role="group" aria-label="選擇答案"></div>
      <p id="shapeFeedback" class="learn-feedback" tabindex="-1" role="status" aria-live="polite"></p>
      <div id="shapeActions" class="learn-actions"></div></article>
      <footer class="learn-footer"><p id="shapeSummary"></p><div id="shapeReview" class="learn-actions"></div>
      <p class="learn-caption">教室進度獨立保存在這個瀏覽器。看解答不計入自行完成。</p>
      <details><summary>教材與參考資料</summary><p>圖解、練習與解說由本專案自行編寫。吃子示範呈現指定變化，練習檢查題目所問的概念，不代表已掌握所有實戰變化。</p>
      <p><a href="https://www.nihonkiin.or.jp/teach/lesson/school/yogo.html" target="_blank" rel="noopener noreferrer">日本棋院基本用語</a></p>
      <p><a href="https://www.nihonkiin.or.jp/teach/lesson/school/tyuban02.html" target="_blank" rel="noopener noreferrer">日本棋院吃子技巧</a></p>
      <p><a href="https://www.nihonkiin.or.jp/teach/lesson/school/life-death01.html" target="_blank" rel="noopener noreferrer">日本棋院兩眼與死活</a></p>
      <p><a href="https://goldenkeygoschool.weebly.com/beginner-65288200132599165289/lesson-2-capture-stones" target="_blank" rel="noopener noreferrer">Golden Key Go School 吃子教學</a></p></details></footer>`;
    const basic=button('基礎練習',back),classroom=button('棋形教室',()=>{});
    basic.setAttribute('aria-pressed','false');classroom.setAttribute('aria-pressed','true');$('shapeSections').append(basic,classroom);
    for(const unit of SHAPE_UNITS){const b=button(unit.title,()=>openTopic(SHAPE_TOPICS.find(t=>t.unit===unit.id).id));b.setAttribute('aria-pressed',String(t.unit===unit.id));$('shapeUnits').append(b);}
    for(const item of SHAPE_TOPICS.filter(x=>x.unit===t.unit)) {const o=document.createElement('option');o.value=item.id;o.textContent=item.title;o.selected=item.id===t.id;$('shapeTopic').append(o);}
    $('shapeTopic').addEventListener('change',e=>openTopic(e.target.value));
    $('shapeStorage').textContent=error;$('shapeStorage').hidden=!error;
    $('shapeTitle').textContent=q?q.prompt:t.title;
    $('shapeIntro').textContent=q?'觀察下圖，從選項作答。座標可對照棋盤四邊。':t.intro;
    $('shapePosition').textContent=q?`${t.title}：練習 ${t.questions.indexOf(q)+1}／2${reviewQueue?`，複習 ${reviewIndex+1}／${reviewQueue.length}`:''}`:`${SHAPE_UNITS.find(u=>u.id===t.unit).title}：${t.title}`;
    let frames;
    try{frames=topicFrames(t);}catch(e){console.error('[go-shape] 教學圖解載入失敗。',e.message);$('shapeFeedback').textContent='這個主題暫時無法顯示，請選其他主題或重新整理。';return;}
    const frame=frames[q?q.frame:step];
    $('shapeBoard').setAttribute('aria-label',`${frame.size} 路教學棋盤，金色圓點標示觀察位置`);
    disposeBoard=mountLearnBoard($('shapeBoard'),frame.board,new Set(),new Set(frame.marks.map(p=>p.join(','))),true,()=>{});
    $('shapeCaption').textContent=`${frame.size} 路示意棋盤。金色圓點標示觀察位置，請搭配文字與座標閱讀。`;
    const actions=$('shapeActions');
    if(!q) {
      $('shapeSteps').append(button('上一步',()=>{step--;redraw('shapeFeedback');},step===0),button('下一步',()=>{step++;redraw('shapeFeedback');},step===frames.length-1));
      $('shapeFeedback').textContent=feedback||`${t.moves?'步驟':'圖解'} ${step+1}／${frames.length}：${frame.text}`;
      actions.append(button('開始練習',()=>openQuestion(t.questions[0].id),false,true));
    }else {
      const attempt=progress.attempts[q.id];const done=attempt?.finished;
      q.options.forEach((option,index)=>$('shapeOptions').append(button(option,()=>answer(index),done)));
      $('shapeFeedback').textContent=feedback||(done?`${attempt.assisted?'已看過解答。':'已完成本輪。'}${q.explanation}`:'先想一想，再選答案。');
      actions.append(button('返回介紹',()=>{study();progress={...progress,question:null};step=0;feedback='';save();redraw();}));
      actions.append(button(done?'再練一次':'看解答',()=>{
        if(done){openQuestion(q.id,true);return;}
        progress=answerShape(progress,q.id,'reveal');feedback=`解答：${q.options[q.correct]}。${q.explanation}`;save();redraw('shapeFeedback');
      }));
      const next=()=>{
        if(reviewQueue){reviewIndex++;if(reviewIndex<reviewQueue.length){openQuestion(reviewQueue[reviewIndex],true);return;}reviewQueue=null;feedback='本輪複習完成。仍待複習的題目可稍後再練。';redraw('shapeFeedback');return;}
        const i=t.questions.indexOf(q);if(i===0)openQuestion(t.questions[1].id);else openTopic(SHAPE_TOPICS[(SHAPE_TOPICS.indexOf(t)+1)%SHAPE_TOPICS.length].id);
      };
      actions.append(button(reviewQueue?(reviewIndex===reviewQueue.length-1?'完成本輪複習':'下一題'):(t.questions.indexOf(q)===0?'下一題':'下一個主題'),next,!done,true));
    }
    $('shapeSummary').textContent=`教室已自行解出 ${Object.values(progress.records).filter(r=>r.solved).length}／${SHAPE_QUESTIONS.length} 題，待複習 ${shapeReviewIds(progress).length} 題。`;
    $('shapeReview').append(button(`複習教室錯題（${shapeReviewIds(progress).length}）`,startReview));
  }
  if(!progress.question){study();save();}
  render();
  return ()=>{disposeBoard?.();};
}
