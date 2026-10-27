import * as THREE from 'three';
import type { MonsterPose } from '../entities/Monster';

export interface TapeLine {
  /** Subtítulo en pantalla. Entre corchetes = sonido, no se lee en voz alta. */
  text: string;
  /** Lo que lee la voz (si difiere del subtítulo). */
  say?: string;
}

/** Lo que una cinta puede controlar mientras se reproduce. */
export interface TapeShotContext {
  /** Coloca la cámara de la grabación. */
  shoot(from: THREE.Vector3, to: THREE.Vector3, fov?: number, shake?: number): void;
  /** Muestra u oculta a la entidad dentro de la grabación. */
  entity(pos: THREE.Vector3 | null, lookAt?: THREE.Vector3, pose?: MonsterPose): void;
  /** Muestra al jugador grabado (dónde está parado ahora mismo). */
  avatar(show: boolean): void;
  /** Posición actual del jugador (al empezar la cinta). */
  player: THREE.Vector3;
  glitch(v: number): void;
}

export interface TapeData {
  id: number;
  title: string;
  label: string;
  roomName: string;
  /** Fecha y hora de la grabación (reloj trabado de la cámara). */
  date: string;
  clock: number;
  nightVision: boolean;
  lines: TapeLine[];
  /** Plano de la grabación: t = segundos, k = 0..1 del total. */
  shot(c: TapeShotContext, t: number, k: number): void;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const hms = (h: number, m: number, s: number) => h * 3600 + m * 60 + s;

/**
 * Las cintas del inspector Rubén Salgado. Cada una se reproduce en la propia cámara,
 * renderizando la casa real desde donde fue grabada.
 */
export const TAPES_DATA: TapeData[] = [
  {
    id: 1,
    title: 'CINTA 01 — EL PRIMER CONTACTO',
    label: 'TAPE 01',
    roomName: 'Living (mesa ratona)',
    date: 'OCT. 14 1998',
    clock: hms(1, 22, 4),
    nightVision: false,
    lines: [
      { text: '[Estática]' },
      { text: 'Inspector Rubén Salgado. 14 de octubre del 98, 01:22.', say: 'Inspector Rubén Salgado. Catorce de octubre del noventa y ocho. Una y veintidós de la mañana.' },
      { text: 'La fiscalía cerró la causa Carvajal como abandono de hogar. Cuatro personas, che. Nadie se va sin llevarse el auto.' },
      { text: 'Los vecinos dicen que el abuelo trajo algo de Tucumán. Algo que vivía en la pieza del fondo.' },
      { text: 'Anoche descubrí algo con esta cámara.' },
      { text: 'A simple vista, la galería está vacía. Pero por el visor... está ahí.' },
      { text: 'Mientras lo tengas en el visor, no se mueve.' },
    ],
    shot(c, t, k) {
      c.shoot(v(0, 1.55, 2.4).lerp(v(0, 1.55, 0.6), k), v(0.05, 1.3, -17), 56 - k * 16, 1);
      c.entity(k > 0.62 ? v(0, 0, -16.8) : null, c.player.clone().setY(0), 'hang');
      c.glitch(k > 0.6 && k < 0.63 ? 0.8 : 0);
      void t;
    },
  },
  {
    id: 2,
    title: 'CINTA 02 — EL INQUILINO',
    label: 'TAPE 02',
    roomName: 'Escritorio del abuelo (Salgado)',
    date: 'OCT. 14 1998',
    clock: hms(2, 47, 31),
    nightVision: true,
    lines: [
      { text: '[Respiración agitada. Pasos rápidos.]' },
      { text: '02:47. Se mueve cuando no lo mirás.', say: 'Dos y cuarenta y siete. Se mueve cuando no lo mirás.' },
      { text: 'Apagué la cámara un segundo para ahorrar batería... y escuché las cadenas.' },
      { text: 'Cuando la volví a prender, estaba cuatro metros más cerca.' },
      { text: 'Me hice un mate para no dormirme. Lo calenté hace cinco minutos y el agua ya está helada.' },
      { text: 'El abuelo le decía "el inquilino". Los peones del ingenio le decían el Familiar.' },
      { text: 'Juntá todas las baterías que encuentres. No te hagas el valiente.' },
    ],
    shot(c, _t, k) {
      // desde el escritorio hacia la puerta del estudio
      const door = v(-1.6, 1.3, -9.5);
      if (k < 0.45) c.shoot(v(-6.8, 1.5, -11.6), door, 54, 1);
      else if (k < 0.58) c.shoot(v(-6.8, 1.5, -11.6), v(-8.5, 1.2, -7), 54, 2.2);
      else c.shoot(v(-6.8, 1.5, -11.6), door.clone().lerp(v(-4.4, 1.6, -10.6), 0.8), 54, 1.4);
      const pos = k < 0.5 ? v(-2.3, 0, -9.5) : v(-4.4, 0, -10.6);
      c.entity(k > 0.18 ? pos : null, v(-6.8, 0, -11.6), k < 0.5 ? 'stand' : 'reach');
      c.glitch(k > 0.92 ? (k - 0.92) * 10 : 0);
    },
  },
  {
    id: 3,
    title: 'CINTA 03 — LA ÚLTIMA CINTA',
    label: 'TAPE 03',
    roomName: 'Pieza del fondo (altar)',
    date: 'OCT. 14 1998',
    clock: hms(4, 15, 2),
    nightVision: true,
    lines: [
      { text: '[Interferencia. Cadenas que se arrastran.]' },
      { text: '04:15. Está atrás mío. Siento el aliento en la nuca.', say: 'Cuatro y cuarto. Está atrás mío. Siento el aliento en la nuca.' },
      { text: 'El abuelo Carvajal le pagaba uno por año. Un peón del ingenio, cada 9 de octubre.', say: 'El abuelo Carvajal le pagaba uno por año. Un peón del ingenio, cada nueve de octubre.' },
      { text: 'Cuando el viejo se murió, nadie siguió pagando. Entonces cobró solo. Los cuatro.' },
      { text: 'La puerta del fondo no se abre mientras él tenga las cintas. Llevátelas todas.' },
      { text: 'Si encontraste esta cámara... no corras. No le des la espalda con la cámara apagada.' },
      { text: 'Y no dejes que la batería llegue a cero. Por lo que más quieras.' },
      { text: '[La grabación sigue. Alguien entra a la pieza.]' },
    ],
    shot(c, _t, k) {
      // cámara sobre el trípode del santuario
      c.shoot(v(3.3, 1.5, -19.1), v(-0.4, 1.0, -23.4), 58 - k * 8, 0.15);
      c.entity(k < 0.78 ? v(-1.4, 0, -24.2) : v(c.player.x - 0.9, 0, c.player.z + 1.1), c.player.clone().setY(0), k < 0.78 ? 'stand' : 'reach');
      // el final de la cinta te muestra a vos, parado junto al altar
      c.avatar(k > 0.82);
      c.glitch(k > 0.78 && k < 0.82 ? 0.9 : 0);
    },
  },
];
