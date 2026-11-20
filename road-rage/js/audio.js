// Tiny synthesized bus. Nothing loads; the context stays suspended until a gesture.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineFilter = null;
  let engineGain = null;
  let boostOsc = null;
  let boostGain = null;
  let unlocked = false;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.75;
      master.connect(ctx.destination);

      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();

      boostOsc = ctx.createOscillator();
      boostOsc.type = 'square';
      boostOsc.frequency.value = 92;
      boostGain = ctx.createGain();
      boostGain.gain.value = 0;
      boostOsc.connect(boostGain);
      boostGain.connect(master);
      boostOsc.start();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, gain, type) {
    const c = ac();
    if (!c || !unlocked) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, c.currentTime);
    g.gain.setValueAtTime(Math.max(0.0001, gain), c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  function noise(dur, gain, freq) {
    const c = ac();
    if (!c || !unlocked) return;
    const length = Math.max(1, (dur * c.sampleRate) | 0);
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const env = 1 - i / length;
      data[i] = (Math.random() * 2 - 1) * env * env;
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  return {
    unlock() {
      try {
        if (ac()) unlocked = true;
      } catch {
        unlocked = false;
      }
    },
    update(speed, boosting, active) {
      if (!ctx || !unlocked || !engineGain) return;
      const now = ctx.currentTime;
      const vol = active ? 0.04 : 0;
      engineGain.gain.setTargetAtTime(vol, now, 0.06);
      const freq = 42 + Math.abs(speed) * 3.1 + (boosting ? 36 : 0);
      engineOsc.frequency.setTargetAtTime(freq, now, 0.05);
      engineFilter.frequency.setTargetAtTime(boosting ? 980 : 340 + Math.abs(speed) * 7, now, 0.05);
      boostGain.gain.setTargetAtTime(active && boosting ? 0.018 : 0, now, 0.05);
    },
    takedown() {
      noise(0.28, 0.22, 420);
      tone(420, 0.12, 0.08, 'square');
      setTimeout(() => tone(680, 0.16, 0.07, 'square'), 90);
    },
    crash() {
      noise(0.55, 0.4, 180);
      tone(90, 0.4, 0.1, 'sawtooth');
    },
    bump() {
      noise(0.12, 0.16, 520);
    },
    wall() {
      noise(0.16, 0.2, 240);
    },
    ui() {
      tone(660, 0.07, 0.05, 'square');
    },
  };
}
