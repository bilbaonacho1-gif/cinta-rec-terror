import { TAPES_DATA } from '../data/tapesData';
import type { Engine } from '../engine/Engine';
import { Credits } from './Screens';
import { useUI } from '../engine/store';
import { useState } from 'react';
import { HowToPlay } from './HowToPlay';

/** Pausa + inventario mínimo (cámara, baterías, cintas) + ajustes. */
export function PauseMenu({ engine }: { engine: Engine }) {
  const ui = useUI();
  const [help, setHelp] = useState(false);
  if (help) {
    return (
      <div className="screen menu">
        <HowToPlay onClose={() => setHelp(false)} closeLabel="VOLVER" />
      </div>
    );
  }
  return (
    <div className="screen menu">
      <h2>PAUSA</h2>
      <div className="status">{ui.gyro === 'active' ? 'GYRO: ACTIVE' : 'GYRO: FALLBACK'}</div>

      <section>
        <h3>OBJETIVO</h3>
        <div className="objective">{ui.objective}</div>
      </section>

      <section>
        <h3>INVENTARIO</h3>
        <div className="row">
          <span>CAMERA ✓</span>
        </div>
        <div className="row">
          <span>BATTERIES ×{ui.batteries}</span>
          <button type="button" disabled={ui.batteries === 0 || ui.battery >= 99} onClick={() => engine.useBattery()}>
            USAR
          </button>
        </div>
      </section>

      <section>
        <h3>CINTAS VHS · {ui.tapesFound.filter(Boolean).length}/3</h3>
        {TAPES_DATA.map((t, i) => (
          <div className="row" key={t.id}>
            <span>
              {ui.tapesFound[i] ? t.title : `CINTA 0${i + 1} — NO ENCONTRADA`}
              {ui.tapesWatched[i] ? ' · VISTA' : ''}
            </span>
            {ui.tapesFound[i] && (
              <button type="button" onClick={() => engine.playTape(i)}>
                ▶ PLAY
              </button>
            )}
          </div>
        ))}
      </section>

      <section>
        <h3>AJUSTES</h3>
        <div className="row">
          <span>VOLUMEN</span>
          <input type="range" min={0} max={1} step={0.05} value={ui.volume} onChange={(e) => engine.setSetting('volume', Number(e.target.value))} />
        </div>
        <div className="row">
          <span>SENSIBILIDAD</span>
          <input type="range" min={0.3} max={2.5} step={0.1} value={ui.sensitivity} onChange={(e) => engine.setSetting('sensitivity', Number(e.target.value))} />
        </div>
        <div className="row">
          <span>VOZ EN LAS CINTAS</span>
          <button type="button" onClick={() => engine.setSetting('voice', !ui.voice)}>
            {ui.voice ? 'SÍ' : 'NO'}
          </button>
        </div>
        <div className="row">
          <span>CENTRAR VISTA</span>
          <button type="button" onClick={() => engine.recenter()}>
            OK
          </button>
        </div>
      </section>

      <div className="actions">
        <button type="button" onClick={() => engine.resume()}>
          CONTINUAR
        </button>
        <button type="button" onClick={() => setHelp(true)}>
          CÓMO SE JUEGA
        </button>
        <button type="button" onClick={() => location.reload()}>
          REINICIAR
        </button>
      </div>
      <Credits />
    </div>
  );
}
