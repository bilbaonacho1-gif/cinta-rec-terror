import * as THREE from 'three';
import type { AudioSystem, LoopHandle } from '../audio/AudioSystem';
import { TAPES_DATA, TapeData, TapeShotContext } from '../data/tapesData';
import { ACTOR_POSES, buildPlayerAvatar } from '../entities/Actors';
import type { Humanoid } from '../entities/Humanoid';
import type { EntitySystem } from '../scene/EntitySystem';
import type { Camcorder } from './Camcorder';
import { estimateSpeech, spanishVoice } from '../audio/voice';
import { store } from './store';

const INSERT = 1.3;


/**
 * Reproduce las cintas en la propia videocámara: la grabación es la casa real
 * renderizada desde donde se filmó, con efecto VHS, voz y subtítulos.
 */
export class TapePlayer {
  playing: TapeData | null = null;
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60);
  private avatar: Humanoid;
  private t = 0;
  private line = -1;
  private lineStart = 0;
  private lineDur = 0;
  private lineDone = false;
  private ending = 0;
  private hiss: LoopHandle | null = null;
  private onEnd: ((completed: boolean) => void) | null = null;
  private ctx: TapeShotContext;
  private player = new THREE.Vector3();
  private playerDir = new THREE.Vector3();
  private voice: SpeechSynthesisVoice | null = null;
  private publish = 0;
  voiceEnabled = true;

  constructor(
    scene: THREE.Scene,
    private entity: EntitySystem,
    private audio: AudioSystem,
    private cam: Camcorder,
  ) {
    this.avatar = buildPlayerAvatar().body;
    scene.add(this.avatar.root);
    const self = this;
    this.ctx = {
      player: this.player,
      shoot(from, to, fov = 55, shake = 1) {
        const c = self.camera;
        c.position.copy(from);
        const j = shake * 0.012;
        const t = self.t;
        c.lookAt(to.clone().add(new THREE.Vector3(Math.sin(t * 1.7) * j * 6, Math.sin(t * 2.3 + 1) * j * 4, Math.cos(t * 1.3) * j * 3)));
        if (Math.abs(c.fov - fov) > 0.01) {
          c.fov = fov;
          c.updateProjectionMatrix();
        }
      },
      entity(pos, lookAt, pose) {
        self.entity.actor(pos, lookAt, pose);
      },
      avatar(show) {
        const a = self.avatar.root;
        a.visible = show;
        if (!show) return;
        a.position.copy(self.player).setY(0);
        a.rotation.set(0, Math.atan2(self.playerDir.x, self.playerDir.z), 0);
        self.avatar.applyPose(ACTOR_POSES.holdCamera);
      },
      glitch(v) {
        self.cam.tape.glitch = v;
      },
    };
    this.voice = spanishVoice();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  get active(): boolean {
    return !!this.playing;
  }

  play(index: number, player: THREE.Vector3, playerCam: THREE.Camera, onEnd?: (completed: boolean) => void): void {
    const tape = TAPES_DATA[index];
    if (!tape || this.playing) return;
    this.playing = tape;
    this.onEnd = onEnd ?? null;
    this.t = -INSERT;
    this.line = -1;
    this.ending = 0;
    this.player.copy(player);
    playerCam.getWorldDirection(this.playerDir).setY(0).normalize();
    this.camera.position.copy(playerCam.position);
    this.camera.quaternion.copy(playerCam.quaternion);
    Object.assign(this.cam.tape, { active: true, nv: tape.nightVision, glitch: 0, black: 1 });
    this.audio.play('tapeInsert', { bus: 'ui' });
    store.set({ subtitle: null, tape: { index, label: tape.label, title: tape.title, date: tape.date, clock: tape.clock, nv: tape.nightVision, t: 0 } });
  }

  stop(): void {
    if (!this.playing || this.ending) return;
    this.finish(false);
  }

  private finish(completed: boolean): void {
    this.ending = 0.9;
    this.cam.forcedStatic = 1;
    this.audio.play('static', { duration: 0.5, bus: 'tape', volume: 0.6 });
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.completed = completed;
  }

  private completed = false;

  private startLine(i: number): void {
    const tape = this.playing!;
    const line = tape.lines[i];
    this.line = i;
    this.lineStart = this.t;
    this.lineDone = false;
    const isSound = line.text.startsWith('[');
    this.lineDur = isSound ? 2.4 : estimateSpeech(line.say ?? line.text);
    store.set({ subtitle: line.text });
    if (isSound) {
      this.audio.play(i === 0 ? 'static' : 'interference', { duration: 1.4, bus: 'tape', volume: 0.5 });
      return;
    }
    if (this.voiceEnabled && typeof speechSynthesis !== 'undefined') {
      const u = new SpeechSynthesisUtterance(line.say ?? line.text);
      this.voice = spanishVoice() ?? this.voice;
      u.lang = this.voice?.lang ?? 'es-AR';
      if (this.voice) u.voice = this.voice;
      u.rate = 0.95;
      u.pitch = 0.72;
      u.volume = 0.9;
      u.onend = () => {
        if (this.line === i) this.lineDone = true;
      };
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } else {
      // sin voz disponible: murmullo de cinta debajo del subtítulo
      this.audio.play('voice', { duration: this.lineDur * 0.85, bus: 'tape', volume: 0.2 });
    }
  }

  update(dt: number): void {
    const tape = this.playing;
    if (!tape) return;
    if (this.ending > 0) {
      this.ending -= dt;
      if (this.ending <= 0) this.cleanup();
      return;
    }
    this.t += dt;
    if (this.t < 0) return;
    if (!this.hiss) this.hiss = this.audio.loop('tapeHiss', { bus: 'tape', volume: 0.9 });
    this.cam.tape.black = 0;
    this.cam.forcedStatic = Math.max(0, 0.6 - this.t * 2);

    // avance de líneas: termina la voz o se cumple el tiempo estimado
    const elapsed = this.t - this.lineStart;
    const ready = this.line < 0 || elapsed > this.lineDur * 2.2 || (elapsed > Math.min(0.8, this.lineDur) && (this.lineDone || !this.voiceEnabled || elapsed > this.lineDur));
    if (ready && this.line < tape.lines.length) {
      if (this.line + 1 < tape.lines.length) this.startLine(this.line + 1);
      else if (elapsed > this.lineDur + 1.2) {
        this.finish(true);
        return;
      }
    }
    const k = Math.min(1, (this.line + Math.min(1, elapsed / this.lineDur)) / tape.lines.length);
    tape.shot(this.ctx, this.t, k);
    this.avatar.update(dt);

    this.publish -= dt;
    if (this.publish <= 0) {
      this.publish = 0.15;
      store.set({ tape: { index: TAPES_DATA.indexOf(tape), label: tape.label, title: tape.title, date: tape.date, clock: tape.clock + this.t, nv: tape.nightVision, t: this.t } });
    }
  }

  private cleanup(): void {
    const tape = this.playing!;
    this.hiss?.stop(0.2);
    this.hiss = null;
    this.avatar.root.visible = false;
    this.cam.forcedStatic = 0;
    Object.assign(this.cam.tape, { active: false, nv: false, glitch: 0, black: 0 });
    this.audio.play('tapeEject', { bus: 'ui' });
    this.playing = null;
    store.set({ tape: null, subtitle: null });
    const cb = this.onEnd;
    this.onEnd = null;
    void tape;
    cb?.(this.completed);
  }
}
