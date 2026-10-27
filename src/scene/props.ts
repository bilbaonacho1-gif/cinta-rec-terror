import * as THREE from 'three';
import { boxMesh, cylMesh, planeMesh, worldBox } from './builders';
import { Materials, glowMaterial } from './materials';

/**
 * Muebles y objetos construidos con geometría procedural.
 * Cada función devuelve un grupo posicionado en el origen, apoyado en y = 0 y mirando hacia +Z.
 */

export function table(m: Materials, w: number, d: number, h: number, mat = m.wood): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(w, 0.04, d, mat, 0, h - 0.02, 0));
  const lx = w / 2 - 0.05;
  const lz = d / 2 - 0.05;
  for (const [x, z] of [
    [lx, lz],
    [-lx, lz],
    [lx, -lz],
    [-lx, -lz],
  ]) {
    g.add(boxMesh(0.045, h - 0.04, 0.045, mat, x, (h - 0.04) / 2, z));
  }
  g.add(boxMesh(w - 0.1, 0.08, 0.02, mat, 0, h - 0.08, lz));
  g.add(boxMesh(w - 0.1, 0.08, 0.02, mat, 0, h - 0.08, -lz));
  return g;
}

export function chair(m: Materials, mat = m.wood): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(0.42, 0.04, 0.42, mat, 0, 0.45, 0));
  for (const [x, z] of [
    [0.18, 0.18],
    [-0.18, 0.18],
    [0.18, -0.18],
    [-0.18, -0.18],
  ]) {
    g.add(boxMesh(0.035, 0.45, 0.035, mat, x, 0.225, z));
  }
  g.add(boxMesh(0.035, 0.5, 0.035, mat, 0.18, 0.72, -0.19));
  g.add(boxMesh(0.035, 0.5, 0.035, mat, -0.18, 0.72, -0.19));
  g.add(boxMesh(0.4, 0.08, 0.025, mat, 0, 0.9, -0.19));
  g.add(boxMesh(0.4, 0.05, 0.025, mat, 0, 0.72, -0.19));
  return g;
}

/** Sofá cubierto por una sábana. */
export function coveredSofa(m: Materials, w = 2.0): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(w, 0.45, 0.85, m.fabric, 0, 0.225, 0));
  g.add(boxMesh(w, 0.5, 0.2, m.fabric, 0, 0.7, -0.33));
  g.add(boxMesh(0.2, 0.28, 0.85, m.fabric, w / 2 - 0.1, 0.59, 0));
  g.add(boxMesh(0.2, 0.28, 0.85, m.fabric, -w / 2 + 0.1, 0.59, 0));
  // la sábana cae hasta el piso por delante
  const drape = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.05, 0.5, 8, 3), m.fabric);
  const p = drape.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 7) * 0.02 + (0.25 - p.getY(i)) * 0.08);
  drape.geometry.computeVertexNormals();
  drape.position.set(0, 0.24, 0.43);
  g.add(drape);
  return g;
}

export function coveredArmchair(m: Materials): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(0.85, 0.45, 0.8, m.fabric, 0, 0.225, 0));
  g.add(boxMesh(0.85, 0.6, 0.2, m.fabric, 0, 0.75, -0.3));
  g.add(boxMesh(0.18, 0.25, 0.8, m.fabric, 0.34, 0.57, 0));
  g.add(boxMesh(0.18, 0.25, 0.8, m.fabric, -0.34, 0.57, 0));
  // bulto irregular sobre la sábana
  const lump = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), m.fabric);
  lump.scale.set(1.2, 0.5, 1);
  lump.position.set(0, 1.05, -0.25);
  g.add(lump);
  return g;
}

export function bed(m: Materials, w = 1.0, l = 1.9): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(w, 0.3, l, m.wood, 0, 0.25, 0));
  g.add(boxMesh(w - 0.04, 0.18, l - 0.05, m.fabricDark, 0, 0.49, 0.01));
  g.add(boxMesh(w + 0.06, 0.95, 0.06, m.wood, 0, 0.475, -l / 2));
  g.add(boxMesh(w + 0.06, 0.55, 0.06, m.wood, 0, 0.275, l / 2));
  g.add(boxMesh(w * 0.7, 0.1, 0.35, m.fabric, 0, 0.62, -l / 2 + 0.28));
  // sábana arrugada
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, l * 0.62, 6, 8), m.fabric);
  const p = sheet.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.abs(Math.sin(p.getX(i) * 9 + p.getY(i) * 5)) * 0.05);
  sheet.geometry.computeVertexNormals();
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.set(0, 0.6, l * 0.17);
  g.add(sheet);
  return g;
}

