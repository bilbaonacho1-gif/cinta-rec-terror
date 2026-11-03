import { Canvas2D, blotches, cracks, grain, handwriting, makeCanvas, withAlpha } from './canvas';

/**
 * Imágenes narrativas generadas en canvas: fotografías, dibujos y documentos.
 * Se usan como texturas en la escena y también se muestran en el visor de documentos.
 */

type Rnd = () => number;

function person(ctx: CanvasRenderingContext2D, x: number, groundY: number, height: number, width: number, tone: string, rnd: Rnd): void {
  const headR = height * 0.09;
  const bodyTop = groundY - height + headR * 2.1;
  ctx.fillStyle = tone;
  // cuerpo
  ctx.beginPath();
  ctx.moveTo(x - width * 0.35, bodyTop + headR * 0.4);
  ctx.quadraticCurveTo(x - width * 0.55, bodyTop + height * 0.2, x - width * 0.45, groundY - height * 0.42);
  ctx.lineTo(x - width * 0.3, groundY);
  ctx.lineTo(x + width * 0.3, groundY);
  ctx.lineTo(x + width * 0.45, groundY - height * 0.42);
  ctx.quadraticCurveTo(x + width * 0.55, bodyTop + height * 0.2, x + width * 0.35, bodyTop + headR * 0.4);
  ctx.closePath();
  ctx.fill();
  // cabeza
  ctx.beginPath();
  ctx.ellipse(x, bodyTop - headR * 0.6, headR * 0.85, headR, 0, 0, Math.PI * 2);
  ctx.fill();
  // rostro claro, borroso
  const g = ctx.createRadialGradient(x, bodyTop - headR * 0.6, 0, x, bodyTop - headR * 0.6, headR);
  g.addColorStop(0, withAlpha('#e8d8b8', 0.55 + rnd() * 0.1));
  g.addColorStop(1, withAlpha('#e8d8b8', 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, bodyTop - headR * 0.55, headR * 0.7, headR * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  // ojos: dos puntitos
  ctx.fillStyle = withAlpha('#2a1a0c', 0.7);
  ctx.fillRect(x - headR * 0.35, bodyTop - headR * 0.75, headR * 0.18, headR * 0.12);
  ctx.fillRect(x + headR * 0.18, bodyTop - headR * 0.75, headR * 0.18, headR * 0.12);
}

/** La figura alta: extremadamente delgada, cabeza inclinada, franjas de cinta sobre la cara. */
export function drawTallFigure(ctx: CanvasRenderingContext2D, x: number, groundY: number, height: number, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  const headR = height * 0.055;
  const neckY = groundY - height + headR * 3.2;
  ctx.fillStyle = '#1a140c';
  // piernas
  ctx.fillRect(x - height * 0.03, groundY - height * 0.5, height * 0.018, height * 0.5);
  ctx.fillRect(x + height * 0.012, groundY - height * 0.5, height * 0.018, height * 0.5);
  // torso con saco viejo
  ctx.beginPath();
  ctx.moveTo(x - height * 0.06, neckY);
  ctx.lineTo(x + height * 0.06, neckY);
  ctx.lineTo(x + height * 0.05, groundY - height * 0.42);
  ctx.lineTo(x - height * 0.055, groundY - height * 0.4);
  ctx.closePath();
  ctx.fill();
  // brazos demasiado largos
  ctx.fillRect(x - height * 0.075, neckY + 2, height * 0.014, height * 0.5);
  ctx.fillRect(x + height * 0.062, neckY + 2, height * 0.014, height * 0.52);
  // cuello y cabeza inclinada
  ctx.save();
  ctx.translate(x, neckY);
  ctx.rotate(0.45);
  ctx.fillRect(-height * 0.008, -headR * 1.2, height * 0.016, headR * 1.3);
  ctx.fillStyle = '#d6cfc0';
  ctx.beginPath();
  ctx.ellipse(0, -headR * 2.1, headR * 0.75, headR * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(-headR * 0.3, -headR * 2.3, headR * 0.2, headR * 0.26, 0, 0, Math.PI * 2);
  ctx.ellipse(headR * 0.3, -headR * 2.3, headR * 0.2, headR * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#140c06';
  ctx.lineWidth = headR * 0.28;
  ctx.beginPath();
  ctx.moveTo(-headR * 0.9, -headR * 1.6);
  ctx.lineTo(headR * 0.9, -headR * 1.95);
  ctx.moveTo(-headR * 0.9, -headR * 1.2);
  ctx.lineTo(headR * 0.9, -headR * 1.5);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function sepiaFinish(c: Canvas2D, border = 22): void {
  const { ctx, w, h } = c;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    d[i] = Math.min(255, l * 1.07 + 18);
    d[i + 1] = Math.min(255, l * 0.9 + 8);
    d[i + 2] = Math.min(255, l * 0.68);
  }
  ctx.putImageData(img, 0, 0);
  const v = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(30,15,5,0.7)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  cracks(c, 6, '#f0e6d0', 0.25);
  blotches(c, 6, '#3a2410', 10, 50, 0.3);
  grain(c, 0.25);
  // borde blanco envejecido
  ctx.strokeStyle = '#d9cfb8';
  ctx.lineWidth = border * 2;
  ctx.strokeRect(0, 0, w, h);
  ctx.strokeStyle = withAlpha('#6a5a40', 0.4);
  ctx.lineWidth = 2;
  ctx.strokeRect(border, border, w - border * 2, h - border * 2);
}


/** Foto real de la familia (public/img/familia.webp). Se precarga antes de construir la casa. */
let familyImage: HTMLImageElement | null = null;

export function preloadImages(): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      familyImage = img;
      resolve();
    };
    img.onerror = () => resolve();
    img.src = `${import.meta.env.BASE_URL}img/familia.webp`;
  });
}

