// audio-manager.test.js — 音訊管理模組的設定邏輯與「設定變更 → 呼叫後端」契約測試。
//
// jest 跑在 node 環境（無 jsdom），無法測試真的播放聲音；audio-manager.js 把
// AudioContext／<audio>／fetch 設計成可注入後端，這裡用 mock backend 驗證：
// 預設值、set 合併與持久化、廣播事件、開關與解鎖狀態的閘門、音量套用到後端物件、
// 損壞 localStorage 的容錯。
const { sandboxWithAudioManager } = require('./helpers');

function createMockBackend() {
  const audioContexts = [];
  const audios = [];

  function makeGain() {
    return { gain: { value: 1 }, connect: jest.fn() };
  }

  function makeBufferSource() {
    return { buffer: null, connect: jest.fn(), start: jest.fn(), onended: null };
  }

  function makeAudioContext() {
    const listeners = {};
    const c = {
      state: 'running',
      currentTime: 0,
      destination: {},
      resume: jest.fn(() => Promise.resolve()),
      createGain: jest.fn(() => makeGain()),
      createBufferSource: jest.fn(() => makeBufferSource()),
      decodeAudioData: jest.fn((arrayBuffer, resolve) => {
        resolve({ __decoded: true });
      }),
      addEventListener: jest.fn((type, fn) => {
        (listeners[type] = listeners[type] || []).push(fn);
      }),
      removeEventListener: jest.fn((type, fn) => {
        if (!listeners[type]) return;
        listeners[type] = listeners[type].filter((f) => f !== fn);
      }),
      // 測試用：模擬瀏覽器真的把 state 轉成 interrupted／suspended／running 並 fire statechange。
      _setState(newState) {
        c.state = newState;
        (listeners.statechange || []).slice().forEach((fn) => fn());
      }
    };
    audioContexts.push(c);
    return c;
  }

  function makeAudio() {
    const listeners = {};
    const el = {
      src: '',
      volume: 1,
      play: jest.fn(() => Promise.resolve()),
      pause: jest.fn(),
      addEventListener: jest.fn((type, fn) => {
        (listeners[type] = listeners[type] || []).push(fn);
      }),
      removeEventListener: jest.fn((type, fn) => {
        if (!listeners[type]) return;
        listeners[type] = listeners[type].filter((f) => f !== fn);
      }),
      duration: NaN,
      currentTime: 0
    };
    audios.push(el);
    return el;
  }

  function makeFetch(ok = true) {
    return jest.fn(() => Promise.resolve({
      ok,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
    }));
  }

  return {
    backend: {
      createAudioContext: jest.fn(makeAudioContext),
      createAudio: jest.fn(makeAudio),
      fetch: makeFetch(true)
    },
    audioContexts,
    audios
  };
}

function unlock(ctx, type = 'pointerdown') {
  ctx.document.dispatchEvent({ type });
}

let ctx;
let mock;

beforeEach(() => {
  ctx = sandboxWithAudioManager();
  mock = createMockBackend();
  ctx._setBackendForTest(mock.backend);
  ctx.initAudio(); // 掛上解鎖手勢監聽，讓 unlock() helper 能實際觸發解鎖
});

