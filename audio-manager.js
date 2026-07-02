// audio-manager.js — 全域音訊管理模組（SFX／語音／BGM），零依賴單例。
//
// 三通道共用同一份設定（AudioSettings），走同一個開關與音量：
//   - SFX／語音：WebAudio decodeAudioData 預載 buffer，經共用的 masterGain 播放
//   - BGM：<audio> 元素雙軌交替播放＋crossfade
//
// 音訊後端（AudioContext／<audio> 元素／fetch）以可注入介面包裝：正式環境用真實
// 瀏覽器 API；Jest（node 環境，無 jsdom）用 _setBackendForTest 注入 mock，只驗證
// 「設定變更 → 呼叫後端」這條邏輯，不假裝能在測試環境播放真實聲音。
import { GoSound } from './sound.js';

// ——— 設定 ———
const SETTINGS_KEY = 'audio-settings-v1';
const SETTINGS_EVENT = 'audio-settings-changed';
const DEFAULT_SETTINGS = { sfxOn: true, sfxVolume: 0.8, musicOn: false, musicVolume: 0.3 };

// ——— 各棋種音效包（進入畫面時 lazy load，見 GAME_SFX_FILES）———
const GAME_SFX_FILES = {
  go: ['stone-place', 'stone-capture', 'pass'],
  gomoku: ['stone-place'],
  othello: ['stone-place', 'stone-capture'], // 使用者偏好：黑白棋沿用圍棋音（othello-flip 棄用）
  xiangqi: ['shogi-place', 'shogi-capture', 'voice-xiangqi-check', 'voice-xiangqi-mate'],
  shogi: ['shogi-place', 'shogi-capture', 'voice-shogi-check', 'voice-shogi-mate'],
  chess: ['chess-place', 'chess-capture', 'voice-chess-check', 'voice-chess-mate'],
  common: ['pass', 'game-win', 'game-lose', 'game-draw', 'invalid-move']
};

// 圍棋既有 WebAudio 合成音（sound.js）作 fallback；只有這四種音有得退，
// 其餘棋種（木子、駒音、翻子、語音）沒有合成版，載入失敗就靜音。
const GO_SOUND_FALLBACK = {
  'stone-place': 'place',
  'stone-capture': 'capture',
  pass: 'pass',
  'game-win': 'gameend',
  'game-lose': 'gameend',
  'game-draw': 'gameend'
};

const MUSIC_TRACK_COUNT = 2; // bgm-1.mp3、bgm-2.mp3
const CROSSFADE_MS = 2500;
const CROSSFADE_STEP_MS = 100;

// ——— 音訊後端：正式環境用真實瀏覽器 API；測試用 _setBackendForTest 換掉 ———
function defaultCreateAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  return new Ctor();
}
function defaultCreateAudio() {
  return new Audio();
}
function defaultFetch(url) {
  return fetch(url);
}
const DEFAULT_BACKEND = {
  createAudioContext: defaultCreateAudioContext,
  createAudio: defaultCreateAudio,
  fetch: defaultFetch
};
let backend = { ...DEFAULT_BACKEND };

// ——— 資產版本 query（防 CDN／HTTP 快取黏住舊音檔）———
// 音檔 URL 若不帶版本，Cloudflare 等邊緣快取在換版後仍會於 max-age 內供舊檔
// （2026-07-02 實際發生：重製音效後正式站聽到的仍是舊聲音）。比照 main.js 註冊
// sw.js 的解法：以 version.json 的當前版號當 query——同版內 URL 固定（快取照常
// 生效），換版 URL 即變、快取立即失效。version.json 本身由 SW bypass、加時戳確
// 保不吃快取；拿不到（如測試環境 mock fetch 無 .json）就退回無 query，不擋載入。
let assetVersionPromise = null;
let assetVersion = '';
function getAssetVersion() {
  if (!assetVersionPromise) {
    assetVersionPromise = Promise.resolve()
      .then(() => backend.fetch('version.json?t=' + Date.now()))
      .then((r) => (r && r.ok !== false && typeof r.json === 'function') ? r.json() : null)
      .then((j) => { assetVersion = (j && j.version) ? String(j.version) : ''; return assetVersion; })
      .catch(() => { assetVersion = ''; return ''; });
  }
  return assetVersionPromise;
}
function withAssetVersion(url) {
  return assetVersion ? `${url}?v=${assetVersion}` : url;
}