/** Lo que aparece en la foto vista por la cámara: algo sin piel que asoma por detrás del hombro del padre. */
function drawPhotoCreature(c: Canvas2D, sx: number, sy: number): void {
  const { ctx } = c;
  ctx.save();
  ctx.scale(sx, sy);
  ctx.filter = 'blur(0.7px)';
  const flesh = 'rgba(112,62,48,0.93)';
  const fleshLight = 'rgba(158,104,84,0.85)';
  const dark = 'rgba(22,8,6,0.96)';
  // cuello flaco que sale de atrás del padre, inclinado hacia la cámara
  ctx.fillStyle = flesh;
  ctx.beginPath();
  ctx.moveTo(470, 168);
  ctx.quadraticCurveTo(474, 140, 486, 124);
  ctx.lineTo(499, 128);
  ctx.quadraticCurveTo(492, 150, 492, 172);
  ctx.closePath();
  ctx.fill();
  // cabeza chica, pelada y ladeada
  ctx.beginPath();
  ctx.ellipse(489, 106, 15, 21, 0.45, 0, Math.PI * 2);
  ctx.fill();
  // fibras de músculo
  ctx.strokeStyle = fleshLight;
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(478 + i * 3.5, 88 + (i % 2) * 3);
    ctx.quadraticCurveTo(480 + i * 3, 104, 478 + i * 3.5, 124);
    ctx.stroke();
  }
  // cuencas hundidas y una boca finita, abierta de lado
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(484, 101, 3.2, 4, 0.4, 0, Math.PI * 2);
  ctx.ellipse(495, 104, 3.2, 4, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(481, 115);
  ctx.quadraticCurveTo(489, 121, 497, 116);
  ctx.quadraticCurveTo(489, 118, 481, 115);
  ctx.fill();
  ctx.fillStyle = 'rgba(214,196,160,0.8)';
  for (let t = 0; t < 5; t++) ctx.fillRect(483 + t * 3, 116 + (t % 2), 1.2, 1.6);
  // dedos larguísimos sobre el hombro del padre
  ctx.strokeStyle = flesh;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  for (let f = 0; f < 4; f++) {
    ctx.beginPath();
    ctx.moveTo(472, 158 + f * 3);
    ctx.quadraticCurveTo(454 - f * 4, 150 + f * 5, 448 - f * 5, 176 + f * 6);
    ctx.stroke();
  }
  ctx.restore();
}

export type FamilyVariant = 'normal' | 'figure';