/** Ropero con una puerta entreabierta: la franja oscura del interior es parte del miedo. */
export function wardrobe(m: Materials, w = 1.1, h = 2.0, d = 0.55): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(w, h, 0.03, m.wood, 0, h / 2, -d / 2));
  g.add(boxMesh(0.03, h, d, m.wood, -w / 2, h / 2, 0));
  g.add(boxMesh(0.03, h, d, m.wood, w / 2, h / 2, 0));
  g.add(boxMesh(w, 0.03, d, m.wood, 0, h, 0));
  g.add(boxMesh(w, 0.08, d, m.wood, 0, 0.04, 0));
  g.add(boxMesh(w * 0.8, 0.8, d * 0.8, m.black, 0, h * 0.5, 0)); // interior oscuro
  const doorL = boxMesh(w / 2 - 0.01, h - 0.1, 0.025, m.wood, -w / 4, h / 2 + 0.03, d / 2);
  g.add(doorL);
  const pivot = new THREE.Group();
  pivot.position.set(w / 2, 0, d / 2);
  const doorR = boxMesh(w / 2 - 0.01, h - 0.1, 0.025, m.wood, -w / 4, h / 2 + 0.03, 0);
  pivot.add(doorR);
  pivot.rotation.y = 0.35;
  g.add(pivot);
  g.add(boxMesh(w + 0.08, 0.08, d + 0.06, m.wood, 0, h + 0.04, 0));
  return g;
}

export function shelf(m: Materials, w: number, h: number, d: number, levels: number, mat = m.wood): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(0.03, h, d, mat, -w / 2, h / 2, 0));
  g.add(boxMesh(0.03, h, d, mat, w / 2, h / 2, 0));
  for (let i = 0; i <= levels; i++) g.add(boxMesh(w, 0.025, d, mat, 0, 0.05 + (i * (h - 0.08)) / levels, 0));
  return g;
}

export function counter(m: Materials, w: number): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(w, 0.86, 0.58, m.woodLight, 0, 0.43, 0));
  g.add(boxMesh(w + 0.02, 0.04, 0.62, m.enamel, 0, 0.88, 0.02));
  for (let x = -w / 2 + 0.3; x < w / 2; x += 0.6) {
    g.add(boxMesh(0.54, 0.7, 0.02, m.wood, x, 0.43, 0.3));
    g.add(boxMesh(0.1, 0.015, 0.02, m.metalLight, x, 0.7, 0.315));
  }
  return g;
}

export function fridge(m: Materials): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(0.7, 1.6, 0.65, m.enamel, 0, 0.8, 0));
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.325, 0.325, 0.7, 12, 1, false, 0, Math.PI), m.enamel);
  top.rotation.z = Math.PI / 2;
  top.scale.set(0.35, 1, 1);
  top.position.set(0, 1.6, 0);
  g.add(top);
  g.add(boxMesh(0.04, 0.3, 0.04, m.metalLight, 0.28, 1.15, 0.34));
  g.add(boxMesh(0.66, 0.012, 0.01, m.black, 0, 1.12, 0.33));
  return g;
}

export function stove(m: Materials): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(0.62, 0.86, 0.6, m.enamel, 0, 0.43, 0));
  g.add(boxMesh(0.5, 0.4, 0.02, m.black, 0, 0.35, 0.3));
  for (const [x, z] of [
    [0.15, 0.12],
    [-0.15, 0.12],
    [0.15, -0.14],
    [-0.15, -0.14],
  ]) {
    g.add(cylMesh(0.08, 0.08, 0.02, m.black, x, 0.87, z, 10));
  }
  g.add(boxMesh(0.62, 0.3, 0.04, m.enamel, 0, 1.0, -0.28));
  return g;
}

