import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLD_CASES, COUNTERS, COUNTER_X, CUSTOMER_DESTINATIONS, CUSTOMER_OBSTACLES, FIRE_EXTINGUISHER, SERVICE_COUNTER, SHELF_BAYS, SHELF_ROWS, STORE, TABLES, type Rect } from '../previews/convenience-store/layout';

const preview = fileURLToPath(new URL('../previews/convenience-store/', import.meta.url));
type Model = { id: string; file: string; bytes: number; sha256: string; size: number[]; sourceScene: string; sourceSceneSHA256: string; sourceFileSHA256?: string; reusedFrom?: string };
const manifest = JSON.parse(readFileSync(`${preview}/asset-manifest.json`, 'utf8')) as { models: Model[]; totalBytes: number };
const dimensions = new Map(manifest.models.map(model => [model.id, model.size]));
type Obstacle = { id: string; rect: Rect };
type Point = [number, number];
const radius = .30, step = .025;

function circleHits(point: Point, rect: Rect, clearance = radius) {
  const [x, z, width, depth] = rect;
  const dx = point[0] - Math.max(x, Math.min(x + width, point[0]));
  const dz = point[1] - Math.max(z, Math.min(z + depth, point[1]));
  return dx * dx + dz * dz < clearance * clearance - 1e-10;
}

/** Independent 4-neighbour flood fill of a 60 cm diameter floor footprint. */
function walkableFrom(start: Point, obstacles: Obstacle[]) {
  const columns = Math.round(STORE.width / step) + 1, rows = Math.round(STORE.depth / step) + 1;
  const usable = new Uint8Array(columns * rows), visited = new Uint8Array(usable.length);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const point: Point = [column * step, row * step];
    if (point[0] < radius || point[0] > STORE.width - radius || point[1] < radius || point[1] > STORE.depth - radius) continue;
    if (!obstacles.some(obstacle => circleHits(point, obstacle.rect))) usable[row * columns + column] = 1;
  }
  const index = (point: Point) => Math.round(point[1] / step) * columns + Math.round(point[0] / step);
  const queue = new Int32Array(usable.length), seed = index(start);let head = 0, tail = 0;
  expect(usable[seed], 'route origin must fit the complete character footprint').toBe(1);
  visited[seed] = 1;queue[tail++] = seed;
  while (head < tail) {
    const current = queue[head++], column = current % columns;
    for (const next of [column > 0 ? current - 1 : -1, column < columns - 1 ? current + 1 : -1, current - columns, current + columns]) {
      if (next >= 0 && next < usable.length && usable[next] && !visited[next]) { visited[next] = 1;queue[tail++] = next; }
    }
  }
  return (point: Point) => visited[index(point)] === 1;
}

function footprint(id: string, x: number, z: number, width: number, depth: number): Obstacle {
  return { id, rect: [x - width / 2, z - depth / 2, width, depth] };
}

// World footprints reconstructed from the asset geometry, rather than the larger
// navigation envelopes. Small products and intentional parts of one assembly
// (fridge doors / shelves, register on the counter) are not separate floor solids.
function physicalFurniture(): Obstacle[] {
  const cold = dimensions.get('coldcase')!, coldDoor = dimensions.get('cold-door')!, shelf = dimensions.get('shelf')!, table = dimensions.get('table')!, chair = dimensions.get('chair')!, trash = dimensions.get('trash')!;
  const coldBack = .52 - cold[2] / 2, coldFront = Math.max(.52 + cold[2] / 2, .855 + coldDoor[2] / 2);
  return [
    ...COLD_CASES.map((x, i) => ({ id: `cold-${i}`, rect: [x - cold[0] / 2, coldBack, cold[0], coldFront - coldBack] as Rect })),
    ...SHELF_ROWS.flatMap((x, row) => SHELF_BAYS.flatMap((z, bay) => [-1, 1].map(side => footprint(`shelf-${row}-${bay}-${side}`, x + side * .204, z, shelf[2], shelf[0])))),
    ...COUNTERS.map((z, i) => footprint(`counter-${i}`, COUNTER_X, z, .70, 1)),
    ...TABLES.flatMap((x, i) => [footprint(`table-${i}`, x, 9.45, table[0], table[2]), ...[8.68, 10.22].map(z => footprint(`chair-${i}-${z}`, x, z, chair[0], chair[2]))]),
    ...[.42, .78].map((x, i) => footprint(`recycle-${i}`, x, 11.53, trash[0], trash[2])),
    footprint('baskets', 6.95, 11.2, .61, .56),
    footprint('self-service', SERVICE_COUNTER.x, SERVICE_COUNTER.z, SERVICE_COUNTER.width, SERVICE_COUNTER.depth),
    footprint('fire-extinguisher', FIRE_EXTINGUISHER.x, FIRE_EXTINGUISHER.z, FIRE_EXTINGUISHER.size[0], FIRE_EXTINGUISHER.size[2]),
    ...Array.from({ length: 4 }, (_, i) => footprint(`staff-worktop-${i}`, 10.08, 3.55 + i * 1.1, .52, 1.08)),
  ];
}

