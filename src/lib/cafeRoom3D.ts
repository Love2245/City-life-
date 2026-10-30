import {batchSceneFixturesAsync} from './sceneBatching';
import {createVenueStillBake} from './venueStillBake3D';
import * as THREE from 'three';
import {createSceneCanvas} from './sceneTextureCanvas';
import {displayPixelScale,type RenderResolution} from './renderResolution';
import {createSceneReadiness,createSceneWorkBudget,sceneRenderIsCovered,loadSceneModel} from './sceneLoadWork';
import {bridgeSceneLabelGestures} from './scenePointerBridge';
import type {WeatherId} from '../game/types';
import {clampRenderScale} from './mobileLayout';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { createScenePipeline, sceneQuality, scenePixelRatio, type QualityMode } from './scenePipeline';
import { CAFE, BAR, BACK_BAR, COMMUNAL, BANQUETTE_TABLES, WINDOW_STOOLS, WINDOW_SEAT_Z, LIN_SEAT, COMMUNAL_SEATS, BANQUETTE_CHAIRS, LOUNGE_SEATS, CAFE_ZONES, CAFE_GAMEPLAY, CAFE_PLAN_VIEW, CAFE_CAMERA_MIN_POLAR, CAFE_CAMERA_MAX_POLAR, type CafeZone } from './cafeRoom/layout';
import { createLinSprite, type LinSprite } from './cafeRoom/linSprite';
import { npcCameraLimits, constrainCameraEye, sceneNpcCount, visibleInScene } from './cafeRoom/npcCamera';

import { cafeCameraEye, createCafeWallFade, type CafeWallSide } from './cafeRoom/wallVisibility';
import {centeredVenuePose,venueEntryZoom,venueMinimumZoom,constrainVenuePan} from './venueFraming';
import { CAFE_FACILITIES,createCafeFacilityRegistry,type CafeFacilityId,type CafeFacilitySelection } from './cafeRoom/facilities';
import {createSceneExterior,cladExteriorBox} from './sceneExterior';
import {createFacilityLabelProjection} from './facilityLabelProjection';
import type {SceneNameLabel} from './sceneLabels';

export interface CafeRoomState { night: boolean; linPresent: boolean;weather?:WeatherId }
export interface CafeRoomViewState { zone: CafeZone; plan: boolean; linPresent: boolean; npcReady: boolean; night: boolean }
export interface CafeRoomOptions extends Partial<CafeRoomState> {
  quality?: QualityMode; renderScale?:number;resolution?:RenderResolution; mode?:'game'|'preview'; onView?:(state:CafeRoomViewState)=>void; onNpc?:()=>void;
  onProgress?:(count:number,total:number)=>void;
  onSelect?:(selection:CafeFacilitySelection|null)=>void;
  onProject?:(selection:CafeFacilitySelection)=>void;
  onLabels?:(labels:SceneNameLabel[])=>void;
}
export type CafeRoomView = ReturnType<typeof createCafeRoom>;
type Vec = [number, number, number];
export function createCafeRoom(host:HTMLDivElement, options:CafeRoomOptions={}) {
let desiredLin=options.linPresent??false;
let weather:WeatherId=options.weather??'sunny';
let quality=sceneQuality(options.quality),renderScale=clampRenderScale(options.renderScale??1),resolution=options.resolution??'auto';
const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:quality.id==='fine'?'high-performance':'default'});
renderer.setPixelRatio(quality.pixelRatio);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.info.autoReset=false;
renderer.domElement.addEventListener('webglcontextlost',()=>{if(!disposed)host.dispatchEvent(new CustomEvent('scene-context-lost',{bubbles:true}));});
renderer.domElement.setAttribute('aria-label','咖啡厅场景，拖动旋转，右键平移，滚轮缩放');host.append(renderer.domElement);host.addEventListener('scene-weather-resume',request);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e4e1d6');
let exteriorMinRatio=.86;
const camera=new THREE.OrthographicCamera(-12,12,8,-8,.1,100);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minZoom=.3;controls.maxZoom=5;controls.minPolarAngle=CAFE_CAMERA_MIN_POLAR;controls.maxPolarAngle=CAFE_CAMERA_MAX_POLAR;controls.maxTargetRadius=20;
const interactive=options.mode!=='preview';
if(interactive){controls.mouseButtons.LEFT=THREE.MOUSE.PAN;controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;controls.touches.ONE=THREE.TOUCH.PAN;renderer.domElement.setAttribute('aria-label','咖啡厅全屏场景，点击设施选择，左键移动，右键转向，滚轮缩放');}
const shadowOnly:THREE.Object3D[]=[],building=new THREE.Group(),fixtures=new THREE.Group(),facade=new THREE.Group();scene.add(building,fixtures,facade);
let pipeline=createScenePipeline(renderer,scene,camera,shadowOnly,quality);
pipeline.setContactObjects(()=>[fixtures]);
const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),geometries=new Set<THREE.BufferGeometry>();
const templates=new Map<string,THREE.Group>(),pickables:THREE.Object3D[]=[],placements:{id:string;position:number[];size:number[];zone:CafeZone}[]=[];
const facilities=createCafeFacilityRegistry();
const lightMaterials:THREE.MeshStandardMaterial[]=[];
const wallDecor:Record<string,THREE.Object3D[]>={left:[],right:[],back:[]};
let zone:CafeZone='all',plan=false,exteriorView=false,night=options.night??false,ready=false,disposed=false,frame=0,last=0,doorOpen=false,doorAmount=0;
const readiness=createSceneReadiness(),checkpoint=createSceneWorkBudget(()=>disposed);
let selected:THREE.Object3D|undefined,move:{eye:THREE.Vector3;target:THREE.Vector3;zoom:number}|undefined;
let selectedFacility:CafeFacilitySelection|null=null;
let lin:LinSprite|undefined;
const sceneNpcs=new Set<THREE.Object3D>();
let npcCount=-1,linPresentBefore=false,npcLimits=npcCameraLimits(0),emptyLinStool:THREE.Group|undefined;
const viewportScale=()=>Math.min(1,host.clientWidth/Math.max(1,host.clientHeight)/1.06);
const viewScale=()=>viewportScale()*(interactive&&!plan&&!exteriorView&&zone==='all'?venueEntryZoom(host.clientWidth,host.clientHeight):1);let layoutScale=viewScale();
const mat=(color:string,roughness=.7,metalness=0)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness});materials.add(m);return m;};
const cream=mat('#e9dfcd'),green=mat('#294b38'),walnut=mat('#624631'),wood=mat('#ac7d4d'),black=mat('#26362e'),brass=mat('#bc975b',.28,.7),steel=mat('#a9b2b1',.28,.72),ceramic=mat('#ece3cd',.33),leather=mat('#9b6240',.67);
const glass=new THREE.MeshPhysicalMaterial({color:'#cedbd2',transparent:true,opacity:.11,roughness:.12,metalness:.1,depthWrite:false,side:THREE.DoubleSide});materials.add(glass);
function mesh(g:THREE.BufferGeometry,m:THREE.Material,parent:THREE.Object3D,at:Vec,cast=true){const o=new THREE.Mesh(g,m);o.position.set(...at);o.castShadow=cast;o.receiveShadow=true;parent.add(o);geometries.add(g);return o;}
function box(p:THREE.Object3D,at:Vec,size:Vec,m:THREE.Material,round=0){return mesh(round?new RoundedBoxGeometry(...size,3,Math.min(round,...size.map(n=>n*.23))):new THREE.BoxGeometry(...size),m,p,at);}
function cyl(p:THREE.Object3D,at:Vec,rt:number,rb:number,h:number,m:THREE.Material,segments=40){return mesh(new THREE.CylinderGeometry(rt,rb,h,segments),m,p,at);}
function tube(p:THREE.Object3D,points:Vec[],r:number,m:THREE.Material){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(a=>new THREE.Vector3(...a))),28,r,8,false),m,p,[0,0,0]);}
function group(at:Vec,yaw=0,parent:THREE.Object3D=fixtures,which?:CafeZone){const o=new THREE.Group();o.position.set(...at);o.rotation.y=yaw;parent.add(o);if(which){o.userData.zone=which;pickables.push(o);}return o;}
function canvasTexture(w:number,h:number,draw:(c:CanvasRenderingContext2D)=>void){const c=createSceneCanvas(w,h,draw,quality.id==='light'?768:Infinity);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy());textures.add(t);return t;}
function label(p:THREE.Object3D,at:Vec,w:number,h:number,title:string,sub='',bg='#f1e6cf',fg='#30513b',yaw=0,transparent=false){
  const H=Math.max(64,Math.round(1024*h/w)),t=canvasTexture(1024,H,c=>{if(!transparent){c.fillStyle=bg;c.fillRect(0,0,1024,H);}c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';let s=H*(sub?.36:.48);c.font=`600 ${s}px "Microsoft YaHei",sans-serif`;s*=Math.min(1,930/c.measureText(title).width);c.font=`600 ${s}px "Microsoft YaHei",sans-serif`;c.fillText(title,512,H*(sub?.38:.5));if(sub){c.font=`${H*.15}px "Microsoft YaHei",sans-serif`;c.fillText(sub,512,H*.79,920);}});
  const m=new THREE.MeshStandardMaterial({map:t,transparent,depthWrite:!transparent,roughness:.8,side:THREE.DoubleSide});materials.add(m);const o=mesh(new THREE.PlaneGeometry(w,h),m,p,at,false);o.rotation.y=yaw;return o;
}
function asset(id:string,at:Vec,which:CafeZone,options:{yaw?:number;roll?:number;pitch?:number;height?:number;verticalHeight?:number}={}){
  const source=templates.get(id);if(!source)throw Error('Missing model '+id);
  const inner=source.clone(true);inner.rotation.set(options.pitch||0,options.yaw||0,options.roll||0);inner.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(inner),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());inner.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));
  const o=group(at,0,fixtures,which);o.add(inner);if(options.height)o.scale.setScalar(options.height/size.y);if(options.verticalHeight)o.scale.y=options.verticalHeight/size.y;
  o.updateMatrixWorld(true);const final=new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());placements.push({id,position:at,size:final.toArray(),zone:which});return o;
}

