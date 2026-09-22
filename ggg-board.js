import { resizeTsumegoCanvas, drawTsumego } from './tsumego-ui.js';
import { sgfMove, sgfPoint, sgfPoints } from './sgf-tree.js';
import { coordinate } from './ggg-problem.js';

// 視覺沿用全站 Canvas 棋盤，透明按鈕保留鍵盤、朗讀與真實落點。
export function mountGggBoard(root, problem, nodeId, disabled, submit) {
  const wrapper = document.createElement('div'); wrapper.className = 'ggg-board-wrap';
  const stage = document.createElement('div'); stage.className = 'ggg-board-stage';
  const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
  const grid = document.createElement('div'); grid.id = 'gggBoard'; grid.className = 'ggg-board';
  grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', `${problem.size} 路棋盤的局部視窗`);
  stage.append(canvas, grid); wrapper.append(stage); root.append(wrapper);
  const board = problem.positions.get(nodeId).board;
  const node = problem.nodes[nodeId];
  const markers = [], labels = new Map();
  const last = sgfMove(node, problem.size)?.point;
  if (last) markers.push({ row: last[0], col: last[1], type: 'aimove' });
  for (const value of node.props.LB || []) {
    const [row,col] = sgfPoint(value.slice(0,2), problem.size), text = value.slice(3);
    markers.push({row,col,type:'label',text}); labels.set(`${row},${col}`,text);
  }
  for (const [prop,type,label] of [['TR','triangle','三角形'],['SQ','square','正方形'],['CR','circle','圓形'],['MA','cross','叉號']]) {
    for (const [row,col] of sgfPoints(node.props[prop], problem.size)) {
      markers.push({row,col,type}); labels.set(`${row},${col}`,label);
    }
  }
  const view = { viewport: problem.viewport, size: problem.size, board, markers };
  const deps = { canvas, ctx: canvas.getContext('2d') };
  const cells = [];
  const {minRow,maxRow,minCol,maxCol} = problem.viewport;
  for (let row=minRow;row<=maxRow;row++) for (let col=minCol;col<=maxCol;col++) {
    const cell = document.createElement('button'); cell.type = 'button'; cell.className = 'ggg-point';
    const stone = board[row][col], mark = labels.get(`${row},${col}`);
    cell.setAttribute('aria-label', `${coordinate([row,col],problem.size)}，${stone===1?'黑棋':stone===2?'白棋':'空點'}${mark?`，標記 ${mark}`:''}`);
    cell.disabled = disabled;
    cell.addEventListener('click', () => submit([row,col]));
    grid.append(cell); cells.push({cell,row,col});
  }
  const paint = () => {
    if (!wrapper.isConnected || wrapper.clientWidth < 1) return;
    deps.maxSize = Math.max(180, wrapper.clientWidth - 2);
    resizeTsumegoCanvas(deps, view); drawTsumego(deps, view);
    stage.style.width = `${deps._cssW}px`; stage.style.height = `${deps._cssH}px`;
    for (const {cell,row,col} of cells) {
      const size = deps.cellSize;
      cell.style.cssText = `left:${deps.padding+(col-minCol)*size-size/2}px;top:${deps.padding+(row-minRow)*size-size/2}px;width:${size}px;height:${size}px`;
    }
  };
  paint();
  const observer = new ResizeObserver(paint); observer.observe(wrapper);
  window.addEventListener('resize', paint);
  return () => { observer.disconnect(); window.removeEventListener('resize', paint); };
}
