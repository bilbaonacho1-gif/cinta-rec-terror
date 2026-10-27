import * as THREE from 'three';
import { glowMaterial } from '../scene/materials';
import { Humanoid, Pose, dressBasic } from './Humanoid';

/** Modelo de videocámara VHS de hombro (el objeto central del juego). */
export function buildCamcorder(scale = 1): { group: THREE.Group; led: THREE.MeshBasicMaterial } {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x1b1b1c });
  const grey = new THREE.MeshLambertMaterial({ color: 0x4a4a48 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x080a10 });
  const led = glowMaterial(0xff2a1a, 3);
  const main = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.3), body);
  main.position.y = 0.065;
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.14, 14), grey);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.075, 0.21);
  const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.036, 14), glass);
  lensGlass.position.set(0, 0.075, 0.281);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), body);
  handle.position.set(0, 0.155, 0.0);
  const vf = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.09), grey);
  vf.position.set(0.07, 0.12, -0.1);
  const ledMesh = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 4), led);
  ledMesh.position.set(-0.035, 0.12, 0.15);
  const tapeDoor = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.08, 0.2), grey);
  tapeDoor.position.set(-0.062, 0.06, -0.02);
  g.add(main, lens, lensGlass, handle, vf, ledMesh, tapeDoor);
  g.scale.setScalar(scale);
  return { group: g, led };
}

export function buildCassette(labelTex: THREE.Texture | null): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.188, 0.025, 0.104), new THREE.MeshLambertMaterial({ color: 0x121212 }));
  g.add(shell);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 0.04),
    new THREE.MeshLambertMaterial({ color: 0xffffff, map: labelTex }),
  );
  label.rotation.x = -Math.PI / 2;
  label.position.set(0, 0.0131, -0.02);
  g.add(label);
  const window = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.022), new THREE.MeshLambertMaterial({ color: 0x2a2018 }));
  window.rotation.x = -Math.PI / 2;
  window.position.set(0, 0.0131, 0.025);
  g.add(window);
  return g;
}

export function buildBatteryPack(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.07), new THREE.MeshLambertMaterial({ color: 0x202226 }));
  const label = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.02, 0.072), new THREE.MeshLambertMaterial({ color: 0xb8a040 }));
  label.position.y = 0.005;
  const contacts = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.074), new THREE.MeshLambertMaterial({ color: 0x8a8a80 }));
  contacts.position.x = 0.05;
  g.add(body, label, contacts);
  g.position.y = 0.025;
  const wrap = new THREE.Group();
  wrap.add(g);
  return wrap;
}

export function buildKey(): THREE.Group {
  const g = new THREE.Group();
  const brass = new THREE.MeshLambertMaterial({ color: 0x8a7030, emissive: 0x0a0802 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 14), brass);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.07, 0.004), brass);
  shaft.position.y = -0.05;
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.004), brass);
  bit.position.set(0.01, -0.078, 0);
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.002), new THREE.MeshLambertMaterial({ color: 0xc8bea0 }));
  tag.position.set(0.035, 0.015, 0);
  g.add(ring, shaft, bit, tag);
  return g;
}

export function buildBackpack(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x3a2a2a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.18), mat);
  body.position.y = 0.21;
  body.rotation.z = 0.35;
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.06), mat);
  pocket.position.set(0.05, 0.12, 0.1);
  pocket.rotation.z = 0.35;
  g.add(body, pocket);
  return g;
}

/** Lucía Ferrán: la persona desaparecida que grabó las cintas. Sólo aparece dentro de las grabaciones. */
export function buildLucia(): Humanoid {
  const h = new Humanoid({
    thigh: 0.42,
    shin: 0.4,
    spine: 0.28,
    chest: 0.22,
    neck: 0.09,
    headH: 0.23,
    headW: 0.17,
    shoulder: 0.17,
    upperArm: 0.28,
    foreArm: 0.25,
    hand: 0.15,
    hipWidth: 0.09,
    rThigh: 0.07,
    rShin: 0.05,
    rUpper: 0.045,
    rFore: 0.038,
    rNeck: 0.045,
    torsoW: 0.36,
    torsoD: 0.22,
  });
  const skin = new THREE.MeshLambertMaterial({ color: 0xb89880 });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x3f4030 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x252b38 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x140e0a });
  dressBasic(h, { skin, top: jacket, bottom: jeans, shoes: new THREE.MeshLambertMaterial({ color: 0x151515 }) });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
  cap.scale.set(0.19, 0.25, 0.21);
  cap.position.set(0, 0.125, -0.012);
  cap.rotation.x = -0.25;
  h.add('head', cap);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.06), hair);
  back.position.set(0, 0.02, -0.08);
  h.add('head', back);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.12), hair);
    side.position.set(s * 0.085, 0.04, -0.01);
    h.add('head', side);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 4), new THREE.MeshBasicMaterial({ color: 0x0a0806 }));
    eye.position.set(s * 0.035, 0.125, 0.085);
    h.add('head', eye);
  }
  h.root.visible = false;
  return h;
}