const plank=canvasTexture(1024,1024,c=>{
  c.fillStyle='#634e36';c.fillRect(0,0,1024,1024);
  for(let j=0;j<8;j++)for(let i=-1;i<3;i++){const x=i*512+(j%2)*255,y=j*128,t=[162,168,154,174,158][(i+6+j*3)%5];c.fillStyle=`rgb(${t+18},${t-7},${t-39})`;c.fillRect(x+1,y+1,510,126);
    for(let k=0;k<19;k++){c.strokeStyle=k%3?'#62442b13':'#f5d4a11c';c.lineWidth=k%4===0?1.5:.6;c.beginPath();c.moveTo(x,y+k*6+7);c.bezierCurveTo(x+140,y+k*6+14,x+340,y+k*6-2,x+512,y+k*6+9);c.stroke();}}
});plank.wrapS=plank.wrapT=THREE.RepeatWrapping;plank.repeat.set(3.5,3.2);
const floorMat=new THREE.MeshStandardMaterial({map:plank,roughness:.69});materials.add(floorMat);
box(building,[6,-.17,5.5],[12.5,.3,11.5],mat('#bfb49a'),.06);box(building,[6,-.012,5.5],[12,.035,11],floorMat);
const exterior=createSceneExterior(scene,{kind:'cafe',width:CAFE.width,depth:CAFE.depth,height:CAFE.height,detail:quality.id,anisotropy:Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy()),host,request:()=>{renderer.shadowMap.needsUpdate=true;request();}});
pipeline.setWeatherLayer(exterior.weatherLayer);
const terrazzo=canvasTexture(512,512,c=>{c.fillStyle='#e2dbcb';c.fillRect(0,0,512,512);for(let i=0;i<750;i++){let x=(i*131+17)%512,y=(i*233+Math.floor(i/23)*19)%512;c.fillStyle=['#c0b8a3','#a8b0a3','#d0bda2','#f4ecd9'][i%4];c.beginPath();c.ellipse(x,y,i%4+1,i%3+1,i,0,Math.PI*2);c.fill();}});terrazzo.wrapS=terrazzo.wrapT=THREE.RepeatWrapping;terrazzo.repeat.set(3,1);
const stone=new THREE.MeshStandardMaterial({map:terrazzo,roughness:.52});materials.add(stone);
const shadowMat=new THREE.MeshStandardMaterial({colorWrite:false,depthWrite:false,side:THREE.DoubleSide});materials.add(shadowMat);
const wallFade=createCafeWallFade(material=>materials.add(material));
function wall(side:CafeWallSide,at:Vec,size:Vec,m:THREE.Material){const solid=box(building,at,size,m);cladExteriorBox(solid,exterior.facadeMaterial,new THREE.Vector3(side==='left'?-1:side==='right'?1:0,0,side==='back'?-1:0));const cap=box(building,[at[0],size[1]+.018,at[2]],[size[0]+.015,.035,size[2]+.015],mat('#b8b79f'));wallFade.add(side,solid,cap);const s=box(building,at,size,shadowMat);shadowOnly.push(s);}
wall('back',[6,1.6,-.08],[12.2,3.2,.16],green);wall('left',[-.08,1.6,5.5],[.16,3.2,11.2],cream);wall('right',[12.08,1.6,5.5],[.16,3.2,11.2],cream);
const roof=box(building,[6,3.23,5.5],[12,.06,11],shadowMat);shadowOnly.push(roof);
box(building,[6,.075,.025],[12,.15,.055],walnut);box(building,[.025,.075,5.5],[.055,.15,11],walnut);box(building,[11.975,.075,5.5],[.055,.15,11],walnut);
// The front remains open to view, with real glass and restrained decals.
for(const [x,w]of [[4.45,8.9],[11.35,1.3]])mesh(new THREE.PlaneGeometry(w,2.8),glass,facade,[x,1.4,11],false);
for(const x of [0,2.15,4.4,6.65,8.9,10.7,12])box(facade,[x,1.45,11.02],[.065,2.9,.075],black,.008);
for(const y of [.045,2.88])box(facade,[6,y,11.02],[12,.07,.085],black,.01);
const doorPivot=group([8.9,0,11.02],0,facade,'window');facilities.add('door',doorPivot);
mesh(new THREE.PlaneGeometry(1.8,2.72),glass,doorPivot,[.9,1.39,0],false);
for(const x of [.035,1.765])box(doorPivot,[x,1.39,0],[.06,2.78,.075],black,.01);
for(const y of [.035,2.755])box(doorPivot,[.9,y,0],[1.8,.06,.075],black,.01);
for(const z of [-.075,.075])cyl(doorPivot,[1.54,1.17,z],.018,.018,.45,brass,24);
label(doorPivot,[.9,1.96,.047],1.12,.31,'一 隅 咖 啡','YIYU COFFEE','','#e0c990',0,true);
label(doorPivot,[.9,1.50,.048],.88,.20,'08:00 — 22:00','','','#e9dfc2',0,true);
label(doorPivot,[1.51,.85,.048],.25,.17,'推','','','#e9dfc2',0,true);
const facadeHeader=group([6,3.04,11.02],0,facade);box(facadeHeader,[0,0,0],[12.2,.35,.16],green,.02);label(facadeHeader,[0,0,.09],4,.28,'一 隅 咖 啡','YIYU / YOUR EVERYDAY CORNER','#294b38','#eee1c0');wallFade.add('front',facadeHeader);

