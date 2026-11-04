import * as THREE from 'three';

/**
 * Inspección 3D de objetos: el objeto aparece delante de la cámara y se gira arrastrando el dedo
 * (o el mouse) y se acerca pellizcando. Cuando no se lo toca, gira solo muy despacio.
 * Tiene su propia luz (siempre en la escena, apagada) para no recompilar shaders al usarla.
 */
export class Inspector {
  readonly root = new THREE.Group();
  private pivot = new THREE.Group();
  private light: THREE.PointLight;
  /** Fondo oscuro detrás del objeto (transparente: sólo tapa lo que está detrás). */
  private backdrop: THREE.Mesh;
  private rotX = 0.35;
  private rotY = 0;
  private velY = 0;
  private dist = 0.5;
  private idle = 0;
  private fade = 0;
  active = false;

  constructor(camera: THREE.Camera) {
    this.root.add(this.pivot);
    this.root.visible = false;
    this.light = new THREE.PointLight(0xfff0dc, 0, 2.2, 2);
    this.light.position.set(0.25, 0.3, -0.15);
    // se dibuja sin test de profundidad (tapa paredes cercanas) y antes que el objeto (renderOrder)
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    this.backdrop.position.z = -1.2;
    this.backdrop.renderOrder = 50;
    this.backdrop.visible = false;
    camera.add(this.root, this.light, this.backdrop);
  }

  /** Muestra una copia del objeto, escalada para que entre en ~22 cm. */
  show(object: THREE.Object3D, size = 0.22, rotX = 0.35): void {
    this.clear();
    const obj = object.clone(true);
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.visible = true;
    obj.traverse((o) => {
      o.visible = true;
      o.frustumCulled = false;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // materiales propios (no se tocan los de la escena) que se dibujan después del fondo oscuro
      const clone = (m: THREE.Material) => {
        const c = m.clone();
        c.transparent = true; // pasa a la cola transparente: se dibuja después del fondo
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
      mesh.renderOrder = 60;
    });
    const holder = new THREE.Group();
    holder.add(obj);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const dims = box.getSize(new THREE.Vector3());
    const s = size / Math.max(0.001, dims.x, dims.y, dims.z);
    obj.position.sub(box.getCenter(new THREE.Vector3()));
    holder.scale.setScalar(s);
    this.pivot.add(holder);
    this.rotX = rotX;
    this.rotY = -0.5;
    this.velY = 0;
    this.dist = 0.5;
    this.idle = 0;
    this.fade = 0;
    this.active = true;
    this.root.visible = true;
    this.backdrop.visible = true;
  }

  hide(): void {
    this.active = false;
    this.root.visible = false;
    this.backdrop.visible = false;
    this.light.intensity = 0;
    this.clear();
  }

  private clear(): void {
    for (const c of [...this.pivot.children]) this.pivot.remove(c);
  }

  /** Arrastre en píxeles de pantalla. */
  drag(dx: number, dy: number): void {
    if (!this.active) return;
    this.rotY += dx * 0.012;
    this.rotX = THREE.MathUtils.clamp(this.rotX + dy * 0.012, -1.4, 1.4);
    this.velY = dx * 0.012;
    this.idle = 0;
  }

  zoom(delta: number): void {
    if (!this.active) return;
    this.dist = THREE.MathUtils.clamp(this.dist - delta * 0.12, 0.3, 0.8);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.idle += dt;
    // inercia corta después de soltar, y después un giro lento automático
    this.velY *= Math.exp(-dt * 5);
    this.rotY += this.idle > 1.5 ? dt * 0.35 : this.velY * 0.2;
    this.fade = Math.min(1, this.fade + dt * 4);
    this.pivot.rotation.set(this.rotX, this.rotY, 0, 'YXZ');
    this.root.position.set(0, 0.035, -this.dist * (1.4 - this.fade * 0.4));
    this.light.intensity = 3.2 * this.fade;
    (this.backdrop.material as THREE.MeshBasicMaterial).opacity = 0.9 * this.fade;
  }
}
