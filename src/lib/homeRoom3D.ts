import * as THREE from 'three';
import {displayPixelScale,type RenderResolution} from './renderResolution';
import {createSceneReadiness,createSceneWorkBudget,sceneRenderIsCovered,loadSceneModel} from './sceneLoadWork';
import {sceneFrameSeconds,sceneFollowBlend} from './sceneAnimation';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {addHomeBookcase,addHomePlant,addHomeQuilt} from './homeDecorModels';
import type {HomeObjectKind,HomePlan,HomePoint} from '../game/core/homeInterior';
import {homeLightScheme,homeCeilingAreas,homeShadowSource} from '../game/core/homeLighting';
import {defaultHomeDecor} from '../game/core/homeDecor';
import {homeSurfaceTexture} from './homeSurfaceTextures';
import {addBedTierDetails,addShowerTierDetails,addGymTierDetails} from './homeFurnitureTierDetails';
import {addHomeComputer,fitHomeModelToFootprint,prepareHomeMonitorSurface,addHomeModelKeyboardKeycaps,type HomeComputerTier} from './homeComputerModel';
import {addHomeFixture} from './homeFixtureModels';
import {addHomeLifeDetails} from './homeLifeDetails';
import {addHomeSofa,addHomeWardrobe,addHomeFridge,addHomeKitchen} from './homeFurnishingModels';
import {addHomeLampShade,homeTube} from './homeObjectShapes';
import {createHomeOutline} from './homeOutline';
import {addHomeCatNest,addHomeCatSupply} from './homeCatModels';
import {homePetSpots,homeCatNestPlacement,type HomeObstacle} from './homePetPlacement';
import {homeWallHeight,homeExteriorWallHeight,HOME_LOW_WALL_HEIGHT,clampLowWallHeight,type HomeWallMode} from './homeWallView';
import {homeVisualLightScheme,prepareHomeVisualModel,type HomeRoomVisuals,type HomeVisualModel} from './homeVisualModels';
import {homeSceneQuality,homePixelRatio,type HomeDeviceMode} from './homeQuality';
import {clampRenderScale} from './mobileLayout';
import type {QualityMode} from './scenePipeline';
import {createSceneExterior,cladExteriorBox} from './sceneExterior';
import {insideOutline,homeExteriorLayout,type ExteriorSide} from './sceneExterior/layout';
import {homeExteriorDistance} from './sceneExterior/framing';
import {createWallTransition} from './wallTransition';

