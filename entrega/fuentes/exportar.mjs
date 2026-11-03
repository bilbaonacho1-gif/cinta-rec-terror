/**
 * Exporta el afiche y el mockup a imágenes de alta resolución.
 * Uso (desde la carpeta del proyecto):  npx -y playwright@1 install chromium  (una vez)
 *                                       node entrega/fuentes/exportar.mjs
 * Genera: entrega/afiche-A4.png (300 dpi), entrega/afiche-A4.pdf y entrega/mockup.png
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..');
const browser = await chromium.launch();

// A4 = 210 × 297 mm → 793.7 × 1122.5 px CSS; ×3.125 ≈ 2480 × 3508 px (300 dpi)
const a4 = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 3.125 });
await a4.goto(`file://${here}/afiche.html`);
await a4.waitForLoadState('networkidle');
await a4.screenshot({ path: `${out}/afiche-A4.png`, clip: { x: 0, y: 0, width: 793.7, height: 1122.5 } });
await a4.pdf({ path: `${out}/afiche-A4.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true });

const mock = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await mock.goto(`file://${here}/mockup.html`);
await mock.waitForLoadState('networkidle');
await mock.screenshot({ path: `${out}/mockup.png` });

await browser.close();
console.log('Listo:', out);
