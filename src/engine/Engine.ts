import * as THREE from 'three';
import { almanac, familyPhoto } from '../assets/images';
import { AudioSystem, LoopHandle } from '../audio/AudioSystem';
import { Scheduler } from '../core/Scheduler';
import { clamp } from '../core/math';
import { GyroscopeController } from '../controllers/GyroscopeController';
import { LookController } from '../controllers/LookController';
import { PlayerController } from '../controllers/PlayerController';
import { DOCUMENTS, DocId } from '../data/documents';
import { TAPES_DATA } from '../data/tapesData';
import { PostFX } from '../effects/PostFX';
import { EntitySystem } from '../scene/EntitySystem';
import { HouseBuilder, SPAWN } from '../scene/HouseBuilder';
import { ModelKit } from '../scene/ModelKit';
import { Director } from '../story/Director';
import type { InteractiveItem, Phase } from '../types';
import { Camcorder } from './Camcorder';
import { Radio } from './Radio';
import { TapePlayer } from './TapePlayer';
import { store } from './store';

const isMobile = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

interface Checkpoint {
  pos: THREE.Vector3;
  yaw: number;
  battery: number;
  batteries: number;
  found: boolean[];
  watched: boolean[];
  collected: string[];
  aggression: number;
}

/**
 * Motor del juego (sin React): escena, loop, sistemas y acciones que dispara la interfaz.
 * La interfaz sólo lee `store` y llama a estos métodos.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(64, 1, 0.05, 60);
  readonly post: PostFX;
  readonly audio = new AudioSystem();
  readonly gyro = new GyroscopeController();
  readonly look: LookController;
  readonly player = new PlayerController(SPAWN);
  readonly house: HouseBuilder;
  readonly entity: EntitySystem;
  readonly camcorder: Camcorder;
  readonly tapes: TapePlayer;
  readonly director: Director;
  readonly radio: Radio;
  readonly scheduler = new Scheduler();
  phase: Phase = 'intro';
  time = 0;
  clockLoop: LoopHandle | null = null;
  private nearby: InteractiveItem | null = null;
  private last = performance.now();
  private publish = 0;
  private interactTimer = 0;
  private raycaster = new THREE.Raycaster();
  private checkpoint: Checkpoint | null = null;
  private perf = { frames: 0, time: 0 };
  private maxScale = isMobile ? 0.8 : 1;
  private lastPause = 0;
  private docOpen = false;
  private entitySnapshot: ReturnType<EntitySystem['snapshot']> | null = null;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.domElement.className = 'game-canvas';
    container.prepend(this.renderer.domElement);
    this.post = new PostFX(this.renderer);
    this.post.renderScale = isMobile ? 0.62 : 0.85;
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.045);
    this.scene.add(this.camera);

    this.look = new LookController(this.renderer.domElement, this.gyro, {
      tap: () => this.interact(),
      zoom: (d) => this.zoom(d),
      lockLost: () => {
        if (this.phase === 'playing' && !this.docOpen) this.pause();
      },
    });
    this.house = new HouseBuilder(this.scene);
    this.camcorder = new Camcorder(this.scene, this.audio);
    this.entity = new EntitySystem(this.scene, this.house, this.audio);
    this.tapes = new TapePlayer(this.scene, this.entity, this.audio, this.camcorder);
    this.director = new Director(this);
    this.radio = new Radio(this.audio, this.house.refs.radio.getWorldPosition(new THREE.Vector3()));
    void this.loadModels();

    this.camcorder.onThreshold = (th) => {
      this.audio.play('batteryLow', { bus: 'ui' });
      if (th === 20) this.camcorder.burst(0.3, 0.4, this.time, false);
      if (th <= 10) store.toast(`BATTERY ${this.camcorder.display}%`);
    };
    this.camcorder.onDepleted = () => void this.onBatteryDead();
    this.entity.onAttack = () => void this.onCaught();
    this.entity.onFirstSeen = () => {
      this.audio.play('swell', { duration: 6, volume: 0.6 });
      this.director.setTension(0.3);
    };
    // baldosas y cemento suenan distinto que el parquet del living y el escritorio
    this.player.onStep = () => {
      const room = this.house.roomAt(this.player.position);
      this.audio.play(room === 'living' || room === 'study' ? 'footWood' : 'footConcrete', { volume: 0.5 });
    };

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'playing') this.pause();
    });
    this.loadSettings();
    this.resize();
    this.precompile();
    this.look.recenter(0);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------------ arranque
  /** Modelos GLB (mate, termo, mercadería). Si no cargan, la casa se juega igual. */
  private async loadModels(): Promise<void> {
    const kit = new ModelKit();
    const base = import.meta.env.BASE_URL;
    const urls = (name: string) => [`${base}models/${name}.glb`, `${base}models/${name}.gltf.json`];
    const results = await Promise.allSettled([kit.loadFirst(urls('desayuno'), 0.085), kit.loadFirst(urls('almacen'))]);
    for (const r of results) if (r.status === 'rejected') console.warn('Modelo no disponible:', r.reason);
    this.house.furnish(kit);
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      /* se compila al primer cuadro */
    }
    store.set({ modelsReady: true });
  }

  /** Primer gesto: desbloquear audio (iOS lo exige dentro del click). */
  async unlockAudio(): Promise<void> {
    await this.audio.unlock();
    this.audio.startAmbience();
    this.audio.setVolume(store.get().volume);
  }

  /** Segundo gesto: permiso de giroscopio y comienzo. */
  async activateCamera(): Promise<void> {
    const granted = await this.gyro.requestPermission();
    let active = false;
    if (granted) {
      this.gyro.start();
      active = await this.gyro.waitForData(1000);
    }
    if (!active) this.gyro.stop();
    this.look.mode = active ? 'gyro' : this.look.prefersPointerLock ? 'pointerlock' : 'drag';
    this.look.enabled = true;
    this.player.enabled = true;
    this.look.recenter(0);
    store.set({ gyro: active ? 'active' : 'fallback', phase: 'playing' });
    this.phase = 'playing';
    this.camcorder.fade = 1;
    this.camcorder.fadeTarget = 0;
    this.camcorder.fadeSpeed = 0.35;
    this.last = performance.now();
    const clockPos = this.house.refs.clock?.getWorldPosition(new THREE.Vector3());
    if (clockPos) this.clockLoop = this.audio.loop('clockTick', { pos: clockPos, volume: 0.8 });
    for (const id of ['hallSconce', 'hallLamp2', 'storeTube']) {
      const f = this.house.fixture(id);
      if (f) this.audio.loop('buzz', { pos: f.position, volume: 0.5 });
    }
    const tv = this.house.fixture('livingTV');
    if (tv) this.audio.loop('tvStatic', { pos: tv.position, volume: 0.5 });
    this.saveCheckpoint();
    this.look.requestLock();
  }

  private precompile(): void {
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch {
      /* noop */
    }
    hidden.forEach((o) => (o.visible = false));
  }

  // ------------------------------------------------------------------ acciones de la interfaz
  get canControl(): boolean {
    return this.phase === 'playing' && !this.docOpen;
  }

  toggleCamera(): void {
    if (!this.canControl) return;
    if (this.camcorder.on) this.camcorder.powerOff();
    else if (!this.camcorder.powerOn()) store.toast('BATTERY 0%');
    this.look.zoomTarget = this.camcorder.on ? this.look.zoomTarget : 1;
    this.syncUI();
  }

  toggleNightVision(): void {
    if (!this.canControl) return;
    const wasOn = this.camcorder.nightVision;
    this.camcorder.setNightVision(!wasOn);
    if (!wasOn && this.camcorder.nightVision && this.director.firstTime('nvHint')) {
      store.message('VISIÓN NOCTURNA: ve en la oscuridad, pero gasta el doble de batería.');
    }
    this.syncUI();
  }

  zoom(delta: number): void {
    if (!this.canControl || !this.camcorder.on) return;
    this.look.zoomTarget = clamp(this.look.zoomTarget + delta, 1, 3);
  }

  setJoystick(x: number, y: number): void {
    this.player.joystick.x = x;
    this.player.joystick.y = y;
  }

  useBattery(): void {
    const s = store.get();
    if (!this.canControl || s.batteries <= 0 || this.camcorder.battery >= 99) return;
    this.camcorder.addBattery(20);
    this.audio.play('batteryInsert', { bus: 'ui' });
    store.set({ batteries: s.batteries - 1 });
    store.toast(`BATTERY ${this.camcorder.display}%`);
    this.syncUI();
  }

  pause(): void {
    if (this.phase !== 'playing' && this.phase !== 'tape') return;
    if (performance.now() - this.lastPause < 350) return;
    this.lastPause = performance.now();
    this.prevPhase = this.phase;
    this.phase = 'paused';
    this.look.exitLock();
    this.radio.stop();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.pause();
    void this.audio.suspend();
    store.set({ phase: 'paused' });
  }

  private prevPhase: Phase = 'playing';

  resume(): void {
    if (this.phase !== 'paused') return;
    if (performance.now() - this.lastPause < 350) return;
    this.lastPause = performance.now();
    this.phase = this.prevPhase;
    void this.audio.resume();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.resume();
    this.last = performance.now();
    store.set({ phase: this.phase });
    if (this.phase === 'playing') this.look.requestLock();
  }

  recenter(): void {
    this.look.recenter(this.look.currentYaw(this.camera));
    this.audio.play('recBeep', { bus: 'ui' });
  }

  setSetting(key: 'volume' | 'sensitivity' | 'voice', value: number | boolean): void {
    if (key === 'volume') this.audio.setVolume(value as number);
    if (key === 'sensitivity') this.look.sensitivity = value as number;
    if (key === 'voice') this.tapes.voiceEnabled = value as boolean;
    store.set({ [key]: value } as Partial<ReturnType<typeof store.get>>);
    try {
      const s = store.get();
      localStorage.setItem('rec-carvajal', JSON.stringify({ volume: s.volume, sensitivity: s.sensitivity, voice: s.voice }));
    } catch {
      /* sin almacenamiento */
    }
  }

  private loadSettings(): void {
    try {
      const raw = localStorage.getItem('rec-carvajal');
      if (!raw) return;
      const s = JSON.parse(raw) as { volume: number; sensitivity: number; voice: boolean };
      store.set(s);
      this.look.sensitivity = s.sensitivity;
      this.tapes.voiceEnabled = s.voice;
    } catch {
      /* noop */
    }
  }

  closeDoc(): void {
    if (!this.docOpen) return;
    this.docOpen = false;
    store.set({ doc: null });
    this.last = performance.now();
    this.look.requestLock();
  }

  private showDoc(doc: { text?: string; image?: string; caption?: string }): void {
    this.docOpen = true;
    this.look.exitLock();
    this.audio.play('paper', { bus: 'ui' });
    store.set({ doc });
  }

  /** Respuesta al encontrar una cinta: verla ahora o guardarla. */
  answerTapePrompt(play: boolean): void {
    const i = store.get().promptTape;
    store.set({ promptTape: null });
    this.docOpen = false;
    if (play && i !== null) this.playTape(i);
    else this.look.requestLock();
  }

  playTape(index: number): void {
    if (!store.get().tapesFound[index] || this.tapes.active) return;
    if (this.phase === 'paused') {
      this.phase = 'playing';
      void this.audio.resume();
    }
    if (this.phase !== 'playing') return;
    this.radio.stop();
    this.phase = 'tape';
    this.look.exitLock();
    if (!this.camcorder.on) this.camcorder.powerOn(true);
    if (this.camcorder.nightVision) this.camcorder.setNightVision(false, true);
    this.entitySnapshot = this.entity.snapshot();
    this.entity.entity.setSkinGlow(2);
    store.set({ phase: 'tape' });
    this.tapes.play(index, this.player.position, this.camera, () => this.afterTape(index));
  }

  stopTape(): void {
    this.tapes.stop();
  }

  private afterTape(index: number): void {
    if (this.entitySnapshot) this.entity.restore(this.entitySnapshot);
    this.entity.entity.setSkinGlow(1);
    this.entitySnapshot = null;
    const watched = [...store.get().tapesWatched];
    watched[index] = true;
    this.phase = 'playing';
    store.set({ tapesWatched: watched, phase: 'playing' });
    this.last = performance.now();
    if (index === 0) this.director.wakeEntity(14);
  }

  retry(): void {
    const cp = this.checkpoint;
    if (!cp) return location.reload();
    this.player.reset(cp.pos);
    this.look.recenter(cp.yaw);
    this.camcorder.battery = Math.max(cp.battery, 35);
    this.camcorder.forcedBlack = 0;
    this.camcorder.forcedStatic = 0;
    this.camcorder.fade = 1;
    this.camcorder.fadeTarget = 0;
    for (const item of this.house.interactiveItems) {
      const was = cp.collected.includes(item.id);
      item.collected = was;
      if (item.object) item.object.visible = !was;
    }
    store.set({ batteries: cp.batteries, tapesFound: [...cp.found], tapesWatched: [...cp.watched], phase: 'playing' });
    this.entity.reset();
    this.entity.aggression = cp.aggression;
    this.entity.entity.setSkinGlow(1);
    if (this.director.introDone || cp.found.some(Boolean)) this.entity.startStalking(12);
    this.audio.restoreAmbience();
    this.audio.setVolume(store.get().volume);
    this.phase = 'playing';
    this.last = performance.now();
    if (!this.camcorder.on) this.camcorder.powerOn(true);
    this.look.requestLock();
  }

  private saveCheckpoint(): void {
    const s = store.get();
    this.checkpoint = {
      pos: this.player.position.clone(),
      yaw: this.look.currentYaw(this.camera),
      battery: this.camcorder.battery,
      batteries: s.batteries,
      found: [...s.tapesFound],
      watched: [...s.tapesWatched],
      collected: this.house.interactiveItems.filter((i) => i.collected).map((i) => i.id),
      aggression: this.entity.aggression,
    };
    store.set({ hasCheckpoint: true });
  }

  // ------------------------------------------------------------------ interacción
  private findNearby(): InteractiveItem | null {
    const eye = this.camera.position;
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    let best: InteractiveItem | null = null;
    let bestScore = Infinity;
    for (const item of this.house.interactiveItems) {
      if (item.collected) continue;
      const to = item.position.clone().sub(eye);
      const d = to.length();
      if (d > (item.reach ?? 2.2)) continue;
      const ang = THREE.MathUtils.radToDeg(Math.acos(clamp(to.normalize().dot(fwd), -1, 1)));
      if (ang > 38 && d > 1.1) continue;
      // nada en el medio (paredes, puertas)
      this.raycaster.set(eye, to);
      this.raycaster.far = Math.max(0.01, d - 0.35);
      if (this.raycaster.intersectObjects(this.house.occluders, false).length) continue;
      const score = ang + d * 8;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return best;
  }

  private labelFor(item: InteractiveItem): string {
    const s = store.get();
    if (item.kind === 'door' && item.id === 'door-study') return this.house.doors.study.open ? 'CERRAR PUERTA' : 'ABRIR PUERTA';
    if (item.kind === 'radio') return this.radio.on ? 'APAGAR LA RADIO' : 'PRENDER LA RADIO';
    if (item.kind === 'exit') {
      const n = s.tapesFound.filter(Boolean).length;
      return n >= 3 ? 'ABRIR LA PUERTA' : `PUERTA SELLADA · ${n}/3 CINTAS`;
    }
    return item.label;
  }

  interact(): void {
    if (!this.canControl || store.get().promptTape !== null) return;
    const item = this.nearby;
    if (!item) return;
    this.audio.play('uiClick', { bus: 'ui' });
    const s = store.get();
    switch (item.kind) {
      case 'tape': {
        const i = item.tapeIndex!;
        item.collected = true;
        if (item.object) item.object.visible = false;
        this.audio.play('pickup');
        const found = [...s.tapesFound];
        found[i] = true;
        store.set({ tapesFound: found, promptTape: i, objective: found.every(Boolean) ? 'Salir por la puerta de la pieza del fondo.' : `Encontrar las cintas (${found.filter(Boolean).length}/3).` });
        store.toast(TAPES_DATA[i].label);
        this.entity.setAggressionFromTapes(found.filter(Boolean).length);
        this.director.setTension(0.2 + found.filter(Boolean).length * 0.25);
        this.director.wakeEntity(i === 0 ? 20 : 8);
        this.saveCheckpoint();
        this.docOpen = true; // pausa breve mientras decide
        this.look.exitLock();
        break;
      }
      case 'battery':
        item.collected = true;
        if (item.object) item.object.visible = false;
        this.audio.play('pickup');
        store.set({ batteries: s.batteries + 1 });
        store.toast('BATTERY PACK +20%');
        store.message(s.touch ? 'Tocá BAT + para cambiar la batería cuando la necesites.' : '[B] para cambiar la batería cuando la necesites.');
        break;
      case 'note':
        this.showDoc({ text: DOCUMENTS[(item.doc ?? 'board') as DocId], image: item.doc === 'almanac' ? almanac().canvas.toDataURL('image/jpeg', 0.9) : undefined });
        if (item.doc === 'letter') this.director.setTension(0.25);
        break;
      case 'radio':
        this.radio.toggle(this.director.introDone, () => this.director.radioScare());
        break;
      case 'photo': {
        const fig = this.director.introDone && this.camcorder.on;
        this.showDoc({ image: familyPhoto(fig ? 'figure' : 'normal').canvas.toDataURL('image/jpeg', 0.9), caption: fig ? DOCUMENTS.portraitFigureCaption : DOCUMENTS.portraitCaption });
        break;
      }
      case 'door':
        if (item.id === 'front') {
          this.audio.play('doorLocked', { pos: item.position });
          store.message('La puerta de calle no abre. Y nadie le echó llave.');
        } else {
          const d = this.house.doors.study;
          d.setOpen(!d.open, false, 1.8);
          this.audio.play(d.open ? 'doorOpen' : 'doorClose', { pos: d.center, volume: d.open ? 1 : 0.7 });
        }
        break;
      case 'exit':
        if (s.tapesFound.every(Boolean)) void this.ending();
        else {
          this.audio.play('doorLocked', { pos: item.position });
          store.message('Trabada. Salgado escribió: "con las tres cintas afuera, la puerta cede".');
        }
        break;
      default:
        break;
    }
    this.syncUI();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (store.get().promptTape !== null) {
      if (k === 'enter' || k === 'e' || k === ' ') this.answerTapePrompt(true);
      if (k === 'escape') this.answerTapePrompt(false);
      return;
    }
    if (this.docOpen) {
      if (k === 'escape' || k === 'e' || k === ' ' || k === 'enter') this.closeDoc();
      return;
    }
    if (k === 'escape' || k === 'p') {
      if (this.phase === 'paused') this.resume();
      else this.pause();
      return;
    }
    if (this.phase === 'tape' && (k === 'q' || k === 'backspace')) this.stopTape();
    if (!this.canControl) return;
    if (k === 'c') this.toggleCamera();
    else if (k === 'n') this.toggleNightVision();
    else if (k === 'e' || k === ' ' || k === 'enter') {
      e.preventDefault();
      this.interact();
    } else if (k === 'b') this.useBattery();
    else if (k === 'z' || k === '+') this.zoom(0.35);
    else if (k === 'x' || k === '-') this.zoom(-0.35);
  };

  // ------------------------------------------------------------------ eventos duros
  private async onBatteryDead(): Promise<void> {
    if (this.phase !== 'playing') return;
    this.camcorder.powerOff(true);
    this.camcorder.forcedBlack = 1;
    this.syncUI();
    await this.scheduler.wait(3.5);
    this.camcorder.forcedBlack = 0;
    store.message(store.get().batteries > 0 ? 'Sin batería. Cambiala antes de que se acerque.' : 'Sin batería. Ahora no podés verlo.');
  }

  private async onCaught(): Promise<void> {
    this.phase = 'caught';
    this.radio.stop();
    this.look.exitLock();
    this.player.enabled = false;
    if (!this.camcorder.on) this.camcorder.powerOn(true);
    const eye = this.camera.position.clone();
    const dir = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const at = eye.clone().addScaledVector(dir, 0.85).setY(0);
    this.entity.actor(at, eye.clone().setY(0), 'reach');
    this.entity.entity.setSkinGlow(3);
    this.camcorder.burst(0.85, 1.6, this.time, false);
    this.look.shake(2.5);
    this.audio.play('static', { duration: 1.3, bus: 'ui', volume: 0.9 });
    this.audio.play('interference', { duration: 1.3, bus: 'ui' });
    if (navigator.vibrate) navigator.vibrate([200, 100, 300]);
    await this.scheduler.wait(1.3);
    this.camcorder.forcedBlack = 1;
    this.audio.silence('none');
    this.player.enabled = true;
    store.set({ phase: 'caught' });
  }

  /** Final: la puerta se abre... y la casa no te deja ir. */
  private async ending(): Promise<void> {
    this.phase = 'ending';
    this.radio.stop();
    store.set({ phase: 'ending', prompt: null });
    this.look.exitLock();
    this.player.enabled = false;
    this.entity.actor(null);
    const exit = this.house.doors.exit;
    exit.locked = false;
    exit.setOpen(true, false, 0.8);
    this.audio.play('doorOpen', { pos: exit.center, duration: 2.4, volume: 1.2 });
    this.audio.play('swell', { duration: 4, volume: 0.7 });
    this.camcorder.burst(0.6, 2.5, this.time);
    await this.scheduler.wait(2.2);
    this.camcorder.whiteout = 1;
    await this.scheduler.wait(1.6);
    // BATTERY 0% — la cámara se apaga
    this.camcorder.whiteout = 0;
    this.camcorder.battery = 0;
    this.camcorder.frozenBattery = true;
    this.camcorder.powerOff(true);
    this.camcorder.forcedBlack = 1;
    this.audio.silence('roomTone');
    // de vuelta en el pasillo, en el mismo lugar donde empezaste
    exit.setOpen(false, true);
    this.player.reset(SPAWN);
    await this.scheduler.wait(3.5);
    this.audio.play('monsterBreath', { pos: this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3())), volume: 1 });
    await this.scheduler.wait(4.4);
    this.audio.play('monsterBreath', { pos: this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.7)), volume: 1.3 });
    await this.scheduler.wait(4.0);
    // REC: la cámara vuelve a encenderse sola
    this.camcorder.forcedBlack = 0;
    this.camcorder.powerOn(true);
    this.audio.play('recBeep', { bus: 'ui' });
    const eye = this.camera.position.clone();
    const dir = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    this.entity.actor(eye.clone().addScaledVector(dir, 1.15).setY(0), eye.clone().setY(0), 'close');
    this.entity.entity.setSkinGlow(3);
    this.camcorder.burst(0.45, 2, this.time);
    this.audio.play('static', { duration: 1.6, bus: 'ui', volume: 0.5 });
    await this.scheduler.wait(1.8);
    this.camcorder.forcedBlack = 1;
    this.audio.setVolume(0);
    this.phase = 'end';
    store.set({ phase: 'end', ending: { seconds: this.time } });
  }

  // ------------------------------------------------------------------ loop
  private syncUI(): void {
    store.set({
      cameraOn: this.camcorder.on,
      nightVision: this.camcorder.nightVision,
      battery: this.camcorder.display,
      zoom: Math.round(this.look.zoom * 10) / 10,
    });
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.renderer.getPixelRatio());
    this.look.setAspect(w / h, this.camera);
    this.tapes?.setAspect(w / h);
  }

  private frame(): void {
    const now = performance.now();
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(raw, 0.1);
    const running = this.phase === 'playing' || this.phase === 'tape' || this.phase === 'caught' || this.phase === 'ending';
    const frozen = this.docOpen || store.get().promptTape !== null;

    if (running && !frozen) {
      this.time += dt;
      this.scheduler.update(this.time);
      const yaw = this.look.currentYaw(this.camera);
      if (this.phase === 'playing') this.player.update(dt, yaw, this.house.colliders);
      this.look.handheld = this.camcorder.on ? 1 : 0.35;
      this.look.update(dt, this.time, this.camera, this.player.position, this.player.bob, this.player.bobPhase);
      if (this.phase === 'playing') {
        this.entity.update(dt, this.time, this.camera, this.camcorder.on, this.player.position);
        this.director.update(dt);
      }
      this.tapes.update(dt);
      this.camcorder.proximity = this.entity.present && this.entity.mode !== 'actor' ? this.entity.proximity : 0;
      this.camcorder.drainBoost = this.entity.present && this.entity.distance < 3 ? 2 : 1;
      this.camcorder.update(dt, this.time, this.tapes.active ? this.tapes.camera : this.camera, { current: this.look.zoom, target: this.look.zoomTarget });
      this.audio.updateListener(this.camera);

      this.interactTimer -= dt;
      if (this.interactTimer <= 0 && this.phase === 'playing') {
        this.interactTimer = 0.12;
        this.nearby = this.findNearby();
        const label = this.nearby ? this.labelFor(this.nearby) : null;
        store.set({ prompt: label });
      }
      this.publish -= dt;
      if (this.publish <= 0) {
        this.publish = 0.2;
        store.set({ recSeconds: Math.floor(this.camcorder.recSeconds), clock: 23 * 3600 + 47 * 60 + 10 + Math.floor(this.time), glitch: Math.round(this.camcorder.glitchLevel * 10) / 10 });
        this.syncUI();
      }
    } else if (this.phase === 'intro') {
      this.look.update(dt, now / 1000, this.camera, this.player.position, 0, 0);
    }

    const t = this.phase === 'intro' ? now / 1000 : this.time;
    this.house.update(running && !frozen ? dt : 0, t, this.tapes.active ? this.tapes.camera.position : this.player.position);
    this.camcorder.compose(this.post, dt);
    if (this.phase === 'intro') this.post.params.blackout = 1;
    this.post.render(this.renderer, this.scene, this.tapes.active ? this.tapes.camera : this.camera, t);
    this.measure(raw);
  }

  /** Calidad adaptativa: si caen los FPS, baja la resolución interna. */
  private measure(dt: number): void {
    const p = this.perf;
    p.frames++;
    p.time += dt;
    if (p.time < 2) return;
    const fps = p.frames / p.time;
    p.frames = 0;
    p.time = 0;
    if (this.phase !== 'playing') return;
    const s = this.post.renderScale;
    if (fps < 45 && s > 0.5) this.post.renderScale = Math.max(0.5, s - 0.08);
    else if (fps > 58 && s < this.maxScale) this.post.renderScale = Math.min(this.maxScale, s + 0.04);
    else return;
    this.resize();
  }

  get debugInfo(): Record<string, unknown> {
    return {
      phase: this.phase,
      pos: this.player.position.toArray().map((n) => +n.toFixed(2)),
      cam: this.camcorder.on,
      nv: this.camcorder.nightVision,
      battery: +this.camcorder.battery.toFixed(1),
      entity: { mode: this.entity.mode, state: this.entity.state, present: this.entity.present, node: this.entity.node, dist: +this.entity.distance.toFixed(2), observed: this.entity.observed },
    };
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('keydown', this.onKey);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
