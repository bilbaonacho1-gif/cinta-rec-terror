import * as THREE from 'three';
import { rand, seeded } from '../core/math';
import { Humanoid, Pose } from './Humanoid';

/**
 * EL INQUILINO — "el hombre de la cinta".
 * Figura humanoide original de ~2,05 m: extremadamente delgada, brazos demasiado largos,
 * cabeza alargada e inclinada, piel pálida, traje antiguo que le queda chico
 * y la cara envuelta en tiras de cinta magnética VHS que cuelgan como pelo.
 */
export type MonsterPose = 'hang' | 'stand' | 'lean' | 'reach' | 'peek' | 'crouch' | 'close' | 'still';

export const MONSTER_POSES: Record<MonsterPose, Pose> = {
  still: {
    joints: {
      neck: [0.1, 0, 0],
      head: [0.05, 0, 0.35],
      upperArmL: [0, 0, 0.06],
      upperArmR: [0, 0, -0.06],
    },
  },
  hang: {
    joints: {
      spine: [0.12, 0, 0],
      chest: [0.12, 0, 0],
      neck: [0.55, 0, 0],
      head: [0.55, 0, 0.18],
      shoulderL: [0, 0, -0.1],
      shoulderR: [0, 0, 0.1],
      upperArmL: [0.05, 0, 0.05],
      upperArmR: [0.08, 0, -0.04],
      foreArmL: [-0.05, 0, 0],
      foreArmR: [-0.1, 0, 0],
    },
  },
  stand: {
    joints: {
      spine: [0.05, 0, 0.03],
      chest: [0.06, 0, 0],
      neck: [0.12, 0, 0.2],
      head: [0.08, 0, 0.62],
      upperArmL: [0, 0, 0.09],
      upperArmR: [-0.05, 0, -0.06],
      foreArmL: [-0.1, 0, 0],
      foreArmR: [-0.25, 0, 0],
      handR: [-0.2, 0, 0],
    },
  },
  lean: {
    joints: {
      spine: [0.32, 0, 0],
      chest: [0.22, 0, 0],
      neck: [-0.35, 0, 0.1],
      head: [-0.15, 0.1, 0.78],
      upperArmL: [-0.25, 0, 0.1],
      upperArmR: [-0.35, 0, -0.1],
      foreArmL: [-0.35, 0, 0],
      foreArmR: [-0.5, 0, 0],
      thighL: [-0.18, 0, 0],
      thighR: [-0.12, 0, 0],
      shinL: [0.28, 0, 0],
      shinR: [0.22, 0, 0],
    },
    hips: 0.97,
  },
  reach: {
    joints: {
      spine: [0.2, 0, 0],
      chest: [0.1, 0, 0],
      neck: [-0.15, 0, -0.1],
      head: [-0.05, -0.1, -0.7],
      upperArmR: [-1.25, 0, -0.1],
      foreArmR: [-0.2, 0, 0],
      handR: [-0.1, 0, 0],
      upperArmL: [-0.1, 0, 0.12],
      foreArmL: [-0.2, 0, 0],
    },
  },
  peek: {
    joints: {
      spine: [0.1, 0, 0.42],
      chest: [0.05, 0, 0.32],
      neck: [0, 0, 0.45],
      head: [0, 0, 1.15],
      upperArmL: [-0.4, 0, 1.25],
      foreArmL: [-0.4, 0, 0.3],
      upperArmR: [0, 0, -0.1],
    },
  },
  crouch: {
    joints: {
      hips: [0, 0, 0],
      thighL: [-1.55, 0, 0.12],
      thighR: [-1.5, 0, -0.12],
      shinL: [2.3, 0, 0],
      shinR: [2.25, 0, 0],
      footL: [-0.7, 0, 0],
      footR: [-0.7, 0, 0],
      spine: [0.85, 0, 0],
      chest: [0.35, 0, 0],
      neck: [-0.75, 0, 0],
      head: [-0.35, 0, 0.45],
      upperArmL: [0.2, 0, 0.1],
      upperArmR: [0.25, 0, -0.1],
    },
    hips: 0.42,
  },
  close: {
    joints: {
      spine: [0.38, 0, 0],
      chest: [0.22, 0, 0],
      neck: [0.05, 0, 0.1],
      head: [-0.4, 0, 0.45],
      upperArmL: [-0.55, 0, 0.55],
      upperArmR: [-0.6, 0, -0.5],
      foreArmL: [-0.9, 0, 0],
      foreArmR: [-0.85, 0, 0],
    },
  },
};

export class MonsterEntity {
  readonly body: Humanoid;
  readonly root: THREE.Group;
  /** Puntos de referencia para calcular si está siendo observado. */
  readonly probes: THREE.Object3D[] = [];
  private strands: THREE.Mesh[] = [];
  private headTwitch = 0;
  private skin: THREE.MeshStandardMaterial;
  poseName: MonsterPose = 'stand';

