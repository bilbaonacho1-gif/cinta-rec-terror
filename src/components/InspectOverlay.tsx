import type { Engine } from '../engine/Engine';
import { useUI } from '../engine/store';

/**
 * Panel de la inspección 3D: título, texto y la ayuda de gestos. Deja libre el centro de la pantalla
 * (ahí está el objeto) y no tapa los toques: sólo el panel y el botón reciben eventos.
 */
export function InspectOverlay({ engine }: { engine: Engine }) {
  const ui = useUI();
  const info = ui.inspect;
  if (!info) return null;
  return (
    <div className="inspect">
      <div />
      <div className="inspect-panel">
        <div className="inspect-hint" aria-hidden="true">
          ↻ ARRASTRÁ PARA GIRAR · PELLIZCÁ PARA ACERCAR
        </div>
        <h3>{info.title}</h3>
        <p>{info.caption}</p>
        <button type="button" className="btn-screen on" onClick={() => engine.closeDoc()}>
          CERRAR
        </button>
      </div>
    </div>
  );
}
