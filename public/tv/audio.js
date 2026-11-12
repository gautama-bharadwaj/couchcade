// TV sound: synthesized effects (Web Audio) and a narrator (the browser's speech synthesis).
// No audio files, so nothing to license or download, and the Pi deploy stays a folder copy.
//
// Browsers only allow sound after a user gesture, so tv.js calls unlock() on the first key or click.
// Games use this through their renderer's optional onSnapshot(prev, cur, audio) hook.
//   audio.sfx.<name>(…)   one-shot effects (see SFX below)
//   audio.say(text, opts)  narrator line; opts { rate, pitch, interrupt, delay }
//   audio.ambience('night' | null)

let ctx = null;
let master = null;
let muted = false;
let narratorOn = true;
let unlocked = false;
let amb = null; // { name, nodes, gain }

const prefs = (() => {
  try {
    return JSON.parse(localStorage.getItem('cc.audio') ?? '{}');
  } catch {
    return {};
  }
})();
muted = !!prefs.muted;
narratorOn = prefs.narrator !== false;

function savePrefs() {
  try {
    localStorage.setItem('cc.audio', JSON.stringify({ muted, narrator: narratorOn }));
  } catch {}
}

export function unlock() {
  if (unlocked) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  // A gentle limiter so stacked effects don't clip on TV speakers.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 6;
  master.connect(comp).connect(ctx.destination);
  ctx.resume?.();
  unlocked = true;
  pickVoice();
}

export const isUnlocked = () => unlocked;
export const isMuted = () => muted;
export const narratorEnabled = () => narratorOn;

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05);
  if (muted) speechSynthesis?.cancel();
  savePrefs();
  return muted;
}

export function toggleNarrator() {
  narratorOn = !narratorOn;
  if (!narratorOn) speechSynthesis?.cancel();
  savePrefs();
  return narratorOn;
}

// ---- Building blocks --------------------------------------------------------------
const ready = () => unlocked && ctx && !muted;

function env(gainNode, t, attack, hold, release, peak) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(peak, t + attack);
  g.setValueAtTime(peak, t + attack + hold);
  g.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

function tone(freq, dur, { type = 'sine', gain = 0.3, slideTo = null, at = 0, attack = 0.005, dest = master } = {}) {
  if (!ready()) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  env(g, t, attack, Math.max(0, dur - attack - 0.05), 0.08, gain);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.1);
}

let noiseBuf = null;
function noiseBuffer() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function noise(dur, { type = 'bandpass', freq = 1000, slideTo = null, q = 1, gain = 0.3, at = 0, attack = 0.01 } = {}) {
  if (!ready()) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  env(g, t, attack, Math.max(0, dur - attack - 0.06), 0.06, gain);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.1);
}

function notes(seq, { type = 'triangle', gain = 0.22, step = 0.12, len = 0.16 } = {}) {
  seq.forEach((f, i) => f && tone(f, len, { type, gain, at: i * step }));
}

// ---- Effects ----------------------------------------------------------------------
const N = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, Bb4: 466, B4: 494, C5: 523, D5: 587, E5: 659, G5: 784, C6: 1047 };

