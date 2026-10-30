import {batchSceneFixturesAsync} from './sceneBatching';
import {createVenueStillBake} from './venueStillBake3D';
import {createSceneReadiness,createSceneWorkBudget,sceneRenderIsCovered,loadSceneModel} from './sceneLoadWork';
import * as THREE from 'three';
import {createSceneCanvas} from './sceneTextureCanvas';
import {displayPixelScale,type RenderResolution} from './renderResolution';
import {bridgeSceneLabelGestures} from './scenePointerBridge';
import type {WeatherId} from '../game/types';
import {clampRenderScale} from './mobileLayout';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createScenePipeline, sceneQuality, scenePixelRatio, type QualityMode } from './scenePipeline';
import { COLD_CASES, COUNTERS, COUNTER_X, FIRE_EXTINGUISHER, SERVICE_COUNTER, SHELF_BAYS, SHELF_ROWS, STORE, TABLES, ZONES, type ZoneId } from './convenienceStore/layout';
import { GAMEPLAY_STOPS, type StopId } from './convenienceStore/gameplay';

import {STORE_FACILITIES,createStoreFacilityRegistry,type StoreFacilityId,type StoreFacilitySelection} from './convenienceStore/facilities';
import {visibleInScene} from './cafeRoom/npcCamera';
import {centeredVenuePose,venueEntryZoom,venueMinimumZoom,constrainVenuePan} from './venueFraming';
import {createSceneExterior,cladExteriorBox} from './sceneExterior';
import {createFacilityLabelProjection} from './facilityLabelProjection';
import type {SceneNameLabel} from './sceneLabels';
import {createWallTransition} from './wallTransition';
export interface StoreRoomViewState {zone:ZoneId;plan:boolean;night:boolean;stop?:StopId}
export interface StoreRoomOptions {night?:boolean;weather?:WeatherId;quality?:QualityMode;renderScale?:number;resolution?:RenderResolution;mode?:'game'|'preview';onView?:(state:StoreRoomViewState)=>void;onProgress?:(loaded:number,total:number)=>void;onSelect?:(selection:StoreFacilitySelection|null)=>void;onProject?:(selection:StoreFacilitySelection)=>void;onLabels?:(labels:SceneNameLabel[])=>void}
export type StoreRoomView=ReturnType<typeof createStoreRoom>;
export function createStoreRoom(host:HTMLDivElement,options:StoreRoomOptions={}){
const interactive=options.mode!=='preview';
let weather:WeatherId=options.weather??'sunny';
const events=new AbortController();
const facilities=createStoreFacilityRegistry();
const urls=import.meta.glob('../assets/scenes/convenience-store/*.glb',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const mobileUrls=import.meta.glob('../assets/scenes/convenience-store/*.glb',{eager:true,query:'?mobile-model&url',import:'default'}) as Record<string,string>;
let quality=sceneQuality(options.quality),renderScale=clampRenderScale(options.renderScale??1),resolution=options.resolution??'auto';
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: quality.id==='fine'?'high-performance':'default' });
renderer.setPixelRatio(quality.pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;renderer.toneMapping = THREE.ACESFilmicToneMapping;renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;renderer.shadowMap.type = THREE.PCFShadowMap;renderer.shadowMap.autoUpdate = false;
renderer.info.autoReset = false;
renderer.localClippingEnabled = true;renderer.domElement.addEventListener('webglcontextlost',()=>{if(!disposed)host.dispatchEvent(new CustomEvent('scene-context-lost',{bubbles:true}));});
renderer.domElement.setAttribute('aria-label', '便利店场景，拖动旋转，右键平移，滚轮缩放');
host.append(renderer.domElement);host.addEventListener('scene-weather-resume',request);
const scene = new THREE.Scene();scene.background = new THREE.Color('#e6edf1');
let exteriorMinRatio=.86;
const camera = new THREE.OrthographicCamera(-12, 12, 8.25, -8.25, .1, 120);
camera.position.set(...ZONES.all.eye);camera.lookAt(...ZONES.all.target);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...ZONES.all.target);controls.enableDamping = false;controls.minZoom = .25;controls.maxZoom = 5;
if(interactive){controls.mouseButtons.LEFT=THREE.MOUSE.PAN;controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;controls.touches.ONE=THREE.TOUCH.PAN;renderer.domElement.setAttribute('aria-label','便利店全屏场景，点击设施选择，左键移动，右键转向，滚轮缩放');}
controls.minPolarAngle = .002;controls.maxPolarAngle = Math.PI * .46;controls.maxTargetRadius = 20;controls.zoomSpeed = .85;
const shadowOnly: THREE.Object3D[] = [];
let outline = createScenePipeline(renderer, scene, camera, shadowOnly, quality);
outline.setContactObjects(()=>[fixtures,goods]);
const resources = { materials: new Set<THREE.Material>(), geometries: new Set<THREE.BufferGeometry>(), textures: new Set<THREE.Texture>() };
const templates = new Map<string, { model: THREE.Object3D; size: THREE.Vector3 }>();
const fixtures = new THREE.Group(), goods = new THREE.Group(), building = new THREE.Group();scene.add(building, fixtures, goods);
const pickables: THREE.Object3D[] = [];
let zone: ZoneId = 'all', planView = false, exteriorView=false, night = options.night??false, disposed = false, frame = 0, ready = false;
const readiness=createSceneReadiness(),checkpoint=createSceneWorkBudget(()=>disposed);
let doorOpen = false, doorAmount = 0, lastTime = 0;
let move: { eye: THREE.Vector3; target: THREE.Vector3; zoom: number } | undefined;
let selected: THREE.Object3D | undefined;
let activeStop: StopId | undefined;
let selection:StoreFacilitySelection|null=null;
const mobileScale = () => Math.min(1,host.clientWidth/Math.max(1,host.clientHeight)/1.05);
const viewScale=()=>mobileScale()*(interactive&&!planView&&!exteriorView&&zone==='all'?venueEntryZoom(host.clientWidth,host.clientHeight):1);
let layoutScale=viewScale();

function mat(color: string, roughness = .78, metalness = 0) {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });resources.materials.add(material);return material;
}
const white = mat('#f3f6f7'), plaster = mat('#edf1f2'), brandBlue = mat('#0877cc'), sage = mat('#7eb9de'), wood = mat('#c6a77e'), dark = mat('#283b4b');
const steel = mat('#a9b0ab', .35, .58);
function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, position: [number, number, number], cast = true) {
  const model = new THREE.Mesh(geometry, material);model.position.set(...position);model.castShadow = cast;model.receiveShadow = true;
  parent.add(model);resources.geometries.add(geometry);return model;
}
function box(parent: THREE.Object3D, position: [number, number, number], size: [number, number, number], material: THREE.Material, cast = true) {
  return mesh(new THREE.BoxGeometry(...size), material, parent, position, cast);
}
function roundedBox(parent: THREE.Object3D, position: [number, number, number], size: [number, number, number], material: THREE.Material, radius=.012) {
  return mesh(new RoundedBoxGeometry(...size,3,Math.min(radius,...size.map(value=>value*.22))),material,parent,position);
}
function textTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) {
  const canvas = createSceneCanvas(width,height,draw,quality.id==='light'?768:Infinity);
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace = THREE.SRGBColorSpace;texture.anisotropy = Math.min(quality.anisotropy, renderer.capabilities.getMaxAnisotropy());resources.textures.add(texture);return texture;
}
const glowingSigns:THREE.MeshStandardMaterial[]=[];
function sign(parent: THREE.Object3D, width: number, height: number, position: [number, number, number], title: string, subtitle = '', background = '#0877cc', foreground = '#f7fbff', yaw = 0, illuminated = false) {
  const textureHeight=Math.max(64,Math.round(1024*height/width));
  const texture = textTexture(1024, textureHeight, c => {
    c.fillStyle = background;c.fillRect(0, 0, 1024, textureHeight);c.fillStyle = foreground;c.textAlign = 'center';c.textBaseline = 'middle';
    const fontSize=textureHeight*(subtitle?.36:.48);c.font=`600 ${fontSize}px "Microsoft YaHei", sans-serif`;
    const fit=Math.min(1,920/c.measureText(title).width);c.font=`600 ${fontSize*fit}px "Microsoft YaHei", sans-serif`;
    c.fillText(title,512,textureHeight*(subtitle?.39:.52));
    if (subtitle) {c.font=`${textureHeight*.16}px "Microsoft YaHei", sans-serif`;c.fillText(subtitle,512,textureHeight*.78,930);}
  });
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .8 });resources.materials.add(material);
  if(illuminated){material.emissive.set('#ffffff');material.emissiveMap=texture;material.emissiveIntensity=.15;glowingSigns.push(material);}
  const model = mesh(new THREE.PlaneGeometry(width, height), material, parent, position, false);model.rotation.y = yaw;return model;
}