// ——— 模組作用域狀態 ———
let settingsCache = null;
let unlocked = false;
let initDone = false;

let ctx = null;              // AudioContext（lazy 建立）
let masterGain = null;       // SFX／語音共用的 GainNode
let sfxBuffers = new Map();  // name -> AudioBuffer
let loadedPacks = new Set(); // 已「成功」載入的 game pack（只在整包跑完才標記，失敗允許下次重試）
let loadingPacks = new Map(); // game -> 進行中的載入 promise（併發呼叫去重，不代表已成功）
let voicePlaying = new Set(); // 節流：正在播放中的語音 name

let musicEls = [null, null]; // 雙軌交替播放（crossfade 用）
let musicActiveIndex = 0;
let musicQueue = [];
let musicQueuePos = 0;
let musicPlaying = false;
let musicWasPlayingBeforeHide = false;
let fadeTimer = null;
let musicConsecutiveErrors = 0; // 連續載入/播放失敗次數；達 MUSIC_TRACK_COUNT（兩首皆壞）就停止，避免無限重試

let musicPlayingBeforeInterruption = false; // 來電／Siri 等搶走音訊焦點時，記錄中斷前 BGM 是否在播
let interruptionResumePending = false;      // 是否已排入「等下一次手勢再 resume()」，避免重複掛監聽

// ============================================================
// AudioSettings：讀寫 localStorage、即時套用到後端、廣播變更
// ============================================================

/** 逐欄位驗證：型別對、且落在 0..1 範圍內才算合法音量值（跟隨 gomoku-mode.js 的逐欄位驗證慣例）。 */
function isValidUnitVolume(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
}

function readSettingsFromStorage() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS };
    const result = { ...DEFAULT_SETTINGS };
    if (typeof parsed.sfxOn === 'boolean') result.sfxOn = parsed.sfxOn;
    if (typeof parsed.musicOn === 'boolean') result.musicOn = parsed.musicOn;
    if (isValidUnitVolume(parsed.sfxVolume)) result.sfxVolume = parsed.sfxVolume;
    if (isValidUnitVolume(parsed.musicVolume)) result.musicVolume = parsed.musicVolume;
    return result;
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

function getSettings() {
  if (!settingsCache) settingsCache = readSettingsFromStorage();
  return { ...settingsCache };
}

function broadcastSettings() {
  try {
    document.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: getSettings() }));
  } catch (_) { /* 非瀏覽器環境或 CustomEvent 不存在時忽略 */ }
}

/** 設定變更即時生效：套用音量到目前存在的後端物件、開關連動啟停 BGM。 */
function applySettingsToBackend(settings) {
  if (masterGain) {
    try { masterGain.gain.value = settings.sfxVolume; } catch (_) { /* ignore */ }
  }
  musicEls.forEach((el) => {
    if (el) { try { el.volume = settings.musicVolume; } catch (_) { /* ignore */ } }
  });
  if (!settings.musicOn && musicPlaying) {
    stopMusic();
  } else if (settings.musicOn && unlocked && !musicPlaying) {
    startMusic();
  }
}

function setSettings(patch) {
  const next = { ...getSettings(), ...(patch || {}) };
  settingsCache = next;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (_) { /* storage 滿或不可用時忽略 */ }
  applySettingsToBackend(next);
  broadcastSettings();
}

export const AudioSettings = {
  get: getSettings,
  set: setSettings
};

// ============================================================
// 解鎖手勢與背景／前景生命週期
// ============================================================

function ensureCtx() {
  if (!ctx) {
    ctx = backend.createAudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = getSettings().sfxVolume;
    masterGain.connect(ctx.destination);
    if (typeof ctx.addEventListener === 'function') {
      ctx.addEventListener('statechange', handleCtxStateChange);
    }
  }
  return ctx;
}

/** iOS 來電／Siri 等搶走音訊焦點時，AudioContext 會被系統轉成 interrupted／suspended，
 *  且不會自動恢復。已解鎖過的情況下才處理（避免跟首次解鎖前的正常 suspended 狀態混淆）；
 *  record 中斷發生當下 BGM 是否在播，實際 resume() 留給下一次使用者手勢（瀏覽器政策要求）。 */
