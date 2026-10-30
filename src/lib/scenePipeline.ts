import * as THREE from 'three';
import {renderPixelRatio,type RenderResolution} from './renderResolution';
import {createSceneWeatherComposite} from './sceneWeatherComposite';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import {createMobileSceneProfile,createMobileSelection} from './mobileSceneProfile';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {isMobileGraphics} from './graphicsDevice';
import {createMobileContactShadows} from './mobileContactShadows';

export type QualityMode = 'auto' | 'fine' | 'light';
export type SceneQuality = { id: 'fine' | 'light'; pixelRatio: number; samples: number; shadowSize: number; anisotropy: number; aoScale: number; maxPixels: number };
export function sceneQuality(mode: QualityMode = 'auto'): SceneQuality {
  const mobile = matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
  const fine = !isMobileGraphics()&&(mode === 'fine' || mode === 'auto' && !mobile);
  // MSAA 4x plus SSAO at 3M pixels made every frame too expensive and the 3D scenes
  // felt permanently stuttery. SMAA/FXAA already handle edges, so multisampling is off,
  // SSAO runs at a smaller scale, and the pixel budget is roughly halved.
  return fine
    ? { id: 'fine', pixelRatio: Math.min(1.5, Math.max(1.25, devicePixelRatio || 1)), samples: 0, shadowSize: 1024, anisotropy: 4, aoScale: .35, maxPixels: 2_000_000 }
    : { id: 'light', pixelRatio: Math.min(1.25, devicePixelRatio || 1), samples: 0, shadowSize: 512, anisotropy: 2, aoScale: 0, maxPixels: 1_000_000 };
}
export function scenePixelRatio(quality: SceneQuality, width: number, height: number, renderScale=1,resolution:RenderResolution='auto',displayScale=1,maxTextureSize=8192) {
  return renderPixelRatio(quality,width,height,renderScale,resolution,displayScale,maxTextureSize);
}
class CallbackPass extends Pass {
  constructor(private callback:()=>void){super();this.needsSwap=false;}
  render(){this.callback();}
}
/** Screen-space silhouette follows the model and respects visible wall occlusion. */
export function createScenePipeline(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera,shadowOnly:THREE.Object3D[],quality:SceneQuality,contactShadows=quality.id==='fine'){
  if(quality.id==='fine')RectAreaLightUniformsLib.init();
  const mobile=quality.id==='light'?createMobileSceneProfile(renderer,scene):undefined;
  const selection=quality.id==='light'?createMobileSelection():undefined;
  const contacts=quality.id==='light'?createMobileContactShadows(renderer,scene):undefined;
  // Canvas MSAA does not reach EffectComposer's off-screen scene buffer.
  const target=new THREE.WebGLRenderTarget(1,1,{type:quality.id==='fine'?THREE.HalfFloatType:THREE.UnsignedByteType,samples:Math.min(quality.samples,renderer.capabilities.maxSamples)});
  const composer=new EffectComposer(renderer,target),base=new RenderPass(scene,camera),output=new OutputPass();
  let outline:OutlinePass|undefined,viewWidth=1,viewHeight=1;
  const contact=contactShadows?new SSAOPass(scene,camera,1,1,16):undefined;
  const weather=createSceneWeatherComposite(renderer,camera);
  const aa=quality.id==='fine'?new SMAAPass():new ShaderPass(FXAAShader);
  if(contact){
    // The store's plan/isometric view uses an orthographic camera. Its depth
    // must be reconstructed differently from the residence's perspective view.
    const perspective=camera instanceof THREE.PerspectiveCamera?1:0;
    contact.ssaoMaterial.defines.PERSPECTIVE_CAMERA=perspective;
    contact.depthRenderMaterial.defines.PERSPECTIVE_CAMERA=perspective;
    contact.kernelRadius=.24;contact.minDistance=.0003;contact.maxDistance=.018;
    // Blend a restrained contact shade over the linear image, before tone mapping.
    contact.copyMaterial.uniforms.opacity.value=.65;
    contact.copyMaterial.blendDst=THREE.OneMinusSrcAlphaFactor;
    contact.copyMaterial.blendSrcAlpha=THREE.ZeroFactor;contact.copyMaterial.blendDstAlpha=THREE.OneFactor;
  }
  // The physical ceiling and full-height shadow walls are invisible to the camera.
  // Keep them for the base/shadow pass, omit them from depth comparisons only.
  const hide=new CallbackPass(()=>shadowOnly.forEach(o=>o.visible=false)),restore=new CallbackPass(()=>shadowOnly.forEach(o=>o.visible=true));
  composer.addPass(base);composer.addPass(new CallbackPass(()=>weather.captureDepth(composer.readBuffer.depthTexture)));composer.addPass(hide);
  const depthHidden:THREE.Object3D[]=[];
  const depthBounds=new THREE.Box3(),depthCenter=new THREE.Vector3(),depthHalfSize=new THREE.Vector3();
  if(contact){
    composer.addPass(new CallbackPass(()=>{scene.traverse(o=>{
      if(!o.visible)return;
      if(o.userData.skipContactAO){o.visible=false;depthHidden.push(o);return;}
      if(!(o instanceof THREE.Mesh))return;
      const source:THREE.Material[]=Array.isArray(o.material)?o.material:[o.material];
      // SSAO's global normal material cannot inherit per-window clipping planes.
      // Omit cut pieces from AO so hidden curtains cannot shade the background.
      let clipped=false;
      if(source.some(m=>m.clippingPlanes?.length)){
        depthBounds.setFromObject(o);depthBounds.getCenter(depthCenter);depthBounds.getSize(depthHalfSize).multiplyScalar(.5);
        clipped=source.some(m=>m.clippingPlanes?.some(p=>p.distanceToPoint(depthCenter)-Math.abs(p.normal.x)*depthHalfSize.x-Math.abs(p.normal.y)*depthHalfSize.y-Math.abs(p.normal.z)*depthHalfSize.z<-.001));
      }
      // Alpha-cut character cards use their own soft footprint shadow. The AO
      // override normal material does not sample their alpha and would make a rectangle.
      if(clipped||o.userData.skipContactAO||source.some(m=>m.transparent||!m.colorWrite)){o.visible=false;depthHidden.push(o);}
    });}));
    composer.addPass(contact);
    composer.addPass(new CallbackPass(()=>{depthHidden.forEach(o=>o.visible=true);depthHidden.length=0;}));
  }
  composer.addPass(restore);composer.addPass(output);composer.addPass(aa);
  return {
    setWeatherLayer:weather.setLayer,renderWeather:weather.render,
    setContactObjects(objects:()=>THREE.Object3D[]){contacts?.setObjects(objects);},
    invalidateContacts(){contacts?.invalidate();},
    warmup(){
      mobile?.prepare();
      contacts?.update();
      // RenderPass draws into a linear offscreen target. Compiling for the canvas
      // prepares different color-space/tone-mapping shaders and stalls on first use.
      const previous=renderer.getRenderTarget();
      renderer.setRenderTarget(composer.readBuffer);
      try{return renderer.compileAsync(scene,camera);}
      finally{renderer.setRenderTarget(previous);}
    },
    select(objects:THREE.Object3D[]){
      if(selection){selection.select(objects);return;}
      // OutlinePass owns several full-screen buffers. Allocate only while a selection exists.
      if(!objects.length){if(outline){composer.removePass(outline);outline.dispose();outline=undefined;}return;}
      if(!outline){outline=new OutlinePass(new THREE.Vector2(1,1),scene,camera);outline.visibleEdgeColor.set('#ffffff');outline.hiddenEdgeColor.set('#000000');outline.edgeStrength=5;outline.edgeThickness=2.5;outline.edgeGlow=0;outline.pulsePeriod=0;outline.downSampleRatio=quality.id==='fine'?2:3;composer.insertPass(outline,composer.passes.indexOf(restore));outline.setSize(viewWidth*renderer.getPixelRatio(),viewHeight*renderer.getPixelRatio());}
      outline.selectedObjects=objects;
    },
    resize(w:number,h:number){
      viewWidth=w;viewHeight=h;weather.invalidate();const ratio=renderer.getPixelRatio();composer.setPixelRatio(ratio);composer.setSize(w,h);
      contact?.setSize(Math.max(1,Math.round(w*ratio*quality.aoScale)),Math.max(1,Math.round(h*ratio*quality.aoScale)));
      if(aa instanceof ShaderPass)aa.uniforms.resolution.value.set(1/(w*ratio),1/(h*ratio));
    },
    render(){
      mobile?.prepare();selection?.update();
      contacts?.update();
      if(weather.active())for(const buffer of [composer.renderTarget1,composer.renderTarget2])if(!buffer.depthTexture){buffer.dispose();buffer.depthTexture=new THREE.DepthTexture(buffer.width,buffer.height);buffer.depthTexture.type=THREE.UnsignedIntType;}
      try{
        if(contact){contact.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);contact.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);}
        composer.render();weather.finish();
      }finally{shadowOnly.forEach(o=>o.visible=true);depthHidden.forEach(o=>o.visible=true);depthHidden.length=0;}
    },
    dispose(){selection?.dispose();contacts?.dispose();mobile?.dispose();weather.dispose();if(contact){contact.dispose();contact.ssaoMaterial.dispose();contact.noiseTexture?.dispose();}aa.dispose();outline?.dispose();output.dispose();base.dispose();composer.dispose();},
  };
}
