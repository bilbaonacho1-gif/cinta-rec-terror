import * as THREE from 'three';
import { Canvas2D, blotches, cracks, drips, grain, makeCanvas, toTexture, withAlpha } from './canvas';

/**
 * Superficies de la casa generadas en canvas al iniciar.
 * Todas las texturas se crean localmente: el juego no depende de imágenes externas.
 * Convención de mapeo: paredes = 2 m de ancho x altura completa; pisos = 2 x 2 m.
 */

function wallpaper(seed: number, base: string, pattern: string, stain: string): Canvas2D {
  const c = makeCanvas(512, 512, seed);
  const { ctx, w, h, rnd } = c;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // rayas verticales descoloridas + motivo tipo damasco
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    const x = (i / stripes) * w;
    ctx.fillStyle = withAlpha(pattern, 0.18);
    ctx.fillRect(x + 4, 0, 5, h);
    ctx.fillRect(x + 14, 0, 2, h);
    for (let y = 20; y < h; y += 64) {
      const cx = x + w / stripes / 2 + 6;
      ctx.fillStyle = withAlpha(pattern, 0.14);
      ctx.beginPath();
      ctx.ellipse(cx, y, 9, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, y + 32, 4, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // humedad desde el techo y suciedad desde el zócalo
  drips(c, 14, stain, 0.35);
  blotches(c, 10, stain, 30, 110, 0.35, { y0: 0, y1: 0.25 });
  const g = ctx.createLinearGradient(0, h * 0.72, 0, h);
  g.addColorStop(0, withAlpha('#000', 0));
  g.addColorStop(1, withAlpha('#1a120a', 0.55));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  blotches(c, 18, '#2b2418', 10, 60, 0.3);
  // papel despegado: parches claros con borde oscuro
  for (let i = 0; i < 5; i++) {
    const x = rnd() * w;
    const y = rnd() * h * 0.8;
    const pw = 20 + rnd() * 60;
    const ph = 20 + rnd() * 90;
    ctx.fillStyle = withAlpha('#b8ad96', 0.5);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + pw, y + rnd() * 10);
    ctx.lineTo(x + pw * (0.6 + rnd() * 0.4), y + ph);
    ctx.lineTo(x + rnd() * 10, y + ph * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha('#20170e', 0.5);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  cracks(c, 6, '#1b140c', 0.35);
  // zócalo de madera (la franja inferior del mapeo)
  ctx.fillStyle = '#2a1c12';
  ctx.fillRect(0, h - 26, w, 26);
  ctx.fillStyle = withAlpha('#5a4030', 0.6);
  ctx.fillRect(0, h - 27, w, 3);
  grain(c, 0.18);
  return c;
}

function plaster(seed: number, base: string): Canvas2D {
  const c = makeCanvas(256, 256, seed);
  const { ctx, w, h } = c;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  blotches(c, 30, '#6b6252', 10, 70, 0.25);
  blotches(c, 8, '#3b3020', 20, 80, 0.3);
  cracks(c, 5, '#2a241c', 0.4);
  grain(c, 0.25);
  return c;
}

function woodFloor(seed: number, base = '#4a3222'): Canvas2D {
  const c = makeCanvas(512, 512, seed);
  const { ctx, w, h, rnd } = c;
  const planks = 8;
  const pw = w / planks;
  for (let i = 0; i < planks; i++) {
    const shade = 0.75 + rnd() * 0.4;
    const col = new THREE.Color(base).multiplyScalar(shade);
    ctx.fillStyle = `#${col.getHexString()}`;
    ctx.fillRect(i * pw, 0, pw, h);
    // vetas
    for (let k = 0; k < 14; k++) {
      ctx.strokeStyle = withAlpha(rnd() > 0.5 ? '#1c120a' : '#6a4a32', 0.18 + rnd() * 0.2);
      ctx.lineWidth = 0.5 + rnd() * 1.5;
      ctx.beginPath();
      const x = i * pw + rnd() * pw;
      ctx.moveTo(x, 0);
      for (let y = 0; y <= h; y += 32) ctx.lineTo(x + Math.sin(y * 0.02 + k) * 3 + (rnd() - 0.5) * 2, y);
      ctx.stroke();
    }
    // juntas de tablas
    ctx.fillStyle = '#0d0805';
    ctx.fillRect(i * pw, 0, 2, h);
    const cut = rnd() * h;
    ctx.fillRect(i * pw, cut, pw, 2);
  }
  blotches(c, 20, '#120b06', 20, 90, 0.35);
  blotches(c, 6, '#8a7a60', 30, 120, 0.12); // polvo
  // rayones
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = withAlpha('#9a8468', 0.15);
    ctx.lineWidth = 0.6;
    const x = rnd() * w;
    const y = rnd() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 20);
    ctx.stroke();
  }
  grain(c, 0.2);
  return c;
}

function tiles(seed: number): Canvas2D {
  const c = makeCanvas(512, 512, seed);
  const { ctx, w, h, rnd } = c;
  const n = 8;
  const s = w / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dark = (x + y) % 2 === 0;
      const v = (dark ? 0.2 : 0.62) * (0.85 + rnd() * 0.25);
      const col = dark ? new THREE.Color(0.14 * v * 5, 0.13 * v * 5, 0.12 * v * 5) : new THREE.Color(v, v * 0.96, v * 0.86);
      ctx.fillStyle = `#${col.getHexString()}`;
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
  ctx.strokeStyle = '#1b1712';
  ctx.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s, 0);
    ctx.lineTo(i * s, h);
    ctx.moveTo(0, i * s);
    ctx.lineTo(w, i * s);
    ctx.stroke();
  }
  blotches(c, 24, '#2a2214', 20, 100, 0.35);
  cracks(c, 10, '#0f0c08', 0.5);
  grain(c, 0.2);
  return c;
}

