import * as THREE from 'three';

/** A closer entry view on wide screens, with more of the room retained in portrait. */
export function venueEntryZoom(width: number, height: number): number {
  return width / Math.max(1, height) >= 1.05 ? 1.42 : 1.12;
}

/** Leave a small overview margin, including on a narrow phone screen. */
export function venueMinimumZoom(width: number, height: number, plan = false): number {
  return Math.min(1, width / Math.max(1, height) / 1.06) * (plan ? .95 : 1.08);
}

/** Keep the projected room within reach while preserving angle, depth and zoom.
 * Enlarging the room allows inspection of its edges, never an empty viewport. */
export function constrainVenuePan(camera: THREE.OrthographicCamera, target: THREE.Vector3, bounds: THREE.Box3, margin = .12): boolean {
  camera.updateMatrixWorld(true);
  const screen = new THREE.Box2(), point = new THREE.Vector3();
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    point.set(x, y, z).project(camera); screen.expandByPoint(new THREE.Vector2(point.x, point.y));
  }
  const center = screen.getCenter(new THREE.Vector2()), size = screen.getSize(new THREE.Vector2());
  const excess = (value: number, extent: number) => value - THREE.MathUtils.clamp(value, -Math.max(margin, (extent - 2) / 2 + margin), Math.max(margin, (extent - 2) / 2 + margin));
  const dx = excess(center.x, size.x), dy = excess(center.y, size.y);
  if (Math.abs(dx) + Math.abs(dy) < 1e-6) return false;
  const shift = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(dx * (camera.right - camera.left) / (2 * camera.zoom))
    .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), dy * (camera.top - camera.bottom) / (2 * camera.zoom));
  camera.position.add(shift); target.add(shift); camera.updateMatrixWorld(true);
  return true;
}

/** Center the actual visible building, rather than the empty corners of its world box. */
export function centeredVenuePose(camera: THREE.OrthographicCamera, eye: THREE.Vector3, target: THREE.Vector3, zoom: number, roots: THREE.Object3D[], excluded: THREE.Object3D[] = [], fitExterior = false) {
  const probe = camera.clone(); probe.position.copy(eye); probe.zoom = zoom; probe.lookAt(target); probe.updateProjectionMatrix(); probe.updateMatrixWorld(true);
  const screen = new THREE.Box2(), bounds = new THREE.Box3(), point = new THREE.Vector3();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (!parent.visible || excluded.includes(parent)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.every(material => !material.visible || !material.colorWrite)) return;
      bounds.setFromObject(object); if (bounds.isEmpty()) return;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        point.set(x, y, z).project(probe); screen.expandByPoint(new THREE.Vector2(point.x, point.y));
      }
    });
  }
  if (screen.isEmpty()) return { eye, target, zoom };
  const center = screen.getCenter(new THREE.Vector2());
  const shift = new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 0).multiplyScalar(center.x * (probe.right - probe.left) / (2 * zoom))
    .addScaledVector(new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 1), center.y * (probe.top - probe.bottom) / (2 * zoom));
  const size=screen.getSize(new THREE.Vector2());
  const fitted=fitExterior?zoom*Math.min(1.8/Math.max(.001,size.x),1.6/Math.max(.001,size.y)):zoom;
  return { eye: eye.clone().add(shift), target: target.clone().add(shift), zoom:fitted };
}
