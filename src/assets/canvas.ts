import * as THREE from 'three';
import { seeded } from '../core/math';

export interface Canvas2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  rnd: () => number;
}

export function makeCanvas(w: number, h: number, seed = 1): Canvas2D {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { canvas, ctx, w, h, rnd: seeded(seed) };
}

export function toTexture(c: Canvas2D | HTMLCanvasElement, opts: { repeat?: boolean; srgb?: boolean; aniso?: number } = {}): THREE.CanvasTexture {
  const canvas = c instanceof HTMLCanvasElement ? c : c.canvas;
  const tex = new THREE.CanvasTexture(canvas);
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat !== false) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.anisotropy = opts.aniso ?? 4;
  tex.needsUpdate = true;
  return tex;
}

/** Ruido de grano por píxel (multiplicativo) sobre lo que ya está dibujado. */
export function grain(c: Canvas2D, amount: number, mono = true): void {
  const img = c.ctx.getImageData(0, 0, c.w, c.h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (c.rnd() - 0.5) * amount;
    if (mono) {
      d[i] = clamp8(d[i] * (1 + n));
      d[i + 1] = clamp8(d[i + 1] * (1 + n));
      d[i + 2] = clamp8(d[i + 2] * (1 + n));
    } else {
      d[i] = clamp8(d[i] * (1 + (c.rnd() - 0.5) * amount));
      d[i + 1] = clamp8(d[i + 1] * (1 + (c.rnd() - 0.5) * amount));
      d[i + 2] = clamp8(d[i + 2] * (1 + (c.rnd() - 0.5) * amount));
    }
  }
  c.ctx.putImageData(img, 0, 0);
}

const clamp8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Manchas suaves (humedad, suciedad) con gradientes radiales. */
export function blotches(
  c: Canvas2D,
  count: number,
  color: string,
  minR: number,
  maxR: number,
  alpha: number,
  region: { x0?: number; x1?: number; y0?: number; y1?: number } = {},
): void {
  const { ctx, rnd, w, h } = c;
  const x0 = (region.x0 ?? 0) * w;
  const x1 = (region.x1 ?? 1) * w;
  const y0 = (region.y0 ?? 0) * h;
  const y1 = (region.y1 ?? 1) * h;
  for (let i = 0; i < count; i++) {
    const x = x0 + rnd() * (x1 - x0);
    const y = y0 + rnd() * (y1 - y0);
    const r = minR + rnd() * (maxR - minR);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(color, alpha * (0.4 + rnd() * 0.6)));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rnd() * 0.8), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    // repetir en los bordes para que la textura se pueda repetir horizontalmente
    if (x - r < 0 || x + r > w) {
      const xx = x - r < 0 ? x + w : x - w;
      const g2 = ctx.createRadialGradient(xx, y, 0, xx, y, r);
      g2.addColorStop(0, withAlpha(color, alpha * 0.5));
      g2.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(xx, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Chorreadas verticales de humedad desde arriba. */
export function drips(c: Canvas2D, count: number, color: string, alpha: number): void {
  const { ctx, rnd, w, h } = c;
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const len = h * (0.15 + rnd() * 0.55);
    const width = 6 + rnd() * 40;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, withAlpha(color, alpha));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - width / 2, 0);
    ctx.bezierCurveTo(x - width / 3, len * 0.5, x - width * 0.1, len * 0.9, x, len);
    ctx.bezierCurveTo(x + width * 0.1, len * 0.9, x + width / 3, len * 0.5, x + width / 2, 0);
    ctx.fill();
  }
}

/** Grietas finas ramificadas. */
export function cracks(c: Canvas2D, count: number, color: string, alpha: number): void {
  const { ctx, rnd, w, h } = c;
  ctx.strokeStyle = withAlpha(color, alpha);
  for (let i = 0; i < count; i++) {
    let x = rnd() * w;
    let y = rnd() * h;
    let a = rnd() * Math.PI * 2;
    ctx.lineWidth = 0.6 + rnd() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 8 + Math.floor(rnd() * 20);
    for (let s = 0; s < steps; s++) {
      a += (rnd() - 0.5) * 1.2;
      x += Math.cos(a) * (3 + rnd() * 9);
      y += Math.sin(a) * (3 + rnd() * 9);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

export function withAlpha(color: string, a: number): string {
  const c = new THREE.Color(color);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a.toFixed(3)})`;
}

/** Texto manuscrito aproximado con leve temblor por letra. */
export function handwriting(
  c: Canvas2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  opts: { font?: string; jitter?: number; maxWidth?: number; lineHeight?: number; align?: CanvasTextAlign } = {},
): number {
  const { ctx, rnd } = c;
  const font = opts.font ?? `"Bradley Hand", "Segoe Print", "Comic Sans MS", "Marker Felt", cursive`;
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  const jitter = opts.jitter ?? 0.08;
  const lines = wrapText(ctx, text, opts.maxWidth ?? c.w - x - 10);
  const lh = opts.lineHeight ?? size * 1.35;
  lines.forEach((line, li) => {
    let cx = x;
    if (opts.align === 'center') cx = x - ctx.measureText(line).width / 2;
    for (const ch of line) {
      ctx.save();
      ctx.translate(cx, y + li * lh + (rnd() - 0.5) * size * jitter);
      ctx.rotate((rnd() - 0.5) * jitter);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      cx += ctx.measureText(ch).width;
    }
  });
  return y + lines.length * lh;
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}