export function crtTV(m: Materials, screenMat: THREE.Material, size = 0.5): { group: THREE.Group; screen: THREE.Mesh } {
  const g = new THREE.Group();
  const w = size * 1.25;
  const h = size;
  g.add(boxMesh(w, h, size * 0.95, m.plastic, 0, h / 2, -size * 0.1));
  g.add(boxMesh(w * 0.7, h * 0.7, size * 0.5, m.plastic, 0, h / 2, -size * 0.6));
  const screen = planeMesh(w * 0.78, h * 0.72, screenMat, -w * 0.06, h * 0.52, size * 0.38);
  g.add(screen);
  g.add(boxMesh(w * 0.12, h * 0.6, 0.01, m.metal, w * 0.39, h * 0.5, size * 0.375));
  return { group: g, screen };
}

export function floorLamp(m: Materials, shadeGlow: THREE.MeshBasicMaterial): { group: THREE.Group; bulb: THREE.Vector3 } {
  const g = new THREE.Group();
  g.add(cylMesh(0.14, 0.16, 0.03, m.metal, 0, 0.015, 0));
  g.add(cylMesh(0.012, 0.012, 1.45, m.metal, 0, 0.74, 0, 6));
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.3, 14, 1, true), shadeGlow);
  shade.position.y = 1.5;
  (shade.material as THREE.Material).side = THREE.DoubleSide;
  g.add(shade);
  return { group: g, bulb: new THREE.Vector3(0, 1.48, 0) };
}

const lampShadeMat = new THREE.MeshBasicMaterial({ color: 0x2a2520, side: THREE.DoubleSide });

/** Lámpara colgante con bulbo desnudo o pantalla. */
export function ceilingLamp(m: Materials, bulbGlow: THREE.MeshBasicMaterial, drop = 0.45, withShade = true): THREE.Group {
  const g = new THREE.Group();
  g.add(cylMesh(0.004, 0.004, drop, m.black, 0, -drop / 2, 0, 4));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), bulbGlow);
  bulb.position.y = -drop - 0.04;
  g.add(bulb);
  if (withShade) {
    // pantalla sin iluminación: con la luz adentro se quemaría la imagen
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, 0.14, 14, 1, true), lampShadeMat);
    shade.position.y = -drop - 0.02;
    g.add(shade);
  }
  return g;
}

export function wallSconce(m: Materials, glow: THREE.MeshBasicMaterial): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(0.08, 0.14, 0.03, m.metal, 0, 0, 0));
  g.add(boxMesh(0.02, 0.02, 0.14, m.metal, 0, 0, 0.07));
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.14, 10, 1, true), glow);
  (shade.material as THREE.Material).side = THREE.DoubleSide;
  shade.position.set(0, 0.06, 0.14);
  g.add(shade);
  return g;
}

/** Cuadro con marco (foto, dibujo). El plano de imagen se devuelve para poder cambiarle la textura. */
export function picture(m: Materials, w: number, h: number, image: THREE.Material): { group: THREE.Group; image: THREE.Mesh } {
  const g = new THREE.Group();
  const f = 0.035;
  g.add(boxMesh(w + f * 2, f, 0.025, m.wood, 0, h / 2 + f / 2, 0));
  g.add(boxMesh(w + f * 2, f, 0.025, m.wood, 0, -h / 2 - f / 2, 0));
  g.add(boxMesh(f, h, 0.025, m.wood, w / 2 + f / 2, 0, 0));
  g.add(boxMesh(f, h, 0.025, m.wood, -w / 2 - f / 2, 0, 0));
  const img = planeMesh(w, h, image, 0, 0, 0.005);
  g.add(img);
  return { group: g, image: img };
}

/** Reloj de péndulo de pared. Devuelve el péndulo para animarlo. */
export function wallClock(m: Materials, face: THREE.Material): { group: THREE.Group; pendulum: THREE.Group } {
  const g = new THREE.Group();
  g.add(boxMesh(0.34, 0.9, 0.14, m.wood, 0, 0, 0));
  g.add(planeMesh(0.26, 0.26, face, 0, 0.26, 0.072));
  g.add(boxMesh(0.24, 0.42, 0.01, m.black, 0, -0.18, 0.066));
  const pendulum = new THREE.Group();
  pendulum.position.set(0, 0.05, 0.075);
  pendulum.add(boxMesh(0.01, 0.3, 0.005, m.metalLight, 0, -0.15, 0));
  pendulum.add(cylMesh(0.035, 0.035, 0.008, m.metalLight, 0, -0.32, 0, 12).rotateX(Math.PI / 2));
  g.add(pendulum);
  return { group: g, pendulum };
}

