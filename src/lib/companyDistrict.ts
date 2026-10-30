import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OFFICE_ADDRESSES, officeBuildingFootprint, type OfficePlan } from '../game/core/companyOffice';
import type { OfficeLightScheme } from './officeLighting';
import {createCompanyFacadeTextures} from './companyFacadeTextures';

/** Render-only district below the office's real floor. It never expands the room camera or adds exits. */
export function buildCompanyDistrict(plan: OfficePlan) {
  const root = new THREE.Group(); root.name = 'office-district-background'; root.userData.exteriorOnly = true;
  const floor = OFFICE_ADDRESSES[plan.stage - 1]!.floor, campus = plan.stage === 1;
  const groundY = -(floor - 1) * 3.2 - .24, [w,d] = plan.size, footprint=officeBuildingFootprint(plan),footprintDepth=footprint.depth;
  root.userData.floor = floor; root.userData.groundY = groundY;
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const material = (color:string) => { const m = new THREE.MeshStandardMaterial({color,roughness:.95}); materials.add(m); return m; };
  const ground = material(campus?'#859681':'#a6b1a3'), road = material('#697b7e'), paving = material('#c7cebf');
  const grass = material('#829a78'), concrete = material('#bac3b9'), stripe = material('#d3d6c3'), trunk = material('#7b7968'), foliage = material('#66846b');
  const roofs = material('#9aada9');
  function texture(draw:(x:number,y:number)=>number[]) {
    const n=128,bytes=new Uint8Array(n*n*4);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const rgb=draw(x,y),i=(y*n+x)*4;bytes[i]=rgb[0]!;bytes[i+1]=rgb[1]!;bytes[i+2]=rgb[2]!;bytes[i+3]=255;}
    const map=new THREE.DataTexture(bytes,n,n);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.generateMipmaps=true;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.needsUpdate=true;textures.add(map);return map;
  }
  const cityAtlas=createCompanyFacadeTextures(false),ownAtlas=campus?createCompanyFacadeTextures(true):cityAtlas;
  for(const atlas of [cityAtlas,ownAtlas]){textures.add(atlas.color);textures.add(atlas.emission);}
  const cityColors=['#e2ece9','#deded0','#cbdce1'],cityFacades=cityColors.map(color=>{const m=new THREE.MeshStandardMaterial({color,map:cityAtlas.color,emissiveMap:cityAtlas.emission,emissive:'#ffdda3',emissiveIntensity:0,roughness:.86});materials.add(m);return m;});
  const facade=new THREE.MeshStandardMaterial({color:campus?'#e3dfc9':'#c6d3cf',map:ownAtlas.color,emissiveMap:ownAtlas.emission,emissive:'#ffdda3',emissiveIntensity:0,roughness:.9});materials.add(facade);
  const surface=texture((x,y)=>{const t=(x*13+y*7)%11;return x%32<1||y%32<1?[151,164,153]:[188+t,197+t,180+t];});paving.map=surface;
  function add(g:THREE.BufferGeometry,m:THREE.Material){const list=batches.get(m)??[];list.push(g);batches.set(m,list);}
  function box(x:number,y:number,z:number,bw:number,bh:number,bd:number,m:THREE.Material){const g=new THREE.BoxGeometry(bw,bh,bd);g.translate(x,y,z);add(g,m);}
  function flat(x:number,z:number,bw:number,bd:number,y:number,m:THREE.Material){const g=new THREE.PlaneGeometry(bw,bd);g.rotateX(-Math.PI/2);const uv=g.getAttribute('uv'),p=g.getAttribute('position');for(let i=0;i<uv.count;i++)uv.setXY(i,(p.getX(i)+x)/3,(p.getZ(i)+z)/3);g.translate(x,y,z);add(g,m);}
  function building(x:number,z:number,bw:number,bd:number,height:number,own=false,variant=0){
    const g=new THREE.BoxGeometry(bw,height,bd),uv=g.getAttribute('uv'),p=g.getAttribute('position'),n=g.getAttribute('normal');
    const atlas=own?ownAtlas:cityAtlas;
    for(let i=0;i<uv.count;i++)uv.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))/atlas.repeatWidth,(p.getY(i)+height/2)/atlas.repeatHeight);
    g.translate(x,groundY+height/2,z);add(g,own?facade:cityFacades[variant%cityFacades.length]!);
    box(x,groundY+height+.04,z,bw+.1,.08,bd+.1,own?concrete:roofs);
    for(const side of [-1,1])for(const end of [-1,1])box(x+side*(bw/2-.04),groundY+height/2,z+end*(bd/2-.04),.13,height,.13,concrete);
    if(!own){
      for(const side of [-1,1]){box(x,groundY+height+.23,z+side*(bd/2-.05),bw,.3,.12,concrete);box(x+side*(bw/2-.05),groundY+height+.23,z,.12,.3,bd,concrete);}
      box(x,groundY+height+.16,z,bw*.45,.24,bd*.4,roofs);box(x+bw*.28,groundY+height+.27,z+bd*.21,.6,.4,.65,roofs);
      for(let k=0;k<4;k++)box(x+bw*.28-.21+k*.14,groundY+height+.48,z+bd*.21,.035,.025,.5,stripe);
    }
  }
  // A continuous district replaces the blank canvas; roads remain below the actual building.
  flat(w/2,d/2,420,420,groundY,ground);
  const roadsZ=[-12,footprintDepth+12],roadsX=[-13,w+13];
  for(const z of roadsZ){flat(w/2,z,250,5.4,groundY+.015,road);flat(w/2,z-3.6,250,1.8,groundY+.08,paving);flat(w/2,z+3.6,250,1.8,groundY+.08,paving);for(let x=-90;x<110;x+=4)box(x,groundY+.025,z,1.9,.012,.1,stripe);}
  for(const x of roadsX){flat(x,d/2,5.4,250,groundY+.018,road);flat(x-3.6,d/2,1.8,250,groundY+.085,paving);flat(x+3.6,d/2,1.8,250,groundY+.085,paving);for(let z=-90;z<110;z+=4)box(x,groundY+.028,z,.1,.012,1.9,stripe);}
  flat(w/2,footprintDepth/2,w+13,footprintDepth+13,groundY+.09,paving);
  for(const x of [-5,w+5]){box(x,groundY+.15,footprintDepth/2,2.65,.14,footprintDepth+6,concrete);flat(x,footprintDepth/2,2.45,footprintDepth+5.8,groundY+.23,grass);}
  building((footprint.minX+footprint.maxX)/2,(footprint.minZ+footprint.maxZ)/2,footprint.width,footprint.depth,-.25-groundY,true);
  if(plan.stage===4)building(plan.entry[0],d+1,1.85,2.1,-.25-groundY,true);
  // Buildings stay below the viewed floor, preserving room visibility from every direction.
  let serial=0;
  for(let row=-2;row<=2;row++)for(let col=-2;col<=2;col++){
    if(row===0&&col===0)continue;
    const i=serial++,x=w/2+col*26+(row%2)*3,z=footprintDepth/2+row*27;
    const bw=8+i%3*2,bd=7+(i*3)%5,height=plan.stage>=3?-groundY-5-(i%5)*2.3:Math.min(-groundY-2.7,(campus?5.4:10)+(i%5)*(campus?.75:4.6));
    building(x,z,bw,bd,height,false,i);flat(x,z,bw+4,bd+4,groundY+.075,paving);
    for(let k=0;k<3;k++)box(x-bw/2-1.2+k*.65,groundY+.11,z+bd/2+1.3,.035,.04,1.2,stripe);
  }
  const treePositions:[number,number][]=[];
  for(const x of [-5,w+5])for(let z=-2;z<footprintDepth+4;z+=4.5)treePositions.push([x,z]);
  for(let i=0;i<38;i++)treePositions.push([-46+(i%9)*12,-39+Math.floor(i/9)*26]);
  const stemGeometry=new THREE.CylinderGeometry(.11,.16,2,6),crownGeometry=new THREE.IcosahedronGeometry(1.15,1);
  geometries.add(stemGeometry);geometries.add(crownGeometry);
  const stems=new THREE.InstancedMesh(stemGeometry,trunk,treePositions.length),crowns=new THREE.InstancedMesh(crownGeometry,foliage,treePositions.length),matrix=new THREE.Matrix4();
  for(const [i,[x,z]]of treePositions.entries()){matrix.makeTranslation(x,groundY+1.1,z);stems.setMatrixAt(i,matrix);matrix.makeScale(1,1.35,1);matrix.setPosition(x,groundY+2.7,z);crowns.setMatrixAt(i,matrix);}
  stems.name='district-tree-trunks';crowns.name='district-tree-crowns';root.add(stems,crowns);
  for(const [m,list]of batches){const merged=mergeGeometries(list);list.forEach(g=>g.dispose());if(!merged)continue;geometries.add(merged);const mesh=new THREE.Mesh(merged,m);mesh.receiveShadow=false;mesh.castShadow=false;mesh.name=m===facade?'office-building-lower-storeys':'district-static-surfaces';root.add(mesh);}
  let disposed=false;
  return {root,groundY,
    setLighting(light:OfficeLightScheme){cityFacades.forEach((m,i)=>{m.emissiveIntensity=light.frame==='night'?.35:0;m.color.set(light.frame==='night'?'#8aa5b5':cityColors[i]!);});facade.emissiveIntensity=light.frame==='night'?.46:0;facade.color.set(light.frame==='night'?'#839caa':campus?'#e3dfc9':'#c6d3cf');},
    dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());stems.dispose();crowns.dispose();root.clear();},
  };
}
