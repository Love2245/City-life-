import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {addHomeComputer,fitHomeModelToFootprint,prepareHomeMonitorSurface,addHomeModelKeyboardKeycaps} from '../src/lib/homeComputerModel';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {addHomeQuilt} from '../src/lib/homeDecorModels';
import {addBedTierDetails} from '../src/lib/homeFurnitureTierDetails';

const material=new THREE.MeshStandardMaterial(),materials={wood:material,darkWood:material,white:material,cream:material,fabric:material,metal:material,color:()=>material};
const bounds=(o:THREE.Object3D)=>new THREE.Box3().setFromObject(o);
describe('home model clearances from player screenshots',()=>{
  async function sourceModel(name:string){const data=readFileSync(new URL(`../src/assets/home/v1.49/models/${name}.glb`,import.meta.url));return(await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'')).scene;}
  it('maps the real imported monitor face to the complete screen image without changing its template',async()=>{
    const template=await sourceModel('computerScreen'),clone=template.clone(true);
    let original:THREE.Mesh|undefined;template.traverse(o=>{if(o instanceof THREE.Mesh&&!Array.isArray(o.material)&&o.material.name==='metal')original=o;});
    const originalUV=Array.from(original!.geometry.getAttribute('uv').array);prepareHomeMonitorSurface(clone);
    let surface:THREE.Mesh|undefined;clone.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.homeGenerated)surface=o;});
    expect(surface).toBeDefined();expect(surface!.geometry).not.toBe(original!.geometry);
    const uv=surface!.geometry.getAttribute('uv'),index=surface!.geometry.index!,points=Array.from({length:index.count},(_,i)=>[uv.getX(index.getX(i)),uv.getY(index.getX(i))]);
    expect(Math.min(...points.map(p=>p[0]))).toBeCloseTo(0);expect(Math.max(...points.map(p=>p[0]))).toBeCloseTo(1);
    expect(Math.min(...points.map(p=>p[1]))).toBeCloseTo(0);expect(Math.max(...points.map(p=>p[1]))).toBeCloseTo(1);
    expect(Array.from(original!.geometry.getAttribute('uv').array)).toEqual(originalUV);
  });
  it('adds raised keys on the real keyboard while keeping it on the desk',async()=>{
    const keyboard=await sourceModel('computerKeyboard');addHomeModelKeyboardKeycaps(keyboard,material);
    const keys:THREE.Mesh[]=[];keyboard.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.homeGenerated)keys.push(o);});
    expect(keys.length).toBe(48);expect(keyboard.getObjectByName('computer-spacebar')).toBeDefined();
    fitHomeModelToFootprint(keyboard,{centerX:-.065,centerZ:.205,baseY:.827,maxWidth:.39,maxHeight:.04,maxDepth:.16});
    const b=bounds(keyboard);expect(b.min.y).toBeCloseTo(.827);expect(b.max.y).toBeLessThanOrEqual(.8670001);expect(b.max.z).toBeLessThan(.326);
  });
  it('uniformly fits a loaded desk model to the authored monitor footprint',()=>{
    const model=new THREE.Mesh(new THREE.BoxGeometry(.4,.3,.1),material);
    const fitted=fitHomeModelToFootprint(model,{centerX:-.075,centerZ:-.02,baseY:.827,maxWidth:.64,maxHeight:.46,maxDepth:.18});
    expect(fitted).toBeDefined();expect(model.scale.x).toBeCloseTo(model.scale.y,8);expect(model.scale.y).toBeCloseTo(model.scale.z,8);
    expect(fitted!.min.x).toBeCloseTo(-.075-.4*model.scale.x/2,8);expect(fitted!.max.x).toBeLessThan(-.075+.64/2+1e-8);
    expect(fitted!.min.y).toBeCloseTo(.827,8);expect(fitted!.max.y).toBeLessThanOrEqual(.827+.46+1e-8);
    expect(fitted!.min.z).toBeCloseTo(-.02-.1*model.scale.z/2,8);expect(fitted!.max.z).toBeLessThanOrEqual(-.02+.18/2+1e-8);
  });
  it('keeps all three computers on the desktop and clear of the nearest window sill',()=>{
    const sill=new THREE.Box3(new THREE.Vector3(-1,.9825,-.375),new THREE.Vector3(1,1.0375,-.125));
    for(const tier of ['basic','standard','premium'] as const){const g=new THREE.Group();addHomeComputer(g,materials,tier);g.updateMatrixWorld(true);const b=bounds(g);expect(b.min.x).toBeGreaterThan(-.575);expect(b.max.x).toBeLessThan(.575);expect(b.min.y).toBeGreaterThan(.825);expect(b.min.z).toBeGreaterThan(-.325);expect(b.max.z).toBeLessThan(.325);
      g.traverse(o=>{if(o instanceof THREE.Mesh)expect(bounds(o).intersectsBox(sill),`${tier}: ${o.name} intersects the sill`).toBe(false);});
    }
  });
  it('places the mouse pad under the mouse with clearance from the keyboard and case',()=>{
    for(const tier of ['standard','premium'] as const){const g=new THREE.Group();addHomeComputer(g,materials,tier);g.updateMatrixWorld(true);const pad=bounds(g.getObjectByName(`computer-${tier}-mousepad`)!);const keyboard=bounds(g.getObjectByName(`computer-${tier}-keyboard-body`)!);const mouse=bounds(g.getObjectByName(`computer-${tier}-mouse`)!);expect(pad.intersectsBox(keyboard)).toBe(false);expect(mouse.min.x).toBeGreaterThan(pad.min.x);expect(mouse.max.x).toBeLessThan(pad.max.x);expect(mouse.min.z).toBeGreaterThan(pad.min.z);expect(mouse.max.z).toBeLessThan(pad.max.z);expect(mouse.min.y).toBeGreaterThanOrEqual(pad.max.y-.00001);if(tier==='premium')expect(pad.intersectsBox(bounds(g.getObjectByName('computer-premium-case-body')!))).toBe(false);}
  });
  it('keeps the quilt top and tier accents above the mattress across the whole visible surface',()=>{
    const quilt=new THREE.Group();addHomeQuilt(quilt,materials);const top=quilt.getObjectByName('quilt-top') as THREE.Mesh;const positions=top.geometry.getAttribute('position');for(let i=0;i<positions.count;i++)expect(positions.getY(i)).toBeGreaterThan(.615+.02);
    for(const tier of ['basic','standard','premium'] as const){const g=new THREE.Group();addBedTierDetails(g,materials,tier);for(const m of g.children.filter(o=>o.name.includes('runner')||o.name.includes('foot-binding')))expect(bounds(m).min.y).toBeGreaterThan(.615+.02);}
  });
});