describe('AudioSettings.get 預設值', () => {
  test('沒有 localStorage 資料時回傳預設值', () => {
    expect(ctx.AudioSettings.get()).toEqual({
      sfxOn: true, sfxVolume: 0.8, musicOn: false, musicVolume: 0.5
    });
  });

  test('localStorage 損壞（非 JSON）時回預設值', () => {
    ctx.localStorage.setItem('audio-settings-v1', '{not valid json');
    expect(ctx.AudioSettings.get()).toEqual({
      sfxOn: true, sfxVolume: 0.8, musicOn: false, musicVolume: 0.5
    });
  });

  test('localStorage 是合法 JSON 但型別不對時回預設值', () => {
    ctx.localStorage.setItem('audio-settings-v1', '"just a string"');
    expect(ctx.AudioSettings.get()).toEqual({
      sfxOn: true, sfxVolume: 0.8, musicOn: false, musicVolume: 0.5
    });
  });

  test('sfxOn/musicOn 非 boolean 時逐欄位回預設值，其他合法欄位維持', () => {
    ctx.localStorage.setItem('audio-settings-v1', JSON.stringify({
      sfxOn: 'yes', sfxVolume: 0.4, musicOn: 1, musicVolume: 0.6
    }));
    expect(ctx.AudioSettings.get()).toEqual({
      sfxOn: true, sfxVolume: 0.4, musicOn: false, musicVolume: 0.6
    });
  });

  test.each([
    ['非數字字串', 'abc'],
    ['超出上限', 2.5],
    ['超出下限', -1],
    ['null', null]
  ])('sfxVolume 不合法（%s: %p）時該欄位回預設值 0.8，其他欄位維持', (_label, bad) => {
    ctx.localStorage.setItem('audio-settings-v1', JSON.stringify({
      sfxOn: false, sfxVolume: bad, musicOn: true, musicVolume: 0.3
    }));
    expect(ctx.AudioSettings.get()).toEqual({
      sfxOn: false, sfxVolume: 0.8, musicOn: true, musicVolume: 0.3
    });
  });

  test.each([
    ['非數字字串', 'abc'],
    ['超出上限', 2.5],
    ['超出下限', -1],
    ['null', null]
  ])('musicVolume 不合法（%s: %p）時該欄位回預設值 0.5，其他欄位維持', (_label, bad) => {
    ctx.localStorage.setItem('audio-settings-v1', JSON.stringify({
      sfxOn: false, sfxVolume: 0.3, musicOn: true, musicVolume: bad
    }));
    expect(ctx.AudioSettings.get()).toEqual({
      sfxOn: false, sfxVolume: 0.3, musicOn: true, musicVolume: 0.5
    });
  });

  test('sfxVolume 邊界值 0 與 1 皆為合法值（不誤判為 falsy 而回退預設）', () => {
    ctx.localStorage.setItem('audio-settings-v1', JSON.stringify({
      sfxOn: true, sfxVolume: 0, musicOn: false, musicVolume: 1
    }));
    expect(ctx.AudioSettings.get()).toEqual({
      sfxOn: true, sfxVolume: 0, musicOn: false, musicVolume: 1
    });
  });
});

describe('AudioSettings.set 合併與持久化', () => {
  test('淺合併：只改 sfxVolume 不動其他欄位', () => {
    ctx.AudioSettings.set({ sfxVolume: 0.3 });
    expect(ctx.AudioSettings.get()).toEqual({
      sfxOn: true, sfxVolume: 0.3, musicOn: false, musicVolume: 0.5
    });
  });

  test('寫入 localStorage，重新讀取（模擬重啟）仍取得新值', () => {
    ctx.AudioSettings.set({ musicOn: true, musicVolume: 0.2 });
    const raw = ctx.localStorage.getItem('audio-settings-v1');
    expect(JSON.parse(raw)).toEqual({
      sfxOn: true, sfxVolume: 0.8, musicOn: true, musicVolume: 0.2
    });
  });
});

describe('AudioSettings.set 廣播事件', () => {
  test('set 後廣播 audio-settings-changed CustomEvent，detail 帶最新設定', () => {
    const spy = jest.fn();
    ctx.document.addEventListener('audio-settings-changed', spy);
    ctx.AudioSettings.set({ sfxOn: false });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].detail).toEqual({
      sfxOn: false, sfxVolume: 0.8, musicOn: false, musicVolume: 0.5
    });
  });
});

