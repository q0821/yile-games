// shogi-mode.js — 將棋模式控制器（比照 xiangqi-mode，新增持駒/打入/升變/規則說明）。
//
// 自管狀態與事件，畫面顯隱由 main.js 路由統一管理。棋規用 shogi-game（ffish），
// AI 用 shogi-engine（共用 Fairy-Stockfish，變體 shogi）。兩個 WASM 延遲載入：
// 進模式先載 ffish 顯示盤面，引擎在第一手 AI 才載。
import * as Game from './shogi-game.js';
import * as Engine from './shogi-engine.js';
import * as Review from './shogi-review.js';
import * as Adaptive from './adaptive-chess.js';
import { resizeShogiCanvas, drawShogi } from './shogi-ui.js';
import { loadSfxPack, playSfx, playVoice } from './audio-manager.js';
import { renderAudioControls } from './audio-settings-ui.js';

const SETTINGS_KEY = 'shogi-settings-v1';

let initialized = false;
let wired = false;
let dom = {};
let deps = null;

// ——— 對局狀態 ———
let selected = null;       // 選取的盤上 square（移動用）
let selectedDrop = null;   // 選取的持駒駒字（打入用，大寫）
let legalTargets = null;   // 目的／落點 square 陣列
let lastMove = null;       // [from|null, to]
let checkRC = null;        // 被王手的王 {row,col}
let aiBusy = false;
let moving = false;
let gameOver = false;
let boardReady = false;
let promoResolve = null;   // 升變選擇 promise 的 resolver

// ——— 建議走法（AI 建議按鈕，教學用途，固定高強度）———
// 一般手：{ isDrop:false, from, to }（畫箭頭）；打入：{ isDrop:true, to, piece, sente }（目的地高亮＋持駒列對應駒高亮）
let hintMove = null;
let hintBusy = false;       // 建議請求進行中
let hintReq = null;         // 目前 in-flight 的 Engine.hint() 控制物件（{promise, cancel}）

// ——— 覆盤 ———
let reviewMode = false;
let reviewMoves = [];
let reviewFens = [];
let reviewPly = 0;
let reviewNodes = null;     // analyzeGame 結果（null = 尚未分析）
let reviewAnalyzing = false;

// ——— 設定 ———
let mode = 'pvc';          // 'pvc' | 'pvp'
let playerSente = true;    // pvc 時玩家是否執先手
let level = 2;             // 手動難度下拉 1=簡單 2=普通 3=困難
let autoMode = false;      // 自動調整難度（電腦連敗升級・連勝降級）
let autoLevel = Adaptive.DEFAULT_LEVEL; // 自動模式目前連續等級
let streak = 0;            // 連勝/連敗計數（>0 電腦連敗朝升級、<0 連勝朝降級）
let adaptiveApplied = false; // 本局是否已套用升降（避免同局重複）

const $ = (id) => document.getElementById(id);

function cacheDom() {
  dom = {
    screen: $('shogiScreen'), canvas: $('shogiBoard'), status: $('shogiStatus'),
    restart: $('shogiRestart'), undo: $('shogiUndo'), home: $('shogiHome'),
    mode: $('shogiMode'), color: $('shogiColor'), level: $('shogiLevel'),
    auto: $('shogiAuto'), autoLevelGroup: $('shogiAutoLevelGroup'),
    autoLevelLabel: $('shogiAutoLevel'), autoReset: $('shogiAutoReset'),
    settingsBtn: $('shogiSettingsBtn'), settingsModal: $('shogiSettingsModal'),
    thinking: $('shogiThinking'), checkBanner: $('shogiCheck'),
    handGote: $('shogiHandGote'), handSente: $('shogiHandSente'),
    endOverlay: $('shogiEnd'), endTitle: $('shogiEndTitle'), endSub: $('shogiEndSub'), endBtn: $('shogiEndBtn'),
    promo: $('shogiPromo'), promoYes: $('shogiPromoYes'), promoNo: $('shogiPromoNo'), hint: $('shogiHint'),
    rulesBtn: $('shogiRulesBtn'), rulesModal: $('shogiRulesModal'),
    reviewBtn: $('shogiReviewBtn'), controls: $('shogiControls'),
    review: $('shogiReview'), rvSlider: $('shogiReviewSlider'), rvInfo: $('shogiReviewInfo'),
    rvFirst: $('sgRvFirst'), rvPrev: $('sgRvPrev'), rvNext: $('sgRvNext'), rvLast: $('sgRvLast'),
    rvAnalyze: $('sgRvAnalyze'), rvExit: $('sgRvExit'), evalGraph: $('shogiEvalGraph'),
    audioSettings: $('shogiAudioSettings'),
    infobar: $('shogiInfobar'), turnBadge: $('shogiTurnBadge'), moveCount: $('shogiMoveCount'),
  };
  dom.settings = dom.screen?.querySelector('.gomoku-settings');
  dom.statusrow = dom.screen?.querySelector('.xiangqi-statusrow');
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s) {
      if (s.mode === 'pvp' || s.mode === 'pvc') mode = s.mode;
      if (typeof s.playerSente === 'boolean') playerSente = s.playerSente;
      if (s.level >= 1 && s.level <= 3) level = s.level;
      if (typeof s.autoMode === 'boolean') autoMode = s.autoMode;
      if (Number.isFinite(s.autoLevel)) autoLevel = Adaptive.clampLevel(s.autoLevel);
      if (Number.isFinite(s.streak)) streak = s.streak;
    }
  } catch { /* ignore */ }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, playerSente, level, autoMode, autoLevel, streak })); } catch { /* ignore */ }
}

