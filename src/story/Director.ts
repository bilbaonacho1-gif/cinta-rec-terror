import * as THREE from 'three';
import { lerp, pick, rand } from '../core/math';
import type { Engine } from '../engine/Engine';
import { store } from '../engine/store';

interface Ambient {
  id: string;
  weight: number;
  cooldown: number;
  when?: () => boolean;
  run: () => void;
}

/**
 * Guion y ritmo: eventos narrativos que ocurren una sola vez (según lo que hizo el jugador)
 * y eventos ambientales menores que espacia según la tensión. Nada de sustos cada 20 segundos.
 */
export class Director {
  private fired = new Set<string>();
  private ambient: Ambient[] = [];
  private lastRun = new Map<string, number>();
  private nextAmbient = 45;
  private lastMajor = 0;
  private evalTimer = 0;
  tension = 0.1;
  introDone = false;
  private stalkAt = Infinity;
  /** Segundos seguidos con la cámara prendida en un lugar muy oscuro sin visión nocturna. */
  private darkFor = 0;
  private nvHints = 0;
  private lastNvHint = -999;

  constructor(private g: Engine) {
    this.registerAmbient();
  }

  private once(id: string, cond: boolean, run: () => void): void {
    if (!cond || this.fired.has(id)) return;
    this.fired.add(id);
    this.lastMajor = this.g.time;
    run();
  }

  has(id: string): boolean {
    return this.fired.has(id);
  }

  /** true sólo la primera vez que se pide (pistas que aparecen una vez). */
  firstTime(id: string): boolean {
    if (this.fired.has(id)) return false;
    this.fired.add(id);
    return true;
  }

  setTension(t: number): void {
    this.tension = Math.max(this.tension, t);
    this.g.audio.setTension(this.tension);
  }

  private behind(dist: number, side = 0): THREE.Vector3 {
    const cam = this.g.camera;
    const d = cam.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const right = new THREE.Vector3(-d.z, 0, d.x);
    return cam.position.clone().addScaledVector(d, -dist).addScaledVector(right, side);
  }

