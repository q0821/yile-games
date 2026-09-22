import { parseSgf, sgfPoint, sgfPoints, sgfMove } from './sgf-tree.js';
import { createBoard, cloneBoard, tryPlaceStone, getGroup } from './rules.js';

export function loadProblem(text, id) {
  const tree = parseSgf(text);
  const root = tree.nodes[tree.root];
  const board = createBoard(tree.size);
  for (const [property, color] of [['AB', 1], ['AW', 2]]) for (const [r,c] of sgfPoints(root.props[property], tree.size)) {
    if (board[r][c]) throw new Error('初始棋子重疊');
    board[r][c] = color;
  }
  for (const [r,c] of sgfPoints(root.props.AE, tree.size)) board[r][c] = 0;
  if (sgfMove(root, tree.size)) throw new Error('題目根節點不應包含落子');
  const player = sgfMove(tree.nodes[root.children[0]], tree.size)?.color;
  if (!player) throw new Error('題目沒有起手');
  const positions = new Map([[root.id, { board, ko: null }]]);
  const parents = new Map();
  const errors = [];
  const marked = new Set();
  const reachable = new Set();
  const setupPoints = [...sgfPoints(root.props.AB, tree.size), ...sgfPoints(root.props.AW, tree.size)];
  const points = [...setupPoints];
  for (const node of tree.nodes) {
    const comment = node.props.C?.[0]?.trim() || '';
    if (/^(?:also )?correct\b/i.test(comment)) marked.add(node.id);
    if (node.id !== root.id && ['AB','AW','AE'].some(key => node.props[key])) throw new Error('變化中的擺子尚未支援');
    for (const key of ['LB','TR','SQ','CR','MA']) for (const value of node.props[key] || []) {
      points.push(sgfPoint(key === 'LB' ? value.slice(0,2) : value, tree.size));
    }
    for (const childId of node.children) {
      parents.set(childId, node.id);
      const child = tree.nodes[childId];
      const move = sgfMove(child, tree.size);
      if (!move) throw new Error('變化節點缺少落子');
      if (move.point) points.push(move.point);
      const parent = positions.get(node.id);
      if (!parent) continue;
      const prior = sgfMove(node, tree.size);
      if (move.color !== (prior ? 3 - prior.color : player)) throw new Error('SGF 落子顏色未交替');
      const result = move.point ? tryPlaceStone(parent.board, tree.size, ...move.point, move.color, parent.ko)
        : { valid: true, newBoard: cloneBoard(parent.board), newKo: null };
      if (!result.valid) { errors.push({ node: childId, reason: result.reason }); continue; }
      positions.set(childId, { board: result.newBoard, ko: result.newKo });
    }
  }
  if (errors.length) throw new Error(`SGF 含非法落子：${JSON.stringify(errors)}`);
  if (!marked.size) throw new Error('題目缺少明確的正解標記');
  for (const target of marked) {
    let n = target;
    while (n !== undefined) { reachable.add(n); n = parents.get(n); }
  }
  for (const [r,c] of setupPoints) {
    if (board[r][c] && !getGroup(board, tree.size, r, c).liberties.size) throw new Error('初始棋串沒有氣');
  }
  const rows = points.map(p => p[0]), cols = points.map(p => p[1]);
  const viewport = { minRow: Math.max(0, Math.min(...rows)-1), maxRow: Math.min(tree.size-1, Math.max(...rows)+1),
    minCol: Math.max(0, Math.min(...cols)-1), maxCol: Math.min(tree.size-1, Math.max(...cols)+1) };
  return { ...tree, id, player, positions, parents, marked, reachable, viewport };
}
export function startAttempt(problem) {
  return { node: problem.root, history: [problem.root], assisted: false, mistaken: false, done: false, status: 'playing' };
}
export function playMove(problem, state, point) {
  if (state.done) return state;
  const candidates = problem.nodes[state.node].children;
  const id = candidates.find(id => {
    const m = sgfMove(problem.nodes[id], problem.size);
    return m.color === problem.player && (point === null ? m.point === null : m.point && m.point[0] === point[0] && m.point[1] === point[1]);
  });
  if (id === undefined) return { ...state, mistaken: true, status: 'unlisted' };
  let next = { ...state, node: id, history: [...state.history, id], status: 'playing' };
  // 自動應手只走原譜，優先選通往明示正解的應手；其他分支可在原譜檢視中逐手查看。
  if (!problem.marked.has(id) && problem.nodes[id].children.length) {
    const replies = problem.nodes[id].children;
    const reply = replies.find(child => problem.reachable.has(child)) ?? replies[0];
    next.node = reply; next.history.push(reply);
  }
  if (problem.marked.has(next.node)) return { ...next, done: true, status: 'correct' };
  if (!problem.reachable.has(next.node)) return { ...next, mistaken: true, done: true, status: 'variation' };
  return next;
}
export function solutionPath(problem) {
  const path = [problem.root];
  while (!problem.marked.has(path.at(-1))) {
    const id = problem.nodes[path.at(-1)].children.find(id => problem.reachable.has(id));
    if (id === undefined) throw new Error('正解路徑不完整');
    path.push(id);
  }
  return path;
}
export function coordinate(point, size) {
  return point ? `${'ABCDEFGHJKLMNOPQRST'[point[1]]}${size-point[0]}` : '虛手';
}
