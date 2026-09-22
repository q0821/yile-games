const {sandboxWithRules}=require('./helpers');
const r=sandboxWithRules();
const {SHAPE_TOPICS,SHAPE_QUESTIONS,topicFrames,shapeCoordinate,frameBoard}=r.localRequire('./go-shape-lessons.js');
const topic=id=>SHAPE_TOPICS.find(t=>t.id===id);
for(const t of SHAPE_TOPICS) test(`${t.title}：圖解合法，題目與示範可讀`,()=>{
  const frames=topicFrames(t);
  expect(t.questions).toHaveLength(2);
  for(const f of frames) {
    for(let x=0;x<f.size;x++)for(let y=0;y<f.size;y++)if(f.board[x][y])expect(r.getGroup(f.board,f.size,x,y).liberties.size).toBeGreaterThan(0);
    for(const [x,y] of f.marks)expect(x>=0&&y>=0&&x<f.size&&y<f.size).toBe(true);
    expect(f.text.length).toBeGreaterThan(0);
  }
  for(const q of t.questions){expect(frames[q.frame]).toBeDefined();expect(q.correct).toBeGreaterThanOrEqual(0);expect(q.correct).toBeLessThan(q.options.length);expect(new Set(q.options).size).toBe(q.options.length);}
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
test('落子題接受完整棋形方向，並拒絕不符棋形的合法手',()=>{
 for(const [id,count]of[['extend',4],['stand',1],['jump',4],['diagonal',4],['knight',8],['tiger',4]]){
  const t=topic(id),q=t.questions[0],answers=[];
  for(let x=0;x<7;x++)for(let y=0;y<7;y++)if(judgeShapePoint(t,q,[x,y]).correct)answers.push([x,y]);
  expect(answers).toHaveLength(count);expect(judgeShapePoint(t,q,[0,6]).correct).toBe(false);
 }
 const t=topic('knight'),q=t.questions[0];for(const point of [[1,1],[1,3],[2,0],[2,4],[4,0],[4,4],[5,1],[5,3]]){
  const result=judgeShapePoint(t,q,point);expect(result.correct).toBe(true);expect(result.board[point[0]][point[1]]).toBe(1);
 }
 expect(judgeShapePoint(t,q,[2,2]).correct).toBe(false);
 expect(judgeShapePoint(t,q,[3,2]).reason).toMatch(/已經有棋子/);
 expect(judgeShapePoint(t,q,[-1,0]).correct).toBe(false);
});
test('每個直接作答題的示範合法，錯誤落子不改原盤面，眼位只標記',()=>{
 for(const t of SHAPE_TOPICS){const q=t.questions[0];if(!q.input)continue;
  const frame=topicFrames(t)[q.frame],point=examplePoint(q,frame.size),before=JSON.stringify(frame.board);
  const result=judgeShapePoint(t,q,point);expect(result.correct).toBe(true);
  expect(result.board[point[0]][point[1]]).toBe(q.input==='identify'?0:1);
  expect(JSON.stringify(topicFrames(t)[q.frame].board)).toBe(before);
 }
});