export function cardboardBox(m: Materials, w: number, h: number, d: number): THREE.Mesh {
  return boxMesh(w, h, d, m.cardboard, 0, h / 2, 0);
}

export function fireplace(m: Materials): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(1.6, 1.1, 0.5, m.brick, 0, 0.55, 0));
  g.add(boxMesh(0.8, 0.7, 0.3, m.black, 0, 0.35, 0.12));
  g.add(boxMesh(1.8, 0.07, 0.6, m.wood, 0, 1.12, 0.03));
  g.add(boxMesh(1.1, 1.5, 0.3, m.brick, 0, 1.9, -0.1));
  return g;
}

/** Ventana: marco, vidrio emisivo con luna y un haz de luz falso (sin luces extra). */
export function windowUnit(m: Materials, w: number, h: number, shaftLength = 2.2): THREE.Group {
  const g = new THREE.Group();
  const glass = planeMesh(w, h, m.windowGlass, 0, 0, -0.02);
  g.add(glass);
  const f = 0.05;
  g.add(boxMesh(w + f * 2, f, 0.1, m.wood, 0, h / 2 + f / 2, 0));
  g.add(boxMesh(w + f * 2, f * 1.6, 0.18, m.wood, 0, -h / 2 - f / 2, 0.04));
  g.add(boxMesh(f, h, 0.1, m.wood, w / 2 + f / 2, 0, 0));
  g.add(boxMesh(f, h, 0.1, m.wood, -w / 2 - f / 2, 0, 0));
  g.add(boxMesh(0.03, h, 0.04, m.wood, 0, 0, 0));
  g.add(boxMesh(w, 0.03, 0.04, m.wood, 0, 0, 0));
  // cortina rasgada
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.45, h + 0.3, 5, 4), m.fabricDark);
  const p = curtain.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 25) * 0.03);
  curtain.geometry.computeVertexNormals();
  (curtain.material as THREE.Material).side = THREE.DoubleSide;
  curtain.position.set(-w * 0.32, 0.05, 0.08);
  g.add(curtain);
  g.add(moonShaft(w * 0.9, h, shaftLength));
  return g;
}

let shaftTexture: THREE.Texture | null = null;
function moonShaft(w: number, h: number, length: number): THREE.Mesh {
  if (!shaftTexture) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 128);
    // bordes laterales suaves: que no se note el plano
    ctx.globalCompositeOperation = 'destination-in';
    const side = ctx.createLinearGradient(0, 0, 64, 0);
    side.addColorStop(0, 'rgba(0,0,0,0)');
    side.addColorStop(0.3, 'rgba(0,0,0,1)');
    side.addColorStop(0.7, 'rgba(0,0,0,1)');
    side.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = side;
    ctx.fillRect(0, 0, 64, 128);
    shaftTexture = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.MeshBasicMaterial({
    map: shaftTexture,
    color: new THREE.Color(0x6f86b8).multiplyScalar(0.06),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.PlaneGeometry(w, length);
  geo.translate(0, -length / 2, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, h * 0.3, 0.05);
  mesh.rotation.x = -1.0;
  mesh.name = 'moonshaft';
  return mesh;
}

/** Escalera de madera entre dos alturas a lo largo de -Z. */
export function stairs(m: Materials, width: number, z0: number, y0: number, y1: number, steps: number, run: number): THREE.Group {
  const g = new THREE.Group();
  const rise = (y0 - y1) / steps;
  for (let i = 0; i < steps; i++) {
    const top = y0 - rise * (i + 1);
    const z = z0 - run * (i + 0.5);
    const h = top - y1 + 0.05;
    const step = new THREE.Mesh(worldBox(width, Math.max(0.05, h), run, [1, 1]), m.wood);
    step.position.set(0, y1 + Math.max(0.05, h) / 2 - 0.05, z);
    g.add(step);
  }
  return g;
}

export function boiler(m: Materials): THREE.Group {
  const g = new THREE.Group();
  g.add(cylMesh(0.35, 0.35, 1.6, m.metal, 0, 0.8, 0, 14));
  g.add(cylMesh(0.36, 0.36, 0.06, m.metalLight, 0, 1.2, 0, 14));
  g.add(cylMesh(0.06, 0.06, 1.1, m.metal, 0.2, 2.0, 0, 8));
  g.add(boxMesh(0.2, 0.25, 0.05, m.metalLight, 0, 0.6, 0.35));
  return g;
}

export function pipe(m: Materials, length: number, radius = 0.04): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), m.metal);
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

