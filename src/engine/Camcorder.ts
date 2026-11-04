import { a11y } from '../core/a11y';
import * as THREE from 'three';
import type { AudioSystem, LoopHandle } from '../audio/AudioSystem';
import { chance, damp, lerp, rand } from '../core/math';
import type { PostFX } from '../effects/PostFX';

export interface TapeFX {
  active: boolean;
  nv: boolean;
  glitch: number;
  black: number;
}

interface Pulse {
  amount: number;
  start: number;
  end: number;
}

/**
 * La videocámara: el centro de la mecánica.
 * Apagada = vista a ojo (oscura, sin la entidad, sin consumo).
 * Encendida = visor con ruido de sensor y la entidad visible; consume batería.
 * Visión nocturna = ve en la oscuridad total, consume el doble.
 */
export class Camcorder {
  on = false;
  nightVision = false;
  battery = 87;
  /** Segundos por 1% de batería. */
  static readonly DRAIN = { camera: 3.4, nightVision: 1.7, tape: 9 };
  drainBoost = 1;
  frozenBattery = false;
  recSeconds = 0;
  onFor = 0;
  offFor = 0;
  readonly ir: THREE.SpotLight;
  /** Fundido/negro forzado por eventos. */
  forcedBlack = 0;
  forcedStatic = 0;
  /** Destello blanco (final). */
  whiteout = 0;
  private white = 0;
  fade = 1;
  fadeTarget = 0;
  fadeSpeed = 0.5;
  readonly tape: TapeFX = { active: false, nv: false, glitch: 0, black: 0 };
  /** Proximidad de la entidad (0..1), la escribe el motor. */
  proximity = 0;
  private nvMix = 0;
  private nvFlash = 0;
  private powerAnim = 1;
  private offAnim = 1;
  private autoGain = 1;
  private pulses: Pulse[] = [];
  private glitch = 0;
  private tracking = 0;
  private staticAmt = 0;
  private distort = 0;
  private dropout = 0;
  private dropoutUntil = 0;
  private nextDropout = 0;
  private nextMicro = 25;
  private crossed = new Set<number>();
  private zoomLoop: LoopHandle | null = null;
  onThreshold: ((th: number) => void) | null = null;
  onDepleted: (() => void) | null = null;

  constructor(
    scene: THREE.Scene,
    private audio: AudioSystem,
  ) {
    this.ir = new THREE.SpotLight(0xffffff, 0, 11, Math.PI / 3.2, 0.6, 1.6);
    scene.add(this.ir, this.ir.target);
  }

  get display(): number {
    return this.battery <= 0 ? 0 : Math.max(1, Math.ceil(this.battery));
  }

  get instability(): number {
    const l = this.battery;
    return l > 20 ? 0 : l > 10 ? 0.2 : l > 5 ? 0.45 : l > 1 ? 0.7 : 1;
  }

  /** Nivel de glitch actual (para sacudir el HUD). */
  get glitchLevel(): number {
    return this.glitch;
  }

  powerOn(force = false): boolean {
    if (this.on) return false;
    if (this.battery <= 0 && !force) {
      this.audio.play('batteryLow', { bus: 'ui' });
      return false;
    }
    this.on = true;
    this.onFor = 0;
    this.powerAnim = 0;
    this.offAnim = 1;
    this.autoGain = 2.6;
    this.audio.play('camOn', { bus: 'ui' });
    return true;
  }

  powerOff(dead = false): void {
    if (!this.on) return;
    if (this.nightVision) this.setNightVision(false, true);
    this.on = false;
    this.offFor = 0;
    this.offAnim = 0;
    this.audio.play(dead ? 'batteryDead' : 'camOff', { bus: 'ui' });
  }

  setNightVision(v: boolean, silent = false): void {
    if (v === this.nightVision) return;
    if (v && !this.on && !this.powerOn()) return;
    this.nightVision = v;
    if (!silent) this.audio.play(v ? 'nvOn' : 'nvOff', { bus: 'ui', volume: 0.8 });
    if (v) this.nvFlash = 1;
  }

  addBattery(delta: number): void {
    const before = this.battery;
    this.battery = Math.min(100, Math.max(0, this.battery + delta));
    for (const th of [20, 10, 5, 1]) {
      if (before > th && this.battery <= th && !this.crossed.has(th)) {
        this.crossed.add(th);
        this.onThreshold?.(th);
      }
      if (this.battery > th + 2) this.crossed.delete(th);
    }
    if (before > 0 && this.battery <= 0) this.onDepleted?.();
  }

  /** Pulso de interferencia (eventos, entidad). */
  burst(amount: number, duration: number, now: number, sound = true): void {
    if (a11y.reduceFlashing) amount *= 0.3;
    this.pulses.push({ amount, start: now, end: now + duration });
    if (sound && this.on) this.audio.play('interference', { duration, volume: 0.4 + amount * 0.6, bus: 'ui' });
  }