function handleCtxStateChange() {
  if (!ctx || !unlocked) return;
  if (ctx.state === 'running') return;
  if (interruptionResumePending) return; // 已排入等待手勢，避免重複記錄／重複掛監聽
  musicPlayingBeforeInterruption = musicPlaying;
  scheduleResumeOnNextGesture();
}

function scheduleResumeOnNextGesture() {
  interruptionResumePending = true;
  const onGesture = () => {
    interruptionResumePending = false;
    document.removeEventListener('pointerdown', onGesture);
    document.removeEventListener('touchstart', onGesture);
    document.removeEventListener('keydown', onGesture);
    resumeAfterInterruption();
  };
  document.addEventListener('pointerdown', onGesture, { once: true });
  document.addEventListener('touchstart', onGesture, { once: true });
  document.addEventListener('keydown', onGesture, { once: true });
}

function resumeAfterInterruption() {
  if (!ctx) return;
  const shouldResumeMusic = getSettings().musicOn && musicPlayingBeforeInterruption;
  musicPlayingBeforeInterruption = false;
  if (ctx.state !== 'running' && typeof ctx.resume === 'function') {
    Promise.resolve(ctx.resume())
      .then(() => { if (shouldResumeMusic) resumeMusicPlayback(); })
      .catch(() => { /* fail-soft：這次手勢沒能恢復，下次 statechange 仍會再排一輪 */ });
  } else if (shouldResumeMusic) {
    resumeMusicPlayback();
  }
}

function handleUnlockGesture() {
  if (unlocked) return;
  unlocked = true;
  try {
    const c = ensureCtx();
    if (c.state === 'suspended' && typeof c.resume === 'function') {
      Promise.resolve(c.resume()).catch(() => { /* fail-soft */ });
    }
  } catch (_) { /* ignore */ }
  if (getSettings().musicOn) startMusic();
}

function handleVisibilityHidden() {
  if (musicPlaying) {
    musicWasPlayingBeforeHide = true;
    pauseMusicPlayback();
  } else {
    musicWasPlayingBeforeHide = false;
  }
}

function handleVisibilityVisible() {
  if (getSettings().musicOn && musicWasPlayingBeforeHide) {
    resumeMusicPlayback();
  }
}

function handleVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'hidden') handleVisibilityHidden();
  else if (document.visibilityState === 'visible') handleVisibilityVisible();
}

function handlePageHide() {
  handleVisibilityHidden();
}

export function initAudio() {
  if (initDone) return;
  initDone = true;
  getAssetVersion(); // 預先解析資產版本，讓 BGM 的同步 URL 組合也能帶上版本 query
  document.addEventListener('pointerdown', handleUnlockGesture, { once: true });
  document.addEventListener('touchstart', handleUnlockGesture, { once: true });
  document.addEventListener('keydown', handleUnlockGesture, { once: true });
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide); // pagehide 只在 window 上發射，掛在 document 上永遠不會觸發
}

// ============================================================
// SFX／語音載入與播放
// ============================================================

function decodeAudio(c, arrayBuffer) {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = c.decodeAudioData(arrayBuffer, resolve, reject);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(resolve, reject);
      }
    } catch (e) {
      reject(e);
    }
  });
}

/** 實際載入邏輯：只在整包成功跑完才標記 loadedPacks，讓 ensureCtx 失敗（如首次手勢前
 *  AudioContext 建立失敗）等情境不會被永久記成「已載入」而擋掉之後的重試。 */
async function doLoadSfxPack(game, files) {
  let c;
  try {
    c = ensureCtx();
  } catch (_) {
    return; // 無法建立 AudioContext：靜默放棄，之後 playSfx 走 fallback 或靜音；下次呼叫會重試
  }
  await getAssetVersion(); // 先解析資產版本（測試環境自動退回無 query）
  await Promise.all(files.map(async (name) => {
    if (sfxBuffers.has(name)) return;
    try {
      const res = await backend.fetch(withAssetVersion(`/sounds/${name}.mp3`));
      if (!res || res.ok === false) return;
      const arrayBuffer = await res.arrayBuffer();
      const buffer = await decodeAudio(c, arrayBuffer);
      sfxBuffers.set(name, buffer);
    } catch (_) { /* fail-soft：單檔失敗不影響其他檔 */ }
  }));
  loadedPacks.add(game);
}

