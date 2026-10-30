import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {addHomeCatNest} from '../src/lib/homeCatModels';
import type {HomeDecorMaterials} from '../src/lib/homeDecorModels';
function materials(){const cache=new Map<string,THREE.MeshStandardMaterial>();const color=(c:string)=>{if(!cache.has(c))cache.set(c,new THREE.MeshStandardMaterial({color:c}));return cache.get(c)!;};return {wood:color('#9b7652'),darkWood:color('#64482e'),fabric:color('#72877b'),white:color('#ffffff'),cream:color('#dfd2b9'),metal:color('#7c8080'),color} satisfies HomeDecorMaterials;}
describe('封闭猫窝的昼夜表现',()=>{
  it.each(['cat_bed_basic','cat_bed_good','cat_bed_lux'])('%s 有开放入口，白天藏身，夜里只多出双眼且不添加光源',item=>{
    const d=materials(),cat={uid:'orange-test',catId:'orange',name:'橘猫'},day=new THREE.Group(),night=new THREE.Group();
    addHomeCatNest(day,d,cat,item,false);addHomeCatNest(night,d,cat,item,true);
    const size=new THREE.Box3().setFromObject(day).getSize(new THREE.Vector3());expect(size.x).toBeLessThan(.9);expect(size.z).toBeLessThan(.85);expect(size.y).toBeLessThan(1.1);
    const lamps:THREE.Object3D[]=[];night.traverse(o=>{if(o instanceof THREE.Light)lamps.push(o);});expect(lamps).toHaveLength(0);
    expect(night.children.length-day.children.length).toBe(4);
    const eyes=night.children.slice(-4).filter(o=>o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).emissive.getHex()>0);
    expect(eyes).toHaveLength(2);
    // The front eye line must hit an eye, not a solid wall across the doorway.
    const eye=eyes[0] as THREE.Mesh,ray=new THREE.Raycaster(new THREE.Vector3(eye.position.x,eye.position.y,-2),new THREE.Vector3(0,0,1));night.updateMatrixWorld(true);
    const hit=ray.intersectObject(night,true)[0];expect(night.children.slice(-4)).toContain(hit.object);
    for(const group of [day,night])group.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});
  });
});