export function tripod(m: Materials): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const leg = cylMesh(0.012, 0.012, 1.45, m.metal, 0, 0, 0, 5);
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.sin(a) * 0.25, 0.7, Math.cos(a) * 0.25);
    leg.rotation.set(Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2);
    g.add(leg);
  }
  g.add(boxMesh(0.1, 0.05, 0.1, m.metal, 0, 1.42, 0));
  return g;
}

export function tvStandWithVcr(m: Materials): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(0.9, 0.5, 0.45, m.wood, 0, 0.25, 0));
  g.add(boxMesh(0.42, 0.09, 0.3, m.plastic, 0.12, 0.55, 0.02));
  g.add(boxMesh(0.2, 0.012, 0.01, m.black, 0.08, 0.56, 0.175));
  g.add(boxMesh(0.02, 0.01, 0.01, glowMaterial(0x40ff60, 1.2), 0.28, 0.56, 0.175));
  return g;
}

export function phoneTable(m: Materials): THREE.Group {
  const g = table(m, 0.5, 0.35, 0.78);
  g.add(boxMesh(0.2, 0.08, 0.18, m.plastic, 0, 0.82, 0));
  g.add(boxMesh(0.2, 0.04, 0.05, m.plastic, 0, 0.88, 0));
  return g;
}

export function coatRack(m: Materials): THREE.Group {
  const g = new THREE.Group();
  g.add(cylMesh(0.02, 0.025, 1.8, m.wood, 0, 0.9, 0, 6));
  g.add(cylMesh(0.2, 0.22, 0.04, m.wood, 0, 0.02, 0, 10));
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 1.0, 8, 1, true), m.fabricDark);
  (coat.material as THREE.Material).side = THREE.DoubleSide;
  coat.position.set(0.05, 1.2, 0.05);
  coat.rotation.z = 0.08;
  g.add(coat);
  return g;
}

export function rug(m: Materials, w: number, l: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, l), m.rug);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.006;
  return mesh;
}

/** Hilera de cintas VHS en un estante (instanciadas: una sola draw call). */
export function vhsRow(m: Materials, count: number, width: number, seed = 1): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(0.025, 0.19, 0.105);
  const mesh = new THREE.InstancedMesh(geo, m.vhs, count);
  const mat4 = new THREE.Matrix4();
  const color = new THREE.Color();
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const x = -width / 2 + (i + 0.5) * (width / count);
    const tilt = r() < 0.08 ? (r() - 0.5) * 0.6 : 0;
    mat4.makeRotationZ(tilt);
    mat4.setPosition(x, 0.095, 0);
    mesh.setMatrixAt(i, mat4);
    color.setHSL(0.08, 0.1, 0.5 + r() * 0.5);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// ------------------------------------------------------------------ objetos argentinos

/** Radio portátil de los 70: caja de madera, parlante con rejilla y dial. */
export function radio(m: Materials, dialGlow: THREE.MeshBasicMaterial): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(0.34, 0.2, 0.12, m.wood, 0, 0.1, 0));
  g.add(boxMesh(0.15, 0.15, 0.005, m.fabricDark, -0.075, 0.1, 0.061));
  g.add(boxMesh(0.12, 0.035, 0.005, dialGlow, 0.09, 0.14, 0.061));
  g.add(cylMesh(0.017, 0.017, 0.02, m.metalLight, 0.06, 0.06, 0.07, 10).rotateX(Math.PI / 2));
  g.add(cylMesh(0.017, 0.017, 0.02, m.metalLight, 0.12, 0.06, 0.07, 10).rotateX(Math.PI / 2));
  g.add(boxMesh(0.22, 0.015, 0.015, m.metalLight, 0, 0.23, 0));
  g.add(boxMesh(0.008, 0.035, 0.008, m.metalLight, -0.1, 0.21, 0));
  g.add(boxMesh(0.008, 0.035, 0.008, m.metalLight, 0.1, 0.21, 0));
  // antena
  const ant = cylMesh(0.003, 0.003, 0.5, m.metalLight, 0.15, 0.42, -0.04, 4);
  ant.rotation.z = -0.35;
  g.add(ant);
  return g;
}

