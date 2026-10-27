import * as THREE from 'three';
import { clamp, damp, noise1, wrapAngle } from '../core/math';
import { GyroscopeController } from './GyroscopeController';

export type LookMode = 'gyro' | 'pointerlock' | 'drag';
const PITCH_LIMIT = 1.22;

export interface LookCallbacks {
  tap: () => void;
  zoom: (delta: number) => void;
  lockLost: () => void;
}

/**
 * Mirada en primera persona: giroscopio (orientación completa del dispositivo),
 * mouse con pointer lock o arrastre táctil. Suma temblor de mano y balanceo al caminar.
 */
export class LookController {
  mode: LookMode = 'drag';
  enabled = false;
  locked = false;
  sensitivity = 1;
  handheld = 0;
  yaw = 0;
  pitch = 0;
  private smoothYaw = 0;
  private smoothPitch = 0;
  private yawOffset = 0;
  private yawOffsetTarget = 0;
  private dx = 0;
  private dy = 0;
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: number }>();
  private pinch = 0;
  private intentionalUnlock = false;
  private ignoreClick = false;
  private skipMoves = 0;
  private smoothQ = new THREE.Quaternion();
  private targetQ = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private shakeAmount = 0;
  zoom = 1;
  zoomTarget = 1;
  private baseFov = 64;

  constructor(
    private el: HTMLElement,
    readonly gyro: GyroscopeController,
    private cb: LookCallbacks,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.cb.zoom(-Math.sign(e.deltaY) * 0.25);
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      // Chrome a veces manda un salto enorme justo al capturar el mouse: se descartan los primeros eventos
      if (this.locked) {
        this.skipMoves = 2;
        return;
      }
      if (this.intentionalUnlock) {
        this.intentionalUnlock = false;
        return;
      }
      if (this.enabled && this.mode === 'pointerlock') this.cb.lockLost();
    });
  }

  get usingGyro(): boolean {
    return this.mode === 'gyro' && this.gyro.active;
  }

  get prefersPointerLock(): boolean {
    return matchMedia('(pointer: fine)').matches && 'requestPointerLock' in this.el;
  }

  requestLock(): void {
    if (this.mode !== 'pointerlock' || this.locked) return;
    try {
      const r = this.el.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => undefined);
    } catch {
      /* el navegador no lo permite: se sigue con arrastre */
    }
  }

  exitLock(): void {
    if (!this.locked) return;
    this.intentionalUnlock = true;
    document.exitPointerLock();
  }

  setAspect(aspect: number, camera: THREE.PerspectiveCamera): void {
    camera.aspect = aspect;
    this.baseFov = aspect >= 1 ? 64 : clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(28)) / aspect)), 64, 92);
    camera.updateProjectionMatrix();
  }

  /** Centra la vista: lo que el jugador mira ahora pasa a ser "adelante" (-Z del mundo). */
  recenter(targetYaw = 0): void {
    if (this.usingGyro) {
      this.e.setFromQuaternion(this.gyro.quaternion, 'YXZ');
      this.yawOffsetTarget = this.yawOffset + wrapAngle(targetYaw - (this.e.y + this.yawOffset));
      this.yawOffset = this.yawOffsetTarget;
    } else {
      this.yaw = targetYaw;
      this.smoothYaw = targetYaw;
      this.pitch = 0;
    }
  }

  shake(a: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, a);
  }

  /** Yaw horizontal real de la cámara. */
  currentYaw(camera: THREE.Camera): number {
    this.e.setFromQuaternion(camera.quaternion, 'YXZ');
    return this.e.y;
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (this.mode === 'pointerlock' && !this.locked && e.pointerType === 'mouse') {
      this.requestLock();
      this.ignoreClick = true;
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 });
    if (this.pointers.size === 2) this.pinch = this.pinchDist();
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (this.locked) {
      if (this.skipMoves > 0) {
        this.skipMoves--;
        return;
      }
      if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
      const k = 0.0022 * this.sensitivity;
      this.dx -= e.movementX * k;
      this.dy -= e.movementY * k;
      return;
    }
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const mx = e.clientX - p.x;
    const my = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    p.moved += Math.abs(mx) + Math.abs(my);
    if (this.pointers.size >= 2) {
      const d = this.pinchDist();
      if (this.pinch > 0) this.cb.zoom((d - this.pinch) * 0.01);
      this.pinch = d;
      return;
    }
    const k = 0.0045 * this.sensitivity;
    this.dx += mx * k;
    if (!this.usingGyro) this.dy += my * k;
    if (e.cancelable) e.preventDefault();
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = 0;
    if (!this.enabled) return;
    if (this.locked && e.pointerType === 'mouse') {
      if (this.ignoreClick) this.ignoreClick = false;
      else this.cb.tap();
      return;
    }
    if (p && e.type === 'pointerup' && p.moved < 14 && performance.now() - p.t < 450) this.cb.tap();
  };

  private pinchDist(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  update(dt: number, time: number, camera: THREE.PerspectiveCamera, eye: THREE.Vector3, bob: number, bobPhase: number): void {
    const dx = this.dx;
    const dy = this.dy;
    this.dx = this.dy = 0;
    if (this.usingGyro) {
      this.gyro.update();
      if (this.enabled) {
        this.yawOffsetTarget += dx;
        this.yawOffset += dx;
      }
      this.yawOffset = damp(this.yawOffset, this.yawOffsetTarget, 4, dt);
      this.e.setFromQuaternion(this.gyro.quaternion, 'YXZ');
      this.e.set(clamp(this.e.x, -PITCH_LIMIT, PITCH_LIMIT), this.e.y + this.yawOffset, this.e.z * 0.6, 'YXZ');
      this.targetQ.setFromEuler(this.e);
      this.smoothQ.slerp(this.targetQ, 1 - Math.exp(-dt * 22));
    } else {
      if (this.enabled) {
        this.yaw += dx;
        this.pitch = clamp(this.pitch + dy, -PITCH_LIMIT, PITCH_LIMIT);
      }
      this.smoothYaw = damp(this.smoothYaw, this.yaw, 16, dt);
      this.smoothPitch = damp(this.smoothPitch, this.pitch, 16, dt);
      this.e.set(this.smoothPitch, this.smoothYaw, 0, 'YXZ');
      this.smoothQ.setFromEuler(this.e);
    }

    // temblor de mano + balanceo de pasos + sacudones
    const hh = this.handheld;
    this.shakeAmount = damp(this.shakeAmount, 0, 3, dt);
    const s = this.shakeAmount;
    this.e.set(
      (noise1(time * 0.47 + 17) - 0.5) * 0.012 * hh + Math.sin(bobPhase * 2) * 0.008 * bob + (Math.random() - 0.5) * s * 0.05,
      (noise1(time * 0.55 + 3) - 0.5) * 0.014 * hh + (Math.random() - 0.5) * s * 0.05,
      (noise1(time * 0.35 + 31) - 0.5) * 0.02 * hh,
      'YXZ',
    );
    camera.quaternion.copy(this.smoothQ).multiply(new THREE.Quaternion().setFromEuler(this.e));
    camera.position.copy(eye);
    camera.position.y += Math.abs(Math.sin(bobPhase)) * 0.035 * bob;

    this.zoom = damp(this.zoom, this.zoomTarget, 6, dt);
    const fov = this.baseFov / this.zoom;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }
}
