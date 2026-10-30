import {describe,it,expect} from 'vitest';
import {HOME_PLANS} from '../src/game/core/homeInterior';
import {clampHomePoint,pointInsideHome,homeRoomState,homeCameraEye} from '../src/lib/homeRoom3D';
import {createInitialState} from '../src/game/core/state';
describe('indoor camera boundaries',()=>{
  it('the apartment camera cannot move into its missing lower-right corner',()=>{
    const p=HOME_PLANS.apartment;
    expect(pointInsideHome(p,7.5,6.5)).toBe(false);
    const q=clampHomePoint(p,7.5,6.5);
    expect(pointInsideHome(p,...q)).toBe(true);
    expect(q[0]<6||q[1]<5.4).toBe(true);
  });
  it('dragging beyond every residence boundary still stays inside a real room',()=>{
    for(const p of Object.values(HOME_PLANS))for(const [x,z]of [[-999,-999],[999,999],[-20,40],[40,-20]]){
      expect(pointInsideHome(p,...clampHomePoint(p,x,z))).toBe(true);
    }
  });
  it('replacing the home save with a new game clears objects before the renderer updates',()=>{
    expect(homeRoomState(createInitialState(),HOME_PLANS.studio).objects).toEqual([]);
  });
  it('crossing internal room boundaries does not snap the camera away from the intended point',()=>{
    for(const [id,x,z]of [['apartment',4.5,2.4],['apartment',2.8,5.4],['house',6.8,3],['house',8.9,6.4]] as const){
      expect(clampHomePoint(HOME_PLANS[id],x,z,.45)).toEqual([x,z]);
    }
  });
  it('continuous floor spans keep a margin from the outer walls and L-shaped notch',()=>{
    const plan=HOME_PLANS.apartment;
    for(let x=-1;x<=10;x+=.25)for(let z=-1;z<=9;z+=.25){
      const [cx,cz]=clampHomePoint(plan,x,z,.28);
      expect(pointInsideHome(plan,cx,cz)).toBe(true);
      expect(cx>=.28-1e-8&&cx<=8.52+1e-8&&cz>=.28-1e-8&&cz<=7.12+1e-8).toBe(true);
      expect(cx<=5.72+1e-8||cz<=5.12+1e-8).toBe(true);
    }
  });
  it('orbiting near walls preserves the actual heading and the whole viewing ray stays inside the house',()=>{
    for(const plan of Object.values(HOME_PLANS))for(const anchor of Object.values(plan.anchors)){
      const target=clampHomePoint(plan,...anchor!.position,.45);
      for(let angle=-Math.PI;angle<=Math.PI;angle+=Math.PI/8){
        const eye=homeCameraEye(plan,target,angle,4.8),dx=eye[0]-target[0],dz=eye[1]-target[1];
        const delta=Math.atan2(Math.sin(Math.atan2(dx,dz)-angle),Math.cos(Math.atan2(dx,dz)-angle));
        expect(Math.abs(delta)).toBeLessThan(1e-6);
        for(let i=0;i<=20;i++)expect(pointInsideHome(plan,target[0]+dx*i/20,target[1]+dz*i/20)).toBe(true);
      }
    }
  });
});
