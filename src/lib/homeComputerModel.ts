import * as THREE from 'three';
import type { HomeDecorMaterials } from './homeDecorModels';

export type HomeComputerTier = 'basic' | 'standard' | 'premium';

export interface HomeComputerMaterials extends HomeDecorMaterials {
  screen?: THREE.MeshStandardMaterial;
  screenOffice?: THREE.MeshStandardMaterial;
  screenGaming?: THREE.MeshStandardMaterial;
  glass?: THREE.MeshStandardMaterial;
}

export interface HomeModelSurfacePlacement {
  centerX: number;
  centerZ: number;
  baseY: number;
  maxWidth: number;
  maxHeight: number;
  maxDepth: number;
}

function indexedSurfaceBounds(mesh:THREE.Mesh):THREE.Box3 {
  const result=new THREE.Box3(),position=mesh.geometry.getAttribute('position'),index=mesh.geometry.index,point=new THREE.Vector3();
  for(let i=0;i<(index?.count??position.count);i++)result.expandByPoint(point.fromBufferAttribute(position,index?index.getX(i):i));
  return result;
}

/** The source uses repeating atlas UVs; the display needs one complete desktop image. */
export function prepareHomeMonitorSurface(model:THREE.Object3D):void {
  model.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||Array.isArray(object.material)||object.material.name!=='metal')return;
    const bounds=indexedSurfaceBounds(object),size=bounds.getSize(new THREE.Vector3());
    if(size.x<=0||size.y<=0)return;
    const geometry=object.geometry.clone(),position=geometry.getAttribute('position'),uv=new Float32Array(position.count*2);
    for(let i=0;i<position.count;i++){uv[i*2]=(position.getX(i)-bounds.min.x)/size.x;uv[i*2+1]=(position.getY(i)-bounds.min.y)/size.y;}
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));object.geometry=geometry;object.userData.homeGenerated=true;
  });
}

/** Replace the source keyboard's two flat key fields with separate raised keycaps. */
export function addHomeModelKeyboardKeycaps(model:THREE.Object3D,material:THREE.MeshStandardMaterial):void {
  let field:THREE.Mesh|undefined;
  model.traverse(object=>{if(object instanceof THREE.Mesh&&!Array.isArray(object.material)&&object.material.name==='metalMedium')field=object;});
  if(!field)return;
  const bounds=indexedSurfaceBounds(field),position=field.geometry.getAttribute('position'),index=field.geometry.index;
  const vertex=index?index.getX(0):0,normal=new THREE.Vector3().fromBufferAttribute(field.geometry.getAttribute('normal'),vertex),point=new THREE.Vector3().fromBufferAttribute(position,vertex);
  field.visible=false;
  const size=bounds.getSize(new THREE.Vector3()),columns=13,rows=4,stepX=size.x/columns,stepZ=size.z/rows;
  const geometry=new THREE.BoxGeometry(stepX*.81,.003,stepZ*.76),spaceGeometry=new THREE.BoxGeometry(stepX*4.75,.003,stepZ*.76);
  function key(column:number,row:number,space=false){
    const mesh=new THREE.Mesh(space?spaceGeometry:geometry,material),x=bounds.min.x+(column+.5)*stepX,z=bounds.min.z+(row+.5)*stepZ;
    mesh.position.set(x,point.y-(normal.z/normal.y)*(z-point.z)+.002,z);mesh.rotation.x=Math.atan2(normal.z,normal.y);
    mesh.name=space?'computer-spacebar':`computer-keycap-${row}-${column}`;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.homeGenerated=true;model.add(mesh);
  }
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){if(row===3&&column>=4&&column<=8)continue;key(column,row);}
  key(6,3,true);
}

/** Uniformly fits a GLB model onto a desk surface while preserving its authored proportions. */
export function fitHomeModelToFootprint(model: THREE.Object3D, placement: HomeModelSurfacePlacement): THREE.Box3 | undefined {
  model.updateMatrixWorld(true);
  const source = new THREE.Box3().setFromObject(model);
  const sourceSize = source.getSize(new THREE.Vector3());
  if (![sourceSize.x, sourceSize.y, sourceSize.z].every(value => Number.isFinite(value) && value > 0)) return;
  const scale = Math.min(
    placement.maxWidth / sourceSize.x,
    placement.maxHeight / sourceSize.y,
    placement.maxDepth / sourceSize.z,
  );
  if (!Number.isFinite(scale) || scale <= 0) return;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const scaled = new THREE.Box3().setFromObject(model);
  model.position.x += placement.centerX - (scaled.min.x + scaled.max.x) / 2;
  model.position.y += placement.baseY - scaled.min.y;
  model.position.z += placement.centerZ - (scaled.min.z + scaled.max.z) / 2;
  model.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(model);
}

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
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh {
  const item = addMesh(parent, name, new THREE.BoxGeometry(width, height, depth), material);
  item.position.set(x, y, z);
  return item;
}

