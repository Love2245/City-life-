import * as THREE from 'three';
/** Development-only depth pass. PNG RG bytes encode camera depth without lossy compression. */
const cached=new Map<THREE.Material,THREE.ShaderMaterial>();
export function clearPhotographDepth(){cached.forEach(m=>m.dispose());cached.clear();}
export function photographDepth(scene:THREE.Scene,camera:THREE.Camera,renderer:THREE.WebGLRenderer){
  const materials=cached,saved=new Map<THREE.Mesh,THREE.Material|THREE.Material[]>();
  function depth(original:THREE.Material){let result=materials.get(original);if(result)return result;
    result=new THREE.ShaderMaterial({side:original.side,clippingPlanes:original.clippingPlanes,clipIntersection:original.clipIntersection,clipping:true,toneMapped:false,
      vertexShader:`#include <common>\n#include <clipping_planes_pars_vertex>\nvoid main(){ vec4 mvPosition=vec4(position,1.0);\n#ifdef USE_INSTANCING\nmvPosition=instanceMatrix*mvPosition;\n#endif\nmvPosition=modelViewMatrix*mvPosition;gl_Position=projectionMatrix*mvPosition;\n#include <clipping_planes_vertex>\n}`,
      fragmentShader:`#include <clipping_planes_pars_fragment>\nvoid main(){\n#include <clipping_planes_fragment>\nfloat d=floor(gl_FragCoord.z*65534.0);gl_FragColor=vec4(floor(d/256.0)/255.0,mod(d,256.0)/255.0,0.0,1.0);}`});
    result.visible=original.visible&&original.colorWrite;materials.set(original,result);return result;
  }
  scene.traverse(object=>{if(object instanceof THREE.Mesh){saved.set(object,object.material);object.material=Array.isArray(object.material)?object.material.map(depth):depth(object.material);}});
  const background=scene.background;scene.background=null;renderer.setClearColor('#ffffff',1);
  try{renderer.render(scene,camera);const copy=document.createElement('canvas');copy.width=renderer.domElement.width;copy.height=renderer.domElement.height;copy.getContext('2d')!.drawImage(renderer.domElement,0,0);return copy;}
  finally{scene.background=background;saved.forEach((material,mesh)=>mesh.material=material);}
}