// Muted shop tiles: their slight variation and narrow grout are drawn locally.
const tileTexture = textTexture(512, 512, c => {
  c.fillStyle = '#b9c3c9';c.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
    const tone = [219, 222, 224, 221][(x * 3 + y) % 4];c.fillStyle = `rgb(${tone-3},${tone+1},${tone+3})`;c.fillRect(x*128+1, y*128+1, 126, 126);
  }
  for (let i = 0; i < 6000; i++) { const x = (i * 157 + 31) % 512, y = (i * 251 + Math.floor(i/512)*17) % 512;c.fillStyle = i%2 ? '#ffffff0a' : '#434d3507';c.fillRect(x, y, 1, 1); }
});
tileTexture.wrapS = tileTexture.wrapT = THREE.RepeatWrapping;tileTexture.repeat.set(STORE.width / 2.4, STORE.depth / 2.4);
const tileMaterial = new THREE.MeshStandardMaterial({ map: tileTexture, roughness: .9 });resources.materials.add(tileMaterial);
box(building, [STORE.width/2, -.15, STORE.depth/2], [STORE.width+.5, .28, STORE.depth+.5], mat('#c5c1af'));
box(building, [STORE.width/2, -.015, STORE.depth/2], [STORE.width, .035, STORE.depth], tileMaterial);
const exterior=createSceneExterior(scene,{kind:'store',width:STORE.width,depth:STORE.depth,height:STORE.height,detail:quality.id,anisotropy:Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy()),host,request:()=>{renderer.shadowMap.needsUpdate=true;request();}});
outline.setWeatherLayer(exterior.weatherLayer);

const invisibleShadow = new THREE.MeshStandardMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });resources.materials.add(invisibleShadow);
type WallPart = { side: 'left' | 'right' | 'back' | 'front'; visible: THREE.Group; solid: THREE.Mesh; height: number; cap: THREE.Mesh; base: [number, number, number] };
const walls: WallPart[] = [];
function wall(side: WallPart['side'], center: [number, number, number], size: [number, number, number]) {
  const group = new THREE.Group();building.add(group);
  const solid = box(group, center, size, plaster, false);
  cladExteriorBox(solid,exterior.facadeMaterial,new THREE.Vector3(side==='left'?-1:side==='right'?1:0,0,side==='back'?-1:side==='front'?1:0));
  const shadow = box(building, center, size, invisibleShadow);shadowOnly.push(shadow);
  const cap = box(group, [center[0], size[1], center[2]], [size[0]+.015, .035, size[2]+.015], white, false);
  const skirting = box(group, [center[0], .075, center[2]], [size[0]+.025, .15, size[2]+.025], brandBlue, false);skirting.receiveShadow = false;
  walls.push({ side, visible: group, solid, height: size[1], cap, base: center });
}
wall('back', [STORE.width/2, STORE.height/2, -.075], [STORE.width+.16, STORE.height, .15]);
wall('right', [STORE.width+.075, STORE.height/2, STORE.depth/2], [.15, STORE.height, STORE.depth+.15]);
wall('left', [-.075, STORE.height/2, 4], [.15, STORE.height, 8]);
wall('front', [9.25, STORE.height/2, STORE.depth+.075], [2.3, STORE.height, .15]);
const roof = box(building, [STORE.width/2, STORE.height+.02, STORE.depth/2], [STORE.width, .04, STORE.depth], invisibleShadow);shadowOnly.push(roof);

const glass = new THREE.MeshPhysicalMaterial({ color: '#b8d7cc', transparent: true, opacity: .14, roughness: .14, metalness: .08, depthWrite: false, side: THREE.DoubleSide });resources.materials.add(glass);
function glassPanel(parent: THREE.Object3D, width: number, height: number, position: [number, number, number], yaw = 0) {
  const group = new THREE.Group();group.position.set(...position);group.rotation.y = yaw;parent.add(group);
  box(group, [0, height/2, 0], [width, height, .025], glass, false);
  for (const x of [-width/2, width/2]) box(group, [x, height/2, .015], [.045, height+.04, .06], dark, false);
  for (const y of [0, height]) box(group, [0, y, .015], [width+.05, .045, .06], dark, false);
  return group;
}
// A continuous right wall; no extra room is inferred from the two black sketch marks.
const facade = new THREE.Group(), frontHeader = new THREE.Group();building.add(facade, frontHeader);
glassPanel(facade, 3.08, 2.6, [1.54, .12, STORE.depth]);
glassPanel(facade, 2.25, 2.6, [6.97, .12, STORE.depth]);
for (const z of [8.72, 10.27, 11.68]) glassPanel(building, z === 11.68 ? 1.33 : 1.48, 2.6, [0, .12, z], Math.PI/2);
const headerBlue=mat('#0877cc'),headerWhite=mat('#f7fbff');
headerBlue.emissive.set('#0877cc');headerWhite.emissive.set('#f7fbff');glowingSigns.push(headerBlue,headerWhite);
box(frontHeader, [4.05, 2.92, STORE.depth], [8.2, .54, .18], headerBlue, false);
for(const y of [2.68,3.16]) box(frontHeader,[4.05,y,STORE.depth+.105],[8.21,.045,.028],headerWhite,false);
sign(frontHeader, 3.9, .46, [4.4, 2.94, STORE.depth+.11], '朝 夕 便 利', 'CHAO XI  /  CITY CONVENIENCE','#0877cc','#ffffff',0,true);
sign(frontHeader,.85,.36,[.76,2.94,STORE.depth+.11],'24H','','#ffffff','#0877cc',0,true);
sign(facade, 1.4, .5, [1.52, 1.50, STORE.depth+.035], '24 小时营业', 'OPEN 24 HOURS', '#f4f8fb', '#0969b3');
const doorRoot = new THREE.Group();doorRoot.userData.zone = 'entrance';fixtures.add(doorRoot);pickables.push(doorRoot);facilities.add('door',doorRoot);
const doorLeft = glassPanel(doorRoot, 1.28, 2.58, [3.9, .12, STORE.depth+.01]);
const doorRight = glassPanel(doorRoot, 1.28, 2.58, [5.2, .12, STORE.depth+.01]);
for (const leaf of [doorLeft, doorRight]) {
  box(leaf, [0, 1.2, .04], [1.24, .08, .02], sage, false);box(leaf, [0, 1.38, .07], [.025, .38, .04], steel, false);
}
box(building, [4.55, 2.76, STORE.depth], [2.77, .11, .18], dark, false);
box(building, [4.55, .015, STORE.depth], [2.8, .02, .09], steel, false);
const entryMat = box(building, [4.55, .025, 11.6], [2.6, .025, .90], mat('#4b6255'), false);
sign(building, 7.15, .46, [4.15, 2.50, .013], '冷 藏 鲜 食  /  饮 品', 'FRESH MEALS                         COLD DRINKS','#0877cc','#ffffff',0,true);
sign(building, 1.55, .40, [STORE.width-.01, 2.25, 7.0], '收 银', 'CHECKOUT', '#0877cc', '#ffffff', -Math.PI/2);
sign(building, 2.6, .55, [.02, 2.15, 5.75], '自 助 服 务', 'HEAT  /  HOT WATER  /  COFFEE', '#0877cc', '#ffffff', Math.PI/2);

// A restrained shop identity repeats on end panels, the entrance and takeaway cups.
for(const [row,x]of SHELF_ROWS.entries()) {
  box(building,[x,1.62,7.55],[.80,.19,.035],brandBlue,false);
  sign(building,.73,.14,[x,1.62,7.573],row===0?'零 食 · 速 食':'调 味 · 日 用','','#0877cc','#ffffff');
  for(const side of [-1,1])box(building,[x+side*.32,1.56,7.55],[.018,.15,.025],steel,false);
}