function addSphere(
  parent: THREE.Object3D,
  name: string,
  x: number,
  y: number,
  z: number,
  radiusX: number,
  radiusY: number,
  radiusZ: number,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh {
  const item = addMesh(parent, name, new THREE.SphereGeometry(1, 12, 8), material);
  item.position.set(x, y, z);
  item.scale.set(radiusX, radiusY, radiusZ);
  return item;
}

function addKeyboard(parent: THREE.Object3D, materials: HomeComputerMaterials, tier: HomeComputerTier): void {
  const x = -0.065;
  const z = 0.205;
  const premium = tier === 'premium';
  const body = materials.color(premium ? '#626c66' : '#727a73');
  const key = materials.color(premium ? '#d2d2c6' : '#d9d4c8');
  addBox(parent, `computer-${tier}-keyboard-body`, x, 0.838, z, 0.435, 0.022, 0.145, body);

  const columns = 11;
  const rows = 4;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const keyX = x - 0.184 + column * 0.0368;
      const keyZ = z - 0.048 + row * 0.026;
      addBox(parent, `computer-${tier}-key-${row}-${column}`, keyX, 0.8525, keyZ, 0.029, 0.004, 0.014, key);
    }
  }
  addBox(parent, `computer-${tier}-spacebar`, x, 0.8525, z + 0.058, 0.13, 0.004, 0.012, key);
}

function addMouseAndPad(parent: THREE.Object3D, materials: HomeComputerMaterials, tier: HomeComputerTier): void {
  const x = 0.385;
  const z = 0.205;
  const pad = materials.color(tier === 'premium' ? '#858f83' : '#a8afa3');
  const mouseShell = materials.color(tier === 'premium' ? '#6f7b72' : '#747a76');
  const mouseDetail = materials.color('#d7d4c8');

  addBox(parent, `computer-${tier}-mousepad`, x, 0.830, z, 0.18, 0.008, 0.16, pad);
  addSphere(parent, `computer-${tier}-mouse`, x, 0.848, z, 0.034, 0.014, 0.047, mouseShell);
  addBox(parent, `computer-${tier}-mouse-center-line`, x, 0.8625, z - 0.01, 0.002, 0.001, 0.031, mouseDetail);
  addSphere(parent, `computer-${tier}-mouse-wheel`, x, 0.8625, z - 0.005, 0.004, 0.002, 0.007, materials.metal);
}

function addLaptop(parent: THREE.Object3D, materials: HomeComputerMaterials): void {
  const laptop = new THREE.Group();
  laptop.name = 'computer-basic-laptop-assembly';
  laptop.position.set(-0.035, 0, 0.155);
  parent.add(laptop);

  const chassis = materials.color('#777f7a');
  const deck = materials.color('#858d86');
  const keys = materials.color('#59615c');
  const touchpad = materials.color('#a9b1a6');
  const dark = materials.color('#343b39');
  const screen = materials.screen ?? materials.color('#83a8ad');

  // The base stays inside the desktop: x [-0.325, 0.255], z [0.005, 0.305].
  addBox(laptop, 'computer-basic-laptop-base', 0, 0.839, 0, 0.58, 0.024, 0.30, chassis);
  addBox(laptop, 'computer-basic-laptop-deck', 0, 0.8515, 0.005, 0.554, 0.002, 0.274, deck);

  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 12; column++) {
      const keyX = -0.2145 + column * 0.039;
      const keyZ = -0.094 + row * 0.032;
      addBox(laptop, `computer-basic-laptop-key-${row}-${column}`, keyX, 0.854, keyZ, 0.031, 0.003, 0.014, keys);
    }
  }
  addBox(laptop, 'computer-basic-laptop-spacebar', 0, 0.854, 0.022, 0.14, 0.003, 0.013, keys);
  addBox(laptop, 'computer-basic-laptop-touchpad', 0, 0.854, 0.093, 0.132, 0.003, 0.052, touchpad);

  const hinge = new THREE.Group();
  hinge.name = 'computer-basic-laptop-screen-hinge';
  hinge.position.set(0, 0.851, -0.145);
  hinge.rotation.x = -0.17;
  laptop.add(hinge);

  // The lid and the display share a hinge parent, so they keep the same pitch and move as one.
  const hingeBar = addMesh(hinge, 'computer-basic-laptop-hinge-bar', new THREE.CylinderGeometry(0.008, 0.008, 0.54, 10), materials.metal);
  hingeBar.rotation.z = Math.PI / 2;
  hingeBar.position.set(0, 0, 0);
  addBox(hinge, 'computer-basic-laptop-lid', 0, 0.19, 0, 0.58, 0.38, 0.014, dark);
  addBox(hinge, 'computer-basic-laptop-display', 0, 0.19, 0.0085, 0.542, 0.342, 0.002, screen);
  addSphere(hinge, 'computer-basic-laptop-camera', 0, 0.365, 0.010, 0.004, 0.004, 0.002, materials.metal);
}