  constructor() {
    const rnd = seeded(66);
    this.skin = new THREE.MeshStandardMaterial({ color: 0xd9d3c8, roughness: 0.78, metalness: 0, emissive: 0x262420 });
    const suit = new THREE.MeshStandardMaterial({ color: 0x2b2722, roughness: 1 });
    const suitDark = new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 1 });
    const tape = new THREE.MeshStandardMaterial({ color: 0x21160e, roughness: 0.32, metalness: 0.35, side: THREE.DoubleSide });
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

    this.body = new Humanoid({
      thigh: 0.5,
      shin: 0.48,
      spine: 0.36,
      chest: 0.27,
      neck: 0.17,
      headH: 0.29,
      headW: 0.16,
      shoulder: 0.165,
      upperArm: 0.42,
      foreArm: 0.41,
      hand: 0.12,
      hipWidth: 0.07,
      rThigh: 0.045,
      rShin: 0.034,
      rUpper: 0.034,
      rFore: 0.026,
      rNeck: 0.028,
      torsoW: 0.27,
      torsoD: 0.14,
    });
    const b = this.body;
    const p = b.p;
    this.root = b.root;
    this.root.name = 'monster';

    // --- piernas: pantalón corto de más, tobillos pálidos a la vista
    for (const s of ['L', 'R'] as const) {
      b.limb(`thigh${s}`, p.thigh, 0.058, suit, 0.05, 7);
      const trouser = b.limb(`shin${s}`, p.shin - 0.1, 0.048, suit, 0.044, 7);
      trouser.position.y = -(p.shin - 0.1) / 2;
      b.limb(`shin${s}`, p.shin, p.rShin, this.skin, 0.028, 6);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.27), this.skin);
      foot.position.set(0, -0.02, 0.08);
      b.add(`foot${s}`, foot);
      // brazos: mangas que quedan cortas, muñecas y dedos largos
      b.limb(`upperArm${s}`, p.upperArm, 0.05, suit, 0.046, 7);
      const sleeve = b.limb(`foreArm${s}`, p.foreArm * 0.62, 0.044, suit, 0.042, 7);
      sleeve.position.y = -(p.foreArm * 0.62) / 2;
      b.limb(`foreArm${s}`, p.foreArm, p.rFore, this.skin, 0.022, 6);
      this.buildHand(s, rnd);
    }

    // --- torso: saco viejo y deshilachado sobre un cuerpo muy angosto
    const jacketGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.78, 12, 4, true);
    const pos = jacketGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < -0.3) pos.setY(i, y - rnd() * 0.12); // dobladillo roto
      pos.setX(i, pos.getX(i) * (0.95 + rnd() * 0.1));
    }
    jacketGeo.computeVertexNormals();
    const jacket = new THREE.Mesh(jacketGeo, suit);
    jacket.material = suit.clone();
    (jacket.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    jacket.scale.z = 0.62;
    jacket.position.y = 0.3;
    b.add('spine', jacket);
    const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.62, 8), suitDark);
    shirt.scale.z = 0.6;
    shirt.position.y = 0.32;
    b.add('spine', shirt);
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.12), suit);
    shoulders.position.y = p.chest * 0.9;
    shoulders.rotation.z = 0.05;
    b.add('chest', shoulders);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.08, 8, 1, true), suitDark);
    collar.position.y = p.chest + 0.01;
    b.add('chest', collar);
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.12), suit);
    pelvis.position.y = -0.03;
    b.add('hips', pelvis);

    // --- cuello largo y cabeza alargada
    b.limb('neck', p.neck + 0.02, 0.027, this.skin, 0.032, 7).position.y = p.neck / 2;
    const headGeo = new THREE.SphereGeometry(0.5, 20, 16);
    const hp = headGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < hp.count; i++) {
      // mandíbula angosta y cráneo alto
      const y = hp.getY(i);
      const k = y < 0 ? 0.78 + (y + 0.5) * 0.44 : 1;
      hp.setX(i, hp.getX(i) * k);
      hp.setZ(i, hp.getZ(i) * (y < -0.2 ? 0.9 : 1));
    }
    headGeo.computeVertexNormals();
    const head = new THREE.Mesh(headGeo, this.skin);
    head.scale.set(0.165, 0.3, 0.19);
    head.position.y = 0.14;
    b.add('head', head);
    // ojos: cuencas completamente negras (no reflejan ni en visión nocturna)
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), voidMat);
      eye.scale.set(1, 1.35, 0.55);
      eye.position.set(sx * 0.036, 0.165, 0.083);
      b.add('head', eye);
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), new THREE.MeshStandardMaterial({ color: 0x5a544c, roughness: 1 }));
      socket.scale.set(1, 1.3, 0.4);
      socket.position.set(sx * 0.036, 0.165, 0.078);
      b.add('head', socket);
    }
    // cinta magnética envolviendo la cara
    const band = (y: number, tilt: number, roll: number, width: number, r: number) => {
      const g = new THREE.CylinderGeometry(r, r * 0.98, width, 20, 1, true);
      const m = new THREE.Mesh(g, tape);
      m.scale.set(1, 1, 1.12);
      m.position.y = y;
      m.rotation.set(tilt, 0, roll);
      b.add('head', m);
      return m;
    };
    band(0.07, 0.18, 0.05, 0.035, 0.087);
    band(0.045, -0.1, -0.08, 0.028, 0.086);
    band(0.23, 0.25, 0.12, 0.03, 0.078);
    band(0.15, 0.0, 0.62, 0.026, 0.092); // cruza sobre un ojo: rostro parcialmente oculto
    band(0.1, 0.4, -0.35, 0.02, 0.09);
    // tiras sueltas colgando de la cabeza
    for (let i = 0; i < 9; i++) {
      const len = 0.25 + rnd() * 0.65;
      const strand = this.makeStrand(len, tape, rnd);
      const a = rnd() * Math.PI * 2;
      strand.position.set(Math.cos(a) * 0.075, 0.05 + rnd() * 0.18, Math.sin(a) * 0.08);
      strand.rotation.y = a;
      b.add('head', strand);
      this.strands.push(strand);
    }
    // cinta enrollada en las muñecas
    for (const s of ['L', 'R'] as const) {
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10, 1, true), tape);
      wrap.position.y = -p.foreArm * 0.8;
      b.add(`foreArm${s}`, wrap);
      for (let i = 0; i < 2; i++) {
        const st = this.makeStrand(0.3 + rnd() * 0.4, tape, rnd);
        st.position.y = -p.foreArm * 0.8;
        st.rotation.y = rnd() * 6;
        b.add(`foreArm${s}`, st);
        this.strands.push(st);
      }
    }

    // sondas de visibilidad: cabeza, pecho, cadera
    for (const [joint, y] of [
      ['head', 0.15],
      ['chest', 0.1],
      ['hips', 0.0],
    ] as const) {
      const o = new THREE.Object3D();
      o.position.y = y;
      b.add(joint, o);
      this.probes.push(o);
    }

    this.root.traverse((o) => {
      o.frustumCulled = true;
    });
    this.setPose('stand');
    this.root.visible = false;
  }

  private buildHand(s: 'L' | 'R', rnd: () => number): void {
    const p = this.body.p;
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.018), this.skin);
    palm.position.y = -0.04;
    this.body.add(`hand${s}`, palm);
    for (let f = 0; f < 4; f++) {
      const len = 0.12 + rnd() * 0.04 + (f === 1 || f === 2 ? 0.03 : 0);
      const finger = new THREE.Group();
      finger.position.set((f - 1.5) * 0.013, -0.08, 0);
      finger.rotation.x = -0.25 - rnd() * 0.35; // dedos levemente curvados
      finger.rotation.z = (f - 1.5) * 0.06;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.004, len, 5), this.skin);
      seg.position.y = -len / 2;
      finger.add(seg);
      this.body.add(`hand${s}`, finger);
    }
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.005, 0.08, 5), this.skin);
    thumb.position.set(s === 'L' ? -0.03 : 0.03, -0.05, 0.01);
    thumb.rotation.z = s === 'L' ? -0.5 : 0.5;
    this.body.add(`hand${s}`, thumb);
    void p;
  }

  private makeStrand(len: number, mat: THREE.Material, rnd: () => number): THREE.Mesh {
    const g = new THREE.PlaneGeometry(0.014, len, 1, 6);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const curl = (rnd() - 0.5) * 0.12;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (len / 2 - y) / len;
      pos.setZ(i, Math.sin(t * 3 + curl * 10) * 0.02 + t * t * curl);
      pos.setX(i, pos.getX(i) + Math.sin(t * 5) * 0.006);
    }
    g.translate(0, -len / 2, 0);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.rotation.x = 0.1;
    return m;
  }

  setPose(name: MonsterPose): void {
    this.poseName = name;
    this.body.applyPose(MONSTER_POSES[name]);
  }

  /** Coloca a la entidad mirando hacia un punto (sólo gira en Y). */
  placeFacing(pos: THREE.Vector3, lookAt: THREE.Vector3): void {
    this.root.position.copy(pos);
    const dx = lookAt.x - pos.x;
    const dz = lookAt.z - pos.z;
    this.root.rotation.set(0, Math.atan2(dx, dz), 0);
  }

  /**
   * Micro-movimientos: sólo ocurren cuando NO está siendo observado de frente
   * (periferia de la imagen). Mientras se lo mira, queda completamente inmóvil.
   */
  animate(dt: number, time: number, frozen: boolean): void {
    if (frozen) return;
    this.headTwitch -= dt;
    if (this.headTwitch <= 0) {
      this.headTwitch = rand(0.6, 2.4);
      const head = this.body.joints.head;
      head.rotation.z += rand(-0.25, 0.25);
      head.rotation.x += rand(-0.1, 0.1);
    }
    for (let i = 0; i < this.strands.length; i++) {
      this.strands[i].rotation.x = 0.1 + Math.sin(time * 1.3 + i) * 0.06;
    }
  }

  setSkinGlow(v: number): void {
    this.skin.emissive.setRGB(0.086 * v, 0.078 * v, 0.06 * v);
  }
}
