import { createBoard, tryPlaceStone } from './rules.js';

export const SHAPE_UNITS = [
  { id: 'board', title: '認識棋盤' }, { id: 'shape', title: '基本棋形' },
  { id: 'capture', title: '吃子技巧' }, { id: 'life', title: '基本死活' },
];
export const shapeCoordinate = ([r,c], size) => `${'ABCDEFGHJKLMNOPQRST'[c]}${size-r}`;
const diagram = (size, black = [], white = [], marks = [], text = '') => ({size,black,white,marks,text});
const question = (id, frame, prompt, options, correct, explanation) => ({id,frame,prompt,options,correct,explanation});
// 原創示意局面，不轉錄外部棋譜。圖解的擺子與實戰交替落子分開處理。
function location(id,title,intro,points,firstPrompt,choices,correct,explanation,concept,conceptOptions,conceptCorrect) {
  const frames = [diagram(19,[],[],[],intro), diagram(19,[],[],points,explanation)];
  return {id,unit:'board',title,intro,frames,questions:[
    question(`${id}-location`,1,firstPrompt,choices,correct,explanation),
    question(`${id}-concept`,1,concept,conceptOptions,conceptCorrect,explanation),
  ]};
}
function shape(id,title,intro,black,added,detail,concept,options,correct) {
  const frames=[diagram(7,black,[],[],intro),diagram(7,[...black,added],[],[added],detail)];
  return {id,unit:'shape',title,intro,frames,questions:[
    question(`${id}-name`,0,`要從原有黑棋下出「${title}」，這三個落點應選哪個？`,[shapeCoordinate(added,7),'G7','A1'],0,detail),
    question(`${id}-concept`,1,concept,options,correct,detail),
  ]};
}
function tactic(id,title,intro,size,black,white,moves,notes,prompt,choices,correct,concept,options,conceptCorrect) {
  const frames=[diagram(size,black,white,[], '黑先。先找白棋的氣，再按「下一步」觀察本例變化。')];
  return {id,unit:'capture',title,intro,frames,moves:moves.map((point,i)=>({point,color:i%2===0?1:2,text:notes[i]})),questions:[
    question(`${id}-move`,0,prompt,choices,correct,`${notes[0]} 本題只辨認指定方向；完整過程請看示範。`),
    question(`${id}-concept`,moves.length,concept,options,conceptCorrect,notes.at(-1)),
  ]};
}
const ring=[[1,1],[1,2],[1,3],[2,1],[2,3],[3,1],[3,2],[3,3]];
const twoEyes=[...[1,3].flatMap(r=>[1,2,3,4,5].map(c=>[r,c])),[2,1],[2,3],[2,5]];
const surround=[...[0,4].flatMap(r=>[1,2,3,4,5].map(c=>[r,c])),...[1,2,3].flatMap(r=>[[r,0],[r,6]])];

