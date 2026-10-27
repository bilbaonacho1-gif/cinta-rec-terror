import * as THREE from 'three';

type PermissionFn = () => Promise<'granted' | 'denied' | 'default'>;

/**
 * Lee DeviceOrientationEvent (alpha, beta, gamma) y lo convierte en la orientación
 * de la cámara, como si el jugador sostuviera una ventana al mundo 3D.
 */
export class GyroscopeController {
  /** Hay datos válidos llegando del sensor. */
  active = false;
  readonly quaternion = new THREE.Quaternion();
  alpha = 0;
  beta = 0;
  gamma = 0;
  private listening = false;
  private lastEvent = 0;
  private readonly zee = new THREE.Vector3(0, 0, 1);
  private readonly euler = new THREE.Euler();
  private readonly q0 = new THREE.Quaternion();
  // la cámara mira por la parte trasera del dispositivo, no por el borde superior
  private readonly q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

  get supported(): boolean {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  /** Debe llamarse dentro de un gesto del usuario (requisito de iOS 13+). */
  async requestPermission(): Promise<boolean> {
    if (!this.supported) return false;
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn };
    if (typeof DOE.requestPermission === 'function') {
      try {
        const res = await DOE.requestPermission();
        return res === 'granted';
      } catch {
        return false;
      }
    }
    return true;
  }

  start(): void {
    if (this.listening || !this.supported) return;
    window.addEventListener('deviceorientation', this.onOrientation, true);
    this.listening = true;
  }

  stop(): void {
    window.removeEventListener('deviceorientation', this.onOrientation, true);
    this.listening = false;
    this.active = false;
  }

  /** Espera hasta `timeout` ms a que lleguen datos reales del sensor. */
  waitForData(timeout = 1200): Promise<boolean> {
    return new Promise((resolve) => {
      const start = performance.now();
      const check = () => {
        if (this.active) return resolve(true);
        if (performance.now() - start > timeout) return resolve(false);
        setTimeout(check, 60);
      };
      check();
    });
  }

  private onOrientation = (e: DeviceOrientationEvent): void => {
    if (e.alpha === null && e.beta === null && e.gamma === null) return;
    this.alpha = e.alpha ?? 0;
    this.beta = e.beta ?? 0;
    this.gamma = e.gamma ?? 0;
    this.lastEvent = performance.now();
    this.active = true;
  };

  /** Si el sensor dejó de emitir (p. ej. la pestaña perdió foco) se considera inactivo. */
  get stale(): boolean {
    return performance.now() - this.lastEvent > 3000;
  }

  private screenAngle(): number {
    const so = screen.orientation as ScreenOrientation | undefined;
    if (so && typeof so.angle === 'number') return THREE.MathUtils.degToRad(so.angle);
    const legacy = (window as unknown as { orientation?: number }).orientation;
    return THREE.MathUtils.degToRad(legacy ?? 0);
  }

  /** Actualiza `quaternion` con la orientación del dispositivo en el espacio de three.js. */
  update(): void {
    if (!this.active) return;
    const a = THREE.MathUtils.degToRad(this.alpha);
    const b = THREE.MathUtils.degToRad(this.beta);
    const g = THREE.MathUtils.degToRad(this.gamma);
    this.euler.set(b, a, -g, 'YXZ');
    this.quaternion.setFromEuler(this.euler);
    this.quaternion.multiply(this.q1);
    this.quaternion.multiply(this.q0.setFromAxisAngle(this.zee, -this.screenAngle()));
  }
}
