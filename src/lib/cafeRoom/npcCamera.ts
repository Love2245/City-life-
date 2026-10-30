import { MathUtils, Vector3, type Object3D } from 'three';
import { CAFE_CAMERA_MIN_POLAR, CAFE_CAMERA_MAX_POLAR } from './layout';

export const NPC_CAMERA_ELEVATION = { min: 20 * Math.PI / 180, max: 40 * Math.PI / 180 } as const;
export type NpcCameraLimits = { minPolar: number; maxPolar: number; restricted: boolean };

/** Scene presence, including off-screen NPCs; hidden or detached objects do
 * not restrict the camera. Hidden ancestors count as absent as well. */
export function visibleInScene(object: Object3D, scene: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
    if (node === scene) return true;
  }
  return false;
}

export function sceneNpcCount(npcs: Iterable<Object3D>, scene: Object3D): number {
  let count = 0;
  for (const npc of npcs) if (visibleInScene(npc, scene)) count++;
  return count;
}

export function npcCameraLimits(count: number): NpcCameraLimits {
  return count > 0
    ? { minPolar: Math.PI / 2 - NPC_CAMERA_ELEVATION.max, maxPolar: Math.PI / 2 - NPC_CAMERA_ELEVATION.min, restricted: true }
    : { minPolar: CAFE_CAMERA_MIN_POLAR, maxPolar: CAFE_CAMERA_MAX_POLAR, restricted: false };
}

/** Clamp both current view and programmatic focus goals. Preserve horizontal
 * direction, distance and target so entering/leaving never resets the view. */
export function constrainCameraEye(eye: Vector3, target: Vector3, limits: NpcCameraLimits): Vector3 {
  const offset = eye.clone().sub(target), radius = Math.max(.001, offset.length());
  const polar = Math.acos(MathUtils.clamp(offset.y / radius, -1, 1));
  return new Vector3().setFromSphericalCoords(radius, MathUtils.clamp(polar, limits.minPolar, limits.maxPolar), Math.atan2(offset.x, offset.z)).add(target);
}
