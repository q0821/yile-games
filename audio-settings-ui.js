// audio-settings-ui.js — 全域音訊設定面板（音效/音樂開關＋音量 slider）。
//
// `renderAudioControls(container)` 可在多處容器重覆呼叫（首頁設定 modal、六棋各自
// 設定區各嵌一份），全部讀寫同一份 AudioSettings；任一處變更會經 audio-manager 廣播
// 'audio-settings-changed'，這裡集中一個 document 監聽器逐一刷新所有已渲染實例，
// 讓多個畫面上的控制項保持同步，不必各自加監聽器造成重複訂閱。
import { AudioSettings } from './audio-manager.js';

// container -> refresh()。用 Map 而非「每次呼叫都加一個 document listener」：
// 各棋 mode 檔會在 initialized guard 內只呼叫一次，但仍以覆蓋語意寫成可重入安全。
const instances = new Map();
let globalListenerAttached = false;

function ensureGlobalListener() {
  if (globalListenerAttached) return;
  globalListenerAttached = true;
  document.addEventListener('audio-settings-changed', () => {
    instances.forEach((refresh, container) => {
      if (!container.isConnected) { instances.delete(container); return; }
      refresh();
    });
  });
}

function toPercent(v) {
  return Math.round((typeof v === 'number' && Number.isFinite(v) ? v : 0) * 100);
}

/** 可見文字 `<span>` 是 `<label class="toggle">` 的 sibling（不在其內），checkbox 本身沒有可自動
 *  關聯到的可見文字，故補 aria-label 給獨立的 accessible name（而非依賴 label 關聯）。 */
function buildToggleRow(labelText, ariaLabel) {
  const row = document.createElement('div');
  row.className = 'toggle-row';
  const label = document.createElement('span');
  label.textContent = labelText;
  const toggle = document.createElement('label');
  toggle.className = 'toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('aria-label', ariaLabel);
  const slider = document.createElement('span');
  slider.className = 'slider';
  toggle.appendChild(input);
  toggle.appendChild(slider);
  row.appendChild(label);
  row.appendChild(toggle);
  return { row, input };
}

function buildVolumeRow(labelText, ariaLabel) {
  const group = document.createElement('div');
  group.className = 'control-group audio-volume-group';
  const label = document.createElement('label');
  label.className = 'audio-volume-label';
  const labelSpan = document.createElement('span');
  labelSpan.textContent = labelText;
  const valueSpan = document.createElement('span');
  valueSpan.className = 'audio-volume-value';
  label.appendChild(labelSpan);
  label.appendChild(valueSpan);
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'review-slider';
  input.min = '0';
  input.max = '100';
  input.step = '5';
  input.setAttribute('aria-label', ariaLabel);
  group.appendChild(label);
  group.appendChild(input);
  return { group, input, valueSpan };
}

/**
 * 在指定容器渲染「音效開關＋音量」「音樂開關＋音量」控制項，讀寫全域 AudioSettings。
 * 容器內容會被清空重建；同一個容器重複呼叫是安全的（覆蓋舊的同步登記）。
 */