const textures = import.meta.glob('/src/assets/home/v1.49/materials/*.webp', {eager:true,import:'default'}) as Record<string,string>;
const modelUrls = import.meta.glob('/src/assets/home/v1.49/models/*.glb', {eager:true,query:'?url',import:'default'}) as Record<string,string>;
RectAreaLightUniformsLib.init();
export { homeRoomState, homePreviewRoom } from './homeRoomState';
export type { HomeRoomObject, HomeRoomState, HomeRoomLabel, HomeRoomView } from './homeRoomState';
import type { HomeRoomObject, HomeRoomState, HomeRoomLabel, HomeRoomView } from './homeRoomState';
/** Offline asset baker only. The mobile renderer never imports this module. */
export interface HomeRoomCaptureView extends HomeRoomView {
  capture():{scene:THREE.Scene;renderer:THREE.WebGLRenderer;room:THREE.Group;furniture:THREE.Group;fittings:THREE.Group;petModels:THREE.Group;petSupplies:THREE.Group;floorMaterial:THREE.Material;wallMaterials:Set<THREE.MeshStandardMaterial>;settle():Promise<void>;cutaway(yaw:number):void};
}
export function pointInsideHome(plan:HomePlan,x:number,z:number):boolean {
  let inside=false;
  for(let i=0,j=plan.outline.length-1;i<plan.outline.length;j=i++){
    const a=plan.outline[i],b=plan.outline[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
const cameraFloors=new WeakMap<HomePlan,number[][]>();
/** Continuous horizontal and vertical spans of the floor, ignoring internal rooms. */
function cameraFloorRects(plan:HomePlan):number[][] {
  const cached=cameraFloors.get(plan);if(cached)return cached;
  const xs=[...new Set(plan.outline.map(p=>p[0]))].sort((a,b)=>a-b),zs=[...new Set(plan.outline.map(p=>p[1]))].sort((a,b)=>a-b);
  const rects:number[][]=[];
  function spans(cuts:number[],along:number[],vertical:boolean){
    for(let i=0;i<cuts.length-1;i++){
      let start:number|undefined;const mid=(cuts[i]+cuts[i+1])/2;
      for(let j=0;j<along.length;j++){
        const a=(along[j]+along[j+1])/2;
        const inside=j<along.length-1&&pointInsideHome(plan,vertical?mid:a,vertical?a:mid);
        if(inside&&start===undefined)start=along[j];
        if(!inside&&start!==undefined){rects.push(vertical?[cuts[i],start,cuts[i+1]-cuts[i],along[j]-start]:[start,cuts[i],along[j]-start,cuts[i+1]-cuts[i]]);start=undefined;}
      }
    }
  }
  spans(zs,xs,false);spans(xs,zs,true);cameraFloors.set(plan,rects);return rects;
}
/** Keep the camera inside the full floor, including the apartment's L-shaped entry. */
export function clampHomePoint(plan:HomePlan,x:number,z:number,inset=.32):HomePoint {
  let best:HomePoint=[plan.size[0]/2,plan.size[1]/2],distance=Infinity;
  for(const [rx,rz,w,h]of cameraFloorRects(plan)){
    if(w<2*inset||h<2*inset)continue;
    const q:HomePoint=[THREE.MathUtils.clamp(x,rx+inset,rx+w-inset),THREE.MathUtils.clamp(z,rz+inset,rz+h-inset)];
    if(!pointInsideHome(plan,...q))continue;
    const d=(q[0]-x)**2+(q[1]-z)**2;
    if(d<distance){best=q;distance=d;}
  }
  return best;
}
/** Shorten the orbit along its own ray, preserving the requested facing angle. */
export function homeCameraEye(plan:HomePlan,target:HomePoint,yaw:number,distance:number,inset=.28):HomePoint {
  const direction:HomePoint=[Math.sin(yaw),Math.cos(yaw)],intervals:HomePoint[]=[];
  for(const [x,z,w,h]of cameraFloorRects(plan)){
    if(w<2*inset||h<2*inset)continue;
    let enter=0,leave=distance;
    for(const [axis,low,high]of [[0,x+inset,x+w-inset],[1,z+inset,z+h-inset]]){
      const d=direction[axis],origin=target[axis];
      if(Math.abs(d)<1e-9){if(origin<low||origin>high)leave=-1;continue;}
      const a=(low-origin)/d,b=(high-origin)/d;enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
    }
    if(enter<=leave)intervals.push([enter,leave]);
  }
  intervals.sort((a,b)=>a[0]-b[0]);let reach=0;
  for(const [enter,leave]of intervals){if(enter>reach+1e-8)break;reach=Math.max(reach,leave);}
  return [target[0]+direction[0]*reach,target[1]+direction[1]*reach];
}

export const HOME_CAMERA_TARGET_INSET=.95;
/** 查看目标只受整套住宅的矩形范围限制，凹角和墙面不参与镜头碰撞。 */
export function moveHomeCameraTarget(plan:HomePlan,_from:HomePoint,to:HomePoint,_inset=HOME_CAMERA_TARGET_INSET):HomePoint {
  const xs=plan.outline.map(p=>p[0]),zs=plan.outline.map(p=>p[1]);
  return [THREE.MathUtils.clamp(to[0],Math.min(...xs)-.5,Math.max(...xs)+.5),THREE.MathUtils.clamp(to[1],Math.min(...zs)-.5,Math.max(...zs)+.5)];
}
/** 固定轨道、固定俯角；镜头可以穿过外墙，墙体剖切负责让室内保持可见。 */
export function homeCameraPose(_plan:HomePlan,target:HomePoint,yaw:number,distance:number):{eye:HomePoint;height:number;pitch:number;radius:number} {
  const radius=distance;
  return {eye:[target[0]+Math.sin(yaw)*radius,target[1]+Math.cos(yaw)*radius],height:.62+radius*.91,pitch:-Math.atan(.91),radius};
}

/** 按整套住宅配置柔和日光阴影；修改范围后同步投影矩阵，避免沿旧视锥边缘出现硬切线。 */
export function configureHomeWindowShadow(light:THREE.DirectionalLight,plan:HomePlan):void {
  light.castShadow=false;light.shadow.mapSize.set(1024,1024);light.shadow.normalBias=.025;light.shadow.bias=-.00015;light.shadow.radius=3.5;light.shadow.intensity=.32;
  const span=Math.hypot(...plan.size)*.6+2,camera=light.shadow.camera;
  camera.left=-span;camera.right=span;camera.top=span;camera.bottom=-span;camera.near=.05;camera.far=Math.hypot(...plan.size)*2+12;camera.updateProjectionMatrix();
}
export function positionHomeWindowLight(light:THREE.DirectionalLight,plan:HomePlan,index:number,hour:number,towardRoom=false):void {
  const win=plan.windows[index],nx=win.wall==='left'?1:win.wall==='right'?-1:0,nz=win.wall==='back'?1:win.wall==='front'?-1:0;
  const focus=towardRoom?plan.rooms.find(room=>room.name===win.room):undefined;
  light.target.position.set((focus?focus.rect[0]+focus.rect[2]/2:plan.size[0]/2)+(hour-12)*.035,.15,focus?focus.rect[1]+focus.rect[3]/2:plan.size[1]/2);
  light.position.set(win.x+nx*.11,2.1,win.z+nz*.11);
  // 沿同一条光线后移投影相机，方向不变，近窗的地面也不会落到近裁面背后。
  light.position.addScaledVector(light.position.clone().sub(light.target.position).normalize(),Math.hypot(...plan.size)*.5+2);
}

/** 可穿墙的住宅查看镜头，前景墙体剖切；光照仍由固定的完整墙面计算。 */
export function createHomeRoom(host:HTMLElement,plan:HomePlan,onLabels:(labels:HomeRoomLabel[])=>void,onPick:(kind:HomeObjectKind)=>void,onPetPick?:(uid?:string)=>void,visuals?:HomeRoomVisuals):HomeRoomCaptureView|undefined {
  if(typeof WebGL2RenderingContext==='undefined'){visuals?.environment?.dispose();return;}
  let quality=visuals?.quality,qualityMode:QualityMode='auto',lastSnapshot:HomeRoomState|undefined;
  let exteriorMaxDistance=20;
  let resolution:RenderResolution=visuals?.resolution??'auto',renderScale=clampRenderScale(visuals?.renderScale??1),exteriorView=false,exteriorReady=false;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:quality?.id==='fine'?'high-performance':'low-power'});}catch{visuals?.environment?.dispose();return;}
  renderer.setPixelRatio(quality?.pixelRatio??Math.min(window.devicePixelRatio||1,visuals?.pixelRatioCap??1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.0;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;
  renderer.info.autoReset=false;
  renderer.localClippingEnabled=true;
  const canvas=renderer.domElement;
  canvas.setAttribute('aria-label','室内场景，拖动查看房间，点击家具使用');
  canvas.setAttribute('data-home-webgl','');canvas.addEventListener('webglcontextlost',()=>{if(!disposed)host.dispatchEvent(new CustomEvent('scene-context-lost',{bubbles:true}));});
  host.appendChild(canvas);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#ddd0b7');
  const camera=new THREE.PerspectiveCamera(57,1,.08,80);
  const room=new THREE.Group(),furniture=new THREE.Group(),fittings=new THREE.Group(),petModels=new THREE.Group(),petSupplies=new THREE.Group();scene.add(room,furniture,fittings,petModels,petSupplies);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const materials=new Set<THREE.Material>(),maps=new Set<THREE.Texture>();
  const additionBoundsMaterial=new THREE.MeshBasicMaterial({visible:false});materials.add(additionBoundsMaterial);
  if(visuals?.environment){scene.environment=visuals.environment;maps.add(visuals.environment);}
  const cache=new Map<string,THREE.MeshStandardMaterial>();
  let capturePaused=false,disposed=false,frame=0,width=1,height=1,yaw=.50,distance=plan.openKitchen?4.6:3.45,pendingTextures=0,pendingModels=0;
  const readiness=createSceneReadiness(),checkpoint=createSceneWorkBudget(()=>disposed);
  let pendingAssembly=0,snapshotApplied=false,updating=false,nextSnapshot:HomeRoomState|undefined;
  let firstPresented=false,shadersReady=false,shaderWarmup:Promise<void>|undefined;
  function assemble<T>(task:Promise<T>):Promise<T>{
    pendingAssembly++;
    const tracked=task.finally(()=>{pendingAssembly--;request();});
    void tracked.catch(error=>{if(!disposed)readiness.fail(error);});
    return tracked;
  }
  const bed=plan.anchors.bed!.position;
  let target:HomePoint=clampHomePoint(plan,bed[0]-.1,bed[1]+.45,HOME_CAMERA_TARGET_INSET),objects:HomeRoomObject[]=[],stamp='';
  let shownTarget:HomePoint=[...target],shownYaw=yaw,shownDistance=distance,lastFrame=0,renderCount=0;
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const anchors=new Map<HomeObjectKind,THREE.Vector3>();
  const occluders:THREE.Object3D[]=[],shadowOnly:THREE.Object3D[]=[];
  let outline=createHomeOutline(renderer,scene,camera,shadowOnly,quality?.contactShadows??visuals?.contactShadows,quality);
  outline.setContactObjects(()=>[furniture,fittings,petModels,petSupplies]);
  let selectedKind:HomeObjectKind|null=null,hoveredKind:HomeObjectKind|null=null,selectedModel:THREE.Object3D|undefined,hoveredModel:THREE.Object3D|undefined;
  function highlight(){const model=selectedModel??(selectedKind?undefined:hoveredModel),kind=selectedKind??hoveredKind;outline.select(model?[model]:kind?furniture.children.filter(o=>o.userData.kind===kind):[]);host.dataset.homeOutline=JSON.stringify({kind:model?.userData.kind??kind,selected:!!(selectedModel||selectedKind),color:"#ffffff"});request();}
  // A small reflected-light approximation. Direct sources are only windows and fittings.
  const fill=new THREE.HemisphereLight('#d8e2ed','#6d6054',.2);scene.add(fill);
  const windowLights:THREE.DirectionalLight[]=[],windowDiffuse:THREE.RectAreaLight[]=[],ceilingLights:THREE.SpotLight[]=[],windowPanes:THREE.MeshStandardMaterial[]=[],lampGlows:THREE.MeshStandardMaterial[]=[];
  const internalWalls:{mesh:THREE.Mesh;cap:THREE.Mesh;segment:number[];height:number;fullHeight:number;base:number;exterior:boolean;transition:ReturnType<typeof createWallTransition>;desired?:number}[]=[],windowCuts:{plane:THREE.Plane;segment:number[];height:number;desired?:number}[]=[],lampLights:THREE.PointLight[]=[],wallSurfaces=new Set<THREE.MeshStandardMaterial>();
  let wallMode:HomeWallMode='cutaway',lowWallHeight=HOME_LOW_WALL_HEIGHT;
  const exterior=createSceneExterior(scene,{kind:'home',width:plan.size[0],depth:plan.size[1],height:2.65,detail:quality?.id??'light',anisotropy:Math.min(quality?.anisotropy??4,renderer.capabilities.getMaxAnisotropy()),plan,host,request:()=>{renderer.shadowMap.needsUpdate=true;request();}});
outline.setWeatherLayer(exterior.weatherLayer);host.addEventListener('scene-weather-resume',request);
  void exterior.ready.then(()=>{if(disposed)return;exteriorReady=true;renderer.shadowMap.needsUpdate=true;request();}).catch(error=>{if(!disposed)readiness.fail(error);});
  const cameraTarget=(from:HomePoint,to:HomePoint):HomePoint=>exteriorView?[THREE.MathUtils.clamp(to[0],-.5,plan.size[0]+.5),THREE.MathUtils.clamp(to[1],-.5,plan.size[1]+1.9)]:moveHomeCameraTarget(plan,from,to);
  const surfaceMaps=new Map<string,THREE.Texture>();let finishStamp='';
  const modelLoader=new GLTFLoader(),modelTemplates=new Map<string,THREE.Object3D>(),modelRequests=new Map<string,Promise<THREE.Object3D|undefined>>();
  const modelMaps=new Set<THREE.Texture>(),windowDetails:{fallback:THREE.Object3D[];detail:THREE.Group;loaded:boolean;loading:boolean;ensure:()=>void}[]=[];
  let scheme=homeLightScheme(12,9,'sunny');
  let catStamp='',supplyStamp='',catAwake:boolean|undefined;
  function request(){if(!disposed&&!capturePaused&&!frame){host.dataset.homeCameraAnimating='true';lastFrame ||= performance.now();frame=requestAnimationFrame(now=>{try{render(now);}catch(error){readiness.fail(error);console.error('Home scene render failed',error);}});}}
  function material(color:string,key?:string,repeat=1,roughness=.8){
    const id=[color,key,repeat,roughness].join(':');const saved=cache.get(id);if(saved)return saved;
    const m=new THREE.MeshStandardMaterial({color,roughness});materials.add(m);cache.set(id,m);
    const url=key?textures[`/src/assets/home/v1.49/materials/${key}.webp`]:undefined;
    if(url){pendingTextures++;const complete=()=>{pendingTextures--;request();};const map=new THREE.TextureLoader().load(url,complete,undefined,()=>{host.dataset.homeTextureError=key;complete();});map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(repeat,repeat);map.anisotropy=Math.min(quality?.anisotropy??4,renderer.capabilities.getMaxAnisotropy());maps.add(map);m.map=map;}
    return m;
  }
  const wood=material('#dcc5a3','floor-warm-wood',1),darkWood=material('#8f6b48','floor-warm-wood'),white=material('#f4efe4'),cream=material('#e4dcc8'),fabric=material('#adb69f','upholstery-light-sage-gray'),metal=material('#aaaeb0',undefined,1,.35),dark=material('#333838'),tile=material('#e4e3d8','tile-light-gray-white',1);
  metal.metalness=.65;white.roughness=.32;cream.roughness=.55;fabric.roughness=.94;
  const floorWood=material('#d1c9b5','floor-warm-wood',1,.95),bathStone=material('#bdb7a8',undefined,1,.98);
  const foodPalette=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.48,vertexColors:true});materials.add(foodPalette);
  const decor={wood,darkWood,white,cream,fabric,metal,palette:foodPalette,color:(c:string)=>material(c)};
  function makeDisplay(kind:'terminal'|'office'|'gaming'){
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
    const context=canvas.getContext('2d');
    if(context){
      const c=context;
      if(kind==='terminal'){
        c.fillStyle='#172326';c.fillRect(0,0,640,360);c.fillStyle='#29383a';c.fillRect(0,0,640,42);
        c.fillStyle='#b8c6bb';c.font='bold 21px sans-serif';c.fillText('都市生活  /  开发终端',24,28);
        c.fillStyle='#85bba2';c.font='18px monospace';
        ['> project status: ready','> home scene loaded','> coffee break pending','> _'].forEach((line,i)=>c.fillText(line,28,92+i*48));
        c.fillStyle='#54746a';c.fillRect(26,284,588,2);
      }else if(kind==='office'){
        c.fillStyle='#d7dfd9';c.fillRect(0,0,640,360);c.fillStyle='#687973';c.fillRect(0,0,640,44);
        c.fillStyle='#f5f2e9';c.font='bold 20px sans-serif';c.fillText('工作台  ·  今日计划',24,29);
        c.fillStyle='#aebdb2';c.fillRect(0,44,126,316);c.fillStyle='#edf0e9';c.fillRect(24,72,575,254);
        c.fillStyle='#4d625c';c.font='bold 23px sans-serif';c.fillText('项目进度',154,112);
        c.fillStyle='#91a89a';c.fillRect(154,140,394,16);c.fillStyle='#59796d';c.fillRect(154,140,286,16);
        c.fillStyle='#8b9991';c.font='16px sans-serif';['整理任务清单','检查房间模型','保存今天的进度'].forEach((line,i)=>{c.fillStyle='#71887b';c.fillRect(158,188+i*38,13,13);c.fillStyle='#60736b';c.fillText(line,184,201+i*38);});
      }else{
        const sky=c.createLinearGradient(0,0,0,360);sky.addColorStop(0,'#172a37');sky.addColorStop(.7,'#314b54');sky.addColorStop(1,'#a58065');c.fillStyle=sky;c.fillRect(0,0,640,360);
        c.fillStyle='#1f343a';[[24,192,76,168],[108,162,66,198],[184,206,84,154],[282,174,71,186],[376,196,93,164],[491,159,58,201],[557,207,66,153]].forEach(([x,y,w,h])=>c.fillRect(x,y,w,h));
        c.fillStyle='#f0e6d2';c.font='bold 39px sans-serif';c.fillText('CITY SHIFT',34,82);c.fillStyle='#d1d8cd';c.font='18px sans-serif';c.fillText('游戏启动器',37,113);
        c.fillStyle='#adc2b6';c.fillRect(38,286,174,38);c.fillStyle='#25383b';c.font='bold 18px sans-serif';c.fillText('开始游戏',77,312);
      }
    }
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;maps.add(map);
    const display=new THREE.MeshStandardMaterial({color:'#ffffff',map,emissive:'#ffffff',emissiveMap:map,emissiveIntensity:.5,roughness:.42});materials.add(display);return display;
  }
  const screen=makeDisplay('terminal'),screenOffice=makeDisplay('office'),screenGaming=makeDisplay('gaming');
  const glass=new THREE.MeshStandardMaterial({color:'#bccfc6',transparent:true,opacity:.2,roughness:.12,depthWrite:false});materials.add(glass);
  function box(parent:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material,rounded=false){
    const geometry=rounded?new RoundedBoxGeometry(w,h,d,2,Math.min(.075,w/5,h/5,d/5)):new THREE.BoxGeometry(w,h,d);
    const mesh=new THREE.Mesh(geometry,m);mesh.position.set(x,y,z);mesh.castShadow=m!==glass;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function disposeLoadedModel(root:THREE.Object3D){
    const disposedMaterials=new Set<THREE.Material>(),disposedTextures=new Set<THREE.Texture>();
    root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])disposedMaterials.add(m);}});
    disposedMaterials.forEach(m=>{for(const value of Object.values(m))if(value instanceof THREE.Texture)disposedTextures.add(value);m.dispose();});
    disposedTextures.forEach(texture=>texture.dispose());
  }
  function loadHomeModel(name:string,overrideUrl?:string):Promise<THREE.Object3D|undefined>{
    const cached=modelTemplates.get(name);if(cached)return Promise.resolve(cached);
    const pending=modelRequests.get(name);if(pending)return pending;
    const key=`/src/assets/home/v1.49/models/${name}.glb`,url=overrideUrl??modelUrls[key];
    if(!url){host.dataset.homeModelError=`missing:${name}.glb`;return Promise.resolve(undefined);}
    pendingModels++;
    const task:Promise<THREE.Object3D|undefined>=loadSceneModel(()=>modelLoader.loadAsync(url),()=>disposed).then(gltf=>{
      if(disposed){disposeLoadedModel(gltf.scene);return undefined;}
      gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])for(const value of Object.values(material))if(value instanceof THREE.Texture){value.anisotropy=Math.min(quality?.anisotropy??4,renderer.capabilities.getMaxAnisotropy());modelMaps.add(value);}});
      modelTemplates.set(name,gltf.scene);return gltf.scene;
    }).catch(error=>{if(!disposed)host.dataset.homeModelError=`${name}.glb:${String(error)}`;return undefined;}).finally(()=>{pendingModels--;request();});
    modelRequests.set(name,task);return task;
  }
  function cloneHomeModel(template:THREE.Object3D,name:string,palette:Record<string,THREE.Material>):THREE.Object3D{
    const clone=template.clone(true);clone.name=name;clone.userData.homeSharedModel=true;clone.userData.kind='computer';
    if(name.endsWith('-kenney-screen'))prepareHomeMonitorSurface(clone);
    if(name.endsWith('-kenney-keyboard'))addHomeModelKeyboardKeycaps(clone,palette.metalMedium as THREE.MeshStandardMaterial);
    clone.traverse(o=>{if(o instanceof THREE.Mesh){
      const source=Array.isArray(o.material)?o.material:[o.material],mapped=source.map(m=>palette[m.name]??m);
      o.material=Array.isArray(o.material)?mapped:mapped[0];o.castShadow=true;o.receiveShadow=true;o.userData.homeSharedModel=!o.userData.homeGenerated;o.userData.kind='computer';
    }});
    return clone;
  }
  function releaseProceduralGroup(group:THREE.Group){
    group.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.homeSharedModel)o.geometry.dispose();});
    group.parent?.remove(group);group.clear();
  }
  function refreshFurnitureBounds(){
    furniture.updateMatrixWorld(true);
    host.dataset.homeBounds=JSON.stringify(furniture.children.map(g=>{const b=new THREE.Box3().setFromObject(g);return {kind:g.userData.kind,min:b.min.toArray(),max:b.max.toArray()};}));
    const imported:string[]=[];furniture.traverse(o=>{if(o.name.includes('-kenney'))imported.push(o.name);});host.dataset.homeModels=JSON.stringify(imported);
    const props=new Set<string>();for(const parent of [furniture,fittings])parent.traverse(o=>{for(const id of o.userData.homeFoodModels??[])props.add(id);});host.dataset.homeFoodModels=JSON.stringify([...props]);
    if(visuals){const imported:{id:string;min:number[];max:number[]}[]=[];for(const parent of [room,furniture,fittings])parent.traverse(o=>{if(o.userData.homeVisualModel){const bounds=new THREE.Box3().setFromObject(o);imported.push({id:o.userData.homeVisualModel,min:bounds.min.toArray(),max:bounds.max.toArray()});}});host.dataset.homeVisualModels=JSON.stringify(imported);}
    fittings.updateMatrixWorld(true);host.dataset.homeFixtureBounds=JSON.stringify(fittings.children.map(g=>{const b=new THREE.Box3().setFromObject(g);return {kind:g.name,min:b.min.toArray(),max:b.max.toArray(),decorative:!!g.userData.decorative};}));
  }
  function mountVisual(parent:THREE.Group,spec:HomeVisualModel,kind?:HomeObjectKind,replace:THREE.Object3D[]=[],clippingPlanes?:THREE.Plane[]){
    return assemble(loadHomeModel(`visual:${spec.url}`,spec.url).then(template=>{
      if(!template||disposed||!scene.getObjectById(parent.id))return false;
      const prepared=prepareHomeVisualModel(template,spec,kind,clippingPlanes);if(!prepared)return false;
      for(const previous of replace){if(previous.parent!==parent)continue;previous.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.homeSharedModel)o.geometry.dispose();});parent.remove(previous);}
      prepared.ownedMaterials.forEach(material=>materials.add(material));parent.add(prepared.model);
      parent.updateMatrixWorld(true);refreshFurnitureBounds();outline.invalidateContacts();renderer.shadowMap.needsUpdate=true;highlight();request();return true;
    }));
  }
  function syncWindowDetail(){
    for(const window of windowDetails){const fine=quality?.id!=='light';if(fine)window.ensure();window.detail.visible=fine&&window.loaded;for(const fallback of window.fallback)fallback.visible=!window.detail.visible;}
  }
  function loadChair(group:THREE.Group,fallback:THREE.Group){
    void assemble(loadHomeModel('chairDesk').then(template=>{
      if(!template||disposed||fallback.parent!==group||!scene.getObjectById(group.id))return;
      const chair=cloneHomeModel(template,'computer-chair-kenney',{metalMedium:material('#52615b'),carpet:fabric});
      chair.rotation.y=Math.PI;
      if(!fitHomeModelToFootprint(chair,{centerX:0,centerZ:.58,baseY:.04,maxWidth:.54,maxHeight:1,maxDepth:.51}))return;
      group.add(chair);releaseProceduralGroup(fallback);group.updateMatrixWorld(true);refreshFurnitureBounds();outline.invalidateContacts();renderer.shadowMap.needsUpdate=true;request();
    }));
  }
  function loadDesktopComputer(group:THREE.Group,fallback:THREE.Group,tier:Exclude<HomeComputerTier,'basic'>){
    void assemble(Promise.all([loadHomeModel('computerScreen'),loadHomeModel('computerKeyboard'),loadHomeModel('computerMouse')]).then(([screenModel,keyboardModel,mouseModel])=>{
      if(!screenModel||!keyboardModel||!mouseModel||disposed||fallback.parent!==group||!scene.getObjectById(group.id))return;
      const premium=tier==='premium';
      const display=tier==='premium'?screenGaming:screenOffice;
      const monitor=cloneHomeModel(screenModel,`computer-${tier}-kenney-screen`,{metalDark:material(premium?'#303b3a':'#55625d'),metal:display});
      const keyboard=cloneHomeModel(keyboardModel,`computer-${tier}-kenney-keyboard`,{metalDark:material(premium?'#3b4743':'#6d7770'),metalMedium:material(premium?'#cbd6cc':'#ded9cd')});
      const mouse=cloneHomeModel(mouseModel,`computer-${tier}-kenney-mouse`,{metalDark:material(premium?'#36443f':'#64716b')});
      if(!fitHomeModelToFootprint(monitor,{centerX:-.075,centerZ:-.02,baseY:.827,maxWidth:.64,maxHeight:.46,maxDepth:.18})||
        !fitHomeModelToFootprint(keyboard,{centerX:-.065,centerZ:.205,baseY:.827,maxWidth:.39,maxHeight:.04,maxDepth:.16})||
        !fitHomeModelToFootprint(mouse,{centerX:.385,centerZ:.205,baseY:.835,maxWidth:.07,maxHeight:.04,maxDepth:.12}))return;
      const pad=fallback.getObjectByName(`computer-${tier}-mousepad`);
      if(pad){fallback.remove(pad);group.add(pad);}
      group.add(monitor,keyboard,mouse);releaseProceduralGroup(fallback);group.updateMatrixWorld(true);refreshFurnitureBounds();outline.invalidateContacts();renderer.shadowMap.needsUpdate=true;request();
    }));
  }
  function cylinder(parent:THREE.Group,x:number,y:number,z:number,r:number,h:number,m:THREE.Material,top=r){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(top,r,h,16),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  function ball(parent:THREE.Group,x:number,y:number,z:number,rx:number,ry:number,rz:number,m:THREE.Material){const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),m);mesh.position.set(x,y,z);mesh.scale.set(rx,ry,rz);mesh.castShadow=true;parent.add(mesh);return mesh;}
  function rod(parent:THREE.Group,a:THREE.Vector3,b:THREE.Vector3,r:number,m:THREE.Material){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,a.distanceTo(b),10),m);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());mesh.castShadow=true;parent.add(mesh);return mesh;}
  const shape=new THREE.Shape(plan.outline.map(([x,z])=>new THREE.Vector2(x,-z)));
  const floorGeometry=new THREE.ShapeGeometry(shape);floorGeometry.rotateX(-Math.PI/2);
  const uv=floorGeometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/plan.size[0],-uv.getY(i)/plan.size[1]);
  const floor=new THREE.Mesh(floorGeometry,floorWood);floor.receiveShadow=true;room.add(floor);
  for(const area of plan.rooms){if(['bath','kitchen'].includes(area.type)&&!(area.type==='kitchen'&&(plan.id==='studio'||plan.openKitchen))){const [x,z,w,d]=area.rect;box(room,x+w/2,.011,z+d/2,w,.02,d,plan.id==='studio'?bathStone:tile);}}
  // 所有墙恢复正常层高。可见墙面独立剖切，固定的实体阴影不会随镜头升降。
  const wallShadow=new THREE.MeshStandardMaterial({colorWrite:false,depthWrite:false});materials.add(wallShadow);
  function wall(x:number,z:number,x2:number,z2:number,h:number,m:THREE.MeshStandardMaterial,base=0,internal=false,cutSegment?:number[]){const length=Math.hypot(x2-x,z2-z);const own=m.clone();materials.add(own);wallSurfaces.add(own);const mesh=box(room,(x+x2)/2,base+h/2,(z+z2)/2,length,h,.12,own);const uv=mesh.geometry.getAttribute('uv'),positions=mesh.geometry.getAttribute('position');for(let i=0;i<uv.count;i++)uv.setXY(i,(positions.getX(i)+length/2)/2,(positions.getY(i)+h/2+base)/2);mesh.rotation.y=-Math.atan2(z2-z,x2-x);if(!internal){const nx=-(z2-z)/length,nz=(x2-x)/length,sign=insideOutline(plan.outline,(x+x2)/2+nx*.2,(z+z2)/2+nz*.2)?-1:1;cladExteriorBox(mesh,exterior.facadeMaterial,new THREE.Vector3(0,0,sign));mesh.userData.exteriorSide=(Math.abs(nx)>.5?(nx*sign<0?'left':'right'):(nz*sign<0?'back':'front')) as ExteriorSide;}occluders.push(mesh);
    const shadow=box(room,(x+x2)/2,base+h/2,(z+z2)/2,length,h,.12,wallShadow);shadow.rotation.y=mesh.rotation.y;shadow.receiveShadow=false;shadowOnly.push(shadow);mesh.castShadow=false;const cap=box(room,(x+x2)/2,base+h,(z+z2)/2,length,.035,.13,cream);cap.rotation.y=mesh.rotation.y;cap.castShadow=false;internalWalls.push({mesh,cap,segment:cutSegment??[x,z,x2,z2],height:2.65,fullHeight:h,base,exterior:!internal,transition:createWallTransition(2.65)});
    if(base===0){const skirting=box(room,(x+x2)/2,.065,(z+z2)/2,length,.13,.15,cream);skirting.rotation.y=mesh.rotation.y;skirting.userData.mobileWallSegment=cutSegment??[x,z,x2,z2];}}
  const entryLayout=homeExteriorLayout(plan),doorCut=new THREE.Plane(new THREE.Vector3(0,-1,0),2.65);
  const wallMat=material(plan.id==='studio'?'#dbd2bd':'#e2ddd0','wall-warm-gray-beige');
  async function buildStructure(){
    await checkpoint(true);
  for(let i=0;i<plan.outline.length;i++){
    await checkpoint();
    const a=plan.outline[i],b=plan.outline[(i+1)%plan.outline.length];
    const horizontal=Math.abs(a[1]-b[1])<1e-6,lo=Math.min(horizontal?a[0]:a[1],horizontal?b[0]:b[1]),hi=Math.max(horizontal?a[0]:a[1],horizontal?b[0]:b[1]);
    const holes=plan.windows.filter(w=>horizontal?Math.abs(w.z-a[1])<1e-6&&w.x-w.width/2>=lo-1e-6&&w.x+w.width/2<=hi+1e-6:Math.abs(w.x-a[0])<1e-6&&w.z-w.width/2>=lo-1e-6&&w.z+w.width/2<=hi+1e-6).map(win=>({...win,bottom:1.04,top:2.38}));
    if(entryLayout.a[0]===a[0]&&entryLayout.a[1]===a[1]&&entryLayout.b[0]===b[0]&&entryLayout.b[1]===b[1])holes.push({x:entryLayout.center[0],z:entryLayout.center[1],width:1.03,bottom:0,top:2.28,wall:'front',room:'玄关'});
    holes.sort((u,v)=>horizontal?u.x-v.x:u.z-v.z);
    const cutSegment=[...a,...b];
    if(!holes.length){wall(...a,...b,2.65,wallMat,0,false,cutSegment);continue;}
    let start=lo;
    const segment=(from:number,to:number,h:number,base=0)=>{if(to-from>.01)horizontal?wall(from,a[1],to,a[1],h,wallMat,base,false,cutSegment):wall(a[0],from,a[0],to,h,wallMat,base,false,cutSegment);};
    for(const win of holes){const center=horizontal?win.x:win.z,from=center-win.width/2,to=center+win.width/2;segment(start,from,2.65);if(win.bottom>0)segment(from,to,win.bottom);segment(from,to,2.65-win.top,win.top);start=to;}segment(start,hi,2.65);
  }
  for(const p of plan.partitions){wall(...p,2.65,wallMat,0,true);await checkpoint();}
  // The ceiling participates in shadowing but is hidden from the viewing camera.
  const roofMat=new THREE.MeshStandardMaterial({side:THREE.DoubleSide,colorWrite:false,depthWrite:false});materials.add(roofMat);
  const roof=new THREE.Mesh(floorGeometry.clone(),roofMat);roof.position.y=2.9;roof.castShadow=true;room.add(roof);shadowOnly.push(roof);
  for(const win of plan.windows){
    await checkpoint();
    const group=new THREE.Group();group.position.set(win.x,0,win.z);group.rotation.y=win.wall==='left'?Math.PI/2:win.wall==='right'?-Math.PI/2:win.wall==='front'?Math.PI:0;room.add(group);
    const nx=win.wall==='left'?1:win.wall==='right'?-1:0,nz=win.wall==='back'?1:win.wall==='front'?-1:0;
    const paneMat=new THREE.MeshStandardMaterial({color:'#bdd9e6',emissive:'#bdd9e6',emissiveIntensity:.3,roughness:.5});materials.add(paneMat);windowPanes.push(paneMat);
    box(group,0,1.71,.075,win.width,1.3,.035,paneMat).castShadow=false;
    for(const x of [-win.width/2,0,win.width/2])box(group,x,1.71,.12,.035,1.34,.05,white);
    for(const y of [1.04,2.38])box(group,0,y,.12,win.width+.1,.035,.06,white);
    box(group,0,1.01,.17,win.width+.2,.055,.25,wood);
    for(const x of [-win.width/2-.1,win.width/2+.1]){const curtain=visuals?box(group,x,1.32,.38,.34,2.12,.09,material('#a5aaac','upholstery-light-sage-gray'),true):box(group,x,1.62,.15,.17,1.5,.09,material('#c9bea4','upholstery-light-sage-gray'),true);curtain.name='window-curtain-fallback';}
    const owner=internalWalls.find(w=>w.exterior&&Math.abs((w.segment[2]-w.segment[0])*(win.z-w.segment[1])-(w.segment[3]-w.segment[1])*(win.x-w.segment[0]))<.001&&win.x>=Math.min(w.segment[0],w.segment[2])-.01&&win.x<=Math.max(w.segment[0],w.segment[2])+.01&&win.z>=Math.min(w.segment[1],w.segment[3])-.01&&win.z<=Math.max(w.segment[1],w.segment[3])+.01);
    if(owner){const plane=new THREE.Plane(new THREE.Vector3(0,-1,0),2.65);windowCuts.push({plane,segment:owner.segment,height:2.65});group.traverse(o=>{if(o instanceof THREE.Mesh){const clipped=(o.material as THREE.MeshStandardMaterial).clone();clipped.clippingPlanes=[plane];materials.add(clipped);o.material=clipped;if(o===group.children[0])windowPanes.push(clipped);}});}
    if(visuals?.windows){
      const clipping=windowCuts.find(cut=>cut.segment===owner?.segment)?.plane,input=visuals.windows(win),specs=Array.isArray(input)?input:[input],fallbacks=group.children.filter(child=>child.name==='window-curtain-fallback');
      if(!specs.length)for(const fallback of fallbacks){(fallback as THREE.Mesh).geometry.dispose();group.remove(fallback);}
      else{
        const detail=new THREE.Group();detail.name='window-curtain-detail';detail.visible=false;group.add(detail);
        const record:typeof windowDetails[number]&{failed:boolean}={fallback:fallbacks,detail,loaded:false,loading:false,failed:false,ensure(){
          if(record.loaded||record.loading||record.failed)return;record.loading=true;
          void assemble(Promise.all(specs.map(spec=>mountVisual(detail,spec,undefined,[],clipping?[clipping]:undefined))).then(results=>{
            if(disposed)return;record.loading=false;record.loaded=results.every(Boolean);record.failed=!record.loaded;syncWindowDetail();renderer.shadowMap.needsUpdate=true;request();
          }));
        }};
        windowDetails.push(record);
      }
    }
    const diffuse=new THREE.RectAreaLight('#f4f6ff',3.2,win.width,1.3);
    diffuse.position.set(win.x+nx*.11,1.71,win.z+nz*.11);
    diffuse.lookAt(win.x+nx,1.71,win.z+nz);scene.add(diffuse);windowDiffuse.push(diffuse);
    const light=new THREE.DirectionalLight('#f4f6ff',.45);
    light.position.set(win.x+nx*.11,2.1,win.z+nz*.11);
    const area=plan.rooms.find(r=>r.name===win.room)!;light.target.position.set(area.rect[0]+area.rect[2]*.55,.15,area.rect[1]+area.rect[3]*.6);scene.add(light,light.target);
    configureHomeWindowShadow(light,plan);if(quality)light.shadow.mapSize.setScalar(quality.windowShadowSize);windowLights.push(light);
  }
  const fixtureAreas=homeCeilingAreas(plan);
  for(const area of fixtureAreas){
    await checkpoint();
    const x=area.rect[0]+area.rect[2]/2,z=area.rect[1]+area.rect[3]/2;
    // Ceiling fittings are above the cutaway camera layer; their light remains.
    const glow=new THREE.MeshStandardMaterial({color:'#f3ede1',emissive:'#ffd2a0',emissiveIntensity:0,colorWrite:false,depthWrite:false});materials.add(glow);lampGlows.push(glow);cylinder(room,x,2.72,z,.17,.02,glow);
    const light=new THREE.SpotLight('#ffd2a0',0,9,Math.PI*.43,.95,2);light.position.set(x,2.55,z);light.target.position.set(x,0,z);scene.add(light.target);light.castShadow=false;light.shadow.mapSize.setScalar(quality?.ceilingShadowSize??512);light.shadow.normalBias=.025;light.shadow.radius=3.5;light.shadow.intensity=.2;ceilingLights.push(light);scene.add(light);
  }
    syncWindowDetail();
  }
  // 只给当下的主光分配投影；其余窗光、顶灯和落地灯提供柔和补光。
  async function buildObject(object:HomeRoomObject){
    const {kind,item}=object;const group=new THREE.Group();group.position.set(object.position[0],0,object.position[1]);group.userData.kind=kind;furniture.add(group);
    let labelHeight=1.15,chairFallback:THREE.Group|undefined,computerFallback:THREE.Group|undefined,computerTier:Exclude<HomeComputerTier,'basic'>|undefined;
    if(kind==='bed'){
      const premium=item==='bed_premium',standard=item==='bed_standard';
      const bedFabric=material(premium?'#c4bca7':standard?'#9daebb':'#adb69f','upholstery-light-sage-gray');
      box(group,0,.28,0,1.55,.24,2.12,darkWood,true);
      box(group,0,.49,0,1.48,.25,2.03,white,true);addHomeQuilt(group,{...decor,fabric:bedFabric});
      box(group,0,.83,-1.04,1.65,premium?.95:standard?.7:.5,.12,premium?bedFabric:darkWood,true);
      for(const x of [-.72,.72])for(const z of [-.97,.97])cylinder(group,x,.14,z,.055,.3,darkWood);
      if(premium){
        for(const x of [-.37,.37])box(group,x,.71,-.72,.63,.17,.4,white,true);
      }else box(group,0,.71,-.72,standard?1.12:.93,.17,.4,white,true);
      addBedTierDetails(group,{...decor,fabric:bedFabric},premium?'premium':standard?'standard':'basic');
      labelHeight=1.0;
    }else if(kind==='computer'){
      box(group,0,.78,0,1.15,.09,.65,wood,true);
      for(const x of [-.5,.5])for(const z of [-.25,.25])box(group,x,.38,z,.06,.76,.06,darkWood);
      chairFallback=new THREE.Group();chairFallback.name='computer-chair-procedural-fallback';group.add(chairFallback);
      box(chairFallback,0,.44,.58,.45,.08,.46,fabric,true);box(chairFallback,0,.78,.79,.45,.55,.08,fabric,true);
      for(const x of [-.17,.17])for(const z of [.42,.73])cylinder(chairFallback,x,.2,z,.025,.4,darkWood);
      const proxyMaterial=new THREE.PointsMaterial({visible:false});materials.add(proxyMaterial);
      const chairProxy=new THREE.Points(new THREE.BoxGeometry(.45,1.055,.48),proxyMaterial);chairProxy.name='computer-chair-clearance-proxy';chairProxy.position.set(0,.5275,.59);chairProxy.visible=false;group.add(chairProxy);
      if(item){
        const tier=item==='laptop_pro'?'premium':item==='laptop_mid'?'standard':'basic';
        computerFallback=addHomeComputer(group,{...decor,screen,screenOffice,screenGaming,glass},tier);
        if(tier!=='basic')computerTier=tier;
      }
      addHomeLifeDetails(group,decor,'desk',{width:1.15,depth:.65,surfaceY:.825,level:plan.openKitchen?'rich':'simple'});
      labelHeight=1.38;
    }else if(kind==='wardrobe'){
      addHomeWardrobe(group,decor);
      labelHeight=2.25;
    }else if(kind==='bookshelf'){
      addHomeBookcase(group,decor);
      labelHeight=2.05;
    }else if(kind==='sofa'){
      addHomeSofa(group,decor);labelHeight=1.12;
      if(plan.id!=='studio'&&!plan.fixtures?.some(f=>f.kind==='coffeeTable')){const table=new THREE.Group();table.name='sofa-side-table';table.userData.homeVisualPreserve=true;group.add(table);cylinder(table,0,.42,1.12,.3,.06,wood);for(const x of [-.16,.16])for(const z of [.98,1.26])cylinder(table,x,.2,z,.022,.4,darkWood);}
    }else if(kind==='lamp'){
      cylinder(group,0,.025,0,.18,.05,dark);cylinder(group,0,.8,0,.023,1.55,metal);
      addHomeLampShade(group,decor,'floor-lamp',0,0,1.34,.18,.29,.36);labelHeight=1.87;
      const light=new THREE.PointLight('#ffd2a0',0,4.5,2);light.castShadow=false;light.position.set(0,1.49,0);group.add(light);lampLights.push(light);
    }else if(kind==='plant'){
      addHomePlant(group,decor);
      labelHeight=1.24;
    }else if(kind==='shower'){
      box(group,0,.07,0,.86,.14,.86,white,true);
      for(const x of [-.42,.42]){box(group,x,1.1,-.42,.025,2.05,.025,metal);box(group,x,1.12,0,.012,2,.85,glass);}
      box(group,0,1.12,-.42,.86,2,.014,glass);
      for(const x of [-.42,.42])box(group,x,2.14,0,.025,.03,.87,metal);
      for(const z of [-.42,.42])box(group,0,2.14,z,.87,.03,.025,metal);
      if(item==='shower_premium'){box(group,0,1.12,.42,.85,2,.013,glass);box(group,.2,1.15,.45,.025,.26,.03,metal);}
      cylinder(group,.24,1.22,-.37,.018,1.6,metal);box(group,.24,1.9,-.24,.27,.02,.3,metal,true);box(group,.24,1.0,-.34,.09,.06,.08,metal);
      if(plan.id==='studio'){
        box(group,.59,.4,-.5,.35,.8,.32,wood,true);box(group,.59,.83,-.5,.4,.06,.36,cream,true);
        cylinder(group,.59,.86,-.5,.115,.015,metal);rod(group,new THREE.Vector3(.59,.88,-.63),new THREE.Vector3(.59,1.02,-.63),.011,metal);
        box(group,-.4,1.21,-.25,.025,.025,.35,metal);box(group,-.38,1.03,-.25,.016,.33,.25,cream,true);
      }
      addShowerTierDetails(group,decor,item==='shower_premium'?'premium':'basic');
      for(const z of [-.39,.39])box(group,0,.15,z,.81,.035,.035,white,true);
      for(const x of [-.39,.39])box(group,x,.15,0,.035,.035,.75,white,true);
      cylinder(group,.23,.144,-.23,.045,.004,metal);
      for(let i=0;i<4;i++)box(group,.23,.147,-.254+i*.016,.055,.002,.005,dark,true);
      labelHeight=2.32;
    }else if(kind==='kitchen'){
      addHomeKitchen(group,decor,item==='cook_set_high'?'premium':item==='cook_set_mid'?'standard':'basic');
      labelHeight=1.33;
    }else if(kind==='fridge'){
      const h=item==='fridge_large'?1.85:item==='fridge_medium'?1.55:1.0,w=item==='fridge_large'?.84:.62;
      addHomeFridge(group,decor,h,w);labelHeight=h+.2;
    }else if(kind==='gym'){
      cylinder(group,0,.42,0,.25,.18,dark).rotation.z=Math.PI/2;
      rod(group,new THREE.Vector3(0,.28,0),new THREE.Vector3(0,.92,-.26),.032,metal);
      rod(group,new THREE.Vector3(0,.3,0),new THREE.Vector3(0,.75,.32),.038,metal);
      box(group,0,.8,.32,.28,.08,.22,dark,true);box(group,0,1.04,-.27,.55,.035,.12,dark,true);
      for(const z of [-.38,.38])box(group,0,.05,z,.55,.07,.11,dark,true);rod(group,new THREE.Vector3(0,.08,-.38),new THREE.Vector3(0,.08,.38),.034,metal);rod(group,new THREE.Vector3(0,.08,0),new THREE.Vector3(0,.38,0),.036,metal);labelHeight=1.25;
      if(item==='gym_high'||item==='gym_mid'){box(group,.4,.14,.17,.13,.25,.65,dark,true);box(group,.4,.025,.17,.46,.05,.75,dark,true);for(const z of [0,.33]){rod(group,new THREE.Vector3(.26,.28,z),new THREE.Vector3(.58,.28,z),.028,metal);for(const x of [.3,.54])ball(group,x,.28,z,.065,.095,.095,dark);}}
      addGymTierDetails(group,decor,item==='gym_high'?'premium':item==='gym_mid'?'standard':'basic');
    }else if(kind==='storage'){
      box(group,0,.3,0,.95,.6,.37,wood,true);for(const x of [-.23,.23]){box(group,x,.31,.199,.42,.49,.02,darkWood);ball(group,x,.38,.23,.023,.023,.023,metal);}labelHeight=.83;
      box(group,0,.04,-.015,.87,.08,.30,darkWood,true);box(group,0,.599,0,.98,.035,.40,wood,true);
      addHomeLifeDetails(group,decor,'entry',{width:.95,depth:.37,surfaceY:.6,level:plan.openKitchen?'rich':'simple'});
    }else if(kind==='trash'){
      const body=material('#78867e'),rim=material('#a4afa8'),inside=material('#293a32');
      cylinder(group,0,.21,0,.17,.42,body);cylinder(group,0,.423,0,.15,.008,inside);
      const lip=new THREE.Mesh(new THREE.TorusGeometry(.162,.014,6,24),rim);lip.rotation.x=Math.PI/2;lip.position.y=.427;group.add(lip);
      for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])rod(group,new THREE.Vector3(Math.sin(angle)*.164,.05,Math.cos(angle)*.164),new THREE.Vector3(Math.sin(angle)*.164,.38,Math.cos(angle)*.164),.005,rim);
      ball(group,-.035,.423,.02,.05,.035,.045,white);labelHeight=.64;
    }else if(kind==='door'){
      box(group,0,1.06,.04,.85,2.12,.07,darkWood);for(const x of [-.48,.48])box(group,x,1.12,.1,.07,2.25,.1,wood);box(group,0,2.24,.1,1.03,.08,.1,wood);ball(group,.3,1.03,.13,.045,.045,.055,metal);labelHeight=1.3;
      for(const y of [.55,1.55])box(group,0,y,.08,.66,.76,.016,wood,true);
      homeTube(group,'entry-door-lever',[[.30,1.03,.13],[.30,1.03,.20],[.20,1.03,.20]],.013,metal);
    }
    group.rotation.y=object.rotation??0;
    if(kind==='door'){group.position.set(entryLayout.center[0],0,entryLayout.center[1]);group.rotation.y=Math.atan2(-entryLayout.outward[0],-entryLayout.outward[1]);}
    if(kind==='sofa'&&plan.id==='studio')group.scale.setScalar(.8);
    if(kind==='plant'){group.scale.setScalar(.8);labelHeight=1.0;}
    if(object.scale){group.scale.multiply(new THREE.Vector3(...object.scale));labelHeight*=object.scale[1];}
    if(object.mirrorX&&kind!=='door')group.scale.x*=-1;
    if(!['computer','lamp'].includes(kind)&&!(kind==='sofa'&&visuals?.objects?.sofa))await batchDecor(group);
    if(kind==='door'){const clones=new Map<THREE.Material,THREE.Material>();group.traverse(child=>{if(child instanceof THREE.Mesh){const clip=(m:THREE.Material)=>{let c=clones.get(m);if(!c){c=m.clone();c.clippingPlanes=[doorCut];materials.add(c);clones.set(m,c);}return c;};child.material=Array.isArray(child.material)?child.material.map(clip):clip(child.material);}});}
    group.traverse(child=>{child.userData.kind=kind;});anchors.set(kind,new THREE.Vector3(object.position[0],labelHeight,object.position[1]));
    if(chairFallback)loadChair(group,chairFallback);
    if(computerFallback&&computerTier)loadDesktopComputer(group,computerFallback,computerTier);
    const input=visuals?.objects?.[kind],visual=typeof input==='function'?input(object):input;
    if(visual)mountVisual(group,visual,kind,group.children.filter(child=>!child.userData.homeVisualPreserve));
  }
  async function batchDecor(group:THREE.Group){
    const props=new Set<string>();group.traverse(o=>{if(o.userData.homeFoodModel)props.add(o.userData.homeFoodModel);});group.userData.homeFoodModels=[...props];
    group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),byMaterial=new Map<THREE.Material,THREE.BufferGeometry[]>(),originals:THREE.BufferGeometry[]=[];
    const children:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&!Array.isArray(o.material))children.push(o);});
    try{
    for(const o of children){await checkpoint();if(Array.isArray(o.material))continue;
      let geometry=o.geometry.clone();
      // Rounded boxes use separate face vertices. Give the other primitives
      // the same format so one material can be rendered in a single draw.
      if(geometry.index){const flat=geometry.toNonIndexed();geometry.dispose();geometry=flat;}
      const list=byMaterial.get(o.material)??[];list.push(geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld)));byMaterial.set(o.material,list);originals.push(o.geometry);
    }
    group.clear();originals.forEach(g=>g.dispose());
    for(const [mat,geometries]of byMaterial){await checkpoint();const merged=mergeGeometries(geometries);if(merged){const m=new THREE.Mesh(merged,mat);m.castShadow=true;m.receiveShadow=true;group.add(m);geometries.forEach(g=>g.dispose());}else for(const g of geometries){const m=new THREE.Mesh(g,mat);m.castShadow=true;m.receiveShadow=true;group.add(m);}}
    }finally{if(disposed)for(const geometries of byMaterial.values())geometries.forEach(g=>g.dispose());}
  }
  function clearFurniture(){outline.invalidateContacts();for(const parent of [furniture,fittings]){parent.traverse(o=>{const geometry=(o as THREE.Mesh).geometry;if(geometry&&!o.userData.homeSharedModel)geometry.dispose();if(o instanceof THREE.PointLight)o.shadow.dispose();});parent.clear();}anchors.clear();lampLights.length=0;}
  function solidWalls(){return occluders.filter(o=>o.visible&&(!(o instanceof THREE.Mesh)||(Array.isArray(o.material)?o.material.some(m=>m.colorWrite):o.material.colorWrite)));}
  function easeCamera(seconds:number){
    // A short, frame-rate-independent follow keeps dragging responsive. The
    // same easing lets button turns and wheel/pinch zoom settle without a jump.
    const blend=reducedMotion?.matches?1:sceneFollowBlend(seconds);
    shownTarget=cameraTarget(shownTarget,[shownTarget[0]+(target[0]-shownTarget[0])*blend,shownTarget[1]+(target[1]-shownTarget[1])*blend]);
    shownYaw+=(yaw-shownYaw)*blend;shownDistance+=(distance-shownDistance)*blend;
    const moving=Math.hypot(target[0]-shownTarget[0],target[1]-shownTarget[1])>.002||Math.abs(yaw-shownYaw)>.001||Math.abs(distance-shownDistance)>.002;
    if(!moving){shownTarget=[...target];shownYaw=yaw;shownDistance=distance;}
    host.dataset.homeCameraAnimating=String(moving);
    host.dataset.homeCameraLimits=JSON.stringify({maxDistance:exteriorView?exteriorMaxDistance:6.4,exterior:exteriorView});
    host.dataset.homeCameraGoal=[...target,yaw,distance].map(n=>n.toFixed(3)).join(',');
    return moving;
  }
  function positionCamera(seconds:number){
    const pose=homeCameraPose(plan,shownTarget,shownYaw,shownDistance),eye=pose.eye;
    camera.position.set(eye[0],pose.height,eye[1]);camera.rotation.set(pose.pitch,shownYaw,0,'YXZ');camera.updateMatrixWorld();
    let wallsMoving=false;
    for(const wall of internalWalls){const desired=wall.exterior?(exteriorView?2.65:homeExteriorWallHeight(wall.segment,shownTarget,eye,wallMode,wall.desired,lowWallHeight)):homeWallHeight(plan,wall.segment,shownTarget,eye,wallMode,wall.desired,lowWallHeight);wall.desired=desired;const previousHeight=wall.height;wall.height=wall.transition.step(desired,seconds,!firstPresented||reducedMotion?.matches);wallsMoving ||= wall.transition.moving;const visibleHeight=THREE.MathUtils.clamp(wall.height-wall.base,0,wall.fullHeight);wall.mesh.visible=visibleHeight>.001;wall.mesh.scale.y=visibleHeight/wall.fullHeight;wall.mesh.position.y=wall.base+visibleHeight/2;wall.cap.position.y=wall.base+visibleHeight+.012;wall.cap.visible=visibleHeight>.001&&visibleHeight<wall.fullHeight-.01;if(previousHeight!==wall.height){const uv=wall.mesh.geometry.getAttribute('uv'),p=wall.mesh.geometry.getAttribute('position');for(let i=0;i<uv.count;i++)uv.setY(i,(wall.base+(p.getY(i)/wall.fullHeight+.5)*visibleHeight)/2);uv.needsUpdate=true;}}
    const exteriorHeights:Partial<Record<ExteriorSide,number>>={};for(const wall of internalWalls)if(wall.exterior){const side=wall.mesh.userData.exteriorSide as ExteriorSide;exteriorHeights[side]=Math.min(exteriorHeights[side]??2.65,wall.height); }exterior.syncWalls({},exteriorHeights);host.dataset.homeExteriorView=String(exteriorView);
    const doorWall=internalWalls.find(w=>w.exterior&&w.segment[0]===entryLayout.a[0]&&w.segment[1]===entryLayout.a[1]&&w.segment[2]===entryLayout.b[0]&&w.segment[3]===entryLayout.b[1]);doorCut.constant=doorWall?.height??2.65;host.dataset.homeDoor=JSON.stringify({position:entryLayout.center,height:doorCut.constant,singleLeaf:true});
    for(const cut of windowCuts){const owner=internalWalls.find(w=>w.exterior&&w.segment===cut.segment);if(owner)cut.plane.constant=owner.height;}
    host.dataset.homeWallView=JSON.stringify({mode:wallMode,lowHeight:lowWallHeight,heights:internalWalls.map(w=>Number(w.height.toFixed(3))),physicalHeight:2.65});
    // Shadow sources remain fixed in world space when the camera moves.
    host.dataset.homeCamera=[...shownTarget,shownYaw,shownDistance].map(n=>n.toFixed(3)).join(',');
    host.dataset.homeCameraEye=eye.map(n=>n.toFixed(6)).join(',');
    return wallsMoving;
  }
  function render(now:number){
    frame=0;if(disposed)return;if(sceneRenderIsCovered(host)){request();return;}
    const initialReady=snapshotApplied&&!updating&&!nextSnapshot&&exteriorReady&&pendingTextures===0&&pendingModels===0&&pendingAssembly===0&&width>1&&height>1;
    if(!firstPresented&&!initialReady){host.dataset.homeReady="false";return;}
    const seconds=sceneFrameSeconds(now,lastFrame);lastFrame=now;
    const moving=easeCamera(seconds),wallsMoving=positionCamera(seconds);
    if(!firstPresented&&!shadersReady){
      shaderWarmup??=(async()=>{await checkpoint(true);if(disposed)return;await outline.warmup();if(disposed)return;shadersReady=true;request();})().catch(error=>{if(!disposed)readiness.fail(error);});
      return;
    }
    const environmentMoving=exterior.updateEnvironment(camera,new THREE.Vector3(shownTarget[0],.62,shownTarget[1]),now);host.dataset.homeCameraAnimating=String(moving||wallsMoving);renderer.info.reset();outline.render();firstPresented=true;host.dataset.homeRenderFrame=String(++renderCount);
    host.dataset.homeReady=String(initialReady);if(initialReady){readiness.assetsReady();readiness.rendered(width,height);}
    host.dataset.homeRenderStats=JSON.stringify({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures});
    const labels:HomeRoomLabel[]=[];
    for(const [kind,anchor]of anchors){const p=anchor.clone().project(camera);let visible=!exteriorView&&p.z>-1&&p.z<1&&Math.abs(p.x)<.97&&Math.abs(p.y)<.92;
      if(visible){raycaster.set(camera.position,anchor.clone().sub(camera.position).normalize());const hit=raycaster.intersectObjects(solidWalls(),false)[0];visible=!hit||hit.distance>=camera.position.distanceTo(anchor)-.12;}
      labels.push({kind,x:(p.x+1)*50,y:(1-p.y)*50,visible});
    }
    onLabels(labels);
    if(moving||wallsMoving||environmentMoving)request();else{lastFrame=0;exterior.scheduleWeatherFrame(weatherFrame);}
  }
  
