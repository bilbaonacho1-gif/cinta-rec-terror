import * as THREE from 'three';
import type { AudioSystem, LoopHandle } from '../audio/AudioSystem';
import { chance, clamp, rand } from '../core/math';
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
  private cooldown = 0;
  private introSteps = 0;
  private raycaster = new THREE.Raycaster();
  private occ = [false, false, false];
  private frame = 0;
  private nearLoop: LoopHandle | null = null;
  private breathTimer = 0;
  private glide: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; pose: MonsterPose; node: string | null } | null = null;
  private glideTick = 0;
  // ---- caza: camina hacia el jugador, lo persigue, lo busca y se va
  hunt: 'roam' | 'chase' | 'search' | 'leave' = 'roam';
  private route: THREE.Vector3[] = [];
  private target = new THREE.Vector3();
  private lastKnown = new THREE.Vector3();
  private huntTimer = 0;
  private repathTimer = 0;
  private perceiveTimer = 0;
  private lostTimer = 0;
  private stepTimer = 0;
  private lastPos = new THREE.Vector3();
  private playerHidden = false;
  private sawHide = false;
  private canSeePlayer = false;
  private outOfFrameFor = 99;
  private stingerCooldown = 0;
  /** 0..1: intensidad de la música de persecución que pide la entidad. */
  chaseLevel = 0;
  /** Aparece en el visor después de un rato sin verlo: el motor dispara el golpe de susto. */
  onSighting: (() => void) | null = null;
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

  /**
   * El jugador entra o sale de un escondite. Si lo estaba persiguiendo de cerca y con línea de visión,
   * lo vio entrar: va directo al escondite.
   */
  setPlayerHidden(hidden: boolean): void {
    this.playerHidden = hidden;
    this.sawHide = hidden && this.present && this.mode === 'stalking' && this.hunt === 'chase' && this.canSeePlayer && this.distance < 4.5;
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
    if (this.mode === 'actor') {
      if (this.present) this.entity.animate(dt, time, false);
      return;
    }
    const playerFloor = playerEye.clone().setY(0);
    this.cooldown -= dt;

    if (!this.present) {
      this.entity.root.visible = false;
      this.proximity = Math.max(0, this.proximity - dt);
      this.setState('HIDDEN');
      this.chaseLevel = 0;
      if (this.mode === 'stalking' && this.cooldown <= 0) {
        const id = this.farthestNode(playerFloor, camera, cameraOn);
        this.placeAtNode(id, 'stand', playerFloor);
        this.beginRoam(playerFloor);
        this.audio.play('heavyStep', { pos: this.entity.root.position.clone().setY(0.1), volume: 1.2 });
      }
      return;
    }

    this.computeVisibility(camera, cameraOn);
    // regla principal: sólo existe para la cámara
    this.entity.root.visible = cameraOn;
    this.entity.animate(dt, time, this.observed || !this.inFrame);
    // golpe de susto: vuelve a aparecer en el visor después de un rato sin verlo
    this.stingerCooldown -= dt;
    if (this.inFrame && cameraOn) {
      if (this.outOfFrameFor > 6 && this.stingerCooldown <= 0 && this.distance < 14 && this.mode === 'stalking') {
        this.stingerCooldown = 22;
        this.onSighting?.();
      }
      this.outOfFrameFor = 0;
    } else this.outOfFrameFor += dt;

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
    else if (this.mode === 'stalking') this.updateHunt(dt, camera, cameraOn, playerEye, playerFloor);

    if (!this.present) return;
    const moving = this.entity.root.position.distanceToSquared(this.lastPos) > 1e-6;
    this.lastPos.copy(this.entity.root.position);
    this.setState(this.observed ? 'OBSERVED' : this.glide || moving ? 'MOVING' : this.distance < 2.6 ? 'NEAR' : this.inFrame ? 'IDLE' : 'HIDDEN');
    this.chaseLevel = this.mode === 'stalking' && this.hunt === 'chase' ? clamp(1.15 - this.distance / 10, 0.3, 1) : 0;
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

  // ------------------------------------------------------------------ caza
  private beginRoam(playerFloor: THREE.Vector3): void {
    this.hunt = 'roam';
    this.huntTimer = 0;
    // sabe más o menos dónde estás: apunta a un punto cerca tuyo
    const a = rand(0, Math.PI * 2);
    this.lastKnown.copy(playerFloor).add(new THREE.Vector3(Math.cos(a) * 2, 0, Math.sin(a) * 2));
    this.setTarget(this.house.waypoints.get(this.nearestNode(this.lastKnown))!.position);
  }

  private setTarget(p: THREE.Vector3): void {
    this.target.copy(p).setY(0);
    this.repathTimer = 0;
  }

  /** Ruta caminando: recta si hay vista directa en el mismo cuarto; si no, por la red de puntos (puertas). */
  private repath(): void {
    const from = this.entity.root.position;
    const sameRoom = this.house.roomAt(from) === this.house.roomAt(this.target);
    if (sameRoom && this.lineOfSight(from.clone().setY(1.0), this.target.clone().setY(1.0))) {
      this.route = [this.target.clone()];
      return;
    }
    const nodes = this.path(this.nearestNode(from), this.nearestNode(this.target));
    this.route = nodes.map((id) => this.house.waypoints.get(id)!.position.clone());
    this.route.push(this.target.clone());
  }

  /** ¿Te ve? (línea de visión desde la cabeza, hasta 11 m, si no estás escondido) */
  private perceive(playerEye: THREE.Vector3): boolean {
    if (this.playerHidden) return this.sawHide;
    const head = this.entity.root.position.clone().setY(1.8);
    if (head.distanceTo(playerEye) > 11) return false;
    return this.lineOfSight(head, playerEye);
  }

  private speed(): number {
    if (this.hunt === 'chase') return 1.1 + this.aggression * 0.7;
    if (this.hunt === 'leave') return 1.0;
    return 0.75 + this.aggression * 0.3;
  }

  private updateHunt(dt: number, camera: THREE.PerspectiveCamera, cameraOn: boolean, playerEye: THREE.Vector3, playerFloor: THREE.Vector3): void {
    this.huntTimer += dt;
    // percepción cada 0,25 s
    this.perceiveTimer -= dt;
    if (this.perceiveTimer <= 0) {
      this.perceiveTimer = 0.25;
      this.canSeePlayer = this.perceive(playerEye);
      if (this.canSeePlayer && this.hunt !== 'leave') {
        if (this.hunt !== 'chase') this.huntTimer = 0;
        this.hunt = 'chase';
        this.lastKnown.copy(playerFloor);
        this.lostTimer = 0;
      } else if (this.hunt === 'chase') {
        this.lostTimer += 0.25;
        if (this.lostTimer > 2.5) {
          // te perdió: va a buscarte al último lugar donde te vio
          this.hunt = 'search';
          this.huntTimer = 0;
          this.setTarget(this.lastKnown);
        }
      }
    }

    // mirarlo mucho tiempo de lejos lo espanta (cuando dejás de apuntarle se va)
    if (this.stareTotal > 9 && this.distance > 5 && this.hunt !== 'leave') {
      this.startLeave(camera, cameraOn, playerFloor);
      this.stareTotal = 0;
    }

    // objetivo según el estado
    if (this.hunt === 'chase') {
      this.repathTimer -= dt;
      if (this.repathTimer <= 0) {
        this.target.copy(this.lastKnown);
        this.repathTimer = 0.8;
        this.repath();
      }
    } else if (this.repathTimer <= 0) {
      this.repathTimer = 99;
      this.repath();
    }

    // te alcanzó
    const dist = this.distance;
    const catchable = !this.playerHidden || this.sawHide;
    if (catchable && dist < 1.15) {
      if (this.unobserved > 0.35) this.attack();
      return;
    }

    // regla principal: mientras lo mirás por el visor, no se mueve
    if (this.observed) return;

    const arrived = this.walk(dt, playerFloor);
    if (this.hunt === 'chase' && dist < 2.4 && this.entity.poseName !== 'reach') this.entity.setPose('reach');
    else if (this.hunt !== 'chase' && this.entity.poseName === 'reach') this.entity.setPose('stand');

    if (!arrived) return;
    if (this.hunt === 'roam') {
      // llegó a donde creía que estabas: busca un rato
      this.hunt = 'search';
      this.huntTimer = 0;
    } else if (this.hunt === 'search') {
      // mira alrededor
      this.entity.root.rotation.y += dt * 1.6;
      if (this.huntTimer > 5) {
        if (this.playerHidden) this.startLeave(camera, cameraOn, playerFloor);
        else this.beginRoam(playerFloor);
      }
    } else if (this.hunt === 'leave') {
      if (!this.pointInView(this.entity.root.position, camera, cameraOn)) {
        this.vanish(false);
        this.cooldown = rand(10, 18) - this.aggression * 6;
      }
    }
  }

  private startLeave(camera: THREE.Camera, cameraOn: boolean, playerFloor: THREE.Vector3): void {
    this.hunt = 'leave';
    this.huntTimer = 0;
    this.setTarget(this.house.waypoints.get(this.farthestNode(playerFloor, camera, cameraOn))!.position);
  }

  /** Camina por la ruta; devuelve true si ya llegó. Pasos pesados, cadenas y puertas que se abren a su paso. */
  private walk(dt: number, playerFloor: THREE.Vector3): boolean {
    const root = this.entity.root;
    while (this.route.length && root.position.distanceTo(this.route[0]) < 0.25) this.route.shift();
    const next = this.route[0];
    if (!next) return true;
    const sp = this.speed();
    const dir = next.clone().sub(root.position).setY(0);
    const len = dir.length();
    root.position.addScaledVector(dir.normalize(), Math.min(len, sp * dt));
    // mira hacia donde camina (o a vos, si te persigue de cerca)
    const look = this.hunt === 'chase' && this.distance < 4 ? playerFloor.clone().sub(root.position) : dir;
    const want = Math.atan2(look.x, look.z);
    let d = want - root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    root.rotation.y += d * Math.min(1, dt * 6);
    // puerta del escritorio cerrada: la abre de un golpe
    const study = this.house.doors.study;
    if (!study.open && root.position.distanceTo(study.center.clone().setY(0)) < 1.1) {
      study.setOpen(true, false, 3);
      this.audio.play('doorOpen', { pos: study.center, volume: 1.4 });
      this.audio.play('thud', { pos: study.center, volume: 1.0 });
    }
    // pasos
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = 0.68 / (sp / 0.9);
      const pos = root.position.clone().setY(0.1);
      this.audio.play('heavyStep', { pos, volume: this.hunt === 'chase' ? 1.4 : 1.1, rate: rand(0.9, 1.1) });
      if (chance(0.18)) this.audio.play('chains', { pos: pos.setY(0.4), duration: 0.8, volume: 0.7 });
    }
    return false;
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
