import { clamp, rand } from '../core/math';
import type { PlayOptions, SynthContext } from './AudioSystem';

/**
 * Recetas de sonido sintetizado. Cada receta arma su pequeño grafo WebAudio,
 * lo programa a partir de t0 y devuelve la duración aproximada.
 */
type Recipe = (s: SynthContext, out: AudioNode, t0: number, o: PlayOptions) => number;
type LoopRecipe = (s: SynthContext, out: AudioNode, params: Record<string, AudioParam>, stops: (() => void)[]) => void;

// ---------------------------------------------------------------- helpers
function noiseSrc(s: SynthContext, buf: AudioBuffer, t0: number, dur: number): AudioBufferSourceNode {
  const src = s.ctx.createBufferSource();
  src.buffer = buf;
  const offset = Math.random() * (buf.duration - Math.min(dur, buf.duration - 0.01) - 0.01);
  src.start(t0, Math.max(0, offset), dur + 0.05);
  return src;
}

function osc(s: SynthContext, type: OscillatorType, freq: number, t0: number, dur: number): OscillatorNode {
  const o = s.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
  return o;
}

function filt(s: SynthContext, type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
  const f = s.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** Ganancia con envolvente ataque/decaimiento exponencial. */
function envGain(s: SynthContext, t0: number, attack: number, peak: number, decay: number, hold = 0): GainNode {
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  if (hold > 0) g.gain.setValueAtTime(peak, t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + decay);
  return g;
}

function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

function burst(s: SynthContext, out: AudioNode, t0: number, buf: AudioBuffer, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number, attack = 0.002): void {
  const src = noiseSrc(s, buf, t0, attack + decay);
  chain(src, filt(s, type, freq, q), envGain(s, t0, attack, peak, decay), out);
}

function tone(s: SynthContext, out: AudioNode, t0: number, type: OscillatorType, f0: number, f1: number, peak: number, dur: number, attack = 0.003): void {
  const o = osc(s, type, f0, t0, dur);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  chain(o, envGain(s, t0, attack, peak, dur), out);
}

// ---------------------------------------------------------------- recetas
const creak: Recipe = (s, out, t0, o) => {
  const ctx = s.ctx;
  const dur = o.duration ?? rand(0.5, 1.2);
  const f0 = rand(55, 120) * (o.rate ?? 1);
  const curve = new Float32Array(40);
  let f = f0;
  for (let i = 0; i < curve.length; i++) {
    f = clamp(f + (Math.random() - 0.5) * f0 * 0.4, f0 * 0.5, f0 * 1.9);
    curve[i] = f;
  }
  const src = ctx.createOscillator();
  src.type = 'sawtooth';
  src.frequency.setValueCurveAtTime(curve, t0, dur);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
  // modulación "stick-slip" de la madera
  const am = ctx.createOscillator();
  am.type = 'square';
  am.frequency.setValueCurveAtTime(curve.map((v) => v * 0.23), t0, dur);
  am.start(t0);
  am.stop(t0 + dur + 0.05);
  const amDepth = ctx.createGain();
  amDepth.gain.value = 0.5;
  const vca = ctx.createGain();
  vca.gain.value = 0.5;
  am.connect(amDepth).connect(vca.gain);
  const bp1 = filt(s, 'bandpass', rand(650, 1200), 6);
  const bp2 = filt(s, 'bandpass', rand(1700, 2600), 4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(0.5, t0 + dur * 0.3);
  g.gain.linearRampToValueAtTime(0.35, t0 + dur * 0.75);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(vca);
  vca.connect(bp1).connect(g);
  vca.connect(bp2).connect(g);
  g.connect(out);
  return dur;
};

const knock: Recipe = (s, out, t0) => {
  const lp = filt(s, 'lowpass', 900, 0.7);
  lp.connect(out);
  const o = osc(s, 'sine', 118, t0, 0.18);
  o.frequency.exponentialRampToValueAtTime(72, t0 + 0.15);
  chain(o, envGain(s, t0, 0.002, 1.0, 0.16), lp);
  burst(s, lp, t0, s.brown, 'bandpass', 320, 1.2, 0.9, 0.09);
  burst(s, lp, t0, s.white, 'bandpass', 1400, 2, 0.12, 0.02);
  return 0.25;
};

const doorClose: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.brown, 'lowpass', 190, 0.8, 1.2, 0.4);
  tone(s, out, t0, 'sine', 62, 40, 0.8, 0.35);
  burst(s, out, t0 + 0.02, s.white, 'highpass', 3000, 1, 0.25, 0.015);
  burst(s, out, t0 + 0.09, s.white, 'bandpass', 2400, 6, 0.2, 0.03);
  return 0.5;
};

