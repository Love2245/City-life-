import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {batchSceneFixtures,batchSceneFixturesAsync} from '../src/lib/sceneBatching';

it('yields during large fixture preparation and preserves bounds after asynchronous merging',async()=>{
  const root=new THREE.Group(),mat=new THREE.MeshBasicMaterial(),owned:THREE.BufferGeometry[]=[];
  for(let i=0;i<180;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(.2,.3,.4),mat);mesh.position.x=i*.3;root.add(mesh);}
  const before=new THREE.Box3().setFromObject(root),checkpoint=vi.fn(async()=>{});
  expect(await batchSceneFixturesAsync(root,new Set(),g=>owned.push(g),checkpoint)).toBe(177);
  expect(checkpoint.mock.calls.length).toBeGreaterThan(180);expect(root.children).toHaveLength(3);
  const after=new THREE.Box3().setFromObject(root);expect(after.min.distanceTo(before.min)).toBeLessThan(1e-5);expect(after.max.distanceTo(before.max)).toBeLessThan(1e-5);
  owned.forEach(g=>g.dispose());mat.dispose();
});

it('reduces opaque fixture pieces while preserving interaction owners and world bounds',()=>{
  const root=new THREE.Group(),owner=new THREE.Group(),mat=new THREE.MeshStandardMaterial(),owned:THREE.BufferGeometry[]=[];owner.position.set(2,0,3);owner.rotation.y=.4;root.add(owner);
  for(let i=0;i<20;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.1,.7,.1),mat);m.position.set(i*.15,.35,0);owner.add(m);}
  const before=new THREE.Box3().setFromObject(owner);expect(batchSceneFixtures(root,new Set([owner]),g=>owned.push(g))).toBe(19);expect(root.children).toContain(owner);expect(owner.children).toHaveLength(1);
  const after=new THREE.Box3().setFromObject(owner);expect(after.min.distanceTo(before.min)).toBeLessThan(1e-6);expect(after.max.distanceTo(before.max)).toBeLessThan(1e-6);owned.forEach(g=>g.dispose());mat.dispose();
});

it('keeps glass, clipped doors, hidden stools and moving owners independent',()=>{
  const root=new THREE.Group(),door=new THREE.Group(),glass=new THREE.MeshBasicMaterial({transparent:true}),clipped=new THREE.MeshBasicMaterial({clippingPlanes:[new THREE.Plane(new THREE.Vector3(0,-1,0),.65)]});root.add(door);
  for(const material of [glass,clipped]){const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);door.add(m);}
  const before=[...door.children];batchSceneFixtures(root,new Set([door]),()=>{});expect(door.children).toEqual(before);door.visible=false;batchSceneFixtures(root,new Set([door]),()=>{});expect(door.children).toEqual(before);
});