/** "Vos": la figura que aparece grabada en la cinta 4, sosteniendo la misma cámara. */
export function buildPlayerAvatar(): { body: Humanoid; led: THREE.MeshBasicMaterial } {
  const h = new Humanoid({
    thigh: 0.45,
    shin: 0.43,
    spine: 0.3,
    chest: 0.24,
    neck: 0.09,
    headH: 0.24,
    headW: 0.18,
    shoulder: 0.2,
    upperArm: 0.3,
    foreArm: 0.27,
    hand: 0.16,
    hipWidth: 0.1,
    rThigh: 0.075,
    rShin: 0.055,
    rUpper: 0.055,
    rFore: 0.045,
    rNeck: 0.05,
    torsoW: 0.42,
    torsoD: 0.25,
  });
  const skin = new THREE.MeshLambertMaterial({ color: 0xa08470 });
  const coat = new THREE.MeshLambertMaterial({ color: 0x1d2024 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x181a1c });
  dressBasic(h, { skin, top: coat, bottom: pants });
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.7), coat);
  hood.scale.set(0.24, 0.3, 0.26);
  hood.position.set(0, 0.11, -0.03);
  hood.rotation.x = -0.35;
  h.add('head', hood);
  const cam = buildCamcorder(1);
  cam.group.rotation.x = Math.PI / 2;
  cam.group.position.set(-0.02, -0.12, 0.05);
  h.add('handR', cam.group);
  h.root.visible = false;
  return { body: h, led: cam.led };
}

export const ACTOR_POSES: Record<string, Pose> = {
  sit: {
    joints: {
      thighL: [-1.5, 0, 0.05],
      thighR: [-1.5, 0, -0.05],
      shinL: [1.45, 0, 0],
      shinR: [1.5, 0, 0],
      spine: [0.12, 0, 0],
      neck: [0.05, 0, 0],
      head: [0.05, 0, 0.05],
      upperArmL: [-0.55, 0, 0.1],
      upperArmR: [-0.5, 0, -0.1],
      foreArmL: [-0.7, 0, 0],
      foreArmR: [-0.75, 0, 0],
    },
    hips: 0.72,
  },
  sitLookBack: {
    joints: {
      thighL: [-1.5, 0, 0.05],
      thighR: [-1.5, 0, -0.05],
      shinL: [1.45, 0, 0],
      shinR: [1.5, 0, 0],
      spine: [0.2, 0, 0],
      neck: [0.1, 0.5, 0],
      head: [0.1, 0.6, 0],
      upperArmL: [-0.55, 0, 0.1],
      upperArmR: [-0.5, 0, -0.1],
      foreArmL: [-0.7, 0, 0],
      foreArmR: [-0.75, 0, 0],
    },
    hips: 0.72,
  },
  sitHead: {
    joints: {
      thighL: [-1.5, 0, 0.05],
      thighR: [-1.5, 0, -0.05],
      shinL: [1.45, 0, 0],
      shinR: [1.5, 0, 0],
      spine: [0.35, 0, 0],
      chest: [0.2, 0, 0],
      neck: [0.3, 0, 0],
      head: [0.2, 0, 0],
      upperArmL: [-0.9, 0, 0.3],
      upperArmR: [-0.9, 0, -0.3],
      foreArmL: [-1.6, 0, 0],
      foreArmR: [-1.6, 0, 0],
    },
    hips: 0.72,
  },
  whisper: {
    joints: {
      spine: [0.35, 0, 0],
      chest: [0.25, 0, 0],
      neck: [0.1, 0, 0.15],
      head: [0.05, 0.2, 0.2],
      upperArmR: [-1.3, 0, -0.2],
      foreArmR: [-1.1, 0, 0],
    },
    hips: 0.95,
  },
  holdCamera: {
    joints: {
      upperArmR: [-0.9, 0, -0.1],
      foreArmR: [-0.85, 0.3, 0],
      upperArmL: [-0.7, 0, 0.35],
      foreArmL: [-1.1, -0.3, 0],
      neck: [0.1, 0, 0],
      head: [0.15, 0, 0],
    },
  },
  standing: { joints: { upperArmL: [0, 0, 0.08], upperArmR: [0, 0, -0.08], foreArmL: [-0.1, 0, 0], foreArmR: [-0.1, 0, 0] } },
};