if(quality.id==='fine')RectAreaLightUniformsLib.init();const hemi=new THREE.HemisphereLight('#fbecd2','#5d6c4a',.5);scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff0d4',2.3);sun.position.set(-5,11,18);sun.target.position.set(6,0,4);sun.castShadow=true;sun.shadow.mapSize.set(quality.shadowSize,quality.shadowSize);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:.2,far:50});sun.shadow.bias=-.00014;sun.shadow.normalBias=.016;sun.shadow.radius=3;scene.add(sun,sun.target);
const ceiling=new THREE.RectAreaLight('#fff1cd',1.8,7.5,7);ceiling.position.set(6,3.13,5.5);ceiling.rotation.x=-Math.PI/2;scene.add(ceiling);
const frontLight=new THREE.RectAreaLight('#e2eee0',2.0,11,2.6);frontLight.position.set(6,1.8,11.3);frontLight.lookAt(6,1.0,3);scene.add(frontLight);
let env:THREE.WebGLRenderTarget|undefined;
function ensureEnvironment(){if(!env){const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();env=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();}scene.environment=env.texture;}
if(quality.id==='fine')ensureEnvironment();scene.environmentIntensity=.22;
const pendantLights:THREE.PointLight[]=[];
function pendant(x:number,z:number,drop:number){const p=group([x,3.12,z]);cyl(p,[0,-drop/2,0],.007,.007,drop,black,16);const points=[new THREE.Vector2(.05,0),new THREE.Vector2(.10,-.025),new THREE.Vector2(.19,-.11),new THREE.Vector2(.28,-.18),new THREE.Vector2(.29,-.21)];mesh(new THREE.LatheGeometry(points.reverse(),56),brass,p,[0,-drop,0]);const glow=mat('#fff1c4');glow.emissive.set('#ffe4a5');glow.emissiveIntensity=.9;lightMaterials.push(glow);cyl(p,[0,-drop-.20,0],.265,.265,.012,glow);const light=new THREE.PointLight('#ffe1a1',5,4.5,2);light.position.set(x,3.12-drop-.24,z);scene.add(light);pendantLights.push(light);}
for(const x of [5.3,7.5,9.7])pendant(x,2.35,.7);for(const x of [4.9,6.7])pendant(x,6.25,.82);

