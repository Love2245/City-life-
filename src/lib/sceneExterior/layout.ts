import type { HomePlan, HomePoint } from '../../game/core/homeInterior';
import { homeExteriorProfile, homeGroundY } from './housingProfiles';

export type ExteriorKind = 'store' | 'cafe' | 'home';
export type ExteriorRect = [number, number, number, number];
export type ExteriorSide = 'left' | 'right' | 'back' | 'front';

/** Exterior scenery is deliberately bounded. It does not expand the indoor camera target. */
export function venueExteriorLayout(width: number, depth: number, doorCenter: number, doorWidth: number) {
  return {
    bounds: [-1.2, -1.15, width + 3.25, depth + 6.2] as ExteriorRect,
    pavement: [-.75, depth + .12, width + 2.8, 2.55] as ExteriorRect,
    road: [-1.2, depth + 2.85, width + 3.25, 2.2] as ExteriorRect,
    alley: [width + .18, -.95, 1.72, depth + 3.6] as ExteriorRect,
    backPath: [-.25, -1.1, width + 2.15, .95] as ExteriorRect,
    entry: [doorCenter - doorWidth / 2 - .18, depth + .1, doorWidth + .36, 2.56] as ExteriorRect,
  };
}

export function insideOutline(outline: readonly HomePoint[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i], b = outline[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Use the actual entry segment, including mirrored homes and recessed entrances. */
export function homeExteriorLayout(plan: HomePlan) {
  const door = plan.anchors.door?.position ?? [plan.size[0] / 2, plan.size[1]];
  let best = { a: plan.outline[0], b: plan.outline[1], center: [...door] as HomePoint, distance: Infinity };
  for (let i = 0; i < plan.outline.length; i++) {
    const a = plan.outline[i], b = plan.outline[(i + 1) % plan.outline.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((door[0] - a[0]) * dx + (door[1] - a[1]) * dz) / length2));
    const center: HomePoint = [a[0] + t * dx, a[1] + t * dz], distance = Math.hypot(center[0] - door[0], center[1] - door[1]);
    if (distance < best.distance) best = { a, b, center, distance };
  }
  const length = Math.hypot(best.b[0] - best.a[0], best.b[1] - best.a[1]);
  const tangent: HomePoint = [(best.b[0] - best.a[0]) / length, (best.b[1] - best.a[1]) / length];
  let outward: HomePoint = [-tangent[1], tangent[0]];
  if (insideOutline(plan.outline, best.center[0] + outward[0] * .2, best.center[1] + outward[1] * .2)) outward = [-outward[0], -outward[1]];
  const profile=homeExteriorProfile(plan),courtyard=profile.entry==='courtyard';
  return { ...best, length, tangent, outward, profile, courtyard, corridorWidth: courtyard ? 2.7 : profile.entry==='ground-cottage'?1.5:profile.entry==='elevator-hall'?2.45:profile.entry==='hotel-corridor'?2.1:1.8 };
}

/** Shared landing coordinates keep the corridor, supports and stairs connected. */
export function homeEntryLanding(plan: HomePlan) {
  const entry=homeExteriorLayout(plan),span=Math.min(entry.length,entry.courtyard?9.4:7.5);
  const yaw=Math.atan2(entry.outward[0],entry.outward[1]);
  const project=(p:HomePoint)=>(p[0]-entry.center[0])*Math.cos(yaw)-(p[1]-entry.center[1])*Math.sin(yaw);
  const low=Math.min(project(entry.a),project(entry.b)),high=Math.max(project(entry.a),project(entry.b));
  const shift=Math.max(low+span/2,Math.min(high-span/2,0));
  return {...entry,span,shift,yaw,groundY:homeGroundY(entry.profile)};
}
