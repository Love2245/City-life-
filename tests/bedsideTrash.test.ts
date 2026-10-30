import {describe,it,expect} from 'vitest';
import {HOME_SCENE_IDS,HOME_FIXED_IDS,homePlanFor,fixedHomeObjectKinds} from '../src/game/core/homeInterior';
import {homePreviewRoom,pointInsideHome} from '../src/lib/homeRoom3D';

describe('supplied bedside wastebasket',()=>{
  it.each([...HOME_SCENE_IDS])('%s has exactly one small basket beside its bed, inside the floor',id=>{
    const plan=homePlanFor(id),bed=plan.anchors.bed!,bin=plan.anchors.trash!;
    expect(bin).toBeDefined();expect(Math.hypot(bin.position[0]-bed.position[0],bin.position[1]-bed.position[1])).toBeLessThan(3.5);
    const walls=[...plan.outline.map((a,i)=>[...a,...plan.outline[(i+1)%plan.outline.length]]),...plan.partitions];
    const distances=walls.map(([ax,az,bx,bz])=>{const length=(bx-ax)**2+(bz-az)**2,t=length?Math.max(0,Math.min(1,((bin.position[0]-ax)*(bx-ax)+(bin.position[1]-az)*(bz-az))/length)):0;return Math.hypot(bin.position[0]-ax-t*(bx-ax),bin.position[1]-az-t*(bz-az));});
    expect(Math.min(...distances)).toBeCloseTo(.25,5);
    const yaw=bed.rotation??0,sideOffset=(bin.position[0]-bed.position[0])*Math.cos(yaw)-(bin.position[1]-bed.position[1])*Math.sin(yaw);
    expect(Math.abs(sideOffset)).toBeGreaterThanOrEqual(1.55*(bed.scale?.[0]??1)/2+.2);
    for(const f of plan.fixtures??[])if(f.kind==='nightstand'){
      const dx=bin.position[0]-f.position[0],dz=bin.position[1]-f.position[1];
      expect(Math.abs(dx*Math.cos(yaw)-dz*Math.sin(yaw))<f.size[0]/2+.25&&dx*Math.sin(yaw)+dz*Math.cos(yaw)<f.size[1]/2+.2).toBe(false);
    }
    for(const {rect:[x,z,w,d]} of plan.passages??[])expect(bin.position[0]+.2>x&&bin.position[0]-.2<x+w&&bin.position[1]+.2>z&&bin.position[1]-.2<z+d).toBe(false);
    for(const dx of [-.2,.2])for(const dz of [-.2,.2])expect(pointInsideHome(plan,bin.position[0]+dx,bin.position[1]+dz)).toBe(true);
    for(const full of [false,true]){const state=homePreviewRoom(plan,full,10);expect(state.objects.filter(o=>o.kind==='trash')).toHaveLength(1);expect(state.objects.find(o=>o.kind==='trash')?.item).toBeUndefined();}
    if(HOME_FIXED_IDS.has(id))expect(fixedHomeObjectKinds(id)).toContain('trash');
  });
  it('the mirrored cottage retains the matching bedside position and has no layout upgrade',()=>{
    const original=homePlanFor('old_apartment'),mirror=homePlanFor('suburb_room');
    expect(mirror.anchors.trash!.position[0]).toBeCloseTo(mirror.size[0]-original.anchors.trash!.position[0]);
    expect(mirror.anchors.trash!.position[1]).toBe(original.anchors.trash!.position[1]);
    expect(original.anchors.trash!.alternatives).toBeUndefined();expect(fixedHomeObjectKinds('invalid')).toEqual([]);
  });
});