  update(dt: number, now: number, camera: THREE.Camera, zoom: { current: number; target: number }): void {
    if (this.on) {
      this.onFor += dt;
      this.recSeconds += dt;
    } else this.offFor += dt;

    // consumo
    if (!this.frozenBattery && this.battery > 0) {
      const spp = this.tape.active ? Camcorder.DRAIN.tape : this.on ? (this.nightVision ? Camcorder.DRAIN.nightVision : Camcorder.DRAIN.camera) : 0;
      if (spp) this.addBattery((-dt / spp) * this.drainBoost);
    }

    // iluminador infrarrojo
    this.nvMix = damp(this.nvMix, this.on && this.nightVision ? 1 : 0, 9, dt);
    this.nvFlash = damp(this.nvFlash, 0, 2.2, dt);
    this.ir.position.copy(camera.position);
    this.ir.target.position.copy(camera.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 4);
    this.ir.intensity = (this.tape.active ? (this.tape.nv ? 1 : 0) : this.nvMix) * 17;

    // motor del zoom
    const zooming = Math.abs(zoom.current - zoom.target) > 0.02;
    if (zooming && !this.zoomLoop) this.zoomLoop = this.audio.loop('zoomMotor', { bus: 'ui', volume: 0.7 });
    if (!zooming && this.zoomLoop) {
      this.zoomLoop.stop(0.1);
      this.zoomLoop = null;
    }

    // interferencias
    const cam = this.on || this.tape.active;
    const inst = this.instability;
    this.pulses = this.pulses.filter((p) => p.end > now);
    let pg = 0;
    for (const p of this.pulses) pg = Math.max(pg, p.amount * (1 - (now - p.start) / (p.end - p.start)));
    if (cam && now > this.nextMicro) {
      this.nextMicro = now + rand(18, 45) * (1 - inst * 0.8);
      this.burst(rand(0.15, 0.3) + inst * 0.4, rand(0.08, 0.25), now, chance(0.6));
    }
    if (cam && inst >= 0.45 && now > this.nextDropout && this.forcedBlack < 0.5) {
      this.nextDropout = now + rand(1.5, 6) * (1.2 - inst);
      this.dropoutUntil = now + rand(0.06, 0.18 + inst * 0.3);
      if (chance(0.5)) this.audio.play('glitchBlip', { bus: 'ui', volume: 0.6 });
    }
    this.dropout = cam && now < this.dropoutUntil ? 1 : damp(this.dropout, 0, 30, dt);
    const prox = this.proximity;
    this.glitch = damp(this.glitch, Math.min(1, (cam ? inst * 0.35 + prox * 0.35 : 0) + pg), 12, dt);
    this.tracking = damp(this.tracking, Math.min(1, (cam ? inst * 0.4 + prox * 0.3 : 0) + pg * 0.8), 8, dt);
    this.staticAmt = damp(this.staticAmt, Math.min(1, (pg > 0.7 ? pg * 0.35 : 0) + (cam ? prox * prox * 0.08 : 0)), 14, dt);
    this.distort = damp(this.distort, cam ? prox : 0, 4, dt);

    this.powerAnim = Math.min(1, this.powerAnim + dt / 0.45);
    this.offAnim = Math.min(1, this.offAnim + dt / 0.9);
    this.autoGain = damp(this.autoGain, 1, 1.8, dt);
    this.fade = damp(this.fade, this.fadeTarget, this.fadeSpeed * 3, dt);
  }

  /** Arma el "look" del cuadro: ojo desnudo / cámara / visión nocturna / cinta. */
  compose(fx: PostFX, dt: number): void {
    const p = fx.params;
    const tape = this.tape.active;
    const camOn = this.on || tape;
    const nv = tape ? (this.tape.nv ? 1 : 0) : this.nvMix;
    let squeeze = 0;
    let stat = this.staticAmt;
    if (this.powerAnim < 1) {
      squeeze = Math.max(0, 1 - this.powerAnim * 2.2);
      stat = Math.max(stat, (1 - this.powerAnim) * 0.8);
    }
    let offBlack = 0;
    if (this.offAnim < 1) {
      squeeze = Math.max(squeeze, Math.min(1, this.offAnim * 4));
      offBlack = this.offAnim < 0.25 ? 0 : Math.max(0, 1 - (this.offAnim - 0.25) / 0.75);
    }
    p.eye = camOn ? 0 : this.offAnim < 0.25 ? 0 : damp(p.eye, 1, 10, dt);
    p.exposure = camOn ? lerp(1.9, 6.0, nv) * this.autoGain : 0.85;
    p.nv = nv;
    p.tape = tape ? 1 : 0;
    p.bleed = tape ? 0.65 : 0;
    p.noise = camOn ? lerp(0.055, 0.15, nv) + (tape ? 0.03 : 0) + this.glitch * 0.05 : 0.03;
    p.scan = camOn ? lerp(0.05, 0.09, nv) : 0;
    p.chroma = camOn ? 0.0012 + this.glitch * 0.006 : 0.0004;
    p.vignette = camOn ? lerp(0.45, 0.25, nv) : 0.85;
    p.glitch = camOn ? this.glitch + (tape ? this.tape.glitch : 0) : 0;
    p.tracking = camOn ? Math.min(1, this.tracking + (tape ? 0.08 : 0)) : 0;
    p.static = Math.min(1, stat + this.forcedStatic);
    p.distort = this.distort;
    p.squeeze = squeeze;
    this.white = damp(this.white, this.whiteout, 1.6, dt);
    p.flash = this.nvFlash * 0.25 * nv + this.white * 1.4;
    p.blackout = Math.min(1, Math.max(this.fade, offBlack, this.dropout * (camOn ? 1 : 0), this.forcedBlack, tape ? this.tape.black : 0));
  }
}