export function renderAudioControls(container) {
  if (!container) return;
  ensureGlobalListener();

  container.innerHTML = '';
  container.classList.add('audio-settings');

  const sfxToggle = buildToggleRow('音效', '音效開關');
  const sfxVolume = buildVolumeRow('音效音量', '音效音量');
  const musicToggle = buildToggleRow('背景音樂', '音樂開關');
  const musicVolume = buildVolumeRow('音樂音量', '音樂音量');

  container.appendChild(sfxToggle.row);
  container.appendChild(sfxVolume.group);
  container.appendChild(musicToggle.row);
  container.appendChild(musicVolume.group);

  function refresh() {
    const s = AudioSettings.get();
    sfxToggle.input.checked = s.sfxOn;
    sfxVolume.input.value = String(toPercent(s.sfxVolume));
    sfxVolume.input.disabled = !s.sfxOn;
    sfxVolume.valueSpan.textContent = `${toPercent(s.sfxVolume)}%`;
    musicToggle.input.checked = s.musicOn;
    musicVolume.input.value = String(toPercent(s.musicVolume));
    musicVolume.input.disabled = !s.musicOn;
    musicVolume.valueSpan.textContent = `${toPercent(s.musicVolume)}%`;
  }

  sfxToggle.input.addEventListener('change', () => {
    AudioSettings.set({ sfxOn: sfxToggle.input.checked });
  });
  sfxVolume.input.addEventListener('input', () => {
    AudioSettings.set({ sfxVolume: Number(sfxVolume.input.value) / 100 });
  });
  musicToggle.input.addEventListener('change', () => {
    AudioSettings.set({ musicOn: musicToggle.input.checked });
  });
  musicVolume.input.addEventListener('input', () => {
    AudioSettings.set({ musicVolume: Number(musicVolume.input.value) / 100 });
  });

  instances.set(container, refresh);
  refresh();
}

// ============================================================
// 快捷靜音鈕：首頁 header／六棋 mode-header 各一顆常駐按鈕（見 index.html
// `.audio-mute-btn`），點擊在「目前開關組合」與「全靜音」間切換：
//   全關 → 恢復記住的組合（沒記住過或記住的也是全關，就回退成 {sfxOn:true, musicOn:false}）
//   任一開 → 記住目前組合後兩者都關
// 多顆按鈕（首頁＋各棋種）共用同一份 AudioSettings，靠 audio-settings-changed 廣播互相同步。
// ============================================================
const MUTE_RESTORE_KEY = 'audio-mute-restore-v1';

const muteButtons = new Set();
let muteListenerAttached = false;

function isGloballyMuted(s) {
  return !s.sfxOn && !s.musicOn;
}

function readMuteRestore() {
  try {
    const raw = localStorage.getItem(MUTE_RESTORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return { sfxOn: !!parsed.sfxOn, musicOn: !!parsed.musicOn };
  } catch (_) {
    return null;
  }
}

function writeMuteRestore(combo) {
  try { localStorage.setItem(MUTE_RESTORE_KEY, JSON.stringify(combo)); } catch (_) { /* storage 滿或不可用時忽略 */ }
}

function syncMuteButton(btn, s) {
  const muted = isGloballyMuted(s);
  btn.classList.toggle('is-muted', muted);
  btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
}

function syncAllMuteButtons() {
  const s = AudioSettings.get();
  muteButtons.forEach((btn) => {
    if (!btn.isConnected) { muteButtons.delete(btn); return; }
    syncMuteButton(btn, s);
  });
}

function ensureMuteListener() {
  if (muteListenerAttached) return;
  muteListenerAttached = true;
  document.addEventListener('audio-settings-changed', syncAllMuteButtons);
}

function handleMuteClick() {
  const s = AudioSettings.get();
  if (isGloballyMuted(s)) {
    const restore = readMuteRestore();
    const combo = (restore && !isGloballyMuted(restore)) ? restore : { sfxOn: true, musicOn: false };
    AudioSettings.set({ sfxOn: combo.sfxOn, musicOn: combo.musicOn });
  } else {
    writeMuteRestore({ sfxOn: s.sfxOn, musicOn: s.musicOn });
    AudioSettings.set({ sfxOn: false, musicOn: false });
  }
}

/**
 * 掃描（預設整份 document）內所有 `.audio-mute-btn`，掛上點擊切換與跨實例同步。
 * 可重入呼叫安全：已掛過的按鈕會被略過，不會重複綁定 listener。
 */
export function initAudioMuteButtons(root) {
  ensureMuteListener();
  const scope = root || document;
  const buttons = scope.querySelectorAll('.audio-mute-btn');
  buttons.forEach((btn) => {
    if (muteButtons.has(btn)) return;
    muteButtons.add(btn);
    btn.addEventListener('click', handleMuteClick);
  });
  syncAllMuteButtons();
}