export const SHAPE_TOPICS = [
  location('hoshi','星位','19 路棋盤上的九個小黑點是星位，方便辨認位置；小黑點不是棋子。',
    [3,9,15].flatMap(r=>[3,9,15].map(c=>[r,c])),
    '以下哪個座標是左下角的星位？',['C3','D4','E5'],1,'角上的星位位於第四線與第四線交叉處；左下角是 D4。',
    '棋盤上印好的小黑點，會佔掉棋子的氣嗎？',['會，等同一顆黑棋','不會，只是位置標記','只有天元會'],1),
  location('tengen','天元','天元就是棋盤正中央的交叉點，也是中央星位。',[[9,9]],
    '19 路盤正中央的天元是哪一點？',['K10','J10','K9'],0,'橫向座標略過 I，所以第十欄是 K；天元是 K10。',
    '天元和星位的關係是什麼？',['天元不是星位','天元是中央的星位','九個星位都叫天元'],1),
  location('san-san','三三','從同一個角的兩條邊各數到第三線，交叉點就叫三三。',[[2,2],[2,16],[16,2],[16,16]],
    '左下角的三三是哪個座標？',['D4','C4','C3'],2,'左下角的三三是 C3；與 D4 星位的位置不同。',
    '三三的兩個「三」指什麼？',['第三手下第三顆棋','兩條邊各數到第三線','棋盤中央三個點'],1),
  shape('extend','長','沿著自己的棋向外緊接一子，叫作長。',[[3,2]],[3,3],
    '新子與原有黑棋左右相鄰，已經連成同一串，共用氣。',
    '這兩顆黑棋目前是否已直接相連？',['沒有，中間還隔一格','只有斜角相連','有，左右相鄰'],2),
  shape('stand','立','沿著自己的棋，向棋盤邊緣緊接一子，常稱為立。',[[4,3]],[5,3],
    '圖中黑棋向下方盤邊延伸；立仍是相鄰的一手，並不是另下一顆孤立的棋。',
    '本圖的「立」往哪個方向？',['向下方盤邊','跨過一個空點','離開棋盤'],0),
  shape('jump','跳','沿同一直線，隔一個空交叉點下子，叫作一間跳。',[[3,2]],[3,4],
    '兩子中間空一點。看起來互相照應，但規則上仍是兩串棋，可能被切斷。',
    '一間跳的兩顆棋，是否已共用氣？',['有，距離近就算相連','沒有，中間尚有空點','只有輪到黑棋才共用'],1),
  shape('diagonal','尖','在自己棋子的斜角緊鄰處落子，叫作尖。',[[3,2]],[2,3],
    '橫向與直向各差一格，形成斜角。斜角相鄰不等於已直接連接。',
    '尖和長的主要差別是什麼？',['尖下在斜角，長下在相鄰直線','尖一次下兩顆','尖一定能吃棋'],0),
  shape('knight','飛','小飛與原有棋子在一個方向差兩格，另一個方向差一格。',[[3,2]],[2,4],
    '這是小飛，像「日」字的兩個對角；距離較遠，不能當成已連接。',
    '本圖的小飛，橫向與直向各差幾格？',['一格與一格','兩格與兩格','兩格與一格'],2),
  shape('tiger','虎口','三顆棋圍住一個空點的三個方向，像張開的虎口。',[[2,3],[3,2]],[4,3],
    'C4、D5、D3 圍住 D4 的三個方向。虎口可幫助連絡，但仍要看外面的氣與斷點。',
    '虎口中央的空點，一定是真眼嗎？',['一定，三邊圍住就算','不一定，還有一個方向開著','虎口沒有中央空點'],1),
  tactic('embrace','抱吃','選對叫吃方向，把對手趕向自己已有棋子的包圍中。',5,
    [[1,2],[2,1],[1,3],[2,4]],[[2,2]],[[3,2],[2,3],[3,3]],
    ['黑 C2 叫吃，把白棋趕向右方黑棋。','白 D3 延伸，兩顆白棋只剩 D2 一口氣。','黑 D2 提掉兩顆白棋。選擇叫吃方向時，要利用已有的包圍。'],
    '要把白棋趕向右方黑棋，應先在哪裡叫吃？',['D3','C2','A1'],1,
    '抱吃最重要的是哪件事？',['每次都往中央叫吃','只看棋子數量','利用己方棋子選對叫吃方向'],2),
  tactic('gate','門吃','把對方棋形的缺口封住，像關門一樣限制逃路。門吃與枷吃的叫法有時重疊。',5,
    [[0,1],[0,2],[1,3],[2,0],[3,1]],[[1,2],[2,1]],[[2,2],[1,1],[1,0]],
    ['黑 C3 封住靠中央的共同缺口，兩顆白棋都只剩 B4。','白 B4 雖連起來，仍只剩 A4 一口氣。','黑 A4 提掉三顆白棋。本例關門後，連接也無法增加到兩口氣。'],
    '要封住兩顆白棋靠中央的共同缺口，選哪一點？',['E1','C3','D1'],1,
    '本例白棋連接後為什麼仍被吃掉？',['連接一定會少一口氣','黑棋可以連下兩手','連起來仍只有一口氣'],2),
  tactic('double-atari','雙叫吃','一手同時叫吃兩串分開的棋，對手往往無法兩邊都救。',5,
    [[1,1],[2,0],[1,3],[2,4]],[[2,1],[2,3]],[[2,2],[3,1],[3,3]],
    ['黑 C3 同時叫吃左右兩顆白棋。','白 B2 救出左邊；右邊白棋仍只剩 D2。','黑 D2 吃掉右邊白棋。實戰還要檢查對方是否能用連接或反叫吃同時解圍。'],
    '哪一點能同時叫吃 B3 與 D3 的白棋？',['C3','A1','E1'],0,
    '雙叫吃是否代表任何局面都保證吃到棋？',['是，完全不用計算','否，還要檢查對方的解圍手段','只有白棋能雙叫吃'],1),
  tactic('ladder','征子','持續叫吃，讓對手沿階梯狀路線逃跑，最後逼到盤邊。先確認路上沒有對方援兵。',7,
    [[0,1],[1,0],[0,2]],[[1,1]],
    [[2,1],[1,2],[1,3],[2,2],[3,2],[2,3],[2,4],[3,3],[4,3],[3,4],[3,5],[4,4],[5,4],[4,5],[4,6],[5,5],[6,5],[5,6],[6,6]],
    ['黑 B5 先叫吃，開始階梯狀追擊。','白 C6 延伸。','黑 D6 再叫吃。','白 C5 延伸。','黑 C4 再叫吃。','白 D5 延伸。','黑 E5 再叫吃。','白 D4 延伸。','黑 D3 再叫吃。','白 E4 延伸。','黑 F4 再叫吃。','白 E3 延伸。','黑 E2 再叫吃。','白 F3 延伸。','黑 G3 再叫吃。','白 F2 延伸。','黑 F1 再叫吃。','白 G2 已到盤邊。','黑 G1 封住最後一口氣，提走十顆白棋。若沿途遇到白棋援兵，征子可能失敗。'],
    '本例示範先從哪一點叫吃，開始向右追擊？',['B5','G7','A1'],0,
    '下征子前應先看什麼？',['只看第一口氣','只看誰先下','整條逃跑路線有沒有對方援兵'],2),
  tactic('net','枷吃','先在外圍罩住逃路，不必每一手都叫吃；對手向外走仍會被封住。',7,
    [[1,2],[2,1],[1,3],[3,1]],[[2,2]],[[3,3],[2,3],[2,4],[3,2],[4,2]],
    ['黑 D4 先罩住右下方，白棋還有兩口氣，這手不是叫吃。','白 D5 嘗試向右跑。','黑 E5 擋住右方出口，白棋只剩 C4。','白 C4 再向下跑。','黑 C3 提掉三顆白棋。本例展示其中一條逃跑變化，重點是先封住外圍。'],
    '哪一點能先罩住右下方，而不直接叫吃？',['G1','D4','A7'],1,
    '枷吃和征子的示範差別是什麼？',['枷吃必須每手叫吃','征子不需要看氣','枷吃可以先罩住外圍，不立即叫吃'],2),
  tactic('snapback','倒撲','先送一顆棋讓對手提掉，再利用對方氣不足，提回更多棋。',5,
    [[0,2],[1,2],[2,1],[2,0]],[[0,1],[1,1]],[[0,0],[1,0],[0,0]],
    ['黑 A5 撲入，只剩 A4 一口氣。','白 A4 提掉黑 A5，三顆白棋反而只剩 A5 一口氣。','黑 A5 立即提回三顆白棋。這裡不是單子互提的劫，可以直接提回。'],
    '要形成本例倒撲，先把黑棋送入哪一點？',['E1','D3','A5'],2,
    '白棋提掉一顆黑棋後，黑棋下一手能提幾顆白棋？',['一顆','三顆','不能提，必定是劫'],1),
  {id:'eye',unit:'life',title:'眼',intro:'眼是被己方棋子圍住的內部空間。先學看一個空點的小眼，別把任何空點都當成眼。',
    frames:[diagram(7,ring,[],[], '黑棋圍出一個內部空點。'),diagram(7,ring,[],[[2,2]],'C5 是這串黑棋的內部眼位；外側的空點只是外氣。單有一眼不保證活棋。')],
    questions:[question('eye-location',1,'哪個點是圖中黑棋圍出的內部眼位？',['C5','A1','G7'],0,'C5 被黑棋圍在內部；盤面其他空點不因此都算眼。'),question('eye-concept',1,'只有一眼，就一定不會被吃掉嗎？',['是，一眼就夠','不是，外氣被填完後仍可能被吃','只要是黑棋就不會'],1,'只有一眼不保證活棋。還要看能不能做出第二個真眼或與活棋連接。')]},
  {id:'false-eye',unit:'life',title:'真眼與假眼',intro:'假眼外觀看似被圍住，周圍棋子卻有斷點，可能被叫吃，逼得自己填掉眼位。',
    frames:[diagram(7,ring,[],[[2,2]],'這是完整連接的一個小眼；但單眼仍不等於活棋。'),diagram(7,[[1,2],[2,1],[2,3],[3,2]],[[0,2],[1,1],[1,3]],[[2,2]],'換看這個假眼：上方 C6 黑棋只剩 C5 一口氣，白棋可在 C5 提掉它。四邊有黑棋，不代表就是真眼。')],
    questions:[question('false-eye-identify',1,'此圖金色空點為什麼是假眼？',['因為它不在星位','因為四邊的黑棋有斷點，上方可被提掉','因為白棋不能下在裡面'],1,'白 C5 能提掉 C6 黑棋，原本看似封閉的眼位就破了。'),question('false-eye-concept',0,'判斷眼時，除了空點的四邊，還要看什麼？',['周圍棋子的連接與氣','只看棋子顏色漂亮不漂亮','只數星位'],0,'要檢查周圍棋子是否能守住眼位，不能只看四邊有沒有己方棋子。')]},
  {id:'two-eyes',unit:'life',title:'兩眼活棋',intro:'同一串棋保有兩個分開、完整的真眼，對手無法一手同時填滿，便能活下來。',
    frames:[diagram(7,twoEyes,surround,[[2,2]],'外氣都被白棋封住，先看左邊 C5 的眼。'),diagram(7,twoEyes,surround,[[2,2],[2,4]],'C5 與 E5 是兩個分開的真眼。同一串黑棋共用這兩口氣，白棋不能直接下進任一眼。')],
    questions:[question('two-eyes-count',1,'圖中這串黑棋有幾個分開的真眼？',['一個','兩個','四個'],1,'C5、E5 分別被完整包圍，而且屬於同一串黑棋。'),question('two-eyes-concept',1,'兩個相鄰的內部空點，必然就是兩眼嗎？',['是，兩口氣就是兩眼','只要在角落就是','不是，連成一塊的空間不等於兩個分開的眼'],2,'關鍵是兩個分開且守得住的眼，不只是數出兩個空點。')]},
];

