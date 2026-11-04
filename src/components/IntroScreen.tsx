import { useEffect, useRef, useState } from 'react';
import type { Engine } from '../engine/Engine';
import { useUI } from '../engine/store';

/** Barra de carga de los assets 3D (estilo contador de cinta). */
function LoadBar({ progress }: { progress: number }) {
  const pct = Math.round(progress * 100);
  return (
    <div className="loadbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Cargando modelos 3D">
      <span>CARGANDO MODELOS 3D</span>
      <div className="bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <span className="pct">{pct}%</span>
    </div>
  );
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Step = 'lines' | 'logo' | 'phones' | 'activate' | 'done';

const LINES = [
  'BANFIELD, PROVINCIA DE BUENOS AIRES. OCTUBRE DE 1998.',
  'LA FAMILIA CARVAJAL, LA DEL ALMACÉN, DESAPARECIÓ EL 9 DE OCTUBRE.',
  'EL INSPECTOR SALGADO ENTRÓ A BUSCARLOS.',
  'SÓLO ENCONTRARON SU CÁMARA.',
];

/**
 * Pantalla negra, texto, logo REC y los dos botones que desbloquean audio (INICIAR)
 * y giroscopio (ACTIVAR CÁMARA). iOS exige que ambos ocurran dentro de un toque.
 */
export function IntroScreen({ engine, onDone }: { engine: Engine; onDone: () => void }) {
  const [step, setStep] = useState<Step>('lines');
  const [line, setLine] = useState(-1);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const skip = useRef(false);
  const ui = useUI();

  useEffect(() => {
    let alive = true;
    const run = async () => {
      await wait(700);
      for (let i = 0; i < LINES.length && alive && !skip.current; i++) {
        setLine(i);
        setVisible(true);
        for (let t = 0; t < 2300 && !skip.current; t += 50) await wait(50);
        setVisible(false);
        for (let t = 0; t < 1300 && !skip.current; t += 50) await wait(50);
      }
      if (alive) setStep('logo');
    };
    void run();
    return () => {
      alive = false;
    };
  }, []);

  const start = async () => {
    setBusy(true);
    await engine.unlockAudio();
    setBusy(false);
    setStep('phones');
    await wait(2600);
    setStep('activate');
  };

  const activate = async () => {
    setBusy(true);
    await engine.activateCamera();
    setStep('done');
    onDone();
  };

  return (
    <div className={`screen intro ${step === 'done' ? 'hidden' : ''}`} onPointerDown={() => (skip.current = true)}>
      <div className="noise-bg" />
      {!ui.modelsReady && step !== 'done' && <LoadBar progress={ui.loadProgress} />}
      {step === 'lines' && line >= 0 && <div className={`intro-line ${visible ? 'on' : ''}`}>{LINES[line]}</div>}
      {step === 'logo' && (
        <>
          <div className="logo on">
            <div className="rec">
              REC <span className="dot">●</span>
            </div>
            <div className="sub">LA ÚLTIMA CINTA</div>
          </div>
          <button type="button" className="btn-screen on" disabled={busy || !ui.modelsReady} onClick={start}>
            {ui.modelsReady ? '[ INICIAR ]' : `CARGANDO… ${Math.round(ui.loadProgress * 100)}%`}
          </button>
          <div className="intro-line small on warning">⚠ Contiene luces que parpadean y sustos. Podés reducir los parpadeos en la pausa.</div>
        </>
      )}
      {step === 'phones' && <div className="intro-line on">Ponete auriculares.</div>}
      {step === 'activate' && (
        <>
          <div className="intro-line on">Mové el celular para mirar alrededor.</div>
          <button type="button" className="btn-screen on" disabled={busy} onClick={activate}>
            ACTIVAR CÁMARA
          </button>
        </>
      )}
    </div>
  );
}