const doorOpen: Recipe = (s, out, t0, o) => {
  burst(s, out, t0, s.white, 'bandpass', 2600, 5, 0.25, 0.03);
  burst(s, out, t0 + 0.05, s.white, 'highpass', 3500, 1, 0.12, 0.015);
  creak(s, out, t0 + 0.08, { duration: o.duration ?? rand(0.9, 1.5), rate: 0.9 });
  return 1.5;
};

const doorLocked: Recipe = (s, out, t0) => {
  for (const [dt, v] of [
    [0, 0.5],
    [0.09, 0.35],
    [0.2, 0.45],
    [0.34, 0.3],
  ] as const) {
    burst(s, out, t0 + dt, s.white, 'bandpass', rand(2000, 3200), 6, v, 0.035);
    burst(s, out, t0 + dt, s.brown, 'lowpass', 300, 1, v * 0.8, 0.06);
  }
  return 0.45;
};

const thud: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.brown, 'lowpass', 240, 0.8, 1.3, 0.5);
  tone(s, out, t0, 'sine', 50, 38, 0.9, 0.4);
  burst(s, out, t0 + 0.24, s.brown, 'lowpass', 300, 1, 0.5, 0.18);
  burst(s, out, t0 + 0.38, s.white, 'bandpass', 1500, 3, 0.18, 0.1);
  burst(s, out, t0 + 0.46, s.brown, 'lowpass', 350, 1, 0.2, 0.1);
  return 0.7;
};

const footWood: Recipe = (s, out, t0, o) => {
  const v = o.volume ?? 1;
  burst(s, out, t0, s.brown, 'lowpass', 420, 0.8, 0.9 * v, 0.12);
  burst(s, out, t0, s.white, 'bandpass', 1900, 1, 0.1 * v, 0.04);
  if (Math.random() < 0.28) creak(s, out, t0 + 0.04, { duration: rand(0.25, 0.5), rate: 1.3 });
  return 0.2;
};

const footConcrete: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.brown, 'lowpass', 320, 0.8, 0.7, 0.08);
  burst(s, out, t0, s.white, 'bandpass', 3200, 0.9, 0.22, 0.06);
  burst(s, out, t0 + 0.05, s.white, 'highpass', 5000, 0.7, 0.05, 0.08);
  return 0.15;
};

const monsterStep: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.brown, 'lowpass', 200, 0.8, 1.1, 0.28);
  creak(s, out, t0 + 0.03, { duration: rand(0.35, 0.7), rate: 0.6 });
  const src = noiseSrc(s, s.white, t0 + 0.1, 0.5);
  const bp = filt(s, 'bandpass', 900, 1.5);
  bp.frequency.setValueAtTime(900, t0 + 0.1);
  bp.frequency.exponentialRampToValueAtTime(350, t0 + 0.55);
  chain(src, bp, envGain(s, t0 + 0.1, 0.15, 0.08, 0.3), out);
  return 0.8;
};

