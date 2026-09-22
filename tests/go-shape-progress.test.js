const {sandboxWithRules}=require('./helpers');const r=sandboxWithRules();
const {SHAPE_PROGRESS_KEY,newShapeProgress,beginShapeAttempt,answerShape,readShapeProgress,saveShapeProgress,shapeReviewIds}=r.localRequire('./go-shape-progress.js');
const id='hoshi-location';
const storage=()=>{const data={};return {getItem:k=>data[k]??null,setItem:(k,v)=>{data[k]=v;},data};};
test('乾淨答對計入完成，錯答後答對仍需複習，下一輪正確才清除',()=>{
 let p=beginShapeAttempt(newShapeProgress(),id);p=answerShape(p,id,'wrong');p=answerShape(p,id,'correct');
 expect(p.records[id]).toEqual({solved:true,review:true});p=beginShapeAttempt(p,id);p=answerShape(p,id,'correct');expect(p.records[id]).toEqual({solved:true,review:false});
});
test('看答案與作答後返回示範不計自行解出，未完成嘗試不被切換洗掉',()=>{
 let p=beginShapeAttempt(newShapeProgress(),id);p=answerShape(p,id,'study');p=beginShapeAttempt(p,id);p=answerShape(p,id,'correct');expect(p.records[id]).toEqual({solved:false,review:true});
 p=beginShapeAttempt(p,id);p=answerShape(p,id,'reveal');p=answerShape(p,id,'correct');expect(p.records[id].solved).toBe(false);expect(shapeReviewIds(p)).toContain(id);
});
test('重新整理還原目前題目與提示狀態，保留舊課程鍵',()=>{
 const s=storage();s.setItem('gogame_learn_progress_v1','original');let p=beginShapeAttempt(newShapeProgress(),id);p={...answerShape(p,id,'study'),question:id};expect(saveShapeProgress(s,p)).toBe('');const loaded=readShapeProgress(s);expect(loaded.progress.question).toBe(id);expect(loaded.progress.attempts[id].assisted).toBe(true);expect(s.getItem('gogame_learn_progress_v1')).toBe('original');
});
test.each(['invalid','{"version":9}',JSON.stringify({version:1,records:{[id]:{solved:'yes'}},attempts:{}})])('損壞或未知版本不允許覆寫：%s',raw=>{
 const s=storage();s.setItem(SHAPE_PROGRESS_KEY,raw);const result=readShapeProgress(s);expect(result.writable).toBe(false);expect(result.error).not.toBe('');expect(s.getItem(SHAPE_PROGRESS_KEY)).toBe(raw);
});
test('封鎖儲存可見錯誤，未知題目與結果拒絕',()=>{
 expect(readShapeProgress(null).error).not.toBe('');expect(saveShapeProgress(null,newShapeProgress())).not.toBe('');expect(()=>beginShapeAttempt(newShapeProgress(),'bad')).toThrow();expect(()=>answerShape(newShapeProgress(),id,'bad')).toThrow();
});
test('保存實際落點，重整保留非示範答案，重做清除落點',()=>{
 const s=storage(),qid='knight-name';let p=beginShapeAttempt(newShapeProgress(),qid);
 p=answerShape(p,qid,'correct',[2,0]);saveShapeProgress(s,p);const loaded=readShapeProgress(s).progress;
 expect(loaded.attempts[qid].point).toEqual([2,0]);expect(beginShapeAttempt(loaded,qid).attempts[qid].point).toBeUndefined();
});
test('舊版無落點的完成紀錄可讀，損壞的落點不覆寫原資料',()=>{
 const s=storage();let p=beginShapeAttempt(newShapeProgress(),id);p=answerShape(p,id,'correct');saveShapeProgress(s,p);expect(readShapeProgress(s).writable).toBe(true);
 p.attempts[id].point=[-1,0];saveShapeProgress(s,p);expect(readShapeProgress(s).writable).toBe(false);
});
