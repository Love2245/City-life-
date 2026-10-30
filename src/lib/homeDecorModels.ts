import * as THREE from 'three';
import { TubeGeometry } from 'three';

export interface HomeDecorMaterials {
  wood: THREE.MeshStandardMaterial;
  darkWood: THREE.MeshStandardMaterial;
  fabric: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  cream: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  palette?: THREE.MeshStandardMaterial;
  color(color: string): THREE.MeshStandardMaterial;
}

type Point = THREE.Vector3;

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, name: string): THREE.Mesh {
  const item = new THREE.Mesh(geometry, material);
  item.name = name;
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}

function box(
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
  const item = mesh(parent, new THREE.BoxGeometry(width, height, depth), material, name);
  item.position.set(x, y, z);
  return item;
}

function cylinder(
  parent: THREE.Object3D,
  name: string,
  x: number,
  y: number,
  z: number,
  bottomRadius: number,
  topRadius: number,
  height: number,
  material: THREE.MeshStandardMaterial,
  segments = 12,
): THREE.Mesh {
  const item = mesh(parent, new THREE.CylinderGeometry(topRadius, bottomRadius, height, segments), material, name);
  item.position.set(x, y, z);
  return item;
}

function rod(parent: THREE.Object3D, name: string, start: Point, end: Point, radius: number, material: THREE.MeshStandardMaterial): THREE.Mesh {
  const delta = end.clone().sub(start);
  const item = mesh(parent, new THREE.CylinderGeometry(radius * 0.62, radius, delta.length(), 7), material, name);
  item.position.copy(start).add(end).multiplyScalar(0.5);
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return item;
}

function addBook(
  parent: THREE.Object3D,
  name: string,
  x: number,
  baseY: number,
  z: number,
  thickness: number,
  height: number,
  depth: number,
  cover: THREE.MeshStandardMaterial,
  pages: THREE.MeshStandardMaterial,
  lean: number,
): void {
  const book = new THREE.Group();
  book.name = name;
  book.position.set(x, baseY + height / 2, z);
  book.rotation.z = lean;
  parent.add(book);

  box(book, `${name}-pages`, 0, 0, 0, thickness - 0.014, height - 0.02, depth - 0.018, pages);
  for (const side of [-1, 1]) {
    box(book, `${name}-cover-board-${side}`, side * (thickness / 2 - 0.005), 0, 0, 0.01, height + 0.01, depth + 0.012, cover);
  }
  box(book, `${name}-spine`, 0, 0, depth / 2 - 0.003, thickness + 0.004, height + 0.01, 0.012, cover);
  box(book, `${name}-spine-band-top`, 0, height * 0.27, depth / 2 + 0.004, thickness * 0.68, 0.008, 0.003, pages);
  box(book, `${name}-spine-band-bottom`, 0, -height * 0.27, depth / 2 + 0.004, thickness * 0.68, 0.008, 0.003, pages);
}

function addHorizontalBook(
  parent: THREE.Object3D,
  name: string,
  x: number,
  baseY: number,
  z: number,
  width: number,
  thickness: number,
  depth: number,
  cover: THREE.MeshStandardMaterial,
  pages: THREE.MeshStandardMaterial,
): void {
  const book = new THREE.Group();
  book.name = name;
  book.position.set(x, baseY + thickness / 2, z);
  parent.add(book);
  box(book, `${name}-pages`, 0, 0, 0, width - 0.016, thickness - 0.012, depth - 0.018, pages);
  box(book, `${name}-cover-top`, 0, thickness / 2 - 0.004, 0, width + 0.01, 0.008, depth + 0.012, cover);
  box(book, `${name}-cover-bottom`, 0, -thickness / 2 + 0.004, 0, width + 0.01, 0.008, depth + 0.012, cover);
  box(book, `${name}-spine`, 0, 0, depth / 2 - 0.003, width + 0.01, thickness + 0.008, 0.01, cover);
}

