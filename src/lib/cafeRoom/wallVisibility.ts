import { MathUtils, Mesh, Vector3, type Material, type Object3D } from 'three';
import {createWallTransition} from '../wallTransition';

export type CafeWallSide = 'left' | 'right' | 'back' | 'front';
const roomCenter = new Vector3(6, 1.6, 5.9);

/** Orthographic zoom changes framing, not eye distance. Keep the near plane
 * outside the whole room even when focusing a seat and orbiting behind it. */
export function cafeCameraEye(eye: Vector3, target: Vector3): Vector3 {
  const offset = eye.clone().sub(target);
  return target.clone().add(offset.setLength(Math.max(offset.length(), target.distanceTo(roomCenter) + 11)));
}

export function cafeWallOpacity(side: CafeWallSide, eye: Vector3, target: Vector3, plan: boolean): number {
  if (plan) return .065;
  const dx = eye.x - target.x, dz = eye.z - target.z, length = Math.hypot(dx, dz);
  if (length < .01) return .065;
  const facing = (side === 'left' ? -dx : side === 'right' ? dx : side === 'back' ? -dz : dz) / length;
  return MathUtils.lerp(1, .065, MathUtils.smoothstep(facing, .02, .26));
}

/** Each side owns its cloned materials. Walls and attached artwork fade as
 * whole objects; shared chair, counter and wood materials stay independent. */
export function createCafeWallFade(ownMaterial: (material: Material) => void) {
  const sides = new Map<CafeWallSide, { opacity: number; transition: ReturnType<typeof createWallTransition>; entries: { material: Material; opacity: number; transparent: boolean; depthWrite: boolean }[] }>();
  const registered = new Set<Object3D>();
  let initialized=false;
  return {
    add(side: CafeWallSide, ...roots: Object3D[]) {
      let state = sides.get(side);
      if (!state) { state = { opacity: 1, transition:createWallTransition(), entries: [] }; sides.set(side, state); }
      for (const root of roots) {
        if (registered.has(root)) continue;
        registered.add(root); root.userData.cafeWallSide = side;
        root.traverse(object => {
          if (!(object instanceof Mesh)) return;
          const clone = (source: Material) => {
            const material = source.clone(); ownMaterial(material);
            state!.entries.push({ material, opacity: source.opacity, transparent: source.transparent, depthWrite: source.depthWrite });
            return material;
          };
          object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
          // Full-height hidden walls retain room shadows independently.
          object.castShadow = false;
        });
      }
    },
    update(eye: Vector3, target: Vector3, plan: boolean, dt: number) {
      let moving = false;
      const opacity: Partial<Record<CafeWallSide, number>> = {};
      for (const [side, state] of sides) {
        const goal = cafeWallOpacity(side, eye, target, plan);
        state.opacity = state.transition.step(goal,dt,!initialized||dt>=1||(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches));
        moving ||= state.transition.moving;
        opacity[side] = state.opacity;
        for (const entry of state.entries) {
          const transparent = entry.transparent || state.opacity < .999;
          if (entry.material.transparent !== transparent) { entry.material.transparent = transparent; entry.material.needsUpdate = true; }
          entry.material.opacity = entry.opacity * state.opacity;
          entry.material.depthWrite = entry.depthWrite && state.opacity >= .999;
        }
      }
      initialized=true;return { moving, opacity };
    },
    pickable(object: Object3D) {
      for (let node: Object3D | null = object; node; node = node.parent) {
        const side = node.userData.cafeWallSide as CafeWallSide | undefined;
        if (side && (sides.get(side)?.opacity ?? 1) < .5) return false;
      }
      return true;
    },
  };
}