/** Retrato de la familia Carvajal. La variante 'figure' (vista por la cámara) muestra a alguien más. */
export function familyPhoto(variant: FamilyVariant): Canvas2D {
  if (familyImage) {
    const w = 512;
    const h = Math.round((w * familyImage.naturalHeight) / familyImage.naturalWidth);
    const c = makeCanvas(w, h, 777);
    c.ctx.drawImage(familyImage, 0, 0, w, h);
    if (variant === 'figure') drawPhotoCreature(c, w / 640, h / 550);
    sepiaFinish(c, 12);
    c.ctx.fillStyle = withAlpha('#3a2a14', 0.65);
    c.ctx.font = 'italic 14px serif';
    c.ctx.fillText('Los Carvajal — Tucumán, 1932', 26, h - 22);
    return c;
  }
  // sin la foto (no cargó): retrato dibujado
  const c = makeCanvas(512, 384, 777);
  const { ctx, w, h, rnd } = c;
  ctx.fillStyle = '#6a6256';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#4a4238';
  ctx.fillRect(w * 0.38, h * 0.12, w * 0.24, h * 0.6);
  ctx.fillStyle = '#2a241c';
  ctx.fillRect(w * 0.42, h * 0.18, w * 0.16, h * 0.54);
  ctx.fillStyle = '#3a342a';
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  if (variant === 'figure') drawTallFigure(ctx, w * 0.5, h * 0.72, h * 0.62, 0.9);
  person(ctx, w * 0.3, h * 0.98, h * 0.7, w * 0.2, '#2e261c', rnd);
  person(ctx, w * 0.68, h * 0.98, h * 0.64, w * 0.19, '#3e3226', rnd);
  person(ctx, w * 0.5, h * 0.98, h * 0.4, w * 0.13, '#5a4a3a', rnd);
  sepiaFinish(c);
  ctx.fillStyle = withAlpha('#3a2a14', 0.6);
  ctx.font = 'italic 15px serif';
  ctx.fillText('Los Carvajal — Tucumán, 1932', 34, h - 30);
  return c;
}

/** Dibujo infantil de Clara Ledesma. */
export function childDrawing(): Canvas2D {
  const c = makeCanvas(512, 384, 4242);
  const { ctx, w, h, rnd } = c;
  ctx.fillStyle = '#e6dfcc';
  ctx.fillRect(0, 0, w, h);
  blotches(c, 8, '#a08a60', 20, 80, 0.2);
  const crayon = (color: string, width: number, pts: [number, number][]) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const jx = x + (rnd() - 0.5) * 3;
        const jy = y + (rnd() - 0.5) * 3;
        if (i === 0) ctx.moveTo(jx, jy);
        else ctx.lineTo(jx, jy);
      });
      ctx.stroke();
    }
  };
  // casa
  crayon('#7a3a1a', 4, [[60, 300], [60, 180], [150, 110], [240, 180], [240, 300], [60, 300]]);
  crayon('#3a3aa0', 3, [[130, 300], [130, 240], [170, 240], [170, 300]]);
  // familia (palitos)
  const stick = (x: number, s: number, col: string) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, 330 - s * 1.1, s * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    crayon(col, 3, [[x, 330 - s * 0.88], [x, 330 - s * 0.35]]);
    crayon(col, 3, [[x - s * 0.25, 330 - s * 0.7], [x + s * 0.25, 330 - s * 0.7]]);
    crayon(col, 3, [[x, 330 - s * 0.35], [x - s * 0.18, 330]]);
    crayon(col, 3, [[x, 330 - s * 0.35], [x + s * 0.18, 330]]);
  };
  stick(290, 90, '#1a5a2a');
  stick(335, 80, '#a02a5a');
  stick(370, 55, '#d07a10');
  // el señor alto: negro, cara tachada
  crayon('#111', 5, [[450, 340], [450, 90]]);
  crayon('#111', 4, [[450, 150], [405, 300]]);
  crayon('#111', 4, [[450, 150], [495, 305]]);
  crayon('#111', 4, [[450, 340], [430, 370]]);
  crayon('#111', 4, [[450, 340], [470, 370]]);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(462, 62, 18, 30, 0.5, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 7; i++) crayon('#111', 3, [[438, 40 + i * 7], [488, 52 + i * 7]]);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(455, 55, 5, 0, Math.PI * 2);
  ctx.arc(470, 60, 5, 0, Math.PI * 2);
  ctx.fill();
  // tele con garabatos
  crayon('#444', 3, [[360, 120], [420, 120], [420, 170], [360, 170], [360, 120]]);
  for (let i = 0; i < 8; i++) crayon('#777', 2, [[365 + rnd() * 50, 125 + rnd() * 40], [365 + rnd() * 50, 125 + rnd() * 40]]);
  handwriting(c, 'EL SEÑOR DE LA TELE', 40, 50, 30, '#2a2a8a', { font: '"Comic Sans MS", "Chalkboard SE", cursive', jitter: 0.2 });
  handwriting(c, 'no le gusta que lo miren', 40, 86, 20, '#8a2a2a', { font: '"Comic Sans MS", "Chalkboard SE", cursive', jitter: 0.2 });
  grain(c, 0.15);
  return c;
}