function sidewalkPlant(x:number,z:number) {
  const group=new THREE.Group();group.position.set(x,0,z);building.add(group);
  mesh(new THREE.CylinderGeometry(.18,.145,.28,24),mat('#a28964'),group,[0,.14,0]);
  mesh(new THREE.CylinderGeometry(.157,.157,.018,24),mat('#4c4533'),group,[0,.275,0]);
  for(let leaf=0;leaf<11;leaf++) {
    const angle=leaf*2.39996,height=.42+(leaf%4)*.095,reach=.19+(leaf%3)*.045,vertices:number[]=[],indices:number[]=[];
    for(let step=0;step<=8;step++) {
      const t=step/8,r=reach*t*t,y=.28+height*Math.sin(t*Math.PI*.56),halfWidth=.044*Math.sin(t*Math.PI)*(.8+(leaf%2)*.25);
      for(const side of [-1,1])vertices.push(Math.cos(angle)*r+Math.sin(angle)*halfWidth*side,y,Math.sin(angle)*r-Math.cos(angle)*halfWidth*side);
      if(step<8){const i=step*2;indices.push(i,i+1,i+2,i+1,i+3,i+2);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const material=mat(leaf%2?'#4d6c43':'#738254');material.side=THREE.DoubleSide;mesh(geometry,material,group,[0,0,0]);
  }
}
sidewalkPlant(.42,13.35);sidewalkPlant(8.6,13.90);

let posterTexture:THREE.Texture|undefined;
const posterMaterials:THREE.MeshStandardMaterial[]=[];
function breakfastPoster(parent:THREE.Object3D,width:number,height:number,position:[number,number,number],yaw=0) {
  const group=new THREE.Group();group.position.set(...position);group.rotation.y=yaw;parent.add(group);
  box(group,[0,0,0],[width+.035,height+.035,.025],brandBlue,false);
  const imageMaterial=new THREE.MeshStandardMaterial({map:posterTexture,emissiveMap:posterTexture,emissive:'#ffffff',emissiveIntensity:.035,roughness:.85});resources.materials.add(imageMaterial);posterMaterials.push(imageMaterial);
  mesh(new THREE.PlaneGeometry(width,height),imageMaterial,group,[0,0,.014],false);
  const lettering=textTexture(1024,380,c=>{c.clearRect(0,0,1024,380);c.fillStyle='#17659e';c.textAlign='center';c.font='600 112px "Microsoft YaHei", sans-serif';c.fillText('早点遇见',512,143);c.fillText('好心情',512,282);});
  const letteringMaterial=new THREE.MeshBasicMaterial({map:lettering,transparent:true,depthWrite:false});resources.materials.add(letteringMaterial);
  mesh(new THREE.PlaneGeometry(width*.82,height*.23),letteringMaterial,group,[0,height*.295,.016],false);
  return group;
}
function breakfastCorners() {
  breakfastPoster(building,.78,1.04,[.045,1.83,10.85],Math.PI/2);
  const stand=new THREE.Group();stand.position.set(7.65,0,13.18);stand.rotation.y=-.10;building.add(stand);
  for(const side of [-1,1]){
    const board=box(stand,[0,.62,side*.14],[.72,1.12,.036],brandBlue);board.rotation.x=-side*.16;
    for(const x of [-.32,.32]){const leg=box(stand,[x,.60,side*.14],[.045,1.19,.045],wood);leg.rotation.x=-side*.16;}
  }
  const poster=breakfastPoster(stand,.63,.84,[0,.67,.174]);poster.rotation.x=-.16;
  sign(stand,.52,.13,[0,.075,.27],'朝夕早餐','','#0877cc','#f7fbff');
}

const priceMatrices:THREE.Matrix4[][]=[[],[],[],[],[]];
const priceMaterials=['4','1','2','3',null].map(price=>{
  const texture=textTexture(256,96,c=>{c.fillStyle='#f5f9fc';c.fillRect(0,0,256,96);c.fillStyle='#0877cc';c.fillRect(0,0,9,96);c.fillStyle='#225b8d';c.font=`600 ${price===null?34:48}px "Microsoft YaHei", sans-serif`;c.textAlign='center';c.fillText(price===null?'精选陈列':'¥ '+price,135,57);if(price!==null){c.font='19px "Microsoft YaHei", sans-serif';c.fillText('基础参考',135,84);}});
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:.9});resources.materials.add(material);return material;
});
function priceTags(centerX:number,z:number,side:number,yaw:number,categories:number[]) {
  for(const [tier,level] of [.112,.406,.706,1.006,1.306].entries())for(const x of [-.29,-.097,.097,.29]) {
    priceMatrices[categories[tier]].push(new THREE.Matrix4().compose(new THREE.Vector3(centerX+side*.211,level-.018,z-side*x),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3(1,1,1)));
  }
}

// Fixed lighting belongs to the building rather than to the orbiting camera.
if(quality.id==='fine')RectAreaLightUniformsLib.init();
const bounce = new THREE.HemisphereLight('#edf0e4', '#9c9680', .65);scene.add(bounce);
const sun = new THREE.DirectionalLight('#fff1d5', 1.65);sun.position.set(-8, 8, 19);sun.target.position.set(4.5, .1, 6);sun.castShadow = true;
sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);sun.shadow.camera.left = -12;sun.shadow.camera.right = 12;sun.shadow.camera.top = 12;sun.shadow.camera.bottom = -12;sun.shadow.camera.near = .2;sun.shadow.camera.far = 50;
sun.shadow.normalBias = .025;sun.shadow.bias = -.00015;sun.shadow.intensity = .72;sun.shadow.radius = 3.5;scene.add(sun, sun.target);
const ceilingLights: THREE.RectAreaLight[] = [], coldLights: THREE.RectAreaLight[] = [];
const storefrontLight=new THREE.RectAreaLight('#ffe5b7',.6,6.6,.18);storefrontLight.position.set(4.1,2.78,12.63);storefrontLight.lookAt(4.1,0,14.2);scene.add(storefrontLight);
for (const x of [2.4, 5.4, 8.4]) for (const z of [3.4, 6.8, 10.1]) {
  const light = new THREE.RectAreaLight('#fff0d7', 3.3, 1.5, .55);light.position.set(x, 2.94, z);light.lookAt(x, 0, z);scene.add(light);ceilingLights.push(light);
}
const envPixels = new Uint8Array(32*16*4);
for (let y=0;y<16;y++) for(let x=0;x<32;x++){const i=(y*32+x)*4;envPixels[i]=210-y*4;envPixels[i+1]=221-y*5;envPixels[i+2]=218-y*5;envPixels[i+3]=255;}
const environment = new THREE.DataTexture(envPixels, 32, 16);environment.mapping = THREE.EquirectangularReflectionMapping;environment.colorSpace = THREE.SRGBColorSpace;environment.needsUpdate = true;scene.environment = environment;resources.textures.add(environment);

type Placement = { id: string; position: number[]; size: number[]; zone: ZoneId };
const placements: Placement[] = [];
function place(id: string, position: [number, number, number], inZone: ZoneId, yaw = 0, size?: [number, number, number]) {
  const template = templates.get(id)!;const group = new THREE.Group(), content = template.model.clone(true);
  group.add(content);group.position.set(...position);group.rotation.y = yaw;
  if (size) content.scale.set(size[0]/template.size.x, size[1]/template.size.y, size[2]/template.size.z);
  group.userData.zone = inZone;group.userData.asset = id;fixtures.add(group);pickables.push(group);
  group.updateMatrixWorld(true);const bounds = new THREE.Box3().setFromObject(group);
  placements.push({ id, position, size: bounds.getSize(new THREE.Vector3()).toArray(), zone: inZone });return group;
}
type ProductInstance = { id: string; matrix: THREE.Matrix4; zone: ZoneId };
const productInstances: ProductInstance[] = [];
const instanceBatches = new Map<string, { template: THREE.Mesh; matrices: THREE.Matrix4[]; zone: ZoneId }>();
function product(id: string, position: [number, number, number], inZone: ZoneId, yaw = 0, scale = 1) {
  const template = templates.get(id)!;
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw), new THREE.Vector3(scale,scale,scale));
  template.model.updateMatrixWorld(true);
  template.model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const key = `${id}:${object.uuid}:${inZone}`;
    let batch = instanceBatches.get(key);if(!batch){batch={template:object,matrices:[],zone:inZone};instanceBatches.set(key,batch);}
    batch.matrices.push(matrix.clone().multiply(object.matrixWorld));
  });
  productInstances.push({id,matrix,zone:inZone});
}
async function finishProducts() {
  for (const batch of instanceBatches.values()) {
    await checkpoint();
    const model = new THREE.InstancedMesh(batch.template.geometry, batch.template.material, batch.matrices.length);
    batch.matrices.forEach((matrix,index)=>model.setMatrixAt(index,matrix));model.instanceMatrix.needsUpdate = true;model.computeBoundingSphere();
    model.castShadow = true;model.receiveShadow = true;model.userData.zone = batch.zone;goods.add(model);pickables.push(model);
  }
  host.dataset.storeProducts = JSON.stringify({total:productInstances.length,batches:instanceBatches.size,byZone:productInstances.reduce<Record<string,number>>((counts,item)=>(counts[item.zone]=(counts[item.zone]??0)+1,counts),{})});
}
const surfaceRay = new THREE.Raycaster(), down = new THREE.Vector3(0,-1,0);
function surface(id: string, x: number, z: number, level: number) {
  const template = templates.get(id)!;template.model.updateMatrixWorld(true);surfaceRay.set(new THREE.Vector3(x,level+.10,z),down);
  const hit = surfaceRay.intersectObject(template.model,true).find(hit=>hit.point.y>level-.13&&hit.point.y<level+.08);
  return (hit?.point.y??level)+.0015;
}