describe('convenience store floor access', () => {
  const entrance: Point = [STORE.entrance[0] + STORE.entrance[2] / 2, STORE.depth - .35];
  it('connects the glass entrance to drinks, both sides of both shelves, self-service, checkout and all seats with a 60 cm footprint', () => {
    const reachable = walkableFrom(entrance, CUSTOMER_OBSTACLES);
    const destinations: Record<string, Point> = Object.fromEntries(Object.entries(CUSTOMER_DESTINATIONS).map(([id, point]) => [id, point as Point]));
    SHELF_ROWS.forEach((x, i) => [-1, 1].forEach(side => { destinations[`shelf-${i}-side-${side}`] = [x + side * .85, 5.2]; }));
    TABLES.forEach((x, i) => { destinations[`seat-${i}-back`] = [x, 8.1];destinations[`seat-${i}-front`] = [x, 11.02]; });
    COLD_CASES.forEach((x, i) => { destinations[`cold-${i}`] = [x, 1.65]; });
    for (const [id, point] of Object.entries(destinations)) expect(reachable(point), `${id} at ${point} must be accessible from the entrance`).toBe(true);
  });

  it('provides a continuous staff route behind both registers, the food case and the staff door', () => {
    const reachable = walkableFrom(entrance, physicalFurniture());
    const counterBack = COUNTER_X + .70 / 2, rearWorktopFront = 10.08 - .52 / 2;
    const staffCentre = (counterBack + rearWorktopFront) / 2;
    for (const [id, point] of Object.entries({ registerRear: [staffCentre, 4], foodCaseRear: [staffCentre, 5.65], secondRegisterRear: [staffCentre, 7.6], staffDoor: [10.04, 1.72] })) {
      expect(reachable(point as Point), `${id} must fit a 60 cm footprint along the staff aisle`).toBe(true);
    }
    const aisle = rearWorktopFront - counterBack;
    expect(aisle, 'unoccupied width between counter and rear worktop').toBeGreaterThanOrEqual(radius * 2);
  });

  it('keeps complete table, chair, shelf and cabinet footprints inside the shop without hard intersections', () => {
    const furniture = physicalFurniture();
    for (const item of furniture) {
      const [x, z, width, depth] = item.rect;
      expect(x, `${item.id} left`).toBeGreaterThanOrEqual(0);expect(z, `${item.id} back`).toBeGreaterThanOrEqual(0);
      expect(x + width, `${item.id} right`).toBeLessThanOrEqual(STORE.width);expect(z + depth, `${item.id} front`).toBeLessThanOrEqual(STORE.depth);
    }
    for (let i = 0; i < furniture.length; i++) for (let j = i + 1; j < furniture.length; j++) {
      const a = furniture[i], b = furniture[j];
      const overlapX = Math.min(a.rect[0] + a.rect[2], b.rect[0] + b.rect[2]) - Math.max(a.rect[0], b.rect[0]);
      const overlapZ = Math.min(a.rect[1] + a.rect[3], b.rect[1] + b.rect[3]) - Math.max(a.rect[1], b.rect[1]);
      expect(overlapX > 1e-5 && overlapZ > 1e-5, `${a.id} intersects ${b.id}`).toBe(false);
    }
  });

  it('does not understate physical furniture in the customer navigation envelopes', () => {
    for (const item of physicalFurniture()) {
      if (item.id.startsWith('staff-')) continue;
      let envelopeId = item.id;
      if (item.id.startsWith('shelf-')) envelopeId = `shelves-${item.id.split('-')[1]}`;
      if (item.id.startsWith('counter-')) envelopeId = 'checkout';
      if (item.id.startsWith('chair-') || item.id.startsWith('table-')) envelopeId = `seating-${item.id.split('-')[1]}`;
      if (item.id.startsWith('recycle-')) envelopeId = 'recycle';
      const envelope = CUSTOMER_OBSTACLES.find(obstacle => obstacle.id === envelopeId)!;
      expect(envelope, `${item.id} has a navigation obstacle`).toBeDefined();
      const [x, z, width, depth] = item.rect, [ex, ez, ew, ed] = envelope.rect;
      expect(x + 1e-5, `${item.id} left envelope`).toBeGreaterThanOrEqual(ex);
      expect(z + 1e-5, `${item.id} back envelope`).toBeGreaterThanOrEqual(ez);
      expect(x + width, `${item.id} right envelope`).toBeLessThanOrEqual(ex + ew + 1e-5);
      expect(z + depth, `${item.id} front envelope`).toBeLessThanOrEqual(ez + ed + 1e-5);
    }
  });
});

