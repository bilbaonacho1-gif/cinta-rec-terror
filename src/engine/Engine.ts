import * as THREE from 'three';
import { almanac, familyPhoto, photoBack } from '../assets/images';
import { toTexture } from '../assets/canvas';
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
import { ModelKit, loadGLTF } from '../scene/ModelKit';
import { Director } from '../story/Director';
import type { InteractiveItem, Phase } from '../types';
import { Camcorder } from './Camcorder';
import { finishAsset, trackAsset } from './loading';
import { Radio } from './Radio';
import { Inspector } from './Inspector';
import { a11y } from '../core/a11y';
import { loadVoiceManifest, pauseClip } from '../audio/voice';
import { TapePlayer } from './TapePlayer';
import { store } from './store';

/** Rebobinados por partida: cuántas veces te puede atrapar antes de perder. */
export const MAX_LIVES = 3;

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
  readonly inspector: Inspector;
  private kit: ModelKit | null = null;
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
    // como pide la consigna: nunca más de 2x (en pantallas 3x se ve igual y cuesta mucho más)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // sombras optimizadas: un solo spot con mapa de 512 px (ver HouseBuilder.makeShadowLight)
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.domElement.className = 'game-canvas';
    container.prepend(this.renderer.domElement);
    this.post = new PostFX(this.renderer);
    this.post.renderScale = isMobile ? 0.62 : 0.85;
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.045);
    this.scene.add(this.camera);

    this.look = new LookController(this.renderer.domElement, this.gyro, {
      tap: (x, y) => this.interact(x === undefined || y === undefined ? undefined : { x, y }),
      // modo una mano: mantener apretada la pantalla camina hacia donde mirás
      hold: (on) => {
        this.player.holdForward = on && this.canControl;
        store.set({ holdWalk: this.player.holdForward });
      },
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
    this.inspector = new Inspector(this.camera);
    this.radio = new Radio(this.audio, this.house.refs.radio.getWorldPosition(new THREE.Vector3()));
    void this.loadModels();
    void loadVoiceManifest();

    this.camcorder.onThreshold = (th) => {
      this.audio.play('batteryLow', { bus: 'ui' });
      if (th === 20) this.camcorder.burst(0.3, 0.4, this.time, false);
      if (th <= 10) store.toast(`BATTERY ${this.camcorder.display}%`);
    };
    this.camcorder.onDepleted = () => void this.onBatteryDead();
    this.entity.onAttack = () => void this.onCaught();
    // vuelve a aparecer en el visor: golpe de susto
    this.entity.onSighting = () => {
      this.audio.play('stinger', { bus: 'ui', volume: 0.85 });
      this.camcorder.burst(0.7, 0.6, this.time, false);
      this.look.shake(0.9);
      this.director.setTension(0.6);
      if (navigator.vibrate) navigator.vibrate(120);
    };
    this.entity.onFirstSeen = () => {
      this.audio.play('swell', { duration: 6, volume: 0.6 });
      this.director.setTension(0.3);
      store.message('No le saques la vista. Mientras lo tengas en el visor, no se mueve.');
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
    // los tres archivos bajan en paralelo; la barra de carga se pesa por tamaño (MB aprox.)
    const load = async <T>(name: string, mb: number, fn: (p: (e: ProgressEvent) => void) => Promise<T>): Promise<T> => {
      try {
        return await fn(trackAsset(name, mb));
      } finally {
        finishAsset(name);
      }
    };
    const [desayuno, almacen, crawler] = await Promise.allSettled([
      load('desayuno', 0.23, (p) => kit.loadFirst(urls('desayuno'), 0.085, p)),
      load('almacen', 0.7, (p) => kit.loadFirst(urls('almacen'), 1, p)),
      load('crawler', 0.8, (p) => loadGLTF(urls('crawler'), p)),
    ]);
    for (const r of [desayuno, almacen]) if (r.status === 'rejected') console.warn('Modelo no disponible:', r.reason);
    this.house.furnish(kit);
    this.kit = kit;
    // el monstruo principal: el crawler sin piel, con sus animaciones
    if (crawler.status === 'fulfilled') this.entity.entity.useModel(crawler.value, 2.1);
    else console.warn('Monstruo GLB no disponible, se usa la figura procedural:', crawler.reason);
    this.precompile();
    store.set({ modelsReady: true, loadProgress: 1 });
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
    if (this.camcorder.nightVision) store.set({ hintNV: false });
    if (!wasOn && this.camcorder.nightVision && this.director.firstTime('nvHint')) {
      store.message('Visión nocturna: apagala cuando haya luz, gasta el doble.');
    }
    this.syncUI();
  }

  zoom(delta: number): void {
    if (this.inspector.active) {
      this.inspector.zoom(delta);
      return;
    }
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
    pauseClip(true);
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
    pauseClip(false);
    this.last = performance.now();
    store.set({ phase: this.phase });
    if (this.phase === 'playing') this.look.requestLock();
  }

  recenter(): void {
    this.look.recenter(this.look.currentYaw(this.camera));
    this.audio.play('recBeep', { bus: 'ui' });
  }

  setSetting(key: 'volume' | 'sensitivity' | 'voice' | 'reduceFlashing', value: number | boolean): void {
    if (key === 'volume') this.audio.setVolume(value as number);
    if (key === 'reduceFlashing') a11y.reduceFlashing = value as boolean;
    if (key === 'sensitivity') this.look.sensitivity = value as number;
    if (key === 'voice') this.tapes.voiceEnabled = value as boolean;
    store.set({ [key]: value } as Partial<ReturnType<typeof store.get>>);
    try {
      const s = store.get();
      localStorage.setItem('rec-carvajal', JSON.stringify({ volume: s.volume, sensitivity: s.sensitivity, voice: s.voice, reduceFlashing: s.reduceFlashing }));
    } catch {
      /* sin almacenamiento */
    }
  }

  private loadSettings(): void {
    store.set({ reduceFlashing: a11y.reduceFlashing });
    try {
      const raw = localStorage.getItem('rec-carvajal');
      if (!raw) return;
      const s = JSON.parse(raw) as { volume: number; sensitivity: number; voice: boolean; reduceFlashing?: boolean };
      store.set({ volume: s.volume, sensitivity: s.sensitivity, voice: s.voice, reduceFlashing: s.reduceFlashing ?? a11y.reduceFlashing });
      a11y.reduceFlashing = s.reduceFlashing ?? a11y.reduceFlashing;
      this.look.sensitivity = s.sensitivity;
      this.tapes.voiceEnabled = s.voice;
    } catch {
      /* noop */
    }
  }

  /**
   * En celulares, el mismo toque que abre un documento o la pregunta de la cinta genera después un "click"
   * que cae sobre la ventana recién abierta y la cerraría. Se ignoran respuestas en los primeros 450 ms.
   */
  private openedAt = 0;
  private tooSoon(): boolean {
    return performance.now() - this.openedAt < 450;
  }

  /**
   * Inspección 3D: el objeto aparece frente a la cámara y se gira con el dedo (drag) o se acerca pellizcando.
   * Mientras tanto el juego queda en pausa, como con los documentos.
   */
  private startInspect(object: THREE.Object3D, info: { title: string; caption: string } | null, size = 0.22, rotX = 0.35): void {
    this.docOpen = true;
    this.openedAt = performance.now();
    this.look.exitLock();
    this.look.dragOverride = (dx, dy) => this.inspector.drag(dx, dy);
    this.inspector.show(object, size, rotX);
    this.audio.play('paper', { bus: 'ui' });
    store.set({ inspect: info });
  }

  private stopInspect(): void {
    this.inspector.hide();
    this.look.dragOverride = null;
    store.set({ inspect: null });
  }

  /** Tarjeta de la foto de familia con frente (la foto) y dorso (anotación a mano). */
  /** Pan con dulce de leche sobre la tabla, armado con piezas del modelo del desayuno. */
  private breakfastGroup(): THREE.Object3D | null {
    const tabla = this.kit?.get('Adds');
    const dl = this.kit?.get('Dulce_de_leche');
    if (!tabla) return null;
    const g = new THREE.Group();
    g.add(tabla);
    if (dl) {
      dl.position.set(0.24, 0, 0.02);
      g.add(dl);
    }
    return g;
  }

  private photoCard(figure: boolean): THREE.Object3D {
    const card = new THREE.Group();
    const geo = new THREE.PlaneGeometry(0.2, 0.172);
    const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: toTexture(familyPhoto(figure ? 'figure' : 'normal'), { repeat: false }), roughness: 0.55 }));
    const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: toTexture(photoBack(), { repeat: false }), roughness: 0.9 }));
    back.rotation.y = Math.PI;
    back.position.z = -0.0005;
    card.add(front, back);
    return card;
  }

  closeDoc(): void {
    if (!this.docOpen || this.tooSoon()) return;
    if (this.inspector.active) this.stopInspect();
    this.docOpen = false;
    store.set({ doc: null });
    this.last = performance.now();
    this.look.requestLock();
  }

  private showDoc(doc: { text?: string; image?: string; caption?: string }): void {
    this.docOpen = true;
    this.openedAt = performance.now();
    this.look.exitLock();
    this.audio.play('paper', { bus: 'ui' });
    store.set({ doc });
  }

  /** Respuesta al encontrar una cinta: verla ahora o guardarla. */
  answerTapePrompt(play: boolean): void {
    if (this.tooSoon()) return;
    this.stopInspect();
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
    this.cine = null;
    this.camera.up.set(0, 1, 0);
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

  /**
   * Selección táctil con Raycaster: un rayo desde la cámara por el punto tocado contra los volúmenes
   * de los objetos (y las paredes/muebles, que tapan). Devuelve el objeto tocado si está al alcance.
   */
  private pickAt(x: number, y: number): InteractiveItem | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.far = 4;
    const hits = this.raycaster.intersectObjects([...this.house.pickables.children, ...this.house.occluders], false);
    for (const h of hits) {
      const item = h.object.userData.item as InteractiveItem | undefined;
      if (!item) return null; // lo primero que tocó el rayo es una pared o un mueble
      if (item.collected) continue;
      return h.distance <= (item.reach ?? 2.2) + 0.6 ? item : null;
    }
    return null;
  }

  interact(at?: { x: number; y: number }): void {
    if (!this.canControl || store.get().promptTape !== null) return;
    if (this.hiding) {
      // escondido: sólo se sale con la tecla o el botón (un toque suelto en la pantalla no te delata)
      if (!at) this.exitHide();
      return;
    }
    let item = this.nearby;
    if (at) {
      const picked = this.pickAt(at.x, at.y);
      if (picked) {
        item = picked;
        store.set({ tapFx: { x: at.x, y: at.y, key: Date.now() } });
      }
    }
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
        this.openedAt = performance.now();
        store.set({ tapesFound: found, promptTape: i });
        store.newObjective(found.every(Boolean) ? 'Escapá por la puerta de la pieza del fondo.' : `Encontrá las cintas del inspector Salgado (${found.filter(Boolean).length}/3).`);
        store.toast(TAPES_DATA[i].label);
        this.entity.setAggressionFromTapes(found.filter(Boolean).length);
        this.director.setTension(0.2 + found.filter(Boolean).length * 0.25);
        this.director.wakeEntity(i === 0 ? 20 : 8);
        this.saveCheckpoint();
        // pausa breve mientras decide: la cinta se puede girar con el dedo
        if (item.object) this.startInspect(item.object, null, 0.2, 1.15); // la etiqueta mirando a cámara
        else {
          this.docOpen = true;
          this.look.exitLock();
        }
        break;
      }
      case 'battery':
        item.collected = true;
        if (item.object) item.object.visible = false;
        this.audio.play('pickup');
        store.set({ batteries: s.batteries + 1 });
        store.toast('BATTERY PACK +20%');
        store.message(`Batería de repuesto. Cambiala cuando la necesites ${store.key('B', 'BAT +')}.`);
        break;
      case 'note': {
        // el mate y el desayuno se inspeccionan en 3D (si el modelo cargó)
        const model = item.doc === 'mate' ? this.kit?.get('Mate') : item.doc === 'breakfast' ? this.breakfastGroup() : null;
        if (model) {
          this.startInspect(model, { title: item.doc === 'mate' ? 'EL MATE DE SALGADO' : 'EL DESAYUNO DEL 9 DE OCTUBRE', caption: DOCUMENTS[item.doc as DocId] });
          break;
        }
        this.showDoc({ text: DOCUMENTS[(item.doc ?? 'board') as DocId], image: item.doc === 'almanac' ? almanac().canvas.toDataURL('image/jpeg', 0.9) : undefined });
        if (item.doc === 'letter') this.director.setTension(0.25);
        break;
      }
      case 'hide':
        this.enterHide(item);
        break;
      case 'radio':
        this.radio.toggle(this.director.introDone, () => this.director.radioScare());
        break;
      case 'photo': {
        const fig = this.director.introDone && this.camcorder.on;
        const floor = item.id.startsWith('floorphoto');
        const caption = floor ? (fig ? DOCUMENTS.floorPhotoFigureCaption : DOCUMENTS.floorPhotoCaption) : fig ? DOCUMENTS.portraitFigureCaption : DOCUMENTS.portraitCaption;
        this.startInspect(this.photoCard(fig), { title: floor ? 'FOTO EN EL PISO' : 'RETRATO DE FAMILIA', caption: `${caption}\nDale vuelta: atrás tiene algo escrito.` }, 0.24, 0.12);
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

  // ------------------------------------------------------------------ escondites
  /** Escondite actual (abajo de una cama o adentro de un ropero). */
  hiding: InteractiveItem | null = null;
  private hideBreath = 0;

  /** Esconderse: la cámara pasa abajo de la cama o detrás de la rendija del ropero. */
  private enterHide(item: InteractiveItem): void {
    const h = item.hide;
    if (!h) return;
    this.hiding = item;
    this.player.enabled = false;
    this.player.holdForward = false;
    this.look.recenter(h.yaw);
    this.look.pitch = h.type === 'bed' ? 0.04 : -0.05;
    this.audio.play(h.type === 'bed' ? 'paper' : 'creak', { pos: h.eye, volume: 0.7, duration: 0.6 });
    this.entity.setPlayerHidden(true);
    this.hideBreath = 1.5;
    store.set({ hiding: h.type, holdWalk: false });
    this.director.onHidden();
  }

  exitHide(): void {
    const h = this.hiding?.hide;
    if (!h) return;
    this.hiding = null;
    this.player.reset(h.exit);
    this.player.enabled = true;
    this.look.recenter(this.look.currentYaw(this.camera));
    this.audio.play('creak', { pos: h.exit, volume: 0.6, duration: 0.5 });
    this.entity.setPlayerHidden(false);
    store.set({ hiding: null });
  }

  /** Persecución y cercanía: música que sube con la distancia y latidos cuando lo tenés encima. */
  private dreadTimer = 0;
  private heartTimer = 0;
  private updateDread(dt: number): void {
    this.dreadTimer -= dt;
    if (this.dreadTimer <= 0) {
      this.dreadTimer = 0.25;
      this.audio.setChase(this.entity.chaseLevel);
    }
    const near = this.entity.present && this.entity.mode === 'stalking' && this.entity.distance < 5;
    if (!near || this.hiding) return;
    this.heartTimer -= dt;
    if (this.heartTimer <= 0) {
      this.heartTimer = THREE.MathUtils.lerp(0.55, 1.1, this.entity.distance / 5);
      this.audio.play('heartbeat', { bus: 'ui', volume: 0.5 + (1 - this.entity.distance / 5) * 0.5 });
    }
  }

  /** Mientras estás escondido se escucha tu respiración; más agitada si él está cerca. */
  private updateHiding(dt: number): void {
    this.hideBreath -= dt;
    if (this.hideBreath > 0) return;
    const near = this.entity.present && this.entity.distance < 4.5;
    this.hideBreath = near ? 1.6 : 3.4;
    this.audio.play('breath', { volume: near ? 0.55 : 0.3, bus: 'ui' });
    if (near) this.audio.play('heartbeat', { volume: 0.7, bus: 'ui' });
  }

  /** Datos de la partida para las pantallas de ganar y perder. */
  private result(won: boolean): NonNullable<ReturnType<typeof store.get>['ending']> {
    const s = store.get();
    return {
      seconds: this.time,
      won,
      tapes: s.tapesFound.filter(Boolean).length,
      watched: s.tapesWatched.filter(Boolean).length,
      rewindsUsed: MAX_LIVES - s.lives,
      battery: this.camcorder.display,
    };
  }

  /**
   * Te atrapó: cinemática de captura (te da vuelta la cabeza hacia él, se te tira encima, te agarra de la cara
   * y la cámara cae al piso). Se gasta un rebobinado: si quedan, "SEÑAL PERDIDA"; si era el último, se pierde.
   */
  private async onCaught(): Promise<void> {
    this.phase = 'caught';
    this.radio.stop();
    this.look.exitLock();
    this.player.enabled = false;
    this.player.holdForward = false;
    this.audio.setChase(0);
    const lives = Math.max(0, store.get().lives - 1);
    const eye = (this.hiding?.hide?.eye ?? this.player.position).clone();
    if (this.hiding) {
      this.hiding = null;
      this.entity.setPlayerHidden(false);
    }
    store.set({ lives, hiding: null, holdWalk: false, prompt: null });
    if (!this.camcorder.on) this.camcorder.powerOn(true);
    await this.catchCinematic(eye);
    this.cine = null;
    this.entity.entity.root.rotation.set(0, this.entity.entity.root.rotation.y, 0);
    this.camcorder.forcedBlack = 1;
    this.entity.actor(null);
    if (lives > 0) {
      this.audio.silence('none');
      this.player.enabled = true;
      store.set({ phase: 'caught' });
      return;
    }
    // sin rebobinados: un último grito en la oscuridad
    this.audio.silence('roomTone');
    await this.scheduler.wait(1.0);
    this.audio.play('scream', { bus: 'ui', volume: 0.45, duration: 1.8 });
    await this.scheduler.wait(1.8);
    this.audio.setVolume(0);
    this.phase = 'lost';
    store.set({ phase: 'lost', ending: this.result(false) });
  }

  /** Cámara controlada por guion (cinemáticas): devuelve posición, punto a mirar e inclinación. */
  private cine: ((t: number) => { pos: THREE.Vector3; look: THREE.Vector3; roll: number }) | null = null;
  private cineStart = 0;

  private async catchCinematic(eye: THREE.Vector3): Promise<void> {
    const cam = this.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    // de dónde viene: si estaba atrás, la cabeza gira hacia él (latigazo)
    const mpos = this.entity.present ? this.entity.entity.root.position.clone() : eye.clone().addScaledVector(fwd, 1.2);
    const dir = mpos.clone().sub(eye).setY(0);
    if (dir.lengthSq() < 0.04) dir.copy(fwd);
    dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const floorEye = eye.clone().setY(0);
    const startLook = eye.clone().addScaledVector(fwd, 2);
    const monster = this.entity.entity;
    this.entity.actor(floorEye.clone().addScaledVector(dir, 1.3), floorEye, 'reach');
    monster.setSkinGlow(3);
    this.cineStart = this.time;
    const head = (d: number, y: number) => eye.clone().setY(y).addScaledVector(dir, d);
    // el modelo mira hacia +Z: para que te mire de frente, yaw hacia la cámara; se inclina hacia adelante (local X)
    const yaw = Math.atan2(-dir.x, -dir.z);
    monster.root.rotation.order = 'YXZ';
    let posed = false;
    /**
     * Ubica al monstruo a `d` metros, inclinado `lean` rad, y devuelve dónde queda su cara (hueso de la cabeza).
     * Si la cara quedaría a menos de `gap` de la cámara, lo corre para atrás: nunca te atraviesa.
     */
    const place = (d: number, lean: number, gap = 0.42) => {
      monster.root.position.copy(floorEye).addScaledVector(dir, d);
      monster.root.rotation.set(lean, yaw, 0);
      let face = monster.headWorld();
      const ahead = face.clone().sub(eye).dot(dir);
      if (ahead < gap) {
        monster.root.position.addScaledVector(dir, gap - ahead);
        face = monster.headWorld();
      }
      return face;
    };
    this.cine = (t) => {
      const shake = (a: number) => new THREE.Vector3((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      if (t < 0.32) {
        // latigazo hacia él; se tira encima con los brazos arriba
        const k = t / 0.32;
        const e = 1 - Math.pow(1 - k, 3);
        const face = place(1.5 - 0.4 * e, 0.1 * e, 0.6);
        return { pos: eye.clone(), look: startLook.clone().lerp(face, e), roll: 0 };
      }
      if (!posed) {
        posed = true;
        monster.setPose('stand');
      }
      if (t < 1.4) {
        // te agarra de la cara: se inclina hasta quedar cara a cara, tirones
        const k = Math.min(1, (t - 0.32) / 0.5);
        const face = place(1.1, 0.1 + 0.25 * k, 0.42 + 0.1 * k);
        const pos = eye.clone().addScaledVector(dir, 0.1 * k).add(new THREE.Vector3(0, 0.12 * k, 0)).add(shake(0.05));
        return { pos, look: face.add(shake(0.06)), roll: Math.sin(t * 28) * 0.1 };
      }
      if (t < 1.85) {
        // la cámara se cae al piso
        const k = (t - 1.4) / 0.45;
        const e = k * k;
        const face = place(1.1, 0.35 + 0.15 * e, 0.5);
        const pos = eye.clone().addScaledVector(dir, 0.1).addScaledVector(side, 0.25 * e);
        pos.y = THREE.MathUtils.lerp(eye.y + 0.12, 0.22, e);
        return { pos, look: face.clone().lerp(face.clone().setY(1.0), e * 0.5), roll: THREE.MathUtils.lerp(0, 1.25, e) };
      }
      // en el piso, de costado: él se encorva sobre la cámara
      const k = Math.min(1, (t - 1.85) / 1.2);
      const face = place(1.1 - 0.25 * k, 0.5 + 0.25 * k, 0.55);
      const pos = eye.clone().addScaledVector(dir, 0.1).addScaledVector(side, 0.25);
      pos.y = 0.22;
      return { pos: pos.add(shake(0.01)), look: face, roll: 1.25 + Math.sin(t * 2) * 0.03 };
    };
    // sonido y efectos sincronizados
    this.audio.play('stinger', { bus: 'ui', volume: 1.0, duration: 2.8 });
    this.audio.play('scream', { pos: head(0.6, 1.9), volume: 1.3, delay: 0.18, duration: 1.4 });
    this.camcorder.burst(0.9, 0.5, this.time, false);
    this.look.shake(2.5);
    if (navigator.vibrate) navigator.vibrate([250, 80, 400]);
    await this.scheduler.wait(1.4);
    this.audio.play('thud', { pos: eye.clone().setY(0.2), volume: 1.4 });
    this.audio.play('static', { duration: 0.6, bus: 'ui', volume: 0.7 });
    this.camcorder.burst(1, 0.7, this.time, false);
    if (navigator.vibrate) navigator.vibrate(180);
    await this.scheduler.wait(1.0);
    this.audio.play('monsterBreath', { pos: head(0.55, 1.6), volume: 1.4 });
    await this.scheduler.wait(0.9);
    this.audio.play('scream', { pos: head(0.5, 1.6), volume: 1.0, duration: 0.9 });
    this.camcorder.burst(1, 0.6, this.time, false);
    await this.scheduler.wait(0.55);
  }

  /** Ganaste: con las tres cintas, la puerta de la pieza del fondo se abre y salís a la calle. */
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
    // detrás, en la casa, las cadenas se alejan
    this.audio.play('chains', { pos: this.camera.position.clone().add(new THREE.Vector3(0, -1, 5)), duration: 2.5, volume: 0.9 });
    await this.scheduler.wait(2.2);
    this.camcorder.whiteout = 1;
    await this.scheduler.wait(1.4);
    // afuera: amanece en Banfield (perros a lo lejos, un colectivo por la avenida)
    this.audio.silence('none');
    this.audio.play('trafficPass', { duration: 6, volume: 0.8 });
    this.audio.play('dogBark', { volume: 0.35, delay: 1.2 });
    await this.scheduler.wait(2.6);
    const result = this.result(true);
    this.camcorder.whiteout = 0;
    this.camcorder.forcedBlack = 1;
    this.phase = 'end';
    store.set({ phase: 'end', ending: result });
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

  /** Resize: tamaño del canvas, pixelRatio (máx. 2), post-proceso y FOV según la orientación. */
  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    if (this.renderer.getPixelRatio() !== dpr) this.renderer.setPixelRatio(dpr);
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
    this.inspector.update(dt);
    const running = this.phase === 'playing' || this.phase === 'tape' || this.phase === 'caught' || this.phase === 'ending';
    const frozen = this.docOpen || store.get().promptTape !== null;

    if (running && !frozen) {
      this.time += dt;
      this.scheduler.update(this.time);
      const yaw = this.look.currentYaw(this.camera);
      if (this.phase === 'playing') this.player.update(dt, yaw, this.house.colliders);
      this.look.handheld = this.camcorder.on ? 1 : 0.35;
      const eye = this.hiding?.hide ? this.hiding.hide.eye : this.player.position;
      this.look.update(dt, this.time, this.camera, eye, this.hiding ? 0 : this.player.bob, this.player.bobPhase);
      if (this.cine) {
        const k = this.cine(this.time - this.cineStart);
        this.camera.position.copy(k.pos);
        this.camera.lookAt(k.look);
        this.camera.rotateZ(k.roll);
        this.camera.updateMatrixWorld();
      }
      if (this.phase === 'playing') {
        this.entity.update(dt, this.time, this.camera, this.camcorder.on, eye);
        if (this.hiding) this.updateHiding(dt);
        this.updateDread(dt);
        this.director.update(dt);
      } else if (this.entity.mode === 'actor' && this.entity.present) {
        // cintas, captura y final: el monstruo sigue animado aunque el guion lo controle
        this.entity.entity.animate(dt, this.time, false);
      }
      this.tapes.update(dt);
      this.camcorder.proximity = this.entity.present && this.entity.mode !== 'actor' ? this.entity.proximity : 0;
      this.camcorder.drainBoost = this.entity.present && this.entity.distance < 3 ? 2 : 1;
      this.camcorder.update(dt, this.time, this.tapes.active ? this.tapes.camera : this.camera, { current: this.look.zoom, target: this.look.zoomTarget });
      this.audio.updateListener(this.camera);

      this.interactTimer -= dt;
      if (this.interactTimer <= 0 && this.phase === 'playing') {
        this.interactTimer = 0.12;
        this.nearby = this.hiding ? null : this.findNearby();
        const label = this.hiding ? 'SALIR DEL ESCONDITE' : this.nearby ? this.labelFor(this.nearby) : null;
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

  /**
   * Medidor de FPS (cada 0,5 s, se muestra si está activado) y calidad adaptativa (cada 2 s):
   * si caen los FPS baja la resolución interna; si aun así no llega a 30, apaga la sombra.
   */
  private measure(dt: number): void {
    const p = this.perf;
    p.frames++;
    p.time += dt;
    this.fpsWindow.frames++;
    this.fpsWindow.time += dt;
    if (this.fpsWindow.time >= 0.5) {
      store.set({ fps: Math.round(this.fpsWindow.frames / this.fpsWindow.time) });
      this.fpsWindow.frames = 0;
      this.fpsWindow.time = 0;
    }
    if (p.time < 2) return;
    const fps = p.frames / p.time;
    p.frames = 0;
    p.time = 0;
    if (this.phase !== 'playing') return;
    const s = this.post.renderScale;
    if (fps < 32 && s <= 0.5 && this.house.shadowLight.castShadow) {
      this.house.shadowLight.castShadow = false;
      return;
    }
    if (fps < 45 && s > 0.5) this.post.renderScale = Math.max(0.5, s - 0.08);
    else if (fps > 58 && s < this.maxScale) this.post.renderScale = Math.min(this.maxScale, s + 0.04);
    else return;
    this.resize();
  }

  private fpsWindow = { frames: 0, time: 0 };

  toggleFps(): void {
    store.set({ showFps: !store.get().showFps });
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