function breathCycle(s: SynthContext, out: AudioNode, t0: number, low: number, inhale: number, exhale: number, peak: number, ragged: number): void {
  const ctx = s.ctx;
  const make = (start: number, dur: number, f0: number, f1: number, amp: number) => {
    const src = noiseSrc(s, s.white, start, dur);
    const bp = filt(s, 'bandpass', f0, 1.4);
    bp.frequency.setValueAtTime(f0, start);
    bp.frequency.linearRampToValueAtTime(f1, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(amp, start + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    const vca = ctx.createGain();
    vca.gain.value = 1 - ragged * 0.5;
    if (ragged > 0) {
      const am = osc(s, 'square', rand(17, 27), start, dur);
      const d = ctx.createGain();
      d.gain.value = ragged * 0.5;
      am.connect(d).connect(vca.gain);
    }
    chain(src, bp, g, vca, out);
  };
  make(t0, inhale, low * 1.4, low * 1.1, peak * 0.7);
  make(t0 + inhale + 0.15, exhale, low * 1.2, low * 0.75, peak);
}

const breath: Recipe = (s, out, t0) => {
  breathCycle(s, out, t0, 800, 1.0, 1.4, 0.35, 0);
  return 2.6;
};

const monsterBreath: Recipe = (s, out, t0) => {
  breathCycle(s, out, t0, 380, 1.5, 2.1, 0.8, 0.8);
  burst(s, out, t0 + 1.6, s.brown, 'lowpass', 140, 1, 0.5, 1.6, 0.4);
  return 3.8;
};

const whisper: Recipe = (s, out, t0, o) => {
  const dur = o.duration ?? 2.2;
  let t = t0;
  while (t < t0 + dur) {
    const syl = rand(0.07, 0.2);
    const src = noiseSrc(s, s.white, t, syl);
    chain(src, filt(s, 'highpass', 1400, 0.7), filt(s, 'bandpass', rand(1800, 5200), 3), envGain(s, t, syl * 0.35, rand(0.25, 0.6), syl * 0.65), out);
    t += syl + (Math.random() < 0.2 ? rand(0.12, 0.35) : rand(0.01, 0.05));
  }
  return dur;
};

/** Voz "grabada" ininteligible para acompañar los subtítulos de las cintas. */
function speech(s: SynthContext, out: AudioNode, t0: number, dur: number, voiced: boolean, pitch: number): number {
  const ctx = s.ctx;
  const f1 = filt(s, 'bandpass', 600, 5);
  const f2 = filt(s, 'bandpass', 1500, 6);
  const mix = ctx.createGain();
  mix.gain.value = voiced ? 0.9 : 1.4;
  f1.connect(mix);
  f2.connect(mix);
  const tapeLp = filt(s, 'lowpass', voiced ? 2800 : 3600, 0.7);
  const tapeHp = filt(s, 'highpass', 260, 0.7);
  const amp = ctx.createGain();
  amp.gain.value = 0;
  chain(mix, amp, tapeHp, tapeLp, out);
  let src: AudioScheduledSourceNode;
  if (voiced) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(pitch, t0);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vd = ctx.createGain();
    vd.gain.value = pitch * 0.02;
    vib.connect(vd).connect(o.frequency);
    vib.start(t0);
    vib.stop(t0 + dur + 0.1);
    src = o;
  } else {
    src = noiseSrc(s, s.white, t0, dur);
  }
  src.connect(f1);
  src.connect(f2);
  if (voiced) {
    (src as OscillatorNode).start(t0);
    src.stop(t0 + dur + 0.1);
  }
  let t = t0;
  while (t < t0 + dur - 0.08) {
    const syl = rand(0.09, 0.22);
    const peak = rand(0.35, 0.8);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(peak, t + syl * 0.3);
    amp.gain.linearRampToValueAtTime(0.0001, t + syl);
    f1.frequency.setValueAtTime(rand(380, 850), t);
    f2.frequency.setValueAtTime(rand(950, 2300), t);
    if (voiced) (src as OscillatorNode).frequency.setValueAtTime(pitch * rand(0.9, 1.15), t);
    t += syl + (Math.random() < 0.15 ? rand(0.15, 0.3) : rand(0.01, 0.05));
  }
  return dur;
}

const voice: Recipe = (s, out, t0, o) => speech(s, out, t0, o.duration ?? 1.5, true, 205);
const voiceWhisper: Recipe = (s, out, t0, o) => speech(s, out, t0, o.duration ?? 1.5, false, 0);

const camOn: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.white, 'highpass', 2500, 1, 0.3, 0.012);
  const m = osc(s, 'sawtooth', 40, t0, 0.5);
  m.frequency.linearRampToValueAtTime(95, t0 + 0.35);
  chain(m, filt(s, 'lowpass', 380, 1), envGain(s, t0, 0.1, 0.12, 0.35), out);
  tone(s, out, t0 + 0.38, 'square', 2400, 2400, 0.06, 0.05);
  tone(s, out, t0 + 0.48, 'square', 2400, 2400, 0.06, 0.05);
  return 0.6;
};

const camOff: Recipe = (s, out, t0) => {
  tone(s, out, t0, 'sine', 1800, 480, 0.12, 0.2);
  const m = osc(s, 'sawtooth', 90, t0, 0.4);
  m.frequency.linearRampToValueAtTime(30, t0 + 0.35);
  chain(m, filt(s, 'lowpass', 300, 1), envGain(s, t0, 0.02, 0.1, 0.35), out);
  burst(s, out, t0 + 0.28, s.white, 'highpass', 2500, 1, 0.3, 0.012);
  return 0.4;
};

const recBeep: Recipe = (s, out, t0) => {
  tone(s, out, t0, 'square', 2600, 2600, 0.07, 0.06);
  return 0.08;
};

const nvOn: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.white, 'highpass', 3000, 1, 0.25, 0.01);
  const w = osc(s, 'sine', 6500, t0, 0.8);
  w.frequency.exponentialRampToValueAtTime(11500, t0 + 0.7);
  chain(w, envGain(s, t0, 0.2, 0.025, 0.6), out);
  return 0.8;
};

