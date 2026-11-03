import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Piezas sueltas de los modelos GLB (mate, termo, productos del almacén).
 * Cada pieza se guarda con su transformación de mundo, apoyada en y = 0 y centrada en XZ,
 * con materiales Lambert (más baratos y coherentes con el resto de la casa).
 */
export class ModelKit {
  private parts = new Map<string, THREE.Object3D>();
  private materials = new Map<THREE.Material, THREE.MeshLambertMaterial>();

  async load(url: string, scale = 1): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(url);
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.name || this.parts.has(o.name) || o === root) return;
      const copy = o.clone();
      o.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
      copy.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (mesh.isMesh) mesh.material = this.lambert(mesh.material as THREE.Material);
      });
      const holder = new THREE.Group();
      holder.add(copy);
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(holder);
      if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3());
      copy.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
      holder.scale.setScalar(scale);
      holder.name = o.name;
      this.parts.set(o.name, holder);
    });
  }

  /** Prueba varias URLs en orden (p. ej. .glb y, si el hosting no sirve .glb, la versión .gltf.json). */
  async loadFirst(urls: string[], scale = 1): Promise<void> {
    let last: unknown = null;
    for (const url of urls) {
      try {
        await this.load(url, scale);
        return;
      } catch (e) {
        last = e;
      }
    }
    throw last;
  }

  private lambert(src: THREE.Material): THREE.MeshLambertMaterial {
    let m = this.materials.get(src);
    if (!m) {
      const std = src as THREE.MeshStandardMaterial;
      m = new THREE.MeshLambertMaterial({ map: std.map ?? null, color: std.color ?? 0xffffff });
      m.name = `glb:${src.name}`;
      this.materials.set(src, m);
    }
    return m;
  }

  has(name: string): boolean {
    return this.parts.has(name);
  }

  /** Copia de una pieza (null si el modelo no cargó). */
  get(name: string): THREE.Group | null {
    const p = this.parts.get(name);
    return p ? (p.clone() as THREE.Group) : null;
  }

  /** Tamaño de la pieza ya escalada (metros). */
  size(name: string): THREE.Vector3 {
    const p = this.parts.get(name);
    return p ? new THREE.Box3().setFromObject(p).getSize(new THREE.Vector3()) : new THREE.Vector3();
  }
}

/** Carga un GLTF completo (con animaciones) probando varias URLs en orden. */
export async function loadGLTF(urls: string[]): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  let last: unknown = null;
  for (const url of urls) {
    try {
      const g = await new GLTFLoader().loadAsync(url);
      return { scene: g.scene, animations: g.animations };
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
