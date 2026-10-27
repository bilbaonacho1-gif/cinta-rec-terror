import { useRef } from 'react';
import type { Engine } from '../engine/Engine';

/** Joystick táctil grande para caminar (sólo en pantallas táctiles). */
export function Joystick({ engine }: { engine: Engine }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);

  const move = (e: React.PointerEvent) => {
    if (active.current !== e.pointerId || !base.current || !knob.current) return;
    const r = base.current.getBoundingClientRect();
    const max = r.width / 2;
    let x = e.clientX - (r.left + max);
    let y = e.clientY - (r.top + max);
    const len = Math.hypot(x, y);
    if (len > max) {
      x = (x / len) * max;
      y = (y / len) * max;
    }
    knob.current.style.transform = `translate(${x}px, ${y}px)`;
    engine.setJoystick(x / max, y / max);
  };

  const end = (e: React.PointerEvent) => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    if (knob.current) knob.current.style.transform = '';
    engine.setJoystick(0, 0);
  };

  return (
    <div
      ref={base}
      className="joystick"
      onPointerDown={(e) => {
        e.stopPropagation();
        active.current = e.pointerId;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* puntero sintético o ya liberado */
        }
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div ref={knob} className="knob" />
    </div>
  );
}