const nvOff: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.white, 'highpass', 3000, 1, 0.25, 0.01);
  tone(s, out, t0, 'sine', 9000, 3000, 0.012, 0.3);
  return 0.3;
};

const tapeInsert: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.brown, 'lowpass', 500, 1, 0.5, 0.08);
  burst(s, out, t0 + 0.25, s.brown, 'lowpass', 400, 1, 0.8, 0.12);
  burst(s, out, t0 + 0.26, s.white, 'bandpass', 2200, 3, 0.2, 0.03);
  const m = osc(s, 'sawtooth', 68, t0 + 0.35, 0.9);
  chain(m, filt(s, 'lowpass', 280, 1), envGain(s, t0 + 0.35, 0.1, 0.1, 0.8), out);
  burst(s, out, t0 + 1.2, s.white, 'highpass', 2500, 1, 0.2, 0.015);
  return 1.3;
};

const tapeEject: Recipe = (s, out, t0) => {
  const m = osc(s, 'sawtooth', 75, t0, 0.6);
  chain(m, filt(s, 'lowpass', 280, 1), envGain(s, t0, 0.05, 0.1, 0.55), out);
  burst(s, out, t0 + 0.65, s.brown, 'lowpass', 450, 1, 0.8, 0.12);
  return 0.8;
};

const staticBurst: Recipe = (s, out, t0, o) => {
  const dur = o.duration ?? 0.4;
  const src = noiseSrc(s, s.white, t0, dur);
  chain(src, filt(s, 'bandpass', 3200, 0.45), envGain(s, t0, 0.01, 0.45, dur * 0.9, dur * 0.1), out);
  return dur;
};

const interference: Recipe = (s, out, t0, o) => {
  const ctx = s.ctx;
  const dur = o.duration ?? 0.8;
  const src = noiseSrc(s, s.white, t0, dur);
  const gate = ctx.createGain();
  gate.gain.value = 0.5;
  const sq = osc(s, 'square', rand(23, 47), t0, dur);
  const sqd = ctx.createGain();
  sqd.gain.value = 0.5;
  sq.connect(sqd).connect(gate.gain);
  chain(src, filt(s, 'bandpass', 2400, 0.7), gate, envGain(s, t0, 0.02, 0.28, dur * 0.8, dur * 0.2), out);
  const w = osc(s, 'sine', rand(2900, 3400), t0, dur);
  chain(w, envGain(s, t0, 0.05, 0.03, dur * 0.8), out);
  return dur;
};

const glitchBlip: Recipe = (s, out, t0) => {
  tone(s, out, t0, 'square', rand(900, 3200), rand(400, 3000), 0.05, 0.03);
  burst(s, out, t0, s.white, 'highpass', 4000, 1, 0.08, 0.03);
  return 0.05;
};

const batteryLow: Recipe = (s, out, t0) => {
  tone(s, out, t0, 'square', 1250, 1250, 0.05, 0.08);
  tone(s, out, t0 + 0.16, 'square', 1250, 1250, 0.05, 0.08);
  return 0.3;
};

const batteryDead: Recipe = (s, out, t0) => {
  tone(s, out, t0, 'sine', 900, 180, 0.12, 0.9);
  const m = osc(s, 'sawtooth', 80, t0, 0.8);
  m.frequency.linearRampToValueAtTime(20, t0 + 0.8);
  chain(m, filt(s, 'lowpass', 250, 1), envGain(s, t0, 0.02, 0.12, 0.75), out);
  burst(s, out, t0 + 0.85, s.white, 'highpass', 2500, 1, 0.25, 0.012);
  return 1.0;
};

const batteryInsert: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.white, 'bandpass', 1800, 2, 0.2, 0.15, 0.05);
  burst(s, out, t0 + 0.22, s.white, 'highpass', 2500, 1, 0.4, 0.015);
  burst(s, out, t0 + 0.23, s.brown, 'lowpass', 500, 1, 0.5, 0.05);
  burst(s, out, t0 + 0.38, s.white, 'highpass', 2800, 1, 0.3, 0.012);
  return 0.5;
};

const pickup: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.white, 'bandpass', 2300, 0.7, 0.18, 0.14, 0.03);
  burst(s, out, t0 + 0.1, s.brown, 'lowpass', 600, 1, 0.3, 0.05);
  return 0.25;
};

const paper: Recipe = (s, out, t0) => {
  for (let i = 0; i < 9; i++) burst(s, out, t0 + i * rand(0.03, 0.07), s.white, 'highpass', rand(2000, 4500), 1, rand(0.08, 0.2), rand(0.02, 0.05));
  return 0.6;
};

