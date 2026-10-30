import * as THREE from 'three';
import type { HomeDecorMaterials } from './homeDecorModels';
import {homeLathe,homeTube,homeSoftBox,addHomeLampShade} from './homeObjectShapes';
import {addHomeFoodModel} from './homeFoodModels';

export type HomeLifeKind = 'desk' | 'coffee' | 'dining' | 'kitchen' | 'vanity' | 'entry' | 'bedside';

export interface HomeLifeDetailsOptions {
  width?: number;
  depth?: number;
  surfaceY?: number;
  level?: 'simple' | 'rich';
}

const CONTACT_GAP = 0.002;

function addMesh(
  parent: THREE.Object3D,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh {
  const item = new THREE.Mesh(geometry, material);
  item.name = name;
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}

function addBox(
  parent: THREE.Object3D,
  name: string,
  x: number,
  centerY: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh {
  return homeSoftBox(parent,name,x,centerY,z,width,height,depth,material,.012);
}

function addBoxOnSurface(
  parent: THREE.Object3D,
  name: string,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  surfaceY: number,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh {
  return addBox(parent, name, x, surfaceY + CONTACT_GAP + height / 2, z, width, height, depth, material);
}

function addCylinderOnSurface(
  parent: THREE.Object3D,
  name: string,
  x: number,
  z: number,
  bottomRadius: number,
  topRadius: number,
  height: number,
  surfaceY: number,
  material: THREE.MeshStandardMaterial,
  segments = 12,
): THREE.Mesh {
  const item = addMesh(parent, name, new THREE.CylinderGeometry(topRadius, bottomRadius, height, segments), material);
  item.position.set(x, surfaceY + CONTACT_GAP + height / 2, z);
  return item;
}

function addHorizontalTorusOnSurface(
  parent: THREE.Object3D,
  name: string,
  x: number,
  z: number,
  majorRadius: number,
  tubeRadius: number,
  surfaceY: number,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh {
  const item = addMesh(parent, name, new THREE.TorusGeometry(majorRadius, tubeRadius, 6, 14), material);
  item.rotation.x = Math.PI / 2;
  item.position.set(x, surfaceY + CONTACT_GAP + tubeRadius, z);
  return item;
}

function addBook(
  parent: THREE.Object3D,
  materials: HomeDecorMaterials,
  name: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  thickness: number,
  surfaceY: number,
): void {
  const baseY = surfaceY + CONTACT_GAP;
  addBoxOnSurface(parent, `${name}-pages`, x, z, width * 0.94, thickness * 0.76, depth * 0.96, surfaceY, materials.cream);
  addBox(parent, `${name}-cover`, x, baseY + thickness * 0.88, z, width, thickness * 0.22, depth, materials.color('#8b705e'));
}

function addCup(
  parent: THREE.Object3D,
  materials: HomeDecorMaterials,
  name: string,
  x: number,
  z: number,
  radius: number,
  height: number,
  surfaceY: number,
): void {
  const baseY=surfaceY+CONTACT_GAP;
  const profile=[[0,0],[.64,0],[.73,.055],[.76,.16],[.94,.94],[.96,.985],[.94,1],[.865,.985],[.84,.94],[.69,.17],[.60,.13],[0,.13]];
  const body=homeLathe(parent,`${name}-body`,profile.map(([r,y])=>[r*radius,y*height]),materials.white,32);
  body.position.set(x,baseY,z);
  const tea=addMesh(parent,`${name}-tea`,new THREE.CircleGeometry(radius*.795,32),materials.color(name.includes('water')?'#9caca5':'#73533e'));
  tea.rotation.x=-Math.PI/2;tea.position.set(x,baseY+height*.79,z);
  // Both ends enter the tapered wall. Keep the curve in XY; a quarter-turn
  // would put the whole handle in an isolated YZ plane beside the cup.
  homeTube(parent,`${name}-handle`,[[x+radius*.90,baseY+height*.81,z],[x+radius*1.48,baseY+height*.81,z],[x+radius*1.63,baseY+height*.60,z],[x+radius*1.46,baseY+height*.32,z],[x+radius*.80,baseY+height*.25,z]],radius*.095,materials.white);
}

function addPlate(parent:THREE.Object3D,materials:HomeDecorMaterials,name:string,x:number,z:number,radius:number,surfaceY:number):void {
  const plate=homeLathe(parent,name,[[0,.003],[radius*.42,.003],[radius*.46,0],[radius*.63,0],[radius*.66,.004],[radius*.96,.014],[radius,.02],[radius*.98,.024],[radius*.80,.019],[radius*.63,.011],[0,.011]],materials.white,40);plate.position.set(x,surfaceY+CONTACT_GAP,z);
}

function addPen(
  parent: THREE.Object3D,
  materials: HomeDecorMaterials,
  x: number,
  z: number,
  length: number,
  radius: number,
  surfaceY: number,
  name = 'desk-pen',
): void {
  const item = addMesh(parent, name, new THREE.CylinderGeometry(radius * 0.78, radius, length, 7), materials.color('#536d73'));
  item.rotation.x = Math.PI / 2;
  item.position.set(x, surfaceY + CONTACT_GAP + radius, z);
}

function addBottle(
  parent: THREE.Object3D,
  materials: HomeDecorMaterials,
  name: string,
  x: number,
  z: number,
  radius: number,
  height: number,
  surfaceY: number,
  bodyMaterial: THREE.MeshStandardMaterial,
): void {
  const body=homeLathe(parent,`${name}-body`,[[0,0],[radius*.8,0],[radius,.04*height],[radius,.77*height],[radius*.82,.93*height],[radius*.48,height],[0,height]],bodyMaterial,24);body.position.set(x,surfaceY+CONTACT_GAP,z);
  const label=homeLathe(parent,`${name}-label`,[[radius*1.005,height*.25],[radius*1.005,height*.56]],materials.color('#e8dfcc'),24);label.position.set(x,surfaceY+CONTACT_GAP,z);
  const neckHeight = height * 0.19;
  const bodyTop = surfaceY + CONTACT_GAP + height;
  const neck = addMesh(parent, `${name}-neck`, new THREE.CylinderGeometry(radius * 0.45, radius * 0.48, neckHeight, 9), materials.white);
  neck.position.set(x, bodyTop + neckHeight / 2, z);
  const capHeight = Math.max(0.004, height * 0.09);
  const cap = addMesh(parent, `${name}-cap`, new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, capHeight, 9), materials.metal);
  cap.position.set(x, bodyTop + neckHeight + capHeight / 2, z);
}

function addTray(
  parent: THREE.Object3D,
  materials: HomeDecorMaterials,
  name: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  surfaceY: number,
): number {
  const height = 0.012;
  addBoxOnSurface(parent, name, x, z, width, height, depth, surfaceY, materials.color('#9b8168'));
  const rim=materials.color('#a08b73');
  for(const side of [-1,1]){
    addBox(parent,`${name}-rim-z-${side}`,x,surfaceY+.019,z+side*(depth/2-.005),width,.012,.01,rim);
    addBox(parent,`${name}-rim-x-${side}`,x+side*(width/2-.005),surfaceY+.019,z,.01,.012,depth-.02,rim);
  }
  return surfaceY + CONTACT_GAP + height;
}

function addDeskDetails(parent: THREE.Object3D, materials: HomeDecorMaterials, surfaceY: number, level: 'simple' | 'rich'): void {
  // The exact left strip is reserved by the room layout for a small notebook and pen.
  const bookX = -0.505;
  const bookZ = 0.16;
  const bookWidth = 0.076;
  const bookDepth = 0.108;
  const bookThickness = 0.014;
  const baseY = surfaceY + CONTACT_GAP;
  addBoxOnSurface(parent, 'desk-life-notebook-pages', bookX, bookZ, bookWidth * 0.94, bookThickness * 0.76, bookDepth * 0.96, surfaceY, materials.cream);
  addBox(parent, 'desk-life-notebook-cover', bookX, baseY + bookThickness * 0.88, bookZ, bookWidth, bookThickness * 0.22, bookDepth, materials.color('#71816f'));
  addPen(parent, materials, -0.418, 0.18, 0.135, 0.0033, surfaceY);
  if (level === 'rich') {
    addBox(parent, 'desk-life-bookmark', bookX + bookWidth * 0.22, baseY + bookThickness + 0.001, bookZ + bookDepth * 0.24, 0.006, 0.002, bookDepth * 0.34, materials.color('#bd8c64'));
  }
}

function addCoffeeDetails(
  parent: THREE.Object3D,
  materials: HomeDecorMaterials,
  width: number,
  depth: number,
  surfaceY: number,
  level: 'simple' | 'rich',
): void {
  const scale = Math.min(width, depth);
  addBook(parent, materials, 'coffee-table-book', -width * 0.22, depth * 0.16, width * 0.29, depth * 0.31, Math.min(0.018, scale * 0.035), surfaceY);
  const trayX = width * 0.2;
  const trayZ = -depth * 0.02;
  const trayTop = addTray(parent, materials, 'coffee-cup-tray', trayX, trayZ, width * 0.34, depth * 0.43, surfaceY);
  const cupX = trayX - width * 0.018;
  const cupZ = trayZ - depth * 0.005;
  addCup(parent, materials, 'coffee-table-cup', cupX, cupZ, scale * 0.076, Math.min(0.064, scale * 0.14), trayTop);
  addHomeFoodModel(parent,materials,'utensil-spoon','coffee-teaspoon',{x:trayX+width*.105,z:trayZ,surfaceY:trayTop,width:Math.min(.022,scale*.045),depth:Math.min(.11,depth*.3),height:.012,rotation:Math.PI/2});
  if (level === 'rich') {
    addBox(parent, 'coffee-bookmark-tab', -width * 0.11, surfaceY + CONTACT_GAP + Math.min(0.018, scale * 0.035) + 0.0015, depth * 0.16 + depth * 0.12, width * 0.035, 0.003, depth * 0.07, materials.color('#b87e65'));
  }
}

function addDiningDetails(
  parent: THREE.Object3D,
  materials: HomeDecorMaterials,
  width: number,
  depth: number,
  surfaceY: number,
  level: 'simple' | 'rich',
): void {
  const scale = Math.min(width, depth);
  const matX = -width * 0.19;
  const matZ = depth * 0.02;
  addBoxOnSurface(parent, 'dining-placemat', matX, matZ, width * 0.43, 0.006, depth * 0.58, surfaceY, materials.color('#9b8873'));
  const matTop = surfaceY + CONTACT_GAP + 0.006;
  addPlate(parent,materials,'dining-plate',matX,matZ,scale*.153,matTop);
  addHomeFoodModel(parent,materials,'utensil-fork','dining-fork',{x:matX-width*.155,z:matZ,surfaceY:matTop,width:.028,depth:Math.min(.22,depth*.34),height:.015,rotation:Math.PI/2});
  addHomeFoodModel(parent,materials,'utensil-knife','dining-knife',{x:matX+width*.155,z:matZ,surfaceY:matTop,width:.028,depth:Math.min(.22,depth*.34),height:.015,rotation:Math.PI/2});

  const cupX = width * 0.29;
  const cupZ = -depth * 0.13;
  addPlate(parent,materials,'dining-cup-saucer',cupX,cupZ,scale*.112,surfaceY);
  addCup(parent, materials, 'dining-cup', cupX, cupZ, scale * 0.061, scale * 0.12, surfaceY + 0.011 + CONTACT_GAP);

  const vaseX = width * 0.34;
  const vaseZ = depth * 0.27;
  const vase=homeLathe(parent,'dining-flower-bottle',[[0,0],[.025,0],[.045,.015],[.044,.07],[.025,.105],[.023,.119],[.018,.119],[.018,.108],[.025,.04],[0,.03]].map(([r,y])=>[r*scale,y*scale]),materials.color('#a7a28f'),24);vase.position.set(vaseX,surfaceY+CONTACT_GAP,vaseZ);
  const stem = addMesh(parent, 'dining-flower-stem', new THREE.CylinderGeometry(scale * 0.006, scale * 0.006, scale * 0.095, 6), materials.color('#748064'));
  stem.position.set(vaseX, surfaceY + CONTACT_GAP + scale * 0.115 + scale * 0.0475, vaseZ);
  const bud = addMesh(parent, 'dining-flower-bud', new THREE.SphereGeometry(scale * 0.014, 12, 8), materials.color('#d4a582'));
  bud.position.set(vaseX, surfaceY + CONTACT_GAP + scale * 0.115 + scale * 0.095 + scale * 0.018, vaseZ);
  for(let i=0;i<5;i++){const angle=i*Math.PI*2/5;const petal=addMesh(parent,`dining-flower-petal-${i}`,new THREE.SphereGeometry(scale*.021,12,8),materials.color('#bc8374'));petal.scale.set(1,.45,.7);petal.rotation.z=angle;petal.position.copy(bud.position).add(new THREE.Vector3(Math.cos(angle)*scale*.016,Math.sin(angle)*scale*.012,-scale*.004));}
  const leaf=addMesh(parent,'dining-flower-leaf',new THREE.SphereGeometry(scale*.018,10,6),materials.color('#748064'));leaf.scale.set(.32,1,.25);leaf.rotation.z=-.65;leaf.position.set(vaseX+scale*.012,surfaceY+CONTACT_GAP+scale*.17,vaseZ);
  if (level === 'rich') {
    addBox(parent, 'dining-folded-napkin', -width * 0.31, matTop + 0.004, -depth * 0.17, width * 0.12, 0.004, depth * 0.12, materials.color('#e0d7c8'));
  }
}

function addKitchenDetails(
  parent: THREE.Object3D,
  materials: HomeDecorMaterials,
  width: number,
  depth: number,
  surfaceY: number,
  level: 'simple' | 'rich',
): void {
  const scale = Math.min(width, depth);
  const boardX = -width * 0.19;
  const boardZ = depth * 0.08;
  const board=addHomeFoodModel(parent,materials,'cutting-board','kitchen-cutting-board',{x:boardX,z:boardZ,surfaceY,width:Math.min(.34,width*.43),depth:Math.min(.40,depth*.57),height:.035});
  addHomeFoodModel(parent,materials,'cooking-knife','kitchen-chef-knife',{x:boardX,z:boardZ,surfaceY:board.userData.homeSurfaceTop,width:Math.min(.24,width*.3),depth:.05,height:.015,rotation:.15});

  const spiceZ = depth * 0.22;
  addBottle(parent, materials, 'kitchen-spice-jar-a', width * 0.31, spiceZ, scale * 0.047, scale * 0.18, surfaceY, materials.color('#c0aa81'));
  addBottle(parent, materials, 'kitchen-spice-jar-b', width * 0.43, spiceZ, scale * 0.041, scale * 0.15, surfaceY, materials.color('#879274'));
  const waterGlass=homeLathe(parent,'kitchen-water-glass',[[0,0],[scale*.04,0],[scale*.049,scale*.14],[scale*.043,scale*.14],[scale*.036,scale*.012],[0,scale*.012]],materials.color('#b6c4bd'),24);waterGlass.position.set(width*.35,surfaceY+CONTACT_GAP,-depth*.2);
  if (level === 'rich') {
    addHomeFoodModel(parent,materials,'bottle-oil','kitchen-oil-bottle',{x:width*.12,z:depth*.26,surfaceY,width:scale*.09,depth:scale*.09,height:Math.min(.2,scale*.32)});
  }
}

function addVanityDetails(
  parent: THREE.Object3D,
  materials: HomeDecorMaterials,
  width: number,
  depth: number,
  surfaceY: number,
  level: 'simple' | 'rich',
): void {
  const scale = Math.min(width, depth);
  // The two basins sit at ±width*.25; use their front centre gap and outer edges.
  addBoxOnSurface(parent, 'vanity-folded-towel-lower', 0, depth * 0.36, width * 0.17, 0.012, depth * 0.22, surfaceY, materials.color('#d7d2c5'));
  addBox(parent, 'vanity-folded-towel-upper', 0, surfaceY + CONTACT_GAP + 0.012 + 0.008 / 2, depth * 0.36, width * 0.14, 0.008, depth * 0.18, materials.white);

  const bottleHeight = Math.min(0.13, scale * 0.24);
  addBottle(parent, materials, 'vanity-wash-bottle', width * 0.44, -depth * 0.12, scale * 0.046, bottleHeight, surfaceY, materials.color('#9aa99e'));
  addBottle(parent, materials, 'vanity-lotion-bottle', -width * 0.44, depth * 0.19, scale * 0.042, bottleHeight * 0.84, surfaceY, materials.color('#c49b7d'));
  if (level === 'rich') {
    addCylinderOnSurface(parent, 'vanity-soap-dish', width * 0.44, depth * 0.27, scale * 0.055, scale * 0.055, 0.008, surfaceY, materials.cream, 14);
  }
}

function addEntryDetails(
  parent: THREE.Object3D,
  materials: HomeDecorMaterials,
  width: number,
  depth: number,
  surfaceY: number,
  level: 'simple' | 'rich',
): void {
  const trayX = -width * 0.2;
  const trayZ = -depth * 0.05;
  addTray(parent, materials, 'entry-key-tray', trayX, trayZ, width * 0.31, depth * 0.42, surfaceY);
  const ringX = trayX - width * 0.035;
  const ringZ = trayZ + depth * 0.035;
  addHorizontalTorusOnSurface(parent, 'entry-key-ring', ringX, ringZ, Math.min(width, depth) * 0.025, 0.0025, surfaceY + CONTACT_GAP + 0.012, materials.metal);
  addBox(parent, 'entry-key-shaft', ringX + width * 0.065, surfaceY + CONTACT_GAP + 0.012 + 0.002 + 0.004 / 2, ringZ, width * 0.105, 0.004, 0.006, materials.metal);
  const letterX = width * 0.23;
  addBoxOnSurface(parent, 'entry-letter', letterX, depth * 0.06, width * 0.29, 0.006, depth * 0.37, surfaceY, materials.cream);
  addBox(parent, 'entry-envelope-flap', letterX, surfaceY + CONTACT_GAP + 0.006 + 0.001, depth * 0.06, width * 0.21, 0.002, depth * 0.25, materials.color('#c9b9a1'));
  if (level === 'rich') {
    addBox(parent, 'entry-postcard', letterX + width * 0.012, surfaceY + CONTACT_GAP + 0.006 + 0.002 + 0.005 / 2, depth * 0.065, width * 0.23, 0.005, depth * 0.3, materials.color('#a4aba0'));
  }
}

function addBedsideDetails(
  parent: THREE.Object3D,
  materials: HomeDecorMaterials,
  width: number,
  depth: number,
  surfaceY: number,
  level: 'simple' | 'rich',
): void {
  const scale = Math.min(width, depth);
  const bookThickness = Math.min(0.016, scale * 0.04);
  addBook(parent, materials, 'bedside-book', -width * 0.29, depth * 0.14, width * 0.27, depth * 0.29, bookThickness, surfaceY);
  addCup(parent, materials, 'bedside-water-cup', -width * 0.28, -depth * 0.24, scale * 0.064, Math.min(0.07, scale * 0.15), surfaceY);

  const lampX = width * 0.29;
  const lampZ = -depth * 0.13;
  const baseRadius = scale * 0.075;
  const baseHeight = scale * 0.035;
  addCylinderOnSurface(parent, 'bedside-lamp-base', lampX, lampZ, baseRadius, baseRadius, baseHeight, surfaceY, materials.metal, 12);
  const stemHeight = scale * 0.11;
  const stem = addMesh(parent, 'bedside-lamp-stem', new THREE.CylinderGeometry(scale * 0.009, scale * 0.011, stemHeight, 7), materials.metal);
  stem.position.set(lampX, surfaceY + CONTACT_GAP + baseHeight + stemHeight / 2, lampZ);
  const shadeHeight = scale * 0.105;
  addHomeLampShade(parent,materials,'bedside-lamp',lampX,lampZ,surfaceY+CONTACT_GAP+baseHeight+stemHeight,scale*.085,scale*.12,shadeHeight);
  if (level === 'rich') {
    addCylinderOnSurface(parent, 'bedside-lamp-shade-cap', lampX, lampZ, scale * 0.012, scale * 0.012, 0.006, surfaceY + CONTACT_GAP + baseHeight + stemHeight + shadeHeight, materials.metal, 8);
  }
}

/** Adds small life objects to a purchased furniture surface; it never creates the furniture itself. */
export function addHomeLifeDetails(
  parent: THREE.Object3D,
  materials: HomeDecorMaterials,
  kind: HomeLifeKind,
  options: HomeLifeDetailsOptions = {},
): void {
  const width = options.width ?? 0.8;
  const depth = options.depth ?? 0.5;
  const surfaceY = options.surfaceY ?? 0.78;
  const level = options.level ?? 'simple';
  if (!Number.isFinite(width) || !Number.isFinite(depth) || !Number.isFinite(surfaceY) || width <= 0 || depth <= 0) return;

  if (kind === 'desk') {
    // The specified notebook/pen strip only fits the 1.15 × 0.65 m desk surface.
    if (width < 1.14 || depth < 0.56) return;
    addDeskDetails(parent, materials, surfaceY, level);
    return;
  }

  // Scaled groups leave generous margins so they stay inside even small furniture tops.
  if (width < 0.28 || depth < 0.24) return;
  switch (kind) {
    case 'coffee':
      addCoffeeDetails(parent, materials, width, depth, surfaceY, level);
      break;
    case 'dining':
      addDiningDetails(parent, materials, width, depth, surfaceY, level);
      break;
    case 'kitchen':
      addKitchenDetails(parent, materials, width, depth, surfaceY, level);
      break;
    case 'vanity':
      addVanityDetails(parent, materials, width, depth, surfaceY, level);
      break;
    case 'entry':
      addEntryDetails(parent, materials, width, depth, surfaceY, level);
      break;
    case 'bedside':
      addBedsideDetails(parent, materials, width, depth, surfaceY, level);
      break;
    default:
      break;
  }
}