function isActive() { return dom.screen && dom.screen.style.display !== 'none'; }
function isPlayerTurn() { return mode === 'pvp' || Game.turn() === playerSente; }

// ——— 渲染 ———

function view() {
  return {
    grid: Game.piecesGrid(),
    selected, legalTargets, lastMove, checkRC,
    hint: hintMove,
    rc: (sq) => Game.squareToRC(sq),
  };
}

function render() {
  if (!boardReady) return;
  const avail = (dom.screen?.clientWidth || window.innerWidth) - 24;
  const w = Math.min(avail, window.innerWidth - 32, 460);
  resizeShogiCanvas(deps, w);
  drawShogi(deps, view());
  renderHands();
}

function draw(extra) {
  if (!boardReady) return;
  drawShogi(deps, { ...view(), ...(extra || {}) });
}

function pixelCenterOf(sq) {
  const { row, col } = Game.squareToRC(sq);
  return { x: deps.padding + col * deps.cellSize + deps.cellSize / 2, y: deps.padding + row * deps.cellSize + deps.cellSize / 2 };
}

// ——— 持駒區（DOM）———

/** 某方是否可在此刻選持駒打入（必須是該方走、且 pvc 時為玩家）。 */
function canSelectHand(sideSente) {
  return boardReady && !gameOver && !aiBusy && !moving
    && Game.turn() === sideSente && isPlayerTurn();
}

function fillHand(container, handObj, sideSente, hintPiece) {
  if (!container) return;
  container.innerHTML = '';
  const selectable = canSelectHand(sideSente);
  let any = false;
  for (const p of Game.HAND_ORDER) {
    const n = handObj[p];
    if (!n) continue;
    any = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shogi-hand-piece' + (sideSente ? '' : ' gote')
      + (selectedDrop === p && Game.turn() === sideSente ? ' sel' : '')
      + (hintPiece === p ? ' hint' : '');
    btn.disabled = !selectable;
    const ch = document.createElement('span');
    ch.className = 'shogi-hand-char';
    ch.textContent = Game.handChar(p);
    btn.appendChild(ch);
    if (n > 1) {
      const badge = document.createElement('span');
      badge.className = 'shogi-hand-count';
      badge.textContent = String(n);
      btn.appendChild(badge);
    }
    btn.addEventListener('click', () => onHandPiece(p, sideSente));
    container.appendChild(btn);
  }
  if (!any) {
    const empty = document.createElement('span');
    empty.className = 'shogi-hand-empty';
    empty.textContent = '無持駒';
    container.appendChild(empty);
  }
}

function renderHands() {
  if (!boardReady) return;
  const h = Game.hands();
  const hintGote = (hintMove && hintMove.isDrop && !hintMove.sente) ? hintMove.piece : null;
  const hintSente = (hintMove && hintMove.isDrop && hintMove.sente) ? hintMove.piece : null;
  fillHand(dom.handGote, h.gote, false, hintGote);
  fillHand(dom.handSente, h.sente, true, hintSente);
}

function updateCheck() {
  if (!gameOver && Game.isCheck()) {
    const sq = Game.checkedSquares()[0];
    checkRC = sq ? Game.squareToRC(sq) : null;
  } else {
    checkRC = null;
  }
}

function showThinking(b) { if (dom.thinking) dom.thinking.style.display = b ? 'inline-flex' : 'none'; }

