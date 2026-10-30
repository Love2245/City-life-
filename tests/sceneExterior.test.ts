import { describe, it, expect } from 'vitest';
import { Box3, BoxGeometry, Mesh, MeshStandardMaterial, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homePlanFor, HOME_FORMAL_IDS } from '../src/game/core/homeInterior';
import { homeExteriorLayout, insideOutline, venueExteriorLayout } from '../src/lib/sceneExterior/layout';
import { cladExteriorBox } from '../src/lib/sceneExterior';
import { homeExteriorDistance } from '../src/lib/sceneExterior/framing';
import { centeredVenuePose } from '../src/lib/venueFraming';

describe('home exterior entries follow the actual floor plan', () => {
  for (const id of HOME_FORMAL_IDS) it(id, () => {
    const plan = homePlanFor(id), entry = homeExteriorLayout(plan), [x, z] = entry.center, [nx, nz] = entry.outward;
    expect(entry.distance).toBeLessThan(.12);
    expect(insideOutline(plan.outline, x + nx * .3, z + nz * .3)).toBe(false);
    expect(insideOutline(plan.outline, x - nx * .3, z - nz * .3)).toBe(true);
    expect(Math.hypot(...entry.outward)).toBeCloseTo(1);
    expect(entry.courtyard).toBe(['own_villa','lease_villa'].includes(id));
    expect(entry.corridorWidth).toBeLessThan(3);
  });
});

describe('facade cladding keeps inside wallpaper independent', () => {
  for (const normal of [new Vector3(1,0,0),new Vector3(-1,0,0),new Vector3(0,0,1),new Vector3(0,0,-1)]) it(`outside ${normal.toArray()}`, () => {
    const inside = new MeshStandardMaterial({color:'#abcabc'}), outside = new MeshStandardMaterial({color:'#776655'});
    const mesh = new Mesh(new BoxGeometry(8,3,.16),inside);
    cladExteriorBox(mesh,outside,normal);
    expect(mesh.material).toEqual([inside,outside]);
    expect(mesh.geometry.groups.map(g=>g.count)).toEqual([30,6]);
    const indices=mesh.geometry.index!, normals=mesh.geometry.getAttribute('normal');
    const exteriorVertices=Array.from({length:6},(_,i)=>indices.getX(i+30));
    expect(exteriorVertices.every(i=>new Vector3().fromBufferAttribute(normals,i).dot(normal)>.99)).toBe(true);
    inside.color.set('#ffffee');expect(outside.color.getHexString()).toBe('776655');
    expect(new Set(Array.from(indices.array)).size).toBe(24);
    mesh.geometry.dispose();inside.dispose();outside.dispose();
  });
});

it('venue service paths and street stay outside the playable interior', () => {
  for (const [w,d,c,door] of [[10.4,12.4,4.55,2.6],[12,11,9.8,1.8]]) {
    const lot=venueExteriorLayout(w,d,c,door);
    expect(lot.alley[0]).toBeGreaterThan(w);
    expect(lot.backPath[1]+lot.backPath[3]).toBeLessThan(0);
    expect(lot.pavement[1]).toBeGreaterThan(d);
    expect(lot.entry[0]).toBeLessThan(c-door/2);
    expect(lot.entry[0]+lot.entry[2]).toBeGreaterThan(c+door/2);
    expect(lot.road[1]-d).toBeLessThan(3);
    expect(lot.bounds[3]-d).toBeLessThan(7);
  }
});

it('the full courtyard fits both landscape and portrait views',()=>{
  const bounds=new Box3(new Vector3(-.6,-.25,-.6),new Vector3(18.6,3.1,17.8)),target:[number,number]=[9,7.8],yaw=.35;
  for(const aspect of [16/9,390/844]){
    const camera=new PerspectiveCamera(57,aspect,.08,200),distance=homeExteriorDistance(camera,bounds,target,yaw,aspect);
    camera.position.set(target[0]+Math.sin(yaw)*distance,.62+distance*.91,target[1]+Math.cos(yaw)*distance);camera.rotation.set(-Math.atan(.91),yaw,0,'YXZ');camera.updateMatrixWorld();
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new Vector3(x,y,z).project(camera);expect(Math.abs(p.x)).toBeLessThan(.88);expect(Math.abs(p.y)).toBeLessThan(.80);expect(p.z).toBeLessThan(1);}
  }
});

it('the street view centers and fits a narrow phone without changing indoor framing',()=>{
  const camera=new OrthographicCamera(-3.8,3.8,8.25,-8.25,.1,120),material=new MeshStandardMaterial();
  const ground=new Mesh(new BoxGeometry(14,.2,18),material);ground.position.set(5,.1,8);
  const eye=new Vector3(18,16,30),target=new Vector3(5.2,1,7.6),indoor=centeredVenuePose(camera,eye,target,.4,[ground]);
  expect(indoor.zoom).toBe(.4);
  const fitted=centeredVenuePose(camera,eye,target,.4,[ground],[],true);camera.position.copy(fitted.eye);camera.zoom=fitted.zoom;camera.lookAt(fitted.target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  const bounds=new Box3().setFromObject(ground);
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new Vector3(x,y,z).project(camera);expect(Math.abs(p.x)).toBeLessThanOrEqual(.90001);expect(Math.abs(p.y)).toBeLessThanOrEqual(.80001);}
  ground.geometry.dispose();material.dispose();
});

it('the shared reference kit has embedded textures and useful mobile LODs', () => {
  const directory=new URL('../src/assets/scenes/exterior/',import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL('asset-manifest.json',directory),'utf8'));
  expect(manifest.assets).toHaveLength(9);
  for(const asset of manifest.assets){
    const bytes=readFileSync(new URL(asset.file,directory));
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    const document=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
    expect(document.images.every((image:{bufferView?:number;uri?:string})=>image.bufferView!==undefined&&!image.uri)).toBe(true);
    expect(asset.size.every((n:number)=>Number.isFinite(n)&&n>0)).toBe(true);
  }
  for(const id of ['air-conditioner','street-lamp','bicycle']){
    const fine=manifest.assets.find((a:{id:string})=>a.id===id),light=manifest.assets.find((a:{id:string})=>a.id===id+'-light');
    expect(light.triangles).toBeLessThan(fine.triangles*.5);
  }
});
