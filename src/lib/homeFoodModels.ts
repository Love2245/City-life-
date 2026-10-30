import * as THREE from 'three';
import source from '../assets/home/v1.49/models/food-props.json';
import type {HomeDecorMaterials} from './homeDecorModels';

export type HomeFoodModel = keyof typeof source;
export interface HomePropPlacement {
  x:number; z:number; surfaceY:number; width:number; depth:number; height:number; rotation?:number;
}

/** CC0 Kenney Food Kit meshes. Palette baking keeps room creation synchronous. */
export function addHomeFoodModel(parent:THREE.Object3D,m:HomeDecorMaterials,id:HomeFoodModel,name:string,p:HomePropPlacement):THREE.Group {
  const model=new THREE.Group();model.name=name;model.userData.homeFoodModel=id;
  const parts=m.palette?[{color:'#ffffff',positions:source[id].parts.flatMap(p=>p.positions),normals:source[id].parts.flatMap(p=>p.normals)}]:source[id].parts;
  for(const [i,part]of parts.entries()){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(part.normals,3));
    // Match the room's other meshes so its per-material batching stays available.
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(part.positions.length/3*2),2));
    if(m.palette){const colors:number[]=[];for(const p of source[id].parts){const color=new THREE.Color(p.color);for(let v=0;v<p.positions.length/3;v++)colors.push(color.r,color.g,color.b);}geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));}
    const mesh=new THREE.Mesh(geometry,m.palette??m.color(part.color));mesh.name=`${name}-part-${i}`;mesh.castShadow=mesh.receiveShadow=true;model.add(mesh);
  }
  model.rotation.y=p.rotation??0;model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const scale=Math.min(p.width/size.x,p.height/size.y,p.depth/size.z);
  model.scale.setScalar(scale);model.position.set(p.x-center.x*scale,p.surfaceY+.002-bounds.min.y*scale,p.z-center.z*scale);
  model.userData.homeSurfaceTop=p.surfaceY+.002+size.y*scale;parent.add(model);
  return model;
}