function chair(at:Vec,yaw=0,color=green){const p=group(at,yaw,fixtures,'community');facilities.add('community',p);
  box(p,[0,.47,0],[.56,.14,.54],color,.065);box(p,[0,.77,-.22],[.57,.54,.12],color,.06);
  for(const x of [-.21,.21])for(const z of [-.19,.19]){const leg=cyl(p,[x,.21,z],.019,.027,.43,walnut,20);leg.rotation.z=x<0?.08:-.08;}
  return p;
}
function mug(at:Vec,which:CafeZone='lounge',yaw=0){const p=asset('ceramic-cup',at,which,{yaw});cyl(p,[0,.095,0],.035,.035,.006,mat('#654329',.22),40);return p;}
function paperCup(p:THREE.Object3D,at:Vec,greenBand=true){const g=group(at,0,p);cyl(g,[0,.067,0],.048,.035,.135,ceramic);if(greenBand)cyl(g,[0,.072,0],.044,.04,.047,green);cyl(g,[0,.14,0],.051,.051,.013,black);return g;}
function booklet(at:Vec,which:CafeZone='community',yaw=0){return asset('book-cream',at,which,{roll:-Math.PI/2,yaw});}
function potted(at:Vec,height=1.25){const p=asset('plant-leaf',[at[0],at[1]+.12,at[2]],'details',{height});cyl(fixtures,[at[0],at[1]+.18,at[2]],.19,.14,.36,mat('#b38c5e'));return p;}
function armchair(at:Vec,yaw:number){const p=group(at,yaw,fixtures,'lounge');facilities.add('lounge',p);box(p,[0,.23,0],[.82,.28,.84],walnut,.09);box(p,[0,.47,.02],[.80,.22,.82],leather,.10);box(p,[0,.78,-.33],[.83,.63,.23],leather,.10);for(const x of [-.43,.43])box(p,[x,.63,-.02],[.17,.36,.83],leather,.07);for(const x of [-.33,.33])for(const z of [-.33,.33])cyl(p,[x,.10,z],.035,.026,.2,walnut,20);const cushion=box(p,[.01,.66,-.15],[.40,.31,.12],green,.06);cushion.rotation.x=.22;return p;}
async function plantAndBooks(){
  const shelf=group([2.1,0,.27],0,fixtures,'lounge');facilities.add('books',shelf);
  box(shelf,[0,.46,-.18],[3.2,.84,.035],mat('#344535'));
  for(const x of [-1.57,-.53,.53,1.57])box(shelf,[x,.46,0],[.055,.84,.42],walnut,.008);
  for(const y of [.095,.49,.88])box(shelf,[0,y,0],[3.2,.045,.46],walnut,.009);
  box(shelf,[0,.04,0],[3.05,.08,.36],black,.008);
  for(const [bay,x]of [-1.05,0,1.05].entries())for(const [row,y]of [.12,.515].entries()){
    await checkpoint();
    for(let i=0;i<(bay===1&&row===1?3:5);i++)asset((i+bay)%2?'book-cream':'book-olive',[2.1+x-.35+i*.115,y,.31],'lounge',{height:.24+((i+bay+row)%3)*.035,yaw:(i%2)*.035});
    if(bay!==1||row===0){const stack=group([x+.28,y+.025,.035],0,shelf);for(let i=0;i<3;i++)box(stack,[0,i*.036,0],[.27-i*.015,.028,.24],i%2?cream:green,.003);}
  }
  const basket=asset('woven-basket',[2.48,.515,.31],'lounge',{height:.28});facilities.add('books',basket);
  asset('plant-small',[2.56,.905,.28],'lounge',{height:.24});cyl(shelf,[.46,.94,0],.07,.053,.07,ceramic);
  label(shelf,[-.95,.94,.10],.30,.13,'随手翻阅','','#e9dfcd','#31543d');
  wallDecor.back.push(label(building,[2.1,2.83,.021],3.0,.39,'在这里，慢一点。','MAKE ROOM FOR YOURSELF','#294b38','#e7dbbd'));
  potted([.48,0,.72],1.32);for(const s of LOUNGE_SEATS){armchair([s.x,0,s.z],s.yaw);await checkpoint();}
  const rug=box(fixtures,[2.1,.012,2.45],[3.7,.015,2.7],mat('#7e886b'),.02);rug.userData.zone='lounge';
  const table=group([2.1,0,2.65],0,fixtures,'lounge');facilities.add('community',table);cyl(table,[0,.43,0],.43,.43,.055,wood,64);cyl(table,[0,.22,0],.055,.075,.40,black);cyl(table,[0,.027,0],.25,.25,.025,black);mug([2.27,.46,2.59]);booklet([1.94,.46,2.73],'lounge',-.18);
  // Continuous upholstered bench, with a clean second table.
  const bench=group([.55,0,6],0,fixtures,'lounge');facilities.add('lounge',bench);box(bench,[0,.26,0],[.9,.42,4.7],walnut,.06);box(bench,[.05,.51,0],[.88,.18,4.65],green,.065);box(bench,[-.38,.83,0],[.19,1.05,4.68],green,.07);
  for(const z of [-1.65,-.55,.55,1.65])box(bench,[-.268,.87,z],[.014,.43,.014],brass,.002);
  for(const {x,z}of BANQUETTE_TABLES)facilities.add('community',asset('cafe-table',[x,0,z],'lounge'));for(const s of BANQUETTE_CHAIRS){await checkpoint();const c=chair([s.x,0,s.z],s.yaw,mat('#94836b'));c.userData.zone='lounge';}
  mug([1.72,.781,4.77],'lounge',.4);label(fixtures,[1.97,.84,4.72],.15,.12,'一隅','','#e4c591','#3a513a');
}
async function communalTable(){const p=group([COMMUNAL.x,0,COMMUNAL.z],0,fixtures,'community');facilities.add('community',p);box(p,[0,.735,0],[2.8,.075,1.05],wood,.025);for(const x of [-.95,.95]){box(p,[x,.34,0],[.12,.68,.72],walnut,.02);box(p,[x,.06,0],[.60,.08,.83],walnut,.025);}box(p,[0,.35,0],[2.0,.07,.10],walnut,.015);
  for(const s of COMMUNAL_SEATS){chair([s.x,0,s.z],s.yaw);await checkpoint();}
  booklet([5.15,.78,6.19],'community',.15);mug([5.58,.78,6.31],'community');
  asset('polyhaven-potted-plant-04',[6.02,.78,6.03],'community',{height:.16,yaw:.25});
  const lamp=group([6.55,.78,6.22]);cyl(lamp,[0,.012,0],.11,.11,.024,brass);cyl(lamp,[0,.18,0],.012,.012,.34,brass,20);mesh(new THREE.SphereGeometry(.14,40,24,0,Math.PI*2,0,Math.PI/2),green,lamp,[0,.34,0]);
  for(const x of [4.65,6.9]){box(fixtures,[x,.50,6.26],[.08,.065,.12],black,.01);for(const z of [6.22,6.30])box(fixtures,[x+.043,.51,z],[.003,.02,.025],ceramic);}
  const cards=group([6.2,.78,6.43],-.06);box(cards,[0,.003,0],[.22,.006,.15],cream,.002);label(cards,[0,.045,-.04],.22,.10,'周末，来坐坐','','#ede0bc','#48634a');
}
async function windowSeats(){const p=group([0,0,0],0,fixtures,'window');facilities.add('window',p);box(p,[4.5,1.0,10.55],[5.8,.07,.5],wood,.018);for(const x of [2,7])box(p,[x,.52,10.6],[.065,.99,.37],black,.012);
  for(const x of WINDOW_STOOLS){await checkpoint();if(x!==LIN_SEAT.x)facilities.add('window',asset('cafe-stool',[x,0,WINDOW_SEAT_Z],'window',{verticalHeight:LIN_SEAT.stoolHeight}));}
  emptyLinStool=asset('cafe-stool',[LIN_SEAT.x,0,WINDOW_SEAT_Z],'window',{verticalHeight:LIN_SEAT.stoolHeight});facilities.add('window',emptyLinStool);
  mug([4.3,1.04,10.48],'window',-.3);asset('book-olive',[6.1,1.04,10.52],'window',{roll:-Math.PI/2,yaw:.1});
  for(const x of [2.4,4.3,6.2]){box(fixtures,[x,.88,10.71],[.12,.065,.015],black,.008);}
  potted([.5,0,10.25],1.5);potted([11.55,0,10.35],1.5);potted([11.6,0,3.9],1.15);
  label(facade,[6.2,2.49,11.045],2.8,.26,'一杯咖啡，一段自己的时间','','','#eee0bf',0,true);
  // Simple botanical window motif is built as geometry, separate from the artwork files.
  for(const side of [0,1])for(let i=0;i<6;i++){const x=side?10.95+i*.13:1.0+i*.13,y=.55+i*.11;const leaf=mesh(new THREE.CircleGeometry(.055,24),brass,facade,[x,y,11.045],false);leaf.scale.x=.45;leaf.rotation.z=i%2?.7:-.7;}
}
function apron(x:number,color:THREE.MeshStandardMaterial){const p=group([x,1.95,.07],0,fixtures,'craft');wallDecor.back.push(p);const s=new THREE.Shape();s.moveTo(-.13,.32);s.lineTo(.13,.32);s.quadraticCurveTo(.13,.1,.24,.04);s.lineTo(.27,-.40);s.quadraticCurveTo(0,-.44,-.27,-.4);s.lineTo(-.24,.04);s.quadraticCurveTo(-.13,.1,-.13,.32);
  mesh(new THREE.ExtrudeGeometry(s,{depth:.014,bevelEnabled:true,bevelThickness:.008,bevelSize:.008,bevelSegments:3,curveSegments:20}),color,p,[0,0,0]);mesh(new THREE.TorusGeometry(.095,.01,8,40,Math.PI*1.75),walnut,p,[0,.41,.02]);box(p,[0,-.17,.035],[.22,.13,.018],color,.014);tube(p,[[-.19,-.03,.03],[-.15,-.2,.04],[-.15,-.37,.03]],.002,brass);label(p,[0,.13,.035],.16,.09,'一 隅','','','#decca3',0,true);cyl(p,[0,.50,.01],.025,.025,.06,brass,20).rotation.x=Math.PI/2;
}
function espressoMachine(p:THREE.Object3D){const g=group([7.65,.95,.42],0,p,'craft');facilities.add('coffee',g);box(g,[0,.055,.05],[1.15,.11,.66],steel,.025);box(g,[0,.39,-.10],[1.14,.58,.42],green,.075);box(g,[0,.64,-.10],[1.17,.08,.48],steel,.025);box(g,[0,.37,.12],[1.02,.10,.14],steel,.018);box(g,[0,.095,.23],[1.02,.028,.24],black,.008);
  for(let i=0;i<19;i++)box(g,[-.45+i*.05,.114,.23],[.016,.009,.22],steel,.003);
  for(const x of [-.30,.30]){cyl(g,[x,.33,.17],.085,.085,.08,steel);const handle=cyl(g,[x,.285,.30],.025,.028,.26,walnut,24);handle.rotation.x=Math.PI/2;label(g,[x,.50,.118],.17,.075,'●  ●','','#213d31','#e3c68c');mug([7.65+x,.95+.12,.68],'craft');}
  tube(g,[[.51,.42,.12],[.59,.38,.24],[.59,.18,.27]],.012,steel);tube(g,[[-.51,.43,.12],[-.59,.37,.24],[-.59,.20,.26]],.012,steel);
  for(const x of [-.38,-.12,.14,.40])cyl(g,[x,.72,-.08],.043,.038,.09,ceramic);
  const grinder=group([6.55,.95,.42],0,p,'craft');facilities.add('coffee',grinder);box(grinder,[0,.15,0],[.34,.3,.39],steel,.035);cyl(grinder,[0,.43,-.03],.13,.09,.26,mat('#6a4b33',.35));cyl(grinder,[0,.57,-.03],.14,.14,.025,black);box(grinder,[0,.26,.20],[.15,.13,.08],black,.018);cyl(grinder,[0,.13,.27],.055,.045,.12,steel);
}
function pastryDisplay(){const g=group([8,.995,2.45],0,fixtures,'order');box(g,[0,.04,0],[1.48,.08,.64],walnut,.018);box(g,[0,.58,-.03],[1.5,.06,.66],brass,.015);
  for(const x of [-.71,.71]){box(g,[x,.32,0],[.025,.55,.62],brass,.005);mesh(new THREE.PlaneGeometry(.61,.51),glass,g,[x,.32,0],false).rotation.y=Math.PI/2;}
  for(const z of [-.30,.30])mesh(new THREE.PlaneGeometry(1.43,.52),glass,g,[0,.32,z],false);
  for(const y of [.08,.32]){box(g,[0,y,0],[1.42,.018,.56],cream,.004);for(let i=0;i<4;i++){const baked=group([-.52+i*.35,y+.06,.015],i%2?.15:-.08,g);if(i%2===0){const croissant=mesh(new THREE.TorusGeometry(.083,.038,14,40,Math.PI*1.55),mat('#b97732',.7),baked,[0,0,0]);croissant.rotation.x=Math.PI/2;for(let k=0;k<5;k++){const ridge=mesh(new THREE.TorusGeometry(.083,.0025,6,40,.20),mat('#e0a25a'),baked,[0,.012,0]);ridge.rotation.set(Math.PI/2,0,k*.68);}}else{box(baked,[0,0,0],[.18,.11,.16],mat('#a07446'),.02);box(baked,[0,.063,0],[.18,.018,.16],mat('#e9c791'),.006);}}}
  label(g,[0,.043,.326],.65,.075,'烘 焙 展 示','','#624631','#efe0bd');
}
async function counter(barPoster:THREE.Texture){const p=group([0,0,0],0,fixtures,'order');
  box(p,[BAR.x,.46,BAR.z],[BAR.width,.92,BAR.depth],green,.04);box(p,[BAR.x,.97,BAR.z],[BAR.width+.06,.07,BAR.depth+.09],stone,.016);
  const reedGeo=new RoundedBoxGeometry(.032,.77,.035,2,.009),reed=new THREE.InstancedMesh(reedGeo,wood,100);geometries.add(reedGeo);const matrix=new THREE.Matrix4();for(let i=0;i<100;i++){matrix.makeTranslation(4.56+i*.0615,.47,2.88);reed.setMatrixAt(i,matrix);}reed.castShadow=true;reed.receiveShadow=true;p.add(reed);facilities.add('counter',p,[...p.children],new THREE.Vector3(BAR.x,.98,BAR.z));
  box(p,[BACK_BAR.x,.45,BACK_BAR.z],[BACK_BAR.width,.9,BACK_BAR.depth],walnut,.02);box(p,[BACK_BAR.x,.935,BACK_BAR.z],[BACK_BAR.width+.04,.055,BACK_BAR.depth+.04],stone,.012);
  for(const x of [4.95,5.85,6.75,7.65,8.55,9.45,10.3]){box(p,[x,.47,.754],[.80,.74,.025],green,.01);box(p,[x+.24,.65,.776],[.11,.012,.024],brass,.004);}
  // Local +X on the library POS is the operator side; +90 degrees faces -Z staff aisle.
  facilities.add('counter',asset('register',[9.85,1.01,2.43],'order',{yaw:Math.PI/2}));box(p,[9.85,1.023,2.79],[.21,.025,.13],black,.01);box(p,[10.24,1.07,2.42],[.13,.13,.16],cream,.016);
  for(const [x,title]of [[9.73,'点 单 / ORDER'],[5.45,'取 餐 / PICK UP']] as const){box(p,[x,.61,2.93],[1.50,.28,.045],walnut,.012);label(p,[x,.61,2.957],1.45,.24,title,'','#294b38','#eee1c0');}
  const pickup=group([5.45,1.01,2.43]);facilities.add('counter',pickup);box(pickup,[0,.018,0],[.88,.036,.5],walnut,.015);paperCup(pickup,[-.22,.035,.0]);paperCup(pickup,[.22,.035,0]);label(pickup,[0,.32,-.16],.72,.18,'咖啡好了，慢慢享用','','#eee3ce','#31543d');
  await checkpoint(true);espressoMachine(fixtures);await checkpoint(true);pastryDisplay();await checkpoint(true);asset('coffee-pot',[5.18,.97,.39],'craft');
  // A small copper coffee pot adds detail to the back bar without changing its facilities.
  asset('pixabay-cezve-4797',[5.98,.97,.4],'craft',{height:.18,yaw:-.5});
  const dripper=group([5.55,.97,.38]);cyl(dripper,[0,.10,0],.065,.065,.19,ceramic);cyl(dripper,[0,.25,0],.11,.035,.16,brass);mesh(new THREE.TorusGeometry(.11,.006,8,48),brass,dripper,[0,.33,0]).rotation.x=Math.PI/2;
  for(let i=0;i<4;i++){cyl(fixtures,[8.85+i*.19,1.10,.35],.042,.042,.26,mat(i%2?'#765233':'#b78a4f',.3));cyl(fixtures,[8.85+i*.19,1.25,.35],.021,.021,.07,black);}
  box(fixtures,[10.15,.975,.41],[.66,.025,.44],steel,.08);box(fixtures,[10.15,.985,.41],[.55,.013,.33],black,.06);tube(fixtures,[[10.15,.99,.15],[10.15,1.26,.15],[10.15,1.30,.37],[10.15,1.19,.43]],.014,steel);
  const menu=group([5.35,2.28,.06],0,fixtures,'craft');wallDecor.back.push(menu);box(menu,[0,0,0],[1.48,1.10,.055],walnut,.016);
  const menuTexture=canvasTexture(900,650,c=>{c.fillStyle='#efe5cc';c.fillRect(0,0,900,650);c.strokeStyle='#b49c70';c.lineWidth=2;c.strokeRect(25,25,850,600);c.fillStyle='#8b6945';c.font='20px Georgia';c.fillText('Y I Y U  /  C O F F E E',78,88);c.fillStyle='#294b38';c.font='600 62px "Microsoft YaHei"';c.fillText('给日常，一杯拿铁',78,220);c.font='30px Georgia';c.fillText('CAFFÈ LATTE',80,298);c.fillStyle='#a57742';c.font='68px Georgia';c.fillText('¥ 25',80,430);c.fillStyle='#55634b';c.font='25px "Microsoft YaHei"';c.fillText('热饮慢享 · 留一点自己的时间',80,545);});
  const menuMaterial=new THREE.MeshStandardMaterial({map:menuTexture,roughness:.85});materials.add(menuMaterial);mesh(new THREE.PlaneGeometry(1.40,1.01),menuMaterial,menu,[0,0,.032],false);
  const artwork=group([8.0,2.28,.06],0,fixtures,'craft');wallDecor.back.push(artwork);box(artwork,[0,0,0],[3.48,1.20,.06],walnut,.015);const artworkMaterial=new THREE.MeshStandardMaterial({map:barPoster,roughness:.87});materials.add(artworkMaterial);mesh(new THREE.PlaneGeometry(3.36,1.12),artworkMaterial,artwork,[0,0,.034],false);
  wallDecor.back.push(label(fixtures,[10.2,2.28,.077],.60,.79,'一隅','08:00 — 22:00','#294b38','#e5d4aa'));
  apron(11.05,green);apron(11.65,mat('#b5a07b'));
  const staffDoor=group([11.975,0,1.35],-Math.PI/2,fixtures,'craft');wallDecor.right.push(staffDoor);
  box(staffDoor,[0,1.12,0],[.96,2.18,.032],green,.008);
  for(const x of [-.51,.51])box(staffDoor,[x,1.14,.014],[.045,2.28,.055],walnut,.007);
  box(staffDoor,[0,2.26,.014],[1.06,.045,.055],walnut,.007);box(staffDoor,[.33,1.08,.045],[.13,.018,.055],brass,.006);
  wallDecor.right.push(label(building,[11.94,2.45,1.35],.85,.20,'工作间','','#e7ddc5','#31543d',-Math.PI/2));
  asset('fire-extinguisher',[11.80,0,8.45],'details',{height:.55});
  const condiment=group([11.55,0,6.15],-Math.PI/2,fixtures,'details');facilities.add('service',condiment);box(condiment,[0,.46,0],[1.8,.92,.65],green,.025);box(condiment,[0,.94,0],[1.85,.06,.70],stone,.012);for(const x of [-.53,.08]){cyl(condiment,[x,1.10,0],.065,.065,.27,ceramic);cyl(condiment,[x,1.24,0],.07,.07,.018,brass);}box(condiment,[.57,1.04,0],[.31,.17,.30],walnut,.018);for(let i=0;i<4;i++)box(condiment,[.57,1.133+i*.002,0],[.23,.003,.20],cream);label(condiment,[0,.68,.334],1.0,.18,'糖 / 纸巾 / 饮水','','#294b38','#e5d4aa');
  asset('trash',[11.45,0,7.64],'details',{height:.64});asset('plant-small',[11.55,.975,6.75],'details');cyl(fixtures,[11.55,1.015,6.75],.06,.044,.08,ceramic);
}
function communityBoard(){const g=group([2.1,1.94,.035],0,fixtures,'lounge');facilities.add('notice',g);wallDecor.back.push(g);box(g,[0,0,0],[2.55,1.05,.045],walnut,.025);box(g,[0,0,.028],[2.46,.96,.018],mat('#a4895b'),.009);
  const notes=[[-.8,.10,.48,.52,'拾光书单'],[-.20,-.04,.40,.42,'今天也顺利'],[.40,.09,.52,.54,'周末小记'],[.93,-.10,.35,.35,'慢一点']] as const;
  for(const [x,y,w,h,text]of notes){const p=group([x,y,.047],0,g);p.rotation.z=x*.06;box(p,[0,0,0],[w,h,.005],mat(x<0?'#e9d7aa':'#ced1b0'));label(p,[0,.06,.006],w*.88,h*.60,text,'','#e9d7aa','#4b6748');mesh(new THREE.SphereGeometry(.017,12,8),brass,p,[0,h/2-.03,.02]);}
}
function posters(posterTextures:THREE.Texture[]){for(let i=0;i<2;i++){const p=group([11.947,2.05,5.0+i*2.15],-Math.PI/2,fixtures,'details');wallDecor.right.push(p);box(p,[0,0,0],[1.10,1.65,.055],walnut,.018);const m=new THREE.MeshStandardMaterial({map:posterTextures[i],roughness:.82});materials.add(m);mesh(new THREE.PlaneGeometry(1.03,1.56),m,p,[0,0,.031],false);label(p,[0,.52,.034],.82,.28,i?'午后小景':'留一杯，给自己',i?'AN AFTERNOON ELSEWHERE':'SLOW COFFEE / GOOD DAY','','#3b5134',0,true);}
  const card=group([10.85,0,11.67],-.08,fixtures,'window');for(const x of [-.29,.29]){const leg=box(card,[x,.48,0],[.045,.96,.045],walnut,.008);leg.rotation.x=.10;}box(card,[0,.60,0],[.70,.88,.04],green,.015);label(card,[0,.65,.023],.62,.70,'给日常','一杯咖啡的空隙','#294b38','#e5d4aa');
}
function setLighting(){const atmosphere=exterior.setWeather(weather,night);host.dataset.light=night?'night':'day';
  hemi.intensity=(night?.18:.5)*atmosphere.ambient;sun.intensity=(night?.12:2.3)*atmosphere.sun;sun.color.set(atmosphere.key);ceiling.intensity=night?3.0:1.8;frontLight.intensity=(night?.25:2)*atmosphere.window;scene.environmentIntensity=(night?.10:.22)*atmosphere.ambient;sun.shadow.intensity=night?.4:.7*Math.max(.35,atmosphere.sun);pendantLights.forEach(l=>l.intensity=night?8:4);lightMaterials.forEach(m=>m.emissiveIntensity=night?1.5:.9);renderer.shadowMap.needsUpdate=true;
  host.dataset.cafeLighting=JSON.stringify({night,weather,contactShadows:true,environment:scene.environmentIntensity,ceiling:ceiling.intensity});request();}