/** Baldosas calcáreas de casa chorizo: cada baldosa tiene cuartos de círculo que arman rosetones con las vecinas. */
function calcareas(seed: number): Canvas2D {
  const c = makeCanvas(512, 512, seed);
  const { ctx, w, rnd } = c;
  const n = 4;
  const s = w / n;
  const ochre = '#9a6a34';
  const bordo = '#6a2a24';
  const gris = '#4c5458';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const x0 = x * s;
      const y0 = y * s;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, s, s);
      ctx.clip();
      ctx.fillStyle = '#c9bc9c';
      ctx.fillRect(x0, y0, s, s);
      // cuartos de círculo en las esquinas (forman un círculo con las 4 baldosas vecinas)
      for (const [cx, cy] of [[x0, y0], [x0 + s, y0], [x0, y0 + s], [x0 + s, y0 + s]]) {
        ctx.fillStyle = bordo;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ochre;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c9bc9c';
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      // flor central de cuatro pétalos
      const mx = x0 + s / 2;
      const my = y0 + s / 2;
      ctx.fillStyle = gris;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(mx + Math.cos((i * Math.PI) / 2) * s * 0.13, my + Math.sin((i * Math.PI) / 2) * s * 0.13, s * 0.11, s * 0.05, (i * Math.PI) / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = bordo;
      ctx.beginPath();
      ctx.arc(mx, my, s * 0.045, 0, Math.PI * 2);
      ctx.fill();
      // desgaste por baldosa
      ctx.fillStyle = withAlpha('#2a2016', 0.08 + rnd() * 0.12);
      ctx.fillRect(x0, y0, s, s);
      ctx.restore();
    }
  }
  ctx.strokeStyle = '#2a2218';
  ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s, 0);
    ctx.lineTo(i * s, w);
    ctx.moveTo(0, i * s);
    ctx.lineTo(w, i * s);
    ctx.stroke();
  }
  blotches(c, 30, '#2a2214', 20, 110, 0.3);
  cracks(c, 8, '#14100a', 0.45);
  grain(c, 0.22);
  return c;
}

/** Persiana metálica del almacén vista desde adentro: chapa ondulada, óxido. */
function persiana(seed: number): Canvas2D {
  const c = makeCanvas(256, 512, seed);
  const { ctx, w, h } = c;
  for (let y = 0; y < h; y += 16) {
    const g = ctx.createLinearGradient(0, y, 0, y + 16);
    g.addColorStop(0, '#6a6c68');
    g.addColorStop(0.5, '#9a9c96');
    g.addColorStop(1, '#3a3c3a');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, w, 16);
  }
  blotches(c, 40, '#5a2e14', 6, 50, 0.4);
  drips(c, 20, '#4a2410', 0.45);
  grain(c, 0.25);
  return c;
}

