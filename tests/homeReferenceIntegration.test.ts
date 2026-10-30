import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { homePlanFor, HOME_FORMAL_IDS, HOME_FIXED_IDS } from '../src/game/core/homeInterior';
import { homePreviewRoom, pointInsideHome, type HomeRoomObject } from '../src/lib/homeRoom3D';
import { createHomeReferenceVisuals, homeReferencePlan, homeReferenceState } from '../src/lib/homeReferenceVisuals';
import { prepareHomeVisualModel, type HomeRoomVisuals, type HomeVisualModel } from '../src/lib/homeVisualModels';
import {addHomeBookcase,type HomeDecorMaterials} from '../src/lib/homeDecorModels';
import {addHomeFixture} from '../src/lib/homeFixtureModels';

const manifest = JSON.parse(readFileSync(new URL('../src/assets/home/v1.49/reference/asset-manifest.json', import.meta.url), 'utf8'));
function modelBounds(spec: HomeVisualModel, object?: HomeRoomObject) {
  const size = manifest.models.find((model: { id: string }) => model.id === spec.id).size as [number, number, number];
  const template = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial());
  const prepared = prepareHomeVisualModel(template, spec)!;
  const group = new THREE.Group(); group.add(prepared.model);
  if (object) {
    group.position.set(object.position[0], 0, object.position[1]); group.rotation.y = object.rotation ?? 0;
    if (object.scale) group.scale.set(...object.scale);
    if (object.mirrorX) group.scale.x *= -1;
  }
  const bounds = new THREE.Box3().setFromObject(group);
  template.geometry.dispose(); (template.material as THREE.Material).dispose();
  return bounds;
}
function additions(visuals: HomeRoomVisuals, objects: HomeRoomObject[]) {
  return typeof visuals.additions === 'function' ? visuals.additions(objects) : visuals.additions ?? [];
}
describe('accepted furniture in actual residence plans', () => {
  it('keeps guest bookcases clear of bathroom walls and washbasins clear of bathroom entrances',()=>{
    const material=new THREE.MeshStandardMaterial(),m:HomeDecorMaterials={wood:material,darkWood:material,fabric:material,white:material,cream:material,metal:material,color:()=>material};
    for(const id of HOME_FIXED_IDS){
      const plan=homePlanFor(id),bath=plan.rooms.find(r=>r.type==='bath')!,root=new THREE.Group();
      const shelf=plan.anchors.bookshelf;
      if(shelf){
        const group=new THREE.Group();addHomeBookcase(group,m);group.position.set(shelf.position[0],0,shelf.position[1]);group.rotation.y=shelf.rotation??0;root.add(group);
        const bounds=new THREE.Box3().setFromObject(group);
        expect(bounds.max.x,`${id}: bookcase penetrates bathroom wall`).toBeLessThan(bath.rect[0]-.10);
        expect(bounds.min.z,`${id}: bookcase penetrates back wall`).toBeGreaterThan(.10);
      }
      const vanity=plan.fixtures!.find(f=>f.kind==='bathVanity')!,group=addHomeFixture(root,vanity,m),bounds=new THREE.Box3().setFromObject(group);
      expect(bounds.max.z,`${id}: basin blocks bathroom entrance`).toBeLessThan(bath.rect[1]+bath.rect[3]-.50);
      // A person facing the basin stands in the bathroom, away from the wall.
      const approach=new THREE.Vector3(0,0,.70).applyAxisAngle(new THREE.Vector3(0,1,0),vanity.rotation??0);
      approach.add(new THREE.Vector3(vanity.position[0],0,vanity.position[1]));
      expect(approach.x).toBeGreaterThan(bath.rect[0]+.15);expect(approach.x).toBeLessThan(bath.rect[0]+bath.rect[2]-.15);
      expect(approach.z).toBeLessThan(bath.rect[1]+bath.rect[3]-.15);
      root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});
    }
    material.dispose();
  });
  it.each(['rental_apartment','boyue_talent_apartment','own_old_unit'])('%s keeps the washing machine off bathroom approaches and opens into the dry utility area',id=>{
    const plan=homePlanFor(id),visuals=createHomeReferenceVisuals(plan),snapshot=homePreviewRoom(plan,true,12);
    const extras=additions(visuals,snapshot.objects),washer=extras.find(a=>a.model.id==='washing-machine')!,utility=plan.rooms.find(r=>r.type==='kitchen')!;
    const bounds=modelBounds(washer.model,{kind:'shower',position:washer.position,rotation:washer.rotation});
    const shower=plan.anchors.shower!,exit=new THREE.Box3(new THREE.Vector3(shower.position[0]-.435,0,shower.position[1]+.435),new THREE.Vector3(shower.position[0]+.435,2,shower.position[1]+1.085));
    expect(bounds.intersectsBox(exit)).toBe(false);
    const toilet=extras.find(a=>a.model.id==='toilet')!,toiletBounds=modelBounds(toilet.model,{kind:'shower',position:toilet.position,rotation:toilet.rotation});
    const toiletApproach=new THREE.Box3(new THREE.Vector3(toiletBounds.min.x,0,toiletBounds.max.z),new THREE.Vector3(toiletBounds.max.x,2,toiletBounds.max.z+.65));
    expect(bounds.intersectsBox(toiletApproach)).toBe(false);
    const kitchen=snapshot.objects.find(o=>o.kind==='kitchen')!,cooker=modelBounds(visuals.objects!.kitchen as HomeVisualModel,kitchen);
    expect(Math.max(cooker.min.x-bounds.max.x,bounds.min.x-cooker.max.x)).toBeGreaterThanOrEqual(.75);
    const approach=new THREE.Vector3(0,0,.75).applyAxisAngle(new THREE.Vector3(0,1,0),washer.rotation??0).add(new THREE.Vector3(washer.position[0],0,washer.position[1]));
    expect(approach.x).toBeGreaterThan(utility.rect[0]+.10);expect(approach.x).toBeLessThan(utility.rect[0]+utility.rect[2]-.10);
    expect(approach.z).toBeGreaterThan(utility.rect[1]+.10);expect(approach.z).toBeLessThan(utility.rect[1]+utility.rect[3]-.10);
    visuals.environment!.dispose();
  });
  it('keeps the microwave clear of the cutting board and knife on both large kitchen counters', () => {
    for(const id of ['own_apartment','own_villa']){
      const plan=homeReferencePlan(homePlanFor(id)), visuals=createHomeReferenceVisuals(plan);
      const snapshot=homeReferenceState(homePreviewRoom(plan,true,12),plan);
      const microwave=additions(visuals,snapshot.objects).find(extra=>extra.model.id==='microwave')!;
      const counter=plan.fixtures!.find(f=>f.kind==='counter'&&f.size[0]>=2)!;
      expect(microwave).toBeDefined();expect(counter).toBeDefined();
      expect(microwave.position).toEqual(counter.position);
      const boardDistance=counter.size[0]*.19, boardHalfWidth=Math.min(.34,counter.size[0]*.43)/2;
      expect(boardDistance-.52/2-boardHalfWidth).toBeGreaterThan(.03);
      visuals.environment!.dispose();
    }
  });
  it('keeps every architecture and saved layout unchanged, applying the longer kitchen only once per snapshot', () => {
    for (const id of HOME_FORMAL_IDS) {
      const plan = homePlanFor(id), before = JSON.stringify(plan), snapshot = homePreviewRoom(plan, true, 12), old = JSON.stringify(snapshot);
      const displayPlan = homeReferencePlan(plan), display = homeReferenceState(snapshot, displayPlan);
      expect(JSON.stringify(plan)).toBe(before); expect(JSON.stringify(snapshot)).toBe(old);
      expect(display.objects.map(object => object.kind)).toEqual(snapshot.objects.map(object => object.kind));
      expect(displayPlan.anchors).toBe(plan.anchors);
      if (plan.openKitchen) {
        const kitchen = display.objects.find(object => object.kind === 'kitchen')!, fridge = display.objects.find(object => object.kind === 'fridge')!;
        const visuals = createHomeReferenceVisuals(displayPlan);
        const cooker = modelBounds(visuals.objects!.kitchen as HomeVisualModel, kitchen);
        expect(cooker.min.z).toBeGreaterThan(fridge.position[1] + .42);
        expect(displayPlan.fixtures!.filter(fixture => fixture.kind === 'counter')).toHaveLength(1);
        visuals.environment!.dispose();
      } else expect(display).toBe(snapshot);
    }
  });
  it('fits added bathroom and entry pieces inside every floor and away from door approaches', () => {
    for (const id of HOME_FORMAL_IDS) {
      const plan = homeReferencePlan(homePlanFor(id)), snapshot = homeReferenceState(homePreviewRoom(plan, true, 12), plan), visuals = createHomeReferenceVisuals(plan);
      for (const extra of additions(visuals, snapshot.objects).filter(extra => !extra.attachToOwner && extra.model.id !== 'tissue-box')) {
        const bounds = modelBounds(extra.model, { kind: extra.owner!, position: extra.position, rotation: extra.rotation });
        const corners = [[bounds.min.x, bounds.min.z], [bounds.max.x, bounds.min.z], [bounds.min.x, bounds.max.z], [bounds.max.x, bounds.max.z]];
        for (const [x, z] of corners) expect(pointInsideHome(plan, x, z), `${id}: ${extra.model.id} outside floor`).toBe(true);
        for (const passage of plan.passages ?? []) {
          const [x, z, width, depth] = passage.rect;
          const overlap = Math.min(bounds.max.x, x + width) - Math.max(bounds.min.x, x) > .01
            && Math.min(bounds.max.z, z + depth) - Math.max(bounds.min.z, z) > .01;
          expect(overlap, `${id}: ${extra.model.id} blocks ${passage.name}`).toBe(false);
        }
      }
      if (plan.id === 'studio') expect(additions(visuals, snapshot.objects).map(extra => extra.model.id)).not.toContain('washing-machine');
      visuals.environment!.dispose();
    }
  });
  it('keeps paid appliance ownership and movable sofa details tied to the actual furniture', () => {
    const plan = homeReferencePlan(homePlanFor('own_apartment')), visuals = createHomeReferenceVisuals(plan);
    const bare = homePreviewRoom(plan, false, 12), furnished = homePreviewRoom(plan, true, 12);
    expect(additions(visuals, bare.objects).some(extra => extra.model.id === 'microwave')).toBe(false);
    expect(additions(visuals, furnished.objects).some(extra => extra.model.id === 'microwave')).toBe(true);
    const small = createHomeReferenceVisuals(homePlanFor('rental_apartment'));
    const tissue = additions(small, furnished.objects).find(extra => extra.model.id === 'tissue-box')!;
    expect(tissue).toMatchObject({ owner: 'sofa', attachToOwner: true, position: [0, 1.12] });
    const bed = visuals.objects!.bed;
    expect(typeof bed).toBe('function');
    if (typeof bed === 'function') expect(bed({kind:'bed',position:[0,0],item:'bed_standard'})!.materialColors)
      .not.toEqual(bed({kind:'bed',position:[0,0],item:'bed_premium'})!.materialColors);
    visuals.environment!.dispose(); small.environment!.dispose();
  });
  it('uses curtains only in living spaces and keeps a lighter rendering profile on mobile', () => {
    const plan = homePlanFor('own_villa'), pc = createHomeReferenceVisuals(plan), mobile = createHomeReferenceVisuals(plan, 'mobile');
    for (const window of plan.windows) {
      const room = plan.rooms.find(room => room.name === window.room)!;
      expect((pc.windows!(window) as HomeVisualModel[]).length).toBe(['bath', 'kitchen'].includes(room.type) ? 0 : 3);
    }
    expect(pc.contactShadows).toBe(true); expect(mobile.contactShadows).toBe(false);
    expect(pc.pixelRatioCap).toBeGreaterThan(mobile.pixelRatioCap!);
    pc.environment!.dispose(); mobile.environment!.dispose();
  });
});
