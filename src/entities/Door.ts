import * as THREE from 'three';
import { damp } from '../core/math';
import { hitBox, worldBox } from '../scene/builders';

export interface DoorOptions {
  id: string;
  /** Eje de la pared que contiene la puerta. */
  axis: 'x' | 'z';
  /** Coordenada fija de la pared (z si axis = 'x', x si axis = 'z'). */
  pos: number;
  /** Centro de la puerta a lo largo de la pared. */
  at: number;
  floorY: number;
  width: number;
  height: number;
  /** Signo del giro al abrir (hacia qué lado barre la hoja). */
  swing: 1 | -1;
  openAngle?: number;
  material: THREE.Material;
  frameMaterial: THREE.Material;
  knobMaterial: THREE.Material;
  open?: boolean;
  locked?: boolean;
}

/** Puerta con bisagra animada y un hitbox fijo en el vano para la interacción. */
export class Door {
  readonly id: string;
  readonly group = new THREE.Group();
  readonly pivot = new THREE.Group();
  readonly hit: THREE.Mesh;
  readonly center: THREE.Vector3;
  open: boolean;
  locked: boolean;
  private angle: number;
  private target: number;
  private speed = 2.2;
  private openAngle: number;

  constructor(o: DoorOptions) {
    this.id = o.id;
    this.open = o.open ?? false;
    this.locked = o.locked ?? false;
    this.openAngle = (o.openAngle ?? 1.7) * o.swing;
    this.angle = this.target = this.open ? this.openAngle : 0;
    const t = 0.045;
    const panel = new THREE.Mesh(worldBox(o.axis === 'x' ? o.width - 0.02 : t, o.height - 0.02, o.axis === 'x' ? t : o.width - 0.02, [1, 1]), o.material);
    // las UV de la hoja completa usan la textura entera
    const uv = panel.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, Math.min(1, Math.max(0, uv.getX(i) / (o.width - 0.02))), uv.getY(i) / (o.height - 0.02));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), o.knobMaterial);

    if (o.axis === 'x') {
      this.pivot.position.set(o.at - o.width / 2, o.floorY, o.pos);
      panel.position.set(o.width / 2, o.height / 2, 0);
      knob.position.set(o.width - 0.09, 1.0, 0.04);
      const knob2 = knob.clone();
      knob2.position.z = -0.04;
      this.pivot.add(knob2);
      this.center = new THREE.Vector3(o.at, o.floorY + 1.1, o.pos);
      this.hit = hitBox(o.width, o.height, 0.36, o.at, o.floorY + o.height / 2, o.pos);
    } else {
      this.pivot.position.set(o.pos, o.floorY, o.at - o.width / 2);
      panel.position.set(0, o.height / 2, o.width / 2);
      knob.position.set(0.04, 1.0, o.width - 0.09);
      const knob2 = knob.clone();
      knob2.position.x = -0.04;
      this.pivot.add(knob2);
      this.center = new THREE.Vector3(o.pos, o.floorY + 1.1, o.at);
      this.hit = hitBox(0.36, o.height, o.width, o.pos, o.floorY + o.height / 2, o.at);
    }
    this.pivot.add(panel, knob);
    this.pivot.rotation.y = this.angle;
    this.group.add(this.pivot, this.hit);
    this.hit.userData.door = this;

    // marco
    const fw = 0.08;
    const frameDepth = 0.2;
    const mk = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(worldBox(w, h, d, [1, 1]), o.frameMaterial);
      m.position.set(x, y, z);
      this.group.add(m);
    };
    if (o.axis === 'x') {
      mk(fw, o.height + fw, frameDepth, o.at - o.width / 2 - fw / 2, o.floorY + (o.height + fw) / 2, o.pos);
      mk(fw, o.height + fw, frameDepth, o.at + o.width / 2 + fw / 2, o.floorY + (o.height + fw) / 2, o.pos);
      mk(o.width, fw, frameDepth, o.at, o.floorY + o.height + fw / 2, o.pos);
    } else {
      mk(frameDepth, o.height + fw, fw, o.pos, o.floorY + (o.height + fw) / 2, o.at - o.width / 2 - fw / 2);
      mk(frameDepth, o.height + fw, fw, o.pos, o.floorY + (o.height + fw) / 2, o.at + o.width / 2 + fw / 2);
      mk(frameDepth, fw, o.width, o.pos, o.floorY + o.height + fw / 2, o.at);
    }
  }

  setOpen(open: boolean, instant = false, speed = 2.2): void {
    this.open = open;
    this.target = open ? this.openAngle : 0;
    this.speed = speed;
    if (instant) {
      this.angle = this.target;
      this.pivot.rotation.y = this.angle;
    }
  }

  /** Apertura parcial (entreabierta). */
  setAjar(amount: number, speed = 0.6): void {
    this.open = amount > 0.3;
    this.target = this.openAngle * amount;
    this.speed = speed;
  }

  get moving(): boolean {
    return Math.abs(this.angle - this.target) > 0.01;
  }

  get isClosed(): boolean {
    return Math.abs(this.angle) < 0.05;
  }

  update(dt: number): void {
    if (!this.moving) return;
    this.angle = damp(this.angle, this.target, this.speed, dt);
    this.pivot.rotation.y = this.angle;
  }
}