export function frameBoard(frame) {
  const board=createBoard(frame.size);
  for (const [points,color] of [[frame.black,1],[frame.white,2]]) for (const [r,c] of points) {
    if (!Number.isInteger(r)||!Number.isInteger(c)||r<0||c<0||r>=frame.size||c>=frame.size||board[r][c]) throw new Error('棋形圖解座標無效');
    board[r][c]=color;
  }
  return board;
}
export function topicFrames(topic) {
  if (!topic.moves) return topic.frames.map(f=>({...f,board:frameBoard(f)}));
  const first=topic.frames[0]; let board=frameBoard(first),ko=null;
  const result=[{...first,board}];
  for (const move of topic.moves) {
    const next=tryPlaceStone(board,first.size,...move.point,move.color,ko);
    if (!next.valid) throw new Error(`教學示範含非法落子：${topic.id}`);
    board=next.newBoard;ko=next.newKo;
    result.push({size:first.size,board,marks:[move.point],text:move.text,captured:next.captured,ko});
  }
  return result;
}
// 固定輪替選項順序，避免每題正解都落在同一位置，也避免重整造成選項跳動。
for (const [index,topic] of SHAPE_TOPICS.entries()) for (const [i,q] of topic.questions.entries()) {
  const shift=(index+i)%q.options.length;
  q.options=[...q.options.slice(shift),...q.options.slice(0,shift)];
  q.correct=(q.correct-shift+q.options.length)%q.options.length;
}
export const SHAPE_QUESTIONS=SHAPE_TOPICS.flatMap(t=>t.questions);