/** Adds a shallow, open-backed oak bookcase with varied books. */
export function addHomeBookcase(parent: THREE.Object3D, materials: HomeDecorMaterials): void {
  const { wood, darkWood, white, cream, metal } = materials;
  const width = 0.8;
  const depth = 0.45;
  const centerZ = 0.0625;
  const innerWidth = 0.72;

  box(parent, 'bookcase-back', 0, 0.95, -0.145, 0.72, 1.9, 0.04, wood);
  for (const side of [-1, 1]) {
    box(parent, `bookcase-side-${side}`, side * (width / 2 - 0.02), 0.95, centerZ, 0.04, 1.9, depth, darkWood);
  }
  box(parent, 'bookcase-bottom', 0, 0.045, centerZ, width, 0.09, depth, darkWood);
  box(parent, 'bookcase-top', 0, 1.865, centerZ, width, 0.07, depth, darkWood);

  const shelfTops = [0.09, 0.505, 0.945, 1.385];
  for (let index = 1; index < shelfTops.length; index++) {
    const shelfY = shelfTops[index] - 0.02;
    box(parent, `bookcase-shelf-${index}`, 0, shelfY, 0.07, innerWidth, 0.04, 0.42, wood);
    box(parent, `bookcase-shelf-edge-${index}`, 0, shelfY, 0.277, innerWidth, 0.018, 0.014, darkWood);
  }
  const covers = [
    materials.color('#8b6d5a'),
    materials.color('#76816e'),
    materials.color('#b19d78'),
    materials.color('#718087'),
    materials.color('#a97765'),
    materials.color('#c9bea6'),
  ];
  const pageTones = [cream, white, materials.color('#e8dfcf')];
  const rows = [
    { base: 0.09, count: 4, height: [0.24, 0.31, 0.27, 0.33], start: -0.3, step: 0.075 },
    { base: 0.505, count: 5, height: [0.28, 0.34, 0.25, 0.31, 0.36], start: -0.3, step: 0.079 },
    { base: 0.945, count: 6, height: [0.31, 0.36, 0.29, 0.34, 0.38, 0.32], start: -0.29, step: 0.085 },
    { base: 1.385, count: 6, height: [0.3, 0.34, 0.38, 0.29, 0.35, 0.31], start: -0.29, step: 0.087 },
  ];
  rows.forEach((row, rowIndex) => {
    for (let index = 0; index < row.count; index++) {
      const thickness = [0.054, 0.064, 0.073, 0.061, 0.08][(index + rowIndex) % 5];
      const lean = ((index + rowIndex) % 3 - 1) * 0.055;
      addBook(
        parent,
        `bookcase-book-${rowIndex}-${index}`,
        row.start + index * row.step,
        row.base,
        0.174 + (index % 2) * 0.012,
        thickness,
        row.height[index],
        0.14,
        covers[(index + rowIndex * 2) % covers.length],
        pageTones[(index + rowIndex) % pageTones.length],
        lean,
      );
    }
  });

  // Two modest stacks break up the vertical rhythm while leaving the spines visible.
  addHorizontalBook(parent, 'bookcase-horizontal-book-1', 0.225, 0.09, 0.18, 0.2, 0.045, 0.15, covers[2], cream);
  addHorizontalBook(parent, 'bookcase-horizontal-book-2', 0.225, 0.135, 0.18, 0.23, 0.044, 0.15, covers[4], white);
  addHorizontalBook(parent, 'bookcase-horizontal-book-3', 0.235, 0.505, 0.18, 0.18, 0.04, 0.14, covers[1], cream);
  addHorizontalBook(parent, 'bookcase-horizontal-book-4', 0.235, 0.545, 0.18, 0.21, 0.038, 0.14, covers[5], white);
  // Discreet shelf pins and spine accents add small metallic highlights.
  for (const y of [0.485, 0.925, 1.365]) {
    for (const side of [-1, 1]) {
      const pin = cylinder(parent, `bookcase-shelf-pin-${y}-${side}`, side * 0.352, y, 0.273, 0.007, 0.007, 0.009, metal, 8);
      pin.rotation.x = Math.PI / 2;
    }
  }
}

function gridMesh(
  parent: THREE.Object3D,
  name: string,
  rows: number,
  columns: number,
  pointAt: (row: number, column: number) => Point,
  material: THREE.MeshStandardMaterial,
  rowCrossColumn = true,
): THREE.Mesh {
  const front: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      front.push(...pointAt(row, column).toArray());
    }
  }
  const vertexCount = rows * columns;
  const positions = [...front, ...front];
  const uvs:number[]=[];
  for(let side=0;side<2;side++)for(let row=0;row<rows;row++)for(let column=0;column<columns;column++)uvs.push(row/(rows-1),column/(columns-1));
  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const a = row * columns + column;
      const b = (row + 1) * columns + column;
      const c = a + 1;
      const d = b + 1;
      const first = rowCrossColumn ? [a, b, c, b, d, c] : [a, c, b, b, c, d];
      indices.push(...first, ...first.map(index => index + vertexCount).reverse());
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mesh(parent, geometry, material, name);
}