function flashCheck() {
  playVoice('voice-shogi-check');
  if (!dom.checkBanner) return;
  dom.checkBanner.classList.remove('show');
  void dom.checkBanner.offsetWidth;
  dom.checkBanner.classList.add('show');
}

function showEnd() {
  if (!dom.endOverlay) return;
  const r = Game.result();
  const title = r === '1-0' ? '先手勝' : r === '0-1' ? '後手勝' : '和局';
  let sub = '';
  if (mode === 'pvc' && r !== '1/2-1/2') sub = ((r === '1-0') === playerSente) ? '你贏了！' : '電腦獲勝';
  const adaptMsg = maybeApplyAdaptive(r);   // 自動難度升降（每局僅一次）
  if (adaptMsg) sub = sub ? `${sub}　${adaptMsg}` : adaptMsg;
  if (dom.endTitle) dom.endTitle.textContent = title;
  if (dom.endSub) dom.endSub.textContent = sub;
  dom.endOverlay.style.display = 'flex';
}
function hideEnd() { if (dom.endOverlay) dom.endOverlay.style.display = 'none'; }

/** PvP 一律播「勝」音；PvC 依人類是否為贏家算 win/lose；和局播 draw。 */
function playEndSound(r) {
  if (mode !== 'pvc') { playSfx('game-win'); return; }
  if (r === '1/2-1/2') { playSfx('game-draw'); return; }
  playSfx(((r === '1-0') === playerSente) ? 'game-win' : 'game-lose');
}

/** 局面剛結束（gameOver 由 false→true 那一刻）才呼叫一次：終局音效＋將死語音，再顯示結束卡片。
 *  和 showEnd() 分開，避免覆盤結束後 exitReview() 重顯結束卡片時重播音效/語音。 */
function onGameOver() {
  const r = Game.result();
  playEndSound(r);
  // 王手詰み語音：僅在真正被詰み（終局時仍處於被王手狀態）才播；和局／無合法手但未被王手不播。
  if (r !== '1/2-1/2' && Game.isCheck()) playVoice('voice-shogi-mate');
  showEnd();
}

// ——— 自動難度（連勝連敗階梯，見 adaptive-chess.js）———

/** pvc + 自動模式時，依本局結果升降等級；回傳升降提示字（無變動回空字）。每局僅套用一次。 */
function maybeApplyAdaptive(r) {
  if (mode !== 'pvc' || !autoMode || adaptiveApplied || !r) return '';
  adaptiveApplied = true;
  const outcome = r === '1/2-1/2' ? 'draw' : ((r === '1-0') === playerSente ? 'ai-lost' : 'ai-won');
  const res = Adaptive.nextLevel(autoLevel, streak, outcome);
  autoLevel = res.level; streak = res.streak;
  saveSettings();
  updateAutoLevelDisplay();
  if (res.change === 'up') return `電腦升級 → ${Adaptive.levelLabel(autoLevel)}`;
  if (res.change === 'down') return `電腦降級 → ${Adaptive.levelLabel(autoLevel)}`;
  return '';
}

function updateAutoLevelDisplay() {
  if (dom.autoLevelLabel) dom.autoLevelLabel.textContent = Adaptive.levelLabel(autoLevel);
}

function resetAutoLevel() {
  autoLevel = Adaptive.DEFAULT_LEVEL;
  streak = 0;
  saveSettings();
  updateAutoLevelDisplay();
}

/** 實際送進引擎的難度等級：自動模式用浮動等級，否則手動下拉映射到固定等級。 */
function effectiveLevel() {
  return autoMode ? autoLevel : (Adaptive.MANUAL_TO_LEVEL[level] ?? Adaptive.DEFAULT_LEVEL);
}

function updateUndoBtn() {
  if (!dom.undo) return;
  dom.undo.disabled = !boardReady || aiBusy || moving || gameOver || Game.gamePly() === 0;
}

/** 更新「建議走法」按鈕可用狀態：AI 思考中／覆盤分析中／覆盤模式中／升變對話框開啟中／終局後皆不可按。 */
function updateHintBtn() {
  if (!dom.hint) return;
  dom.hint.disabled = !boardReady || hintBusy || aiBusy || reviewAnalyzing || reviewMode || !!promoResolve || gameOver;
}

/** 更新「覆盤」按鈕可用狀態：常駐於功能列，終局前 disabled（title 已註明「終局後可用」）。 */
function updateReviewBtn() {
  if (!dom.reviewBtn) return;
  dom.reviewBtn.disabled = !boardReady || !gameOver;
}

