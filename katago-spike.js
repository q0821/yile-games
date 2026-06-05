// KataGo 引擎 spike：實測單次 eval 與低搜尋量 analyze 在本機/手機上的延遲與後端。
// 這是 throwaway 測試頁，驗證路 B 可行性後會移除（見 ENGINE_KATAGO_PLAN.md）。
import { getKataGoEngineClient } from './katago-engine/engine/katago/client.ts';
import { publicUrl } from './katago-engine/utils/publicUrl.ts';
import { BLACK, WHITE, EMPTY } from './rules.js';
import { genmove as katagoGenmove, evaluate as katagoEvaluate } from './katago-service.js';

const out = document.getElementById('out');
const backendEl = document.getElementById('backend');
const log = (m) => { out.textContent += m + '\n'; };
const MODEL = publicUrl('models/katago-small.bin.gz');

function emptyBoard(n) {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => null));
}

async function run(backendPref) {
  out.textContent = '';
  backendEl.textContent = 'backend: 載入中…';
  try {
    const client = getKataGoEngineClient();
    log(`偏好後端：${backendPref}`);
    let t = performance.now();
    await client.init(MODEL, backendPref);
    const info = client.getEngineInfo();
    const initMs = Math.round(performance.now() - t);
    backendEl.textContent = `backend: ${info.backend}（模型 ${info.modelName || '?'}）`;
    log(`init 完成：${initMs}ms，實際後端 = ${info.backend}`);

    const board = emptyBoard(19);
    const common = { modelUrl: MODEL, board, currentPlayer: 'black', moveHistory: [], komi: 7.5, rules: 'chinese' };

    // 單次 eval ×5（第一次含 warmup/編譯，之後才是穩定值）
    for (let i = 0; i < 5; i++) {
      t = performance.now();
      await client.evaluate(common);
      log(`單次 eval #${i + 1}：${Math.round(performance.now() - t)}ms`);
    }

    // 低搜尋量 analyze（模擬「對手出手 / 覆盤一手」的實際延遲）
    for (const v of [8, 16, 32]) {
      t = performance.now();
      const a = await client.analyze({ ...common, visits: v, maxTimeMs: 20000 });
      const ms = Math.round(performance.now() - t);
      const wr = a && a.rootInfo && typeof a.rootInfo.winrate === 'number'
        ? `，勝率 ${(a.rootInfo.winrate * 100).toFixed(1)}%` : '';
      log(`analyze（${v} visits）：${ms}ms${wr}`);
    }
    log('—— 完成。把『實際後端』與各延遲回報即可 ——');
  } catch (err) {
    backendEl.textContent = 'backend: 失敗';
    log('錯誤：' + (err && err.message ? err.message : String(err)));
    console.error(err);
  }
}

// ——— 座標方位驗證：白可一手提掉黑 4 子，genmove 應回傳唯一提子點 (row1,col6) ———
async function verifyOrientation() {
  out.textContent = '';
  backendEl.textContent = 'backend: 驗證座標中…';
  try {
    const N = 19;
    const board = Array.from({ length: N }, () => Array.from({ length: N }, () => EMPTY));
    const set = (r, c, v) => { board[r][c] = v; };
    // 黑 4 子（被叫吃）：(0,3..6)
    [[0,3],[0,4],[0,5],[0,6]].forEach(([r,c]) => set(r,c,BLACK));
    // 白包圍，留唯一氣 (1,6)
    [[0,2],[0,7],[1,3],[1,4],[1,5]].forEach(([r,c]) => set(r,c,WHITE));
    const state = {
      board, size: N, currentPlayer: WHITE,
      moveHistory: [], komi: 7.5, gameRules: 'chinese',
      onStatus: (m) => log(m),
    };
    log('局面：黑 (0,3)(0,4)(0,5)(0,6) 被叫吃，唯一氣＝(row1,col6)。白先，正確 genmove 應為 {x:1,y:6}');
    const t = performance.now();
    const mv = await katagoGenmove(state, { visits: 64 });
    backendEl.textContent = `backend: ${getKataGoEngineClient().getEngineInfo().backend}`;
    log(`genmove 回傳：${JSON.stringify(mv)}（${Math.round(performance.now() - t)}ms）`);
    const ok = mv && mv.x === 1 && mv.y === 6;
    log(ok ? '✅ 方位正確：回到唯一提子點' : '⚠️ 不是提子點——可能 KataGo 沒選提子，或方位需檢查（見下方說明）');
    if (!ok) log('（提醒：若回傳的是 {x:6,y:1} 之類對調值，就是 x/y 轉換錯；若完全別處，可能 KataGo 判斷不提，換更大叫吃群再測）');
  } catch (err) {
    backendEl.textContent = 'backend: 失敗';
    log('錯誤：' + (err && err.message ? err.message : String(err)));
    console.error(err);
  }
}

document.getElementById('runWebgpu').addEventListener('click', () => run('webgpu'));
document.getElementById('runWasm').addEventListener('click', () => run('wasm'));
document.getElementById('verifyBtn')?.addEventListener('click', verifyOrientation);

// ——— 勝率診斷：分辨「0% 勝率」是系統性 bug 還是局面特定 ———
async function diagnoseWinrate() {
  out.textContent = '';
  backendEl.textContent = 'backend: 診斷勝率中…';
  try {
    const mk = (N, fill) => Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => fill(r, c)));
    const ev = async (label, board, N, komi, player) => {
      const a = await katagoEvaluate({ board, size: N, currentPlayer: player, moveHistory: [], komi, gameRules: 'chinese' }, { visits: 12 });
      log(`${label}: 黑勝率 ${(a.rootWinRate * 100).toFixed(1)}%、黑領先 ${a.rootScoreLead.toFixed(1)} 目`);
      return a;
    };
    backendEl.textContent = 'backend: ' + getKataGoEngineClient().getEngineInfo().backend;
    log('— 決定性測試（全黑應≈100%、全白應≈0%）—');
    await ev('全黑盤 9x9 (komi7.5)', mk(9, () => BLACK), 9, 7.5, WHITE);
    await ev('全白盤 9x9 (komi7.5)', mk(9, () => WHITE), 9, 7.5, BLACK);
    log('— komi/方向 —');
    await ev('空盤 9x9 komi 7.5', mk(9, () => EMPTY), 9, 7.5, BLACK);
    await ev('空盤 9x9 komi 0', mk(9, () => EMPTY), 9, 0, BLACK);
    await ev('空盤 19x19 komi 7.5', mk(19, () => EMPTY), 19, 7.5, BLACK);
    log('— 黑佔上半、白佔下半（黑多）9x9 —');
    const half = mk(9, (r) => (r <= 3 ? BLACK : r >= 5 ? WHITE : EMPTY));
    await ev('黑上白下 (komi7.5)', half, 9, 7.5, BLACK);
    log('—— 完成。把數字回報即可 ——');
  } catch (err) {
    backendEl.textContent = 'backend: 失敗';
    log('錯誤：' + (err && err.message ? err.message : String(err)));
    console.error(err);
  }
}
document.getElementById('diagBtn')?.addEventListener('click', diagnoseWinrate);