/** Sifón de soda: vidrio verdoso con cabezal metálico. */
export function sifon(m: Materials): THREE.Group {
  const g = new THREE.Group();
  g.add(cylMesh(0.045, 0.045, 0.26, m.glassGreen, 0, 0.13, 0, 10));
  g.add(cylMesh(0.03, 0.04, 0.05, m.metalLight, 0, 0.285, 0, 8));
  g.add(boxMesh(0.07, 0.015, 0.02, m.metalLight, 0.03, 0.3, 0));
  g.add(boxMesh(0.06, 0.012, 0.012, m.metalLight, 0.06, 0.27, 0));
  return g;
}

/** Cajón de madera con sifones. */
export function sodaCrate(m: Materials): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(0.42, 0.02, 0.32, m.wood, 0, 0.01, 0));
  for (const [x, z, w, d] of [
    [0, 0.15, 0.42, 0.02],
    [0, -0.15, 0.42, 0.02],
    [0.2, 0, 0.02, 0.32],
    [-0.2, 0, 0.02, 0.32],
  ]) g.add(boxMesh(w, 0.2, d, m.wood, x, 0.1, z));
  for (let i = 0; i < 6; i++) {
    const s = sifon(m);
    s.position.set(-0.13 + (i % 3) * 0.13, 0.02, -0.07 + Math.floor(i / 3) * 0.14);
    if (i !== 4) g.add(s);
  }
  return g;
}

/** Balanza de almacén con plato y aguja. */
export function balanza(m: Materials): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(0.3, 0.06, 0.24, m.enamel, 0, 0.03, 0));
  g.add(boxMesh(0.22, 0.2, 0.06, m.enamel, 0, 0.16, -0.08));
  g.add(cylMesh(0.08, 0.08, 0.012, m.paper, 0, 0.18, -0.045, 16).rotateX(Math.PI / 2));
  g.add(boxMesh(0.004, 0.06, 0.004, m.redCloth, 0.01, 0.19, -0.035));
  g.add(cylMesh(0.12, 0.1, 0.02, m.metalLight, 0, 0.075, 0.03, 16));
  return g;
}

/** Caja registradora mecánica. */
export function cashRegister(m: Materials): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(0.36, 0.12, 0.34, m.metal, 0, 0.06, 0));
  g.add(boxMesh(0.3, 0.14, 0.18, m.metal, 0, 0.18, -0.06));
  g.add(boxMesh(0.2, 0.06, 0.02, m.paper, 0, 0.27, -0.13));
  for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) g.add(cylMesh(0.012, 0.012, 0.02, m.enamel, -0.08 + k * 0.04, 0.13 + r * 0.02, 0.05 + r * 0.035, 6));
  g.add(cylMesh(0.008, 0.008, 0.14, m.metalLight, 0.2, 0.17, 0, 5).rotateZ(0.5));
  return g;
}

/** Maceta con ruda (contra la mala onda, se pone en la entrada). */
export function ruda(m: Materials): THREE.Group {
  const g = new THREE.Group();
  g.add(cylMesh(0.13, 0.1, 0.24, m.terracotta, 0, 0.12, 0, 10));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07 + (i % 3) * 0.02, 0), m.plant);
    leaf.position.set(Math.cos(a) * 0.06, 0.3 + (i % 4) * 0.05, Math.sin(a) * 0.06);
    leaf.scale.set(1, 1.4, 1);
    g.add(leaf);
  }
  return g;
}

/** Cintitas rojas colgando de un dintel (contra la envidia). Ancho en X. */
export function redRibbons(m: Materials, width: number, count: number, seed = 1): THREE.Group {
  const g = new THREE.Group();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const len = 0.25 + rnd() * 0.5;
    const r = boxMesh(0.018, len, 0.004, m.redCloth, -width / 2 + rnd() * width, -len / 2, (rnd() - 0.5) * 0.04);
    r.rotation.z = (rnd() - 0.5) * 0.15;
    g.add(r);
  }
  return g;
}

/** Tubo fluorescente con su chapa. */
export function fluorescent(m: Materials, glow: THREE.MeshBasicMaterial, len = 1.2): THREE.Group {
  const g = new THREE.Group();
  g.add(boxMesh(len + 0.06, 0.04, 0.12, m.enamel, 0, -0.02, 0));
  g.add(cylMesh(0.016, 0.016, len, glow, 0, -0.06, 0, 6).rotateZ(Math.PI / 2));
  return g;
}
