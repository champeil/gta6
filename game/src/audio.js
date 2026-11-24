// Sound, synthesised in the browser: no audio files, no network, just oscillators and noise shaped
// per event. The context is created on the first user gesture, so a page that has not been touched
// stays silent (as browsers demand). `toggle` mutes everything and remembers it for the session.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);

    // One second of white noise, reused by every percussive sound.
    const frames = Math.floor(ctx.sampleRate);
    noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function tone(freq, dur, type, gain, slideTo) {
    if (muted || !ensure()) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type ?? 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    amp.gain.setValueAtTime(0.0001, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(gain ?? 0.2, ctx.currentTime + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(amp);
    amp.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  function noise(dur, gain, filterHz, sweepTo) {
    if (muted || !ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterHz ?? 1800, ctx.currentTime);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), ctx.currentTime + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain ?? 0.25, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
  }

  const sfx = {
    click() {
      tone(520, 0.06, 'square', 0.05, 380);
    },
    door() {
      noise(0.09, 0.14, 900, 300);
      tone(180, 0.1, 'sine', 0.08, 120);
    },
    hurt() {
      tone(160, 0.16, 'sawtooth', 0.16, 90);
      noise(0.12, 0.1, 700);
    },
    punch() {
      noise(0.06, 0.16, 1400, 500);
    },
    shot(kind) {
      if (kind === 'shotgun') {
        noise(0.2, 0.4, 2600, 260);
        tone(90, 0.2, 'square', 0.14, 50);
      } else if (kind === 'smg') {
        noise(0.06, 0.2, 3200, 900);
        tone(240, 0.05, 'square', 0.09, 160);
      } else {
        noise(0.1, 0.26, 2400, 600);
        tone(190, 0.08, 'square', 0.1, 110);
      }
    },
    crash() {
      noise(0.28, 0.3, 1400, 200);
      tone(70, 0.24, 'sine', 0.12, 42);
    },
    boom() {
      noise(0.62, 0.44, 900, 90);
      tone(56, 0.6, 'sine', 0.24, 30);
    },
    cash() {
      tone(880, 0.09, 'triangle', 0.13);
      setTimeout(() => tone(1320, 0.12, 'triangle', 0.11), 70);
    },
    pickup() {
      tone(660, 0.08, 'triangle', 0.12);
      setTimeout(() => tone(990, 0.1, 'triangle', 0.1), 60);
    },
    fail() {
      tone(330, 0.2, 'sawtooth', 0.13, 240);
      setTimeout(() => tone(220, 0.34, 'sawtooth', 0.12, 130), 170);
    },
    siren() {
      tone(720, 0.3, 'square', 0.06, 540);
    },
    step() {
      noise(0.04, 0.05, 700, 300);
    },
  };

  return {
    sfx,
    get muted() {
      return muted;
    },
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
    },
    toggle() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.32;
      return muted;
    },
  };
}