/** 資訊列：回合徽章 + 手數（PRD §7：持駒維持既有獨立駒台列，不塞進資訊列）。 */
function updateInfobar() {
  if (!boardReady || !dom.turnBadge) return;
  const sente = Game.turn();
  dom.turnBadge.textContent = sente ? '先手' : '後手';
  dom.turnBadge.className = 'turn-badge ' + (sente ? 'black' : 'white');
  if (dom.moveCount) dom.moveCount.textContent = String(Game.gamePly());
}

/** 清除目前顯示的建議走法（箭頭／打入高亮＋持駒列高亮），並取消尚在等待中的建議請求
 *  （引擎仍會跑完，但結果會被丟棄）。 */
function clearHint() {
  if (hintReq) { hintReq.cancel(); hintReq = null; }
  if (hintMove) { hintMove = null; renderHands(); }
}

/** 按下「建議走法」：固定 movetime、引擎全力（不吃 adaptive 難度削弱），教學用途。
 *  打入手（如 P@5e）沒有起點，改標記目的地＋持駒列對應駒（見 shogi-ui.js／renderHands）。 */
async function requestHint() {
  if (!dom.hint || dom.hint.disabled) return;
  clearHint();
  hintBusy = true;
  updateHintBtn();
  showThinking(true);
  const fenAtRequest = Game.fen();
  const sideAtRequest = Game.turn();
  const req = Engine.hint({ fen: fenAtRequest, movetime: 1500 });
  hintReq = req;
  try {
    const result = await req.promise;
    hintReq = null;
    hintBusy = false;
    showThinking(false);
    updateHintBtn();
    if (!isActive() || Game.fen() !== fenAtRequest) return; // 局面已變，丟棄不畫
    if (result) {
      hintMove = result.isDrop
        ? { isDrop: true, to: result.to, piece: result.move.charAt(0), sente: sideAtRequest }
        : { isDrop: false, from: result.from, to: result.to };
      draw();
      renderHands();
    }
  } catch (err) {
    hintReq = null;
    hintBusy = false;
    showThinking(false);
    updateHintBtn();
    if (err?.cancelled) return; // 使用者取消／局面已變導致的取消，靜默
    console.error('hint error:', err);
    setStatus('建議走法失敗，請稍候再試');
  }
}

function undoMove() {
  if (aiBusy || moving || !boardReady || Game.gamePly() === 0) return;
  clearHint();
  Game.undo();
  if (mode === 'pvc' && Game.gamePly() > 0 && Game.turn() !== playerSente) Game.undo();
  gameOver = false;
  hideEnd();
  clearSelection();
  const lm = Game.lastMoveUci();
  lastMove = lm ? endpointsArr(lm) : null;
  updateCheck();
  setStatus();
  render();
  if (mode === 'pvc' && !gameOver && Game.turn() !== playerSente) maybeAiMove();
}

function endpointsArr(uci) { const e = Game.moveEndpoints(uci); return [e.from, e.to]; }

function setStatus(msg) {
  updateUndoBtn();
  updateHintBtn();
  updateReviewBtn();
  updateInfobar();
  if (!dom.status) return;
  if (msg) { dom.status.textContent = msg; return; }
  if (gameOver) {
    const r = Game.result();
    dom.status.textContent = r === '1-0' ? '先手勝！' : r === '0-1' ? '後手勝！' : '和局';
    return;
  }
  const who = Game.turn() ? '先手' : '後手';
  dom.status.textContent = Game.isCheck() ? `${who}回合 — 王手！` : `${who}回合`;
}

// ——— 對局邏輯 ———

function clearSelection() { selected = null; selectedDrop = null; legalTargets = null; }

const MOVE_ANIM_MS = 280;

