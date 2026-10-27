import * as THREE from 'three';
import { AUDIO_FILES } from './manifest';
import { LOOPS, LoopName, SOUNDS, SoundName } from './sounds';

export interface PlayOptions {
  /** Posición 3D (audio espacial HRTF). Sin posición = sonido "en la cabeza". */
  pos?: THREE.Vector3;
  volume?: number;
  rate?: number;
  delay?: number;
  duration?: number;
  bus?: 'sfx' | 'ui' | 'tape';
  pan?: number;
}

export interface LoopHandle {
  setVolume(v: number, ramp?: number): void;
  setPosition(p: THREE.Vector3): void;
  setParam(name: string, v: number, ramp?: number): void;
  stop(fade?: number): void;
  readonly alive: boolean;
}

export interface SynthContext {
  ctx: AudioContext;
  white: AudioBuffer;
  brown: AudioBuffer;
  pink: AudioBuffer;
}

/**
 * Motor de audio procedural. Todos los sonidos se sintetizan en tiempo real con WebAudio,
 * por lo que el juego no necesita archivos externos. Si se agregan archivos en
 * public/audio y se registran en manifest.ts, reemplazan al sonido sintetizado.
 */
export class AudioSystem {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<'sfx' | 'ui' | 'tape' | 'amb', GainNode>;
  private synth!: SynthContext;
  private files = new Map<string, AudioBuffer>();
  private volume = 0.9;
  private tension = 0;
  private drone: LoopHandle | null = null;
  private wind: LoopHandle | null = null;
  private roomTone: LoopHandle | null = null;
  muffle = 0;
  private lowpass!: BiquadFilterNode;

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Crear/reanudar el contexto. Debe llamarse desde un gesto del usuario (iOS). */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.build();
    }
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* noop */
      }
    }
    // buffer silencioso: desbloquea la salida en iOS
    const b = this.ctx.createBuffer(1, 1, 22050);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.ctx.destination);
    s.start();
    void this.loadFiles();
  }

  private build(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 20000;
    this.master.connect(this.lowpass).connect(comp).connect(ctx.destination);
    const bus = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(this.master);
      return g;
    };
    this.buses = { sfx: bus(1), ui: bus(0.55), tape: bus(0.9), amb: bus(0.8) };
    const mk = (fill: (d: Float32Array) => void) => {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      fill(buf.getChannelData(0));
      return buf;
    };
    const white = mk((d) => {
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    });
    const brown = mk((d) => {
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    });
    const pink = mk((d) => {
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0,
        b4 = 0,
        b5 = 0,
        b6 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    });
    this.synth = { ctx, white, brown, pink };
  }

  private async loadFiles(): Promise<void> {
    if (!this.ctx) return;
    for (const [name, file] of Object.entries(AUDIO_FILES)) {
      if (!file || this.files.has(name)) continue;
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}audio/${file}`);
        if (!res.ok) continue;
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.files.set(name, buf);
      } catch {
        /* se usa el sonido sintetizado */
      }
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  async suspend(): Promise<void> {
    if (this.ctx?.state === 'running') await this.ctx.suspend();
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
  }

  /** Salida hacia un bus, opcionalmente espacializada. */
  private output(o: PlayOptions): { node: AudioNode; panner?: PannerNode } {
    const ctx = this.ctx!;
    const bus = this.buses[o.bus ?? 'sfx'];
    const g = ctx.createGain();
    g.gain.value = o.volume ?? 1;
    if (o.pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1.2;
      p.rolloffFactor = 1.1;
      p.maxDistance = 40;
      setPannerPos(p, o.pos);
      g.connect(p).connect(bus);
      return { node: g, panner: p };
    }
    if (o.pan) {
      const sp = ctx.createStereoPanner();
      sp.pan.value = o.pan;
      g.connect(sp).connect(bus);
      return { node: g };
    }
    g.connect(bus);
    return { node: g };
  }

  play(name: SoundName, o: PlayOptions = {}): number {
    if (!this.ctx || this.ctx.state !== 'running') return 0;
    const out = this.output(o);
    const t0 = this.ctx.currentTime + (o.delay ?? 0) + 0.005;
    const file = this.files.get(name);
    if (file) {
      const s = this.ctx.createBufferSource();
      s.buffer = file;
      s.playbackRate.value = o.rate ?? 1;
      s.connect(out.node);
      s.start(t0);
      return file.duration;
    }
    return SOUNDS[name](this.synth, out.node, t0, o);
  }

  loop(name: LoopName, o: PlayOptions = {}): LoopHandle {
    if (!this.ctx) return deadLoop;
    const out = this.output(o);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(out.node);
    const params: Record<string, AudioParam> = {};
    const stopFns: (() => void)[] = [];
    const file = this.files.get(name);
    if (file) {
      const s = this.ctx.createBufferSource();
      s.buffer = file;
      s.loop = true;
      s.connect(gain);
      s.start();
      stopFns.push(() => s.stop());
    } else {
      LOOPS[name](this.synth, gain, params, stopFns);
    }
    const ctx = this.ctx;
    gain.gain.setTargetAtTime(1, ctx.currentTime, 0.3);
    let alive = true;
    const outGain = out.node as GainNode;
    return {
      get alive() {
        return alive;
      },
      setVolume(v, ramp = 0.3) {
        if (!alive) return;
        outGain.gain.setTargetAtTime(v, ctx.currentTime, ramp);
      },
      setPosition(p) {
        if (alive && out.panner) setPannerPos(out.panner, p);
      },
      setParam(n, v, ramp = 0.2) {
        const prm = params[n];
        if (alive && prm) prm.setTargetAtTime(v, ctx.currentTime, ramp);
      },
      stop(fade = 0.4) {
        if (!alive) return;
        alive = false;
        gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
        setTimeout(() => {
          stopFns.forEach((f) => {
            try {
              f();
            } catch {
              /* noop */
            }
          });
          gain.disconnect();
        }, fade * 1000 + 200);
      },
    };
  }

  /** Capas de ambiente permanentes: viento, tono de la casa y dron de tensión. */
  startAmbience(): void {
    if (!this.ctx || this.drone) return;
    this.wind = this.loop('wind', { volume: 0.35 });
    this.roomTone = this.loop('roomTone', { volume: 0.5 });
    this.drone = this.loop('drone', { volume: 0.0 });
  }

  setTension(t: number): void {
    this.tension = THREE.MathUtils.clamp(t, 0, 1);
    this.drone?.setVolume(0.08 + this.tension * 0.55, 1.5);
    this.drone?.setParam('dissonance', this.tension, 2);
  }

  get currentTension(): number {
    return this.tension;
  }

  setWind(v: number): void {
    this.wind?.setVolume(v, 1.5);
  }

  /** Apaga todo (fin de partida) salvo el tono de la casa. */
  silence(except: 'roomTone' | 'none' = 'roomTone'): void {
    this.drone?.setVolume(0, 0.2);
    this.wind?.setVolume(0, 0.2);
    if (except !== 'roomTone') this.roomTone?.setVolume(0, 0.2);
  }

  restoreAmbience(): void {
    this.wind?.setVolume(0.35, 1);
    this.roomTone?.setVolume(0.5, 1);
    this.setTension(this.tension);
  }

  setMuffle(amount: number): void {
    if (!this.ctx) return;
    this.muffle = amount;
    this.lowpass.frequency.setTargetAtTime(20000 - amount * 19000, this.ctx.currentTime, 0.1);
  }

  updateListener(cam: THREE.Camera): void {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = cam.getWorldPosition(tmpV);
    const f = cam.getWorldDirection(tmpF);
    const u = tmpU.set(0, 1, 0).applyQuaternion(cam.quaternion);
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02);
      l.forwardY.setTargetAtTime(f.y, t, 0.02);
      l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(u.x, t, 0.02);
      l.upY.setTargetAtTime(u.y, t, 0.02);
      l.upZ.setTargetAtTime(u.z, t, 0.02);
    } else {
      const legacy = l as unknown as { setPosition(x: number, y: number, z: number): void; setOrientation(a: number, b: number, c: number, d: number, e: number, f: number): void };
      legacy.setPosition(p.x, p.y, p.z);
      legacy.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }
}

const tmpV = new THREE.Vector3();
const tmpF = new THREE.Vector3();
const tmpU = new THREE.Vector3();

function setPannerPos(p: PannerNode, v: THREE.Vector3): void {
  if (p.positionX) {
    p.positionX.value = v.x;
    p.positionY.value = v.y;
    p.positionZ.value = v.z;
  } else {
    (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(v.x, v.y, v.z);
  }
}

const deadLoop: LoopHandle = {
  alive: false,
  setVolume() {},
  setPosition() {},
  setParam() {},
  stop() {},
};
