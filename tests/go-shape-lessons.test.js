const {sandboxWithRules}=require('./helpers');
const r=sandboxWithRules();
const {SHAPE_TOPICS,SHAPE_QUESTIONS,topicFrames,questionFrame,shapeCoordinate,frameBoard}=r.localRequire('./go-shape-lessons.js');
const topic=id=>SHAPE_TOPICS.find(t=>t.id===id);
for(const t of SHAPE_TOPICS) test(`${t.title}：圖解合法，題目與示範可讀`,()=>{
  const frames=topicFrames(t);
  expect(t.questions).toHaveLength(2);
  for(const f of frames) {
    for(let x=0;x<f.size;x++)for(let y=0;y<f.size;y++)if(f.board[x][y])expect(r.getGroup(f.board,f.size,x,y).liberties.size).toBeGreaterThan(0);
    for(const [x,y] of f.marks)expect(x>=0&&y>=0&&x<f.size&&y<f.size).toBe(true);
    expect(f.text.length).toBeGreaterThan(0);
  }
  for(const q of t.questions){expect(q.frame).toBeUndefined();expect(questionFrame(t,q).board).toBeDefined();if(!q.input){expect(q.correct).toBeGreaterThanOrEqual(0);expect(q.correct).toBeLessThan(q.options.length);expect(new Set(q.options).size).toBe(q.options.length);}}
});
test('主題與題目識別字穩定且不重複，座標略過 I',()=>{
  expect(SHAPE_TOPICS).toHaveLength(18);expect(SHAPE_QUESTIONS).toHaveLength(36);
  expect(new Set(SHAPE_QUESTIONS.map(q=>q.id)).size).toBe(36);
  expect(shapeCoordinate([9,9],19)).toBe('K10');expect(shapeCoordinate([15,3],19)).toBe('D4');expect(shapeCoordinate([16,2],19)).toBe('C3');
});
test('征子每次叫吃都只剩一口氣，末手實際提十子',()=>{
  const frames=topicFrames(topic('ladder'));
  for(let i=1;i<frames.length-1;i+=2)expect(r.getGroup(frames[i].board,7,1,1).liberties.size).toBe(1);
  expect(frames.at(-1).captured).toBe(10);expect(frames.at(-1).board[1][1]).toBe(0);
});
test('抱吃、門吃與枷吃依示範達成提子，枷吃第一手不是叫吃',()=>{
  for(const [id,count]of[['embrace',2],['gate',3],['net',3]])expect(topicFrames(topic(id)).at(-1).captured).toBe(count);
  expect(r.getGroup(topicFrames(topic('net'))[1].board,7,2,2).liberties.size).toBe(2);
});
test('雙叫吃同時威脅兩串，對方逃一串後另一串被提',()=>{
  const f=topicFrames(topic('double-atari'));
  expect(r.getGroup(f[1].board,5,2,1).liberties.size).toBe(1);expect(r.getGroup(f[1].board,5,2,3).liberties.size).toBe(1);
  expect(f.at(-1).board[2][1]).toBe(2);expect(f.at(-1).board[2][3]).toBe(0);
});
test('倒撲先犧牲一子，再提三子，並非打劫',()=>{
  const f=topicFrames(topic('snapback'));
  expect(f[1].captured).toBe(0);expect(f[2].captured).toBe(1);expect(f[2].ko).toBeNull();expect(f[3].captured).toBe(3);
});
test('兩眼同屬一串且白棋不能入眼，假眼則有提子反例',()=>{
  const f=topicFrames(topic('two-eyes'))[1],group=r.getGroup(f.board,7,1,1);
  expect(group.liberties.size).toBe(2);expect(group.stones).toHaveLength(13);
  for(const p of [[2,2],[2,4]])expect(r.tryPlaceStone(f.board,7,...p,2,null).valid).toBe(false);
  const falseEye=topicFrames(topic('false-eye'))[1];const capture=r.tryPlaceStone(falseEye.board,7,2,2,2,null);
  expect(capture.valid).toBe(true);expect(capture.newBoard[1][2]).toBe(0);
  const realEye=topicFrames(topic('false-eye'))[0];expect(r.tryPlaceStone(realEye.board,7,2,2,2,null).valid).toBe(false);
});
test('已相連與僅互相照應不混淆',()=>{
  for(const id of ['extend','stand']){const f=topicFrames(topic(id))[1];expect(r.getGroup(f.board,7,...topic(id).frames[1].black[0]).stones).toHaveLength(2);}
  for(const id of ['jump','diagonal','knight']){const f=topicFrames(topic(id))[1];expect(r.getGroup(f.board,7,...topic(id).frames[1].black[0]).stones).toHaveLength(1);}
});
test('非法圖解及非法手順不能默默顯示假盤面',()=>{
  expect(()=>frameBoard({size:5,black:[[0,0]],white:[[0,0]]})).toThrow();
  expect(()=>topicFrames({...topic('snapback'),moves:[{color:1,point:[0,2]}]})).toThrow();
});