function nativeProducts() {
  for(const [id,label,color] of [['salt','盐','#f4f7fb'],['sugar','糖','#f2e8d3']] as const) {
    const model=new THREE.Group();box(model,[0,.095,0],[.12,.19,.047],mat(color));
    // The seal sits above the carton instead of sharing its top and side faces.
    box(model,[0,.196,0],[.124,.012,.053],brandBlue);
    sign(model,.095,.11,[0,.09,.025],label,'KITCHEN','#f5f9fc','#0877cc');
    templates.set(id,{model,size:new THREE.Vector3(.124,.202,.053)});
  }
  for(const [id,label,color,height] of [['soy_sauce','酱油','#4b3020',.23],['chili_powder','辣椒','#ad4934',.16],['salad_dressing','沙拉酱','#e8d4a0',.20]] as const) {
    const model=new THREE.Group();mesh(new THREE.CylinderGeometry(.038,.042,height,16),mat(color,.48),model,[0,height/2,0]);
    mesh(new THREE.CylinderGeometry(.029,.031,.024,16),brandBlue,model,[0,height+.012,0]);
    sign(model,.071,.078,[0,height*.52,.043],label,'','#f7f9fa','#0877cc');
    templates.set(id,{model,size:new THREE.Vector3(.084,height+.024,.086)});
  }
  const salad=new THREE.Group();box(salad,[0,.012,0],[.20,.024,.145],white);
  for(let i=0;i<8;i++){const leaf=mesh(new THREE.SphereGeometry(.035,7,5),mat(i%2?'#658c4c':'#91ac67'),salad,[-.068+(i%4)*.045,.034,Math.floor(i/4)*.06-.03]);leaf.scale.y=.38;}
  for(const x of [-.045,.045]){const tomato=mesh(new THREE.SphereGeometry(.024,8,5),mat('#d36d45'),salad,[x,.047,.015]);tomato.scale.y=.5;}
  box(salad,[0,.058,0],[.202,.014,.147],glass,false);
  templates.set('salad',{model:salad,size:new THREE.Vector3(.202,.065,.147)});
}

const blindBoxBags=new THREE.Group();
function serviceFacilities() {
  const selfService=new THREE.Group();selfService.userData.zone='services';selfService.userData.stop='dining';fixtures.add(selfService);pickables.push(selfService);facilities.add('service',selfService);
  const {x,z,width,depth,height}=SERVICE_COUNTER;
  box(selfService,[x,height/2,z],[width-.04,height-.04,depth-.04],white);
  roundedBox(selfService,[x,height-.015,z],[width,.05,depth],wood,.009);
  box(selfService,[x+width/2-.012,.66,z],[.025,.20,depth-.035],brandBlue);
  box(selfService,[x+width/2-.01,.10,z],[.025,.08,depth-.035],dark);
  const microwave=place('microwave',[x,height+.012,4.62],'services',Math.PI/2,[.56,.36,.49]);microwave.userData.stop='dining';facilities.add('service',microwave);
  sign(selfService,.65,.19,[.889,.68,4.62],'微波加热','','#0877cc','#ffffff',Math.PI/2);

  const appliance=(atZ:number)=>{const group=new THREE.Group();group.position.set(x,height+.012,atZ);group.rotation.y=Math.PI/2;selfService.add(group);return group;};
  const hotWater=appliance(5.65);
  roundedBox(hotWater,[0,.30,0],[.40,.60,.35],white,.025);box(hotWater,[0,.30,.181],[.33,.37,.014],dark);
  for(const side of [-1,1]){box(hotWater,[side*.09,.30,.22],[.025,.04,.08],steel);box(hotWater,[side*.09,.40,.193],[.05,.03,.01],mat(side<0?'#ca5d4b':'#4b9ed0'));}
  box(hotWater,[0,.025,.11],[.35,.045,.36],steel);sign(hotWater,.28,.10,[0,.53,.183],'热水','','#f7fbff','#0877cc');
  const coffee=appliance(6.80);
  roundedBox(coffee,[0,.29,0],[.44,.58,.37],dark,.023);roundedBox(coffee,[0,.37,.19],[.39,.31,.025],white,.005);
  box(coffee,[0,.17,.19],[.30,.20,.025],dark);box(coffee,[0,.29,.23],[.09,.025,.08],steel);
  box(coffee,[0,.018,.10],[.46,.035,.50],steel);
  mesh(new THREE.CylinderGeometry(.115,.09,.14,40),mat('#6e5141',.4),coffee,[0,.66,0]);
  mesh(new THREE.CylinderGeometry(.123,.12,.022,40),dark,coffee,[0,.742,0]);
  sign(coffee,.26,.09,[0,.46,.207],'COFFEE','','#0877cc','#ffffff');
  box(coffee,[-.11,.36,.209],[.035,.035,.012],mat('#82c5eb'));box(coffee,[.11,.36,.209],[.035,.035,.012],mat('#d5a563'));
  mesh(new THREE.CylinderGeometry(.043,.031,.105,32),white,coffee,[0,.09,.20]);
  const napkins=box(selfService,[x,.98,5.08],[.28,.13,.28],mat('#d5dce0'));napkins.rotation.y=.05;
  for(let i=0;i<4;i++)box(selfService,[x,1.053+i*.003,5.08],[.22,.004,.18],white,false);
  sign(selfService,.90,.17,[.889,.69,6.64],'热水 / 纸杯 / 餐具','','#0877cc','#ffffff',Math.PI/2);
  sign(selfService,.60,.15,[x,1.10,7.30],'请保持整洁','','#f5f9fc','#0877cc');
  placements.push({id:'self-service',position:[x,0,z],size:[width,height,depth],zone:'services'});

  const steamCase=new THREE.Group();steamCase.position.set(COUNTER_X,1.01,3.1);steamCase.rotation.y=-Math.PI/2;steamCase.userData.zone='checkout';steamCase.userData.stop='dining';fixtures.add(steamCase);pickables.push(steamCase);facilities.add('service',steamCase);
  roundedBox(steamCase,[0,.045,0],[.65,.09,.52],steel);roundedBox(steamCase,[0,.65,0],[.66,.10,.54],white);
  for(const side of [-1,1]){box(steamCase,[side*.307,.36,0],[.025,.59,.51],steel);box(steamCase,[0,.36,side*.249],[.60,.55,.015],glass,false);}
  for(const y of [.14,.34,.54]){
    box(steamCase,[0,y,0],[.59,.018,.47],steel);
    for(const dx of [-.18,0,.18]){const bun=mesh(new THREE.SphereGeometry(.068,24,16),mat('#f2e4cd'),steamCase,[dx,y+.064,.05]);bun.scale.y=.72;}
  }
  sign(steamCase,.53,.08,[0,.65,.276],'热 食 / 保 温','','#0877cc','#ffffff');

  const oden=new THREE.Group();oden.position.set(COUNTER_X,1.01,6.68);oden.rotation.y=-Math.PI/2;oden.userData.zone='checkout';oden.userData.stop='dining';fixtures.add(oden);pickables.push(oden);facilities.add('service',oden);
  roundedBox(oden,[0,.09,0],[.66,.18,.50],steel,.02);
  const soup=mat('#b2945c',.35),skewer=mat('#c7aa75');
  for(const dx of [-.16,.16])for(const dz of [-.115,.115]){
    box(oden,[dx,.185,dz],[.285,.018,.19],soup);
    for(let j=0;j<2;j++){
      const food=mesh(new THREE.SphereGeometry(.042,24,12),mat(j%2?'#e9dbb7':'#b88951'),oden,[dx-.065+j*.12,.21,dz]);food.scale.y=.55;
      const stick=mesh(new THREE.CylinderGeometry(.003,.003,.22,5),skewer,oden,[dx-.065+j*.12,.28,dz-.01]);stick.rotation.x=-.3;
    }
  }
  sign(oden,.55,.12,[0,.085,.256],'鲜 食 服 务','','#0877cc','#ffffff');

  // The active POS position mirrors the existing scan / due / change game.
  for(const registerZ of [4,7.6]){
    box(fixtures,[COUNTER_X-.295,1.025,registerZ+.10],[.10,.025,.24],dark);
    box(fixtures,[COUNTER_X-.295,1.04,registerZ+.10],[.07,.008,.035],mat('#d76961'),false);
    box(fixtures,[COUNTER_X+.19,1.07,registerZ-.38],[.14,.13,.16],white);
    box(fixtures,[COUNTER_X+.19,1.14,registerZ-.35],[.10,.006,.16],white,false);
  }
  sign(building,1.65,.42,[10.37,1.85,8.65],'好好吃饭，好好生活','','#f7fbff','#0877cc',-Math.PI/2);
  place('delivery-crate',[10.08,.972,3.57],'checkout',0,[.34,.24,.48]);
  place('delivery-crate',[10.08,1.214,3.57],'checkout',0,[.34,.24,.48]);
  const extinguisher=place('fire-extinguisher',[FIRE_EXTINGUISHER.x,0,FIRE_EXTINGUISHER.z],'entrance',0,FIRE_EXTINGUISHER.size);
  extinguisher.userData.description='消防设备';
  sign(building,.28,.24,[10.37,.95,9.8],'消防','','#f9f8f4','#b74738',-Math.PI/2);
  box(building,[10.285,2.63,4.7],[.20,.31,1.35],white);
  for(let i=0;i<6;i++)box(building,[10.177,2.54+i*.017,4.7],[.015,.008,1.18],mat('#8798a4'),false);

  const blindBox=new THREE.Group();blindBox.position.set(COUNTER_X,1.01,8.23);blindBox.rotation.y=-Math.PI/2;blindBox.userData.zone='checkout';blindBox.userData.stop='blindbox';fixtures.add(blindBox);pickables.push(blindBox);facilities.add('blindbox',blindBox);
  box(blindBox,[0,.025,0],[.67,.05,.43],wood);blindBox.add(blindBoxBags);
  for(const dx of [-.21,0,.21]){
    box(blindBoxBags,[dx,.15,0],[.17,.25,.18],mat('#c5a47b'));box(blindBoxBags,[dx,.28,0],[.17,.025,.18],mat('#ac8c63'));
    sign(blindBoxBags,.12,.10,[dx,.16,.092],'朝夕','','#c5a47b','#145d99');
  }
  sign(blindBox,.68,.23,[0,.43,.11],'夜 间 盲 盒','22:00 — 06:00','#0877cc','#ffffff');
  sign(blindBox,.64,.12,[0,.08,.222],'白天预告 / 夜间供应','','#f5f9fc','#0877cc');
  const recruitment=new THREE.Group();recruitment.userData.zone='entrance';recruitment.userData.stop='work';facade.add(recruitment);pickables.push(recruitment);facilities.add('notice',recruitment);
  sign(recruitment,.66,.87,[7.43,1.75,STORE.depth+.04],'店 员 招 聘','有意者请联系','#f7fbff','#0877cc');
  sign(facade,.67,.45,[.40,2.42,12.49],'24H','CITY STORE','#0877cc','#ffffff',0,true);
}