function syncNpcCamera(){const count=sceneNpcCount(sceneNpcs,scene),linPresent=!!lin&&visibleInScene(lin.root,scene);if(count===npcCount&&linPresent===linPresentBefore)return;npcCount=count;linPresentBefore=linPresent;npcLimits=npcCameraLimits(count);controls.minPolarAngle=npcLimits.minPolar;controls.maxPolarAngle=npcLimits.maxPolar;camera.position.copy(constrainCameraEye(camera.position,controls.target,npcLimits));if(move)move.eye.copy(constrainCameraEye(move.eye,move.target,npcLimits));controls.update();if(emptyLinStool)emptyLinStool.visible=!linPresent;if(host.dataset.cafeLayout){const layout=JSON.parse(host.dataset.cafeLayout);layout.occupiedPreviewSeats=count;host.dataset.cafeLayout=JSON.stringify(layout);}host.dataset.cafeNpcCount=String(count);renderer.shadowMap.needsUpdate=true;updateCopy();}
function updateCopy(){const linPresent=!!lin&&visibleInScene(lin.root,scene);host.dataset.cafeZone=zone;host.dataset.cafeView=plan?(npcCount>0?'layout':'plan'):'perspective';options.onView?.({zone,plan,linPresent,npcReady:!!lin,night});}
function selectObject(object?:THREE.Object3D){
  const record=object?facilities.resolve(object):undefined;selected=record?.object;
  selectedFacility=record?{id:record.id,...CAFE_FACILITIES[record.id],x:50,y:50,visible:true}:null;
  lin?.setSelected(record?.id==='lin');pipeline.select(record&&record.id!=='lin'?record.outline:[]);
  host.dataset.cafeSelection=JSON.stringify(selectedFacility);options.onSelect?.(selectedFacility);request();
}
function projectSelection(){
  if(!selected||!selectedFacility)return;
  if(!visibleInScene(selected,scene)||!wallFade.pickable(selected)){selectObject();return;}
  const point=facilities.anchor(selected).project(camera);
  selectedFacility={...selectedFacility,x:(point.x+1)*50,y:(1-point.y)*50,visible:Math.abs(point.x)<1.15&&Math.abs(point.y)<1.15&&point.z>-1&&point.z<1};
  host.dataset.cafeSelection=JSON.stringify({...selectedFacility,outline:'white',outlineObjects:selectedFacility.id==='lin'?1:facilities.resolve(selected)?.outline.length});options.onProject?.(selectedFacility);
}
const projectLabels=options.onLabels?createFacilityLabelProjection(CAFE_FACILITIES,id=>facilities.find(id,object=>visibleInScene(object,scene)&&wallFade.pickable(object)),object=>facilities.anchor(object),options.onLabels):()=>{};
function focus(next:CafeZone,instant=false){
  exteriorView=false;syncNpcCamera();zone=next;if(interactive)selectObject();else{selected=undefined;pipeline.select([]);}
  controls.minZoom=interactive?venueMinimumZoom(host.clientWidth,host.clientHeight,plan):.3;
  const z=CAFE_ZONES[next];let target=plan?new THREE.Vector3(...CAFE_PLAN_VIEW.target):new THREE.Vector3(...z.target);
  const rawEye=plan?new THREE.Vector3(...CAFE_PLAN_VIEW.eye):new THREE.Vector3(...z.eye);
  let eye=cafeCameraEye(constrainCameraEye(rawEye,target,npcLimits),target);layoutScale=viewScale();
  const zoom=(plan?CAFE_PLAN_VIEW.zoom:z.zoom)*layoutScale;
  if(interactive&&ready&&!plan&&zone==='all')({eye,target}=centeredVenuePose(camera,eye,target,zoom,[building,fixtures,facade],shadowOnly));
  controls.enableRotate=true;host.dataset.cafeSettled='false';
  if(instant){camera.position.copy(eye);controls.target.copy(target);camera.zoom=zoom;camera.updateProjectionMatrix();controls.update();move=undefined;}else move={eye,target,zoom};updateCopy();request();
}

