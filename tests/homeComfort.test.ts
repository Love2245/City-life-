import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {homePlanFor} from '../src/game/core/homeInterior';
import {HOME_LOW_WALL_HEIGHT,homeWallHeight} from '../src/lib/homeWallView';
import {addHomeFixture} from '../src/lib/homeFixtureModels';
import {addHomeComputer} from '../src/lib/homeComputerModel';
import {addHomeLifeDetails} from '../src/lib/homeLifeDetails';

const material=new THREE.MeshStandardMaterial(),materials={wood:material,darkWood:material,white:material,cream:material,fabric:material,metal:material,color:()=>material};
const bounds=(o:THREE.Object3D)=>new THREE.Box3().setFromObject(o);

describe('home comfort and visibility regressions',()=>{
  it('changes the cutaway with the viewing direction, keeping the focused room boundary readable',()=>{
    const plan=homePlanFor('rental_apartment'),wall=plan.partitions.find(p=>Math.abs(p[0]-4.5)<.01&&p[0]===p[2])!;
    expect(homeWallHeight(plan,wall,[2,2],[6,2],'cutaway')).toBe(HOME_LOW_WALL_HEIGHT);
    expect(homeWallHeight(plan,wall,[2,2],[.5,2],'cutaway')).toBe(2.65);
    expect(homeWallHeight(plan,wall,[2,2],[6,2],'full')).toBe(2.65);
    expect(homeWallHeight(plan,wall,[2,2],[.5,2],'low')).toBe(HOME_LOW_WALL_HEIGHT);
  });
  it('preserves distant dividers that do not block the view',()=>{
    const plan=homePlanFor('own_villa'),wall=plan.partitions.find(p=>p[0]===11&&p[2]===11)!;
    expect(homeWallHeight(plan,wall,[3,3],[1,3],'cutaway')).toBe(2.65);
  });
  it('keeps desktop life objects clear of every computer tier',()=>{
    for(const tier of ['basic','standard','premium'] as const){
      const computer=new THREE.Group(),details=new THREE.Group();addHomeComputer(computer,materials,tier);addHomeLifeDetails(details,materials,'desk',{width:1.15,depth:.65,surfaceY:.825,level:'rich'});
      computer.updateMatrixWorld(true);details.updateMatrixWorld(true);
      for(const prop of details.children)computer.traverse(o=>{if(o instanceof THREE.Mesh)expect(bounds(prop).intersectsBox(bounds(o)),`${tier}: ${prop.name}/${o.name}`).toBe(false);});
    }
  });
  it('keeps new washroom props beside both basins and their taps',()=>{
    for(const width of [2.6,2.8]){
      const group=new THREE.Group();addHomeFixture(group,{kind:'bathVanity',position:[0,0],size:[width,.6]},materials);group.updateMatrixWorld(true);
      const props=group.children.filter(o=>o.name.startsWith('vanity-'));
      for(const prop of props)for(const x of [-width*.25,width*.25]){
        const basin=new THREE.Box3(new THREE.Vector3(x-.22,.875,-.195),new THREE.Vector3(x+.22,1.05,.125));
        expect(bounds(prop).intersectsBox(basin),`${width}: ${prop.name}`).toBe(false);
      }
    }
  });
  it('routes support furniture to the parent action and leaves floor textiles noninteractive',()=>{
    for(const [kind,owner] of [['media','sofa'],['nightstand','bed'],['sideTable','bookshelf']] as const){const group=new THREE.Group();const f=addHomeFixture(group,{kind,position:[0,0],size:[.8,.5]},materials);f.traverse(o=>expect(o.userData.kind).toBe(owner));}
    const group=new THREE.Group(),rug=addHomeFixture(group,{kind:'rug',position:[0,0],size:[2,2],decorative:true},materials);expect(rug.userData.decorative).toBe(true);rug.traverse(o=>expect(o.userData.kind).toBeUndefined());
  });
});