async function makeShop() {
  await checkpoint(true);nativeProducts();
  const drinks = ['tea','tea-light','water','juice','soda','can','can-light'];
  for (const [unit,x] of COLD_CASES.entries()) {
    await checkpoint();
    const cabinet=place('coldcase',[x,0,.52],'cold');cabinet.userData.stop=unit<2?'meal':'drink';
    const coldUnit=new THREE.Group();fixtures.add(coldUnit);coldUnit.add(cabinet);facilities.add(unit<2?'fresh':'drinks',coldUnit);
    for(const side of [-1,1]){const door=place('cold-door',[x+side*.335,.19,.855],'cold');door.userData.stop=unit<2?'meal':'drink';coldUnit.add(door);}
    for(let tier=0;tier<5;tier++) for(const half of [-1,1]) {
      await checkpoint();
      const shelfY=.20+tier*.335;coldUnit.add(place('cold-shelf',[x+half*.328,shelfY,.51],'cold'));
      for(let col=0;col<(unit<2?3:5);col++) for(let depth=0;depth<(unit<2?1:2);depth++) {
        const id=unit<2?['bento','sandwich','salad'][(tier+col)%3]:drinks[(unit+tier+(col>2?1:0))%drinks.length],localX=unit<2?-.20+col*.20:-.24+col*.12,localZ=depth===0?.11:-.08;
        const y=surface('cold-shelf',localX,localZ,.015);
        const size=templates.get(id)!.size,scale=unit<2?Math.min(.18/size.x,.245/size.y,.25/size.z):tier===4?.92:1;
        product(id,[x+half*.328+localX,shelfY+y,.51+localZ],'cold',0,scale);
      }
    }
    const light=new THREE.RectAreaLight('#dceef0',1.7,1.15,1.5);light.position.set(x,1.1,.32);light.lookAt(x,1.1,1.4);scene.add(light);coldLights.push(light);
    const glowMat=new THREE.MeshStandardMaterial({color:'#e9f6ff',emissive:'#e9f6ff',emissiveIntensity:.8});resources.materials.add(glowMat);
    box(building,[x,1.93,.79],[1.22,.035,.02],glowMat,false);
    sign(building,1.18,.16,[x,2.11,.81],unit<2?'盒饭 / 三明治 / 沙拉':unit===4?'能量饮料 / 饮品':'冷 藏 饮 品','','#f7fbff','#0877cc');
  }
  const shelfLevels=[.112,.406,.706,1.006,1.306];
  // Existing library models add packaging variety, grouped by shelf and tier.
  // These display props do not create new entries in the game's purchase list.
  const shelfStock=[
    [
      ['noodles','noodles-variant-a','chips','chips-orange','chips-green'],
      ['noodles-variant-b','noodles','chocolate','candy','candy'],
      ['noodles-variant-a','noodles-variant-b','noodles','noodles-variant-a','cereal'],
      ['chips-green','chips-orange','chips','chocolate','candy'],
      ['noodles','noodles-variant-b','noodles-variant-a','cereal-blue','cereal'],
      ['cereal','cereal-blue','chocolate','candy','chips-orange'],
    ],
    [
      ['salt','sugar','salt','sugar','salt'],
      ['soy_sauce','chili_powder','salad_dressing','soy_sauce','chili_powder'],
      ['tissue','tissue','shampoo','shampoo','detergent'],
      ['soy_sauce','salad_dressing','chili_powder','salad_dressing','soy_sauce'],
      ['salt','sugar','salt','sugar','salad_dressing'],
      ['detergent','detergent','tissue','shampoo','tissue'],
    ],
  ];
  const priceCategory=(id:string)=>id.startsWith('noodles')?0:id==='salt'||id==='sugar'?1:id==='soy_sauce'||id==='chili_powder'?2:id==='salad_dressing'?3:4;
  for(const [row,x]of SHELF_ROWS.entries()) for(const [bay,z]of SHELF_BAYS.entries()) for(const side of [-1,1]) {
    await checkpoint();
    const yaw=side*Math.PI/2,centerX=x+side*.204;
    const shelf=place('shelf',[centerX,0,z],'shelves',yaw);shelf.userData.stop='pantry';facilities.add(row===0?'noodles':'seasoning',shelf);
    priceTags(centerX,z,side,yaw,shelfStock[row][bay].map(priceCategory));
    for(const [tier,level] of shelfLevels.entries()) for(let column=0;column<4;column++) for(let depth=0;depth<2;depth++) {
      if(depth===1&&(bay+tier+column)%4===0)continue;
      const id=shelfStock[row][bay][tier];
      const localX=-.29+column*.193,localZ=depth===0?.105:-.07,y=surface('shelf',localX,localZ,level);
      const size=templates.get(id)!.size;const scale=Math.min(.18/size.x,.258/size.y,.14/size.z,1.35);
      product(id,[centerX+side*localZ,y,z-side*localX],'shelves',yaw,scale);
    }
  }
  await checkpoint(true);
  // Six original one-metre counter modules form a single staffed work line.
  for(const z of COUNTERS) facilities.add('checkout',place('counter',[COUNTER_X,0,z],'checkout',-Math.PI/2,[1,1,.70]));
  box(building,[COUNTER_X-.356,.72,5.65],[.018,.19,6],brandBlue,false);
  sign(building,1.25,.14,[COUNTER_X-.368,.72,5.17],'朝 夕 便 利','','#0877cc','#ffffff',-Math.PI/2);
  // This source model's keyboard and operator screen face local +X.
  // With no yaw they face the staff aisle; its customer screen faces -X.
  for(const z of [4.0,7.6]){const register=place('register',[COUNTER_X+.01,1.003,z],'checkout',0);register.userData.stop='work';facilities.add('checkout',register);}
  const caseModel=place('foodcase',[COUNTER_X+.01,1.005,5.65],'checkout',-Math.PI/2);
  for(let tier=0;tier<3;tier++) for(let i=0;i<3;i++) {
    const id=i===0?'sandwich':i===1?'salad':'bento',localX=-.16+i*.15;
    const top=surface('foodcase',localX,.07,[.025,.22,.47][tier]);
    product(id,[COUNTER_X-.06,1.005+top,5.65+localX],'checkout',-Math.PI/2,.57);
  }
  caseModel.userData.description='即食食品展示架';facilities.add('fresh',caseModel);
  for(let i=0;i<4;i++) {
    box(building,[10.1,.45,3.55+i*1.1],[.48,.9,1.05],brandBlue);
    box(building,[10.08,.93,3.55+i*1.1],[.52,.07,1.08],wood);
  }
  // Staff door is a flush panel in the same continuous right wall.
  box(building,[10.385,1.04,1.72],[.035,2.08,.82],mat('#b4ccdc'));
  sign(building,.65,.27,[10.36,1.54,1.72],'员工区','STAFF ONLY','#edf4f8','#17659e',-Math.PI/2);
  for(const [tableIndex,x] of TABLES.entries()) {
    await checkpoint();
    const table=place('table',[x,0,9.45],'seating');table.userData.stop='meal';facilities.add('seating',table);
    for(const z of [8.68,10.22])facilities.add('seating',place('chair',[x,0,z],'seating'));
    if(tableIndex===1)paperCup(x-.16,.779,9.39);
  }
  for(const x of [.42,.78]) place('trash',[x,0,11.53],'entrance');
  basketStack();await checkpoint();breakfastCorners();await checkpoint();serviceFacilities();await checkpoint(true);await finishProducts();
  const priceGeometry=new THREE.PlaneGeometry(.115,.043);resources.geometries.add(priceGeometry);
  priceMatrices.forEach((matrices,index)=>{const tags=new THREE.InstancedMesh(priceGeometry,priceMaterials[index],matrices.length);matrices.forEach((matrix,i)=>tags.setMatrixAt(i,matrix));tags.instanceMatrix.needsUpdate=true;goods.add(tags);});
  fixtures.updateMatrixWorld(true);goods.updateMatrixWorld(true);
  host.dataset.storePlacements=JSON.stringify(placements);
  host.dataset.storeLayout=JSON.stringify({width:STORE.width,depth:STORE.depth,coldCases:COLD_CASES.length,shelfRows:SHELF_ROWS.length,shelfBays:SHELF_BAYS.length,doubleSided:true,tables:TABLES.length,chairs:TABLES.length*2,counterModules:COUNTERS.length,doorWidth:STORE.entrance[2]});
  host.dataset.storeFacilities=JSON.stringify(['fresh-meals','drinks','pantry','microwave','hot-water','coffee-display','steam-cabinet-display','oden-display','scan-pad','receipt-printer','night-blind-box','community-slogan','recruitment','air-conditioner','fire-extinguisher','delivery-crates']);
  host.dataset.storeGameplay=JSON.stringify({mode:interactive?'game-scene':'guide-only',opens24Hours:true,stops:GAMEPLAY_STOPS,dispatchesGameActions:interactive});
}
function paperCup(x:number,y:number,z:number) {
  const group=new THREE.Group();fixtures.add(group);group.userData.zone='seating';
  mesh(new THREE.CylinderGeometry(.048,.036,.12,20),white,group,[x,y+.06,z]);
  mesh(new THREE.CylinderGeometry(.044,.041,.048,20),brandBlue,group,[x,y+.058,z]);
  mesh(new THREE.CylinderGeometry(.051,.049,.014,20),dark,group,[x,y+.127,z]);
}
function basketStack() {
  const group=new THREE.Group();group.position.set(6.95,0,11.2);group.userData.zone='entrance';fixtures.add(group);pickables.push(group);facilities.add('baskets',group);
  box(group,[0,.05,0],[.61,.10,.56],steel);
  for(let i=0;i<4;i++) {
    const basket=place('shopper-basket',[6.95,.11+i*.072,11.2],'entrance',Math.PI/2,[.46,.16,.48]);
    basket.userData.skipContactAO=true;facilities.add('baskets',basket);
  }
  sign(group,.65,.20,[0,.72,.26],'购物篮','SHOPPING BASKET','#f4f8fb','#17659e');
}