const {judgeShapePoint,examplePoint}=r.localRequire('./go-shape-answer.js');
test('新局面依題目基準、盤邊與佔用點判斷，接受多方向',()=>{
 const expected={extend:[2,1],stand:[1,1],jump:[1,2],diagonal:[1,2],knight:[3,1],tiger:[2,1]};
 for(const[id,counts]of Object.entries(expected))topic(id).questions.forEach((q,i)=>{
  const answers=[];for(let x=0;x<q.scene.size;x++)for(let y=0;y<q.scene.size;y++)if(judgeShapePoint(topic(id),q,[x,y]).correct)answers.push([x,y]);
  expect(answers).toHaveLength(counts[i]);
 });
 const t=topic('knight'),q=t.questions[0];for(const point of [[5,3],[6,0],[6,2]])expect(judgeShapePoint(t,q,point).correct).toBe(true);
 expect(judgeShapePoint(t,q,[2,4]).correct).toBe(false); // 舊示範 E5 不能套到新題。
 expect(judgeShapePoint(t,q,[4,1]).reason).toMatch(/已經有棋子/);
 expect(judgeShapePoint(t,q,[-1,0]).correct).toBe(false);
});
test('每個直接作答題示範合法，判定不改原盤面，眼位只標記',()=>{
 for(const t of SHAPE_TOPICS)for(const q of t.questions){if(!q.input)continue;
  const frame=questionFrame(t,q),point=examplePoint(q),before=JSON.stringify(frame.board);
  const result=judgeShapePoint(t,q,point);expect(result.correct).toBe(true);
  expect(result.board[point[0]][point[1]]).toBe(q.input==='identify'?0:1);
  expect(JSON.stringify(questionFrame(t,q).board)).toBe(before);
 }
});
// 去掉平移量並列舉旋轉、鏡射，防止只換方向便冒充全新局面。
function signatures(board){
 const stones=[];board.forEach((row,r)=>row.forEach((color,c)=>{if(color)stones.push([r,c,color]);}));
 const result=[];
 for(const swap of [false,true])for(const sx of [-1,1])for(const sy of [-1,1]){
  const mapped=stones.map(([r,c,color])=>[sx*(swap?c:r),sy*(swap?r:c),color]);
  const minR=Math.min(...mapped.map(p=>p[0])),minC=Math.min(...mapped.map(p=>p[1]));
  result.push(mapped.map(([r,c,color])=>`${r-minR},${c-minC},${color}`).sort().join(';'));
 }return result;
}
for(const t of SHAPE_TOPICS)for(const q of t.questions)test(`${q.id} 初始棋形合法，且不是介紹的旋轉或鏡射`,()=>{
 const f=questionFrame(t,q);for(let x=0;x<f.size;x++)for(let y=0;y<f.size;y++)if(f.board[x][y])expect(r.getGroup(f.board,f.size,x,y).liberties.size).toBeGreaterThan(0);
 const pattern=signatures(f.board)[0];for(const demo of topicFrames(t))expect(signatures(demo.board)).not.toContain(pattern);
 const other=t.questions.find(item=>item.id!==q.id);expect(signatures(questionFrame(t,other).board)).not.toContain(pattern);
});
for(const t of SHAPE_TOPICS)for(const q of t.questions.filter(q=>q.proof))test(`${q.id} 後續符合規則、氣數與提子解說`,()=>{
 let{board,size}=questionFrame(t,q),ko=null,last;
 for(const[i,point]of q.proof.entries()){
  const color=i%2?2:1;last=r.tryPlaceStone(board,size,...point,color,ko);expect(last.valid).toBe(true);board=last.newBoard;ko=last.newKo;
  if(t.id==='ladder'&&color===1&&i<q.proof.length-1)expect(r.getGroup(board,size,...q.targets[0]).liberties.size).toBe(1);
  if(t.id==='net'&&i===0)expect(r.getGroup(board,size,...q.targets[0]).liberties.size).toBe(2);
  if(t.id==='snapback'&&i===1){expect(last.captured).toBe(1);expect(last.newKo).toBeNull();}
 }
 expect(last.captured).toBe(q.captured);
});
test('新死活局面有規則反例，辨認眼位不能誤當填眼',()=>{
 const q=topic('eye').questions[0],f=questionFrame(topic('eye'),q);
 expect(r.tryPlaceStone(f.board,f.size,0,0,1,null).valid).toBe(false);
 expect(judgeShapePoint(topic('eye'),q,[0,0]).correct).toBe(true);
 const a=questionFrame(topic('false-eye'),topic('false-eye').questions[0]);expect(r.tryPlaceStone(a.board,5,0,0,2,null).captured).toBe(2);
 const b=questionFrame(topic('false-eye'),topic('false-eye').questions[1]);expect(r.tryPlaceStone(b.board,5,0,0,2,null).valid).toBe(false);
 const live=questionFrame(topic('two-eyes'),topic('two-eyes').questions[0]);for(const p of [[0,1],[0,3]])expect(r.tryPlaceStone(live.board,7,...p,2,null).valid).toBe(false);
 let dead=questionFrame(topic('two-eyes'),topic('two-eyes').questions[1]).board;
 for(const [point,color]of [[[1,1],2],[[1,2],1],[[1,1],2]]){const next=r.tryPlaceStone(dead,5,...point,color,null);expect(next.valid).toBe(true);dead=next.newBoard;}
 expect(dead.flat().filter(c=>c===1)).toHaveLength(0);
});
