import * as THREE from 'three';
import {photographInteractions,ancestorInteraction} from '../../scripts/still-interaction-map';
import type {WeatherId} from '../game/types';

export type VenueBakeRequest={angle:number;night:boolean;doorOpen:boolean;weather?:WeatherId;interaction?:boolean;layer?:'lin'|'stool'};
export function createVenueStillBake(options:{renderer:THREE.WebGLRenderer;scene:THREE.Scene;camera:THREE.OrthographicCamera;target:THREE.Vector3;prepare:(request:VenueBakeRequest)=>void;render:()=>void;facilities:()=>{id:string;point:THREE.Vector3}[];layer:(name:'lin'|'stool')=>THREE.Object3D|undefined}){
  let entry:{eye:THREE.Vector3;target:THREE.Vector3;zoom:number}|undefined;
  return (request:VenueBakeRequest)=>{
    const {renderer,scene,camera}=options;
    // Capture at the PC full-resolution target, bypassing the runtime quality pixel budget.
    renderer.setPixelRatio(1);renderer.setSize(4096,2560,false);
    entry??={eye:camera.position.clone(),target:options.target.clone(),zoom:camera.zoom};
    options.prepare(request);
    options.target.copy(entry.target);camera.position.copy(entry.eye).sub(entry.target).applyAxisAngle(new THREE.Vector3(0,1,0),request.angle*Math.PI/2).add(entry.target);camera.zoom=entry.zoom;camera.lookAt(entry.target);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    // Preparing again settles directional wall fading for the final camera.
    options.prepare(request);camera.updateMatrixWorld(true);
    const width=renderer.domElement.width,height=renderer.domElement.height;
    const points=options.facilities().map(({id,point})=>{point.project(camera);return{id,x:(point.x+1)*width/2,y:(1-point.y)*height/2,visible:Math.abs(point.x)<=1&&Math.abs(point.y)<=1&&Math.abs(point.z)<=1};});
    if(request.interaction){const ids=points.map(p=>p.id);return{data:photographInteractions(scene,camera,renderer,ids,o=>ancestorInteraction(o,'storeFacility')??ancestorInteraction(o,'cafeFacility')),width,height,points,hitIds:ids};}
    if(!request.layer){options.render();return{data:renderer.domElement.toDataURL('image/webp',.96),width,height,points};}
    const root=options.layer(request.layer);if(!root)throw Error(`Missing bake layer ${request.layer}`);
    const oldVisible=new Map<THREE.Object3D,boolean>(),kept=new Set<THREE.Object3D>();root.traverse(item=>kept.add(item));for(let parent:THREE.Object3D|null=root;parent;parent=parent.parent)kept.add(parent);
    scene.traverse(item=>{if(item instanceof THREE.Light){for(let parent:THREE.Object3D|null=item;parent;parent=parent.parent)kept.add(parent);}});
    scene.traverse(item=>{oldVisible.set(item,item.visible);if(!kept.has(item))item.visible=false;});root.visible=true;
    const target=new THREE.WebGLRenderTarget(width,height,{format:THREE.RGBAFormat});target.texture.colorSpace=THREE.SRGBColorSpace;
    const background=scene.background,oldTarget=renderer.getRenderTarget(),clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),shadow=renderer.shadowMap.enabled;
    try{
      scene.background=null;renderer.shadowMap.enabled=false;renderer.setClearColor(0,0);renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);
      const pixels=new Uint8Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
      let minX=width,minY=height,maxX=-1,maxY=-1;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>0){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,height-1-y);maxY=Math.max(maxY,height-1-y);}
      if(maxX<minX)throw Error(`Empty bake layer ${request.layer}`);
      minX=Math.max(0,minX-2);minY=Math.max(0,minY-2);maxX=Math.min(width-1,maxX+2);maxY=Math.min(height-1,maxY+2);
      const cropWidth=maxX-minX+1,cropHeight=maxY-minY+1,canvas=document.createElement('canvas');canvas.width=cropWidth;canvas.height=cropHeight;
      const context=canvas.getContext('2d')!,image=context.createImageData(cropWidth,cropHeight);
      for(let y=0;y<cropHeight;y++){const start=((height-1-minY-y)*width+minX)*4;image.data.set(pixels.subarray(start,start+cropWidth*4),y*cropWidth*4);}context.putImageData(image,0,0);
      return{data:canvas.toDataURL('image/webp',.94),width,height,points,rect:{x:minX,y:minY,width:cropWidth,height:cropHeight}};
    }finally{renderer.setRenderTarget(oldTarget);renderer.setClearColor(clear,alpha);renderer.shadowMap.enabled=shadow;scene.background=background;oldVisible.forEach((visible,item)=>item.visible=visible);target.dispose();}
  };
}
