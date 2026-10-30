import * as THREE from 'three';
import { TubeGeometry } from 'three';
import { quiltTopY, type HomeDecorMaterials } from './homeDecorModels';

export type HomeFurnitureTier = 'basic' | 'standard' | 'premium';

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
  widthSegments = 10,
  heightSegments = 7,
): THREE.Mesh {
  const item = addMesh(parent, name, new THREE.SphereGeometry(1, widthSegments, heightSegments), material);
  item.position.set(x, y, z);
  item.scale.set(radiusX, radiusY, radiusZ);
  return item;
}

function addCylinder(
  parent: THREE.Object3D,
  name: string,
  x: number,
  y: number,
  z: number,
  radius: number,
  depth: number,
  material: THREE.MeshStandardMaterial,
  axis: 'x' | 'y' | 'z' = 'y',
  segments = 12,
): THREE.Mesh {
  const item = addMesh(parent, name, new THREE.CylinderGeometry(radius, radius, depth, segments), material);
  item.position.set(x, y, z);
  if (axis === 'x') item.rotation.z = Math.PI / 2;
  else if (axis === 'z') item.rotation.x = Math.PI / 2;
  return item;
}

function addTube(
  parent: THREE.Object3D,
  name: string,
  points: THREE.Vector3[],
  radius: number,
  material: THREE.MeshStandardMaterial,
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  return addMesh(parent, name, new TubeGeometry(curve, Math.max(12, points.length * 3), radius, 4, false), material);
}

function addQuiltPanel(
  parent: THREE.Object3D,
  name: string,
  halfWidth: number,
  zStart: number,
  zEnd: number,
  material: THREE.MeshStandardMaterial,
): void {
  const rows = 5;
  const columns = 12;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row < rows; row++) {
    const x = -halfWidth + (row / (rows - 1)) * halfWidth * 2;
    for (let column = 0; column < columns; column++) {
      const z = zStart + (column / (columns - 1)) * (zEnd - zStart);
      positions.push(x, quiltTopY(x, z) + 0.004, z);
      uvs.push(row / (rows - 1), column / (columns - 1));
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const a = row * columns + column;
      const b = (row + 1) * columns + column;
      const c = a + 1;
      const d = b + 1;
      // x cross z points down; reverse each triangle so the visible top faces up.
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  addMesh(parent, name, geometry, material);
}

function addQuiltSeam(parent: THREE.Object3D, name: string, halfWidth: number, z: number, material: THREE.MeshStandardMaterial): void {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= 12; index++) {
    const x = -halfWidth + (index / 12) * halfWidth * 2;
    points.push(new THREE.Vector3(x, quiltTopY(x, z) + 0.008, z));
  }
  addTube(parent, name, points, 0.0018, material);
}

function addPillowSeam(parent: THREE.Object3D, name: string, halfWidth: number, z: number, material: THREE.MeshStandardMaterial): void {
  const points = [
    new THREE.Vector3(-halfWidth, 0.797, z),
    new THREE.Vector3(-halfWidth * 0.35, 0.798, z),
    new THREE.Vector3(halfWidth * 0.35, 0.798, z),
    new THREE.Vector3(halfWidth, 0.797, z),
  ];
  addTube(parent, name, points, 0.0025, material);
}

/** Adds tier-specific bedding accents over the bed model and quilt. */
export function addBedTierDetails(parent: THREE.Object3D, materials: HomeDecorMaterials, tier: HomeFurnitureTier): void {
  if (tier === 'basic') {
    addQuiltPanel(parent, 'bed-basic-foot-binding', 0.39, 0.895, 0.918, materials.color('#d7d1c2'));
    addPillowSeam(parent, 'bed-basic-pillow-seam', 0.34, -0.68, materials.cream);
    return;
  }

  if (tier === 'standard') {
    const runner = materials.color('#aeb7a2');
    const piping = materials.color('#d6d0bf');
    addQuiltPanel(parent, 'bed-standard-runner', 0.47, 0.69, 0.875, runner);
    addQuiltSeam(parent, 'bed-standard-runner-head-seam', 0.47, 0.69, piping);
    addQuiltSeam(parent, 'bed-standard-runner-foot-seam', 0.47, 0.875, piping);
    addPillowSeam(parent, 'bed-standard-pillow-seam', 0.39, -0.68, piping);
    return;
  }

  const runner = materials.color('#aab39f');
  const piping = materials.color('#d9cfb9');
  addQuiltPanel(parent, 'bed-premium-runner', 0.55, 0.655, 0.91, runner);
  addQuiltSeam(parent, 'bed-premium-runner-head-seam', 0.55, 0.655, piping);
  addQuiltSeam(parent, 'bed-premium-runner-foot-seam', 0.55, 0.91, piping);

  // Soft fabric buttons sit on the inset face of the existing premium headboard.
  const tuft = materials.color('#d4c8ad');
  const buttonShadow = materials.color('#aa9b7b');
  for (const y of [0.68, 0.88, 1.08]) {
    for (const x of [-0.58, 0, 0.58]) {
      addSphere(parent, `bed-premium-headboard-tuft-${x}-${y}`, x, y, -0.966, 0.022, 0.022, 0.012, tuft, 8, 6);
      addSphere(parent, `bed-premium-headboard-tuft-shadow-${x}-${y}`, x, y, -0.977, 0.008, 0.008, 0.003, buttonShadow, 8, 6);
    }
  }
}