const switchClick: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.white, 'highpass', 2200, 1, 0.4, 0.01);
  tone(s, out, t0, 'sine', 1700, 1200, 0.12, 0.015);
  return 0.05;
};

const bulbPop: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.white, 'bandpass', 3800, 1, 0.8, 0.04);
  tone(s, out, t0 + 0.05, 'sine', 5200, 5100, 0.05, 0.05);
  tone(s, out, t0 + 0.12, 'sine', 6400, 6300, 0.04, 0.05);
  burst(s, out, t0 + 0.02, s.white, 'highpass', 6000, 1, 0.08, 0.3);
  return 0.4;
};

const heartbeat: Recipe = (s, out, t0) => {
  const lp = filt(s, 'lowpass', 120, 0.7);
  lp.connect(out);
  tone(s, lp, t0, 'sine', 58, 42, 1, 0.16);
  tone(s, lp, t0 + 0.27, 'sine', 52, 40, 0.7, 0.18);
  return 0.5;
};

/** Crescendo grave y lento: tensión sin "susto". */
const swell: Recipe = (s, out, t0, o) => {
  const dur = o.duration ?? 5;
  const lp = filt(s, 'lowpass', 180, 1.2);
  lp.frequency.setValueAtTime(180, t0);
  lp.frequency.exponentialRampToValueAtTime(900, t0 + dur * 0.7);
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(0.18, t0 + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  chain(lp, g, out);
  for (const f of [55, 83.2, 110.9, 58.3]) osc(s, 'sawtooth', f, t0, dur).connect(lp);
  return dur;
};

const tvOn: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.brown, 'lowpass', 200, 1, 0.8, 0.2);
  staticBurst(s, out, t0 + 0.05, { duration: 1.2 });
  tone(s, out, t0, 'sine', 11800, 11800, 0.012, 1.5);
  return 1.5;
};

const uiClick: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.white, 'highpass', 3000, 1, 0.15, 0.008);
  return 0.02;
};

const whoosh: Recipe = (s, out, t0) => {
  const src = noiseSrc(s, s.pink, t0, 0.9);
  const bp = filt(s, 'bandpass', 300, 0.8);
  bp.frequency.setValueAtTime(300, t0);
  bp.frequency.exponentialRampToValueAtTime(1600, t0 + 0.5);
  chain(src, bp, envGain(s, t0, 0.35, 0.4, 0.5), out);
  return 0.9;
};

/** Cadenas que se arrastran: eslabones metálicos inarmónicos, golpecitos al azar. */
const chains: Recipe = (s, out, t0, o) => {
  const dur = o.duration ?? rand(0.9, 1.8);
  const links = Math.round(dur * rand(9, 14));
  for (let i = 0; i < links; i++) {
    const t = t0 + (i / links) * dur + rand(0, 0.05);
    const base = rand(1800, 3400);
    for (const k of [1, 2.76, 5.4]) tone(s, out, t, 'sine', base * k, base * k * 0.98, 0.05 / k, rand(0.05, 0.14));
    burst(s, out, t, s.white, 'bandpass', rand(2500, 5000), 3, 0.12, 0.03);
  }
  // arrastre sobre el piso
  const src = noiseSrc(s, s.pink, t0, dur);
  chain(src, filt(s, 'bandpass', 900, 0.7), envGain(s, t0, 0.1, 0.05, dur * 0.8, dur * 0.1), out);
  return dur;
};

/** Perro ladrando a lo lejos (dos o tres ladridos). */
const dogBark: Recipe = (s, out, t0, o) => {
  const n = Math.round(rand(2, 4));
  const lp = filt(s, 'lowpass', 1400, 0.7);
  lp.connect(out);
  let t = t0;
  for (let i = 0; i < n; i++) {
    const f = rand(380, 520) * (o.rate ?? 1);
    const ob = osc(s, 'sawtooth', f, t, 0.16);
    ob.frequency.setValueAtTime(f * 1.25, t);
    ob.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.14);
    chain(ob, filt(s, 'bandpass', 900, 1.4), envGain(s, t, 0.01, 0.28, 0.14), lp);
    burst(s, lp, t, s.white, 'bandpass', 1500, 1, 0.12, 0.1);
    t += rand(0.25, 0.45);
  }
  return t - t0 + 0.2;
};