describe('convenience store packaged assets', () => {
  it('matches every packaged file and source against its recorded bytes and SHA-256, without missing or stray GLBs', () => {
    const files = readdirSync(`${preview}/assets`).filter(file => file.endsWith('.glb')).sort();
    expect(manifest.models.map(model => model.file).sort()).toEqual(files);
    expect(new Set(manifest.models.map(model => model.id)).size).toBe(manifest.models.length);
    let total = 0;
    for (const model of manifest.models) {
      const data = readFileSync(`${preview}/assets/${model.file}`);
      expect(data.length, model.id).toBe(model.bytes);total += data.length;
      expect(createHash('sha256').update(data).digest('hex'), model.id).toBe(model.sha256);
      const sourceHash = createHash('sha256').update(readFileSync(model.sourceScene)).digest('hex');
      expect(sourceHash, `${model.id} original source`).toBe(model.sourceFileSHA256 ?? model.sourceSceneSHA256);
      if (model.reusedFrom) {
        const reused = readFileSync(fileURLToPath(new URL(`../${model.reusedFrom}`, import.meta.url)));
        expect(data.equals(reused), `${model.id} is the recorded reused preview asset`).toBe(true);
      }
    }
    expect(total).toBe(manifest.totalBytes);
  });

  it('contains complete GLBs with embedded resources and geometry dimensions matching the placement manifest', () => {
    for (const model of manifest.models) {
      const data = readFileSync(`${preview}/assets/${model.file}`);
      expect(data.readUInt32LE(0), model.id).toBe(0x46546c67);expect(data.readUInt32LE(4), model.id).toBe(2);expect(data.readUInt32LE(8), model.id).toBe(data.length);
      expect(data.readUInt32LE(16), model.id).toBe(0x4e4f534a);
      const document = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
      for (const buffer of document.buffers ?? []) expect(!buffer.uri || buffer.uri.startsWith('data:'), `${model.id} buffer is embedded`).toBe(true);
      for (const image of document.images ?? []) expect(image.bufferView !== undefined || image.uri?.startsWith('data:'), `${model.id} texture is embedded`).toBe(true);
      const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
      for (const node of document.nodes ?? []) {
        // This export contract leaves all transforms baked into positions.
        expect([node.matrix, node.rotation, node.scale, node.translation].every(value => value === undefined), `${model.id} baked transform`).toBe(true);
        if (node.mesh === undefined) continue;
        for (const primitive of document.meshes[node.mesh].primitives) {
          const accessor = document.accessors[primitive.attributes.POSITION];
          for (let axis = 0; axis < 3; axis++) { minimum[axis] = Math.min(minimum[axis], accessor.min[axis]);maximum[axis] = Math.max(maximum[axis], accessor.max[axis]); }
        }
      }
      for (let axis = 0; axis < 3; axis++) expect(Math.abs(maximum[axis] - minimum[axis] - model.size[axis]), `${model.id} axis ${axis}`).toBeLessThan(2e-5);
      expect(Math.abs(minimum[1]), `${model.id} rests on floor`).toBeLessThan(2e-5);
      for (const axis of [0, 2]) expect(Math.abs((minimum[axis] + maximum[axis]) / 2), `${model.id} centred axis ${axis}`).toBeLessThan(2e-5);
    }
  });
});