/** 盤上移動的滑動動畫（打入不走此路徑）。 */
function animateMove(fromSq, toSq) {
  return new Promise((resolve) => {
    const fromRC = Game.squareToRC(fromSq);
    const grid = Game.piecesGrid();
    const piece = grid[fromRC.row] && grid[fromRC.row][fromRC.col];
    if (!piece) { resolve(); return; }
    const p0 = pixelCenterOf(fromSq), p1 = pixelCenterOf(toSq);
    let start = null, done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const step = (ts) => {
      if (done) return;
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / MOVE_ANIM_MS);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      drawShogi(deps, {
        grid, selected: null, legalTargets: null, lastMove: null, checkRC: null,
        rc: (sq) => Game.squareToRC(sq),
        anim: { hideRow: fromRC.row, hideCol: fromRC.col, piece, x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e },
      });
      if (t < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
    setTimeout(finish, MOVE_ANIM_MS + 400);  // 分頁背景 rAF 暫停的保險
  });
}

async function doMove(uci) {
  const parts = Game.splitMove(uci);
  // 落子前先看目的格是否已有子：吃子 vs 落子音效判斷（打入規則上只能落空格，天然不算吃子）。
  const toRC = Game.squareToRC(parts.to);
  const preGrid = Game.piecesGrid();
  const captured = !!(preGrid[toRC.row] && preGrid[toRC.row][toRC.col]);
  moving = true;
  clearSelection();
  clearHint();
  draw();
  if (!parts.drop) await animateMove(parts.from, parts.to);
  const ok = Game.move(uci);
  moving = false;
  if (!ok) { render(); return false; }
  lastMove = endpointsArr(uci);
  playSfx(captured ? 'shogi-capture' : 'shogi-place');
  gameOver = Game.isGameOver();
  updateCheck();
  setStatus();
  render();
  if (gameOver) onGameOver();
  else if (Game.isCheck()) flashCheck();
  return true;
}

/** 顯示「成る／不成」選擇，回傳是否升變。 */
function askPromotion() {
  return new Promise((resolve) => {
    promoResolve = resolve;
    if (dom.promo) dom.promo.style.display = 'flex';
    updateHintBtn();
  });
}
function resolvePromotion(yes) {
  if (dom.promo) dom.promo.style.display = 'none';
  const r = promoResolve; promoResolve = null;
  updateHintBtn();
  if (r) r(yes);
}

async function tryBoardMove(from, to) {
  const ps = Game.promotionState(from, to);
  let uci;
  if (ps.must) uci = from + to + '+';
  else if (ps.can) uci = from + to + (await askPromotion() ? '+' : '');
  else uci = from + to;
  if (!isActive()) return;
  await doMove(uci);
  maybeAiMove();
}

async function onPoint(row, col) {
  if (reviewMode || gameOver || aiBusy || moving || !boardReady) return;
  if (mode === 'pvc' && !isPlayerTurn()) return;
  if (promoResolve) return;  // 升變選擇進行中，先別接受盤面點擊
  const sq = Game.rcToSquare(row, col);
  // 打入：已選持駒 + 點到合法落點
  if (selectedDrop) {
    if (legalTargets && legalTargets.includes(sq)) { await doMove(selectedDrop + '@' + sq); maybeAiMove(); return; }
    clearSelection(); render(); return;
  }
  // 移動：已選盤上駒 + 點到合法目的
  if (selected && legalTargets && legalTargets.includes(sq)) { await tryBoardMove(selected, sq); return; }
  // 否則嘗試選取盤上駒
  const targets = Game.legalTargetsFrom(sq);
  if (targets.length) { selected = sq; selectedDrop = null; legalTargets = targets; }
  else { clearSelection(); }
  render();
}

function onHandPiece(pieceUpper, sideSente) {
  if (!canSelectHand(sideSente) || promoResolve) return;
  if (selectedDrop === pieceUpper) { clearSelection(); render(); return; }
  selected = null;
  selectedDrop = pieceUpper;
  legalTargets = Game.legalDropTargets(pieceUpper);
  render();
}

function maybeAiMove() {
  if (mode !== 'pvc' || gameOver || isPlayerTurn()) return;
  aiBusy = true;
  showThinking(true);
  setStatus('電腦思考中…');
  renderHands();   // 反映持駒禁用態
  const minDelay = 1100 + Math.floor(Math.random() * 1400);
  const t0 = performance.now();
  (async () => {
    try {
      const mv = await Engine.bestMove({ fen: Game.fen(), level: effectiveLevel() });
      const rest = minDelay - (performance.now() - t0);
      if (rest > 0) await new Promise((r) => setTimeout(r, rest));
      showThinking(false);
      aiBusy = false;
      if (!isActive() || gameOver) return;
      if (mv) await doMove(mv);
      else { gameOver = true; setStatus(); onGameOver(); }
    } catch (err) {
      showThinking(false);
      aiBusy = false;
      setStatus('AI 出錯：' + (err?.message || err) + '（請重新開始）');
      Engine.reset();
    }
  })();
}

async function newGame() {
  if (reviewMode) setReviewUI(false);
  reviewNodes = null;
  adaptiveApplied = false;
  clearHint();
  hintBusy = false;
  hideEnd();
  resolvePromotion(false);
  showThinking(false);
  setStatus('載入棋盤中…');
  await Game.ensureReady();
  await Game.newGame();
  boardReady = true;
  clearSelection();
  lastMove = null;
  checkRC = null;
  aiBusy = false;
  moving = false;
  gameOver = false;
  setStatus();
  render();
  maybeAiMove(); // pvc 玩家執後手時，先手（AI）先走
}

// ——— 覆盤 ———
// 與象棋覆盤同法（見 xiangqi-mode）；先手視角分用 p1Cp。將棋持駒須逐 ply 重建才正確，
// 覆盤期間隱藏持駒區（盤面位置仍精準），與西洋棋（無持駒）對稱。盤上不畫 PV 箭頭
// （打入無起點難以箭頭表示），最佳手以文字呈現。

function setReviewUI(on) {
  reviewMode = on;
  if (dom.infobar) dom.infobar.style.display = on ? 'none' : '';
  if (dom.settings) dom.settings.style.display = on ? 'none' : '';
  if (dom.statusrow) dom.statusrow.style.display = on ? 'none' : '';
  if (dom.controls) dom.controls.style.display = on ? 'none' : '';
  if (dom.handGote) dom.handGote.style.display = on ? 'none' : '';
  if (dom.handSente) dom.handSente.style.display = on ? 'none' : '';
  if (dom.review) dom.review.style.display = on ? 'flex' : 'none';
  updateHintBtn();
}

async function enterReview() {
  await Game.ensureReady();
  reviewMoves = Game.moveStackList();
  if (!reviewMoves.length) return;
  reviewFens = Game.fensForMoves(reviewMoves);
  reviewNodes = null;
  hideEnd();
  if (dom.evalGraph) dom.evalGraph.style.display = 'none';
  if (dom.rvSlider) dom.rvSlider.max = String(reviewMoves.length);
  setReviewUI(true);
  reviewGoTo(reviewMoves.length);
}

function exitReview() {
  setReviewUI(false);
  render();                 // 回到實際對局（結束）局面
  if (gameOver) showEnd();
}

function reviewGoTo(ply) {
  reviewPly = Math.max(0, Math.min(reviewMoves.length, ply | 0));
  if (dom.rvSlider) dom.rvSlider.value = String(reviewPly);
  renderReview();
  updateReviewInfo();
  if (reviewNodes) drawEvalGraph();
}

function renderReview() {
  const avail = (dom.screen?.clientWidth || window.innerWidth) - 24;
  const w = Math.min(avail, window.innerWidth - 32, 460);
  resizeShogiCanvas(deps, w);
  const grid = Game.gridFromFen(reviewFens[reviewPly]);
  const last = reviewPly > 0 ? Game.moveEndpoints(reviewMoves[reviewPly - 1]) : null;
  drawShogi(deps, {
    grid, selected: null, legalTargets: null, checkRC: null,
    lastMove: last ? [last.from, last.to] : null,
    rc: (sq) => Game.squareToRC(sq),
  });
}

/** 優勢曲線：每手先手視角評估分，先手優正、後手優負；標目前手。 */
function drawEvalGraph() {
  const cv = dom.evalGraph;
  if (!cv || !reviewNodes) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, pad = 5, mid = H / 2, CLAMP = 800;
  const N = reviewMoves.length;
  const xOf = (k) => pad + (N ? k / N : 0) * (W - 2 * pad);
  const yOf = (cp) => mid - (Math.max(-CLAMP, Math.min(CLAMP, cp)) / CLAMP) * (H / 2 - pad);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(192,57,43,0.10)'; ctx.fillRect(0, 0, W, mid);       // 上半=先手優
  ctx.fillStyle = 'rgba(44,36,23,0.12)'; ctx.fillRect(0, mid, W, H - mid);  // 下半=後手優
  ctx.strokeStyle = 'rgba(91,68,35,0.45)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
  ctx.strokeStyle = '#7a5a18'; ctx.lineWidth = 1.8; ctx.beginPath();
  reviewNodes.forEach((n, k) => { const x = xOf(k), y = yOf(n.p1Cp); k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.stroke();
  const cx = xOf(reviewPly);
  ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
  ctx.fillStyle = '#c0392b';
  ctx.beginPath(); ctx.arc(cx, yOf(reviewNodes[reviewPly].p1Cp), 3.5, 0, Math.PI * 2); ctx.fill();
}

function onGraphClick(e) {
  if (!reviewNodes) return;
  const r = dom.evalGraph.getBoundingClientRect();
  const frac = r.width > 0 ? (e.clientX - r.left) / r.width : 0;
  reviewGoTo(Math.round(Math.max(0, Math.min(1, frac)) * reviewMoves.length));
}

/** 先手視角評估分（centipawn）→ 友善文字。 */
function fmtEval(p1Cp) {
  if (p1Cp >= 20000) return '先手勝勢';
  if (p1Cp <= -20000) return '後手勝勢';
  const v = p1Cp / 100;
  if (Math.abs(v) < 0.2) return '均勢';
  return (v > 0 ? '先手優 +' : '後手優 +') + Math.abs(v).toFixed(1);
}

/** UCI 著法 → 顯示字串（打入用「駒打落點」，盤上用「起→終」）。 */
function sqArrow(uci) {
  const m = Game.splitMove(uci);
  if (m.drop) return `${Game.handChar(m.piece)}打${m.to}`;
  return `${m.from}→${m.to}${m.promo ? '+' : ''}`;
}

function updateReviewInfo() {
  const el = dom.rvInfo;
  if (!el) return;
  el.textContent = '';
  const N = reviewMoves.length;
  const l1 = document.createElement('div');
  l1.append('第 ');
  const b = document.createElement('b'); b.textContent = String(reviewPly); l1.append(b);
  l1.append(` / ${N} 手`);
  if (reviewPly > 0) {
    const mover = (reviewPly % 2 === 1) ? '先手' : '後手'; // 第 ply 手：ply1=先手
    l1.append(`　${mover} ${sqArrow(reviewMoves[reviewPly - 1])}`);
  }
  el.append(l1);
  if (reviewNodes) {
    const l2 = document.createElement('div');
    l2.textContent = '局面評估：' + fmtEval(reviewNodes[reviewPly].p1Cp);
    el.append(l2);
    if (reviewPly > 0) {
      const m = reviewNodes[reviewPly - 1]; // 描述「這手」的損失
      const l3 = document.createElement('div');
      l3.append('這手 ');
      const span = document.createElement('span');
      span.className = 'xq-cls ' + m.cls.key; // key 為內部常數，非外部輸入
      span.textContent = m.cls.label;
      l3.append(span);
      if (m.loss >= 30) l3.append(`（丟約 ${(m.loss / 100).toFixed(1)} 分）`);
      if (m.bestmove) l3.append('・最佳 ' + sqArrow(m.bestmove));
      el.append(l3);
    }
  } else {
    const hint = document.createElement('div');
    hint.style.color = 'var(--text-muted)';
    hint.textContent = '按「分析本局」評估每手好壞';
    el.append(hint);
  }
}

async function analyzeReview() {
  if (reviewAnalyzing || !reviewMoves.length) return;
  reviewAnalyzing = true;
  updateHintBtn();
  if (dom.rvAnalyze) dom.rvAnalyze.disabled = true;
  try {
    reviewNodes = await Review.analyzeGame(reviewMoves, {
      movetimeMs: 400,
      onProgress: (k, n) => { if (dom.rvInfo) dom.rvInfo.textContent = `分析中… ${k}/${n}`; },
    });
    if (dom.evalGraph) dom.evalGraph.style.display = 'block';
    drawEvalGraph();
    renderReview();
    updateReviewInfo();
  } catch (err) {
    if (dom.rvInfo) dom.rvInfo.textContent = 'AI 分析失敗：' + (err?.message || err);
    Engine.reset();
  } finally {
    reviewAnalyzing = false;
    updateHintBtn();
    if (dom.rvAnalyze) dom.rvAnalyze.disabled = false;
  }
}

// ——— 設定 UI ———

function applySettingsToControls() {
  if (dom.mode) dom.mode.value = mode;
  if (dom.color) dom.color.value = playerSente ? 'sente' : 'gote';
  if (dom.level) dom.level.value = String(level);
  if (dom.auto) dom.auto.value = autoMode ? 'on' : 'off';
  const pvc = mode === 'pvc';
  dom.color?.closest('.control-group')?.style.setProperty('display', pvc ? '' : 'none');
  dom.level?.closest('.control-group')?.style.setProperty('display', (pvc && !autoMode) ? '' : 'none'); // 自動時隱藏手動難度
  dom.auto?.closest('.control-group')?.style.setProperty('display', pvc ? '' : 'none');
  dom.autoLevelGroup?.style.setProperty('display', (pvc && autoMode) ? '' : 'none');
  updateAutoLevelDisplay();
}

// ——— 設定彈窗 ———
function openSettings() { applySettingsToControls(); dom.settingsModal?.classList.add('show'); }
function closeSettings() { dom.settingsModal?.classList.remove('show'); }

// ——— 規則說明 ———

function openRules() { dom.rulesModal?.classList.add('show'); }
function closeRules() { dom.rulesModal?.classList.remove('show'); }

// ——— 事件 ———

function pointFromEvent(e) {
  const rect = dom.canvas.getBoundingClientRect();
  const pt = e.changedTouches?.[0] || e.touches?.[0] || e;
  const mx = pt.clientX - rect.left;
  const my = pt.clientY - rect.top;
  const col = Math.floor((mx - deps.padding) / deps.cellSize);
  const row = Math.floor((my - deps.padding) / deps.cellSize);
  if (col < 0 || col >= Game.COLUMNS || row < 0 || row >= Game.ROWS) return null;
  return { row, col };
}

function wireEvents() {
  if (wired) return;
  wired = true;
  let lastTouchAt = 0;
  dom.canvas.addEventListener('click', (e) => {
    if (Date.now() - lastTouchAt < 500) return;
    const p = pointFromEvent(e); if (p) onPoint(p.row, p.col);
  });
  dom.canvas.addEventListener('touchend', (e) => {
    lastTouchAt = Date.now(); e.preventDefault();
    const p = pointFromEvent(e); if (p) onPoint(p.row, p.col);
  }, { passive: false });

  dom.restart?.addEventListener('click', () => newGame());
  dom.undo?.addEventListener('click', () => undoMove());
  dom.hint?.addEventListener('click', () => requestHint());
  dom.endBtn?.addEventListener('click', () => newGame());
  dom.home?.addEventListener('click', () => { location.hash = '#home'; });
  dom.promoYes?.addEventListener('click', () => resolvePromotion(true));
  dom.promoNo?.addEventListener('click', () => resolvePromotion(false));
  dom.rulesBtn?.addEventListener('click', () => openRules());
  dom.rulesModal?.addEventListener('click', (e) => { if (e.target === dom.rulesModal) closeRules(); });
  dom.rulesModal?.querySelector('[data-close-rules]')?.addEventListener('click', () => closeRules());
  // 覆盤
  dom.reviewBtn?.addEventListener('click', () => enterReview());
  dom.rvExit?.addEventListener('click', () => exitReview());
  dom.rvFirst?.addEventListener('click', () => reviewGoTo(0));
  dom.rvPrev?.addEventListener('click', () => reviewGoTo(reviewPly - 1));
  dom.rvNext?.addEventListener('click', () => reviewGoTo(reviewPly + 1));
  dom.rvLast?.addEventListener('click', () => reviewGoTo(reviewMoves.length));
  dom.rvSlider?.addEventListener('input', () => reviewGoTo(Number(dom.rvSlider.value)));
  dom.rvAnalyze?.addEventListener('click', () => analyzeReview());
  dom.evalGraph?.addEventListener('click', onGraphClick);
  dom.mode?.addEventListener('change', () => { mode = dom.mode.value === 'pvp' ? 'pvp' : 'pvc'; saveSettings(); applySettingsToControls(); newGame(); });
  dom.color?.addEventListener('change', () => { playerSente = dom.color.value !== 'gote'; saveSettings(); newGame(); });
  dom.level?.addEventListener('change', () => { level = Math.min(3, Math.max(1, Number(dom.level.value) || 2)); saveSettings(); });
  dom.auto?.addEventListener('change', () => { autoMode = dom.auto.value === 'on'; saveSettings(); applySettingsToControls(); });
  dom.autoReset?.addEventListener('click', () => resetAutoLevel());
  dom.settingsBtn?.addEventListener('click', () => openSettings());
  dom.settingsModal?.addEventListener('click', (e) => { if (e.target === dom.settingsModal) closeSettings(); });
  dom.settingsModal?.querySelector('[data-close-settings]')?.addEventListener('click', () => closeSettings());
  window.addEventListener('resize', () => { if (isActive()) (reviewMode ? renderReview() : render()); });
}

// ——— 進入 ———

export async function enterShogiMode() {
  if (!initialized) {
    cacheDom();
    loadSettings();
    deps = { canvas: dom.canvas, ctx: dom.canvas.getContext('2d'), padding: 12, cellSize: 32 };
    applySettingsToControls();
    wireEvents();
    renderAudioControls(dom.audioSettings);
    initialized = true;
  }
  loadSfxPack('shogi');
  loadSfxPack('common');
  if (!boardReady) await newGame();
  else render();
}

export const ShogiMode = { enterShogiMode };