/** Colectivo que pasa por la avenida: motor grave que sube y se aleja. */
const trafficPass: Recipe = (s, out, t0, o) => {
  const dur = o.duration ?? 7;
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(0.5, t0 + dur * 0.45);
  g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  g.connect(out);
  const lp = filt(s, 'lowpass', 220, 0.8);
  lp.frequency.setValueAtTime(140, t0);
  lp.frequency.linearRampToValueAtTime(420, t0 + dur * 0.45);
  lp.frequency.linearRampToValueAtTime(120, t0 + dur);
  lp.connect(g);
  noiseSrc(s, s.brown, t0, dur).connect(lp);
  const eng = osc(s, 'sawtooth', 48, t0, dur);
  eng.frequency.linearRampToValueAtTime(62, t0 + dur * 0.45);
  eng.frequency.linearRampToValueAtTime(44, t0 + dur);
  const eg = s.ctx.createGain();
  eg.gain.value = 0.25;
  eng.connect(eg).connect(lp);
  return dur;
};

/** Golpe contra la persiana metálica: chapa que vibra. */
const shutterBang: Recipe = (s, out, t0) => {
  burst(s, out, t0, s.brown, 'lowpass', 300, 0.8, 1.2, 0.5);
  burst(s, out, t0, s.white, 'bandpass', 1200, 0.6, 0.5, 0.35);
  for (const f of [173, 241, 389, 612, 877]) tone(s, out, t0, 'triangle', f, f * 0.97, 0.06, rand(0.8, 1.4));
  return 1.5;
};

/** Golpe de susto (cuando aparece el monstruo): estruendo grave + racimo disonante de metales + chirrido agudo. */
const stinger: Recipe = (s, out, t0, o) => {
  const dur = o.duration ?? 2.6;
  // estruendo
  burst(s, out, t0, s.brown, 'lowpass', 160, 0.9, 1.6, 1.4, 0.004);
  tone(s, out, t0, 'sine', 70, 34, 0.9, 1.6, 0.004);
  // racimo disonante (cluster) con brillo que se apaga
  const lp = filt(s, 'lowpass', 3200, 0.8);
  lp.frequency.setValueAtTime(3200, t0);
  lp.frequency.exponentialRampToValueAtTime(500, t0 + dur);
  const g = envGain(s, t0, 0.015, 0.22, dur);
  chain(lp, g, out);
  for (const f of [146.8, 155.6, 207.7, 220, 311.1, 329.6]) osc(s, 'sawtooth', f * rand(0.995, 1.005), t0, dur).connect(lp);
  // chirrido agudo que cae
  for (const [f0, f1] of [[2600, 1700], [2750, 1650]] as const) {
    const sc = osc(s, 'sawtooth', f0, t0, dur * 0.7);
    sc.frequency.exponentialRampToValueAtTime(f1, t0 + dur * 0.7);
    const vib = osc(s, 'sine', 9, t0, dur * 0.7);
    const vg = s.ctx.createGain();
    vg.gain.value = 40;
    vib.connect(vg).connect(sc.frequency);
    chain(sc, filt(s, 'bandpass', 2200, 2), envGain(s, t0 + 0.02, 0.04, 0.05, dur * 0.65), out);
  }
  burst(s, out, t0, s.white, 'highpass', 2500, 0.7, 0.35, 0.6);
  return dur;
};

/** Grito del monstruo (cinemática de captura): diente de sierra con formantes, vibrato y ruido. */
const scream: Recipe = (s, out, t0, o) => {
  const dur = o.duration ?? 1.5;
  const src = osc(s, 'sawtooth', 260, t0, dur);
  src.frequency.linearRampToValueAtTime(620, t0 + dur * 0.25);
  src.frequency.linearRampToValueAtTime(420, t0 + dur * 0.7);
  src.frequency.linearRampToValueAtTime(180, t0 + dur);
  const vib = osc(s, 'sine', 13, t0, dur);
  const vg = s.ctx.createGain();
  vg.gain.value = 35;
  vib.connect(vg).connect(src.frequency);
  const shaper = s.ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * 2 - 1;
    curve[i] = Math.tanh(x * 4);
  }
  shaper.curve = curve;
  const env = envGain(s, t0, 0.03, 0.7, dur * 0.9, dur * 0.1);
  const mix = s.ctx.createGain();
  chain(mix, shaper, env, out);
  for (const [f, q, gn] of [[700, 6, 1], [1150, 8, 0.8], [2600, 10, 0.5]] as const) {
    const bp = filt(s, 'bandpass', f, q);
    const g = s.ctx.createGain();
    g.gain.value = gn;
    src.connect(bp).connect(g).connect(mix);
  }
  const n = noiseSrc(s, s.white, t0, dur);
  chain(n, filt(s, 'bandpass', 1800, 0.8), envGain(s, t0, 0.02, 0.25, dur), out);
  return dur;
};