function weatherFrame(){if(disposed)return;if(sceneRenderIsCovered(host)){request();return;}renderer.info.reset();if(pipeline.renderWeather(performance.now())){host.dataset.cafeWeatherFrames=String(Number(host.dataset.cafeWeatherFrames??0)+1);host.dataset.weatherRenderStats=JSON.stringify({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,cached:true});exterior.scheduleWeatherFrame(weatherFrame);}else request();}
function resize(){
  // Hidden portrait/outgoing scenes must retain the last valid projection and zoom.
  if(host.clientWidth<2||host.clientHeight<2)return;
const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight),aspect=w/h,extent=17.2,nextScale=viewScale();controls.minZoom=exteriorView?viewportScale()*exteriorMinRatio:interactive?venueMinimumZoom(w,h,plan):.3;if(ready){camera.zoom=THREE.MathUtils.clamp(camera.zoom*nextScale/layoutScale,controls.minZoom,5);if(move)move.zoom=THREE.MathUtils.clamp(move.zoom*nextScale/layoutScale,controls.minZoom,5);}layoutScale=nextScale;renderer.setPixelRatio(scenePixelRatio(quality,w,h,renderScale,resolution,displayPixelScale(host),renderer.capabilities.maxTextureSize));renderer.setSize(w,h);Object.assign(camera,{left:-extent*aspect/2,right:extent*aspect/2,top:extent/2,bottom:-extent/2});camera.updateProjectionMatrix();pipeline.resize(w,h);host.dataset.cafeQuality=JSON.stringify({...quality,renderScale,resolution,pixelRatio:renderer.getPixelRatio(),samples:Math.min(quality.samples,renderer.capabilities.maxSamples),antialias:quality.id==='fine'?'MSAA + SMAA':'FXAA',buffer:[renderer.domElement.width,renderer.domElement.height]});if(!ready)focus(zone,true);request();}
function updateWalls(dt:number){const result=wallFade.update(camera.position,controls.target,plan,dt);exterior.syncWalls(result.opacity);host.dataset.cafeExteriorView=String(exteriorView);host.dataset.cafeWalls=JSON.stringify({mode:'fade',height:CAFE.height,opacity:result.opacity});facade.visible=!plan;facadeHeader.visible=!plan&&(exteriorView||zone==='window');return result.moving;}
function request(){if(!disposed&&!frame)frame=requestAnimationFrame(now=>{try{render(now);}catch(error){readiness.fail(error);console.error('Cafe scene render failed',error);}});}
let presentationReady=false;
function render(now:number){
  if(sceneRenderIsCovered(host)){frame=0;request();return;}
  if(!presentationReady){frame=0;return;}frame=0;if(disposed)return;syncNpcCamera();const dt=Math.min(.06,Math.max(.001,(now-(last||now-16))/1000));last=now;let moving=false;if(move){const a=1-Math.exp(-dt*9);camera.position.lerp(move.eye,a);controls.target.lerp(move.target,a);camera.zoom=THREE.MathUtils.lerp(camera.zoom,move.zoom,a);camera.updateProjectionMatrix();controls.update();if(camera.position.distanceTo(move.eye)<.005&&controls.target.distanceTo(move.target)<.005&&Math.abs(camera.zoom-move.zoom)<.002){camera.position.copy(move.eye);controls.target.copy(move.target);camera.zoom=move.zoom;camera.updateProjectionMatrix();move=undefined;}else moving=true;}
  const desired=doorOpen?1:0;if(Math.abs(doorAmount-desired)>.001){doorAmount=THREE.MathUtils.damp(doorAmount,desired,8,dt);moving=true;}else{if(doorAmount!==desired)renderer.shadowMap.needsUpdate=true;doorAmount=desired;}doorPivot.rotation.y=doorAmount*Math.PI/2;camera.position.copy(cafeCameraEye(camera.position,controls.target));if(interactive&&!move&&!rightDrag)constrainVenuePan(camera,controls.target,new THREE.Box3(new THREE.Vector3(-.3,0,-.3),new THREE.Vector3(CAFE.width+(exteriorView?2:.3),CAFE.height,CAFE.depth+(exteriorView?5.1:1.8))));moving=updateWalls(dt)||moving;moving=exterior.updateEnvironment(camera,controls.target,now)||moving;camera.updateMatrixWorld();projectSelection();if(ready)projectLabels(camera);host.dataset.cafeNpc=JSON.stringify(lin&&visibleInScene(lin.root,scene)?{...lin.update(camera,night),present:true}:{id:LIN_SEAT.npcId,present:false});renderer.info.reset();pipeline.render();host.dataset.cafeReady=String(readiness.rendered(host.clientWidth,host.clientHeight));host.dataset.cafeCamera=JSON.stringify({eye:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom,plan,elevation:Math.PI/2-controls.getPolarAngle(),polar:controls.getPolarAngle(),minPolar:controls.minPolarAngle,maxPolar:controls.maxPolarAngle,npcRestricted:npcLimits.restricted,npcCount,verticalRotationLocked:false,rotateEnabled:controls.enableRotate,screenSpacePanning:controls.screenSpacePanning});host.dataset.cafeDoor=JSON.stringify({open:doorOpen,amount:doorAmount});host.dataset.cafeRenderStats=JSON.stringify({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries});host.dataset.cafeFrames=String(Number(host.dataset.cafeFrames??0)+1);host.dataset.cafeSettled=String(!moving);if(moving)request();else{last=0;exterior.scheduleWeatherFrame(weatherFrame);}
}
controls.addEventListener('change',request);controls.addEventListener('start',()=>{move=undefined;});
function rotate(angle:number){if(plan){plan=false;focus('all',true);}const offset=camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),angle);move={eye:controls.target.clone().add(offset),target:controls.target.clone(),zoom:camera.zoom};request();}
function zoom(factor:number){move=undefined;camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,controls.minZoom,5);camera.updateProjectionMatrix();request();}
function toggleDoor(){doorOpen=!doorOpen;request();}
function setQuality(mode:QualityMode){const next=sceneQuality(mode);if(JSON.stringify(next)===JSON.stringify(quality))return;quality=next;exterior.setDetail(quality.id,Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy()));pipeline.dispose();if(quality.id==='fine')ensureEnvironment();pipeline=createScenePipeline(renderer,scene,camera,shadowOnly,quality);pipeline.setWeatherLayer(exterior.weatherLayer);pipeline.setContactObjects(()=>[fixtures]);if(selected){const record=facilities.resolve(selected);pipeline.select(interactive?(record?.outline??[]):[selected]);}textures.forEach(t=>{t.anisotropy=Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy());t.needsUpdate=true;});sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(quality.shadowSize,quality.shadowSize);renderer.shadowMap.needsUpdate=true;resize();request();}
const events=new AbortController();
const removeLabelGestures=bridgeSceneLabelGestures(host.parentElement??host,renderer.domElement);
events.signal.addEventListener('abort',removeLabelGestures,{once:true});
const startPointer=new THREE.Vector2(),ray=new THREE.Raycaster(),activePointers=new Set<number>();let multiPointer=false,rightDrag=false;
function facilityHit(clientX:number,clientY:number){
  const bounds=renderer.domElement.getBoundingClientRect();camera.updateMatrixWorld();
  ray.setFromCamera(new THREE.Vector2((clientX-bounds.left)/bounds.width*2-1,-(clientY-bounds.top)/bounds.height*2+1),camera);
  return ray.intersectObjects(facilities.roots(),true).find(hit=>{
    const record=facilities.resolve(hit.object);
    if(!record||!visibleInScene(record.object,scene)||!wallFade.pickable(hit.object))return false;
    return record.id!=='lin'||!!lin&&hit.object.userData.cafeCharacterCard&&!!hit.uv&&lin.containsUV(hit.uv);
  });
}
renderer.domElement.addEventListener('pointerdown',e=>{rightDrag=e.button===2;activePointers.add(e.pointerId);if(activePointers.size>1)multiPointer=true;startPointer.set(e.clientX,e.clientY);},{signal:events.signal});
renderer.domElement.addEventListener('wheel',()=>{rightDrag=false;},{signal:events.signal});
renderer.domElement.addEventListener('pointercancel',e=>{activePointers.delete(e.pointerId);if(!activePointers.size)multiPointer=false;},{signal:events.signal});
renderer.domElement.addEventListener('pointermove',e=>{if(interactive&&!e.buttons&&ready)renderer.domElement.style.cursor=facilityHit(e.clientX,e.clientY)?'pointer':'grab';},{signal:events.signal});
renderer.domElement.addEventListener('pointerup',e=>{
  const gesture=multiPointer;activePointers.delete(e.pointerId);if(!activePointers.size)multiPointer=false;
  if(e.button!==0||gesture||startPointer.distanceTo(new THREE.Vector2(e.clientX,e.clientY))>5||!ready)return;
  if(interactive){const hit=facilityHit(e.clientX,e.clientY);selectObject(hit?.object);return;}
  const b=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1),camera);
  const hits=ray.intersectObjects(pickables,true);let object:THREE.Object3D|undefined=hits.find(hit=>visibleInScene(hit.object,scene)&&wallFade.pickable(hit.object)&&(!lin||hit.object.parent!==lin.root||hit.uv&&lin.containsUV(hit.uv)))?.object;
  while(object&&!object.userData.zone)object=object.parent??undefined;if(!object)return;if(object===doorPivot){toggleDoor();return;}zone=object.userData.zone as CafeZone;if(zone==='lin'){focus('lin');options.onNpc?.();return;}selected=object;pipeline.select([object]);updateCopy();request();
},{signal:events.signal});
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);window.addEventListener('resize',resize);resize();focus('all',true);setLighting();
async function load(){const loader=new GLTFLoader(),entries=Object.entries(quality.id==='light'?import.meta.glob('../assets/scenes/cafe/*.glb',{eager:true,query:'?mobile-model&url',import:'default'}):import.meta.glob('../assets/scenes/cafe/*.glb',{eager:true,query:'?url',import:'default'})) as [string,string][];let count=0;
  const results=await Promise.allSettled(entries.map(async([path,url])=>{const result=await loadSceneModel(()=>loader.loadAsync(url),()=>disposed);if(disposed){releaseLateModel(result.scene);return;}try{await checkpoint();}catch(error){releaseLateModel(result.scene);throw error;}result.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;geometries.add(o.geometry);for(const material of (Array.isArray(o.material)?o.material:[o.material]) as THREE.MeshStandardMaterial[]){materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture){value.anisotropy=Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy());textures.add(value);}}}});templates.set(path.split('/').pop()!.replace('.glb',''),result.scene);count++;if(disposed){disposeResources();return;}options.onProgress?.(count,entries.length);}));
  if(disposed){disposeResources();return;}
  const errors=results.flatMap((r,i)=>r.status==='rejected'?[{path:entries[i][0],error:String(r.reason)}]:[]);if(errors.length)throw Error(JSON.stringify(errors));
  const posterTextures=await Promise.all([new URL('../assets/scenes/cafe/coffee-ritual.png',import.meta.url).href,new URL('../assets/scenes/cafe/city-afternoon.png',import.meta.url).href,new URL('../assets/scenes/cafe/cafe-bar-poster-v2.png',import.meta.url).href].map(async url=>{const t=await new THREE.TextureLoader().loadAsync(url);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy());if(disposed)t.dispose();else textures.add(t);return t;}));
  if(disposed){disposeResources();return;}
  await checkpoint(true);await plantAndBooks();await checkpoint(true);await communalTable();await checkpoint(true);await windowSeats();await checkpoint(true);await counter(posterTextures[2]);await checkpoint(true);communityBoard();await checkpoint();posters(posterTextures);for(const side of ['left','right','back'] as const)wallFade.add(side,...wallDecor[side]);
  await checkpoint(true);
  host.dataset.cafeBatched=String(await batchSceneFixturesAsync(fixtures,new Set(pickables),g=>geometries.add(g),checkpoint));
  host.dataset.cafeAssets=String(count);host.dataset.cafePlacements=JSON.stringify(placements);host.dataset.cafeLayout=JSON.stringify({width:CAFE.width,depth:CAFE.depth,staffAisle:BAR.z-BAR.depth/2-(BACK_BAR.z+BACK_BAR.depth/2),seats:{lounge:2,banquette:4,communal:6,window:3},occupiedPreviewSeats:0,linSeat:LIN_SEAT,chairFacing:{communal:COMMUNAL_SEATS,banquette:BANQUETTE_CHAIRS,lounge:LOUNGE_SEATS},orderX:9.85,pickupX:5.45});host.dataset.cafeGameplay=JSON.stringify({...CAFE_GAMEPLAY,mode:options.mode==='preview'?'npc-visual-preview':'game-scene',npcVisualPreview:options.mode==='preview',liveNpcIntegration:options.mode!=='preview'});host.dataset.cafeErrors='[]';ready=true;if(interactive&&zone==='all'&&!plan)focus('all',true);setLighting();request();host.dataset.cafeNpcStatus='loading';try{lin=await createLinSprite(renderer);if(disposed){lin.dispose();return;}lin.root.visible=desiredLin;fixtures.add(lin.root);sceneNpcs.add(lin.root);pickables.push(lin.root);facilities.add('lin',lin.root,[],new THREE.Vector3(LIN_SEAT.x,1.25,LIN_SEAT.z));host.dataset.cafeNpcStatus='ready';host.dataset.cafeNpcErrors='[]';syncNpcCamera();}catch(error){host.dataset.cafeNpcStatus='unavailable';host.dataset.cafeNpcErrors=String(error);console.error(error);}request();
}
void Promise.all([load(),exterior.ready]).then(async()=>{await checkpoint(true);if(disposed)return;updateWalls(1);exterior.updateEnvironment(camera,controls.target,performance.now());await pipeline.warmup();if(!disposed){presentationReady=true;readiness.assetsReady();request();}}).catch(error=>{if(!disposed){host.dataset.cafeErrors=String(error);readiness.fail(error);}});
const readyPromise=readiness.promise;
function releaseLateModel(root:THREE.Object3D){
  const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>(),ts=new Set<THREE.Texture>();
  root.traverse(object=>{if(object instanceof THREE.Mesh){gs.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material]){ms.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)ts.add(value);}}});
  gs.forEach(item=>item.dispose());ms.forEach(item=>item.dispose());ts.forEach(item=>item.dispose());
}
function disposeResources(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
function dispose(){if(disposed)return;disposed=true;readiness.cancel();host.removeEventListener('scene-weather-resume',request);cancelAnimationFrame(frame);events.abort();resizeObserver.disconnect();window.removeEventListener('resize',resize);controls.dispose();pipeline.dispose();exterior.dispose();lin?.dispose();disposeResources();fixtures.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});env?.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
const captureStill=createVenueStillBake({renderer,scene,camera,target:controls.target,prepare(state){
  cancelAnimationFrame(frame);frame=0;move=undefined;selected=undefined;selectedFacility=null;pipeline.select([]);plan=false;zone='all';exteriorView=false;
  night=state.night;weather=state.weather??'sunny';setLighting();pipeline.setWeatherLayer(undefined);doorOpen=state.doorOpen;doorAmount=doorOpen?1:0;doorPivot.rotation.y=doorAmount*Math.PI/2;
  if(lin){lin.root.visible=false;lin.update(camera,night);}if(emptyLinStool)emptyLinStool.visible=false;
  updateWalls(10);exterior.updateEnvironment(camera,controls.target,0);renderer.shadowMap.needsUpdate=true;cancelAnimationFrame(frame);frame=0;
},render(){pipeline.resize(renderer.domElement.width,renderer.domElement.height);pipeline.render();},facilities:()=>Object.keys(CAFE_FACILITIES).flatMap(id=>{const record=facilities.find(id as CafeFacilityId,()=>true);return record?[{id,point:facilities.anchor(record.object)}]:[];}),layer:name=>name==='lin'?lin?.root:emptyLinStool});
return {
  ready:readyPromise,captureStill,
  update(state:CafeRoomState){if(disposed)return;desiredLin=state.linPresent;if(lin)lin.root.visible=desiredLin;if(night!==state.night||weather!==(state.weather??weather)){night=state.night;weather=state.weather??weather;setLighting();}syncNpcCamera();request();},
  focus(next:CafeZone){if(disposed)return;plan=false;focus(next);},
  overview(){plan=!plan;focus('all');},
  reset(){plan=false;focus('all');},
  exterior(){selectObject();plan=false;zone='all';exteriorView=true;layoutScale=viewScale();const target=new THREE.Vector3(6,1.0,6.9),eye=cafeCameraEye(constrainCameraEye(new THREE.Vector3(19,15,28),target,npcLimits),target);move=centeredVenuePose(camera,eye,target,viewportScale()*.86,[building,fixtures,facade,exterior.root],shadowOnly,true);exteriorMinRatio=move.zoom/viewportScale()*.95;controls.minZoom=viewportScale()*exteriorMinRatio;updateCopy();request();},
  selectFacility(id:CafeFacilityId|null,focusView=false){if(disposed)return false;if(!id){selectObject();return true;}const record=facilities.find(id,object=>visibleInScene(object,scene));if(!record)return false;if(focusView)focus(CAFE_FACILITIES[id].zone);selectObject(record.object);return true;},
  setDragMode(mode:'pan'|'rotate'){controls.mouseButtons.LEFT=THREE.MOUSE.PAN;controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;controls.touches.ONE=mode==='pan'?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;host.dataset.cafeDragMode=mode;},
  rotate,zoom,toggleDoor,setQuality,setResolution(scale:number,mode:RenderResolution='auto'){const next=clampRenderScale(scale);if(next===renderScale&&mode===resolution)return;renderScale=next;resolution=mode;resize();},dispose,
};
}