function updateLighting() {
  const atmosphere=exterior.setWeather(weather,night);
  bounce.intensity=(night?.28:.70)*atmosphere.ambient;sun.intensity=(night?.12:1.65)*atmosphere.sun;sun.color.set(atmosphere.key);
  sun.shadow.intensity=night?.45:.72*Math.max(.35,atmosphere.sun);scene.environmentIntensity=(night?.09:.18)*atmosphere.ambient;
  ceilingLights.forEach(light=>{light.intensity=night?5.5:3.3;light.color.set(night?'#ffe5b7':'#fff0dc');});
  coldLights.forEach(light=>light.intensity=night?2.1:1.7);
  posterMaterials.forEach(material=>material.emissiveIntensity=night?.35:.035);
  glowingSigns.forEach(material=>material.emissiveIntensity=night?.85:.15);
  storefrontLight.intensity=night?7:.6;
  (entryMat.material as THREE.MeshStandardMaterial).color.set(night?'#244d70':'#347ca9');
  blindBoxBags.visible=night;
  updateCopy();
  host.dataset.storeLighting=JSON.stringify({night,weather,bounce:bounce.intensity,key:sun.intensity,ceiling:ceilingLights[0].intensity,environment:scene.environmentIntensity,contactShadows:true});
  renderer.shadowMap.needsUpdate=true;request();
}
function updateCopy(){options.onView?.({zone,plan:planView,night,stop:activeStop});host.dataset.storeStop=activeStop??'';}
function selectObject(object?:THREE.Object3D){
  const record=object?facilities.resolve(object):undefined;selected=record?.object;
  selection=record?{id:record.id,...STORE_FACILITIES[record.id],x:50,y:50,visible:true}:null;
  outline.select(record?.outline??[]);host.dataset.storeSelection=JSON.stringify(selection);options.onSelect?.(selection);request();
}
function projectSelection(){
  if(!selected||!selection)return;
  if(!visibleInScene(selected,scene)){selectObject();return;}
  const point=facilities.anchor(selected).project(camera);
  selection={...selection,x:(point.x+1)*50,y:(1-point.y)*50,visible:Math.abs(point.x)<=1&&Math.abs(point.y)<=1&&Math.abs(point.z)<=1};
  host.dataset.storeSelection=JSON.stringify({...selection,outline:'white',outlineObjects:facilities.resolve(selected)?.outline.length??0});options.onProject?.(selection);
}
const projectLabels=options.onLabels?createFacilityLabelProjection(STORE_FACILITIES,id=>facilities.find(id,object=>visibleInScene(object,scene)),object=>facilities.anchor(object),options.onLabels):()=>{};
function focus(next:ZoneId, immediate=false) {
  exteriorView=false;
  zone=next;activeStop=undefined;if(interactive)selectObject();else{selected=undefined;outline.select([]);}updateCopy();
  const details=ZONES[zone];let target=new THREE.Vector3(...(planView?ZONES.all.target:details.target));
  // Stay above OrbitControls' polar limit, keeping the plan north-up and idle.
  let eye=planView?new THREE.Vector3(5.2,32,6.30):new THREE.Vector3(...details.eye);
  controls.minZoom=interactive?venueMinimumZoom(host.clientWidth,host.clientHeight,planView):.25;
  const entry=interactive&&!planView&&zone==='all';layoutScale=viewScale();const zoom=(planView?1:details.zoom)*layoutScale;
  if(entry&&ready)({eye,target}=centeredVenuePose(camera,eye,target,zoom,[building,fixtures,goods],shadowOnly));
  move={eye,target,zoom};controls.enableRotate=!planView;
  if(immediate){camera.position.copy(eye);controls.target.copy(target);camera.zoom=zoom;camera.updateProjectionMatrix();controls.update();move=undefined;}
  host.dataset.storeZone=zone;host.dataset.storeView=planView?'plan':'perspective';request();
}

