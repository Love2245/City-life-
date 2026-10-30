import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { centeredVenuePose, venueEntryZoom } from '../src/lib/venueFraming';

function projectionCenter(camera: THREE.OrthographicCamera, meshes: THREE.Mesh[]) {
  const screen = new THREE.Box2();
  for (const mesh of meshes) {
    const box = new THREE.Box3().setFromObject(mesh);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).project(camera); screen.expandByPoint(new THREE.Vector2(point.x, point.y));
    }
  }
  return screen.getCenter(new THREE.Vector2());
}
describe('closer, centered venue entry cameras', () => {
  it('centers an asymmetric building without changing its viewing angle, zoom or facility positions', () => {
    const root = new THREE.Group(), material = new THREE.MeshBasicMaterial();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(12, .2, 14), material); floor.position.set(6, -.1, 7);
    const back = new THREE.Mesh(new THREE.BoxGeometry(10, 3, .1), material); back.position.set(5, 1.5, 0);
    const side = new THREE.Mesh(new THREE.BoxGeometry(.1, 3, 12), material); side.position.set(10, 1.5, 6); root.add(floor, back, side);
    const invisible = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), material); invisible.visible = false; root.add(invisible);
    const shadow = new THREE.Mesh(new THREE.BoxGeometry(80, 80, 80), material); root.add(shadow);
    for (const [width, height] of [[1392,896],[896,414],[390,844]]) {
      const aspect = width / height, extent = 16.5, camera = new THREE.OrthographicCamera(-extent*aspect/2,extent*aspect/2,extent/2,-extent/2,.1,120);
      const eye = new THREE.Vector3(-10,18,26), target = new THREE.Vector3(5.2,.35,6.2), zoom = .96*venueEntryZoom(width,height);
      const before = root.children.map(object => object.position.toArray());
      const centered = centeredVenuePose(camera,eye,target,zoom,[root],[shadow]);
      camera.position.copy(centered.eye); camera.zoom=zoom; camera.lookAt(centered.target); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      expect(projectionCenter(camera,[floor,back,side]).length()).toBeLessThan(1e-9);
      expect(centered.eye.clone().sub(centered.target).distanceTo(eye.clone().sub(target))).toBeLessThan(1e-9);
      expect(root.children.map(object => object.position.toArray())).toEqual(before);
      expect(zoom).toBeGreaterThan(.96);
    }
    for(const object of root.children)(object as THREE.Mesh).geometry.dispose(); material.dispose();
  });
  it('enlarges the desktop entry more than portrait, retaining room context on phones', () => {
    expect(venueEntryZoom(1392,896)).toBeGreaterThan(1.35); expect(venueEntryZoom(1392,896)).toBeLessThan(1.5);
    expect(venueEntryZoom(390,844)).toBeGreaterThan(1); expect(venueEntryZoom(390,844)).toBeLessThan(1.2);
  });
});
