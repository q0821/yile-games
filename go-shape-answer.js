import { getGroup, tryPlaceStone } from './rules.js';
import { questionFrame, shapeCoordinate } from './go-shape-lessons.js';

export function examplePoint(q) {
  return [...q.answer];
}
export function judgeShapePoint(topic,q,point) {
  const frame=questionFrame(topic,q),board=frame.board,size=frame.size;
  const fail=reason=>({correct:false,board,reason});
  if(!Array.isArray(point)||point.length!==2||!point.every(n=>Number.isInteger(n)&&n>=0&&n<size))return fail('請選棋盤內的交叉點。');
  const [row,col]=point;
  if(board[row][col])return fail('這裡已經有棋子，請選空交叉點。');
  if(q.input==='identify') {
    const correct=q.answer[0]===row&&q.answer[1]===col;
    return correct?{correct:true,board,point,explanation:`選中 ${shapeCoordinate(point,size)}。${q.explanation}`}:fail('這裡不是題目所問的眼位，請再觀察包圍它的棋子。');
  }
  const placed=tryPlaceStone(board,size,row,col,1,null);
  if(!placed.valid)return fail('這一步不符合落子規則，請換一個空點。');
  const [er,ec]=examplePoint(q,size);
  let correct=row===er&&col===ec;
  const rule=q.rule;
  const origin=rule.origin;
  if(rule.kind==='edge-star')correct=((row===9&&[3,15].includes(col))||(col===9&&[3,15].includes(row)));
  if(origin||rule.kind==='tiger') {
    const dr=origin?Math.abs(row-origin[0]):0,dc=origin?Math.abs(col-origin[1]):0;
    if(rule.kind==='extend')correct=dr+dc===1;
    if(rule.kind==='stand')correct=row===origin[0]+rule.direction[0]&&col===origin[1]+rule.direction[1];
    if(rule.kind==='jump')correct=((dr===2&&dc===0)||(dr===0&&dc===2))&&board[(row+origin[0])/2][(col+origin[1])/2]===0;
    if(rule.kind==='diagonal')correct=dr===1&&dc===1;
    if(rule.kind==='knight')correct=(dr===1&&dc===2)||(dr===2&&dc===1);
    if(rule.kind==='tiger') {
      // 三子必須圍住同一個盤內空點的三個方向，而不是只認示範方向。
      const stones=[...rule.anchors,point];
      correct=false;
      for(let r=1;r<size-1;r++)for(let c=1;c<size-1;c++)if(placed.newBoard[r][c]===0&&stones.every(([x,y])=>Math.abs(x-r)+Math.abs(y-c)===1))correct=true;
    }
  }
  if(topic.id==='double-atari')correct=q.targets.every(([r,c])=>placed.newBoard[r][c]===2&&getGroup(placed.newBoard,size,r,c).liberties.size===1);
  if(!correct) {
    const reasons={extend:'長要緊接原有黑棋，不能隔空或只碰到斜角。',stand:'請依題目指定的盤邊方向，從指定黑棋緊接一子。',jump:'一間跳要沿同一直線，中間恰好留一個空交叉點。',diagonal:'尖要在原有黑棋的斜角，橫向與直向各差一格。',knight:'小飛要在一個方向差兩格，另一個方向差一格。',tiger:'請讓三顆黑棋圍住同一個空點的三個方向，中央不能被填住。'};
    return fail(reasons[rule.kind]||'這一點還沒有符合題目指定的位置或方向，請再觀察棋盤。');
  }
  return {correct:true,board:q.input==='identify'?board:placed.newBoard,point,
    explanation:`${q.input==='identify'?'選中':'黑棋下在'} ${shapeCoordinate(point,size)}。${q.explanation}`};
}