function paint(seed: number, base: string, stain: string): Canvas2D {
  const c = makeCanvas(512, 512, seed);
  const { ctx, w, h, rnd } = c;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  blotches(c, 25, stain, 20, 120, 0.25);
  drips(c, 10, '#3a3222', 0.35);
  // pintura saltada
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 3 + rnd() * 22;
    ctx.fillStyle = withAlpha('#8d8574', 0.7);
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.6) {
      const rr = r * (0.5 + rnd() * 0.7);
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.fill();
  }
  const g = ctx.createLinearGradient(0, h * 0.7, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(20,16,10,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  cracks(c, 8, '#1f1a12', 0.45);
  grain(c, 0.2);
  return c;
}

function concrete(seed: number, base = '#4a4a46'): Canvas2D {
  const c = makeCanvas(512, 512, seed);
  const { ctx, w, h } = c;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  blotches(c, 60, '#2c2c28', 8, 60, 0.25);
  blotches(c, 20, '#6a6a60', 10, 50, 0.12);
  blotches(c, 10, '#1d2418', 40, 140, 0.35, { y0: 0.5, y1: 1 }); // humedad verdosa
  drips(c, 16, '#1a1a16', 0.4);
  cracks(c, 12, '#141412', 0.55);
  grain(c, 0.35);
  return c;
}

function darkWood(seed: number, base = '#3a2618'): Canvas2D {
  const c = makeCanvas(256, 256, seed);
  const { ctx, w, h, rnd } = c;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let k = 0; k < 40; k++) {
    ctx.strokeStyle = withAlpha(rnd() > 0.5 ? '#140c06' : '#5c3e28', 0.2 + rnd() * 0.25);
    ctx.lineWidth = 0.5 + rnd() * 1.5;
    ctx.beginPath();
    const y = rnd() * h;
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + k) * 4);
    ctx.stroke();
  }
  blotches(c, 10, '#0c0806', 10, 50, 0.3);
  grain(c, 0.2);
  return c;
}

function fabric(seed: number, base = '#bdb6a6'): Canvas2D {
  const c = makeCanvas(256, 256, seed);
  const { ctx, w, h, rnd } = c;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // pliegues
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w;
    const g = ctx.createLinearGradient(x - 20, 0, x + 20, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, withAlpha('#3a3528', 0.35));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, h / 2);
    ctx.rotate((rnd() - 0.5) * 0.6);
    ctx.fillRect(-20, -h, 40, h * 2);
    ctx.restore();
  }
  blotches(c, 12, '#6e5a38', 10, 50, 0.35);
  blotches(c, 6, '#2a2418', 20, 70, 0.3, { y0: 0.7, y1: 1 });
  grain(c, 0.15);
  return c;
}

function door(seed: number): Canvas2D {
  const c = makeCanvas(256, 512, seed);
  const { ctx, w, h, rnd } = c;
  ctx.fillStyle = '#6e675a';
  ctx.fillRect(0, 0, w, h);
  const panel = (x: number, y: number, pw: number, ph: number) => {
    ctx.fillStyle = '#5d574b';
    ctx.fillRect(x, y, pw, ph);
    ctx.strokeStyle = withAlpha('#2a261e', 0.8);
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, pw, ph);
    ctx.strokeStyle = withAlpha('#8e8878', 0.5);
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 5, y + 5, pw - 10, ph - 10);
  };
  panel(28, 30, 86, 190);
  panel(142, 30, 86, 190);
  panel(28, 260, 86, 220);
  panel(142, 260, 86, 220);
  // pintura saltada dejando ver madera
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = withAlpha('#4a3a2a', 0.45);
    const x = rnd() * w;
    const y = rnd() * h;
    ctx.beginPath();
    ctx.ellipse(x, y, 1.5 + rnd() * 5, 1 + rnd() * 3, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  blotches(c, 10, '#20180e', 10, 60, 0.35);
  blotches(c, 6, '#140f08', 20, 80, 0.4, { y0: 0.4, y1: 0.6, x0: 0.75, x1: 1 }); // mugre junto al picaporte
  grain(c, 0.2);
  return c;
}

function rug(seed: number): Canvas2D {
  const c = makeCanvas(128, 512, seed);
  const { ctx, w, h } = c;
  ctx.fillStyle = '#4a1a16';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#7a5a2a';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, w - 44, h - 44);
  for (let y = 60; y < h - 40; y += 70) {
    ctx.fillStyle = withAlpha('#8a6a3a', 0.6);
    ctx.beginPath();
    ctx.moveTo(w / 2, y - 22);
    ctx.lineTo(w / 2 + 22, y);
    ctx.lineTo(w / 2, y + 22);
    ctx.lineTo(w / 2 - 22, y);
    ctx.closePath();
    ctx.fill();
  }
  blotches(c, 20, '#140806', 10, 50, 0.45);
  grain(c, 0.3);
  return c;
}