/** Recorte de diario de 1998. */
export function newspaper(): Canvas2D {
  const c = makeCanvas(256, 340, 999);
  const { ctx, w, h, rnd } = c;
  ctx.fillStyle = '#cfc6ae';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.fillText('DESAPARECE', 16, 38);
  ctx.fillText('UNA FAMILIA', 16, 64);
  ctx.font = '11px Georgia, serif';
  ctx.fillText('La policía sólo halló una videocámara', 16, 84);
  ctx.fillStyle = '#555';
  ctx.fillRect(16, 94, w - 32, 90);
  for (let col = 0; col < 2; col++) {
    for (let y = 196; y < h - 16; y += 7) {
      const lw = (w - 44) / 2 - rnd() * 18;
      ctx.fillStyle = withAlpha('#222', 0.55);
      ctx.fillRect(16 + col * ((w - 32) / 2 + 6), y, lw, 3);
    }
  }
  blotches(c, 10, '#7a6030', 10, 50, 0.3);
  grain(c, 0.2);
  return c;
}

/** Hoja manuscrita genérica (vista a distancia). */
export function notePaper(seed: number, lines = 12): Canvas2D {
  const c = makeCanvas(256, 320, seed);
  const { ctx, w, h, rnd } = c;
  ctx.fillStyle = '#d8d2bc';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = withAlpha('#6a8ab0', 0.4);
  for (let y = 40; y < h; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = withAlpha('#1a1a4a', 0.75);
  ctx.lineWidth = 1.6;
  for (let i = 0; i < lines; i++) {
    const y = 36 + i * 22;
    let x = 20;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const end = w - 20 - rnd() * 80;
    while (x < end) {
      x += 3 + rnd() * 5;
      ctx.lineTo(x, y - rnd() * 8);
    }
    ctx.stroke();
  }
  blotches(c, 5, '#8a7040', 10, 40, 0.3);
  grain(c, 0.15);
  return c;
}

export function tapeLabel(text: string, seed = 5): Canvas2D {
  const c = makeCanvas(256, 64, seed);
  const { ctx, w, h } = c;
  ctx.fillStyle = '#dcd6c4';
  ctx.fillRect(0, 0, w, h);
  handwriting(c, text, w / 2, 44, 30, '#141414', { align: 'center', jitter: 0.12 });
  grain(c, 0.2);
  return c;
}

export function clockFace(): Canvas2D {
  const c = makeCanvas(128, 128, 3);
  const { ctx, w } = c;
  ctx.fillStyle = '#d6cdb4';
  ctx.beginPath();
  ctx.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillRect(w / 2 + Math.sin(a) * 50 - 2, w / 2 - Math.cos(a) * 50 - 2, 4, 4);
  }
  blotches(c, 6, '#6a5020', 5, 30, 0.35);
  grain(c, 0.15);
  return c;
}

/** Pared de fotos impresas de la habitación final: todos los que entraron, siempre con la figura detrás. */
export function photoWall(): Canvas2D {
  const c = makeCanvas(1024, 512, 1313);
  const { ctx, w, h, rnd } = c;
  ctx.fillStyle = '#2a2620';
  ctx.fillRect(0, 0, w, h);
  blotches(c, 20, '#141210', 20, 120, 0.5);
  const cols = 8;
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      if (rnd() < 0.12) continue;
      const pw = 96;
      const ph = 104;
      const x = 20 + col * (w - 40) / cols + (rnd() - 0.5) * 14;
      const y = 16 + r * (h - 20) / rows + (rnd() - 0.5) * 12;
      ctx.save();
      ctx.translate(x + pw / 2, y + ph / 2);
      ctx.rotate((rnd() - 0.5) * 0.18);
      ctx.fillStyle = '#d4ccb8';
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.fillStyle = `hsl(${30 + rnd() * 20},15%,${8 + rnd() * 8}%)`;
      ctx.fillRect(-pw / 2 + 6, -ph / 2 + 6, pw - 12, ph - 28);
      // alguien mirando a cámara
      ctx.fillStyle = '#b8ab94';
      ctx.beginPath();
      ctx.ellipse(-8 + (rnd() - 0.5) * 20, -10, 9, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-20 + (rnd() - 0.5) * 20, 2, 26, 30);
      // y la figura detrás
      ctx.fillStyle = 'rgba(200,190,170,0.55)';
      ctx.beginPath();
      ctx.ellipse(24, -30, 5, 8, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(22, -22, 4, 44);
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '10px monospace';
      ctx.fillText('14 OCT 1998', -pw / 2 + 8, ph / 2 - 8);
      ctx.restore();
    }
  }
  grain(c, 0.3);
  return c;
}

