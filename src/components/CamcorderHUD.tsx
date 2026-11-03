import { useEffect, useState } from 'react';
import type { Engine } from '../engine/Engine';
import { useUI } from '../engine/store';
import { Joystick } from './Joystick';

function clock12(seconds: number): string {
  const s = ((Math.floor(seconds) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, ' ')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function counter(s: number): string {
  const v = Math.max(0, Math.floor(s));
  return `${Math.floor(v / 3600)}:${String(Math.floor((v % 3600) / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/** Texto que aparece y se desvanece solo (mensajes, avisos). */
function useTimed(key: number, ms: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!key) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
  return on;
}

/**
 * Visor de la videocámara. Minimalista y técnico: blanco/gris,
 * rojo sólo para REC, advertencias y batería crítica.
 */
export function CamcorderHUD({ engine }: { engine: Engine }) {
  const ui = useUI();
  const msgOn = useTimed(ui.messageKey, 5200);
  const toastOn = useTimed(ui.toastKey, 2600);
  const [gyroOn, setGyroOn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setGyroOn(false), 6000);
    return () => clearTimeout(t);
  }, []);

  const tape = ui.tape;
  const playing = ui.phase === 'tape' && !!tape;
  const vfOn = ui.cameraOn || playing;
  const free = ui.phase === 'playing' && !ui.doc && ui.promptTape === null;
  const lvl = ui.battery;
  const press = (fn: () => void) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    fn();
  };

  return (
    <div className={`hud ${ui.glitch > 0.45 ? 'jitter' : ''}`}>
      <div className={`vf ${vfOn ? 'on' : ''} ${playing ? 'tape' : ''}`}>
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        <div className="top-left">
          {!playing && <span className="rec-dot">●</span>}
          {!playing && <span className="rec-label">REC</span>}
          <span className="counter">{counter(playing ? tape.t : ui.recSeconds)}</span>
        </div>
        <div className={`battery top-right ${lvl <= 5 ? 'critical' : lvl <= 20 ? 'low' : ''}`}>
          <span className="bat-icon">
            <i style={{ width: `calc(${lvl}% - 2px)` }} />
          </span>
          <span className="bat-text">BATTERY {lvl}%</span>
        </div>
        <div className="mid-left">
          SP
          <br />
          AF
        </div>
        {playing && (
          <>
            <div className="play-mode">▶ PLAY {tape.label}</div>
            <div className="tape-title">{tape.title}</div>
          </>
        )}
        <div className="bottom-left">
          <div className="date">{playing ? tape.date : 'OCT. 14 1998'}</div>
          <div className="time">{clock12(playing ? tape.clock : ui.clock)}</div>
        </div>
        <div className="bottom-right">
          <div className={`nv-label ${(playing ? tape.nv : ui.nightVision) ? 'on' : ''}`}>NIGHT VISION</div>
          <div className="zoom">
            <span>W</span>
            <span className="zbar">
              <i style={{ left: `${((ui.zoom - 1) / 2) * 100}%` }} />
            </span>
            <span>T</span>
            <span className="zval">{ui.zoom.toFixed(1)}x</span>
          </div>
        </div>
        <div className="center-cross" />
      </div>

      <div className={`reticle ${ui.prompt && free ? 'active' : ''} ${free ? '' : 'hidden'}`} />
      <div className={`hint ${ui.prompt && free ? 'on' : ''}`}>
        {!ui.touch && <span className="key">[E]</span>}
        {ui.prompt}
      </div>
      <div className={`subs ${(playing || ui.radio) && ui.subtitle ? 'on' : ''}`}>{ui.subtitle}</div>
      <div className={`toast ${toastOn ? 'on' : ''}`}>{ui.toast}</div>
      <div className={`message ${msgOn && !playing && !ui.radio ? 'on' : ''}`}>{ui.message}</div>
      {ui.tapFx && <div key={ui.tapFx.key} className="tap-ring" style={{ left: ui.tapFx.x, top: ui.tapFx.y }} />}
      {ui.showFps && (
        <div className={`fps-meter ${ui.fps < 30 ? 'low' : ui.fps < 45 ? 'mid' : ''}`} aria-label="Cuadros por segundo">
          {ui.fps} FPS
        </div>
      )}
      <div className={`gyro-status ${gyroOn ? 'on' : ''}`}>{ui.gyro === 'active' ? 'GYRO: ACTIVE' : 'GYRO: FALLBACK'}</div>

      <div className="controls">
        {free && ui.touch && <Joystick engine={engine} />}
        <button type="button" className={`btn btn-rec ${free ? 'show' : ''} ${ui.cameraOn ? 'active' : ''}`} onPointerDown={press(() => engine.toggleCamera())}>
          <span className="dot">●</span> REC
        </button>
        <button type="button" className={`btn btn-nv ${free ? 'show' : ''} ${ui.nightVision ? 'active' : ''} ${ui.hintNV && !ui.nightVision ? 'pulse' : ''}`} onPointerDown={press(() => engine.toggleNightVision())}>
          NV
        </button>
        <button type="button" className={`btn btn-bat ${free && ui.batteries > 0 ? 'show' : ''}`} onPointerDown={press(() => engine.useBattery())}>
          BAT +{ui.batteries > 1 ? ` ×${ui.batteries}` : ''}
        </button>
        <button type="button" className={`btn btn-act ${free && ui.touch && ui.prompt ? 'show' : ''}`} onPointerDown={press(() => engine.interact())}>
          TOCAR
        </button>
        <button type="button" className={`btn btn-zt ${free && ui.cameraOn ? 'show' : ''}`} onPointerDown={press(() => engine.zoom(0.5))}>
          T
        </button>
        <button type="button" className={`btn btn-zw ${free && ui.cameraOn ? 'show' : ''}`} onPointerDown={press(() => engine.zoom(-0.5))}>
          W
        </button>
        <button type="button" className={`btn btn-menu ${free || playing ? 'show' : ''}`} onPointerDown={press(() => engine.pause())}>
          II
        </button>
        <button type="button" className={`btn btn-stop ${playing && tape.t > 0.5 ? 'show' : ''}`} onPointerDown={press(() => engine.stopTape())}>
          ■ STOP
        </button>
      </div>

      {ui.promptTape !== null && (
        <div className="prompt on">
          <div className="prompt-text">Encontraste una cinta. ¿La ves ahora? (gasta batería)</div>
          <div className="prompt-row">
            <button type="button" className="btn-screen on primary" onClick={() => engine.answerTapePrompt(true)}>
              ▶ VER AHORA
            </button>
            <button type="button" className="btn-screen on" onClick={() => engine.answerTapePrompt(false)}>
              GUARDAR
            </button>
          </div>
        </div>
      )}
      {!ui.touch && gyroOn && free && <div className="keys-hint on">[C] CÁMARA · [N] VISIÓN NOCTURNA · [B] BATERÍA · WASD CAMINAR · RUEDA: ZOOM · [ESC] PAUSA</div>}
    </div>
  );
}
