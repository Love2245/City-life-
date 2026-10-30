import type { HomePlan } from '../game/core/homeInterior';
import type { HomeRoomState } from './homeRoomState';

/** Render-only changes leave the architectural and saved furniture anchors intact. */
export function homeReferencePlan(plan: HomePlan): HomePlan {
  if (!plan.openKitchen && plan.id!=='compact') return plan;
  return { ...plan,
    partitions:plan.id==='compact'?plan.partitions.filter(([x,z,x2,z2])=>!(z===5.5&&z2===5.5&&Math.abs(x2-x)<1.5)):plan.partitions,
    fixtures: plan.openKitchen?plan.fixtures?.filter(fixture => !(fixture.kind === 'counter' && Math.abs(fixture.position[0] - plan.anchors.kitchen!.position[0]) < .1)):plan.fixtures };
}

/** The longer cooker run needs clearance from the refrigerator and the corner. */
export function homeReferenceState(snapshot: HomeRoomState, plan: HomePlan): HomeRoomState {
  const shift = plan.id === 'premium' ? 1 : plan.id === 'house' ? .7 : 0;
  if (!shift) return snapshot;
  return { ...snapshot, objects: snapshot.objects.map(object => object.kind === 'kitchen'
    ? { ...object, position: [object.position[0], object.position[1] + shift] }
    : object) };
}

