import type { Engine } from '../engine/Engine';
import { useUI } from '../engine/store';

/**
 * Explicación clara de cómo se juega: objetivo, la cámara, la regla del monstruo,
 * la visión nocturna ("rayos X" para ver en la oscuridad), la batería y los controles.
 */
export function HowToPlay({ onClose, closeLabel = 'ENTENDIDO', engine }: { onClose: () => void; closeLabel?: string; engine?: Engine }) {
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

      <section className="winlose">
        <h3>🏁 GANAR Y PERDER</h3>
        <p>
          <b className="win">GANÁS</b> si escapás por la puerta del fondo con las 3 cintas.
          <br />
          <b className="lose">PERDÉS</b> si el monstruo te atrapa <b>3 veces</b>: cada vez gastás un <b>rebobinado ◀◀</b> y volvés al último punto guardado.
          Los que te quedan se ven arriba a la izquierda.
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

      <section>
        <h3>🛏 ESCONDERSE</h3>
        <p>
          Si te persigue, metete <b>abajo de una cama</b> o <b>adentro de un ropero</b> ({ui.touch ? 'TOCAR' : 'E'}). Si no te vio entrar, te busca un rato y se va.
          Escuchá sus <b>pasos</b>: te dicen dónde está.
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
            <li><b>Con una sola mano:</b> mantené el dedo apoyado en la pantalla y caminás hacia donde mirás.</li>
            <li><b>Agarrar / abrir / leer:</b> tocá el objeto en la pantalla (o apuntale con el centro y tocá TOCAR).</li>
            <li><b>REC:</b> prende y apaga la cámara · <b>NV:</b> visión nocturna · <b>BAT +:</b> cambiar batería.</li>
            <li><b>T / W:</b> zoom · <b>II:</b> pausa · <b>■ STOP:</b> cortar una cinta.</li>
          </ul>
        ) : (
          <ul>
            <li><b>Mirar:</b> mouse (hacé clic en la pantalla para capturarlo).</li>
            <li><b>Caminar:</b> W A S D o flechas.</li>
            <li><b>Agarrar / abrir / leer:</b> apuntá al objeto con el centro y tocá <b>E</b>, espacio o clic.</li>
            <li><b>C:</b> cámara · <b>N:</b> visión nocturna · <b>B:</b> cambiar batería.</li>
            <li><b>Rueda o Z / X:</b> zoom · <b>Q:</b> cortar una cinta · <b>Esc:</b> pausa.</li>
          </ul>
        )}
      </section>

      <section>
        <h3>♿ ACCESIBILIDAD</h3>
        <p>
          El juego tiene <b>luces que parpadean, glitches y sustos</b>. Si te molestan, activá <b>REDUCIR PARPADEOS</b> (también está en la pausa).
        </p>
        {engine && (
          <button type="button" className="howto-toggle" aria-pressed={ui.reduceFlashing} onClick={() => engine.setSetting('reduceFlashing', !ui.reduceFlashing)}>
            REDUCIR PARPADEOS: {ui.reduceFlashing ? 'SÍ' : 'NO'}
          </button>
        )}
      </section>

      <p className="tip">Usá auriculares: los ruidos te dicen de dónde viene.</p>

      <button type="button" className="btn-screen on" onClick={onClose}>
        {closeLabel}
      </button>
    </div>
  );
}