function weatherFrame(){if(disposed)return;if(sceneRenderIsCovered(host)){request();return;}renderer.info.reset();if(outline.renderWeather(performance.now())){host.dataset.storeWeatherFrames=String(Number(host.dataset.storeWeatherFrames??0)+1);host.dataset.weatherRenderStats=JSON.stringify({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,cached:true});exterior.scheduleWeatherFrame(weatherFrame);}else request();}
function resize(){
  // Hidden portrait/outgoing scenes must retain the last valid projection and zoom.
  if(host.clientWidth<2||host.clientHeight<2)return;

  const width=host.clientWidth,height=host.clientHeight,aspect=width/height,extent=16.5;
  const nextScale=viewScale();
  controls.minZoom=exteriorView?mobileScale()*exteriorMinRatio:interactive?venueMinimumZoom(width,height,planView):.25;
  if(ready){camera.zoom=THREE.MathUtils.clamp(camera.zoom*nextScale/layoutScale,controls.minZoom,5);if(move)move.zoom=THREE.MathUtils.clamp(move.zoom*nextScale/layoutScale,controls.minZoom,5);}
  layoutScale=nextScale;
  renderer.setPixelRatio(scenePixelRatio(quality,width,height,renderScale,resolution,displayPixelScale(host),renderer.capabilities.maxTextureSize));renderer.setSize(width,height);camera.left=-extent*aspect/2;camera.right=extent*aspect/2;camera.top=extent/2;camera.bottom=-extent/2;camera.updateProjectionMatrix();outline.resize(width,height);
  host.dataset.storeQuality=JSON.stringify({...quality,renderScale,resolution,pixelRatio:renderer.getPixelRatio(),samples:Math.min(quality.samples,renderer.capabilities.maxSamples),antialias:quality.id==='fine'?'MSAA + SMAA':'FXAA',buffer:[renderer.domElement.width,renderer.domElement.height]});
  if(!ready)focus(zone,true);request();
}
const wallMaterials=walls.map(wall=>{const entries:{material:THREE.Material;opacity:number;transparent:boolean;depthWrite:boolean}[]=[];
  if(interactive)for(const root of wall.side==='front'?[wall.visible,frontHeader]:[wall.visible])root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const clone=(source:THREE.Material)=>{const material=source.clone();resources.materials.add(material);if(glowingSigns.includes(source as THREE.MeshStandardMaterial))glowingSigns.push(material as THREE.MeshStandardMaterial);entries.push({material,opacity:source.opacity,transparent:source.transparent,depthWrite:source.depthWrite});return material;};object.material=Array.isArray(object.material)?object.material.map(clone):clone(object.material);});
  return {wall,entries,opacity:1,transition:createWallTransition()};
});
let wallTransitionsInitialized=false;
function updateWalls(dt:number){
  const eye=camera.position;let moving=false;
  for(const state of wallMaterials){const wall=state.wall;
    if(interactive){const dx=eye.x-controls.target.x,dz=eye.z-controls.target.z,length=Math.max(.001,Math.hypot(dx,dz));
      const facing=(wall.side==='left'?-dx:wall.side==='right'?dx:wall.side==='front'?dz:-dz)/length;
      const goal=planView?.065:THREE.MathUtils.lerp(1,.065,THREE.MathUtils.smoothstep(facing,.02,.26));state.opacity=state.transition.step(goal,dt,!wallTransitionsInitialized||dt>=1||(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches));
      moving ||= state.transition.moving;
      for(const entry of state.entries){const transparent=entry.transparent||state.opacity<.999;if(entry.material.transparent!==transparent){entry.material.transparent=transparent;entry.material.needsUpdate=true;}entry.material.opacity=entry.opacity*state.opacity;entry.material.depthWrite=entry.depthWrite&&state.opacity>=.999;}
    }else{const near=planView||wall.side==='left'&&eye.x<.2||wall.side==='right'&&eye.x>STORE.width-.2||wall.side==='front'&&eye.z>STORE.depth-.2||wall.side==='back'&&eye.z<.2;const height=near?.16:wall.height;wall.solid.scale.y=height/wall.height;wall.solid.position.y=height/2;wall.cap.position.y=height+.018;}
  }
  wallTransitionsInitialized=true;exterior.syncWalls(Object.fromEntries(wallMaterials.map(s=>[s.wall.side,s.opacity])));host.dataset.storeExteriorView=String(exteriorView);
  frontHeader.visible=!planView&&(exteriorView||zone==='entrance');facade.visible=!planView;doorRoot.visible=!planView;
  host.dataset.storeWalls=JSON.stringify({mode:interactive?'whole-wall-fade':'preview-low-wall',sides:wallMaterials.map(s=>({side:s.wall.side,opacity:s.opacity,height:s.wall.height}))});return moving;
}
function request() { if(!disposed&&!frame)frame=requestAnimationFrame(now=>{try{render(now);}catch(error){readiness.fail(error);console.error('Store scene render failed',error);}}); }
let presentationReady=false;
function render(now:number) {
  if(sceneRenderIsCovered(host)){frame=0;request();return;}
  if(!presentationReady){frame=0;return;}
  frame=0;if(disposed)return;
  const dt=Math.min(.06,Math.max(.001,(now-(lastTime||now-16))/1000));lastTime=now;
  let moving=false;
  if(move) {
    const amount=1-Math.exp(-dt*9);camera.position.lerp(move.eye,amount);controls.target.lerp(move.target,amount);camera.zoom=THREE.MathUtils.lerp(camera.zoom,move.zoom,amount);camera.updateProjectionMatrix();
    if(camera.position.distanceTo(move.eye)<.005&&controls.target.distanceTo(move.target)<.005&&Math.abs(camera.zoom-move.zoom)<.002){camera.position.copy(move.eye);controls.target.copy(move.target);camera.zoom=move.zoom;camera.updateProjectionMatrix();move=undefined;}else moving=true;
    controls.update();
  }
  const desired=doorOpen?1:0;if(Math.abs(desired-doorAmount)>.001){doorAmount=THREE.MathUtils.damp(doorAmount,desired,8,dt);moving=true;}else{if(doorAmount!==desired)renderer.shadowMap.needsUpdate=true;doorAmount=desired;}
  doorLeft.position.x=3.9-doorAmount*1.2;doorRight.position.x=5.2+doorAmount*1.2;
  if(interactive){const offset=camera.position.clone().sub(controls.target),center=new THREE.Vector3(STORE.width/2,STORE.height/2,STORE.depth/2);camera.position.copy(controls.target).add(offset.setLength(Math.max(offset.length(),controls.target.distanceTo(center)+11)));}
  if(interactive&&!move&&!rightDrag)constrainVenuePan(camera,controls.target,new THREE.Box3(new THREE.Vector3(-.3,0,-.3),new THREE.Vector3(STORE.width+(exteriorView?2:.3),STORE.height,STORE.depth+(exteriorView?5.1:1.5))));
  moving=updateWalls(dt)||moving;moving=exterior.updateEnvironment(camera,controls.target,now)||moving;camera.updateMatrixWorld();projectSelection();if(ready)projectLabels(camera);renderer.info.reset();outline.render();
  host.dataset.storeReady=String(readiness.rendered(host.clientWidth,host.clientHeight));host.dataset.storeCamera=JSON.stringify({eye:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom,plan:planView});
  host.dataset.storeDoor=JSON.stringify({open:doorOpen,amount:doorAmount});
  host.dataset.storeRenderStats=JSON.stringify({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries});
  host.dataset.storeFrames=String(Number(host.dataset.storeFrames??0)+1);host.dataset.storeSettled=String(!moving);if(moving)request();else{lastTime=0;exterior.scheduleWeatherFrame(weatherFrame);}
}
controls.addEventListener('change',request);controls.addEventListener('start',()=>{move=undefined;});
function setQuality(mode:QualityMode){const next=sceneQuality(mode);if(JSON.stringify(next)===JSON.stringify(quality))return;quality=next;exterior.setDetail(quality.id,Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy()));outline.dispose();outline=createScenePipeline(renderer,scene,camera,shadowOnly,quality);outline.setWeatherLayer(exterior.weatherLayer);outline.setContactObjects(()=>[fixtures,goods]);if(selected)outline.select(interactive?(facilities.resolve(selected)?.outline??[]):[selected]);resources.textures.forEach(texture=>{texture.anisotropy=Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;});sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(quality.shadowSize,quality.shadowSize);renderer.shadowMap.needsUpdate=true;resize();request();}
function rotate(angle:number){if(planView){planView=false;focus('all',true);}const offset=camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),angle);move={eye:controls.target.clone().add(offset),target:controls.target.clone(),zoom:camera.zoom};request();}
function zoom(factor:number){move=undefined;camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,controls.minZoom,5);camera.updateProjectionMatrix();request();}
function toggleDoor(){doorOpen=!doorOpen;request();}
const removeLabelGestures=bridgeSceneLabelGestures(host.parentElement??host,renderer.domElement);
events.signal.addEventListener('abort',removeLabelGestures,{once:true});
const pointerStart=new THREE.Vector2(),ray=new THREE.Raycaster(),activePointers=new Set<number>();let multiPointer=false,rightDrag=false;
function facilityHit(x:number,y:number){const bounds=renderer.domElement.getBoundingClientRect();camera.updateMatrixWorld();ray.setFromCamera(new THREE.Vector2((x-bounds.left)/bounds.width*2-1,-(y-bounds.top)/bounds.height*2+1),camera);return ray.intersectObjects(facilities.roots(),true).find(hit=>!!facilities.resolve(hit.object)&&visibleInScene(hit.object,scene));}
renderer.domElement.addEventListener('pointerdown',event=>{rightDrag=event.button===2;activePointers.add(event.pointerId);if(activePointers.size>1)multiPointer=true;pointerStart.set(event.clientX,event.clientY);},{signal:events.signal});
renderer.domElement.addEventListener('wheel',()=>{rightDrag=false;},{signal:events.signal});
renderer.domElement.addEventListener('pointercancel',event=>{activePointers.delete(event.pointerId);if(!activePointers.size)multiPointer=false;},{signal:events.signal});
renderer.domElement.addEventListener('pointermove',event=>{if(interactive&&!event.buttons&&ready)renderer.domElement.style.cursor=facilityHit(event.clientX,event.clientY)?'pointer':'grab';},{signal:events.signal});
renderer.domElement.addEventListener('pointerup',event=>{
  const multi=multiPointer;activePointers.delete(event.pointerId);if(!activePointers.size)multiPointer=false;
  if(event.button!==0||multi||pointerStart.distanceTo(new THREE.Vector2(event.clientX,event.clientY))>5||!ready)return;
  if(interactive){selectObject(facilityHit(event.clientX,event.clientY)?.object);return;}
  const bounds=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1),camera);
  const hit=ray.intersectObjects(pickables,true)[0];if(!hit)return;let object:THREE.Object3D|undefined=hit.object;while(object&&!object.userData.zone)object=object.parent??undefined;if(!object)return;if(object===doorRoot){toggleDoor();return;}zone=object.userData.zone as ZoneId;activeStop=object.userData.stop as StopId|undefined;host.dataset.storeZone=zone;updateCopy();selected=object;outline.select([selected]);request();
},{signal:events.signal});
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);window.addEventListener('resize',resize);resize();updateLighting();focus('all',true);

