import { useEffect, useRef, useState } from 'react';
import type { Engine } from '../engine/Engine';
import { HowToPlay } from './HowToPlay';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Step = 'lines' | 'logo' | 'phones' | 'help' | 'activate' | 'done';

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
    setStep('help');
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
      {step === 'lines' && line >= 0 && <div className={`intro-line ${visible ? 'on' : ''}`}>{LINES[line]}</div>}
      {step === 'logo' && (
        <>
          <div className="logo on">
            <div className="rec">
              REC <span className="dot">●</span>
            </div>
            <div className="sub">LA ÚLTIMA CINTA</div>
          </div>
          <button type="button" className="btn-screen on" disabled={busy} onClick={start}>
            [ INICIAR ]
          </button>
        </>
      )}
      {step === 'phones' && <div className="intro-line on">Ponete auriculares.</div>}
      {step === 'help' && <HowToPlay onClose={() => setStep('activate')} />}
      {step === 'activate' && (
        <>
          <div className="intro-line on">Mové el celular para mirar alrededor.</div>
          <div className="intro-line small on">En la compu: mouse para mirar · WASD para caminar · clic para interactuar.</div>
          <button type="button" className="btn-screen on" disabled={busy} onClick={activate}>
            ACTIVAR CÁMARA
          </button>
        </>
      )}
    </div>
  );
}