export async function loadSfxPack(game) {
  const files = GAME_SFX_FILES[game];
  if (!files || loadedPacks.has(game)) return;
  const inflight = loadingPacks.get(game);
  if (inflight) return inflight; // 併發呼叫去重：等同一輪載入，不重複 fetch
  const p = doLoadSfxPack(game, files).finally(() => loadingPacks.delete(game));
  loadingPacks.set(game, p);
  return p;
}

function playBuffer(buffer) {
  const c = ensureCtx();
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(masterGain);
  src.start(0);
  return src;
}

export function playSfx(name) {
  if (!unlocked || !getSettings().sfxOn) return;
  const buffer = sfxBuffers.get(name);
  if (!buffer) {
    const fallback = GO_SOUND_FALLBACK[name];
    if (fallback) {
      try { GoSound.playSound(fallback); } catch (_) { /* ignore */ }
    }
    return;
  }
  try { playBuffer(buffer); } catch (_) { /* fail-soft */ }
}

export function playVoice(name) {
  if (!unlocked || !getSettings().sfxOn) return;
  if (voicePlaying.has(name)) return; // 節流：同名播放中不重複觸發（快速連將不疊音）
  const buffer = sfxBuffers.get(name);
  if (!buffer) return; // 語音沒有合成 fallback，失敗即靜音
  try {
    const src = playBuffer(buffer);
    voicePlaying.add(name);
    const clearFlag = () => voicePlaying.delete(name);
    if ('onended' in src) src.onended = clearFlag;
    else clearFlag();
  } catch (_) {
    voicePlaying.delete(name);
  }
}

// ============================================================
// BGM：雙軌 <audio> 交替播放＋crossfade
//
// 用 <audio> 自身的 timeupdate／ended 事件驅動換曲時機，不用背景 setInterval
// 持續輪詢——避免播放期間常駐一個 100ms 計時器（費電，且在測試環境下若忘了
// stopMusic() 會變成 jest 退不出的 open handle）。crossfade 淡入淡出的短命
// interval（＜3 秒、自行清除）另外用 fadeTimer 追蹤，確保 stopMusic() 能中途取消。
// ============================================================

function shuffledTrackOrder() {
  const order = Array.from({ length: MUSIC_TRACK_COUNT }, (_, i) => i + 1);
  const startIdx = Math.floor(Math.random() * order.length);
  return order.slice(startIdx).concat(order.slice(0, startIdx));
}

function clearFadeTimer() {
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
}

function nextTrackUrl() {
  const n = musicQueue[musicQueuePos % musicQueue.length];
  musicQueuePos += 1;
  return withAssetVersion(`/music/bgm-${n}.mp3`); // 版本於 initAudio 時已預先解析
}

function safePlay(el) {
  try {
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* 自動播放被擋，fail-soft */ });
  } catch (_) { /* ignore */ }
}

/** 掛上換曲監聽：優先用 timeupdate 抓「剩餘時間 <= crossfade 長度」提前換曲；ended 當保底（duration 拿不到時）；
 *  error 為載入／播放失敗時的補救（跳下一首，見 handleTrackError）。三者互斥，只會走其中一條路徑。 */
function attachTrackWatchers(el, idx) {
  if (typeof el.addEventListener !== 'function') return;
  let handled = false;
  const cleanup = () => {
    if (typeof el.removeEventListener !== 'function') return;
    el.removeEventListener('timeupdate', onTimeUpdate);
    el.removeEventListener('ended', onEnded);
    el.removeEventListener('error', onError);
  };
  const onTimeUpdate = () => {
    if (!musicPlaying || handled) return;
    const duration = el.duration;
    const currentTime = el.currentTime;
    if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0 && typeof currentTime === 'number') {
      const remainingMs = (duration - currentTime) * 1000;
      if (remainingMs <= CROSSFADE_MS) {
        handled = true;
        cleanup();
        crossfadeToNext(idx);
      }
    }
  };
  const onEnded = () => {
    if (!musicPlaying || handled) return;
    handled = true; // 沒能提前 crossfade（例如 duration 拿不到），保底直接接下一首
    cleanup();
    playNextTrack();
  };
  const onError = () => {
    if (!musicPlaying || handled) return;
    handled = true;
    cleanup();
    handleTrackError(idx);
  };
  const onPlaying = () => { musicConsecutiveErrors = 0; }; // 真的播起來了：清空連續失敗計數
  el.addEventListener('timeupdate', onTimeUpdate);
  el.addEventListener('ended', onEnded);
  el.addEventListener('error', onError);
  el.addEventListener('playing', onPlaying);
}