function addLeaf(parent: THREE.Object3D, name: string, start: Point, end: Point, side: Point, width: number, material: THREE.MeshStandardMaterial, vein: THREE.MeshStandardMaterial): void {
  const direction = end.clone().sub(start);
  const length = direction.length();
  direction.normalize();
  const across = side.clone().addScaledVector(direction, -side.dot(direction)).normalize();
  const normal = direction.clone().cross(across).normalize();
  const steps = 7;
  const acrossSteps = 4;
  const leafMesh = gridMesh(
    parent,
    name,
    steps + 1,
    acrossSteps + 1,
    (row, column) => {
      const along = row / steps;
      const span = column / acrossSteps * 2 - 1;
      const widthAt = Math.pow(Math.max(0, Math.sin(Math.PI * along)), 0.82) * width * 0.5;
      const center = start.clone().addScaledVector(direction, length * along);
      center.y += Math.sin(Math.PI * along) * 0.018;
      return center
        .addScaledVector(across, span * widthAt)
        .addScaledVector(normal, Math.sin(Math.PI * along) * (1 - span * span) * 0.012);
    },
    material,
  );
  leafMesh.name = name;
  const veinStart = start.clone().addScaledVector(direction, 0.03);
  const veinEnd = end.clone().addScaledVector(direction, -0.025);
  rod(parent, `${name}-midrib`, veinStart, veinEnd, 0.0035, vein);
}

function addStem(parent: THREE.Object3D, name: string, points: Point[], radius: number, material: THREE.MeshStandardMaterial): void {
  for (let index = 0; index < points.length - 1; index++) {
    const taper = 1 - (index / points.length) * 0.35;
    const a = points[index];
    const b = points[index + 1];
    rod(parent, `${name}-${index}`, a, b, radius * taper, material);
  }
}

/** Adds a compact ceramic pot and branching, veined leaves. */
export function addHomePlant(parent: THREE.Object3D, materials: HomeDecorMaterials): void {
  const terracotta = materials.color('#b98464');
  const soil = materials.color('#554d40');
  const stemTone = materials.color('#68744e');
  const leafTones = [
    materials.color('#829067'),
    materials.color('#929c72'),
    materials.color('#718056'),
    materials.color('#a0a57b'),
  ];

  cylinder(parent, 'plant-pot-body', 0, 0.13, 0, 0.145, 0.185, 0.26, terracotta, 16);
  cylinder(parent, 'plant-pot-foot', 0, 0.015, 0, 0.14, 0.14, 0.03, materials.darkWood, 16);
  cylinder(parent, 'plant-pot-rim', 0, 0.245, 0, 0.193, 0.201, 0.035, terracotta, 16);
  cylinder(parent, 'plant-soil', 0, 0.261, 0, 0.177, 0.177, 0.012, soil, 16);

  const centralStem: Point[] = [
    new THREE.Vector3(0, 0.26, 0),
    new THREE.Vector3(0.018, 0.45, 0.008),
    new THREE.Vector3(-0.012, 0.66, 0.018),
    new THREE.Vector3(0.02, 0.86, 0.008),
    new THREE.Vector3(0.008, 1.045, 0.026),
  ];
  addStem(parent, 'plant-main-stem', centralStem, 0.013, stemTone);

  const branches = [
    { angle: -2.58, y: 0.43, length: 0.22, lift: 0.16 },
    { angle: -1.72, y: 0.53, length: 0.24, lift: 0.12 },
    { angle: -0.74, y: 0.61, length: 0.245, lift: 0.18 },
    { angle: 0.15, y: 0.7, length: 0.23, lift: 0.12 },
    { angle: 1.05, y: 0.77, length: 0.22, lift: 0.16 },
    { angle: 2.2, y: 0.82, length: 0.21, lift: 0.2 },
    { angle: 3.15, y: 0.87, length: 0.2, lift: 0.19 },
  ];
  branches.forEach((branch, index) => {
    const radial = new THREE.Vector3(Math.cos(branch.angle), 0, Math.sin(branch.angle));
    const start = new THREE.Vector3(radial.x * 0.018, branch.y, radial.z * 0.018);
    const middle = new THREE.Vector3(radial.x * branch.length * 0.52, branch.y + branch.lift * 0.42, radial.z * branch.length * 0.52);
    const tip = new THREE.Vector3(radial.x * branch.length, branch.y + branch.lift, radial.z * branch.length);
    addStem(parent, `plant-branch-${index}`, [start, middle, tip], 0.008, stemTone);
    const leafEnd = tip.clone().addScaledVector(radial, 0.13).add(new THREE.Vector3(0, 0.045 + (index % 2) * 0.025, 0));
    const across = new THREE.Vector3(-radial.z, 0.16, radial.x);
    addLeaf(parent, `plant-leaf-${index}`, tip, leafEnd, across, 0.09 + (index % 3) * 0.008, leafTones[index % leafTones.length], stemTone);

    if (index === 1 || index === 3 || index === 5) {
      const fork = start.clone().lerp(tip, 0.64).add(new THREE.Vector3(0, 0.025, 0));
      const forkEnd = fork.clone().addScaledVector(radial, 0.035).add(new THREE.Vector3(0, -0.035, 0));
      addStem(parent, `plant-fork-${index}`, [fork, forkEnd], 0.0055, stemTone);
      addLeaf(parent, `plant-leaf-fork-${index}`, forkEnd, forkEnd.clone().addScaledVector(radial, 0.1).add(new THREE.Vector3(0, 0.012, 0)), across.clone().negate(), 0.072, leafTones[(index + 1) % leafTones.length], stemTone);
    }
  });
}

