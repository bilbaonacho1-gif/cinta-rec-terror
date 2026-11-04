import { useSyncExternalStore } from 'react';
import type { Phase } from '../types';

export interface TapeUI {
  index: number;
  label: string;
  title: string;
  date: string;
  clock: number;
  nv: boolean;
  t: number;
}

export interface UIState {
  phase: Phase;
  gyro: 'active' | 'fallback' | 'unknown';
  cameraOn: boolean;
  nightVision: boolean;
  battery: number;
  batteries: number;
  tapesFound: boolean[];
  tapesWatched: boolean[];
  prompt: string | null;
  message: string | null;
  messageKey: number;
  toast: string | null;
  toastKey: number;
  subtitle: string | null;
  /** La radio del almacén está sonando (muestra subtítulos fuera de las cintas). */
  radio: boolean;
  modelsReady: boolean;
  /** Progreso de descarga de los assets 3D (0..1). */
  loadProgress: number;
  /** Medidor de FPS visible. */
  showFps: boolean;
  fps: number;
  /** Anillo de selección donde se tocó un objeto. */
  tapFx: { x: number; y: number; key: number } | null;
  /** Objeto en inspección 3D (se gira con el dedo). */
  inspect: { title: string; caption: string } | null;
  /** El botón de visión nocturna titila (está muy oscuro y no se usa). */
  hintNV: boolean;
  recSeconds: number;
  clock: number;
  zoom: number;
  glitch: number;
  objective: string;
  tape: TapeUI | null;
  hasCheckpoint: boolean;
  doc: { text?: string; image?: string; caption?: string } | null;
  /** Resultado de la partida: ganaste (escapaste) o perdiste (sin rebobinados). */
  ending: { seconds: number; won: boolean; tapes: number; watched: number; rewindsUsed: number; battery: number } | null;
  /** Rebobinados que quedan: cada vez que te atrapa se gasta uno; con 0, perdés. */
  lives: number;
  volume: number;
  sensitivity: number;
  voice: boolean;
  /** Accesibilidad: menos glitches, temblores y parpadeos. */
  reduceFlashing: boolean;
  /** Modo una mano: se está caminando con la pantalla mantenida apretada. */
  holdWalk: boolean;
  touch: boolean;
  promptTape: number | null;
}

/**
 * Estado de la interfaz: el motor escribe acá y React lo lee con useSyncExternalStore.
 * Los valores que cambian todo el tiempo (batería, reloj) se publican pocas veces por segundo.
 */
class Store {
  private state: UIState;
  private listeners = new Set<() => void>();

  constructor(initial: UIState) {
    this.state = initial;
  }

  get = (): UIState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  set(patch: Partial<UIState>): void {
    let changed = false;
    for (const k of Object.keys(patch) as (keyof UIState)[]) {
      if (this.state[k] !== patch[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  message(text: string): void {
    this.set({ message: text, messageKey: this.state.messageKey + 1 });
  }

  toast(text: string): void {
    this.set({ toast: text, toastKey: this.state.toastKey + 1 });
  }
}

export const store = new Store({
  phase: 'intro',
  gyro: 'unknown',
  cameraOn: false,
  nightVision: false,
  battery: 87,
  batteries: 0,
  tapesFound: [false, false, false],
  tapesWatched: [false, false, false],
  prompt: null,
  message: null,
  messageKey: 0,
  toast: null,
  toastKey: 0,
  subtitle: null,
  radio: false,
  modelsReady: false,
  loadProgress: 0,
  showFps: typeof location !== 'undefined' && /[?&]fps\b/.test(location.search),
  fps: 0,
  tapFx: null,
  inspect: null,
  hintNV: false,
  recSeconds: 0,
  clock: 23 * 3600 + 47 * 60 + 10,
  zoom: 1,
  glitch: 0,
  objective: 'Encontrar las cintas del inspector Salgado.',
  tape: null,
  hasCheckpoint: false,
  doc: null,
  ending: null,
  lives: 3,
  volume: 0.9,
  sensitivity: 1,
  voice: true,
  reduceFlashing: false,
  holdWalk: false,
  touch: typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches,
  promptTape: null,
});

export function useUI(): UIState {
  return useSyncExternalStore(store.subscribe, store.get);
}
