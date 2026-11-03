import * as THREE from 'three';
import { store } from './store';

/**
 * Progreso de descarga de los assets 3D.
 * El LoadingManager de three cuenta los archivos; además se pesa cada archivo por su tamaño
 * para que la barra avance de forma pareja (los .glb pesan distinto).
 */
export const loadingManager = new THREE.LoadingManager();
loadingManager.onError = (url) => console.warn('No se pudo cargar', url);

const weights = new Map<string, number>();
const progress = new Map<string, number>();

function publish(): void {
  let total = 0;
  let done = 0;
  for (const [name, w] of weights) {
    total += w;
    done += w * (progress.get(name) ?? 0);
  }
  store.set({ loadProgress: total ? Math.round((done / total) * 100) / 100 : 0 });
}

/** Registra un asset (peso ≈ MB) y devuelve el callback de progreso para el loader. */
export function trackAsset(name: string, weight: number): (e: ProgressEvent) => void {
  weights.set(name, weight);
  progress.set(name, 0);
  publish();
  return (e) => {
    if (e.lengthComputable && e.total > 0) {
      progress.set(name, Math.min(0.99, e.loaded / e.total));
      publish();
    }
  };
}

/** Marca un asset como terminado (cargó o falló: en los dos casos ya no se espera). */
export function finishAsset(name: string): void {
  progress.set(name, 1);
  publish();
}
