import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { describe, expect, it } from 'vitest';
import { CAFE_ZONES, CAFE_PLAN_VIEW, CAFE_CAMERA_MIN_POLAR, CAFE_CAMERA_MAX_POLAR } from '../previews/cafe/layout';
import { NPC_CAMERA_ELEVATION, npcCameraLimits, constrainCameraEye, sceneNpcCount, visibleInScene } from '../previews/cafe/npcCamera';

const applyLimits = (controls: OrbitControls, count: number) => {
  const limits = npcCameraLimits(count);
  controls.minPolarAngle = limits.minPolar; controls.maxPolarAngle = limits.maxPolar;
  controls.update();
  return limits;
};

describe('cafe camera limits follow actual NPC presence', () => {
  it('counts connected visible NPCs regardless of focus, and excludes hidden parents and removed NPCs', () => {
    const scene = new THREE.Scene(), room = new THREE.Group(), one = new THREE.Group(), two = new THREE.Group();
    scene.add(room); room.add(one, two);
    const npcs = new Set([one, two]);
    one.position.set(1000, 0, -1000); // Off-screen is still in the scene.
    expect(sceneNpcCount(npcs, scene)).toBe(2);
    one.visible = false; expect(sceneNpcCount(npcs, scene)).toBe(1);
    room.visible = false; expect(sceneNpcCount(npcs, scene)).toBe(0);
    room.visible = true; room.remove(two); expect(sceneNpcCount(npcs, scene)).toBe(0);
    expect(visibleInScene(two, scene)).toBe(false);
    const child = new THREE.Mesh(); one.add(child);
    expect(visibleInScene(child, scene)).toBe(false);
  });

  it('allows continuous vertical orbiting within the occupied range, with horizontal rotation preserved', () => {
    const camera = new THREE.OrthographicCamera(), controls = new OrbitControls(camera);
    camera.position.set(4, 3, 6); applyLimits(controls, 1);
    for (const degrees of [0, 10, 20, 27, 35, 40, 65, 89.9]) {
      camera.position.setFromSphericalCoords(12, Math.PI / 2 - degrees * Math.PI / 180, 1.1); controls.update();
      const elevation = Math.PI / 2 - controls.getPolarAngle();
      expect(elevation).toBeCloseTo(THREE.MathUtils.clamp(degrees * Math.PI / 180, NPC_CAMERA_ELEVATION.min, NPC_CAMERA_ELEVATION.max), 10);
      expect(controls.getAzimuthalAngle()).toBeCloseTo(1.1, 10);
    }
    expect(controls.minPolarAngle).toBeLessThan(controls.maxPolarAngle);
    expect(npcCameraLimits(2)).toEqual(npcCameraLimits(1));
  });

  it('restores the full original range when the last NPC leaves', () => {
    const scene = new THREE.Scene(), npc = new THREE.Group(), camera = new THREE.OrthographicCamera(), controls = new OrbitControls(camera);
    scene.add(npc); camera.position.set(2, 5, 6);
    expect(applyLimits(controls, sceneNpcCount([npc], scene)).restricted).toBe(true);
    scene.remove(npc);
    expect(applyLimits(controls, sceneNpcCount([npc], scene)).restricted).toBe(false);
    expect(controls.minPolarAngle).toBe(CAFE_CAMERA_MIN_POLAR); expect(controls.maxPolarAngle).toBe(CAFE_CAMERA_MAX_POLAR);
    for (const polar of [CAFE_CAMERA_MIN_POLAR, .2, .8, CAFE_CAMERA_MAX_POLAR]) {
      camera.position.setFromSphericalCoords(12, polar, 1.1); controls.update();
      expect(controls.getPolarAngle()).toBeCloseTo(polar, 10);
    }
  });

  it('constrains region and overview focus goals to reachable angles while preserving target, distance and yaw', () => {
    for (const count of [0, 1]) for (const preset of [...Object.values(CAFE_ZONES), CAFE_PLAN_VIEW]) {
      const camera = new THREE.OrthographicCamera(), controls = new OrbitControls(camera), limits = npcCameraLimits(count);
      const eye = new THREE.Vector3(...preset.eye), target = new THREE.Vector3(...preset.target), before = eye.clone().sub(target);
      const fitted = constrainCameraEye(eye, target, limits), after = fitted.clone().sub(target);
      expect(after.length()).toBeCloseTo(before.length(), 10);
      expect(Math.atan2(after.x, after.z)).toBeCloseTo(Math.atan2(before.x, before.z), 10);
      expect(eye.toArray()).toEqual([...preset.eye]); expect(target.toArray()).toEqual([...preset.target]);
      camera.position.copy(fitted); controls.target.copy(target); applyLimits(controls, count);
      expect(camera.position.distanceTo(fitted)).toBeLessThan(1e-8);
    }
  });

  it('immediately brings an empty overhead view and its pending goal into range when an NPC arrives', () => {
    const camera = new THREE.OrthographicCamera(), controls = new OrbitControls(camera), limits = npcCameraLimits(1);
    const target = new THREE.Vector3(...CAFE_PLAN_VIEW.target), emptyEye = new THREE.Vector3(...CAFE_PLAN_VIEW.eye);
    const occupiedEye = constrainCameraEye(emptyEye, target, limits);
    camera.position.copy(occupiedEye); controls.target.copy(target); applyLimits(controls, 1);
    expect(Math.PI / 2 - controls.getPolarAngle()).toBeCloseTo(NPC_CAMERA_ELEVATION.max, 10);
    const pendingGoal = constrainCameraEye(emptyEye, target, limits);
    expect(camera.position.distanceTo(pendingGoal)).toBeLessThan(1e-8);
    expect(occupiedEye.distanceTo(target)).toBeCloseTo(emptyEye.distanceTo(target), 10);
  });
});
