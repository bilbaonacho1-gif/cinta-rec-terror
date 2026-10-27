import type * as THREE from 'three';

/** Caja de colisión en planta (metros). */
export interface Box2 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Colisión desactivable (p. ej. una puerta abierta). */
  enabled?: () => boolean;
}

export type ItemKind = 'tape' | 'battery' | 'note' | 'photo' | 'door' | 'exit' | 'switch' | 'radio';

export interface InteractiveItem {
  id: string;
  kind: ItemKind;
  /** Texto de la acción que se muestra junto a la retícula. */
  label: string;
  /** Punto de referencia (centro del objeto). */
  position: THREE.Vector3;
  /** Objeto visible que se oculta al recogerlo. */
  object?: THREE.Object3D;
  collected: boolean;
  tapeIndex?: number;
  /** Texto que se abre al interactuar (clave de DOCUMENTS). */
  doc?: string;
  /** Distancia máxima de interacción. */
  reach?: number;
}

export interface Waypoint {
  id: string;
  room: string;
  position: THREE.Vector3;
  links: string[];
}

export type Phase = 'intro' | 'playing' | 'paused' | 'tape' | 'event' | 'caught' | 'ending' | 'end';
