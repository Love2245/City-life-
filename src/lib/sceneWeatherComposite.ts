import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

/** Cache the completed room on the GPU. Precipitation reuses its depth and color
 * instead of redrawing furniture, shadows and postprocessing on every drop frame. */
export function createSceneWeatherComposite(renderer:THREE.WebGLRenderer,camera:THREE.Camera){
  let layer:THREE.Scene|undefined,snapshot:THREE.FramebufferTexture|undefined,depth:THREE.WebGLRenderTarget|undefined,valid=false;
  const size=new THREE.Vector2(),origin=new THREE.Vector2();
  const vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const copyMaterial=new THREE.ShaderMaterial({uniforms:{image:{value:null}},vertexShader:vertex,fragmentShader:'uniform sampler2D image;varying vec2 vUv;void main(){gl_FragColor=texture2D(image,vUv);}',depthTest:false,depthWrite:false,toneMapped:false});
  const depthMaterial=new THREE.ShaderMaterial({uniforms:{image:{value:null}},vertexShader:vertex,fragmentShader:'#include <packing>\nuniform sampler2D image;varying vec2 vUv;void main(){gl_FragColor=packDepthToRGBA(texture2D(image,vUv).x);}',depthTest:false,depthWrite:false,toneMapped:false});
  const quad=new FullScreenQuad(copyMaterial);
  function active(){return !!layer?.userData.precipitationActive;}
  function ensure(){renderer.getDrawingBufferSize(size);if(snapshot?.image.width===size.x&&snapshot.image.height===size.y)return;
    snapshot?.dispose();depth?.dispose();snapshot=new THREE.FramebufferTexture(size.x,size.y);snapshot.minFilter=snapshot.magFilter=THREE.NearestFilter;
    depth=new THREE.WebGLRenderTarget(size.x,size.y,{depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});valid=false;
  }
  function draw(now:number,restore:boolean){if(!active()||!valid||!snapshot||!depth||!layer)return false;
    const clear=renderer.autoClear;renderer.autoClear=false;renderer.setRenderTarget(null);
    try{if(restore){copyMaterial.uniforms.image.value=snapshot;quad.material=copyMaterial;quad.render(renderer);}
      layer.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points||o instanceof THREE.LineSegments){const m=o.material;if(m instanceof THREE.ShaderMaterial){m.uniforms.sceneDepth.value=depth!.texture;m.uniforms.resolution.value.copy(size);m.uniforms.time.value=layer!.userData.reducedMotion?0:now/1000;}}});
      renderer.render(layer,camera);
    }finally{renderer.autoClear=clear;}return true;
  }
  return {
    setLayer(value:THREE.Scene|undefined){layer=value;valid=false;},active,
    invalidate(){valid=false;},
    captureDepth(texture:THREE.Texture|null){if(!active()||!texture)return;ensure();const old=renderer.getRenderTarget();depthMaterial.uniforms.image.value=texture;quad.material=depthMaterial;renderer.setRenderTarget(depth!);quad.render(renderer);renderer.setRenderTarget(old);},
    finish(now=performance.now()){if(!active()){valid=false;return;}ensure();renderer.setRenderTarget(null);renderer.copyFramebufferToTexture(snapshot!,origin);valid=true;draw(now,false);},
    render(now:number){return draw(now,true);},
    dispose(){snapshot?.dispose();depth?.dispose();copyMaterial.dispose();depthMaterial.dispose();quad.dispose();valid=false;},
  };
}
