import { useEffect, useRef, useState } from 'react';
import { CamcorderHUD } from './components/CamcorderHUD';
import { IntroScreen } from './components/IntroScreen';
import { PauseMenu } from './components/PauseMenu';
import { DocViewer, EndScreen, GameOverScreen } from './components/Screens';
import { Engine } from './engine/Engine';
import { store, useUI } from './engine/store';

/**
 * React sólo dibuja la interfaz. El juego corre en Engine (fuera del ciclo de render de React),
 * así el loop nunca queda con valores viejos y la interfaz no se re-renderiza 60 veces por segundo.
 */
export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [introDone, setIntroDone] = useState(false);
  const ui = useUI();

  useEffect(() => {
    if (!host.current) return;
    const e = new Engine(host.current);
    setEngine(e);
    // acceso desde la consola durante el desarrollo
    if (import.meta.env.DEV) Object.assign(window, { game: e, store });
    return () => e.dispose();
  }, []);

  return (
    <div ref={host} className="game-root">
      {engine && !introDone && <IntroScreen engine={engine} onDone={() => setIntroDone(true)} />}
      {engine && introDone && ui.phase !== 'end' && ui.phase !== 'caught' && <CamcorderHUD engine={engine} />}
      {engine && ui.phase === 'paused' && <PauseMenu engine={engine} />}
      {engine && <DocViewer engine={engine} />}
      {engine && ui.phase === 'caught' && <GameOverScreen engine={engine} />}
      {ui.phase === 'end' && <EndScreen />}
    </div>
  );
}
