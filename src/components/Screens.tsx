import { useEffect, useState } from 'react';
import type { Engine } from '../engine/Engine';
import { useUI } from '../engine/store';

/** Muestra líneas de a una, con pausas. */
function useReveal(count: number, delays: number[]): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    let i = 0;
    const tick = () => {
      if (!alive || i >= count) return;
      i++;
      setN(i);
      setTimeout(tick, delays[i - 1] ?? 1500);
    };
    const t = setTimeout(tick, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [count, delays]);
  return n;
}

/** Créditos de los modelos 3D (CC BY 4.0). */
export function Credits() {
  return (
    <div className="credits">
      Modelos 3D de Sketchfab: «Terror Engine - Skinless Crawler» de JuanCarlosOsanteHernandez (CC BY-NC 4.0) · «Breakfast (Argentina edition)» de Drawnah (CC BY 4.0) · «Food Collection - Game Ready» de Melon Polygons (CC BY 4.0).
    </div>
  );
}

const GAMEOVER_DELAYS = [1400, 1200, 600];

export function GameOverScreen({ engine }: { engine: Engine }) {
  const lines = ['SEÑAL PERDIDA', 'El Familiar cobró uno más.', '"Mientras lo tengas en el visor, no se mueve."'];
  const n = useReveal(lines.length, GAMEOVER_DELAYS);
  return (
    <div className="screen">
      <div className="noise-bg" />
      <div className="end-lines">
        {lines.map((l, i) => (
          <p key={l} className={`${i === 0 ? 'big red' : ''} ${i < n ? 'on' : ''}`}>
            {l}
          </p>
        ))}
      </div>
      {n >= lines.length && (
        <button type="button" className="btn-screen on" onClick={() => engine.retry()}>
          [ REBOBINAR ]
        </button>
      )}
    </div>
  );
}

const END_DELAYS = [3200, 2600, 2800, 2400, 2800, 3000, 1200];

export function EndScreen() {
  const ui = useUI();
  const secs = ui.ending?.seconds ?? 0;
  const dur = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  const lines = [
    { t: 'FIN', c: 'big' },
    { t: 'El inspector Salgado nunca salió de la casa Carvajal.', c: '' },
    { t: 'Su cámara apareció en la galería, prendida.', c: '' },
    { t: 'Tenía una cuarta cinta adentro.', c: '' },
    { t: `CINTA 04 — duración ${dur}`, c: '' },
    { t: 'En el barrio dicen que la pieza del fondo sigue alquilada.', c: '' },
    { t: 'REC ●', c: 'red' },
  ];
  const n = useReveal(lines.length, END_DELAYS);
  return (
    <div className="screen">
      <div className="noise-bg" />
      <div className="end-lines">
        {lines.map((l, i) => (
          <p key={l.t} className={`${l.c} ${i < n ? 'on' : ''}`}>
            {l.t}
          </p>
        ))}
      </div>
      {n >= lines.length && (
        <>
          <button type="button" className="btn-screen on" onClick={() => location.reload()}>
            [ VOLVER A EMPEZAR ]
          </button>
          <Credits />
        </>
      )}
    </div>
  );
}

export function DocViewer({ engine }: { engine: Engine }) {
  const ui = useUI();
  const doc = ui.doc;
  if (!doc) return null;
  return (
    <div className="screen doc" onClick={() => engine.closeDoc()}>
      {doc.image && <img src={doc.image} alt={doc.caption ?? ''} />}
      {doc.text && (
        <div className="paper" onClick={(e) => e.stopPropagation()}>
          {doc.text}
        </div>
      )}
      {doc.caption && <div className="caption">{doc.caption}</div>}
      <button type="button" className="btn-screen on close" onClick={() => engine.closeDoc()}>
        CERRAR
      </button>
    </div>
  );
}
