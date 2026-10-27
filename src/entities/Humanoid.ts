import * as THREE from 'three';
import { lerp } from '../core/math';

export type JointName =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'shoulderL'
  | 'shoulderR'
  | 'upperArmL'
  | 'upperArmR'
  | 'foreArmL'
  | 'foreArmR'
  | 'handL'
  | 'handR'
  | 'thighL'
  | 'thighR'
  | 'shinL'
  | 'shinR'
  | 'footL'
  | 'footR';

/** Rotaciones por articulación [x, y, z] en radianes + altura relativa de cadera. */
export interface Pose {
  joints: Partial<Record<JointName, [number, number, number]>>;
  hips?: number;
}

export interface HumanoidProportions {
  thigh: number;
  shin: number;
  spine: number;
  chest: number;
  neck: number;
  headH: number;
  headW: number;
  shoulder: number;
  upperArm: number;
  foreArm: number;
  hand: number;
  hipWidth: number;
  rThigh: number;
  rShin: number;
  rUpper: number;
  rFore: number;
  rNeck: number;
  torsoW: number;
  torsoD: number;
}

/**
 * Esqueleto jerárquico simple hecho con grupos. Cada extremidad cuelga en -Y desde su articulación.
 * El personaje mira hacia +Z. Se usa para la entidad, para Lucía y para el "otro" jugador de las cintas.
 */
export class Humanoid {
  readonly root = new THREE.Group();
  readonly joints = {} as Record<JointName, THREE.Group>;
  private target: Pose | null = null;
  private current: Pose = { joints: {} };
  private hipsBase: number;

  constructor(readonly p: HumanoidProportions) {
    const j = (name: JointName, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x, y, z);
      parent.add(g);
      this.joints[name] = g;
      return g;
    };
    this.hipsBase = p.thigh + p.shin;
    const hips = j('hips', this.root, 0, this.hipsBase, 0);
    const spine = j('spine', hips, 0, 0.02, 0);
    const chest = j('chest', spine, 0, p.spine, 0);
    const neck = j('neck', chest, 0, p.chest, 0);
    j('head', neck, 0, p.neck, 0);
    const shL = j('shoulderL', chest, p.shoulder, p.chest * 0.92, 0);
    const shR = j('shoulderR', chest, -p.shoulder, p.chest * 0.92, 0);
    const uaL = j('upperArmL', shL, 0, 0, 0);
    const uaR = j('upperArmR', shR, 0, 0, 0);
    const faL = j('foreArmL', uaL, 0, -p.upperArm, 0);
    const faR = j('foreArmR', uaR, 0, -p.upperArm, 0);
    j('handL', faL, 0, -p.foreArm, 0);
    j('handR', faR, 0, -p.foreArm, 0);
    const thL = j('thighL', hips, p.hipWidth, 0, 0);
    const thR = j('thighR', hips, -p.hipWidth, 0, 0);
    const shinL = j('shinL', thL, 0, -p.thigh, 0);
    const shinR = j('shinR', thR, 0, -p.thigh, 0);
    j('footL', shinL, 0, -p.shin, 0);
    j('footR', shinR, 0, -p.shin, 0);
  }

  /** Cápsula que cuelga desde la articulación. */
  limb(joint: JointName, length: number, radius: number, material: THREE.Material, radiusBottom = radius, segments = 8): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(radius, radiusBottom, length, segments, 1);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = -length / 2;
    this.joints[joint].add(mesh);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, 6), material);
    this.joints[joint].add(cap);
    return mesh;
  }

  add(joint: JointName, obj: THREE.Object3D): THREE.Object3D {
    this.joints[joint].add(obj);
    return obj;
  }

  setShadowless(): void {
    this.root.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });
  }

  /** Aplica una pose de inmediato (la entidad cambia de postura "entre miradas"). */
  applyPose(pose: Pose): void {
    for (const name of Object.keys(this.joints) as JointName[]) {
      if (name === 'hips') continue;
      const r = pose.joints[name];
      this.joints[name].rotation.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0);
    }
    const hr = pose.joints.hips;
    this.joints.hips.rotation.set(hr ? hr[0] : 0, hr ? hr[1] : 0, hr ? hr[2] : 0);
    this.joints.hips.position.y = this.hipsBase * (pose.hips ?? 1);
    this.current = pose;
    this.target = null;
  }

  /** Transición suave hacia una pose (actores en las cintas). */
  blendTo(pose: Pose): void {
    this.target = pose;
  }

  update(dt: number): void {
    if (!this.target) return;
    const k = 1 - Math.exp(-dt * 3);
    for (const name of Object.keys(this.joints) as JointName[]) {
      const r = this.target.joints[name] ?? [0, 0, 0];
      const g = this.joints[name];
      g.rotation.x = lerp(g.rotation.x, r[0], k);
      g.rotation.y = lerp(g.rotation.y, r[1], k);
      g.rotation.z = lerp(g.rotation.z, r[2], k);
    }
    this.joints.hips.position.y = lerp(this.joints.hips.position.y, this.hipsBase * (this.target.hips ?? 1), k);
  }

  get pose(): Pose {
    return this.current;
  }
}

/** Cabeza + torso + extremidades básicas con ropa simple. */
export function dressBasic(
  h: Humanoid,
  mats: { skin: THREE.Material; top: THREE.Material; bottom: THREE.Material; shoes?: THREE.Material },
): void {
  const p = h.p;
  // torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(p.torsoW * 0.5, p.torsoW * 0.42, p.spine + p.chest, 10), mats.top);
  torso.scale.z = p.torsoD / p.torsoW;
  torso.position.y = (p.spine + p.chest) / 2;
  h.add('spine', torso);
  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(p.torsoW * 0.42, p.torsoW * 0.4, 0.16, 10), mats.bottom);
  pelvis.scale.z = p.torsoD / p.torsoW;
  pelvis.position.y = -0.04;
  h.add('hips', pelvis);
  // cuello y cabeza
  h.limb('neck', p.neck, p.rNeck, mats.skin).position.y = p.neck / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), mats.skin);
  head.scale.set(p.headW, p.headH, p.headW * 1.1);
  head.position.y = p.headH * 0.5;
  h.add('head', head);
  // brazos
  for (const s of ['L', 'R'] as const) {
    h.limb(`upperArm${s}`, p.upperArm, p.rUpper, mats.top, p.rUpper * 0.9);
    h.limb(`foreArm${s}`, p.foreArm, p.rFore, mats.top, p.rFore * 0.85);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(p.rFore * 1.6, p.hand, p.rFore * 0.9), mats.skin);
    hand.position.y = -p.hand / 2;
    h.add(`hand${s}`, hand);
    h.limb(`thigh${s}`, p.thigh, p.rThigh, mats.bottom, p.rShin * 1.1);
    h.limb(`shin${s}`, p.shin, p.rShin, mats.bottom, p.rShin * 0.9);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(p.rShin * 2.2, 0.07, 0.24), mats.shoes ?? mats.bottom);
    foot.position.set(0, -0.035, 0.06);
    h.add(`foot${s}`, foot);
  }
}