/** Etiqueta pegada sobre la cámara al encontrarla. */
export function stickyNote(text: string): Canvas2D {
  const c = makeCanvas(128, 96, 17);
  const { ctx, w, h } = c;
  ctx.fillStyle = '#d8c878';
  ctx.fillRect(0, 0, w, h);
  handwriting(c, text, w / 2, 40, 22, '#1a1a1a', { align: 'center', maxWidth: w - 10, lineHeight: 26, jitter: 0.1 });
  grain(c, 0.2);
  return c;
}

/** Fotograma de la cámara de seguridad para el visor (se genera a partir de otra imagen). */
export function canvasToDataURL(c: Canvas2D): string {
  return c.canvas.toDataURL('image/jpeg', 0.85);
}

export function blankPhoto(): Canvas2D {
  const c = makeCanvas(256, 192, 5);
  c.ctx.fillStyle = '#1a1814';
  c.ctx.fillRect(0, 0, c.w, c.h);
  sepiaFinish(c, 12);
  return c;
}


/** Almanaque de la carnicería del barrio, octubre de 1998: los días 9 marcados en rojo, año tras año. */
export function almanac(): Canvas2D {
  const c = makeCanvas(256, 384, 1998);
  const { ctx, w } = c;
  ctx.fillStyle = '#e2dac4';
  ctx.fillRect(0, 0, w, 384);
  // lámina: paisaje de sierras gastado
  const g = ctx.createLinearGradient(0, 0, 0, 150);
  g.addColorStop(0, '#7a9ab0');
  g.addColorStop(1, '#c8b48a');
  ctx.fillStyle = g;
  ctx.fillRect(12, 12, w - 24, 140);
  ctx.fillStyle = '#5a6a3a';
  ctx.beginPath();
  ctx.moveTo(12, 152);
  ctx.lineTo(70, 92);
  ctx.lineTo(120, 130);
  ctx.lineTo(180, 80);
  ctx.lineTo(w - 12, 140);
  ctx.lineTo(w - 12, 152);
  ctx.fill();
  ctx.fillStyle = '#8a1a14';
  ctx.font = 'bold 15px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('CARNICERÍA "DON TITO"', w / 2, 174);
  ctx.font = '10px Georgia, serif';
  ctx.fillStyle = '#3a2a1a';
  ctx.fillText('Atención esmerada · Envíos a domicilio', w / 2, 188);
  ctx.font = 'bold 18px Georgia, serif';
  ctx.fillText('OCTUBRE 1998', w / 2, 214);
  const days = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  ctx.font = 'bold 11px monospace';
  days.forEach((d, i) => ctx.fillText(d, 28 + i * 33, 234));
  ctx.font = '13px monospace';
  // octubre de 1998 empezó un jueves
  for (let day = 1; day <= 31; day++) {
    const idx = day + 3;
    const col = idx % 7;
    const row = Math.floor(idx / 7);
    const x = 28 + col * 33;
    const y = 254 + row * 24;
    ctx.fillStyle = col === 0 ? '#8a1a14' : '#2a2018';
    ctx.fillText(String(day), x, y);
    if (day === 9) {
      ctx.strokeStyle = '#b01010';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(x, y - 4, 14, 11, 0.1, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.textAlign = 'left';
  handwriting(c, 'cobra', 150, 296, 15, '#b01010', { jitter: 0.2 });
  blotches(c, 8, '#7a5a2a', 10, 40, 0.3);
  grain(c, 0.2);
  return c;
}

/** Cartel pintado a mano del almacén. */
export function storeSign(title: string, sub: string): Canvas2D {
  const c = makeCanvas(512, 128, 77);
  const { ctx, w, h } = c;
  ctx.fillStyle = '#1e3a2a';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c8a050';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = '#e8d8a8';
  ctx.font = 'bold 46px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, w / 2, 66);
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillStyle = '#c8a050';
  ctx.fillText(sub, w / 2, 100);
  blotches(c, 14, '#0a140e', 10, 60, 0.4);
  cracks(c, 6, '#0a0a08', 0.5);
  grain(c, 0.25);
  return c;
}

/** Cartón escrito con fibrón. */
export function cardboardSign(text: string, seed = 9): Canvas2D {
  const c = makeCanvas(256, 160, seed);
  const { ctx, w } = c;
  ctx.fillStyle = '#b08a5a';
  ctx.fillRect(0, 0, w, 160);
  blotches(c, 10, '#7a5a30', 10, 50, 0.3);
  handwriting(c, text, w / 2, 58, 30, '#141414', { align: 'center', maxWidth: w - 20, lineHeight: 40, jitter: 0.12, font: '"Marker Felt", "Comic Sans MS", sans-serif' });
  grain(c, 0.2);
  return c;
}
