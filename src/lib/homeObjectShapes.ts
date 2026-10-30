import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import type {HomeDecorMaterials} from './homeDecorModels';

export function homeMesh(parent:THREE.Object3D,name:string,geometry:THREE.BufferGeometry,material:THREE.Material):THREE.Mesh {
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function homeSoftBox(parent:THREE.Object3D,name:string,x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material,radius=.025):THREE.Mesh {
  const mesh=homeMesh(parent,name,new RoundedBoxGeometry(w,h,d,2,Math.min(radius,w/4,h/4,d/4)),m);mesh.position.set(x,y,z);return mesh;
}
export function homeLathe(parent:THREE.Object3D,name:string,profile:number[][],m:THREE.Material,segments=32):THREE.Mesh {
  return homeMesh(parent,name,new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),segments),m);
}
export function homeTube(parent:THREE.Object3D,name:string,points:number[][],radius:number,m:THREE.Material):THREE.Mesh {
  return homeMesh(parent,name,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number])),false,'catmullrom',.18),24,radius,8,false),m);
}

/** A raised ceramic wash bowl: its inner floor stays above the solid worktop. */
export function addHomeWashBasin(parent:THREE.Object3D,m:HomeDecorMaterials,name:string,x:number,z:number,w:number,d:number,surfaceY:number):void {
  const height=.11;
  const bowl=homeLathe(parent,`${name}-bowl`,[[0,0],[.27,.001],[.39,.025],[.49,.082],[.5,.103],[.49,height],[.455,height],[.445,.098],[.355,.035],[.23,.018],[0,.018]],m.white,32);
  bowl.scale.set(w,1,d);bowl.position.set(x,surfaceY+.002,z);
  const drain=homeMesh(parent,`${name}-drain`,new THREE.CylinderGeometry(.018,.018,.003,20),m.metal);drain.position.set(x,surfaceY+.022,z);
  const hole=homeMesh(parent,`${name}-drain-center`,new THREE.CylinderGeometry(.006,.006,.003,12),m.color('#505b59'));hole.position.set(x,surfaceY+.024,z);
  const backZ=z-d*.57;
  homeTube(parent,`${name}-faucet`,[[x,surfaceY,backZ],[x,surfaceY+.22,backZ],[x,surfaceY+.26,backZ+.045],[x,surfaceY+.26,z-.015],[x,surfaceY+.215,z-.015]],.012,m.metal);
  homeSoftBox(parent,`${name}-tap-lever`,x+.032,surfaceY+.155,backZ,.075,.014,.025,m.metal,.006);
}

export function addHomeLampShade(parent:THREE.Object3D,m:HomeDecorMaterials,name:string,x:number,z:number,baseY:number,topRadius:number,bottomRadius:number,height:number):void {
  const wall=Math.min(.008,bottomRadius*.07);
  const shade=homeLathe(parent,`${name}-shade`,[[bottomRadius,0],[topRadius,height],[topRadius-wall,height],[bottomRadius-wall,wall],[bottomRadius,0]],m.cream,32);shade.position.set(x,baseY,z);
  for(const [y,r]of [[baseY+.002,bottomRadius],[baseY+height-.002,topRadius]]){
    const rim=homeMesh(parent,`${name}-shade-rim-${y}`,new THREE.TorusGeometry(r,wall*.5,6,32),m.cream);rim.rotation.x=Math.PI/2;rim.position.set(x,y,z);
  }
  const bulb=homeMesh(parent,`${name}-bulb`,new THREE.SphereGeometry(Math.min(topRadius*.3,.045),12,8),m.white);bulb.position.set(x,baseY+height*.35,z);bulb.castShadow=false;
  for(const angle of [0,Math.PI*2/3,Math.PI*4/3])homeTube(parent,`${name}-support-${angle}`,[[x,baseY+.02,z],[x+Math.cos(angle)*(bottomRadius-wall),baseY+.02,z+Math.sin(angle)*(bottomRadius-wall)]],Math.min(.004,bottomRadius*.025),m.metal);
}
