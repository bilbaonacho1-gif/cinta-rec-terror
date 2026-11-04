import * as THREE from 'three';
import { toTexture } from '../assets/canvas';
import { almanac, cardboardSign, childDrawing, clockFace, familyPhoto, newspaper, notePaper, photoWall, storeSign, tapeLabel } from '../assets/images';
import { getTextures } from '../assets/textures';
import { createTVStaticMaterial } from '../effects/TVStaticMaterial';
import { Door, DoorOptions } from '../entities/Door';
import type { Box2, InteractiveItem, Waypoint } from '../types';
import { StaticBatch, boxMesh, buildSlab, buildWall, planeMesh, WallSpec } from './builders';
import { LampFixture, LightPool, makeFixture } from './lighting';
import { Materials, createMaterials, glowMaterial } from './materials';
import type { ModelKit } from './ModelKit';
import * as P from './props';

/** Altura de techo. */
export const H = 2.9;
/** Posición inicial del jugador (ojos) y hacia dónde mira (-Z). */
export const SPAWN = new THREE.Vector3(0, 1.6, 2.6);

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lam = (tex: THREE.Texture) => new THREE.MeshLambertMaterial({ map: tex });

/**
 * Casa Carvajal (casa chorizo de Banfield): zaguán y galería con baldosas calcáreas, el almacén de la familia
 * al frente, living (este), escritorio del abuelo (oeste) y la pieza del fondo.
 * Todo procedural. La geometría estática se fusiona por habitación para reducir draw calls.
 */
export class HouseBuilder {
  readonly group = new THREE.Group();
  readonly colliders: Box2[] = [];
  /** Cajas que bloquean la vista de la entidad (paredes, puertas, muebles altos). */
  readonly occluders: THREE.Object3D[] = [];
  readonly interactiveItems: InteractiveItem[] = [];
  readonly doors: Record<string, Door> = {};
  readonly refs: Record<string, THREE.Object3D> = {};
  readonly fixtures: LampFixture[] = [];
  readonly waypoints = new Map<string, Waypoint>();
  lights!: LightPool;
  private batch = new StaticBatch();
  private m: Materials;
  private tvScreens: THREE.ShaderMaterial[] = [];
  private animated: ((dt: number, t: number) => void)[] = [];
  private pendulum: THREE.Object3D | null = null;
  clockRunning = true;
  /** Fotos de la familia tiradas en el piso: con la cámara muestran lo mismo que el retrato. */
  readonly floorPhotos: THREE.Mesh[] = [];
  photoNormal: THREE.Material | null = null;
  photoFigure: THREE.Material | null = null;