describe('playSfx 閘門', () => {
  test('sfxOn=false 時 playSfx 不呼叫後端（不建立音源）', () => {
    unlock(ctx);
    const c = mock.audioContexts[0];
    ctx.AudioSettings.set({ sfxOn: false });
    ctx.playSfx('stone-place');
    expect(c.createBufferSource).not.toHaveBeenCalled();
  });

  test('未解鎖時 playSfx 直接丟棄，不建立 AudioContext', () => {
    ctx.playSfx('stone-place');
    expect(mock.backend.createAudioContext).not.toHaveBeenCalled();
  });

  test('未解鎖時 playSfx 也不會觸發圍棋合成 fallback', () => {
    const spy = jest.spyOn(ctx.GoSound, 'playSound');
    ctx.playSfx('stone-place');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('圍棋四音 fallback（sound.js 合成）', () => {
  test.each([
    ['stone-place', 'place'],
    ['stone-capture', 'capture'],
    ['pass', 'pass'],
    ['game-win', 'gameend'],
    ['game-lose', 'gameend'],
    ['game-draw', 'gameend']
  ])('未載入 %s 時 fallback 呼叫 GoSound.playSound(%s)', (name, expected) => {
    const spy = jest.spyOn(ctx.GoSound, 'playSound').mockImplementation(() => {});
    unlock(ctx);
    ctx.playSfx(name);
    expect(spy).toHaveBeenCalledWith(expected);
    spy.mockRestore();
  });

  test('非圍棋音效（沒有 fallback 映射）未載入時靜音，不丟例外', () => {
    const spy = jest.spyOn(ctx.GoSound, 'playSound').mockImplementation(() => {});
    unlock(ctx);
    expect(() => ctx.playSfx('wood-place')).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('loadSfxPack 與已載入音效優先於 fallback', () => {
  test('loadSfxPack 對每個檔案呼叫一次 fetch，並快取 decode 結果', async () => {
    await ctx.loadSfxPack('gomoku');
    expect(mock.backend.fetch).toHaveBeenCalledWith('/sounds/stone-place.mp3');
    mock.backend.fetch.mockClear();
    await ctx.loadSfxPack('gomoku'); // 第二次不重複 fetch（已載入）
    expect(mock.backend.fetch).not.toHaveBeenCalled();
  });

  test('已成功載入的音效播放時使用真實 buffer，不落入合成 fallback', async () => {
    const spy = jest.spyOn(ctx.GoSound, 'playSound').mockImplementation(() => {});
    unlock(ctx);
    await ctx.loadSfxPack('go');
    ctx.playSfx('stone-place');
    const c = mock.audioContexts[mock.audioContexts.length - 1];
    expect(c.createBufferSource).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('fetch 失敗（網路錯誤）時該檔靜默略過，不影響其他檔案', async () => {
    mock.backend.fetch = jest.fn(() => Promise.reject(new Error('network down')));
    await expect(ctx.loadSfxPack('go')).resolves.toBeUndefined();
  });

  test('fetch 回傳 ok:false 時該檔靜默略過', async () => {
    mock.backend.fetch = jest.fn(() => Promise.resolve({ ok: false }));
    await expect(ctx.loadSfxPack('go')).resolves.toBeUndefined();
  });

  test('首次因 ensureCtx 失敗（AudioContext 建立失敗）而中止時，不永久標記為已載入，之後呼叫會重試', async () => {
    let attempt = 0;
    const realCreateAudioContext = mock.backend.createAudioContext;
    ctx._setBackendForTest({
      ...mock.backend,
      createAudioContext: jest.fn((...args) => {
        attempt += 1;
        if (attempt === 1) throw new Error('AudioContext 建立失敗');
        return realCreateAudioContext(...args);
      })
    });

    await ctx.loadSfxPack('go');
    expect(mock.backend.fetch).not.toHaveBeenCalled(); // ensureCtx 失敗，根本沒進到 fetch

    await ctx.loadSfxPack('go'); // 重試：不該因為第一次「已標記為已載入」而被跳過
    expect(mock.backend.fetch).toHaveBeenCalled();
  });

  test('同一 pack 併發呼叫兩次，只跑一輪載入（in-flight 去重，不重複 fetch）', async () => {
    const p1 = ctx.loadSfxPack('go');
    const p2 = ctx.loadSfxPack('go');
    await Promise.all([p1, p2]);
    // go pack 三個檔案，各自只該被 fetch 一次（而非併發呼叫各跑一輪變六次）
    expect(mock.backend.fetch).toHaveBeenCalledTimes(3);
  });
});

describe('playVoice 節流', () => {
  test('同名語音播放中不重複觸發第二次呼叫', async () => {
    unlock(ctx);
    await ctx.loadSfxPack('xiangqi');
    const c = mock.audioContexts[mock.audioContexts.length - 1];
    ctx.playVoice('voice-xiangqi-check');
    ctx.playVoice('voice-xiangqi-check');
    expect(c.createBufferSource).toHaveBeenCalledTimes(1);
  });

  test('onended 觸發後允許再次播放同名語音', async () => {
    unlock(ctx);
    await ctx.loadSfxPack('xiangqi');
    const c = mock.audioContexts[mock.audioContexts.length - 1];
    ctx.playVoice('voice-xiangqi-check');
    const src = c.createBufferSource.mock.results[0].value;
    src.onended && src.onended();
    ctx.playVoice('voice-xiangqi-check');
    expect(c.createBufferSource).toHaveBeenCalledTimes(2);
  });
});

describe('音量套用到後端物件', () => {
  test('sfxVolume 變更即時套用到 masterGain.gain.value', () => {
    unlock(ctx); // 解鎖手勢會建立 AudioContext + masterGain
    const c = mock.audioContexts[0];
    const gain = c.createGain.mock.results[0].value;
    ctx.AudioSettings.set({ sfxVolume: 0.3 });
    expect(gain.gain.value).toBe(0.3);
  });

  test('musicVolume 變更即時套用到播放中的 <audio>.volume', () => {
    unlock(ctx); // 需先解鎖，set({musicOn:true}) 才會真的觸發 startMusic
    ctx.AudioSettings.set({ musicOn: true }); // 觸發 startMusic 建立 <audio>
    const el = mock.audios[mock.audios.length - 1];
    ctx.AudioSettings.set({ musicVolume: 0.3 });
    expect(el.volume).toBe(0.3);
  });
});

describe('musicOn 關閉即時停播', () => {
  test('set({ musicOn:false }) 呼叫已播放 <audio> 的 pause()', () => {
    unlock(ctx);
    ctx.AudioSettings.set({ musicOn: true });
    const el = mock.audios[mock.audios.length - 1];
    ctx.AudioSettings.set({ musicOn: false });
    expect(el.pause).toHaveBeenCalled();
  });
});

describe('startMusic / stopMusic', () => {
  test('musicOn=false 時 startMusic 為 no-op，不建立 <audio>', () => {
    ctx.startMusic();
    expect(mock.backend.createAudio).not.toHaveBeenCalled();
  });

  test('musicOn=true 時 startMusic 建立並播放 <audio>', () => {
    ctx.AudioSettings.set({ musicOn: true });
    ctx.stopMusic();
    mock.backend.createAudio.mockClear();
    ctx.startMusic();
    expect(mock.backend.createAudio).toHaveBeenCalled();
    const el = mock.audios[mock.audios.length - 1];
    expect(el.play).toHaveBeenCalled();
  });

  test('stopMusic 後所有 <audio> 皆 pause', () => {
    ctx.AudioSettings.set({ musicOn: true }); // 直接呼叫 startMusic 分支不吃 unlocked 限制
    ctx.startMusic();
    const el = mock.audios[mock.audios.length - 1];
    ctx.stopMusic();
    expect(el.pause).toHaveBeenCalled();
  });
});

describe('pagehide 監聽掛在 window 上', () => {
  test('window 發射 pagehide 時暫停播放中的音樂（比照分頁隱藏）', () => {
    unlock(ctx);
    ctx.AudioSettings.set({ musicOn: true });
    const el = mock.audios[mock.audios.length - 1];
    ctx.dispatchEvent({ type: 'pagehide' }); // window mock：pagehide 只在 window 上發射，不是 document
    expect(el.pause).toHaveBeenCalled();
  });

  test('document 發射 pagehide 不觸發任何行為（監聽器掛在 window，不是 document）', () => {
    unlock(ctx);
    ctx.AudioSettings.set({ musicOn: true });
    const el = mock.audios[mock.audios.length - 1];
    ctx.document.dispatchEvent({ type: 'pagehide' });
    expect(el.pause).not.toHaveBeenCalled();
  });
});

describe('initAudio 解鎖流程', () => {
  test('解鎖手勢觸發後 unlocked，playSfx 才會實際呼叫後端', async () => {
    // loadSfxPack 本身不需要解鎖手勢（decode 不受 autoplay 限制），但 playSfx 仍要卡在解鎖前。
    await ctx.loadSfxPack('go');
    ctx.playSfx('stone-place');
    const beforeCalls = mock.audioContexts.length ? mock.audioContexts[0].createBufferSource.mock.calls.length : 0;
    expect(beforeCalls).toBe(0); // 未解鎖前不會真的播放
    unlock(ctx);
    ctx.playSfx('stone-place');
    const c = mock.audioContexts[mock.audioContexts.length - 1];
    expect(c.createBufferSource).toHaveBeenCalled();
  });

  test('解鎖時若 musicOn 已開，自動 startMusic', () => {
    ctx.AudioSettings.set({ musicOn: true });
    ctx.stopMusic();
    mock.backend.createAudio.mockClear();
    ctx.initAudio();
    unlock(ctx);
    expect(mock.backend.createAudio).toHaveBeenCalled();
  });

  test('initAudio 是冪等的：重複呼叫不重複掛多組監聽', () => {
    ctx.initAudio();
    ctx.initAudio();
    unlock(ctx);
    const c1 = mock.audioContexts.length;
    unlock(ctx, 'keydown'); // 第二個解鎖手勢不該再觸發一次 ensureCtx 副作用
    expect(mock.audioContexts.length).toBe(c1);
  });
});

describe('AudioContext 中斷恢復（來電／Siri 搶走音訊焦點）', () => {
  test('已解鎖後 ctx state 轉為非 running，不會立刻呼叫 resume()——要等下一次使用者手勢', () => {
    unlock(ctx);
    const c = mock.audioContexts[0];
    c.resume.mockClear();
    c._setState('interrupted');
    c._setState('suspended');
    expect(c.resume).not.toHaveBeenCalled();
  });

  test('中斷後下一次手勢（touchstart）觸發 resume()', () => {
    unlock(ctx);
    const c = mock.audioContexts[0];
    c._setState('suspended');
    c.resume.mockClear();
    unlock(ctx, 'touchstart');
    expect(c.resume).toHaveBeenCalledTimes(1);
  });

  test('中斷後下一次手勢（keydown）也能觸發 resume()（三種手勢皆有效）', () => {
    unlock(ctx);
    const c = mock.audioContexts[0];
    c._setState('interrupted');
    c.resume.mockClear();
    unlock(ctx, 'keydown');
    expect(c.resume).toHaveBeenCalledTimes(1);
  });

  test('中斷前 BGM 在播，resume 手勢後 BGM 也一併恢復播放', async () => {
    unlock(ctx);
    ctx.AudioSettings.set({ musicOn: true }); // 已解鎖，觸發 startMusic 建立 <audio>
    const musicEl = mock.audios[mock.audios.length - 1];
    musicEl.play.mockClear();
    const c = mock.audioContexts[0];
    c._setState('interrupted');
    unlock(ctx, 'keydown');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(musicEl.play).toHaveBeenCalled();
  });

  test('中斷前 BGM 沒在播，resume 手勢後不會意外開始播放 BGM', async () => {
    unlock(ctx); // musicOn 預設 false，未播放
    const c = mock.audioContexts[0];
    mock.backend.createAudio.mockClear();
    c._setState('interrupted');
    unlock(ctx, 'touchstart');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(mock.backend.createAudio).not.toHaveBeenCalled();
  });

  test('尚未解鎖時 ctx state 變化不觸發中斷恢復流程（避免跟首次解鎖前的正常 suspended 狀態混淆）', () => {
    return ctx.loadSfxPack('go').then(() => {
      const c = mock.audioContexts[0];
      c._setState('suspended'); // 尚未解鎖，理應被忽略
      unlock(ctx); // 正常解鎖手勢：只有 handleUnlockGesture 自己的一次 resume() 呼叫
      expect(c.resume).toHaveBeenCalledTimes(1);
    });
  });
});

describe('BGM 錯誤處理（<audio> error 事件）', () => {
  function firstListener(el, type) {
    const call = el.addEventListener.mock.calls.find(([t]) => t === type);
    return call && call[1];
  }

  test('播放中的曲目觸發 error 時跳下一首，不重試同一首', () => {
    ctx.AudioSettings.set({ musicOn: true });
    ctx.startMusic();
    const firstEl = mock.audios[mock.audios.length - 1];
    mock.backend.createAudio.mockClear();

    const onError = firstListener(firstEl, 'error');
    onError();

    expect(mock.backend.createAudio).toHaveBeenCalledTimes(1);
    const nextEl = mock.audios[mock.audios.length - 1];
    expect(nextEl).not.toBe(firstEl);
    expect(nextEl.src).not.toBe(firstEl.src);
    expect(nextEl.play).toHaveBeenCalled();
  });

  test('連續兩首都錯誤時停止播放並靜默，不再嘗試第三次', () => {
    ctx.AudioSettings.set({ musicOn: true });
    ctx.startMusic();

    let el = mock.audios[mock.audios.length - 1];
    firstListener(el, 'error')();

    el = mock.audios[mock.audios.length - 1];
    mock.backend.createAudio.mockClear();
    firstListener(el, 'error')();

    expect(mock.backend.createAudio).not.toHaveBeenCalled(); // 沒有嘗試第三首
    expect(el.pause).toHaveBeenCalled();

    // 確認真的整個停止了（musicPlaying 重置），之後才能重新 start
    mock.backend.createAudio.mockClear();
    ctx.startMusic();
    expect(mock.backend.createAudio).toHaveBeenCalledTimes(1);
  });

  test('成功播放過（playing 事件）會歸零錯誤計數，之後單次錯誤不會被誤判成兩首都壞', () => {
    ctx.AudioSettings.set({ musicOn: true });
    ctx.startMusic();

    let el = mock.audios[mock.audios.length - 1];
    firstListener(el, 'error')(); // 第一次錯誤

    el = mock.audios[mock.audios.length - 1];
    firstListener(el, 'playing')(); // 這首成功播放，錯誤計數歸零

    mock.backend.createAudio.mockClear();
    firstListener(el, 'error')(); // 再錯一次，計數應為 1，還沒到門檻
    expect(mock.backend.createAudio).toHaveBeenCalledTimes(1); // 仍跳下一首而非直接停止
  });

  test('musicPlaying 為 false（已 stopMusic）時觸發殘留的 error 監聽不會有任何動作', () => {
    ctx.AudioSettings.set({ musicOn: true });
    ctx.startMusic();
    const el = mock.audios[mock.audios.length - 1];
    ctx.stopMusic();
    mock.backend.createAudio.mockClear();
    expect(() => firstListener(el, 'error')()).not.toThrow();
    expect(mock.backend.createAudio).not.toHaveBeenCalled();
  });
});