function addDesktopMonitor(parent: THREE.Object3D, materials: HomeComputerMaterials, tier: 'standard' | 'premium'): void {
  const frame = materials.color('#373e3c');
  const display = tier === 'premium'
    ? materials.screenGaming ?? materials.screen ?? materials.color('#83a8ad')
    : materials.screenOffice ?? materials.screen ?? materials.color('#83a8ad');
  const stand = materials.color('#67726a');
  const centerX = -0.075;
  const centerZ = -0.02;

  const monitor = new THREE.Group();
  monitor.name = `computer-${tier}-monitor-assembly`;
  monitor.position.set(centerX, 1.075, centerZ);
  monitor.rotation.x = -0.055;
  parent.add(monitor);

  addBox(monitor, `computer-${tier}-monitor-bezel`, 0, 0, 0, 0.64, 0.38, 0.026, frame);
  addBox(monitor, `computer-${tier}-monitor-display`, 0, 0, 0.0145, 0.598, 0.336, 0.002, display);
  addSphere(monitor, `computer-${tier}-monitor-status-light`, 0.285, -0.169, 0.016, 0.004, 0.003, 0.002, materials.color('#a6b28b'));

  // Stand and foot meet above the desktop without covering the keyboard or mouse zone.
  addBox(parent, `computer-${tier}-monitor-neck`, centerX, 0.8785, 0.005, 0.052, 0.095, 0.046, stand);
  addBox(parent, `computer-${tier}-monitor-foot`, centerX, 0.833, 0.025, 0.22, 0.012, 0.15, stand);
}

function addComputerCase(parent: THREE.Object3D, materials: HomeComputerMaterials, tier: 'standard' | 'premium'): void {
  const premium = tier === 'premium';
  const x = 0.46;
  const z = 0.015;
  const width = premium ? 0.17 : 0.15;
  const height = premium ? 0.333 : 0.30;
  const depth = 0.18;
  const baseY = 0.827;
  const centerY = baseY + height / 2;
  const body = materials.color(premium ? '#303b3a' : '#66716c');
  const face = materials.color(premium ? '#202a2b' : '#4b5653');
  const vent = materials.color(premium ? '#879995' : '#a7ada2');
  const port = materials.color('#171e20');
  const accent = materials.color(premium ? '#89b5a8' : '#a5b59b');

  // Both tower sizes sit on the desk. Rear edge z=-0.075 leaves 50 mm to the nearest sill.
  addBox(parent, `computer-${tier}-case-body`, x, centerY, z, width, height, depth, body);
  const frontZ = z + depth / 2 + 0.003;
  addBox(parent, `computer-${tier}-case-front`, x, centerY, frontZ, width - 0.012, height - 0.012, 0.006, face);
  const ventRows = premium ? 6 : 4;
  const ventStart = baseY + height * 0.57;
  for (let row = 0; row < ventRows; row++) {
    const y = ventStart + row * (premium ? 0.018 : 0.021);
    addBox(parent, `computer-${tier}-case-front-vent-${row}`, x - width * 0.07, y, frontZ + 0.004, width * 0.48, 0.003, 0.002, vent);
  }
  // Small front USB/audio details make the computer read as a desktop tower at room scale.
  for (let index = 0; index < 2; index++) {
    addBox(parent, `computer-${tier}-case-usb-${index}`, x + width * 0.25, baseY + 0.055 + index * 0.018, frontZ + 0.004, 0.018, 0.008, 0.002, port);
  }
  addSphere(parent, `computer-${tier}-case-power-button`, x + width * 0.27, baseY + height - 0.048, frontZ + 0.005, 0.009, 0.009, 0.003, accent);
  if (!premium) return;

  // The glass side and twin fan rings distinguish the gaming tower without bright RGB effects.
  const sideX = x + width / 2 + 0.004;
  const glass = materials.glass ?? materials.color('#506461');
  addBox(parent, 'computer-premium-case-side-panel', sideX, centerY, z, 0.004, height - 0.038, depth - 0.034, glass);
  const fanMaterial = materials.color('#879995');
  for (const [index, y] of [baseY + height * 0.32, baseY + height * 0.68].entries()) {
    const ring = addMesh(parent, `computer-premium-case-side-fan-ring-${index}`, new THREE.TorusGeometry(0.049, 0.003, 6, 20), fanMaterial);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(sideX + 0.004, y, z + 0.004);
    const hub = addMesh(parent, `computer-premium-case-side-fan-hub-${index}`, new THREE.CylinderGeometry(0.009, 0.009, 0.004, 8), materials.color('#667b77'));
    hub.rotation.z = Math.PI / 2;
    hub.position.set(sideX + 0.006, y, z + 0.004);
  }
}

/** Adds only the computer and its input devices; the room renderer owns the desk and chair. */
export function addHomeComputer(parent: THREE.Object3D, materials: HomeComputerMaterials, tier: HomeComputerTier): THREE.Group {
  if (tier === 'basic') {
    const laptop = new THREE.Group();
    laptop.name = 'computer-basic-laptop-fallback';
    parent.add(laptop);
    addLaptop(laptop, materials);
    return laptop;
  }

  const fallback = new THREE.Group();
  fallback.name = `computer-${tier}-procedural-fallback`;
  parent.add(fallback);
  addDesktopMonitor(fallback, materials, tier);
  addKeyboard(fallback, materials, tier);
  addMouseAndPad(fallback, materials, tier);
  addComputerCase(parent, materials, tier);
  return fallback;
}
