import { SHAPE_TOPICS, SHAPE_QUESTIONS } from './go-shape-lessons.js';
export const SHAPE_PROGRESS_KEY='gogame_shape_progress_v1';
const ids=new Set(SHAPE_QUESTIONS.map(q=>q.id));
const topics=new Set(SHAPE_TOPICS.map(t=>t.id));
export const newShapeProgress=()=>({version:1,topic:SHAPE_TOPICS[0].id,question:null,records:{},attempts:{}});
export function readShapeProgress(storage) {
  try {
    const raw=storage.getItem(SHAPE_PROGRESS_KEY);
    if(raw===null) return {progress:newShapeProgress(),writable:true,error:''};
    const data=JSON.parse(raw), progress=newShapeProgress();
    if(data?.version!==1||!data.records||typeof data.records!=='object'||Array.isArray(data.records)||!data.attempts||typeof data.attempts!=='object'||Array.isArray(data.attempts)) throw new Error('schema');
    if(topics.has(data.topic)) progress.topic=data.topic;
    if(SHAPE_TOPICS.find(t=>t.id===progress.topic).questions.some(q=>q.id===data.question)) progress.question=data.question;
    for(const id of ids) {
      const r=data.records[id],a=data.attempts[id];
      if(r) {
        if(typeof r.solved!=='boolean'||typeof r.review!=='boolean') throw new Error('record');
        progress.records[id]={solved:r.solved,review:r.review};
      }
      if(a) {
        if(typeof a.assisted!=='boolean'||typeof a.mistaken!=='boolean'||typeof a.finished!=='boolean') throw new Error('attempt');
        progress.attempts[id]={assisted:a.assisted,mistaken:a.mistaken,finished:a.finished};
      }
    }
    return {progress,writable:true,error:''};
  } catch {
    console.warn('[go-shape] 無法讀取棋形教室進度，原資料未覆寫。');
    return {progress:newShapeProgress(),writable:false,error:'無法讀取原有教室進度，這次只暫存在本頁，原資料未覆寫。'};
  }
}
export function saveShapeProgress(storage,progress) {
  try {storage.setItem(SHAPE_PROGRESS_KEY,JSON.stringify(progress));return '';}
  catch {console.warn('[go-shape] 無法儲存棋形教室進度。');return '無法儲存教室進度，這次變更只暫存在本頁。';}
}
export function beginShapeAttempt(progress,id) {
  if(!ids.has(id)) throw new Error('未知棋形題目');
  // 未完成的嘗試跨切換與重整保留；完成後明確開始下一輪才重設。
  if(progress.attempts[id]&&!progress.attempts[id].finished) return progress;
  return {...progress,attempts:{...progress.attempts,[id]:{assisted:false,mistaken:false,finished:false}}};
}
export function answerShape(progress,id,outcome) {
  if(!ids.has(id)||!['correct','wrong','reveal','study'].includes(outcome)) throw new Error('未知作答結果');
  const a={...(progress.attempts[id]||{assisted:false,mistaken:false,finished:false})};
  if(a.finished) return progress;
  const old=progress.records[id]||{solved:false,review:false};
  if(outcome==='wrong') a.mistaken=true;
  if(outcome==='reveal'||outcome==='study') a.assisted=true;
  if(outcome==='correct'||outcome==='reveal') a.finished=true;
  const clean=outcome==='correct'&&!a.assisted&&!a.mistaken;
  return {...progress,attempts:{...progress.attempts,[id]:a},records:{...progress.records,[id]:{
    solved:old.solved||(outcome==='correct'&&!a.assisted),
    review:clean?false:old.review||outcome!=='correct',
  }}};
}
export const shapeReviewIds=p=>SHAPE_QUESTIONS.filter(q=>p.records[q.id]?.review).map(q=>q.id);
