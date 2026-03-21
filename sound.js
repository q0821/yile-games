let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

export function playSound(type) {
  try {
    const ac = getAudioCtx();
    const t = ac.currentTime;

    if (type === 'place') {
      const bufLen = ac.sampleRate * 0.06;
      const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.08));
      }
      const src = ac.createBufferSource();
      src.buffer = buf;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      bp.Q.value = 1.5;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      src.connect(bp);
      bp.connect(gain);
      gain.connect(ac.destination);
      src.start(t);
      src.stop(t + 0.08);

    } else if (type === 'capture') {
      for (let i = 0; i < 2; i++) {
        const bufLen = ac.sampleRate * 0.04;
        const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let j = 0; j < bufLen; j++) {
          data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufLen * 0.06));
        }
        const src = ac.createBufferSource();
        src.buffer = buf;
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1200 - i * 300;
        bp.Q.value = 1.0;
        const gain = ac.createGain();
        gain.gain.setValueAtTime(0.2, t + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.04);
        src.connect(bp);
        bp.connect(gain);
        gain.connect(ac.destination);
        src.start(t + i * 0.07);
        src.stop(t + i * 0.07 + 0.06);
      }

    } else if (type === 'pass') {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 440;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
      gain.gain.linearRampToValueAtTime(0, t + 0.08);
      gain.gain.linearRampToValueAtTime(0.06, t + 0.15);
      gain.gain.linearRampToValueAtTime(0, t + 0.22);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.25);

    } else if (type === 'gameend') {
      [523, 659].forEach((freq, i) => {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ac.createGain();
        gain.gain.setValueAtTime(0.15, t + i * 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.5);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(t + i * 0.2);
        osc.stop(t + i * 0.2 + 0.6);
      });
    }
  } catch (e) {
    console.warn('GoSound:', e);
  }
}

export const GoSound = { playSound };
