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
  ending: { seconds: number } | null;
  volume: number;
  sensitivity: number;
  voice: boolean;
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
  volume: 0.9,
  sensitivity: 1,
  voice: true,
  touch: typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches,
  promptTape: null,
});

export function useUI(): UIState {
  return useSyncExternalStore(store.subscribe, store.get);
}