/** BGM 載入／播放失敗（<audio> error 事件）時的補救：跳下一首，不重試同一首壞檔；
 *  連續失敗達 MUSIC_TRACK_COUNT（兩首皆壞）就整個停止並靜默，避免無限循環嘗試。 */
function handleTrackError(idx) {
  const el = musicEls[idx];
  if (el) { try { el.pause(); } catch (_) { /* ignore */ } }
  musicEls[idx] = null;
  if (!musicPlaying) return;
  musicConsecutiveErrors += 1;
  if (musicConsecutiveErrors >= MUSIC_TRACK_COUNT) {
    stopMusic(); // 兩首皆壞：停止並靜默，不再嘗試
    return;
  }
  clearFadeTimer(); // 若正值 crossfade 淡出中途出錯，取消計時器避免之後操作到已清空的 el
  musicActiveIndex = idx;
  playNextTrack();
}

function playNextTrack() {
  const idx = musicActiveIndex;
  const el = backend.createAudio();
  el.src = nextTrackUrl();
  el.volume = getSettings().musicVolume;
  attachTrackWatchers(el, idx);
  musicEls[idx] = el;
  safePlay(el);
}

function crossfadeToNext(fromIdx) {
  const toIdx = fromIdx === 0 ? 1 : 0;
  const fromEl = musicEls[fromIdx];
  const toEl = backend.createAudio();
  toEl.src = nextTrackUrl();
  toEl.volume = 0;
  attachTrackWatchers(toEl, toIdx);
  musicEls[toIdx] = toEl;
  safePlay(toEl);
  musicActiveIndex = toIdx;

  const targetVolume = getSettings().musicVolume;
  const steps = Math.max(1, Math.round(CROSSFADE_MS / CROSSFADE_STEP_MS));
  let step = 0;
  clearFadeTimer();
  fadeTimer = setInterval(() => {
    step += 1;
    const ratio = Math.min(1, step / steps);
    if (fromEl) { try { fromEl.volume = targetVolume * (1 - ratio); } catch (_) { /* ignore */ } }
    try { toEl.volume = targetVolume * ratio; } catch (_) { /* ignore */ }
    if (ratio >= 1) {
      clearFadeTimer();
      if (fromEl) { try { fromEl.pause(); } catch (_) { /* ignore */ } }
      musicEls[fromIdx] = null;
    }
  }, CROSSFADE_STEP_MS);
}

function pauseMusicPlayback() {
  musicEls.forEach((el) => { if (el) { try { el.pause(); } catch (_) { /* ignore */ } } });
}

function resumeMusicPlayback() {
  musicEls.forEach((el) => { if (el) safePlay(el); });
}

export function startMusic() {
  if (!getSettings().musicOn) return;
  if (musicPlaying) return;
  musicPlaying = true;
  musicConsecutiveErrors = 0;
  musicQueue = shuffledTrackOrder();
  musicQueuePos = 0;
  musicActiveIndex = 0;
  playNextTrack();
}

export function stopMusic() {
  musicPlaying = false;
  musicWasPlayingBeforeHide = false;
  musicConsecutiveErrors = 0;
  clearFadeTimer();
  musicEls.forEach((el, i) => {
    if (el) { try { el.pause(); } catch (_) { /* ignore */ } }
    musicEls[i] = null;
  });
}

// ============================================================
// 測試用後端注入
// ============================================================

/** 注入 mock 後端（AudioContext 工廠、Audio 工廠、fetch）；未傳入時還原為真實瀏覽器後端。 */
export function _setBackendForTest(overrides) {
  backend = overrides ? { ...DEFAULT_BACKEND, ...overrides } : { ...DEFAULT_BACKEND };
  // 換後端代表舊的 ctx／音樂元素已不再有效，重置模組狀態以利測試隔離。
  stopMusic();
  ctx = null;
  masterGain = null;
  sfxBuffers = new Map();
  loadedPacks = new Set();
  loadingPacks = new Map();
  voicePlaying = new Set();
  unlocked = false;
  initDone = false;
  assetVersionPromise = null;
  assetVersion = '';
  musicPlayingBeforeInterruption = false;
  interruptionResumePending = false;
}