function weatherFrame(){if(disposed)return;if(sceneRenderIsCovered(host)){request();return;}renderer.info.reset();if(outline.renderWeather(performance.now())){host.dataset.homeWeatherFrames=String(Number(host.dataset.homeWeatherFrames??0)+1);host.dataset.weatherRenderStats=JSON.stringify({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,cached:true});exterior.scheduleWeatherFrame(weatherFrame);}else request();}
function resize(){
  // Hidden portrait/outgoing scenes must retain the last valid projection and zoom.
  if(host.clientWidth<2||host.clientHeight<2)return;
const wasPortrait=width<height,initialized=width>1&&height>1;width=Math.max(1,host.clientWidth);height=Math.max(1,host.clientHeight);if(exteriorView&&initialized&&wasPortrait!==(width<height)){const bounds=new THREE.Box3().setFromObject(room);distance=exteriorMaxDistance=homeExteriorDistance(camera,bounds,target,yaw,width/height);shownDistance=distance;}renderer.setPixelRatio(quality?homePixelRatio(quality,width,height,renderScale,resolution,displayPixelScale(host),renderer.capabilities.maxTextureSize):Math.min(window.devicePixelRatio||1,visuals?.pixelRatioCap??1.5)*renderScale);renderer.setSize(width,height,false);outline.resize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();if(quality)host.dataset.homeQuality=JSON.stringify({...quality,mode:qualityMode,renderScale,resolution,pixelRatio:renderer.getPixelRatio(),buffer:[canvas.width,canvas.height],antialias:quality.id==='fine'?'MSAA + SMAA':'FXAA',modelDetail:quality.id});request();}
  syncWindowDetail();
  const observer=new ResizeObserver(resize);observer.observe(host);window.addEventListener('resize',resize);resize();
  const interactionRoot=host.parentElement??host;
  const pointers=new Map<number,{x:number;y:number}>();let moved=false,lastPinch=0,movement=0;
  function down(e:PointerEvent){
    const tag=e.target instanceof Element?e.target.closest('[data-home-object],[data-tour-object]'):null;
    if(e.button!==0&&e.button!==2||e.target!==canvas&&!(e.button===2&&tag))return;
    if(e.button===2)e.preventDefault();
    hoveredKind=null;hoveredModel=undefined;highlight();canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=pointers.size>1;movement=0;lastPinch=0;
  }
  function move(e:PointerEvent){const old=pointers.get(e.pointerId);if(!old){if(e.pointerType==='mouse')hoverAt(e);return;}const dx=e.clientX-old.x,dy=e.clientY-old.y;old.x=e.clientX;old.y=e.clientY;movement+=Math.abs(dx)+Math.abs(dy);if(movement>5)moved=true;
    if(pointers.size===2){const p=[...pointers.values()],length=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(lastPinch)distance=THREE.MathUtils.clamp(distance*lastPinch/Math.max(1,length),exteriorView?4:1.8,exteriorView?exteriorMaxDistance:6.4);lastPinch=length;}
    else if(e.pointerType==='mouse'?(e.buttons&2)!==0:host.dataset.homeDrag==='rotate'){yaw-=dx*.006;}
    else{const factor=distance*1.7/Math.max(1,canvas.getBoundingClientRect().height);target=cameraTarget(target,[target[0]-Math.cos(yaw)*dx*factor-Math.sin(yaw)*dy*factor,target[1]+Math.sin(yaw)*dx*factor-Math.cos(yaw)*dy*factor]);}
    request();
  }
  function pickAt(e:PointerEvent){const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects([...furniture.children,...fittings.children.filter(g=>g.userData.kind),...petModels.children,...petSupplies.children,...solidWalls()],true)[0];if(!hit?.object.userData.kind)return;let root=hit.object;while(root.parent&&![furniture,fittings,petModels,petSupplies].includes(root.parent as THREE.Group))root=root.parent;return root;}
  function hoverAt(e:PointerEvent){const model=pickAt(e);if(model===hoveredModel)return;hoveredKind=null;hoveredModel=model;canvas.style.cursor=model?'pointer':'';highlight();}
  function leave(){hoveredKind=null;hoveredModel=undefined;canvas.style.cursor='';highlight();}
  function up(e:PointerEvent){if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(moved||e.button!==0)return;const model=pickAt(e);if(!model)return;const kind=model.userData.kind;if(kind==='cat'){selectedKind=null;selectedModel=model;onPetPick?.(model.userData.uid);highlight();}else{onPick(kind);selectedKind=kind;selectedModel=model;highlight();}}
  function cancel(e:PointerEvent){pointers.delete(e.pointerId);moved=true;}
  function wheel(e:WheelEvent){e.preventDefault();distance=THREE.MathUtils.clamp(distance*Math.exp(e.deltaY*.001),exteriorView?4:1.8,exteriorView?exteriorMaxDistance:6.4);request();}
  function context(e:Event){if(e.target===canvas||e.target instanceof Element&&e.target.closest('[data-home-object],[data-tour-object]'))e.preventDefault();}
  interactionRoot.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerleave',leave);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('wheel',wheel,{passive:false});interactionRoot.addEventListener('contextmenu',context);
  function obstacles():HomeObstacle[]{return [...furniture.children,...fittings.children.filter(g=>!g.userData.decorative)].map(g=>{const b=new THREE.Box3().setFromObject(g);return{min:b.min.toArray(),max:b.max.toArray()};});}
  function discard(parent:THREE.Group){parent.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});parent.clear();}
  async function updateCats(state:HomeRoomState,layoutChanged:boolean){
    const cats=state.cats??[],bedItem=state.catItems?.find(i=>i.kind==='bed')?.item??'cat_bed_basic';
    const items=cats.length?[{kind:'bowls' as const},{kind:'litter' as const},...(state.catItems??[]).filter(i=>i.kind!=='bed')]:[];
    // Time changes the view inside the nest, never the nest's location. A free
    // cardboard shelter keeps every adopted home cat accessible before shopping.
    const awake=homeLightScheme(state.hour,state.month,'sunny').daylight<.06;
    const supplyKey=JSON.stringify(items),key=JSON.stringify([cats,bedItem]);
    const changed=layoutChanged||supplyKey!==supplyStamp||key!==catStamp||awake!==catAwake;
    if(changed){
      discard(petSupplies);discard(petModels);supplyStamp=supplyKey;catStamp=key;catAwake=awake;
      const blocked=obstacles(),scale=plan.id==='studio'?(cats.length>2?.58:.68):1,radius=.56*scale;
      for(const cat of cats){
        await checkpoint();
        const placement=homeCatNestPlacement(plan,radius,blocked);if(!placement)continue;const p=placement.position;
        const g=new THREE.Group();g.name=cat.name;g.position.set(p[0],0,p[1]);g.rotation.y=placement.rotation;g.scale.setScalar(scale);
        g.userData.kind='cat';g.userData.uid=cat.uid;g.userData.surface='nest';g.userData.bedItem=bedItem;g.userData.awake=awake;
        petModels.add(g);addHomeCatNest(g,decor,cat,bedItem,awake);
        g.traverse(o=>{if(o instanceof THREE.Mesh){for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
        await batchDecor(g);g.traverse(o=>{o.userData.kind='cat';o.userData.uid=cat.uid;});
        // A fixed footprint avoids reflowing other nests when the eyes/tail change.
        blocked.push({min:[p[0]-radius,0,p[1]-radius],max:[p[0]+radius,1.2*scale,p[1]+radius]});
      }
      for(const item of items){
        await checkpoint();
        const small=plan.id==='studio',scale=small?.68:1,radius=(item.kind==='toy'?(item.item==='cat_toy_basic'?.13:.3):.35)*scale;
        let points=homePetSpots(plan,radius,blocked,item.kind==='litter');
        if(item.kind==='litter')points=points.sort((a,b)=>{const bath=plan.rooms.find(r=>r.type==='bath');return bath?Math.hypot(a[0]-bath.rect[0],a[1]-bath.rect[1])-Math.hypot(b[0]-bath.rect[0],b[1]-bath.rect[1]):0;});
        const p=points[0];if(!p)continue;const g=new THREE.Group();g.name='cat-'+item.kind;g.position.set(p[0],0,p[1]);g.scale.setScalar(scale);g.userData.kind='cat';petSupplies.add(g);addHomeCatSupply(g,decor,item);await batchDecor(g);g.traverse(o=>o.userData.kind='cat');const b=new THREE.Box3().setFromObject(g);blocked.push({min:b.min.toArray(),max:b.max.toArray()});
      }
      if(hoveredModel&&!hoveredModel.parent)hoveredModel=undefined;
      if(selectedModel&&!selectedModel.parent)selectedModel=undefined;
      renderer.shadowMap.needsUpdate=true;
    }
    petModels.updateMatrixWorld(true);petSupplies.updateMatrixWorld(true);
    host.dataset.homePets=JSON.stringify(petModels.children.map(g=>({uid:g.userData.uid,name:g.name,position:[g.position.x,g.position.z],rotation:g.rotation.y,y:g.position.y,surface:g.userData.surface,bedItem:g.userData.bedItem,awake:g.userData.awake,bounds:(()=>{const b=new THREE.Box3().setFromObject(g);return {min:b.min.toArray(),max:b.max.toArray()};})()})));
    host.dataset.homePetSupplies=JSON.stringify(petSupplies.children.map(g=>({kind:g.name,position:[g.position.x,g.position.z],bounds:(()=>{const b=new THREE.Box3().setFromObject(g);return {min:b.min.toArray(),max:b.max.toArray()};})()})));
  }
  function setQuality(mode:QualityMode,device:HomeDeviceMode='pc'){
    const previous=quality,next=homeSceneQuality(mode,device);qualityMode=mode;
    if(JSON.stringify(previous)===JSON.stringify(next)){resize();return;}
    quality=next;exterior.setDetail(next.id,Math.min(next.anisotropy,renderer.capabilities.getMaxAnisotropy()));outline.dispose();outline=createHomeOutline(renderer,scene,camera,shadowOnly,quality.contactShadows,quality);outline.setWeatherLayer(exterior.weatherLayer);outline.setContactObjects(()=>[furniture,fittings,petModels,petSupplies]);
    for(const light of windowLights){light.shadow.map?.dispose();light.shadow.map=null;light.shadow.mapSize.setScalar(quality.windowShadowSize);}
    for(const light of ceilingLights){light.shadow.map?.dispose();light.shadow.map=null;light.shadow.mapSize.setScalar(quality.ceilingShadowSize);}
    for(const texture of [...maps,...modelMaps]){texture.anisotropy=Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;}
    syncWindowDetail();resize();
    if(previous?.id!==quality.id&&lastSnapshot){stamp='';view.update(lastSnapshot);}
    renderer.shadowMap.needsUpdate=true;highlight();request();
  }
  async function applySnapshot(state:HomeRoomState){
      await checkpoint(true);
      const finishes=state.decor??defaultHomeDecor(plan.residenceId??'old_apartment'),nextFinish=`${finishes.wall.id}:${finishes.floor.id}`;
      if(nextFinish!==finishStamp){finishStamp=nextFinish;
        for(const surface of ['wall','floor'] as const){const style=finishes[surface];let map=surfaceMaps.get(style.id);if(!map){map=homeSurfaceTexture(style);if(map){if(surface==='floor')map.repeat.set(plan.size[0]/2,plan.size[1]/2);maps.add(map);surfaceMaps.set(style.id,map);}}
          for(const m of surface==='wall'?[...wallSurfaces]:[floorWood]){m.color.set(map?'#ffffff':style.color);m.map=map??null;m.needsUpdate=true;}
        }host.dataset.homeDecor=JSON.stringify({wall:finishes.wall.id,floor:finishes.floor.id});
      }
      objects=state.objects;const next=JSON.stringify(objects),layoutChanged=next!==stamp;
      if(layoutChanged){
        stamp=next;clearFurniture();for(const object of objects){await buildObject(object);await checkpoint();}
        for(const fixture of plan.fixtures??[])if(!fixture.requires||objects.some(o=>o.kind===fixture.requires)){
          await checkpoint();
          const g=addHomeFixture(fittings,fixture,decor),kind=g.userData.kind;g.userData.fixtureRequires=fixture.requires;await batchDecor(g);g.traverse(o=>{o.userData.kind=kind;});
          const visual=visuals?.fixtures?.[fixture.kind];if(visual)mountVisual(g,{...visual,size:[fixture.size[0],visual.size[1],fixture.size[1]]},kind,[...g.children]);
        }
        const additions=typeof visuals?.additions==='function'?visuals.additions(objects,quality?.id):visuals?.additions??[];
        for(const addition of additions){
          await checkpoint();
          if(addition.owner&&!objects.some(o=>o.kind===addition.owner))continue;
          const parent=addition.attachToOwner?furniture.children.find(o=>o.userData.kind===addition.owner):fittings;if(!parent)continue;
          const g=new THREE.Group();g.name=`visual-addition-${addition.model.id}`;g.userData.kind=addition.owner;
          g.position.set(addition.position[0],0,addition.position[1]);g.rotation.y=addition.rotation??0;parent.add(g);
          // Reserve the eventual footprint before asynchronous models finish,
          // so pet placement also avoids the new bathroom and entry pieces.
          const proxy=new THREE.Mesh(new THREE.BoxGeometry(...addition.model.size),additionBoundsMaterial),offset=addition.model.offset??[0,0,0];
          proxy.position.set(offset[0],offset[1]+addition.model.size[1]/2,offset[2]);proxy.visible=false;g.add(proxy);
          mountVisual(g,addition.model,addition.owner,[proxy]);
        }
        refreshFurnitureBounds();
      }
      if(layoutChanged){selectedModel=undefined;hoveredModel=undefined;}const previousCats=catStamp,previousSupplies=supplyStamp;await updateCats(state,layoutChanged);if(layoutChanged||previousCats!==catStamp||previousSupplies!==supplyStamp)outline.invalidateContacts();highlight();
      scheme=homeVisualLightScheme(homeLightScheme(state.hour,state.month,state.weather,state.lightMode),visuals?.daylight);exterior.setWeather(state.weather,scheme.daylight<.15);
      if(visuals?.environment)scene.environmentIntensity=scheme.daylight>0?(visuals.daylight?.environmentIntensity??.45):scheme.lamps?.15:.025;
      fill.intensity=scheme.bounce;fill.color.set(scheme.daylight>0?'#eceee8':'#7c8e9f');
      fill.groundColor.set(scheme.daylight>0?'#c8c3b6':'#998b79');
      const source=homeShadowSource(plan,scheme);
      windowLights.forEach((light,i)=>{light.color.set(scheme.windowColor);light.castShadow=source.kind==='window'&&source.index===i;light.intensity=light.castShadow?scheme.keyIntensity:0;light.shadow.intensity=scheme.shadowIntensity;positionHomeWindowLight(light,plan,i,state.hour,visuals?.daylight?.windowAim==='room');});
      windowDiffuse.forEach(light=>{light.color.set(scheme.windowColor);light.intensity=scheme.windowIntensity;});
      windowPanes.forEach(m=>{m.color.set(scheme.sky);m.emissive.set(scheme.sky);m.emissiveIntensity=scheme.daylight*.2+.035;});
      ceilingLights.forEach((light,i)=>{light.intensity=scheme.ceilingIntensity;light.castShadow=source.kind==='ceiling'&&source.index===i;light.shadow.intensity=scheme.shadowIntensity;});lampLights.forEach(light=>light.intensity=scheme.lampIntensity);
      lampGlows.forEach(m=>m.emissiveIntensity=scheme.lamps?1.2:0);
      for(const display of [screen,screenOffice,screenGaming])display.emissiveIntensity=scheme.daylight>0?.12:.24;
      host.dataset.homeLighting=JSON.stringify({hour:state.hour,phase:scheme.phase,daylight:scheme.daylight,lamps:scheme.lamps,mode:state.lightMode,bounce:scheme.bounce,keyIntensity:scheme.keyIntensity,windowIntensity:scheme.windowIntensity,environmentIntensity:scene.environmentIntensity,shadowFilter:'PCF',shadowIntensity:scheme.shadowIntensity,shadowSource:source,shadowSources:{ceiling:ceilingLights.map(l=>l.castShadow),windows:windowLights.map(l=>l.castShadow),floor:lampLights.map(l=>l.castShadow)}});
      renderer.shadowMap.needsUpdate=true;request();
  }
  async function pumpUpdates(){
    try{
      await structureReady;
      while(!disposed&&nextSnapshot){const state=nextSnapshot;nextSnapshot=undefined;await applySnapshot(state);snapshotApplied=true;}
    }catch(error){if(!disposed)readiness.fail(error);}
    finally{updating=false;request();}
  }
  const view:HomeRoomCaptureView={
    capture(){return {scene,renderer,room,furniture,fittings,petModels,petSupplies,floorMaterial:floorWood,wallMaterials:wallSurfaces,
      async settle(){await structureReady;let stable=0;for(let i=0;i<900;i++){await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));if(!updating&&!nextSnapshot&&pendingTextures===0&&pendingModels===0&&pendingAssembly===0&&exteriorReady){if(++stable>=3)break;}else stable=0;if(i===899)throw new Error('Home bake did not settle');}capturePaused=true;cancelAnimationFrame(frame);frame=0;scene.updateMatrixWorld(true);},
      cutaway(angle){
        const center:HomePoint=[plan.size[0]/2,plan.size[1]/2],direction:HomePoint=[Math.sin(angle),Math.cos(angle)],eye:HomePoint=[center[0]+direction[0]*50,center[1]+direction[1]*50];
        for(const wall of internalWalls){
          const [x,z,x2,z2]=wall.segment,length=Math.hypot(x2-x,z2-z),nx=-(z2-z)/length,nz=(x2-x)/length,mx=(x+x2)/2,mz=(z+z2)/2;
          const outward=insideOutline(plan.outline,mx+nx*.2,mz+nz*.2)?-1:1;
          // The offline phone photographs lower both exterior faces toward the
          // camera, keeping furniture visible in a complete-room overview.
          const desired=wall.exterior?(outward*(nx*direction[0]+nz*direction[1])>.05?.60:2.65):homeWallHeight(plan,wall.segment,center,eye,'cutaway',undefined,.60);
          const height=THREE.MathUtils.clamp(desired-wall.base,0,wall.fullHeight);wall.mesh.visible=height>.001;wall.mesh.scale.y=height/wall.fullHeight;wall.mesh.position.y=wall.base+height/2;wall.cap.position.y=wall.base+height+.012;wall.cap.visible=height>.001&&height<wall.fullHeight-.01;wall.height=desired;
          wall.mesh.userData.mobileForeground=desired<2.64;wall.cap.userData.mobileForeground=desired<2.64;
        }
        for(const child of room.children){const segment=child.userData.mobileWallSegment as number[]|undefined;if(segment){const wall=internalWalls.find(w=>w.segment.every((n,i)=>n===segment[i]));child.userData.mobileForeground=!!wall&&wall.height<2.64;}}
        for(const cut of windowCuts){const owner=internalWalls.find(w=>w.exterior&&w.segment===cut.segment);if(owner)cut.plane.constant=owner.height;}
        const dw=internalWalls.find(w=>w.exterior&&w.segment[0]===entryLayout.a[0]&&w.segment[1]===entryLayout.a[1]&&w.segment[2]===entryLayout.b[0]&&w.segment[3]===entryLayout.b[1]);doorCut.constant=dw?.height??2.65;scene.updateMatrixWorld(true);
      },
    };},
    select(kind){selectedKind=kind;selectedModel=undefined;highlight();},hover(kind){hoveredKind=kind;hoveredModel=undefined;highlight();},
    ready:readiness.promise,
    update(state){if(disposed)return;lastSnapshot=state;nextSnapshot=state;if(!updating){updating=true;void pumpUpdates();}},
    focus(x,z,yawHint){
      exteriorView=false;camera.far=80;camera.updateProjectionMatrix();target=moveHomeCameraTarget(plan,target,[x,z]);distance=THREE.MathUtils.clamp(distance,3.45,6.4);
      if(yawHint!==undefined)yaw+=Math.atan2(Math.sin(yawHint-yaw),Math.cos(yawHint-yaw));request();
    },exterior(){exteriorView=true;selectedKind=null;selectedModel=undefined;highlight();target=[plan.size[0]/2,plan.size[1]/2+.55];yaw=.35;camera.far=200;camera.updateProjectionMatrix();const bounds=new THREE.Box3().setFromObject(room);distance=exteriorMaxDistance=homeExteriorDistance(camera,bounds,target,yaw,width/height);request();},rotate(radians){yaw+=radians;request();},zoom(factor){distance=THREE.MathUtils.clamp(distance*factor,exteriorView?4:1.8,exteriorView?exteriorMaxDistance:6.4);request();},setWalls(mode,height=HOME_LOW_WALL_HEIGHT){wallMode=mode;lowWallHeight=clampLowWallHeight(height);request();},setQuality,setResolution(scale,mode='auto'){const next=clampRenderScale(scale);if(next===renderScale&&mode===resolution)return;renderScale=next;resolution=mode;resize();},
    dispose(){if(disposed)return;disposed=true;nextSnapshot=undefined;readiness.cancel();host.removeEventListener('scene-weather-resume',request);cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',resize);interactionRoot.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('wheel',wheel);interactionRoot.removeEventListener('contextmenu',context);exterior.dispose();scene.traverse(o=>{const geometry=(o as THREE.Mesh).geometry;if(geometry&&!o.userData.homeSharedModel)geometry.dispose();if(o instanceof THREE.PointLight||o instanceof THREE.SpotLight||o instanceof THREE.DirectionalLight)o.shadow.dispose();});modelTemplates.forEach(disposeLoadedModel);modelTemplates.clear();materials.forEach(m=>m.dispose());maps.forEach(m=>m.dispose());outline.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();},
  };
  const structureReady=buildStructure();
  void structureReady.catch(error=>{if(!disposed)readiness.fail(error);});
  return view;
}