export const sfx = {
  click: () => tone(1200, 0.04, { type: 'square', gain: 0.08 }),
  tick: () => tone(1800, 0.03, { type: 'square', gain: 0.07 }),
  beep: (high = false) => tone(high ? 1320 : 660, high ? 0.35 : 0.14, { type: 'square', gain: 0.12 }),
  swish: () => noise(0.18, { type: 'bandpass', freq: 600, slideTo: 3500, q: 0.8, gain: 0.35 }),
  shuffle: (n = 1) => {
    for (let i = 0; i < Math.min(n, 6); i++) noise(0.07, { type: 'highpass', freq: 2500, gain: 0.18, at: i * 0.09 });
  },
  whoosh: () => noise(0.4, { type: 'bandpass', freq: 300, slideTo: 1800, q: 1.5, gain: 0.4 }),
  thud: (power = 0.5) => {
    const p = Math.max(0.15, Math.min(1, power));
    tone(140, 0.18, { type: 'sine', slideTo: 50, gain: 0.5 * p });
    noise(0.08, { type: 'lowpass', freq: 900, gain: 0.35 * p });
  },
  buzz: () => {
    tone(110, 0.28, { type: 'sawtooth', gain: 0.18 });
    tone(116, 0.28, { type: 'sawtooth', gain: 0.18 });
  },
  chime: () => notes([N.E5, N.G5, N.C6], { type: 'sine', gain: 0.18, step: 0.08, len: 0.5 }),
  whisper: () => {
    noise(0.9, { type: 'bandpass', freq: 5000, q: 3, gain: 0.12, attack: 0.3 });
    tone(N.E5 * 2, 0.6, { type: 'sine', gain: 0.05, attack: 0.2 });
  },
  danger: (level = 1) => {
    // Rises with the size of a draw stack.
    const base = 180 * Math.pow(1.12, Math.min(level, 12));
    tone(base, 0.22, { type: 'sawtooth', gain: 0.16 });
    tone(base * 1.5, 0.22, { type: 'sawtooth', gain: 0.1, at: 0.11 });
    tone(base * 2, 0.3, { type: 'square', gain: 0.08, at: 0.22 });
  },
  alarm: () => {
    for (let i = 0; i < 4; i++) tone(i % 2 ? 700 : 950, 0.12, { type: 'square', gain: 0.12, at: i * 0.13 });
  },
  fanfare: () => notes([N.C5, N.C5, N.C5, N.G4, null, N.C5, N.E5, N.G5], { type: 'square', gain: 0.12, step: 0.13, len: 0.2 }),
  jingle: () => notes([N.C5, N.E5, N.G5, N.C6], { type: 'triangle', gain: 0.2, step: 0.1, len: 0.18 }),
  sadTrombone: () => {
    [N.D4, N.C4 * 1.03, N.C4, N.B4 / 2].forEach((f, i) => tone(f, i === 3 ? 0.9 : 0.35, { type: 'sawtooth', gain: 0.12, at: i * 0.38, slideTo: i === 3 ? f * 0.94 : null }));
  },
  sting: () => {
    // Ominous low chord hit.
    [98, 116.5, 146.8].forEach((f) => tone(f, 1.4, { type: 'sawtooth', gain: 0.1 }));
    noise(0.5, { type: 'lowpass', freq: 400, gain: 0.25 });
  },
  evil: () => {
    [N.A4 / 2, N.Bb4 / 2, N.A4 / 2, N.E4 / 2].forEach((f, i) => tone(f, 0.45, { type: 'sawtooth', gain: 0.14, at: i * 0.4 }));
    tone(55, 1.8, { type: 'sine', gain: 0.3, at: 1.2 });
  },
  drumroll: (secs = 2) => {
    const hits = Math.round(secs * 22);
    for (let i = 0; i < hits; i++) noise(0.05, { type: 'bandpass', freq: 180, q: 0.7, gain: 0.12 + (0.25 * i) / hits, at: i / 22 });
    noise(0.4, { type: 'lowpass', freq: 600, gain: 0.5, at: secs });
    tone(70, 0.4, { type: 'sine', slideTo: 40, gain: 0.5, at: secs });
  },
  heartbeat: (intensity = 0.5) => {
    tone(60, 0.12, { type: 'sine', gain: 0.35 + 0.3 * intensity });
    tone(55, 0.12, { type: 'sine', gain: 0.25 + 0.25 * intensity, at: 0.18 });
  },
  fall: () => tone(1400, 0.9, { type: 'sine', slideTo: 180, gain: 0.16 }),
  doorCreak: () => tone(160, 0.8, { type: 'sawtooth', slideTo: 230, gain: 0.05 }),
  clockChime: () => [0, 1, 2].forEach((i) => tone(N.G4 / 2, 1.1, { type: 'sine', gain: 0.2, at: i * 0.9 })),
};

// ---- Ambience ---------------------------------------------------------------------
export function ambience(name) {
  if (amb?.name === name) return;
  if (amb) {
    const old = amb;
    old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6);
    setTimeout(() => old.nodes.forEach((n) => n.stop?.()), 3000);
    amb = null;
  }
  if (!name || !unlocked) return;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.connect(master);
  const nodes = [];
  if (name === 'night') {
    // Low drone with slow wobble + soft rain.
    for (const f of [55, 82.4, 110.5]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.07 + Math.random() * 0.05;
      lfoGain.gain.value = f * 0.01;
      lfo.connect(lfoGain).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.09;
      o.connect(g).connect(gain);
      o.start();
      lfo.start();
      nodes.push(o, lfo);
    }
    const rain = ctx.createBufferSource();
    rain.buffer = noiseBuffer();
    rain.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    rain.connect(f).connect(g).connect(gain);
    rain.start();
    nodes.push(rain);
  }
  gain.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
  amb = { name, nodes, gain };
}

// ---- Narrator ---------------------------------------------------------------------
let voice = null;
function pickVoice() {
  const synth = window.speechSynthesis;
  if (!synth) return;
  const choose = () => {
    const voices = synth.getVoices().filter((v) => v.lang?.startsWith('en'));
    // Prefer characterful, natural voices where available (macOS / Chrome names).
    const wanted = ['Daniel', 'Google UK English Male', 'Arthur', 'Oliver', 'Samantha', 'Google US English', 'Alex'];
    voice = wanted.map((w) => voices.find((v) => v.name.includes(w))).find(Boolean) ?? voices[0] ?? null;
  };
  choose();
  synth.onvoiceschanged = choose;
}

/** Speak a line. interrupt: cut off whatever is being said. delay: seconds before speaking. */
export function say(text, { rate = 0.95, pitch = 0.9, interrupt = false, delay = 0 } = {}) {
  if (!unlocked || muted || !narratorOn || !window.speechSynthesis) return;
  const go = () => {
    if (muted || !narratorOn) return;
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/ \(bot\)/g, '')); // "Ada (bot)" is read as "Ada"
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = pitch;
    u.volume = 1;
    speechSynthesis.speak(u);
  };
  if (delay > 0) setTimeout(go, delay * 1000);
  else go();
}

export function hush() {
  window.speechSynthesis?.cancel();
}

/** Pick a random line from a list. */
export const pick = (lines) => lines[Math.floor(Math.random() * lines.length)];

export default { unlock, isUnlocked, isMuted, narratorEnabled, toggleMute, toggleNarrator, sfx, ambience, say, hush, pick };
