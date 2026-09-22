// SGF FF[4]：保留所有原始屬性、序列與變化。僅接受單一圍棋棋譜。
export function parseSgf(text) {
  if (typeof text !== 'string' || text.length > 1_000_000) throw new Error('SGF 檔案過大或格式錯誤');
  let cursor = 0;
  const nodes = [];
  const skip = () => { while (/\s/.test(text[cursor] || '') && cursor < text.length) cursor++; };
  function expect(char) { skip(); if (text[cursor++] !== char) throw new Error(`SGF 結構錯誤，位置 ${cursor}`); }
  function value() {
    expect('['); let result = '';
    while (cursor < text.length) {
      let char = text[cursor++];
      if (char === ']') return result;
      if (char === '\\') {
        if (cursor === text.length) break;
        char = text[cursor++];
        if (char === '\r' || char === '\n') {
          if ((char === '\r' && text[cursor] === '\n') || (char === '\n' && text[cursor] === '\r')) cursor++;
          continue;
        }
      }
      if (char === '\r' || char === '\n') {
        if ((char === '\r' && text[cursor] === '\n') || (char === '\n' && text[cursor] === '\r')) cursor++;
        char = '\n';
      }
      result += /[\t\v\f]/.test(char) ? ' ' : char;
    }
    throw new Error('SGF 屬性值未結束');
  }
  function tree(depth = 0) {
    if (depth > 200) throw new Error('SGF 變化層數過多');
    expect('('); skip();
    let first = null, last = null;
    while (text[cursor] === ';') {
      cursor++; const node = { id: nodes.length, props: {}, children: [] }; nodes.push(node);
      if (nodes.length > 10000) throw new Error('SGF 節點過多');
      if (last) last.children.push(node.id); else first = node.id;
      last = node; skip();
      while (/[A-Z]/.test(text[cursor] || '')) {
        let key = ''; while (/[A-Z]/.test(text[cursor] || '')) key += text[cursor++];
        if (Object.hasOwn(node.props, key)) throw new Error('SGF 屬性重複');
        const values = []; skip();
        while (text[cursor] === '[') { values.push(value()); skip(); }
        if (!values.length) throw new Error('SGF 屬性缺少值');
        node.props[key] = values;
      }
      skip();
    }
    if (!last) throw new Error('SGF 棋譜缺少節點');
    while (text[cursor] === '(') { last.children.push(tree(depth + 1)); skip(); }
    expect(')'); return first;
  }
  const root = tree(); skip();
  if (cursor !== text.length) throw new Error('SGF 含多份棋譜或額外內容');
  const props = nodes[root].props;
  if ((props.GM?.[0] || '1') !== '1') throw new Error('只支援圍棋 SGF');
  const size = Number(props.SZ?.[0] || '19');
  if (!Number.isInteger(size) || size < 2 || size > 19) throw new Error('不支援的棋盤大小');
  return { root, nodes, size };
}

export function sgfPoint(value, size) {
  if (!/^[a-s]{2}$/.test(value)) throw new Error('SGF 座標格式錯誤');
  const point = [value.charCodeAt(1) - 97, value.charCodeAt(0) - 97];
  if (point.some(v => v >= size)) throw new Error('SGF 座標超出棋盤');
  return point;
}
export function sgfPoints(values = [], size) {
  return values.flatMap(value => {
    const range = value.split(':');
    if (range.length === 1) return [sgfPoint(value, size)];
    if (range.length !== 2) throw new Error('SGF 範圍格式錯誤');
    const [a,b] = range.map(v => sgfPoint(v, size));
    if (a[0] > b[0] || a[1] > b[1]) throw new Error('SGF 範圍順序錯誤');
    const points = [];
    for (let r = a[0]; r <= b[0]; r++) for (let c = a[1]; c <= b[1]; c++) points.push([r,c]);
    return points;
  });
}
export function sgfMove(node, size) {
  const { B, W } = node.props;
  if (B && W) throw new Error('SGF 同節點不可同時落黑白棋');
  if (!B && !W) return null;
  const values = B || W;
  if (values.length !== 1) throw new Error('SGF 落子只能有一個座標');
  return { color: B ? 1 : 2, point: values[0] === '' ? null : sgfPoint(values[0], size) };
}
