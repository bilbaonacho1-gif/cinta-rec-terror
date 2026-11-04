import * as THREE from 'three';
import type { Box2 } from '../types';

const RADIUS = 0.28;
const MAX_STEP = 0.05;

/**
 * Movimiento libre del jugador (WASD / flechas / joystick táctil) con colisiones
 * círculo-contra-caja: se desliza por las paredes en lugar de atravesarlas.
 */
export class PlayerController {
  readonly position = new THREE.Vector3();
  /** Entrada del joystick táctil (-1..1). */
  readonly joystick = { x: 0, y: 0 };
  /** Modo una mano: caminar hacia adelante mientras se mantiene apretada la pantalla. */
  holdForward = false;
  enabled = false;
  speed = 1.85;
  bob = 0;
  bobPhase = 0;
  private keys = new Set<string>();
  private stepDist = 0;
  private dir = new THREE.Vector3();
  onStep: (() => void) | null = null;

  constructor(spawn: THREE.Vector3) {
    this.position.copy(spawn);
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  reset(spawn: THREE.Vector3): void {
    this.position.copy(spawn);
    this.joystick.x = this.joystick.y = 0;
    this.keys.clear();
  }

  get moving(): boolean {
    return this.bob > 0.3;
  }

  update(dt: number, yaw: number, colliders: Box2[]): void {
    let ix = this.joystick.x;
    let iz = -this.joystick.y;
    if (this.holdForward && ix === 0 && iz === 0) iz = 0.75;
    if (this.enabled) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iz += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iz -= 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
    } else ix = iz = 0;
    const len = Math.hypot(ix, iz);
    if (len > 1) {
      ix /= len;
      iz /= len;
    }
    const amount = Math.min(1, Math.hypot(ix, iz));
    if (amount < 0.08) {
      this.bob = Math.max(0, this.bob - dt * 3);
      return;
    }
    // adelante = -Z rotado por el yaw de la mirada
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    // derecha = (cos yaw, 0, -sin yaw)
    this.dir.set(fx * iz + Math.cos(yaw) * ix, 0, fz * iz - Math.sin(yaw) * ix);
    this.dir.normalize().multiplyScalar(this.speed * amount * dt);

    // subpasos para no atravesar paredes delgadas
    const steps = Math.max(1, Math.ceil(this.dir.length() / MAX_STEP));
    const sx = this.dir.x / steps;
    const sz = this.dir.z / steps;
    for (let i = 0; i < steps; i++) {
      this.position.x += sx;
      this.position.z += sz;
      this.resolve(colliders);
    }

    this.bob = Math.min(1, this.bob + dt * 3);
    this.bobPhase += dt * 7.4 * amount;
    this.stepDist += this.speed * amount * dt;
    if (this.stepDist > 0.72) {
      this.stepDist = 0;
      this.onStep?.();
    }
  }

  private resolve(colliders: Box2[]): void {
    const p = this.position;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of colliders) {
        if (b.enabled && !b.enabled()) continue;
        const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= RADIUS * RADIUS) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (RADIUS - d);
          p.z += (dz / d) * (RADIUS - d);
        } else {
          // centro dentro de la caja: empujar por el eje más corto
          const left = p.x - b.minX + RADIUS;
          const right = b.maxX - p.x + RADIUS;
          const back = p.z - b.minZ + RADIUS;
          const front = b.maxZ - p.z + RADIUS;
          const m = Math.min(left, right, back, front);
          if (m === left) p.x -= left;
          else if (m === right) p.x += right;
          else if (m === back) p.z -= back;
          else p.z += front;
        }
      }
    }
  }
}