/** Pisada pesada y lenta del monstruo (se escucha cuando camina hacia vos). */
const heavyStep: Recipe = (s, out, t0, o) => {
  const v = o.rate ?? 1;
  burst(s, out, t0, s.brown, 'lowpass', 140 * v, 0.9, 1.3, 0.35, 0.003);
  tone(s, out, t0, 'sine', 62 * v, 38, 0.7, 0.3, 0.003);
  burst(s, out, t0 + 0.02, s.white, 'bandpass', 700, 1.2, 0.12, 0.12);
  if (Math.random() < 0.35) creak(s, out, t0 + 0.05, { duration: rand(0.25, 0.5), rate: 0.5 });
  return 0.5;
};

export const SOUNDS = {
  creak,
  knock,
  doorOpen,
  doorClose,
  doorLocked,
  thud,
  footWood,
  footConcrete,
  monsterStep,
  breath,
  monsterBreath,
  whisper,
  voice,
  voiceWhisper,
  camOn,
  camOff,
  recBeep,
  nvOn,
  nvOff,
  tapeInsert,
  tapeEject,
  static: staticBurst,
  interference,
  glitchBlip,
  batteryLow,
  batteryDead,
  batteryInsert,
  pickup,
  paper,
  switchClick,
  bulbPop,
  heartbeat,
  swell,
  tvOn,
  uiClick,
  whoosh,
  chains,
  dogBark,
  trafficPass,
  shutterBang,
  stinger,
  scream,
  heavyStep,
} satisfies Record<string, Recipe>;

export type SoundName = keyof typeof SOUNDS;

// ---------------------------------------------------------------- loops
function loopNoise(s: SynthContext, buf: AudioBuffer, stops: (() => void)[]): AudioBufferSourceNode {
  const src = s.ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start(0, Math.random() * buf.duration);
  stops.push(() => src.stop());
  return src;
}

function loopOsc(s: SynthContext, type: OscillatorType, f: number, stops: (() => void)[]): OscillatorNode {
  const o = s.ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.start();
  stops.push(() => o.stop());
  return o;
}

function lfo(s: SynthContext, f: number, depth: number, target: AudioParam, stops: (() => void)[]): void {
  const o = loopOsc(s, 'sine', f, stops);
  const g = s.ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(target);
}

