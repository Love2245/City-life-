/** Offline tool: photographs the actual game scene, without the game HUD. */
import * as THREE from 'three';
import {photographInteractions,ancestorInteraction} from './still-interaction-map';
import {photographDepth,clearPhotographDepth} from './home-still-depth';
import {createHomeRoom} from '../src/lib/homeRoom3D';
import {homePreviewRoom} from '../src/lib/homeRoomState';
import {homeReferencePlan,homeReferenceState} from '../src/lib/homeReferencePlan';
import {createHomeReferenceVisuals} from '../src/lib/homeReferenceVisuals';
import {homePlanFor,HOME_FIXED_IDS,HOME_SCENE_IDS,type HomeObjectKind} from '../src/game/core/homeInterior';
import {HOME_FURNITURE,type HomeFurnitureKind} from '../src/game/core/homeFurniture';
import {HOME_DECOR_CATALOG,defaultHomeDecor} from '../src/game/core/homeDecor';
import {HOME_ALIASES} from '../src/game/core/homeAliases';
const W=4096,H=3072;
const host=document.querySelector<HTMLElement>('#host')!;
const emit=(window as any).emitHomeAsset as (name:string,data:string)=>Promise<void>;
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setSize(W,H);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.localClippingEnabled=true;
const representatives=[...HOME_SCENE_IDS].filter(id=>!HOME_ALIASES[id]);
(window as any).homeBakeIds=representatives;
(window as any).homeBakeAliases=Object.fromEntries([...HOME_SCENE_IDS].map(id=>[id,HOME_ALIASES[id]??id]));
function crop(canvas:HTMLCanvasElement,transparent:boolean){
  const c=document.createElement('canvas'),ctx=canvas.getContext('2d');
  // WebGL canvases cannot expose a 2D context: copy first.
  const CW=canvas.width,CH=canvas.height;c.width=CW;c.height=CH;const draw=c.getContext('2d')!;draw.drawImage(canvas,0,0);
  let x=0,y=0,w=CW,h=CH;
  if(transparent){const pixels=draw.getImageData(0,0,CW,CH).data;let minX=CW,minY=CH,maxX=-1,maxY=-1;for(let yy=0;yy<CH;yy++)for(let xx=0;xx<CW;xx++)if(pixels[(yy*CW+xx)*4+3]>4){minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,yy);maxY=Math.max(maxY,yy);}if(maxX<0)return null;x=Math.max(0,minX-2);y=Math.max(0,minY-2);w=Math.min(CW-x,maxX-minX+5);h=Math.min(CH-y,maxY-minY+5);}
  const out=document.createElement('canvas');out.width=w;out.height=h;out.getContext('2d')!.drawImage(c,x,y,w,h,0,0,w,h);return {x,y,width:w,height:h,data:out.toDataURL('image/webp',.96).split(',')[1]};
}
(window as any).bakeHome=async(id:string,existing?:any)=>{
  const plan=homeReferencePlan(homePlanFor(id)),fixed=HOME_FIXED_IDS.has(id),initial=homeReferenceState(homePreviewRoom(plan,true,12,'auto','sunny','basic'),plan);
  const view=createHomeRoom(host,plan,()=>{},()=>{},undefined,createHomeReferenceVisuals(plan,'pc',1));if(!view)throw new Error('WebGL unavailable');view.setQuality?.('fine','pc');view.update(initial);await view.ready;
  const cap=view.capture();await cap.settle();
  const scene=cap.scene,results:any={id,fixed,width:W,height:H,views:[]},box=new THREE.Box3(new THREE.Vector3(-5,0,-5),new THREE.Vector3(plan.size[0]+5,3,plan.size[1]+5));
  const cameras:THREE.OrthographicCamera[]=[];
  for(let angle=0;angle<4;angle++){
    const yaw=.50+angle*Math.PI/2,center=new THREE.Vector3(plan.size[0]/2,.8,plan.size[1]/2),camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,200);
    camera.position.copy(center).add(new THREE.Vector3(Math.sin(yaw)*30,30*.91,Math.cos(yaw)*30));camera.lookAt(center);camera.updateMatrixWorld(true);
    let x=0,y=0;for(const xx of [box.min.x,box.max.x])for(const yy of [box.min.y,box.max.y])for(const zz of [box.min.z,box.max.z]){const p=new THREE.Vector3(xx,yy,zz).applyMatrix4(camera.matrixWorldInverse);x=Math.max(x,Math.abs(p.x));y=Math.max(y,Math.abs(p.y));}const half=Math.max(y,x/(W/H))*1.035;camera.left=-half*W/H;camera.right=half*W/H;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();cameras.push(camera);
    results.views.push({matrix:new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).toArray(),yaw,floor:{},walls:{},foreground:{},sprites:{},pets:{}});
  }
  function meshIn(o:THREE.Object3D,root:THREE.Object3D){for(let p:THREE.Object3D|null=o;p;p=p.parent)if(p===root)return true;return false;}
  function ownedFitting(o:THREE.Object3D){for(let node:THREE.Object3D|null=o;node&&node!==cap.fittings;node=node.parent)if(node.userData.kind||node.userData.fixtureRequires)return true;return false;}
  function exteriorMesh(o:THREE.Mesh){return !meshIn(o,cap.room)&&!meshIn(o,cap.furniture)&&!meshIn(o,cap.fittings)&&!meshIn(o,cap.petModels)&&!meshIn(o,cap.petSupplies);}
  function floorMesh(o:THREE.Mesh){if(o.material===cap.floorMaterial)return true;if(!meshIn(o,cap.room))return false;const b=new THREE.Box3().setFromObject(o);return b.max.y<.06&&b.max.y-b.min.y<.05;}
  async function shot(angle:number,name:string,filter:(o:THREE.Mesh)=>boolean,background=false,reuseDepthSrc?:string){
    cap.cutaway(results.views[angle].yaw);scene.updateMatrixWorld(true);const previous=new Map<THREE.Mesh,boolean>();scene.traverse(o=>{if(o instanceof THREE.Mesh){previous.set(o,o.visible);o.visible=o.visible&&filter(o);}});
    const camera=cameras[angle];let left=0,top=0,renderWidth=W,renderHeight=H;
    if(!background){let minX=W,minY=H,maxX=-1,maxY=-1;scene.traverseVisible(o=>{if(!(o instanceof THREE.Mesh))return;const mats=Array.isArray(o.material)?o.material:[o.material];if(!mats.some(m=>m.visible&&m.colorWrite))return;const box=new THREE.Box3().setFromObject(o);for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).project(camera),px=(p.x+1)*W/2,py=(1-p.y)*H/2;minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);}});
      left=Math.max(0,Math.floor(minX)-4);top=Math.max(0,Math.floor(minY)-4);renderWidth=Math.max(1,Math.min(W-left,Math.ceil(maxX)+5-left));renderHeight=Math.max(1,Math.min(H-top,Math.ceil(maxY)+5-top));camera.setViewOffset(W,H,left,top,renderWidth,renderHeight);
    }renderer.setSize(renderWidth,renderHeight);
    const old=scene.background;scene.background=background?old:null;renderer.setClearColor(0,background?1:0);renderer.render(scene,cameras[angle]);const image=crop(renderer.domElement,!background);
    const depth=image&&!reuseDepthSrc?photographDepth(scene,cameras[angle],renderer):undefined;
    camera.clearViewOffset();scene.background=old;for(const [o,visible]of previous)o.visible=visible;
    if(!image||!depth&&!reuseDepthSrc)return null;const file=`${id}/${angle}-${name}.webp`;await emit(file,image.data);const depthSrc=reuseDepthSrc??file.replace(/\.webp$/,'.depth.png');if(depth){const tile=document.createElement('canvas');tile.width=image.width;tile.height=image.height;tile.getContext('2d')!.drawImage(depth,image.x,image.y,image.width,image.height,0,0,image.width,image.height);await emit(depthSrc,tile.toDataURL('image/png').split(',')[1]);}const {data,...meta}=image;return {src:file,depthSrc,...meta,x:meta.x+left,y:meta.y+top};
  }
  function foreground(o:THREE.Mesh){
    if(o.userData.mobileForeground)return true;
    const materials=Array.isArray(o.material)?o.material:[o.material];
    if(materials.some(material=>material.clippingPlanes?.some(plane=>plane.normal.y<-.9&&plane.constant<.7)))return true;
    return false;
  }
  if(existing&&(window as any).homeExtras){
    const hitIds=Object.keys(plan.anchors);
    if(fixed)for(let a=0;a<4;a++){cap.cutaway(results.views[a].yaw);renderer.setSize(W,H);const hitSrc=id+'/'+a+'-interaction.png',image=photographInteractions(scene,cameras[a],renderer,hitIds,o=>ancestorInteraction(o,'kind')??ancestorInteraction(o,'fixtureRequires'));await emit(hitSrc,image.split(',')[1]);existing.views[a].hitSrc=hitSrc;existing.views[a].hitIds=hitIds;}
    for(const weather of ['rain','snow'] as const){view.update({...initial,weather});await cap.settle();for(let a=0;a<4;a++){if(fixed){existing.views[a].weatherBase??={};existing.views[a].weatherBase[weather]=await shot(a,'weather-'+weather+'-base',o=>meshIn(o,cap.room)||meshIn(o,cap.furniture)||meshIn(o,cap.fittings)||exteriorMesh(o),true,existing.views[a].base.depthSrc);}else{existing.views[a].weatherBackground??={};existing.views[a].weatherBackground[weather]=await shot(a,'weather-'+weather+'-context',o=>exteriorMesh(o),true,existing.views[a].background.depthSrc);}}}
    clearPhotographDepth();view.dispose();host.replaceChildren();return existing;
  }
  if(existing){
    for(const style of [defaultHomeDecor(id).wall,...HOME_DECOR_CATALOG.filter(s=>s.surface==='wall')]){view.update({...initial,decor:{...initial.decor!,wall:style}});await cap.settle();for(let a=0;a<4;a++){const wallMesh=(o:THREE.Mesh)=>meshIn(o,cap.room)&&!floorMesh(o)||meshIn(o,cap.fittings)&&!ownedFitting(o);existing.views[a].walls[style.id]=await shot(a,`wall-${style.id.replace(/[^a-z0-9_-]/gi,'')}`,o=>wallMesh(o)&&!foreground(o));existing.views[a].foreground??={};existing.views[a].foreground[style.id]=await shot(a,`foreground-${style.id.replace(/[^a-z0-9_-]/gi,'')}`,o=>wallMesh(o)&&foreground(o));}}
    clearPhotographDepth();view.dispose();host.replaceChildren();return existing;
  }
  if(fixed){for(let a=0;a<4;a++)results.views[a].base=await shot(a,'base',o=>meshIn(o,cap.room)||meshIn(o,cap.furniture)||meshIn(o,cap.fittings)||exteriorMesh(o),true);}
  else{
    for(let a=0;a<4;a++)results.views[a].background=await shot(a,'context',o=>exteriorMesh(o),true);
    // Floor and wall finishes have independent assets; no combinatorial room copies.
    for(const surface of ['floor','wall']as const){for(const style of [defaultHomeDecor(id)[surface],...HOME_DECOR_CATALOG.filter(s=>s.surface===surface)]){
      const state={...initial,decor:{...initial.decor!,[surface]:style}};view.update(state);await cap.settle();
      for(let a=0;a<4;a++){const wallMesh=(o:THREE.Mesh)=>meshIn(o,cap.room)&&!floorMesh(o)||meshIn(o,cap.fittings)&&!ownedFitting(o);const record=await shot(a,`${surface}-${style.id.replace(/[^a-z0-9_-]/gi,'')}`,o=>surface==='floor'?floorMesh(o):wallMesh(o)&&!foreground(o),false);results.views[a][surface==='floor'?'floor':'walls'][style.id]=record;if(surface==='wall')results.views[a].foreground[style.id]=await shot(a,`foreground-${style.id.replace(/[^a-z0-9_-]/gi,'')}`,o=>wallMesh(o)&&foreground(o));}
    }}
    // All supported equipment tiers, plus the empty mandatory fitting, are photographed.
    for(const [kind,anchor]of Object.entries(plan.anchors)){
      const family=HOME_FURNITURE[kind as HomeFurnitureKind],items:[string|undefined,...(string|undefined)[]]=[undefined,...(family?.items??[])];
      for(const item of items){for(const layout of [0,...(anchor!.alternatives?.length&&anchor!.alternativeRotation!==undefined&&anchor!.alternativeRotation!==anchor!.rotation?[1]:[])]){
        const object={...initial.objects.find(o=>o.kind===kind)!,item,rotation:layout?anchor!.alternativeRotation:anchor!.rotation};
        const state={...initial,objects:initial.objects.map(o=>o.kind===kind?object:o)};view.update(state);await cap.settle();
        const group=cap.furniture.children.find(g=>g.userData.kind===kind),origin=new THREE.Vector3(object.position[0],0,object.position[1]);
        const groups=[group,...cap.fittings.children.filter(g=>g.userData.kind===kind||g.userData.fixtureRequires===kind)].filter(Boolean)as THREE.Object3D[];
        const bounds=group?new THREE.Box3().setFromObject(group):new THREE.Box3(origin,origin);
        for(let a=0;a<4;a++){
          const key=`${kind}:${item??'none'}:${layout}`,sprite=await shot(a,`object-${kind}-${item??'none'}-${layout}`,o=>!!group&&meshIn(o,group)),fittings=await shot(a,`fitting-${kind}-${item??'none'}-${layout}`,o=>groups.slice(1).some(g=>meshIn(o,g)));
          results.views[a].sprites[key]={sprite,fittings,origin:origin.toArray(),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};
        }
      }}
    }
    // Cat shelters/supplies retain breed, purchased tier and sleep/wake state.
    for(const catId of ['orange','mint','golden','roundhead'])for(const bed of ['cat_bed_basic','cat_bed_good','cat_bed_lux'])for(const awake of [false,true]){
      view.update({...initial,hour:awake?23:12,cats:[{uid:'bake',catId,name:'Cat'}],catItems:[{kind:'bed',item:bed}]});await cap.settle();const group=cap.petModels.children[0];if(!group)continue;
      const origin=group.position.clone(),rotation=group.rotation.y,scale=group.scale.x;
      for(let a=0;a<4;a++)results.views[a].pets[`${catId}:${bed}:${awake}`]={sprite:await shot(a,`cat-${catId}-${bed}-${awake}`,o=>meshIn(o,group)),origin:origin.toArray(),rotation,scale};
    }
    for(const [kind,items]of Object.entries({bowls:[undefined],litter:[undefined],toy:['cat_toy_basic','cat_toy_good','cat_toy_lux'],train:['cat_train_basic','cat_train_good','cat_train_lux'],device:['cat_auto_feeder']}))for(const item of items){
      view.update({...initial,cats:[{uid:'bake',catId:'orange',name:'Cat'}],catItems:item?[{kind:kind as any,item}]:[]});await cap.settle();const group=cap.petSupplies.children.find(g=>g.name==='cat-'+kind);if(!group)continue;
      for(let a=0;a<4;a++)results.views[a].pets[`${kind}:${item??'none'}`]={sprite:await shot(a,`supply-${kind}-${item??'none'}`,o=>meshIn(o,group)),origin:group.position.toArray(),scale:group.scale.x};
    }
  }
  clearPhotographDepth();view.dispose();host.replaceChildren();return results;
};
