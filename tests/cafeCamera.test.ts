import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { describe, expect, it } from 'vitest';
import { CAFE_ZONES, CAFE_PLAN_VIEW, CAFE_CAMERA_MIN_POLAR, CAFE_CAMERA_MAX_POLAR } from '../previews/cafe/layout';
import { cameraFacingAngle, spriteCardMatrix, spriteBodyDepthAmplitude, setSpriteBodyDepth } from '../previews/cafe/cameraPose';
import { spriteSector } from '../previews/cafe/spriteDirections';

const origin = new THREE.Vector3(2.4, .014, 9.9);
const elevations = [Math.PI / 2 - CAFE_CAMERA_MAX_POLAR, .3, .6, 1, 1.4, Math.PI / 2 - CAFE_CAMERA_MIN_POLAR];
function view(elevation: number, yaw = .7) {
  const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, .1, 100);
  camera.position.set(Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation)).multiplyScalar(12).add(origin);
  camera.lookAt(origin); camera.updateMatrixWorld();
  return camera;
}
const point = (matrix: THREE.Matrix4, x: number, y: number) => new THREE.Vector3(x, y, 0).applyMatrix4(matrix).add(origin);

describe('cafe free camera and character-only pitch correction', () => {
  it('retains the original region and overhead camera presets without forcing a shared elevation', () => {
    const camera = new THREE.OrthographicCamera(), controls = new OrbitControls(camera);
    controls.minPolarAngle = CAFE_CAMERA_MIN_POLAR; controls.maxPolarAngle = CAFE_CAMERA_MAX_POLAR;
    const angles = new Set<number>();
    for (const preset of [...Object.values(CAFE_ZONES), CAFE_PLAN_VIEW]) {
      camera.position.set(...preset.eye); controls.target.set(...preset.target); controls.update();
      expect(camera.position.distanceTo(new THREE.Vector3(...preset.eye))).toBeLessThan(1e-8);
      angles.add(Math.round(controls.getPolarAngle() * 10000));
    }
    expect(angles.size).toBeGreaterThan(5);
  });

  it('allows vertical orbiting through the original camera range', () => {
    const camera = new THREE.OrthographicCamera(), controls = new OrbitControls(camera);
    controls.minPolarAngle = CAFE_CAMERA_MIN_POLAR; controls.maxPolarAngle = CAFE_CAMERA_MAX_POLAR;
    for (const polar of [CAFE_CAMERA_MIN_POLAR, .1, .4, .8, 1.2, CAFE_CAMERA_MAX_POLAR]) {
      camera.position.setFromSphericalCoords(12, polar, 1.1); controls.update();
      expect(controls.getPolarAngle()).toBeCloseTo(polar, 10);
      expect(controls.getAzimuthalAngle()).toBeCloseTo(1.1, 10);
    }
  });

  it('preserves image aspect, screen height and the floor anchor from low angle to overhead in all eight directions', () => {
    const width = .72, height = 1.62, offset = .07;
    for (let sector = 0; sector < 8; sector++) for (const elevation of elevations) {
      const camera = view(elevation, sector * Math.PI / 4), eye = camera.position.clone(), orientation = camera.quaternion.clone();
      const matrix = spriteCardMatrix(camera, width, height, offset);
      const top = point(matrix, 0, .5).project(camera), bottom = point(matrix, 0, -.5).project(camera);
      const left = point(matrix, -.5, 0).project(camera), right = point(matrix, .5, 0).project(camera);
      expect((right.x - left.x) / (top.y - bottom.y)).toBeCloseTo(width / height, 10);
      expect(top.y - bottom.y).toBeCloseTo(height / 6, 10);
      expect(top.x).toBeCloseTo(bottom.x, 10); expect(left.y).toBeCloseTo(right.y, 10);
      expect(point(matrix, -offset / width, -.5).distanceTo(origin)).toBeLessThan(1e-10);
      expect(spriteSector(cameraFacingAngle(camera, new THREE.Vector3()))).toBe(sector);
      expect(camera.position.equals(eye)).toBe(true); expect(camera.quaternion.equals(orientation)).toBe(true);
    }
  });

  it('keeps the upright body depth at every painted height so a tilted card cannot push the head below a tabletop', () => {
    const width = .72, height = 1.62, offset = .07;
    for (let sector = 0; sector < 8; sector++) for (const elevation of elevations) {
      const camera = view(elevation, sector * Math.PI / 4), matrix = spriteCardMatrix(camera, width, height, offset);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      for (const y of [0, .25, .5, .75, 1]) for (const x of [-.5, 0, .5]) {
        const visual = point(matrix, x, y - .5).project(camera);
        const upright = origin.clone().addScaledVector(right, x * width + offset).add(new THREE.Vector3(0, y * height, 0)).project(camera);
        expect(visual.z).toBeCloseTo(upright.z, 10);
      }
    }
  });

  it('retains accurate raycast UVs for clicking a character at steep and shallow camera angles', () => {
    const root = new THREE.Group(); root.position.copy(origin);
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 16), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const card = new THREE.Mesh(geometry, material); card.matrixAutoUpdate = false; root.add(card);
    for (const elevation of elevations) {
      const camera = view(elevation);
      setSpriteBodyDepth(geometry, spriteBodyDepthAmplitude(elevation));
      spriteCardMatrix(camera, .72, 1.62, .07, card.matrix); root.updateMatrixWorld(true);
      const screen = new THREE.Vector3(.12, .3, 0).applyMatrix4(card.matrixWorld).project(camera);
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(screen.x, screen.y), camera);
      const hits = ray.intersectObject(card);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].uv!.x).toBeCloseTo(.62, 6); expect(hits[0].uv!.y).toBeCloseTo(.8, 6);
    }
    geometry.dispose(); material.dispose();
  });

  it('keeps the seated waist in front of the far counter at steep views without changing its screen position, feet or head', () => {
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 16);
    for (const elevation of [65, 80, 89.88].map(d => d * Math.PI / 180)) {
      const camera = view(elevation, Math.PI), matrix = spriteCardMatrix(camera, .72, 1.62);
      setSpriteBodyDepth(geometry, spriteBodyDepthAmplitude(elevation));
      const positions = geometry.getAttribute('position');
      // The row just below the painted stool seat/waist is the counter edge regression.
      const row = new THREE.Vector3().fromBufferAttribute(positions, 18);
      const corrected = row.clone().applyMatrix4(matrix).add(origin).project(camera);
      const flat = point(matrix, row.x, row.y).project(camera);
      const farTable = origin.clone().add(new THREE.Vector3(0, 1.035, .65)).project(camera);
      const nearTable = origin.clone().add(new THREE.Vector3(0, 1.035, -.65)).project(camera);
      expect(corrected.x).toBeCloseTo(flat.x, 9); expect(corrected.y).toBeCloseTo(flat.y, 9);
      expect(corrected.z).toBeLessThan(farTable.z);
      if (elevation < 1.4) expect(corrected.z).toBeGreaterThan(nearTable.z);
      expect(positions.getZ(0)).toBeCloseTo(0, 10);
      expect(positions.getZ(positions.count - 1)).toBeCloseTo(0, 10);
    }
    expect(spriteBodyDepthAmplitude(.7)).toBe(0);
    geometry.dispose();
  });

  it('does not change the painted direction or correction basis when the orthographic camera is panned', () => {
    const camera = view(.9), scratch = new THREE.Vector3();
    const before = cameraFacingAngle(camera, scratch), sector = spriteSector(before), matrix = spriteCardMatrix(camera, .72, 1.62).toArray();
    const target = origin.clone();
    for (const pan of [new THREE.Vector3(8, 0, -10), new THREE.Vector3(-15, 3, 7)]) {
      camera.position.add(pan); target.add(pan); camera.lookAt(target); camera.updateMatrixWorld();
      expect(cameraFacingAngle(camera, scratch)).toBeCloseTo(before, 10);
      expect(spriteSector(cameraFacingAngle(camera, scratch))).toBe(sector);
      spriteCardMatrix(camera, .72, 1.62).toArray().forEach((v, i) => expect(v).toBeCloseTo(matrix[i], 10));
    }
  });
});
