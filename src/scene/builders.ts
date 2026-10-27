import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Box2 } from '../types';

/** Escala de mapeo (metros por repetición) guardada en userData del material. */
export type UVScale = [number, number];

export function uvScaleOf(mat: THREE.Material): UVScale {
  return (mat.userData.uv as UVScale | undefined) ?? [1, 1];
}

/**
 * Agrupa geometría estática por material y la fusiona en pocas mallas.
 * Reduce draw calls: clave para mantener 60 FPS en celulares.
 */
export class StaticBatch {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geom: THREE.BufferGeometry, material: THREE.Material, matrix?: THREE.Matrix4): void {
    let g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    g.clearGroups();
    let list = this.buckets.get(material);
    if (!list) {
      list = [];
      this.buckets.set(material, list);
    }
    list.push(g);
    if (g !== geom) geom.dispose();
  }

  /** Hornea una malla ya posicionada (usa su matriz de mundo). */
  addMesh(mesh: THREE.Mesh): void {
    mesh.updateWorldMatrix(true, false);
    this.add(mesh.geometry, mesh.material as THREE.Material, mesh.matrixWorld);
  }

  /** Hornea todas las mallas de un grupo temporal. */
  addGroup(group: THREE.Object3D): void {
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material)) this.add(m.geometry, m.material, m.matrixWorld);
    });
  }

  build(parent: THREE.Object3D, name = 'static'): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.buckets) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${name}:${mat.name || mat.type}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      out.push(mesh);
    }
    this.buckets.clear();
    return out;
  }
}

/**
 * Caja con UVs en coordenadas de mundo: la textura mantiene su escala sin importar el tamaño.
 * offU/offV desplazan el mapeo para que paredes cortadas por puertas continúen el patrón.
 */
export function worldBox(w: number, h: number, d: number, scale: UVScale, offU = 0, offV = 0): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // orden de caras en BoxGeometry: +x, -x, +y, -y, +z, -z (4 vértices cada una)
  const faceSize: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faceSize[f];
    const side = f < 2 || f > 3;
    const su = fw / scale[0];
    const sv = fh / (side ? scale[1] : scale[0]);
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * su + (side ? offU / scale[0] : 0), uv.getY(i) * sv + (side ? offV / scale[1] : 0));
    }
  }
  uv.needsUpdate = true;
  return g;
}

export interface Opening {
  /** Centro de la abertura a lo largo de la pared (coordenada de mundo). */
  at: number;
  width: number;
  /** Altura superior de la abertura. */
  top: number;
  /** Altura inferior (0 para puertas, >0 para ventanas). */
  bottom?: number;
}

export interface WallSpec {
  /** 'x': pared paralela al eje X ubicada en z = pos. 'z': paralela al eje Z ubicada en x = pos. */
  axis: 'x' | 'z';
  pos: number;
  from: number;
  to: number;
  /** Lado de la línea central hacia el que crece el espesor (+1 / -1). */
  side: 1 | -1;
  floorY: number;
  height: number;
  material: THREE.Material;
  openings?: Opening[];
  thickness?: number;
  /** Si se pasa, se agregan las cajas de colisión de los tramos que tocan el piso. */
  colliders?: Box2[];
}

/** Construye una pared (medio espesor) con huecos para puertas y ventanas y la agrega al batch. */
export function buildWall(batch: StaticBatch, spec: WallSpec): void {
  const t = spec.thickness ?? 0.07;
  const scale = uvScaleOf(spec.material);
  const a = Math.min(spec.from, spec.to);
  const b = Math.max(spec.from, spec.to);
  const openings = [...(spec.openings ?? [])].sort((o1, o2) => o1.at - o2.at);
  const pieces: { s: number; e: number; y0: number; y1: number }[] = [];
  let cursor = a;
  for (const o of openings) {
    const s = o.at - o.width / 2;
    const e = o.at + o.width / 2;
    if (s > cursor) pieces.push({ s: cursor, e: s, y0: 0, y1: spec.height });
    if (o.top < spec.height) pieces.push({ s, e, y0: o.top, y1: spec.height });
    if ((o.bottom ?? 0) > 0) pieces.push({ s, e, y0: 0, y1: o.bottom! });
    cursor = e;
  }
  if (cursor < b) pieces.push({ s: cursor, e: b, y0: 0, y1: spec.height });

  for (const p of pieces) {
    const len = p.e - p.s;
    const h = p.y1 - p.y0;
    if (len <= 0.001 || h <= 0.001) continue;
    const mid = (p.s + p.e) / 2;
    const y = spec.floorY + p.y0 + h / 2;
    const m = new THREE.Matrix4();
    let geom: THREE.BoxGeometry;
    if (spec.axis === 'x') {
      geom = worldBox(len, h, t, scale, p.s, p.y0);
      m.makeTranslation(mid, y, spec.pos + (spec.side * t) / 2);
    } else {
      geom = worldBox(t, h, len, scale, p.s, p.y0);
      m.makeTranslation(spec.pos + (spec.side * t) / 2, y, mid);
    }
    batch.add(geom, spec.material, m);
    if (spec.colliders && p.y0 < 0.5) {
      const a0 = spec.pos;
      const a1 = spec.pos + spec.side * t;
      if (spec.axis === 'x') spec.colliders.push({ minX: p.s, maxX: p.e, minZ: Math.min(a0, a1), maxZ: Math.max(a0, a1) });
      else spec.colliders.push({ minX: Math.min(a0, a1), maxX: Math.max(a0, a1), minZ: p.s, maxZ: p.e });
    }
  }
}

/** Losa horizontal (piso o techo) con UV de mundo. */
export function buildSlab(
  batch: StaticBatch,
  material: THREE.Material,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  thickness = 0.1,
): void {
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  const geom = worldBox(w, thickness, d, uvScaleOf(material));
  // desplazar UV del piso según la posición de mundo para que no se note la repetición
  const uv = geom.attributes.uv as THREE.BufferAttribute;
  const s = uvScaleOf(material)[0];
  for (let i = 8; i < 16; i++) uv.setXY(i, uv.getX(i) + Math.min(x0, x1) / s, uv.getY(i) + Math.min(z0, z1) / s);
  const m = new THREE.Matrix4().makeTranslation((x0 + x1) / 2, y, (z0 + z1) / 2);
  batch.add(geom, material, m);
}

/** Helper para cajas simples con posición y rotación. */
export function boxMesh(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  rotY = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(worldBox(w, h, d, uvScaleOf(material)), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  return mesh;
}

export function cylMesh(
  rTop: number,
  rBottom: number,
  h: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  segments = 12,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Plano con textura (fotos, notas, cuadros). */
export function planeMesh(w: number, h: number, material: THREE.Material, x: number, y: number, z: number, rotY = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  return mesh;
}

/** Caja invisible para raycast (hotspots de interacción). */
const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
export function hitBox(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitMaterial);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.name = 'hit';
  return mesh;
}