  constructor(scene: THREE.Scene) {
    this.m = createMaterials(getTextures());
    this.group.name = 'casa-carvajal';
    const rooms: [string, () => void][] = [
      ['hallway', () => this.buildHallway()],
      ['living', () => this.buildLivingRoom()],
      ['study', () => this.buildStudy()],
      ['store', () => this.buildStore()],
      ['bedroom', () => this.buildBedroom()],
      ['shrine', () => this.buildShrine()],
    ];
    for (const [name, build] of rooms) {
      build();
      const meshes = this.batch.build(this.group, name);
      this.occluders.push(...meshes.filter((mm) => !(mm.material as THREE.Material).transparent));
      for (const mesh of meshes) this.setupShadows(mesh);
    }
    for (const d of Object.values(this.doors)) {
      d.pivot.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return;
        this.occluders.push(o);
        o.castShadow = true;
        o.receiveShadow = true;
      });
    }
    this.buildWaypoints();
    this.pickables.name = 'pickables';
    this.group.add(this.pickables);
    scene.add(this.group);
    // luz de relleno: cielo/suelo (hemisferio) + ambiente muy baja para que los negros no sean absolutos
    scene.add(new THREE.HemisphereLight(0x3a4660, 0x120e0a, 0.22));
    scene.add(new THREE.AmbientLight(0x20242c, 0.3));
    this.lights = new LightPool(scene, this.fixtures, 4);
    this.shadowLight = this.makeShadowLight(scene);
  }

  // ------------------------------------------------------------------ sombras
  /**
   * Sombras optimizadas para celular: UNA sola luz con sombra (spot de 512 px) que se ubica en la lámpara
   * de techo más cercana al jugador y apunta hacia abajo. Proyectan los muebles, los modelos y el monstruo;
   * paredes, pisos y techos sólo reciben (así el pase de sombras dibuja muy poca geometría).
   */
  readonly shadowLight: THREE.SpotLight;
  private shadowFixture: LampFixture | null = null;
  private shadowTimer = 0;
  private static readonly SHADOW_LAMPS = ['hallLamp1', 'hallLamp2', 'storeTube', 'livingLamp', 'deskLamp', 'candles'];

  private makeShadowLight(scene: THREE.Scene): THREE.SpotLight {
    const l = new THREE.SpotLight(0xffb070, 0, 9, 1.05, 0.75, 2);
    l.castShadow = true;
    l.shadow.mapSize.set(512, 512);
    l.shadow.camera.near = 0.2;
    l.shadow.camera.far = 9;
    l.shadow.bias = -0.0006;
    l.shadow.normalBias = 0.03;
    scene.add(l, l.target);
    return l;
  }

  /** Superficies grandes reciben sombra; muebles y objetos además la proyectan. */
  private setupShadows(mesh: THREE.Mesh): void {
    const mat = mesh.material as THREE.Material;
    mesh.receiveShadow = !mat.transparent;
    mesh.castShadow = !mat.transparent && !/^(wall|floor|ceiling|concrete|rug|persiana|window)/.test(mat.name);
  }

  private updateShadowLight(dt: number, focus: THREE.Vector3): void {
    this.shadowTimer -= dt;
    if (this.shadowTimer <= 0) {
      this.shadowTimer = 0.4;
      let best: LampFixture | null = null;
      let bestD = 7 * 7;
      for (const id of HouseBuilder.SHADOW_LAMPS) {
        const f = this.lights.get(id);
        if (!f || !f.on) continue;
        const d = f.position.distanceToSquared(focus);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      this.shadowFixture = best;
    }
    const f = this.shadowFixture;
    const l = this.shadowLight;
    if (!f) {
      l.intensity = 0;
      return;
    }
    l.position.copy(f.position);
    l.target.position.set(f.position.x, 0, f.position.z);
    l.color.copy(f.color);
    // suma poca luz: lo importante es la sombra, no iluminar de más
    l.intensity = f.intensity * f.level * 0.45;
  }

  // ------------------------------------------------------------------ helpers
  private wall(spec: Omit<WallSpec, 'floorY' | 'height'> & { height?: number }): void {
    buildWall(this.batch, { floorY: 0, height: H, colliders: this.colliders, ...spec });
  }

  private slabs(x0: number, x1: number, z0: number, z1: number, floor: THREE.Material): void {
    buildSlab(this.batch, floor, x0, x1, z0, z1, -0.05);
    buildSlab(this.batch, this.m.ceiling, x0, x1, z0, z1, H + 0.05);
  }

  /** Hornea un mueble en la geometría estática y opcionalmente agrega su colisión. */
  private place(obj: THREE.Object3D, x: number, y: number, z: number, rotY = 0, collide?: [number, number]): void {
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    const tmp = new THREE.Group();
    tmp.add(obj);
    this.batch.addGroup(tmp);
    if (collide) this.box(x, z, collide[0], collide[1]);
  }

  private dynamic<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, rotY = 0): T {
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    this.group.add(obj);
    return obj;
  }

  private box(x: number, z: number, w: number, d: number, enabled?: () => boolean): void {
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, enabled });
  }

  private door(id: string, o: Omit<DoorOptions, 'material' | 'frameMaterial' | 'knobMaterial'>): Door {
    const d = new Door({ ...o, material: this.m.door, frameMaterial: this.m.wood, knobMaterial: this.m.metalLight });
    this.group.add(d.group);
    this.doors[id] = d;
    // la hoja cerrada bloquea el paso
    const t = 0.2;
    if (o.axis === 'x') this.box(o.at, o.pos, o.width, t, () => d.isClosed);
    else this.box(o.pos, o.at, t, o.width, () => d.isClosed);
    return d;
  }

  private item(item: Omit<InteractiveItem, 'collected'>): InteractiveItem {
    const full: InteractiveItem = { ...item, collected: false };
    this.interactiveItems.push(full);
    // volumen invisible para seleccionar el objeto tocándolo en la pantalla (Raycaster)
    const r = HouseBuilder.PICK_RADIUS[item.kind] ?? 0.2;
    const hit = new THREE.Mesh(HouseBuilder.pickGeometry, HouseBuilder.pickMaterial);
    hit.scale.setScalar(r);
    hit.position.copy(item.position);
    hit.visible = false;
    hit.name = `pick:${item.id}`;
    hit.userData.item = full;
    this.pickables.add(hit);
    return full;
  }

  /** Volúmenes de selección táctil (invisibles: el Raycaster los detecta igual). */
  readonly pickables = new THREE.Group();
  private static readonly pickGeometry = new THREE.SphereGeometry(1, 8, 6);
  private static readonly pickMaterial = new THREE.MeshBasicMaterial();
  private static readonly PICK_RADIUS: Partial<Record<InteractiveItem['kind'], number>> = {
    tape: 0.17,
    battery: 0.16,
    note: 0.24,
    photo: 0.24,
    radio: 0.25,
    door: 0.5,
    exit: 0.55,
  };

  private addFixture(f: LampFixture): LampFixture {
    this.fixtures.push(f);
    return f;
  }

  // ------------------------------------------------------------------ pasillo
  private buildHallway(): void {
    const m = this.m;
    this.slabs(-1.5, 1.5, -18, 4, m.floorCalcarea);
    this.wall({ axis: 'z', pos: -1.5, from: 4, to: -18, side: 1, material: m.wallHall, openings: [{ at: 0.6, width: 1.1, top: 2.2 }, { at: -9.5, width: 1.0, top: 2.15 }] });
    this.wall({ axis: 'z', pos: 1.5, from: 4, to: -18, side: -1, material: m.wallHall, openings: [{ at: 0.8, width: 1.0, top: 2.15 }, { at: -5.5, width: 1.6, top: 2.4 }] });
    this.wall({ axis: 'x', pos: 4, from: -1.5, to: 1.5, side: -1, material: m.wallEntrance, openings: [{ at: 0, width: 1.1, top: 2.2 }] });

    const front = this.door('front', { id: 'front', axis: 'x', pos: 4, at: 0, floorY: 0, width: 1.1, height: 2.2, swing: 1, locked: true });
    void front;
    this.item({ id: 'front', kind: 'door', label: 'PUERTA DE CALLE', position: v(0, 1.2, 3.9), reach: 2.2 });
    // ruda en la entrada, contra la mala onda
    this.place(P.ruda(m), 1.15, 0, 3.55, 0, [0.3, 0.3]);

    this.place(P.rug(m, 1.0, 2.2), 0, 0, 2.2);
    this.place(P.coatRack(m), -1.1, 0, 3.4, 0, [0.4, 0.4]);
    this.place(P.phoneTable(m), 1.2, 0, -0.9, -Math.PI / 2, [0.4, 0.55]);

    // retratos: uno cambia cuando se lo mira a través de la cámara
    const normal = lam(toTexture(familyPhoto('normal'), { repeat: false }));
    const figure = lam(toTexture(familyPhoto('figure'), { repeat: false }));
    const photo = P.picture(m, 0.58, 0.5, normal);
    this.dynamic(photo.group, -1.415, 1.62, -2.5, Math.PI / 2);
    photo.image.userData.normal = normal;
    photo.image.userData.figure = figure;
    this.refs.portrait = photo.image;
    this.item({ id: 'portrait', kind: 'photo', label: 'FOTOGRAFÍA', position: v(-1.4, 1.62, -2.5), reach: 2.0 });

    const p2 = P.picture(m, 0.46, 0.4, normal);
    this.place(p2.group, 1.415, 1.6, -13, -Math.PI / 2);

    // copias de la misma foto tiradas por toda la casa (alguien las fue soltando)
    this.photoNormal = normal;
    this.photoFigure = figure;
    for (const [id, x, z, r] of [
      ['floorphoto-hall', 0.35, -7.4, 0.5],
      ['floorphoto-hall2', -0.5, -15.2, -1.1],
      ['floorphoto-living', 3.3, -4.0, 2.2],
      ['floorphoto-study', -4.2, -8.2, -0.4],
      ['floorphoto-store', -3.1, -2.6, 1.3],
      ['floorphoto-shrine', 1.6, -20.4, 0.2],
    ] as const) {
      const ph = planeMesh(0.3, 0.258, normal, 0, 0, 0);
      ph.rotation.set(-Math.PI / 2, 0, r);
      ph.position.set(x, 0.022, z); // un poco más arriba que el piso: si no, el piso la tapa a lo lejos
      this.group.add(ph);
      this.floorPhotos.push(ph);
      this.item({ id, kind: 'photo', label: 'FOTO EN EL PISO', position: v(x, 0.05, z), reach: 2.1 });
    }

    // almanaque de la carnicería: todos los 9 de octubre marcados
    const alm = planeMesh(0.3, 0.45, lam(toTexture(almanac(), { repeat: false })), 0, 0, 0);
    this.dynamic(alm, -1.42, 1.55, -4.2, Math.PI / 2);
    this.item({ id: 'almanac', kind: 'note', doc: 'almanac', label: 'ALMANAQUE', position: v(-1.42, 1.55, -4.2), reach: 2.4 });

    const clock = P.wallClock(m, lam(toTexture(clockFace(), { repeat: false })));
    this.dynamic(clock.group, 1.36, 1.55, -8.4, -Math.PI / 2);
    this.pendulum = clock.pendulum;
    this.refs.clock = clock.group;

    for (const [id, z, mode] of [
      ['hallLamp1', -1.0, 'soft'],
      ['hallLamp2', -12.0, 'broken'],
    ] as const) {
      const bulb = glowMaterial(0xffc98a, 3);
      this.place(P.ceilingLamp(m, bulb, 0.3), 0, H, z);
      this.addFixture(makeFixture(id, 'hallway', v(0, H - 0.42, z), 0xffb070, id === 'hallLamp1' ? 8 : 6, 7, mode, [bulb]));
    }
    const sconceGlow = glowMaterial(0xffb880, 2);
    this.place(P.wallSconce(m, sconceGlow), -1.415, 1.95, -15.5, Math.PI / 2);
    this.addFixture(makeFixture('hallSconce', 'hallway', v(-1.2, 2.0, -15.5), 0xff9a60, 4, 5, 'dying', [sconceGlow]));
  }

  // ------------------------------------------------------------------ sala
  private buildLivingRoom(): void {
    const m = this.m;
    this.slabs(1.5, 9, -9, -2, m.floorWood);
    this.wall({ axis: 'x', pos: -9, from: 1.5, to: 9, side: 1, material: m.wallLiving });
    this.wall({ axis: 'x', pos: -2, from: 1.5, to: 9, side: -1, material: m.wallLiving, openings: [{ at: 6, width: 1.4, top: 2.1, bottom: 0.9 }] });
    this.wall({ axis: 'z', pos: 9, from: -9, to: -2, side: -1, material: m.wallLiving });
    this.wall({ axis: 'z', pos: 1.5, from: -9, to: -2, side: 1, material: m.wallLiving, openings: [{ at: -5.5, width: 1.6, top: 2.4 }] });

    this.place(P.windowUnit(m, 1.4, 1.2, 2.6), 6, 1.5, -2.03, Math.PI);
    this.addFixture(makeFixture('livingMoon', 'living', v(6, 2.0, -2.7), 0x5a78b8, 5, 6, 'steady'));

    // TV con estática: la única luz "viva" de la sala
    this.place(P.tvStandWithVcr(m), 8.5, 0, -5.5, -Math.PI / 2, [0.5, 0.95]);
    const tvMat = createTVStaticMaterial(1.5);
    this.tvScreens.push(tvMat);
    const tv = P.crtTV(m, tvMat, 0.52);
    this.dynamic(tv.group, 8.55, 0.5, -5.6, -Math.PI / 2);
    this.addFixture(makeFixture('livingTV', 'living', v(8.0, 0.9, -5.6), 0xb8c8ff, 5, 5.5, 'tv'));

    this.place(P.coveredSofa(m, 2.1), 4.4, 0, -5.5, Math.PI / 2, [0.95, 2.2]);
    this.place(P.table(m, 1.1, 0.6, 0.45), 6.4, 0, -5.5, Math.PI / 2, [0.65, 1.15]);
    this.place(P.coveredArmchair(m), 8.0, 0, -2.9, -2.4, [0.9, 0.9]);
    this.place(P.shelf(m, 1.6, 1.8, 0.4, 4), 5.2, 0, -8.72, 0, [1.7, 0.45]);
    this.place(P.cardboardBox(m, 0.6, 0.5, 0.5), 2.3, 0, -8.5, 0.2, [0.65, 0.6]);
    this.place(P.cardboardBox(m, 0.45, 0.35, 0.45), 2.35, 0.5, -8.45, -0.3);
    this.place(P.rug(m, 2.6, 1.8), 6.3, 0, -5.5);
    const shade = glowMaterial(0xffb070, 1.5);
    const lamp = P.floorLamp(m, shade);
    this.place(lamp.group, 2.2, 0, -2.6, 0, [0.3, 0.3]);
    this.addFixture(makeFixture('livingLamp', 'living', v(2.2, 1.45, -2.6), 0xffa860, 6, 6, 'soft', [shade]));

    this.item({ id: 'breakfast', kind: 'note', doc: 'breakfast', label: 'DESAYUNO', position: v(6.42, 0.55, -5.8), reach: 2.0 });
    const letter = planeMesh(0.16, 0.22, lam(toTexture(notePaper(57, 10), { repeat: false })), 0, 0, 0);
    letter.rotation.set(-Math.PI / 2, 0, -0.4);
    this.dynamic(letter, 6.35, 0.456, -5.0);
    letter.rotation.set(-Math.PI / 2, 0, -0.4);
    this.item({ id: 'letter', kind: 'note', doc: 'letter', label: 'CARTA DEL ABUELO', position: v(6.35, 0.5, -5.0), reach: 2.0 });

    // ropero viejo del living: se puede uno meter adentro
    this.hideWardrobe('hide-living', 4.0, -2.32, Math.PI);

    // cinta 1 sobre la mesa ratona
    const tape = this.cassette('CINTA 01', 21);
    this.dynamic(tape, 6.35, 0.455, -5.45, 0.3);
    this.item({ id: 'tape-1', kind: 'tape', label: 'AGARRAR CINTA VHS', position: v(6.35, 0.5, -5.45), object: tape, tapeIndex: 0 });

    // batería 1 en el estante
    const bat = this.batteryPack();
    this.dynamic(bat, 5.0, 0.92, -8.68, 0.2);
    this.item({ id: 'battery-1', kind: 'battery', label: 'BATTERY PACK', position: v(5.0, 1.0, -8.7), object: bat, reach: 2.4 });
  }

  // ------------------------------------------------------------------ estudio
  private buildStudy(): void {
    const m = this.m;
    this.slabs(-9, -1.5, -13, -6, m.floorWood);
    this.wall({ axis: 'x', pos: -13, from: -9, to: -1.5, side: 1, material: m.wallBedroom });
    this.wall({ axis: 'x', pos: -6, from: -9, to: -1.5, side: -1, material: m.wallBedroom });
    this.wall({ axis: 'z', pos: -9, from: -13, to: -6, side: 1, material: m.wallBedroom, openings: [{ at: -9.5, width: 1.1, top: 2.1, bottom: 0.9 }] });
    this.wall({ axis: 'z', pos: -1.5, from: -13, to: -6, side: -1, material: m.wallBedroom, openings: [{ at: -9.5, width: 1.0, top: 2.15 }] });

    this.door('study', { id: 'study', axis: 'z', pos: -1.5, at: -9.5, floorY: 0, width: 1.0, height: 2.15, swing: -1, openAngle: 1.6 });
    this.item({ id: 'door-study', kind: 'door', label: 'PUERTA', position: v(-1.5, 1.2, -9.5), reach: 2.0 });

    this.place(P.windowUnit(m, 1.1, 1.2, 2.4), -8.97, 1.5, -9.5, Math.PI / 2);
    this.addFixture(makeFixture('studyMoon', 'study', v(-8.4, 2.0, -9.5), 0x5a78b8, 4, 5.5, 'steady'));

    // escritorio de Salgado
    this.place(P.table(m, 1.6, 0.8, 0.78), -6.3, 0, -11.9, 0, [1.65, 0.85]);
    this.place(P.chair(m), -6.3, 0, -11.1, Math.PI, [0.5, 0.5]);
    const deskGlow = glowMaterial(0xffb080, 1.6);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, 0.15, 10, 1, true), deskGlow);
    (shade.material as THREE.Material).side = THREE.DoubleSide;
    this.place(shade, -5.7, 1.0, -12.1);
    this.place(boxMesh(0.03, 0.2, 0.03, m.metal, 0, 0, 0), -5.7, 0.88, -12.1);
    this.addFixture(makeFixture('deskLamp', 'study', v(-5.7, 1.05, -12.0), 0xff9a58, 4, 5, 'soft', [deskGlow]));

    const tape = this.cassette('CINTA 02', 22);
    this.dynamic(tape, -6.6, 0.8, -11.85, -0.4);
    this.item({ id: 'tape-2', kind: 'tape', label: 'AGARRAR CINTA VHS', position: v(-6.6, 0.85, -11.85), object: tape, tapeIndex: 1 });

    const report = planeMesh(0.21, 0.28, lam(toTexture(notePaper(31, 12), { repeat: false })), 0, 0, 0);
    report.rotation.x = -Math.PI / 2;
    this.dynamic(report, -5.95, 0.785, -11.8, 0);
    report.rotation.set(-Math.PI / 2, 0, 0.2);
    this.item({ id: 'note-report', kind: 'note', doc: 'report', label: 'INFORME', position: v(-5.95, 0.8, -11.8) });
    this.item({ id: 'mate', kind: 'note', doc: 'mate', label: 'MATE', position: v(-6.85, 0.9, -11.6), reach: 2.0 });

    // biblioteca con la segunda batería
    this.place(P.shelf(m, 1.8, 2.2, 0.4, 5), -3.2, 0, -12.75, 0, [1.9, 0.45]);
    for (let i = 0; i < 5; i++) {
      const row = P.vhsRow(m, 30, 1.6, 40 + i * 9);
      row.position.set(-3.2, 0.075 + (i * 2.12) / 5, -12.75);
      this.group.add(row);
    }
    const bat = this.batteryPack();
    this.dynamic(bat, -2.7, 1.76, -12.6, -0.3);
    this.item({ id: 'battery-2', kind: 'battery', label: 'BATTERY PACK', position: v(-2.7, 1.85, -12.6), object: bat, reach: 2.4 });

    // pared de investigación: fotos de cuadros de video, todas con la figura detrás
    const board = planeMesh(2.4, 1.2, lam(toTexture(photoWall(), { repeat: false })), 0, 0, 0);
    this.dynamic(board, -5.5, 1.55, -6.085, Math.PI);
    this.item({ id: 'board', kind: 'note', doc: 'board', label: 'PARED DE FOTOS', position: v(-5.5, 1.55, -6.1), reach: 2.6 });
    const clipping = planeMesh(0.26, 0.34, lam(toTexture(newspaper(), { repeat: false })), 0, 0, 0);
    this.dynamic(clipping, -3.9, 1.5, -6.08, Math.PI);
    this.item({ id: 'clipping', kind: 'note', doc: 'clipping', label: 'RECORTE DE DIARIO', position: v(-3.9, 1.5, -6.1) });

    this.place(P.cardboardBox(m, 0.6, 0.45, 0.5), -8.4, 0, -6.6, 0.3, [0.65, 0.55]);
    this.hideWardrobe('hide-study', -8.7, -11.8, Math.PI / 2);
    this.place(P.rug(m, 2.2, 1.5), -5.8, 0, -9.4);
  }

  // ------------------------------------------------------------------ santuario
  private buildShrine(): void {
    const m = this.m;
    this.slabs(-4.5, 4.5, -25, -18, m.concreteFloor);
    this.wall({ axis: 'x', pos: -18, from: -4.5, to: 4.5, side: -1, material: m.concrete, openings: [{ at: 0, width: 1.6, top: 2.4 }] });
    this.wall({ axis: 'x', pos: -18, from: -1.5, to: 1.5, side: 1, material: m.wallHall, openings: [{ at: 0, width: 1.6, top: 2.4 }] });
    this.wall({ axis: 'x', pos: -25, from: -4.5, to: 4.5, side: 1, material: m.concrete, openings: [{ at: 0, width: 1.2, top: 2.3 }] });
    this.wall({ axis: 'z', pos: -4.5, from: -25, to: -18, side: 1, material: m.concrete });
    this.wall({ axis: 'z', pos: 4.5, from: -25, to: -18, side: -1, material: m.concrete, openings: [{ at: -21.5, width: 1.4, top: 2.2, bottom: 1.0 }] });

    // ventana tapiada: la luna se filtra entre tablas
    this.place(P.windowUnit(m, 1.4, 1.2, 2.2), 4.47, 1.6, -21.5, -Math.PI / 2);
    for (let b = 0; b < 4; b++) {
      const plank = boxMesh(0.04, 0.16, 1.7, m.wood, 0, 0, 0);
      plank.rotation.x = b % 2 === 0 ? 0.08 : -0.06;
      this.place(plank, 4.38, 1.15 + b * 0.3, -21.5);
    }
    this.addFixture(makeFixture('shrineMoon', 'shrine', v(3.8, 2.0, -21.5), 0x5a78b8, 4, 6, 'steady'));

    // puerta de salida sellada
    this.door('exit', { id: 'exit', axis: 'x', pos: -25, at: 0, floorY: 0, width: 1.2, height: 2.3, swing: 1, locked: true });
    this.item({ id: 'exit', kind: 'exit', label: 'PUERTA DEL FONDO', position: v(0, 1.2, -24.9), reach: 2.4 });

    // cintitas rojas en el marco de la pieza: cientos, atadas por alguien que tenía miedo
    this.place(P.redRibbons(m, 1.5, 46, 7), 0, 2.4, -18.12);
    this.place(P.redRibbons(m, 1.5, 40, 11), 0, 2.4, -17.9);
    this.item({ id: 'ribbons', kind: 'note', doc: 'ribbons', label: 'CINTITAS ROJAS', position: v(0, 2.0, -18.0), reach: 2.2 });
    this.place(boxMesh(1.34, 0.02, 0.5, m.redCloth, 0, 0, 0), 0, 0.905, -22.3);

    // altar con la tercera cinta, círculo de tiza y velas
    this.place(boxMesh(1.3, 0.9, 0.8, m.wood, 0, 0, 0), 0, 0.45, -22.3, 0, [1.35, 0.85]);
    const circle = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.56, 48), new THREE.MeshBasicMaterial({ color: 0x3a1210, side: THREE.DoubleSide }));
    circle.rotation.x = -Math.PI / 2;
    this.place(circle, 0, 0.012, -22.3);
    const candleGlow = glowMaterial(0xffb060, 4);
    for (const [x, z] of [
      [-0.5, -22.05],
      [0.5, -22.05],
      [-0.4, -22.55],
      [0.45, -22.6],
    ]) {
      this.place(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.18, 8), m.enamel), x, 0.99, z);
      this.place(new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), candleGlow), x, 1.1, z);
    }
    this.addFixture(makeFixture('candles', 'shrine', v(0, 1.3, -22.0), 0xff9440, 4, 5, 'soft', [candleGlow]));

    const tape = this.cassette('LA ÚLTIMA', 23);
    this.dynamic(tape, 0.05, 0.915, -22.25, 0.15);
    this.item({ id: 'tape-3', kind: 'tape', label: 'AGARRAR CINTA VHS', position: v(0.05, 0.95, -22.25), object: tape, tapeIndex: 2 });

    // el archivo de la entidad: cientos de cintas
    for (const z of [-19.6, -21.6, -23.6]) {
      this.place(P.shelf(m, 1.8, 2.0, 0.4, 4), -4.22, 0, z, Math.PI / 2, [0.45, 1.85]);
      for (let lvl = 0; lvl < 4; lvl++) {
        const row = P.vhsRow(m, 50, 1.7, 60 + lvl * 13 + Math.round(-z));
        row.position.set(-4.2, 0.075 + (lvl * 1.92) / 4, z);
        row.rotation.y = Math.PI / 2;
        this.group.add(row);
      }
    }
    this.place(P.chair(m), 2.6, 0, -23.8, -2.4, [0.5, 0.5]);
    this.place(P.tripod(m), 3.4, 0, -19.0, 0.4, [0.5, 0.5]);
  }

  // ------------------------------------------------------------------ almacén
  /** El almacén de la familia, al frente de la casa. La persiana está baja desde el 9 de octubre. */
  private buildStore(): void {
    const m = this.m;
    const X0 = -7.5;
    const Z0 = -5;
    const Z1 = 3;
    this.slabs(X0, -1.5, Z0, Z1, m.floorCalcarea);
    this.wall({ axis: 'x', pos: Z1, from: X0, to: -1.5, side: -1, material: m.wallKitchen });
    this.wall({ axis: 'x', pos: Z0, from: X0, to: -1.5, side: 1, material: m.wallKitchen });
    this.wall({ axis: 'z', pos: X0, from: Z0, to: Z1, side: 1, material: m.wallKitchen });
    this.wall({ axis: 'z', pos: -1.5, from: Z0, to: Z1, side: -1, material: m.wallKitchen, openings: [{ at: 0.6, width: 1.1, top: 2.2 }] });

    // persiana metálica baja (la vidriera da a la calle)
    this.place(planeMesh(2.8, 2.5, m.persiana, 0, 0, 0), -4.5, 1.25, Z1 - 0.075, Math.PI);
    this.place(boxMesh(3.0, 0.22, 0.2, m.metal, 0, 0, 0), -4.5, 2.6, Z1 - 0.15);
    const sign = planeMesh(1.6, 0.4, lam(toTexture(storeSign('ALMACÉN CARVAJAL', 'Fiambres · Bebidas · Artículos de limpieza'), { repeat: false })), 0, 0, 0);
    this.dynamic(sign, -4.5, 2.45, Z0 + 0.09, 0);
    const fiado = planeMesh(0.42, 0.26, lam(toTexture(cardboardSign('HOY NO SE FÍA\nMAÑANA SÍ', 13), { repeat: false })), 0, 0, 0);
    this.dynamic(fiado, X0 + 0.09, 1.7, 0.4, Math.PI / 2);

    // mostrador con balanza, registradora y la libreta de fiado
    this.place(P.counter(m, 3.0), -4.9, 0, 1.25, Math.PI, [3.05, 0.65]);
    this.place(P.balanza(m), -5.9, 0.9, 1.25, Math.PI);
    this.place(P.cashRegister(m), -3.8, 0.9, 1.2, Math.PI);
    const book = boxMesh(0.16, 0.025, 0.22, m.redCloth, 0, 0, 0);
    this.place(book, -4.75, 0.915, 1.15, 0.3);
    this.item({ id: 'fiado', kind: 'note', doc: 'fiado', label: 'LIBRETA DE FIADO', position: v(-4.75, 0.95, 1.15), reach: 2.0 });

    // radio del almacén, en el estante de atrás del mostrador
    const dial = glowMaterial(0xffb060, 1.6);
    this.place(P.shelf(m, 1.4, 1.2, 0.35, 2), -5.4, 0, -0.3, Math.PI, [1.45, 0.4]);
    const r = P.radio(m, dial);
    this.dynamic(r, -5.3, 1.18, -0.3, 0);
    this.refs.radio = r;
    this.addFixture(makeFixture('radioDial', 'store', v(-5.3, 1.35, -0.1), 0xff9a50, 1.2, 2.5, 'soft', [dial]));
    this.item({ id: 'radio', kind: 'radio', label: 'PRENDER LA RADIO', position: v(-5.3, 1.3, -0.32), reach: 2.2 });

    // estanterías con mercadería (los productos se cargan con los modelos)
    this.place(P.shelf(m, 2.6, 2.2, 0.4, 5), -3.3, 0, Z0 + 0.3, 0, [2.65, 0.45]);
    this.place(P.shelf(m, 2.6, 2.2, 0.4, 5), -6.1, 0, Z0 + 0.3, 0, [2.65, 0.45]);
    this.place(P.shelf(m, 2.4, 2.2, 0.4, 5), X0 + 0.3, 0, -1.6, Math.PI / 2, [0.45, 2.45]);
    this.place(P.sodaCrate(m), -2.1, 0, -4.3, 0.2, [0.45, 0.35]);
    this.place(P.sodaCrate(m), -2.1, 0.22, -4.3, -0.1);
    this.place(P.sodaCrate(m), -2.6, 0, -3.7, 0.5, [0.45, 0.35]);
    this.place(P.cardboardBox(m, 0.5, 0.4, 0.4), -7.0, 0, 2.4, 0.2, [0.55, 0.45]);

    // tercera batería, en el cajón de la registradora
    const bat = this.batteryPack();
    this.dynamic(bat, -3.5, 0.92, 1.0, 0.4);
    this.item({ id: 'battery-3', kind: 'battery', label: 'BATTERY PACK', position: v(-3.5, 1.0, 1.0), object: bat, reach: 2.2 });

    // tubo fluorescente que zumba y titila
    const tube = glowMaterial(0xd8f0ff, 2.4);
    this.place(P.fluorescent(m, tube, 1.2), -4.5, H, -1.0);
    this.addFixture(makeFixture('storeTube', 'store', v(-4.5, H - 0.3, -1.0), 0xcfe6ff, 6, 7, 'broken', [tube]));
  }

  /** Productos, mate, termo y desayuno (modelos GLB). Se llama cuando terminan de cargar. */
  furnish(kit: ModelKit): void {
    const batch = new StaticBatch();
    const put = (name: string, x: number, y: number, z: number, rotY = 0): THREE.Group | null => {
      const o = kit.get(name);
      if (!o) return null;
      o.position.set(x, y, z);
      o.rotation.y = rotY;
      const tmp = new THREE.Group();
      tmp.add(o);
      batch.addGroup(tmp);
      return o;
    };

    // desayuno del 9 de octubre, todavía en la mesa ratona
    put('Adds', 6.42, 0.452, -5.8, Math.PI / 2 + 0.15);
    put('Dulce_de_leche', 6.22, 0.452, -5.2, 0.6);
    // mate y termo de Salgado en el escritorio
    put('Termo', -7.0, 0.782, -12.1, 0.4);
    put('Mate', -6.85, 0.782, -11.6, -0.6);
    // un mate más, abandonado en el mostrador del almacén
    put('Mate', -6.2, 0.9, 1.0, 2.2);

    // mercadería: se llenan los estantes de a filas
    const products = [
      'SM_Canned_Food_06', 'SM_Canned_Food_07', 'SM_Canned_Food_08', 'SM_Canned_Food_09', 'SM_Canned_Food_12', 'SM_Canned_Food_13',
      'SM_Pasta_01', 'SM_Cereal_01', 'SM_Coffee_Box_01', 'SM_Porridge_01', 'SM_Salt_02', 'SM_Olive_Oil_01', 'SM_Sause_01',
      'SM_Milk_Bottle_01', 'SM_Juice_Carton_01', 'SM_Wine_Bottle_01', 'SM_Beer_Bottle_01', 'SM_Bottle_01',
      'SM_Bleach_01', 'SM_Detergent_Liquid_01', 'SM_Detergent_Powder_01', 'SM_Detergent_Powder_02', 'SM_Dishwashing_Liquid_01', 'SM_Protein_Jar_01',
    ].filter((n) => kit.has(n));
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const fill = (cx: number, cz: number, width: number, rotY: number, levels: number, h: number, alongX: boolean) => {
      for (let lvl = 0; lvl < levels; lvl++) {
        const y = 0.05 + (lvl * (h - 0.08)) / levels + 0.013;
        const group = products.slice((lvl * 4 + Math.floor(rnd() * 6)) % products.length).concat(products);
        let t = -width / 2 + 0.06;
        let gi = 0;
        while (t < width / 2 - 0.08) {
          if (rnd() < 0.12) {
            t += 0.12; // hueco: estante a medio vaciar
            continue;
          }
          const name = group[gi++ % group.length];
          const size = kit.size(name);
          const span = Math.max(size.x, size.z);
          if (size.y > (h - 0.08) / levels - 0.03) continue;
          const x = alongX ? cx + t + span / 2 : cx;
          const z = alongX ? cz : cz + t + span / 2;
          put(name, x, y, z, rotY + (rnd() - 0.5) * 0.25);
          t += span + 0.015;
        }
      }
    };
    if (products.length) {
      fill(-3.3, -4.7, 2.5, 0, 5, 2.2, true);
      fill(-6.1, -4.7, 2.5, 0, 5, 2.2, true);
      fill(-7.2, -1.6, 2.3, Math.PI / 2, 5, 2.2, false);
    }
    // golosinas y chocolates sobre el mostrador
    put('SM_Candies_01', -5.2, 0.9, 1.35, 0.2);
    put('SM_Chocolate_Bar_01', -4.4, 0.9, 1.4, -0.3);
    put('SM_Chocolate_Bar_02', -4.25, 0.9, 1.3, 0.5);
    put('SM_Chewing_Gum_01', -5.4, 0.9, 1.45, 0);
    put('SM_Matches_Box_01', -4.05, 0.9, 1.45, 0.8);
    // en el santuario: botellas de vino y velas, ofrenda
    put('SM_Wine_Bottle_01', -0.62, 0.915, -22.62, 0);
    put('SM_Beer_Can_01', 0.55, 0.915, -22.35, 0.3);
    put('SM_Sausages_01', 0.2, 0.915, -22.55, 0.2);

    const meshes = batch.build(this.group, 'models');
    for (const mesh of meshes) {
      mesh.name = `glb:${mesh.name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  }

  // ------------------------------------------------------------------ pieza de los chicos
  /** La pieza de Lucía y Martín: dos camas con espacio abajo, un ropero y un dibujo en la pared. */
  private buildBedroom(): void {
    const m = this.m;
    const X0 = 1.5;
    const X1 = 7.5;
    const Z0 = -1.95;
    const Z1 = 3.6;
    this.slabs(X0, X1, Z0, Z1, m.floorWood);
    this.wall({ axis: 'x', pos: Z1, from: X0, to: X1, side: -1, material: m.wallBedroom, openings: [{ at: 5, width: 1.2, top: 2.1, bottom: 0.9 }] });
    this.wall({ axis: 'x', pos: Z0, from: X0, to: X1, side: 1, material: m.wallBedroom });
    this.wall({ axis: 'z', pos: X1, from: Z0, to: Z1, side: -1, material: m.wallBedroom });
    this.wall({ axis: 'z', pos: X0, from: Z0, to: Z1, side: 1, material: m.wallBedroom, openings: [{ at: 0.8, width: 1.0, top: 2.15 }] });

    this.place(P.windowUnit(m, 1.2, 1.2, 2.2), 5, 1.5, Z1 - 0.03, Math.PI);
    this.addFixture(makeFixture('bedroomMoon', 'bedroom', v(5, 2.0, Z1 - 0.7), 0x5a78b8, 4, 6, 'steady'));

    // dos camas con la cabecera contra la ventana; abajo se puede esconder
    for (const [id, x, side] of [['hide-bedA', 3.0, 1], ['hide-bedB', 6.2, -1]] as const) {
      this.place(P.bedWithSpace(m), x, 0, Z1 - 1.05, Math.PI, [1.0, 1.95]);
      const eye = v(x + side * 0.3, 0.2, Z1 - 1.05);
      this.item({
        id,
        kind: 'hide',
        label: 'ESCONDERSE ABAJO DE LA CAMA',
        position: v(x + side * 0.55, 0.35, Z1 - 1.05),
        reach: 2.0,
        hide: { type: 'bed', eye, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, exit: v(x + side * 1.0, 1.6, Z1 - 1.05) },
      });
    }
    // mesa de luz con un velador que se muere
    this.place(P.table(m, 0.45, 0.4, 0.55), 4.6, 0, Z1 - 0.35, 0, [0.5, 0.45]);
    const glow = glowMaterial(0xffb070, 1.4);
    this.place(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.14, 10, 1, true), glow), 4.6, 0.68, Z1 - 0.35);
    this.addFixture(makeFixture('bedLamp', 'bedroom', v(4.6, 0.8, Z1 - 0.5), 0xff9a58, 3, 4.5, 'dying', [glow]));

    this.hideWardrobe('hide-bedroom', 5.4, Z0 + 0.32, 0);

    // el dibujo de Martín: "el señor de la tele no le gusta que lo miren"
    const drawing = planeMesh(0.5, 0.375, lam(toTexture(childDrawing(), { repeat: false })), 0, 0, 0);
    this.dynamic(drawing, X1 - 0.075, 1.4, 0.6, -Math.PI / 2);
    this.item({ id: 'drawing', kind: 'note', doc: 'drawing', label: 'DIBUJO', position: v(X1 - 0.08, 1.4, 0.6), reach: 2.2 });
    this.place(P.rug(m, 1.6, 1.1), 4.6, 0, 1.0);
    this.place(P.cardboardBox(m, 0.4, 0.3, 0.4), 7.0, 0, -1.2, 0.4, [0.45, 0.45]);
  }

  /** Ropero cerrado donde esconderse. rotY = hacia dónde miran las puertas (0 = +Z). */
  private hideWardrobe(id: string, x: number, z: number, rotY: number): void {
    this.place(P.closedWardrobe(this.m), x, 0, z, rotY, Math.abs(Math.sin(rotY)) > 0.5 ? [0.6, 1.15] : [1.15, 0.6]);
    const fwd = v(Math.sin(rotY), 0, Math.cos(rotY));
    this.item({
      id,
      kind: 'hide',
      label: 'ESCONDERSE EN EL ROPERO',
      position: v(x, 1.1, z).addScaledVector(fwd, 0.32),
      reach: 2.0,
      hide: { type: 'wardrobe', eye: v(x, 1.5, z).addScaledVector(fwd, 0.31), yaw: rotY + Math.PI, exit: v(x, 1.6, z).addScaledVector(fwd, 0.95) },
    });
  }

  // ------------------------------------------------------------------ objetos
  private cassette(label: string, seed: number): THREE.Group {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.188, 0.025, 0.104), new THREE.MeshLambertMaterial({ color: 0x121212 }));
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.04), new THREE.MeshLambertMaterial({ map: toTexture(tapeLabel(label, seed), { repeat: false }) }));
    lbl.rotation.x = -Math.PI / 2;
    lbl.position.set(0, 0.0131, -0.02);
    g.add(shell, lbl);
    return g;
  }

  private batteryPack(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.07), new THREE.MeshLambertMaterial({ color: 0x202226 }));
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.02, 0.072), new THREE.MeshLambertMaterial({ color: 0xb8a040 }));
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.012), glowMaterial(0x40ff60, 2));
    body.position.y = strip.position.y = 0.025;
    led.position.set(0.04, 0.052, 0.025);
    g.add(body, strip, led);
    return g;
  }

  // ------------------------------------------------------------------ rutas de la entidad
  private buildWaypoints(): void {
    const add = (id: string, room: string, x: number, z: number, links: string[]) => this.waypoints.set(id, { id, room, position: v(x, 0, z), links });
    add('H0', 'hallway', 0, 2.4, ['H1', 'HA']);
    add('HA', 'hallway', 0, 0.7, ['H0', 'H1', 'A0', 'B0']);
    add('H1', 'hallway', 0, -1.5, ['H0', 'H2', 'HA']);
    add('H2', 'hallway', 0, -5.5, ['H1', 'H3', 'L0']);
    add('H3', 'hallway', 0, -9.5, ['H2', 'H4', 'S0']);
    add('H4', 'hallway', 0, -13.2, ['H3', 'H5']);
    add('H5', 'hallway', 0, -16.8, ['H4', 'R0']);
    add('L0', 'living', 2.6, -5.5, ['H2', 'L1', 'L4']);
    add('L1', 'living', 3.6, -3.0, ['L0', 'L2']);
    add('L2', 'living', 7.6, -3.6, ['L1', 'L3']);
    add('L3', 'living', 7.4, -7.9, ['L2', 'L4']);
    add('L4', 'living', 3.4, -7.9, ['L3', 'L0']);
    add('S0', 'study', -2.6, -9.5, ['H3', 'S1', 'S4']);
    add('S1', 'study', -4.2, -7.2, ['S0', 'S2']);
    add('S2', 'study', -8.2, -7.4, ['S1', 'S3']);
    add('S3', 'study', -8.2, -11.6, ['S2', 'S4']);
    add('S4', 'study', -4.4, -11.0, ['S3', 'S0']);
    add('A0', 'store', -2.4, 0.6, ['HA', 'A1', 'A3']);
    add('A1', 'store', -2.6, -2.6, ['A0', 'A2']);
    add('A2', 'store', -5.0, -3.4, ['A1', 'A3']);
    add('A3', 'store', -6.6, -0.4, ['A2', 'A0']);
    add('B0', 'bedroom', 2.4, 0.8, ['HA', 'B1', 'B3']);
    add('B1', 'bedroom', 4.6, 1.0, ['B0', 'B2', 'B3']);
    add('B2', 'bedroom', 6.6, 0.6, ['B1', 'B3']);
    add('B3', 'bedroom', 4.4, -0.8, ['B0', 'B1', 'B2']);
    add('R0', 'shrine', 0, -19.2, ['H5', 'R1', 'R2']);
    add('R1', 'shrine', -2.9, -20.3, ['R0', 'R3']);
    add('R2', 'shrine', 3.0, -20.6, ['R0', 'R4']);
    add('R3', 'shrine', -2.8, -24.1, ['R1', 'R5']);
    add('R4', 'shrine', 3.0, -24.0, ['R2', 'R5']);
    add('R5', 'shrine', 0, -24.1, ['R3', 'R4']);
  }

  /** Habitación en la que está un punto. */
  roomAt(p: THREE.Vector3): string {
    if (p.z < -18) return 'shrine';
    if (p.x > 1.5) return p.z > -1.95 ? 'bedroom' : 'living';
    if (p.x < -1.5) return p.z > -5.5 ? 'store' : 'study';
    return 'hallway';
  }

  stopClock(): void {
    this.clockRunning = false;
  }

  fixture(id: string): LampFixture | undefined {
    return this.lights.get(id);
  }

  update(dt: number, t: number, focus: THREE.Vector3): void {
    this.lights.update(dt, t, focus);
    this.updateShadowLight(dt, focus);
    for (const d of Object.values(this.doors)) d.update(dt);
    for (const s of this.tvScreens) s.uniforms.uTime.value = t;
    for (const fn of this.animated) fn(dt, t);
    if (this.pendulum && this.clockRunning) this.pendulum.rotation.z = Math.sin(t * Math.PI) * 0.18;
  }
}
