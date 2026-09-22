import { getGroup, tryPlaceStone } from './rules.js';
import { topicFrames, shapeCoordinate } from './go-shape-lessons.js';

export function examplePoint(q,size) {
  const value=q.options[q.correct];
  return [size-Number(value.slice(1)),'ABCDEFGHJKLMNOPQRST'.indexOf(value[0])];
}
export function judgeShapePoint(topic,q,point) {
  const frame=topicFrames(topic)[q.frame],board=frame.board,size=frame.size;
  const fail=reason=>({correct:false,board,reason});
  if(!Array.isArray(point)||point.length!==2||!point.every(n=>Number.isInteger(n)&&n>=0&&n<size))return fail('請選棋盤內的交叉點。');
  const [row,col]=point;
  if(board[row][col])return fail('這裡已經有棋子，請選空交叉點。');
  const placed=tryPlaceStone(board,size,row,col,1,null);
  if(!placed.valid)return fail('這一步不符合落子規則，請換一個空點。');
  const [er,ec]=examplePoint(q,size);
  let correct=row===er&&col===ec;
  const origin=topic.frames[0].black[0];
  if(topic.unit==='shape') {
    const dr=Math.abs(row-origin[0]),dc=Math.abs(col-origin[1]);
    if(topic.id==='extend')correct=dr+dc===1;
    if(topic.id==='stand')correct=row===origin[0]+1&&col===origin[1];
    if(topic.id==='jump')correct=(dr===2&&dc===0)||(dr===0&&dc===2);
    if(topic.id==='diagonal')correct=dr===1&&dc===1;
    if(topic.id==='knight')correct=(dr===1&&dc===2)||(dr===2&&dc===1);
    if(topic.id==='tiger') {
      // 三子必須圍住同一個盤內空點的三個方向，而不是只認示範方向。
      const stones=[...topic.frames[0].black,point];
      correct=false;
      for(let r=1;r<size-1;r++)for(let c=1;c<size-1;c++)if(placed.newBoard[r][c]===0&&stones.every(([x,y])=>Math.abs(x-r)+Math.abs(y-c)===1))correct=true;
    }
  }
  if(topic.id==='double-atari')correct=topic.frames[0].white.every(([r,c])=>placed.newBoard[r][c]===2&&getGroup(placed.newBoard,size,r,c).liberties.size===1);
  if(!correct) {
    const reasons={extend:'長要緊接原有黑棋，不能隔空或只碰到斜角。',stand:'這題指定向下方盤邊立，請下在原有黑棋正下方的相鄰空點。',jump:'一間跳要沿同一直線，中間恰好留一個空交叉點。',diagonal:'尖要在原有黑棋的斜角，橫向與直向各差一格。',knight:'小飛要在一個方向差兩格，另一個方向差一格。',tiger:'請讓三顆黑棋圍住同一個空點的三個方向，中央不能被填住。'};
    return fail(reasons[topic.id]||'這一點還沒有符合題目指定的位置或方向，請再觀察棋盤。');
  }
  return {correct:true,board:q.input==='identify'?board:placed.newBoard,point,
    explanation:`${q.input==='identify'?'選中':'黑棋下在'} ${shapeCoordinate(point,size)}。${q.explanation}`};
}
