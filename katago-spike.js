// KataGo 引擎 spike：實測單次 eval 與低搜尋量 analyze 在本機/手機上的延遲與後端。
// 這是 throwaway 測試頁，驗證路 B 可行性後會移除（見 ENGINE_KATAGO_PLAN.md）。
import { getKataGoEngineClient } from './katago-engine/engine/katago/client.ts';
import { publicUrl } from './katago-engine/utils/publicUrl.ts';

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

document.getElementById('runWebgpu').addEventListener('click', () => run('webgpu'));
document.getElementById('runWasm').addEventListener('click', () => run('wasm'));
