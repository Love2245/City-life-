import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {HOME_TOUR_RESIDENCES,homePlanFor} from '../src/game/core/homeInterior';
import {addHomeLifeDetails} from '../src/lib/homeLifeDetails';
import {addHomeFixture} from '../src/lib/homeFixtureModels';
import {addHomeKitchen,addHomeSofa,addHomeFridge} from '../src/lib/homeFurnishingModels';
import {addHomeFoodModel,type HomeFoodModel} from '../src/lib/homeFoodModels';
import type {HomeDecorMaterials} from '../src/lib/homeDecorModels';

const mat=new THREE.MeshStandardMaterial();
const m:HomeDecorMaterials={wood:mat,darkWood:mat,white:mat,cream:mat,metal:mat,fabric:mat,palette:new THREE.MeshStandardMaterial({vertexColors:true}),color:()=>mat};
const box=(o:THREE.Object3D)=>new THREE.Box3().setFromObject(o);
function down(root:THREE.Object3D,x:number,z:number,startY=3){root.updateMatrixWorld(true);return new THREE.Raycaster(new THREE.Vector3(x,startY,z),new THREE.Vector3(0,-1,0)).intersectObject(root,true)[0];}
function distanceToSurface(mesh:THREE.Mesh,point:THREE.Vector3){
  const p=mesh.geometry.getAttribute('position'),indices=mesh.geometry.index,triangle=new THREE.Triangle(),closest=new THREE.Vector3();let result=Infinity;
  for(let i=0;i<(indices?.count??p.count);i+=3){const ids=[i,i+1,i+2].map(i=>indices?indices.getX(i):i);triangle.set(...ids.map(i=>new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld)) as [THREE.Vector3,THREE.Vector3,THREE.Vector3]);if(triangle.getArea()<1e-12)continue;triangle.closestPointToPoint(point,closest);result=Math.min(result,point.distanceTo(closest));}
  return result;
}
describe('visible home prop structures',()=>{
  it('joins both handle roots to each cup wall and leaves a visible recessed drink',()=>{
    for(const [kind,prefix,w,d,y]of [['dining','dining-cup',2.6,1.2,.805],['coffee','coffee-table-cup',1.5,.8,.475],['bedside','bedside-water-cup',.62,.55,.565]] as const){
      const g=new THREE.Group();addHomeLifeDetails(g,m,kind,{width:w,depth:d,surfaceY:y,level:'rich'});g.updateMatrixWorld(true);
      const body=g.getObjectByName(`${prefix}-body`) as THREE.Mesh,handle=g.getObjectByName(`${prefix}-handle`) as THREE.Mesh<THREE.TubeGeometry>,drink=g.getObjectByName(`${prefix}-tea`)!;
      expect(box(body).intersectsBox(box(handle)),kind).toBe(true);
      for(const end of [0,1]){const center=handle.geometry.parameters.path.getPointAt(end).applyMatrix4(handle.matrixWorld);expect(distanceToSurface(body,center),`${kind} handle root ${end}`).toBeLessThan(handle.geometry.parameters.radius);}
      const center=box(body).getCenter(new THREE.Vector3()),hit=down(g,center.x,center.z);
      expect(hit.object,kind).toBe(drink);expect(box(body).max.y-hit.point.y).toBeGreaterThan(.008);
    }
  });
  it('keeps the plate centre below its rim, with the cup resting on its saucer',()=>{
    const g=new THREE.Group();addHomeLifeDetails(g,m,'dining',{width:2.6,depth:1.2,surfaceY:.805});g.updateMatrixWorld(true);
    const plate=g.getObjectByName('dining-plate')!,bounds=box(plate),c=bounds.getCenter(new THREE.Vector3()),centre=down(plate,c.x,c.z);
    expect(bounds.max.y-centre.point.y).toBeGreaterThan(.008);
    const cup=box(g.getObjectByName('dining-cup-body')!),saucer=g.getObjectByName('dining-cup-saucer')!,support=down(saucer,cup.getCenter(new THREE.Vector3()).x,cup.getCenter(new THREE.Vector3()).z);
    expect(cup.min.y-support.point.y).toBeGreaterThanOrEqual(0);expect(cup.min.y-support.point.y).toBeLessThan(.003);
  });
  it('opens a genuine sink hole through each kitchen worktop',()=>{
    const sill=new THREE.Box3(new THREE.Vector3(-1,.9825,-.375),new THREE.Vector3(1,1.0375,-.125));
    for(const level of ['basic','standard','premium'] as const){const g=new THREE.Group();addHomeKitchen(g,m,level);const sink=down(g,-.30,-.05,1.0),counter=down(g,-.54,0);expect(sink.object.name).toBe('kitchen-sink-drain');expect(sink.point.y).toBeLessThan(.84);expect(counter.object.name).toBe('kitchen-worktop');expect(counter.point.y).toBeGreaterThan(.92);g.traverse(o=>{if(o instanceof THREE.Mesh)expect(box(o).intersectsBox(sill),`${level}/${o.name} intersects sill`).toBe(false);});}
  });
  it('leaves the washbasins and bathtub open above their inner floor',()=>{
    const p=new THREE.Group();const vanity=addHomeFixture(p,{kind:'bathVanity',position:[0,0],size:[2.6,.6]},m),tub=addHomeFixture(p,{kind:'bathTub',position:[0,0],size:[2.2,1.15]},m);
    const basinHit=down(vanity,-.65,-.005,1.0);expect(basinHit.object.name).toContain('drain');expect(basinHit.point.y).toBeLessThan(.91);
    const tubHit=down(tub,0,0);expect(tubHit.object.name).toBe('bathtub-shell');expect(tubHit.point.y).toBeCloseTo(.18,3);expect(box(tub.getObjectByName('bathtub-shell')!).max.y-tubHit.point.y).toBeGreaterThan(.3);
  });
  it('keeps the adopted meshes uniformly scaled and on the local surface of a transformed parent',()=>{
    const ids:HomeFoodModel[]=['utensil-fork','utensil-knife','utensil-spoon','cutting-board','cooking-knife','bottle-oil'];
    const parent=new THREE.Group();parent.position.set(10,0,12);parent.rotation.y=Math.PI/2;parent.updateMatrixWorld(true);
    for(const id of ids){const prop=addHomeFoodModel(parent,m,id,id,{x:.2,z:.1,surfaceY:.94,width:.3,depth:.4,height:.25,rotation:.3});expect(prop.scale.x).toBe(prop.scale.y);expect(prop.scale.y).toBe(prop.scale.z);const b=box(prop);expect(b.min.y).toBeCloseTo(.942,6);const local=parent.worldToLocal(b.getCenter(new THREE.Vector3()));expect(local.x).toBeCloseTo(.2,5);expect(local.z).toBeCloseTo(.1,5);}
  });
  it('keeps small items on their actual furniture tops across every formal home',()=>{
    for(const home of HOME_TOUR_RESIDENCES){const plan=homePlanFor(home.id);for(const f of plan.fixtures??[]){const root=addHomeFixture(new THREE.Group(),{...f,position:[0,0],rotation:0},m);root.updateMatrixWorld(true);root.traverse(o=>{if(!o.userData.homeFoodModel)return;const b=box(o);expect(b.min.x,`${home.id}/${f.kind}/${o.name}`).toBeGreaterThanOrEqual(-f.size[0]/2-.001);expect(b.max.x).toBeLessThanOrEqual(f.size[0]/2+.001);expect(b.min.z).toBeGreaterThanOrEqual(-f.size[1]/2-.001);expect(b.max.z).toBeLessThanOrEqual(f.size[1]/2+.001);});}}
  });
  it('puts sofa feet on the floor and keeps all fridge tiers within the existing footprint',()=>{
    const sofa=new THREE.Group();addHomeSofa(sofa,m);expect(box(sofa).min.y).toBeCloseTo(0,6);
    for(const [h,w]of [[1,.62],[1.55,.62],[1.85,.84]]){const fridge=new THREE.Group();addHomeFridge(fridge,m,h,w);const b=box(fridge);expect(b.min.y).toBeCloseTo(0,6);expect(b.max.y).toBeCloseTo(h,6);expect(b.max.x-b.min.x).toBeCloseTo(w,6);expect(b.max.z).toBeLessThan(.41);}
  });
});