/** Adds a tier-specific shower control and spray-head finish within the enclosure. */
export function addShowerTierDetails(parent: THREE.Object3D, materials: HomeDecorMaterials, tier: HomeFurnitureTier): void {
  const escutcheon = materials.color('#c2c4bc');
  const center = new THREE.Vector3(0.24, 1.0, -0.291);
  const plate = addCylinder(parent, `shower-${tier}-control-plate`, center.x, center.y, center.z, 0.039, 0.012, escutcheon, 'z', 16);
  plate.name = `shower-${tier}-control-plate`;
  addCylinder(parent, `shower-${tier}-control-hub`, center.x, center.y, center.z + 0.008, 0.019, 0.017, materials.metal, 'z', 12);
  addBox(parent, `shower-${tier}-control-lever`, center.x + 0.043, center.y + 0.014, center.z + 0.015, 0.072, 0.012, 0.012, materials.metal);

  if (tier === 'basic') {
    addBox(parent, 'shower-basic-temperature-mark', 0.19, 1.0, -0.279, 0.008, 0.022, 0.003, materials.cream);
    return;
  }

  const nozzle = materials.color('#d9d9d0');
  const rows = tier === 'premium' ? 3 : 1;
  const columns = tier === 'premium' ? 5 : 3;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = 0.16 + column * 0.04;
      const z = -0.32 + row * 0.045;
      addSphere(parent, `shower-${tier}-spray-nozzle-${row}-${column}`, x, 1.885, z, 0.006, 0.005, 0.006, nozzle, 8, 6);
    }
  }
  if (tier === 'premium') {
    addSphere(parent, 'shower-premium-control-index', 0.24, 1.0, -0.273, 0.006, 0.006, 0.003, materials.color('#a6ae91'), 8, 6);
  }
}

function addBarCollars(parent: THREE.Object3D, materials: HomeDecorMaterials, name: string): void {
  const collar = materials.color('#879186');
  for (const x of [-0.08, 0.08]) {
    addCylinder(parent, `${name}-${x}`, x, 0.42, 0, 0.255, 0.018, collar, 'x', 12);
  }
}

/** Adds small grip, weight-index and selector details to the existing gym equipment. */
export function addGymTierDetails(parent: THREE.Object3D, materials: HomeDecorMaterials, tier: HomeFurnitureTier): void {
  addBarCollars(parent, materials, `gym-${tier}-bar-collar`);
  if (tier === 'basic') return;

  const mark = materials.color('#c9c4b4');
  for (const z of [0, 0.33]) {
    for (const x of [0.3, 0.54]) {
      addSphere(parent, `gym-${tier}-weight-index-${x}-${z}`, x, 0.28, z + 0.09, 0.009, 0.009, 0.005, mark, 8, 6);
    }
  }
  if (tier === 'standard') return;

  addCylinder(parent, 'gym-premium-selector-rosette', 0.45, 0.19, 0.486, 0.025, 0.018, materials.metal, 'z', 12);
  addSphere(parent, 'gym-premium-selector-center', 0.45, 0.19, 0.49, 0.012, 0.012, 0.005, materials.color('#a8b095'), 8, 6);
  addBox(parent, 'gym-premium-rack-index-mark', 0.45, 0.235, 0.489, 0.022, 0.008, 0.012, materials.cream);
}
