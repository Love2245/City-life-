import {describe,expect,it} from 'vitest';
import {Group,Mesh,BoxGeometry,MeshBasicMaterial,Vector3} from 'three';
import actions from '../src/game/data/actions.json';
import type {ActionDef} from '../src/game/types';
import {STORE_FACILITIES,storeProductFacility,createStoreFacilityRegistry,isConvenienceStore} from '../src/lib/convenienceStore/facilities';
import {createCafeFacilityRegistry} from '../src/lib/cafeRoom/facilities';
import {isFacilityProduct} from '../src/game/core/facilityShopping';
describe('physical store catalog',()=>{
  it.each(['convenience_store','boyue_convenience_store'])('places every real product into exactly one display in %s',location=>{
    const products=(actions as unknown as ActionDef[]).filter(a=>a.locationId===location&&isFacilityProduct(a));expect(products).toHaveLength(11);
    const items=(facility:string)=>products.filter(a=>storeProductFacility(a)===facility).map(a=>a.itemId).sort();
    expect(items('fresh')).toEqual(['bento','salad','sandwich']);expect(items('drinks')).toEqual(['drink','energy_drink']);expect(items('noodles')).toEqual(['noodles']);expect(items('seasoning')).toEqual(['chili_powder','salad_dressing','salt','soy_sauce','sugar']);
    expect(products.every(a=>!!STORE_FACILITIES[storeProductFacility(a)!].category)).toBe(true);
    expect(products.every(a=>storeProductFacility(a)!=='checkout')).toBe(true);
    expect(storeProductFacility((actions as unknown as ActionDef[]).find(a=>a.locationId===location&&a.handler==='blind_box')!)).toBeUndefined();
    expect(isConvenienceStore(location)).toBe(true);expect(isConvenienceStore('market')).toBe(false);
  });
  it('resolves a clicked mesh to its enclosing facility without letting nested decoration steal the outline',()=>{
    for(const [registry,baseId,nestedId] of [[createStoreFacilityRegistry(),'checkout','fresh'],[createCafeFacilityRegistry(),'counter','coffee']] as const){
      const counter=new Group(),equipment=new Group(),mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial());counter.add(equipment);equipment.add(mesh);
      (registry.add as Function)(baseId,counter,[mesh],new Vector3(4,1,2));expect(registry.resolve(mesh)).toMatchObject({object:counter,outline:[mesh]});expect(registry.anchor(counter).toArray()).toEqual([4,1,2]);
      (registry.add as Function)(nestedId,equipment);expect(registry.resolve(mesh).object).toBe(equipment);equipment.visible=false;expect((registry.find as Function)(nestedId,(o:Group)=>o.visible)).toBeUndefined();mesh.geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();
    }
  });
  it('retains decorative meshes but excludes their labels, selection and nested fallback to a counter',()=>{
    for(const [registry,base,ids] of [[createStoreFacilityRegistry(),'checkout',['service','notice','baskets']],[createCafeFacilityRegistry(),'counter',['service','notice','community','window']]] as const){
      const counter=new Group();(registry.add as Function)(base,counter);
      for(const id of ids){const decoration=new Group(),mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial());decoration.add(mesh);counter.add(decoration);(registry.add as Function)(id,decoration);
        expect(registry.roots()).toContain(decoration);expect(mesh.parent).toBe(decoration);expect((registry.find as Function)(id,()=>true)).toBeUndefined();expect(registry.resolve(mesh)).toBeUndefined();mesh.geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();}
    }
  });
});
