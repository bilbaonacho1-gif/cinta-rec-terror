import * as THREE from 'three';
import { noise1, rand } from '../core/math';
type RoomId = string;

export type FlickerMode = 'steady' | 'soft' | 'broken' | 'tv' | 'dying';

export interface LampFixture {
  id: string;
  room: RoomId;
  position: THREE.Vector3;
  color: THREE.Color;
  /** Intensidad en candelas (luces físicas de three). */
  intensity: number;
  distance: number;
  flicker: FlickerMode;
  on: boolean;
  /** Materiales emisivos que acompañan el parpadeo (bulbo, pantalla). */
  glows: THREE.MeshBasicMaterial[];
  /** Nivel actual 0..1 calculado por el pool. */
  level: number;
  /** Ruido de fase propio. */
  seed: number;
  /** Apagón temporal (eventos): hasta este tiempo la luz queda en 0. */
  outUntil: number;
  /** Multiplicador extra controlado por eventos. */
  boost: number;
}

export function makeFixture(
  id: string,
  room: RoomId,
  pos: THREE.Vector3,
  color: THREE.ColorRepresentation,
  intensity: number,
  distance: number,
  flicker: FlickerMode = 'steady',
  glows: THREE.MeshBasicMaterial[] = [],
): LampFixture {
  return {
    id,
    room,
    position: pos.clone(),
    color: new THREE.Color(color),
    intensity,
    distance,
    flicker,
    on: true,
    glows,
    level: 1,
    seed: Math.random() * 100,
    outUntil: 0,
    boost: 1,
  };
}

interface Slot {
  light: THREE.PointLight;
  fixture: LampFixture | null;
  fade: number;
}

/**
 * Pool fijo de luces puntuales reasignadas a las lámparas más cercanas al jugador.
 * Mantener un número constante de luces evita recompilar shaders y cuida el rendimiento móvil.
 */
export class LightPool {
  private slots: Slot[] = [];
  private reassignTimer = 0;
  private tmp = new THREE.Vector3();

  constructor(
    parent: THREE.Object3D,
    private fixtures: LampFixture[],
    count = 4,
  ) {
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 8, 2);
      light.castShadow = false;
      parent.add(light);
      this.slots.push({ light, fixture: null, fade: 0 });
    }
  }

  get all(): LampFixture[] {
    return this.fixtures;
  }

  get(id: string): LampFixture | undefined {
    return this.fixtures.find((f) => f.id === id);
  }

  private flickerValue(f: LampFixture, t: number): number {
    if (!f.on || t < f.outUntil) return 0;
    const s = f.seed;
    switch (f.flicker) {
      case 'steady':
        return 0.97 + noise1(t * 3 + s) * 0.03;
      case 'soft':
        return 0.82 + noise1(t * 6 + s) * 0.18 - (noise1(t * 0.7 + s) > 0.88 ? 0.5 : 0);
      case 'broken': {
        const burst = noise1(t * 0.9 + s);
        if (burst > 0.62) return noise1(t * 40 + s) > 0.5 ? 1 : 0.05;
        return 0.9 + noise1(t * 8 + s) * 0.1;
      }
      case 'dying': {
        const base = noise1(t * 1.3 + s);
        return base > 0.55 ? (noise1(t * 30 + s) > 0.4 ? 0.7 : 0.0) : 0.02;
      }
      case 'tv':
        return 0.55 + noise1(t * 18 + s) * 0.45;
    }
  }

  update(dt: number, t: number, playerPos: THREE.Vector3): void {
    for (const f of this.fixtures) {
      f.level = this.flickerValue(f, t) * f.boost;
      const glow = f.level;
      for (const m of f.glows) {
        const base = m.userData.baseColor as THREE.Color | undefined;
        const strength = (m.userData.baseStrength as number | undefined) ?? 1;
        if (base) m.color.copy(base).multiplyScalar(strength * (0.03 + glow * 0.97));
      }
    }

    this.reassignTimer -= dt;
    if (this.reassignTimer <= 0) {
      this.reassignTimer = 0.25;
      this.reassign(playerPos);
    }

    for (const s of this.slots) {
      const f = s.fixture;
      if (!f) {
        s.light.intensity = 0;
        continue;
      }
      const wanted = (s.light.userData.wanted as boolean) ?? true;
      s.fade = Math.min(1, Math.max(0, s.fade + (wanted ? dt * 3 : -dt * 4)));
      if (!wanted && s.fade <= 0) {
        s.fixture = null;
        s.light.intensity = 0;
        continue;
      }
      s.light.position.copy(f.position);
      s.light.color.copy(f.color);
      s.light.distance = f.distance;
      s.light.intensity = f.intensity * f.level * s.fade;
    }
  }

  private reassign(playerPos: THREE.Vector3): void {
    const candidates = this.fixtures
      .filter((f) => f.on && f.intensity > 0)
      .map((f) => ({ f, d: this.tmp.copy(f.position).sub(playerPos).lengthSq() }))
      .filter((c) => c.d < 22 * 22)
      .sort((a, b) => a.d - b.d)
      .slice(0, this.slots.length)
      .map((c) => c.f);

    // marcar slots que siguen siendo deseados
    for (const s of this.slots) s.light.userData.wanted = !!s.fixture && candidates.includes(s.fixture);
    // asignar fixtures nuevos a slots libres
    for (const f of candidates) {
      if (this.slots.some((s) => s.fixture === f)) continue;
      const free = this.slots.find((s) => !s.fixture) ?? this.slots.find((s) => !(s.light.userData.wanted as boolean) && s.fade <= 0.05);
      if (!free) continue;
      free.fixture = f;
      free.fade = 0;
      free.light.userData.wanted = true;
    }
  }

  /** Apagón breve de una lámpara (evento). */
  blackout(id: string, until: number): void {
    const f = this.get(id);
    if (f) f.outUntil = until;
  }

  /** Corte momentáneo de todas las luces cercanas (evento de interferencia). */
  flickerAll(now: number, duration = rand(0.2, 0.6)): void {
    for (const f of this.fixtures) f.outUntil = Math.max(f.outUntil, now + duration * rand(0.5, 1));
  }
}
