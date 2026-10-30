import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

/** A small, cached floor silhouette. Camera motion only draws the resulting plane;
 * it never re-renders the furniture into a shadow map or runs screen-space AO. */
export function createMobileContactShadows(renderer:THREE.WebGLRenderer,scene:THREE.Scene){
  const root=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
  root.name='mobile-cached-contact-shadows';root.rotation.x=-Math.PI/2;root.visible=false;root.renderOrder=1;root.userData.skipContactAO=true;scene.add(root);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,4.01);camera.up.set(0,0,-1);
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.BasicDepthPacking});
  depth.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'float height = max(0.0, (1.0 - fragCoordZ) * 4.0); gl_FragColor = vec4(vec3(0.0), smoothstep(0.0, 0.04, height) * exp(-height * 0.85) * 0.52);');
  };
  const blur=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
    uniforms:{image:{value:null},step:{value:new THREE.Vector2()}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:'uniform sampler2D image;uniform vec2 step;varying vec2 vUv;void main(){vec4 c=texture2D(image,vUv)*0.227027;c+=(texture2D(image,vUv+step*1.384615)+texture2D(image,vUv-step*1.384615))*0.316216;c+=(texture2D(image,vUv+step*3.230769)+texture2D(image,vUv-step*3.230769))*0.070270;gl_FragColor=c;}',
  });
  const quad=new FullScreenQuad(blur),bounds=new THREE.Box3(),part=new THREE.Box3(),center=new THREE.Vector3();
  let objects:()=>THREE.Object3D[]=()=>[],dirty=true,disposed=false,updates=0;
  let target:THREE.WebGLRenderTarget|undefined,scratch:THREE.WebGLRenderTarget|undefined;
  function update(){
    if(!dirty||disposed)return;dirty=false;
    const casters=new Set<THREE.Mesh>();bounds.makeEmpty();
    for(const owner of objects()){
      owner.updateWorldMatrix(true,true);owner.traverseVisible(object=>{
        if(!(object instanceof THREE.Mesh)||!object.castShadow||object===root)return;
        const materials=Array.isArray(object.material)?object.material:[object.material];
        if(materials.some(m=>!m.visible||!m.colorWrite||m.transparent||m.alphaTest>0||m.clippingPlanes?.length))return;
        part.setFromObject(object);
        if(part.isEmpty()||part.max.y<.08||part.min.y>3.5)return;
        casters.add(object);bounds.union(part);
      });
    }
    if(!casters.size){root.visible=false;return;}
    bounds.getCenter(center);const width=Math.max(.5,bounds.max.x-bounds.min.x+.6),height=Math.max(.5,bounds.max.z-bounds.min.z+.6);
    const pixels=512/Math.max(width,height),w=Math.max(32,Math.ceil(width*pixels)),h=Math.max(32,Math.ceil(height*pixels));
    if(target?.width!==w||target.height!==h){
      target?.dispose();scratch?.dispose();target=new THREE.WebGLRenderTarget(w,h,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
      scratch=new THREE.WebGLRenderTarget(w,h,{depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});root.material.map=target.texture;root.material.needsUpdate=true;
    }
    camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;
    camera.position.set(center.x,4.035,center.z);camera.lookAt(center.x,.035,center.z);camera.updateProjectionMatrix();
    const visibility=new Map<THREE.Object3D,boolean>(),background=scene.background,fog=scene.fog,override=scene.overrideMaterial;
    const previous=renderer.getRenderTarget(),clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),autoClear=renderer.autoClear;
    try{
      scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Line||object instanceof THREE.Points||object instanceof THREE.Sprite){visibility.set(object,object.visible);if(!casters.has(object as THREE.Mesh))object.visible=false;}});
      scene.background=null;scene.fog=null;scene.overrideMaterial=depth;renderer.autoClear=true;renderer.setClearColor(0,0);renderer.setRenderTarget(target!);renderer.clear();renderer.render(scene,camera);
      blur.uniforms.image.value=target!.texture;blur.uniforms.step.value.set(1.2/w,0);renderer.setRenderTarget(scratch!);quad.render(renderer);
      blur.uniforms.image.value=scratch!.texture;blur.uniforms.step.value.set(0,1.2/h);renderer.setRenderTarget(target!);quad.render(renderer);
      root.position.set(center.x,.035,center.z);root.scale.set(width,height,1);updates++;
      root.userData.mobileContactShadows={updates,casters:casters.size,buffer:[w,h],cached:true};
    }finally{
      for(const [object,visible]of visibility)object.visible=visible;
      scene.background=background;scene.fog=fog;scene.overrideMaterial=override;renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);renderer.autoClear=autoClear;
    }
    root.visible=true;
  }
  return {setObjects(value:()=>THREE.Object3D[]){objects=value;dirty=true;},invalidate(){dirty=true;},update,
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.geometry.dispose();root.material.dispose();depth.dispose();blur.dispose();quad.dispose();target?.dispose();scratch?.dispose();},
  };
}
