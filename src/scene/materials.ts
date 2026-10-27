import * as THREE from 'three';
import { TextureSet } from '../assets/textures';

function lambert(name: string, map: THREE.Texture | null, color: THREE.ColorRepresentation, uv: [number, number] = [2, 2.7]) {
  const m = new THREE.MeshLambertMaterial({ map, color });
  m.name = name;
  m.userData.uv = uv;
  return m;
}

/** Material emisivo HDR (bulbos, pantallas): el valor puede superar 1 para que "brille" tras el tone mapping. */
export function glowMaterial(color: THREE.ColorRepresentation, strength: number, map: THREE.Texture | null = null): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), map });
  m.userData.baseStrength = strength;
  m.userData.baseColor = new THREE.Color(color);
  return m;
}

export function createMaterials(t: TextureSet) {
  return {
    wallHall: lambert('wallHall', t.wallHall, '#ffffff', [2, 2.7]),
    wallLiving: lambert('wallLiving', t.wallLiving, '#ffffff', [2, 2.7]),
    wallBedroom: lambert('wallBedroom', t.wallBedroom, '#ffffff', [2, 2.7]),
    wallKitchen: lambert('wallKitchen', t.wallKitchen, '#ffffff', [2.5, 2.7]),
    wallEntrance: lambert('wallEntrance', t.wallHall, '#d8ccc0', [2, 2.7]),
    ceiling: lambert('ceiling', t.ceiling, '#9a9488', [2, 2]),
    floorWood: lambert('floorWood', t.floorWood, '#ffffff', [2, 2]),
    floorTiles: lambert('floorTiles', t.floorTiles, '#ffffff', [2.4, 2.4]),
    floorCalcarea: lambert('floorCalcarea', t.calcareas, '#ffffff', [0.8, 0.8]),
    persiana: lambert('persiana', t.persiana, '#ffffff', [1.3, 2.6]),
    redCloth: lambert('redCloth', null, '#a01818', [1, 1]),
    plant: lambert('plant', null, '#3a5a2a', [1, 1]),
    terracotta: lambert('terracotta', null, '#8a4a2a', [1, 1]),
    glassGreen: new THREE.MeshLambertMaterial({ color: '#4a8a7a', transparent: true, opacity: 0.55 }),
    concrete: lambert('concrete', t.concrete, '#ffffff', [3, 2.6]),
    concreteFloor: lambert('concreteFloor', t.concreteFloor, '#ffffff', [3, 3]),
    wood: lambert('wood', t.darkWood, '#ffffff', [1, 1]),
    woodLight: lambert('woodLight', t.lightWood, '#ffffff', [1, 1]),
    fabric: lambert('fabric', t.fabric, '#ffffff', [1.2, 1.2]),
    fabricDark: lambert('fabricDark', t.fabric, '#6a6456', [1.2, 1.2]),
    door: lambert('door', t.door, '#ffffff', [1, 1]),
    rug: lambert('rug', t.rug, '#ffffff', [1, 1]),
    metal: lambert('metal', null, '#3a3a38', [1, 1]),
    metalLight: lambert('metalLight', null, '#8a877e', [1, 1]),
    enamel: lambert('enamel', t.ceiling, '#c8c2b0', [1, 1]),
    cardboard: lambert('cardboard', t.ceiling, '#8a6a42', [1, 1]),
    black: lambert('black', null, '#0a0a0a', [1, 1]),
    plastic: lambert('plastic', null, '#161616', [1, 1]),
    paper: lambert('paper', null, '#d8d2bc', [1, 1]),
    brick: lambert('brick', t.concrete, '#6a3a2a', [1.5, 1.5]),
    windowGlass: glowMaterial('#9fb4d8', 0.55, t.window),
    tvOff: new THREE.MeshLambertMaterial({ map: t.tvOff, color: '#ffffff' }),
    vhs: new THREE.MeshLambertMaterial({ map: t.vhsSpine, color: '#ffffff' }),
  };
}

export type Materials = ReturnType<typeof createMaterials>;