async function load() {
  const loader=new GLTFLoader(),entries=Object.entries(quality.id==='light'?mobileUrls:urls);let loaded=0;
  const posterReady=new THREE.TextureLoader().loadAsync(new URL('../assets/scenes/convenience-store/breakfast-poster.png',import.meta.url).href).then(texture=>{if(disposed){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy());resources.textures.add(texture);posterTexture=texture;});
  const results=await Promise.allSettled(entries.map(async([path,url])=>{
    const id=path.split('/').pop()!.replace('.glb','');const gltf=await loadSceneModel(()=>loader.loadAsync(url),()=>disposed);
    if(disposed){releaseLateModel(gltf.scene);return;}try{await checkpoint();}catch(error){releaseLateModel(gltf.scene);throw error;}
    gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;resources.geometries.add(object.geometry);for(const material of (Array.isArray(object.material)?object.material:[object.material])as THREE.MeshStandardMaterial[]){resources.materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture){value.anisotropy=Math.min(quality.anisotropy,renderer.capabilities.getMaxAnisotropy());resources.textures.add(value);}if(id==='counter'&&material.name.includes('Base')){material.map=null;material.color.set('#f2f5f7');material.roughness=.72;}if(id==='counter'&&material.name.includes('Top')){material.map=null;material.color.set('#d8c6aa');material.roughness=.7;}if(material.transparent){material.opacity=id.startsWith('cold')||id==='foodcase'?.065:.16;material.color.set('#d1e2eb');material.depthWrite=false;material.roughness=.12;}}}});
    gltf.scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3());
    templates.set(id,{model:gltf.scene,size});loaded++;if(!disposed)options.onProgress?.(loaded,entries.length);
  }).concat(posterReady));
  if(disposed){releaseResources();return;}
  const errors=results.flatMap((result,index)=>result.status==='rejected'?[{path:entries[index]?.[0]??'breakfast-poster.png',error:String(result.reason)}]:[]);
  if(errors.length){host.dataset.storeErrors=JSON.stringify(errors);throw Error('部分便利店模型未载入');}
  await makeShop();await checkpoint(true);updateLighting();host.dataset.storeBatched=String(await batchSceneFixturesAsync(fixtures,new Set(pickables),g=>resources.geometries.add(g),checkpoint));ready=true;if(interactive&&zone==='all'&&!planView)focus('all',true);host.dataset.storeAssets=String(loaded);host.dataset.storeArt='GPT-6 Luna / max · breakfast-poster.png';host.dataset.storeErrors='[]';renderer.shadowMap.needsUpdate=true;request();
}
void Promise.all([load(),exterior.ready]).then(async()=>{await checkpoint(true);if(disposed)return;updateWalls(1);exterior.updateEnvironment(camera,controls.target,performance.now());await outline.warmup();if(!disposed){presentationReady=true;readiness.assetsReady();request();}}).catch(error=>{if(!disposed){host.dataset.storeErrors=String(error);readiness.fail(error);}});
const readyPromise=readiness.promise;
function releaseLateModel(root:THREE.Object3D){
  const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>(),ts=new Set<THREE.Texture>();
  root.traverse(object=>{if(object instanceof THREE.Mesh){gs.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material]){ms.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)ts.add(value);}}});
  gs.forEach(item=>item.dispose());ms.forEach(item=>item.dispose());ts.forEach(item=>item.dispose());
}
function releaseResources(){resources.geometries.forEach(geometry=>geometry.dispose());resources.materials.forEach(material=>material.dispose());resources.textures.forEach(texture=>texture.dispose());resources.geometries.clear();resources.materials.clear();resources.textures.clear();}
function dispose(){if(disposed)return;disposed=true;readiness.cancel();host.removeEventListener('scene-weather-resume',request);events.abort();cancelAnimationFrame(frame);resizeObserver.disconnect();window.removeEventListener('resize',resize);controls.dispose();outline.dispose();exterior.dispose();releaseResources();goods.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
const captureStill=createVenueStillBake({renderer,scene,camera,target:controls.target,prepare(state){
  cancelAnimationFrame(frame);frame=0;move=undefined;selected=undefined;selection=null;outline.select([]);planView=false;zone='all';exteriorView=false;
  night=state.night;weather=state.weather??'sunny';updateLighting();outline.setWeatherLayer(undefined);doorOpen=state.doorOpen;doorAmount=doorOpen?1:0;doorLeft.position.x=3.9-doorAmount*1.2;doorRight.position.x=5.2+doorAmount*1.2;
  updateWalls(10);exterior.updateEnvironment(camera,controls.target,0);renderer.shadowMap.needsUpdate=true;cancelAnimationFrame(frame);frame=0;
},render(){outline.resize(renderer.domElement.width,renderer.domElement.height);outline.render();},facilities:()=>Object.keys(STORE_FACILITIES).flatMap(id=>{const record=facilities.find(id as StoreFacilityId,object=>visibleInScene(object,scene));return record?[{id,point:facilities.anchor(record.object)}]:[];}),layer:()=>undefined});
return {ready:readyPromise,captureStill,
 update(state:{night:boolean;weather?:WeatherId}){if(disposed)return;if(night!==state.night||weather!==(state.weather??weather)){night=state.night;weather=state.weather??weather;updateLighting();}},
 focus(next:ZoneId){planView=false;focus(next);},
 overview(){planView=!planView;focus('all');},reset(){planView=false;focus('all');},
 exterior(){selectObject();planView=false;zone='all';exteriorView=true;layoutScale=viewScale();const target=new THREE.Vector3(STORE.width/2,1,STORE.depth/2+1.4);move=centeredVenuePose(camera,new THREE.Vector3(18,16,30),target,mobileScale()*.86,[building,fixtures,goods,exterior.root],shadowOnly,true);exteriorMinRatio=move.zoom/mobileScale()*.95;controls.minZoom=mobileScale()*exteriorMinRatio;updateCopy();request();},
 guide(id:StopId){const stop=GAMEPLAY_STOPS.find(s=>s.id===id);if(!stop)return;planView=false;focus(stop.zone);activeStop=id;if(id==='blindbox'){night=true;updateLighting();}updateCopy();},
 selectFacility(id:StoreFacilityId|null,focusView=false){if(disposed)return false;if(!id){selectObject();return true;}const record=facilities.find(id,object=>visibleInScene(object,scene));if(!record)return false;if(focusView){planView=false;focus(STORE_FACILITIES[id].zone);}selectObject(record.object);return true;},
 setDragMode(mode:'pan'|'rotate'){controls.mouseButtons.LEFT=THREE.MOUSE.PAN;controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;controls.touches.ONE=mode==='pan'?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;host.dataset.storeDragMode=mode;},rotate,zoom,toggleDoor,setQuality,setResolution(scale:number,mode:RenderResolution='auto'){const next=clampRenderScale(scale);if(next===renderScale&&mode===resolution)return;renderScale=next;resolution=mode;resize();},dispose};
}