  private looking(p: THREE.Vector3, deg = 40): boolean {
    const cam = this.g.camera;
    const d = p.clone().sub(cam.position).normalize();
    return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(d.dot(cam.getWorldDirection(new THREE.Vector3())), -1, 1))) < deg;
  }

  knocks(pos: THREE.Vector3, count = 3, gap = 1.05): void {
    for (let i = 0; i < count; i++) this.g.audio.play('knock', { pos, delay: i * gap * rand(0.9, 1.15), volume: 1.3 });
  }

  /** La cinta 1 (o el paso del tiempo) despierta a la entidad. */
  wakeEntity(cooldown = 10): void {
    if (this.has('stalking')) return;
    this.fired.add('stalking');
    this.g.entity.startStalking(cooldown);
  }

  /** La radio susurra "no te des vuelta": cadenas y respiración justo atrás. */
  radioScare(): void {
    const g = this.g;
    this.lastMajor = g.time;
    this.setTension(0.55);
    g.camcorder.burst(0.6, 1.2, g.time);
    g.look.shake(0.7);
    g.audio.play('chains', { pos: this.behind(1.6).setY(0.3), duration: 1.6, volume: 1.3 });
    g.audio.play('monsterBreath', { pos: this.behind(0.9).setY(1.6), delay: 1.4, volume: 0.9 });
  }

  update(dt: number): void {
    const g = this.g;
    const cam = g.camcorder;
    const room = g.house.roomAt(g.player.position);
    this.evalTimer -= dt;
    if (this.evalTimer <= 0) {
      this.evalTimer = 0.2;

      this.once('opening', g.time > 1.5, () => store.message('Casa Carvajal, Banfield. 14 de octubre de 1998. El inspector Salgado nunca volvió.'));
      this.once('recHint', g.time > 8 && !cam.on && cam.recSeconds === 0, () =>
        store.message(
          store.get().touch
            ? `Tocá REC para encender la cámara. Círculo de la izquierda: caminar.${store.get().gyro === 'active' ? '' : ' Arrastrá la pantalla para mirar.'}`
            : '[C] cámara · WASD caminar · mouse mirar · [E] interactuar',
        ),
      );

      // primera aparición: al fondo del pasillo, simplemente está ahí
      this.once('firstSighting', cam.on && cam.onFor > 4 && room === 'hallway', () => {
        g.entity.onIntroDone = () => this.afterIntro();
        g.entity.startIntro(g.player.position);
        g.camcorder.burst(0.25, 0.15, g.time, false);
      });

      // la puerta del estudio se cierra sola cuando salís con la segunda cinta
      const study = g.house.doors.study;
      this.once('studySlam', store.get().tapesFound[1] && room === 'hallway' && study.open && !this.looking(study.center, 50), () => {
        study.setOpen(false, false, 4);
        g.audio.play('doorClose', { pos: study.center, volume: 1.5 });
        g.camcorder.burst(0.5, 0.4, g.time);
        g.look.shake(0.6);
      });

      this.once('allTapes', store.get().tapesFound.every(Boolean), () => {
        g.house.lights.flickerAll(g.time, 1.2);
        g.audio.play('thud', { pos: new THREE.Vector3(0, 1.2, -25), volume: 1.4 });
        store.set({ objective: 'Salir por la puerta de la pieza del fondo.' });
        store.message('Algo cedió en la puerta de la pieza del fondo. Se escuchan cadenas.');
        g.audio.play('chains', { pos: new THREE.Vector3(0, 0.3, -23), duration: 2.4, volume: 1.4 });
        this.setTension(0.95);
      });

      if (g.time > this.stalkAt) this.wakeEntity(6);
      this.darknessHint(room);
    }

    // retrato del pasillo: a través de la cámara, hay alguien más en la foto
    const portrait = g.house.refs.portrait as THREE.Mesh | undefined;
    if (portrait) {
      const fig = this.introDone && (cam.on || g.tapes.active);
      const mat = (fig ? portrait.userData.figure : portrait.userData.normal) as THREE.Material;
      if (portrait.material !== mat) portrait.material = mat;
      for (const ph of g.house.floorPhotos) if (ph.material !== mat) ph.material = mat;
    }

    this.updateAmbient(room);
  }

  /** Si está muy oscuro y no se usa la visión nocturna, explicarla (dos veces como mucho) y hacer titilar el botón. */
  private darknessHint(room: string): void {
    const g = this.g;
    const cam = g.camcorder;
    const p = g.player.position;
    const lit = g.house.lights.all.some((f) => f.on && f.level > 0.25 && f.position.distanceTo(p) < f.distance * 0.5);
    const dark = !lit || room === 'shrine';
    if (cam.on && !cam.nightVision && dark && !g.tapes.active) this.darkFor += 0.2;
    else this.darkFor = 0;
    if (cam.nightVision && store.get().hintNV) store.set({ hintNV: false });
    if (this.darkFor < 2.5 || this.nvHints >= 2 || g.time - this.lastNvHint < 75) return;
    this.nvHints++;
    this.lastNvHint = g.time;
    this.darkFor = 0;
    store.set({ hintNV: true });
    store.message(
      store.get().touch
        ? 'Está muy oscuro. Tocá NV: la visión nocturna ve en la oscuridad como rayos X (gasta el doble de batería).'
        : 'Está muy oscuro. Apretá [N]: la visión nocturna ve en la oscuridad como rayos X (gasta el doble de batería).',
    );
  }

  private afterIntro(): void {
    const g = this.g;
    this.introDone = true;
    this.setTension(0.3);
    const lamp = g.house.fixture('hallLamp2');
    if (lamp) {
      g.audio.play('bulbPop', { pos: lamp.position });
      lamp.flicker = 'dying';
      lamp.intensity *= 0.5;
    }
    g.house.stopClock();
    g.clockLoop?.stop(1.5);
    g.scheduler.after(6, () => this.knocks(new THREE.Vector3(0, 1.2, -18.5), 3, 1.2));
    this.stalkAt = g.time + 45;
  }

  private registerAmbient(): void {
    const g = this.g;
    const far = () => {
      const a = rand(0, Math.PI * 2);
      return g.player.position.clone().add(new THREE.Vector3(Math.cos(a) * rand(5, 9), -0.8, Math.sin(a) * rand(5, 9)));
    };
    const add = (a: Ambient) => this.ambient.push(a);
    // el barrio, de madrugada
    add({ id: 'dogs', weight: 1.6, cooldown: 70, run: () => g.audio.play('dogBark', { pos: far().setY(1), volume: 0.5, rate: rand(0.85, 1.15) }) });
    add({
      id: 'dogsStop',
      weight: 1,
      cooldown: 160,
      when: () => this.tension > 0.35,
      run: () => {
        // ladran todos juntos... y de golpe se callan
        for (let i = 0; i < 3; i++) g.audio.play('dogBark', { pos: far().setY(1), delay: i * 0.5, volume: 0.6, rate: rand(0.8, 1.2) });
        g.scheduler.after(3.2, () => g.audio.play('chains', { pos: far().setY(0.3), duration: 1.4, volume: 0.6 }));
      },
    });
    add({ id: 'bus', weight: 0.8, cooldown: 140, when: () => this.tension < 0.7, run: () => g.audio.play('trafficPass', { pos: new THREE.Vector3(-4.5, 1, 9), duration: rand(6, 9), volume: 0.8 }) });
    add({
      id: 'shutter',
      weight: 1.1,
      cooldown: 110,
      when: () => this.tension > 0.3,
      run: () => {
        const pos = new THREE.Vector3(-4.5, 1.2, 3.2);
        g.audio.play('shutterBang', { pos, volume: 1.2 });
        g.audio.play('shutterBang', { pos, delay: rand(0.9, 1.4), volume: 0.9 });
      },
    });
    add({
      id: 'chainsFar',
      weight: 1.3,
      cooldown: 75,
      when: () => this.tension > 0.3 && !g.entity.present,
      run: () => g.audio.play('chains', { pos: far().setY(0.3), duration: rand(1.2, 2.2), volume: 0.8 }),
    });
    add({ id: 'creak', weight: 3, cooldown: 20, run: () => g.audio.play('creak', { pos: far(), volume: 1.1, duration: rand(0.8, 1.6) }) });
    add({ id: 'thud', weight: 1.2, cooldown: 90, when: () => this.tension > 0.25, run: () => g.audio.play('thud', { pos: far(), volume: 0.9 }) });
    add({
      id: 'stepsBehind',
      weight: 1.6,
      cooldown: 80,
      when: () => this.tension > 0.3 && !g.entity.present,
      run: () => {
        for (let i = 0; i < 4; i++) g.audio.play('footWood', { pos: this.behind(4.5 - i * 0.7).setY(0.2), delay: i * 0.62, volume: 0.9 });
      },
    });
    add({ id: 'knockBehind', weight: 1.2, cooldown: 120, when: () => this.tension > 0.2, run: () => this.knocks(this.behind(3), 3) });
    add({
      id: 'whisper',
      weight: 1,
      cooldown: 100,
      when: () => this.tension > 0.4 && g.camcorder.on,
      run: () => g.audio.play('whisper', { pos: this.behind(0.8, Math.random() < 0.5 ? 0.6 : -0.6).setY(1.6), duration: 2, volume: 0.8 }),
    });
    add({
      id: 'lampFlicker',
      weight: 2,
      cooldown: 40,
      run: () => {
        const near = g.house.lights.all.filter((f) => f.on && f.position.distanceTo(g.player.position) < 7);
        if (!near.length) return;
        const f = pick(near);
        f.outUntil = g.time + rand(0.3, 1.4);
        g.audio.play('switchClick', { pos: f.position, volume: 0.4 });
      },
    });
    add({ id: 'interference', weight: 1.4, cooldown: 45, when: () => g.camcorder.on, run: () => g.camcorder.burst(rand(0.4, 0.7), rand(0.4, 1.1), g.time) });
    add({
      id: 'batteryDip',
      weight: 0.6,
      cooldown: 150,
      when: () => g.camcorder.on && this.tension > 0.5 && g.camcorder.battery > 12,
      run: () => {
        g.camcorder.addBattery(-rand(2, 4));
        g.camcorder.burst(0.5, 0.5, g.time);
        store.toast('BATTERY ' + g.camcorder.display + '%');
      },
    });
  }

  private updateAmbient(_room: string): void {
    const g = this.g;
    const t = g.time;
    if (t < this.nextAmbient) return;
    if (g.phase !== 'playing' || t - this.lastMajor < 12) {
      this.nextAmbient = t + 4;
      return;
    }
    this.nextAmbient = t + lerp(55, 20, this.tension) * rand(0.75, 1.3);
    const pool = this.ambient.filter((a) => (a.when?.() ?? true) && t - (this.lastRun.get(a.id) ?? -999) > a.cooldown);
    if (!pool.length) return;
    let r = Math.random() * pool.reduce((s, a) => s + a.weight, 0);
    for (const a of pool) {
      r -= a.weight;
      if (r <= 0) {
        this.lastRun.set(a.id, t);
        a.run();
        return;
      }
    }
  }
}