export const LOOPS = {
  wind: (s, out, _p, stops) => {
    const src = loopNoise(s, s.pink, stops);
    const bp = filt(s, 'bandpass', 420, 0.9);
    lfo(s, 0.071, 260, bp.frequency, stops);
    const g = s.ctx.createGain();
    g.gain.value = 0.6;
    lfo(s, 0.13, 0.35, g.gain, stops);
    chain(src, bp, g, out);
    const whistle = loopNoise(s, s.white, stops);
    const wb = filt(s, 'bandpass', 1150, 14);
    lfo(s, 0.05, 180, wb.frequency, stops);
    const wg = s.ctx.createGain();
    wg.gain.value = 0.05;
    lfo(s, 0.09, 0.05, wg.gain, stops);
    chain(whistle, wb, wg, out);
  },
  roomTone: (s, out, _p, stops) => {
    const src = loopNoise(s, s.brown, stops);
    const g = s.ctx.createGain();
    g.gain.value = 0.22;
    chain(src, filt(s, 'lowpass', 170, 0.7), g, out);
    const hum = loopOsc(s, 'sine', 50, stops);
    const hg = s.ctx.createGain();
    hg.gain.value = 0.012;
    chain(hum, hg, out);
  },
  drone: (s, out, p, stops) => {
    const lp = filt(s, 'lowpass', 190, 0.8);
    const base = s.ctx.createGain();
    base.gain.value = 0.18;
    chain(lp, base, out);
    for (const f of [55, 55.37, 82.41]) loopOsc(s, f > 80 ? 'sine' : 'sawtooth', f, stops).connect(lp);
    lfo(s, 0.05, 60, lp.frequency, stops);
    const dis = s.ctx.createGain();
    dis.gain.value = 0;
    dis.connect(out);
    for (const f of [1244.5, 1318.5]) {
      const o = loopOsc(s, 'sine', f, stops);
      const g = s.ctx.createGain();
      g.gain.value = 0.012;
      o.connect(g).connect(dis);
    }
    const sub = loopOsc(s, 'sine', 36, stops);
    const sg = s.ctx.createGain();
    sg.gain.value = 0.5;
    sub.connect(sg).connect(dis);
    p.dissonance = dis.gain;
  },
  buzz: (s, out, _p, stops) => {
    const o = loopOsc(s, 'sawtooth', 100, stops);
    const g = s.ctx.createGain();
    g.gain.value = 0.05;
    lfo(s, 2.7, 0.03, g.gain, stops);
    chain(o, filt(s, 'bandpass', 900, 1.2), g, out);
    const h = loopOsc(s, 'sine', 200, stops);
    const hg = s.ctx.createGain();
    hg.gain.value = 0.02;
    chain(h, hg, out);
  },
  clockTick: (s, out, _p, stops) => {
    const ctx = s.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (const [start, f] of [
      [0, 3100],
      [1, 2500],
    ] as const) {
      const i0 = Math.floor(start * ctx.sampleRate);
      for (let i = 0; i < ctx.sampleRate * 0.03; i++) {
        const t = i / ctx.sampleRate;
        d[i0 + i] = Math.sin(t * f * Math.PI * 2) * Math.exp(-t * 180) * 0.8 + (Math.random() - 0.5) * Math.exp(-t * 400) * 0.6;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    stops.push(() => src.stop());
    const g = ctx.createGain();
    g.gain.value = 0.35;
    chain(src, g, out);
  },
  tapeHiss: (s, out, _p, stops) => {
    const src = loopNoise(s, s.white, stops);
    const g = s.ctx.createGain();
    g.gain.value = 0.045;
    chain(src, filt(s, 'highpass', 4200, 0.7), g, out);
    const m = loopOsc(s, 'sawtooth', 48, stops);
    const mg = s.ctx.createGain();
    mg.gain.value = 0.02;
    chain(m, filt(s, 'lowpass', 200, 1), mg, out);
  },
  /** Música de persecución: golpes graves pulsantes y cuerdas en trémolo disonante. */
  chase: (s, out, p, stops) => {
    const master = s.ctx.createGain();
    master.gain.value = 0.6;
    master.connect(out);
    // pulso grave (≈ 132 bpm)
    const drum = loopNoise(s, s.brown, stops);
    const dlp = filt(s, 'lowpass', 120, 1.2);
    const dg = s.ctx.createGain();
    dg.gain.value = 0;
    const pulse = loopOsc(s, 'square', 2.2, stops);
    const pg = s.ctx.createGain();
    pg.gain.value = 0.55;
    pulse.connect(pg).connect(dg.gain);
    chain(drum, dlp, dg, master);
    // trémolo de cuerdas
    const strings = s.ctx.createGain();
    strings.gain.value = 0.05;
    lfo(s, 9, 0.045, strings.gain, stops);
    const sbp = filt(s, 'bandpass', 900, 0.9);
    chain(sbp, strings, master);
    for (const f of [220, 233.1, 311.1, 466.2]) loopOsc(s, 'sawtooth', f, stops).connect(sbp);
    p.intensity = master.gain;
  },
  /** Ambiente de suspenso: colchón grave que respira y un vidrio agudo apenas audible. */
  suspense: (s, out, _p, stops) => {
    const lp = filt(s, 'lowpass', 280, 0.9);
    const g = s.ctx.createGain();
    g.gain.value = 0.12;
    chain(lp, g, out);
    for (const f of [73.4, 77.8, 110]) loopOsc(s, 'sawtooth', f, stops).connect(lp);
    lfo(s, 0.07, 140, lp.frequency, stops);
    lfo(s, 0.11, 0.05, g.gain, stops);
    const hi = s.ctx.createGain();
    hi.gain.value = 0.006;
    lfo(s, 0.23, 0.005, hi.gain, stops);
    hi.connect(out);
    for (const f of [1567, 1661]) loopOsc(s, 'sine', f, stops).connect(hi);
  },
  monsterNear: (s, out, p, stops) => {
    const sub = loopOsc(s, 'sine', 37, stops);
    const g = s.ctx.createGain();
    g.gain.value = 0.5;
    chain(sub, g, out);
    const src = loopNoise(s, s.white, stops);
    const bp = filt(s, 'bandpass', 3100, 14);
    const wg = s.ctx.createGain();
    wg.gain.value = 0.25;
    lfo(s, 6.3, 0.2, wg.gain, stops);
    chain(src, bp, wg, out);
    p.intensity = g.gain;
  },
  zoomMotor: (s, out, _p, stops) => {
    const o = loopOsc(s, 'sawtooth', 95, stops);
    const g = s.ctx.createGain();
    g.gain.value = 0.05;
    chain(o, filt(s, 'bandpass', 1400, 2), g, out);
  },
  tvStatic: (s, out, _p, stops) => {
    const src = loopNoise(s, s.white, stops);
    const g = s.ctx.createGain();
    g.gain.value = 0.09;
    chain(src, filt(s, 'bandpass', 3500, 0.6), g, out);
  },
} satisfies Record<string, LoopRecipe>;

export type LoopName = keyof typeof LOOPS;
