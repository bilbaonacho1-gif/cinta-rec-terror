import * as THREE from 'three';
import type { AudioSystem, LoopHandle } from '../audio/AudioSystem';
import { chance, clamp, lerp, pick, rand } from '../core/math';
import { MonsterEntity, MonsterPose } from '../entities/Monster';
import type { Waypoint } from '../types';
import type { HouseBuilder } from './HouseBuilder';

export type EntityMode = 'dormant' | 'intro' | 'stalking' | 'actor';
export type EntityState = 'HIDDEN' | 'IDLE' | 'OBSERVED' | 'MOVING' | 'NEAR' | 'ATTACK' | 'DISAPPEAR';

/** Zona central del visor donde la entidad se considera observada (NDC). */
const FOCUS_X = 0.72;
const FOCUS_Y = 0.82;

/**
 * La entidad de la casa Carvajal.
 *  - Sólo se la ve a través de la cámara encendida.
 *  - Mientras está en el centro del visor (y hay línea de visión) no se mueve.
 *  - Cuando nadie la mira avanza por una red de puntos entre habitaciones: nunca atraviesa paredes.
 *  - Cuanto más cintas encontrás, más agresiva.
 */
export class EntitySystem {
  readonly entity = new MonsterEntity();
  mode: EntityMode = 'dormant';
  state: EntityState = 'HIDDEN';
  present = false;
  observed = false;
  inFrame = false;
  everSeen = false;
  distance = 99;
  angle = 180;
  proximity = 0;
  aggression = 0.2;
  unobserved = 0;
  node: string | null = null;
  private observedFor = 0;
  /** Tiempo total observada en el lugar actual. */
  private stareTotal = 0;
  private seenHere = false;
  private stepDelay = 6;
  private cooldown = 0;
  private introSteps = 0;
  private raycaster = new THREE.Raycaster();
  private occ = [false, false, false];
  private frame = 0;
  private nearLoop: LoopHandle | null = null;
  private breathTimer = 0;
  private glide: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; pose: MonsterPose; node: string | null } | null = null;
  private glideTick = 0;
  onAttack: (() => void) | null = null;
  onFirstSeen: (() => void) | null = null;
  onIntroDone: (() => void) | null = null;

  constructor(
    scene: THREE.Scene,
    private house: HouseBuilder,
    private audio: AudioSystem,
  ) {
    scene.add(this.entity.root);
  }

  // ------------------------------------------------------------------ API
  setAggressionFromTapes(found: number): void {
    this.aggression = clamp(0.2 + found * 0.26, 0, 1);
  }

  /** Primera aparición: al fondo del pasillo, sin susto. */
  startIntro(playerPos: THREE.Vector3): void {
    this.mode = 'intro';
    this.introSteps = 0;
    const far = playerPos.z > -9 ? 'H5' : 'H0';
    this.placeAtNode(far, 'hang', playerPos);
  }

  startStalking(cooldown = 12): void {
    if (this.mode === 'actor') return;
    this.mode = 'stalking';
    this.cooldown = cooldown;
  }

  reset(): void {
    this.vanish(false);
    this.mode = 'dormant';
    this.everSeen = false;
    this.aggression = 0.2;
  }

  /** Para cinemáticas (cintas, final): la entidad queda bajo control del guion. */
  actor(pos: THREE.Vector3 | null, lookAt?: THREE.Vector3, pose: MonsterPose = 'stand'): void {
    this.mode = 'actor';
    this.stopNear();
    if (!pos) {
      this.entity.root.visible = false;
      this.present = false;
      return;
    }
    this.present = true;
    this.entity.placeFacing(pos, lookAt ?? pos.clone().add(new THREE.Vector3(0, 0, 1)));
    this.entity.setPose(pose);
    this.entity.root.visible = true;
  }

  /** Guarda el estado antes de una cinta (la entidad actúa dentro de la grabación). */
  snapshot(): { mode: EntityMode; present: boolean; node: string | null; pos: THREE.Vector3; rotY: number; pose: MonsterPose } {
    return {
      mode: this.mode,
      present: this.present,
      node: this.node,
      pos: this.entity.root.position.clone(),
      rotY: this.entity.root.rotation.y,
      pose: this.entity.poseName,
    };
  }

  restore(s: ReturnType<EntitySystem['snapshot']>): void {
    this.mode = s.mode;
    this.present = s.present;
    this.node = s.node;
    this.entity.root.position.copy(s.pos);
    this.entity.root.rotation.set(0, s.rotY, 0);
    this.entity.setPose(s.pose);
    this.unobserved = 0;
  }

  // ------------------------------------------------------------------ internos
  private setState(s: EntityState): void {
    this.state = s;
  }

  private placeAtNode(id: string, pose: MonsterPose, playerPos: THREE.Vector3): void {
    const wp = this.house.waypoints.get(id)!;
    this.node = id;
    this.present = true;
    this.glide = null;
    this.entity.placeFacing(wp.position, playerPos.clone().setY(0));
    this.entity.setPose(pose);
    this.unobserved = 0;
    this.observedFor = 0;
    this.stareTotal = 0;
    this.seenHere = false;
    this.stepDelay = this.nextDelay();
  }

  private vanish(sound = true): void {
    if (!this.present) return;
    this.present = false;
    this.glide = null;
    this.entity.root.visible = false;
    this.stopNear();
    this.setState('DISAPPEAR');
    if (sound) this.audio.play('whoosh', { pos: this.entity.root.position.clone().setY(1.5), volume: 0.35 });
  }

  private nextDelay(): number {
    return lerp(7.5, 2.3, this.aggression) * rand(0.8, 1.2);
  }

  private nearestNode(p: THREE.Vector3): string {
    const room = this.house.roomAt(p);
    let best = '';
    let bestD = Infinity;
    for (const wp of this.house.waypoints.values()) {
      const d = wp.position.distanceToSquared(new THREE.Vector3(p.x, 0, p.z)) + (wp.room === room ? 0 : 400);
      if (d < bestD) {
        bestD = d;
        best = wp.id;
      }
    }
    return best;
  }

  /** Camino más corto (BFS) por la red de puntos. */
  private path(from: string, to: string): string[] {
    const prev = new Map<string, string | null>([[from, null]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === to) break;
      for (const n of this.house.waypoints.get(cur)!.links) {
        if (prev.has(n)) continue;
        prev.set(n, cur);
        queue.push(n);
      }
    }
    if (!prev.has(to)) return [];
    const out: string[] = [];
    for (let c: string | null = to; c && c !== from; c = prev.get(c) ?? null) out.unshift(c);
    return out;
  }

  private farthestNode(p: THREE.Vector3, camera: THREE.Camera, cameraOn: boolean): string {
    const list = [...this.house.waypoints.values()]
      .filter((w) => !this.pointInView(w.position, camera, cameraOn))
      .sort((a, b) => b.position.distanceToSquared(p) - a.position.distanceToSquared(p));
    return (list[Math.floor(Math.random() * Math.min(3, list.length))] ?? list[0]).id;
  }

  private pointInView(p: THREE.Vector3, camera: THREE.Camera, cameraOn: boolean): boolean {
    if (!cameraOn) return false;
    const v = p.clone();
    v.y += 1.4;
    v.project(camera);
    return v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
  }

  private lineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = to.clone().sub(from);
    const d = dir.length();
    this.raycaster.set(from, dir.normalize());
    this.raycaster.far = Math.max(0.01, d - 0.25);
    return this.raycaster.intersectObjects(this.house.occluders, false).length === 0;
  }

  private computeVisibility(camera: THREE.PerspectiveCamera, cameraOn: boolean): void {
    const camPos = camera.position;
    const chest = this.entity.probes[1].getWorldPosition(new THREE.Vector3());
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    this.angle = THREE.MathUtils.radToDeg(Math.acos(clamp(fwd.dot(chest.clone().sub(camPos).normalize()), -1, 1)));
    const root = this.entity.root.position;
    this.distance = Math.hypot(root.x - camPos.x, root.z - camPos.z);
    this.observed = false;
    this.inFrame = false;
    if (!cameraOn) return;
    this.frame++;
    this.entity.probes.forEach((probe, i) => {
      const wp = probe.getWorldPosition(new THREE.Vector3());
      const ndc = wp.clone().project(camera);
      if (ndc.z > 1 || ndc.z < -1 || Math.abs(ndc.x) > 1.02 || Math.abs(ndc.y) > 1.02) return;
      if ((this.frame + i) % 3 === 0) this.occ[i] = !this.lineOfSight(camPos, wp);
      if (this.occ[i]) return;
      this.inFrame = true;
      if (Math.abs(ndc.x) < FOCUS_X && Math.abs(ndc.y) < FOCUS_Y) this.observed = true;
    });
  }

  /** Mover: se desliza entrecortado si está en la periferia del cuadro; si nadie mira, aparece en el nuevo lugar. */
  private moveTo(pos: THREE.Vector3, pose: MonsterPose, node: string | null, camera: THREE.Camera, cameraOn: boolean, playerFloor: THREE.Vector3, force = false): boolean {
    if (this.inFrame) {
      this.glide = { from: this.entity.root.position.clone(), to: pos.clone(), t: 0, dur: Math.max(0.8, this.entity.root.position.distanceTo(pos) / 0.7), pose, node };
      return true;
    }
    if (!force && this.pointInView(pos, camera, cameraOn)) return false;
    this.entity.placeFacing(pos, playerFloor);
    this.entity.setPose(pose);
    this.node = node;
    if (chance(cameraOn ? 0.45 : 0.75)) this.audio.play('monsterStep', { pos: pos.clone().setY(0.2), volume: 0.9 });
    // el Familiar arrastra cadenas
    if (chance(0.35)) this.audio.play('chains', { pos: pos.clone().setY(0.3), duration: 0.9, volume: 0.8 });
    this.setState('MOVING');
    return true;
  }

  update(dt: number, time: number, camera: THREE.PerspectiveCamera, cameraOn: boolean, playerEye: THREE.Vector3): void {
    if (this.mode === 'actor') return;
    const playerFloor = playerEye.clone().setY(0);
    this.cooldown -= dt;

    if (!this.present) {
      this.entity.root.visible = false;
      this.proximity = Math.max(0, this.proximity - dt);
      this.setState('HIDDEN');
      if (this.mode === 'stalking' && this.cooldown <= 0) {
        const id = this.farthestNode(playerFloor, camera, cameraOn);
        this.placeAtNode(id, pick(['stand', 'hang', 'lean'] as const), playerFloor);
      }
      return;
    }

    this.computeVisibility(camera, cameraOn);
    // regla principal: sólo existe para la cámara
    this.entity.root.visible = cameraOn;
    this.entity.animate(dt, time, this.observed || !this.inFrame);

    if (this.observed) {
      if (!this.everSeen) {
        this.everSeen = true;
        this.onFirstSeen?.();
      }
      this.observedFor += dt;
      this.stareTotal += dt;
      this.unobserved = 0;
      this.seenHere = true;
    } else {
      this.observedFor = 0;
      this.unobserved += dt;
    }

    // deslizamiento en curso: se congela si la mirada la atrapa
    if (this.glide) {
      const g = this.glide;
      if (!this.observed) {
        g.t = Math.min(1, g.t + dt / g.dur);
        this.glideTick -= dt;
        if (this.glideTick <= 0) {
          this.glideTick = rand(0.08, 0.2);
          this.entity.placeFacing(g.from.clone().lerp(g.to, g.t), playerFloor);
        }
        if (g.t >= 1) {
          this.entity.placeFacing(g.to, playerFloor);
          this.entity.setPose(g.pose);
          this.node = g.node;
          this.glide = null;
        }
      }
    } else if (this.mode === 'intro') this.updateIntro(camera, cameraOn, playerFloor);
    else if (this.mode === 'stalking') this.updateStalk(camera, cameraOn, playerEye, playerFloor);

    if (!this.present) return;
    this.setState(this.observed ? 'OBSERVED' : this.glide ? 'MOVING' : this.distance < 2.6 ? 'NEAR' : this.inFrame ? 'IDLE' : 'HIDDEN');
    this.proximity = cameraOn ? clamp(1 - (this.distance - 1.2) / 6, 0, 1) * (this.inFrame ? 1 : 0.5) : 0;
    this.updateAudio(dt);
  }

  private updateIntro(camera: THREE.Camera, cameraOn: boolean, playerFloor: THREE.Vector3): void {
    // espera a ser vista; si el jugador tarda, un crujido la delata
    if (!this.seenHere) {
      if (this.unobserved > 12 && this.introSteps === 0 && cameraOn && this.unobserved < 12.1) {
        this.audio.play('creak', { pos: this.entity.root.position.clone().setY(0.3), volume: 1.2, duration: 1.1 });
      }
      if (this.unobserved < (cameraOn ? 22 : 5)) return;
    } else if (this.unobserved < 0.6) return;

    const dist = this.entity.root.position.distanceTo(playerFloor);
    if (this.introSteps >= 3 || dist < 5) {
      this.vanish();
      this.mode = 'dormant';
      this.onIntroDone?.();
      return;
    }
    const target = this.entity.root.position.clone().lerp(playerFloor, Math.min(0.42, 3.2 / dist));
    const poses: MonsterPose[] = ['stand', 'lean', 'reach'];
    if (this.moveTo(target, poses[this.introSteps], null, camera, cameraOn, playerFloor)) {
      this.introSteps++;
      this.seenHere = false;
      this.unobserved = 0;
    }
  }

  private updateStalk(camera: THREE.PerspectiveCamera, cameraOn: boolean, playerEye: THREE.Vector3, playerFloor: THREE.Vector3): void {
    // sostenerle la mirada mucho tiempo desde lejos la hace irse (cuando dejás de apuntarle)
    if (this.stareTotal > 7 && this.distance > 4 && this.unobserved > 0.5) {
      this.vanish();
      this.cooldown = rand(8, 15);
      return;
    }

    const sameRoom = this.house.roomAt(this.entity.root.position) === this.house.roomAt(playerFloor);
    const dist = this.distance;
    if (dist < 1.5) {
      if (this.unobserved > 1.0) this.attack();
      return;
    }
    if (this.unobserved < this.stepDelay) return;

    let moved = false;
    if (sameRoom && dist < 6.5 && this.lineOfSight(this.entity.probes[0].getWorldPosition(new THREE.Vector3()), playerEye)) {
      // acercamiento final, en línea recta
      const dir = playerFloor.clone().sub(this.entity.root.position).setY(0).normalize();
      const len = Math.min(1.5, dist - 1.2);
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(rand(-0.25, 0.25));
      const next = this.entity.root.position.clone().addScaledVector(dir, len).add(side);
      moved = this.moveTo(next, dist - len < 2.4 ? 'reach' : pick(['lean', 'stand', 'crouch'] as const), null, camera, cameraOn, playerFloor, true);
    } else {
      const from = this.node ?? this.nearestNode(this.entity.root.position);
      const route = this.path(from, this.nearestNode(playerFloor));
      if (route.length) {
        const wp = this.house.waypoints.get(route[0])!;
        moved = this.moveTo(wp.position, pick(['stand', 'hang', 'lean'] as const), wp.id, camera, cameraOn, playerFloor);
      } else moved = true;
    }
    if (moved) {
      this.unobserved = 0;
      this.stareTotal = 0;
      this.stepDelay = this.nextDelay();
    } else this.unobserved = this.stepDelay - 0.5;
  }

  private attack(): void {
    this.setState('ATTACK');
    this.stopNear();
    this.mode = 'dormant';
    this.onAttack?.();
  }

  private updateAudio(dt: number): void {
    const pos = this.entity.root.position.clone().setY(1.7);
    if (this.distance < 6.5) {
      const loop = this.nearLoop ?? (this.nearLoop = this.audio.loop('monsterNear', { pos, volume: 0 }));
      loop.setPosition(pos);
      loop.setVolume((1 - this.distance / 6.5) * 0.55, 0.3);
    } else this.stopNear();
    if (this.distance < 3.4 && !this.observed) {
      this.breathTimer -= dt;
      if (this.breathTimer <= 0) {
        this.breathTimer = rand(3.8, 5.5);
        this.audio.play('monsterBreath', { pos, volume: 0.9 });
      }
    }
  }

  private stopNear(): void {
    this.nearLoop?.stop(0.6);
    this.nearLoop = null;
  }

  /** Para depuración: puntos de la red. */
  get waypointList(): Waypoint[] {
    return [...this.house.waypoints.values()];
  }
}
