import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
/** Static ground detail shared by live 3D and offline photographs. No rain/snow particles. */
export function createWeatherAccumulation(parent:THREE.Object3D,width:number,depth:number,groundY:number){
  const root=new THREE.Group();root.name='weather-accumulation';parent.add(root);
  const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
  parent.updateWorldMatrix(true,true);const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  function surface(x:number,z:number){ray.set(new THREE.Vector3(x,groundY+.5,z),down);return ray.intersectObject(parent,true).find(h=>h.point.y>=groundY-.01&&h.point.y<=groundY+.2&&h.face?.normal.y!>.9)?.point.y??groundY;}
  function patches(snow:boolean){const parts:THREE.BufferGeometry[]=[];
    for(let i=0;i<52;i++){const x=((i*73+17)%251)/251*(width+24)-12,z=((i*131+41)%257)/257*(depth+24)-12;if(x>-.55&&x<width+.55&&z>-.55&&z<depth+.55)continue;
      const radius=(snow?.65:.4)+(i%5)*.17,shape=new THREE.Shape();for(let p=0;p<12;p++){const a=p*Math.PI/6,r=radius*(.76+((p*13+i*7)%11)/35),px=x+Math.cos(a)*r*1.8,pz=z+Math.sin(a)*r;if(!p)shape.moveTo(px,-pz);else shape.lineTo(px,-pz);}shape.closePath();const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);g.translate(0,surface(x,z)+(snow?.025:.006),0);parts.push(g);
    }
    const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());if(!geometry)throw Error('Missing exterior weather ground');geometries.push(geometry);
    const material=new THREE.MeshStandardMaterial({color:snow?'#edf1ed':'#77949f',roughness:snow?.97:.16,metalness:snow?0:.28,transparent:!snow,opacity:snow?1:.65,depthWrite:snow,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});materials.push(material);const mesh=new THREE.Mesh(geometry,material);mesh.name=snow?'settled-snow':'standing-puddles';mesh.receiveShadow=true;mesh.visible=false;root.add(mesh);return mesh;
  }
  const wet=patches(false),snow=patches(true);
  return{setWeather(weather:string){wet.visible=weather==='rain';snow.visible=weather==='snow';},dispose(){root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