const QUILT_MIN_TOP_Y = 0.64;

/** Shared height field for the quilt surface and every fitted bedding detail. */
export function quiltTopY(x: number, z: number): number {
  const edge = THREE.MathUtils.smoothstep(Math.abs(x), 0.55, 0.69);
  const folds = Math.sin(z * 8 + x * 4) * 0.011 + Math.sin(z * 15 - x * 5) * 0.004;
  const relaxedCenter = 0.006 * Math.cos((z - 0.26) * Math.PI * 1.25) * (1 - Math.min(1, Math.abs(x) / 0.72));
  return Math.max(QUILT_MIN_TOP_Y, 0.68 - edge * 0.028 + folds + relaxedCenter);
}

function addTube(parent: THREE.Object3D, name: string, points: Point[], radius: number, material: THREE.MeshStandardMaterial): void {
  const curve = new THREE.CatmullRomCurve3(points);
  mesh(parent, new TubeGeometry(curve, Math.max(12, points.length * 3), radius, 4, false), material, name);
}

/** Adds only the sage quilt layer; mattress, bed frame and pillows stay owned by the room renderer. */
export function addHomeQuilt(parent: THREE.Object3D, materials: HomeDecorMaterials): void {
  const fabric = materials.fabric;
  const stitching = materials.color('#ded8c7');
  const xOuter = 0.755;
  const zStart = -0.405;
  const zOuter = 1.04;
  const xSegments = 14;
  const zSegments = 20;
  const quiltFootDrapeBottomY = (x: number) => 0.455 + Math.sin(x * 12) * 0.01;

  gridMesh(parent, 'quilt-top', xSegments + 1, zSegments + 1, (row, column) => {
    const x = -xOuter + (row / xSegments) * xOuter * 2;
    const z = zStart + (column / zSegments) * (zOuter - zStart);
    return new THREE.Vector3(x, quiltTopY(x, z), z);
  }, fabric, false);

  for (const side of [-1, 1]) {
    gridMesh(parent, `quilt-side-drape-${side}`, zSegments + 1, 2, (row, column) => {
      const z = zStart + (row / zSegments) * (zOuter - zStart);
      const x = side * xOuter;
      if (column === 0) return new THREE.Vector3(x, quiltTopY(x, z), z);
      const bottomY = row === zSegments ? quiltFootDrapeBottomY(x) : 0.455 + Math.sin(z * 11 + side) * 0.012;
      return new THREE.Vector3(x, bottomY, z);
    }, fabric, side < 0);
  }

  gridMesh(parent, 'quilt-foot-drape', 2, xSegments + 1, (row, column) => {
    const x = -xOuter + (column / xSegments) * xOuter * 2;
    if (row === 0) return new THREE.Vector3(x, quiltTopY(x, zOuter), zOuter);
    return new THREE.Vector3(x, quiltFootDrapeBottomY(x), zOuter);
  }, fabric, true);

  for (const side of [-1, 1]) {
    const hem: Point[] = [];
    for (let index = 0; index <= zSegments; index++) {
      const z = zStart + 0.012 + (index / zSegments) * (zOuter - zStart - 0.024);
      hem.push(new THREE.Vector3(side * xOuter, 0.455 + Math.sin(z * 11 + side) * 0.012, z));
    }
    addTube(parent, `quilt-side-hem-${side}`, hem, 0.0035, stitching);
  }

  const footHem: Point[] = [];
  for (let index = 0; index <= xSegments; index++) {
    const x = -xOuter + 0.012 + (index / xSegments) * (xOuter * 2 - 0.024);
    footHem.push(new THREE.Vector3(x, quiltFootDrapeBottomY(x), zOuter));
  }
  addTube(parent, 'quilt-foot-hem', footHem, 0.0035, stitching);

  for (const x of [-0.39, 0, 0.39]) {
    const seam: Point[] = [];
    for (let index = 0; index <= 24; index++) {
      const z = zStart + 0.055 + (index / 24) * (zOuter - zStart - 0.11);
      seam.push(new THREE.Vector3(x, quiltTopY(x, z) + 0.006, z));
    }
    addTube(parent, `quilt-stitch-line-${x}`, seam, 0.0018, stitching);
  }
}