function nightWindow(seed: number): Canvas2D {
  const c = makeCanvas(256, 256, seed);
  const { ctx, w, h, rnd } = c;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1b2a44');
  g.addColorStop(0.6, '#0c1422');
  g.addColorStop(1, '#05070c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // resplandor de luna
  const m = ctx.createRadialGradient(w * 0.7, h * 0.2, 0, w * 0.7, h * 0.2, w * 0.6);
  m.addColorStop(0, 'rgba(160,180,220,0.55)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = m;
  ctx.fillRect(0, 0, w, h);
  // ramas de árbol
  ctx.strokeStyle = '#020306';
  const branch = (x: number, y: number, a: number, len: number, width: number, depth: number) => {
    if (depth <= 0 || len < 4) return;
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    branch(x2, y2, a - 0.3 - rnd() * 0.5, len * 0.72, width * 0.65, depth - 1);
    branch(x2, y2, a + 0.3 + rnd() * 0.5, len * 0.7, width * 0.65, depth - 1);
  };
  branch(w * 0.15, h, -Math.PI / 2 + 0.2, 80, 9, 7);
  branch(w * 0.95, h * 0.9, -Math.PI / 2 - 0.5, 60, 6, 6);
  // suciedad en el vidrio
  blotches(c, 14, '#8090a0', 10, 50, 0.08);
  grain(c, 0.2);
  return c;
}

function tvOff(seed: number): Canvas2D {
  const c = makeCanvas(128, 128, seed);
  const { ctx, w, h } = c;
  const g = ctx.createRadialGradient(w * 0.35, h * 0.3, 2, w / 2, h / 2, w * 0.75);
  g.addColorStop(0, '#2b3032');
  g.addColorStop(1, '#070808');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  blotches(c, 8, '#8a8a80', 5, 20, 0.06);
  return c;
}

function vhsSpine(seed: number): Canvas2D {
  const c = makeCanvas(256, 64, seed);
  const { ctx, w, h, rnd } = c;
  ctx.fillStyle = '#0d0d0e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d8d2c0';
  ctx.fillRect(20, 12, w - 40, h - 24);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '22px "Bradley Hand", "Segoe Print", cursive';
  const labels = ['14 OCT 98', 'LEDESMA', '14-10-98', 'NO', 'SÓTANO', '14 OCT'];
  ctx.fillText(labels[Math.floor(rnd() * labels.length)], 30, 40);
  grain(c, 0.25);
  return c;
}

export interface TextureSet {
  wallHall: THREE.Texture;
  wallLiving: THREE.Texture;
  wallBedroom: THREE.Texture;
  wallKitchen: THREE.Texture;
  ceiling: THREE.Texture;
  floorWood: THREE.Texture;
  floorTiles: THREE.Texture;
  concrete: THREE.Texture;
  concreteFloor: THREE.Texture;
  darkWood: THREE.Texture;
  lightWood: THREE.Texture;
  fabric: THREE.Texture;
  door: THREE.Texture;
  rug: THREE.Texture;
  window: THREE.Texture;
  tvOff: THREE.Texture;
  vhsSpine: THREE.Texture;
  calcareas: THREE.Texture;
  persiana: THREE.Texture;
}

let cache: TextureSet | null = null;

export function getTextures(): TextureSet {
  if (cache) return cache;
  cache = {
    wallHall: toTexture(wallpaper(11, '#6f6450', '#2e2616', '#3a2a14')),
    wallLiving: toTexture(wallpaper(23, '#5d5a44', '#262a1a', '#33260f')),
    wallBedroom: toTexture(wallpaper(37, '#6a5a5a', '#3a2226', '#3a2214')),
    wallKitchen: toTexture(paint(41, '#7d846e', '#4a4a30')),
    ceiling: toTexture(plaster(53, '#7a7466')),
    floorWood: toTexture(woodFloor(61)),
    floorTiles: toTexture(tiles(67)),
    concrete: toTexture(concrete(71)),
    concreteFloor: toTexture(concrete(79, '#3c3b37')),
    darkWood: toTexture(darkWood(83)),
    lightWood: toTexture(darkWood(89, '#6a4a30')),
    fabric: toTexture(fabric(97)),
    door: toTexture(door(101), { repeat: false }),
    rug: toTexture(rug(107)),
    window: toTexture(nightWindow(113), { repeat: false }),
    tvOff: toTexture(tvOff(127), { repeat: false }),
    vhsSpine: toTexture(vhsSpine(131), { repeat: false }),
    calcareas: toTexture(calcareas(137)),
    persiana: toTexture(persiana(139)),
  };
  return cache;
}
