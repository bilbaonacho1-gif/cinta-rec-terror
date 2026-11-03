import { useUI } from '../engine/store';

/**
 * Explicación clara de cómo se juega: objetivo, la cámara, la regla del monstruo,
 * la visión nocturna ("rayos X" para ver en la oscuridad), la batería y los controles.
 */
export function HowToPlay({ onClose, closeLabel = 'ENTENDIDO' }: { onClose: () => void; closeLabel?: string }) {
  const ui = useUI();
  const touch = ui.touch;
  return (
    <div className="howto" onPointerDown={(e) => e.stopPropagation()}>
      <h2>CÓMO SE JUEGA</h2>

      <section>
        <h3>🎯 OBJETIVO</h3>
        <p>
          Encontrá las <b>3 cintas VHS</b> del inspector Salgado y salí por la <b>puerta de la pieza del fondo</b>.
        </p>
      </section>

      <section>
        <h3>● LA CÁMARA (REC)</h3>
        <p>
          A simple vista la casa parece vacía. <b>El monstruo sólo se ve a través de la cámara.</b> Prendela con {touch ? <b>REC</b> : <b>[C]</b>}.
        </p>
      </section>

      <section className="rule">
        <h3>⚠ LA REGLA</h3>
        <p>
          <b>Mientras lo tengas en el centro del visor, no se mueve.</b> Si le sacás la vista, le das la espalda o apagás la cámara, se acerca.
          Nunca corras: retrocedé mirándolo.
        </p>
      </section>

      <section className="nv">
        <h3>👁 VISIÓN NOCTURNA — "RAYOS X"</h3>
        <p>
          Con {touch ? <b>NV</b> : <b>[N]</b>} la cámara ve en la <b>oscuridad total</b> (imagen verde, como rayos X): pasillos sin luz, el almacén, la pieza del fondo.
          Gasta <b>el doble de batería</b>: prendela cuando no ves nada y apagala cuando hay luz.
        </p>
      </section>

      <section>
        <h3>🔋 BATERÍA</h3>
        <p>
          Arranca en 87% y baja con la cámara prendida. Juntá los <b>packs de batería</b> de la casa y cambiala con {touch ? <b>BAT +</b> : <b>[B]</b>}.
          En 0% la cámara se apaga y quedás a ciegas.
        </p>
      </section>

      <section>
        <h3>🎮 CONTROLES</h3>
        {touch ? (
          <ul>
            <li><b>Mirar:</b> mové el celular (giroscopio). Si no tenés giroscopio, arrastrá el dedo por la pantalla.</li>
            <li><b>Caminar:</b> el círculo de abajo a la izquierda.</li>
            <li><b>Agarrar / abrir / leer:</b> apuntá al objeto (aparece el texto) y tocá la pantalla o el botón TOCAR.</li>
            <li><b>REC:</b> prende y apaga la cámara · <b>NV:</b> visión nocturna · <b>BAT +:</b> cambiar batería.</li>
            <li><b>T / W:</b> zoom · <b>II:</b> pausa · <b>■ STOP:</b> cortar una cinta.</li>
          </ul>
        ) : (
          <ul>
            <li><b>Mirar:</b> mouse (hacé clic en la pantalla para capturarlo).</li>
            <li><b>Caminar:</b> W A S D o flechas.</li>
            <li><b>Agarrar / abrir / leer:</b> apuntá al objeto y tocá <b>E</b>, espacio o clic.</li>
            <li><b>C:</b> cámara · <b>N:</b> visión nocturna · <b>B:</b> cambiar batería.</li>
            <li><b>Rueda o Z / X:</b> zoom · <b>Q:</b> cortar una cinta · <b>Esc:</b> pausa.</li>
          </ul>
        )}
      </section>

      <p className="tip">Usá auriculares: los ruidos te dicen de dónde viene.</p>

      <button type="button" className="btn-screen on" onClick={onClose}>
        {closeLabel}
      </button>
    </div>
  );
}
