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

const fmtTime = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

/** Resumen de la partida (pantallas de ganar y perder). */
function Stats({ won }: { won: boolean }) {
  const e = useUI().ending;
  if (!e) return null;
  return (
    <dl className={`stats ${won ? 'won' : 'lost'}`}>
      <div><dt>TIEMPO</dt><dd>{fmtTime(e.seconds)}</dd></div>
      <div><dt>CINTAS</dt><dd>{e.tapes}/3{won ? ` · vistas ${e.watched}` : ''}</dd></div>
      <div><dt>REBOBINADOS USADOS</dt><dd>{e.rewindsUsed}/3</dd></div>
      <div><dt>BATERÍA</dt><dd>{e.battery}%</dd></div>
    </dl>
  );
}

const GAMEOVER_DELAYS = [1200, 1100, 600];

/** Te atrapó, pero quedan rebobinados: volvés al último punto guardado. */
export function GameOverScreen({ engine }: { engine: Engine }) {
  const lives = useUI().lives;
  const lines = ['SEÑAL PERDIDA', `Te atrapó. Te ${lives === 1 ? 'queda 1 rebobinado' : `quedan ${lives} rebobinados`}.`, '"Mientras lo tengas en el visor, no se mueve."'];
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
      <div className="lives-row" aria-label={`Rebobinados restantes: ${lives}`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={i < lives ? 'on' : ''}>◀◀</span>
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

const WIN_DELAYS = [1600, 2000, 2200, 1800, 2200, 900];

/** GANASTE: saliste por la puerta del fondo con las tres cintas. */
export function EndScreen() {
  const lines = [
    { t: 'ESCAPASTE', c: 'big win' },
    { t: 'Saliste de la casa Carvajal con las tres cintas.', c: '' },
    { t: 'Amanece en Banfield. El primer colectivo pasa por la avenida.', c: '' },
    { t: 'Las cintas de Salgado ya no se pierden en la pieza del fondo.', c: '' },
    { t: 'En el barrio dicen que la pieza sigue alquilada.', c: 'dim' },
    { t: 'FIN', c: 'red' },
  ];
  const n = useReveal(lines.length, WIN_DELAYS);
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
      {n >= 2 && <Stats won />}
      {n >= lines.length && (
        <>
          <button type="button" className="btn-screen on" onClick={() => location.reload()}>
            [ JUGAR DE NUEVO ]
          </button>
          <Credits />
        </>
      )}
    </div>
  );
}

const LOST_DELAYS = [1400, 1800, 2000, 900];

/** PERDISTE: te atrapó sin rebobinados. */
export function LostScreen() {
  const lines = [
    { t: 'PERDISTE', c: 'big red' },
    { t: 'Te atrapó tres veces. No quedan rebobinados.', c: '' },
    { t: 'Ahora la pieza del fondo tiene una cinta más: la tuya.', c: '' },
    { t: 'REC ●', c: 'red' },
  ];
  const n = useReveal(lines.length, LOST_DELAYS);
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
      {n >= 2 && <Stats won={false} />}
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
