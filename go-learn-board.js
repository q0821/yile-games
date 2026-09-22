import { resizeTsumegoCanvas, drawTsumego } from './tsumego-ui.js';

// 入門題沿用共用圍棋繪圖，DOM 按鈕保留鍵盤與螢幕閱讀器操作。
export function mountLearnBoard(root, board, targets, answers, disabled, submit) {
  const boardSize = board.length;
  const stage = document.createElement('div'); stage.className = 'learn-board-stage';
  const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
  const points = document.createElement('div'); points.className = 'learn-board-points';
  stage.append(canvas, points); root.append(stage);
  const markers = [];
  const cells = [];
  let entrySet = false;
  for (let row=0; row<boardSize; row++) for (let col=0; col<boardSize; col++) {
    const color = board[row][col];
    const target = targets.has(`${row},${col}`) && color !== 0;
    const answer = answers.has(`${row},${col}`);
    if (target) markers.push({row,col,type:'target'});
    if (answer) markers.push({row,col,type:'practice-answer'});
    const cell = document.createElement('button'); cell.type = 'button'; cell.className = 'learn-point';
    cell.dataset.row = row; cell.dataset.col = col;
    cell.setAttribute('aria-label', `${'ABCDEFGHJKLMNOPQRST'[col]}${boardSize-row}，${color===1?'黑棋':color===2?'白棋':'空點'}${target?'，目標棋串':''}${answer?'，解答標記':''}`);
    cell.disabled = disabled;
    cell.tabIndex = !disabled && !entrySet && color === 0 ? 0 : -1;
    if (cell.tabIndex === 0) entrySet = true;
    cell.addEventListener('focus', () => { for (const item of cells) item.cell.tabIndex = item.cell === cell ? 0 : -1; });
    cell.addEventListener('keydown', event => {
      const delta = {ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[event.key];
      if (!delta) return;
      event.preventDefault();
      const r = Math.max(0,Math.min(boardSize-1,row+delta[0]));
      const c = Math.max(0,Math.min(boardSize-1,col+delta[1]));
      cells[r*boardSize+c].cell.focus();
    });
    cell.addEventListener('click', () => submit([row,col]));
    points.append(cell); cells.push({cell,row,col});
  }
  const deps = {canvas,ctx:canvas.getContext('2d')};
  const view = {size:boardSize,board,markers,viewport:{minRow:0,maxRow:boardSize-1,minCol:0,maxCol:boardSize-1}};
  const paint = () => {
    if (!root.isConnected || root.clientWidth < 1) return;
    deps.maxSize = Math.min(boardSize > 7 ? 560 : 350, root.clientWidth);
    resizeTsumegoCanvas(deps,view); drawTsumego(deps,view);
    stage.style.width = `${deps._cssW}px`; stage.style.height = `${deps._cssH}px`;
    for (const {cell,row,col} of cells) {
      const size=deps.cellSize;
      cell.style.cssText=`left:${deps.padding+col*size-size/2}px;top:${deps.padding+row*size-size/2}px;width:${size}px;height:${size}px`;
    }
  };
  paint();
  const observer = new ResizeObserver(paint); observer.observe(root);
  window.addEventListener('resize',paint);
  return () => {observer.disconnect(); window.removeEventListener('resize',paint);};
}
