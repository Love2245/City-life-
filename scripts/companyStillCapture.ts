/** Offline render source only. The game never imports this script. */
import * as THREE from 'three';
import {photographInteractions,ancestorInteraction} from './still-interaction-map';
import {photographDepth,clearPhotographDepth} from './home-still-depth';
import {buildCompanyOffice} from '../src/lib/companyOffice3D';
import {COMPANY_OFFICES} from '../src/game/core/companyOffice';
import {createOfficeFurniture} from '../src/lib/companyOfficeFurniture';
import {addHomeComputer,type HomeComputerMaterials} from '../src/lib/homeComputerModel';
import {officeWorkerAppearance} from '../src/lib/companyWorkerAppearance';
import {officeLightScheme} from '../src/lib/officeLighting';

const width=4096,height=2560,ppm=256;
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.replaceChildren(renderer.domElement);document.body.style.margin='0';
const scene=new THREE.Scene(),sky=new THREE.HemisphereLight('#e6eee9','#a19b83',2.2),sun=new THREE.DirectionalLight('#fff0d1',3.1);
const interiorFill=new THREE.DirectionalLight('#ffd2a0',0);interiorFill.castShadow=false;scene.add(interiorFill,interiorFill.target);
sun.position.set(-4,12,-4);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.normalBias=.04;sun.shadow.bias=-.00015;sun.shadow.camera.far=100;scene.add(sky,sun,sun.target);
let interactionCamera:THREE.Camera;
let current:ReturnType<typeof buildCompanyOffice>|undefined,currentStage=0;
function direction(angle:number){return new THREE.Vector3(.48,1.1,1.1).normalize().applyAxisAngle(new THREE.Vector3(0,1,0),angle);}
function project(point:THREE.Vector3,camera:THREE.Camera){const p=point.clone().project(camera);return{x:(p.x+1)*width/2,y:(1-p.y)*height/2,depth:p.z};}
function render(camera:THREE.Camera){scene.updateMatrixWorld(true);renderer.render(scene,camera);}
export async function officeBase(stage:number,angle:number,night=false){
  if(currentStage!==stage){if(current){scene.remove(current.root);current.dispose();}current=buildCompanyOffice(COMPANY_OFFICES[stage-1]!);scene.add(current.root);currentStage=stage;await current.prepare(async()=>{});}
  const model=current!,plan=COMPANY_OFFICES[stage-1]!,dir=direction(angle*Math.PI/2),span=Math.max(...plan.size);
  for(const wall of model.walls)wall.group.scale.y=wall.normal.dot(dir)<0?.65/2.8:1;
  const bounds=model.framingBounds.clone(),center=bounds.getCenter(new THREE.Vector3());
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,200);camera.position.copy(center).addScaledVector(dir,span*3);camera.lookAt(center);camera.updateMatrixWorld(true);
  const cameraBounds=new THREE.Box3();for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])cameraBounds.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  const size=cameraBounds.getSize(new THREE.Vector3()),mid=cameraBounds.getCenter(new THREE.Vector3()),halfHeight=Math.max(size.y,size.x/(width/height))*.55;
  camera.left=mid.x-halfHeight*width/height;camera.right=mid.x+halfHeight*width/height;camera.top=mid.y+halfHeight;camera.bottom=mid.y-halfHeight;camera.updateProjectionMatrix();
  const light=officeLightScheme(night?21:12,9,'sunny');model.setLighting(light);
  interiorFill.color.set(light.lampColor);interiorFill.intensity=light.fillIntensity;interiorFill.position.copy(center).add(new THREE.Vector3(0,7,1));interiorFill.target.position.copy(center);
  renderer.setSize(width,height);renderer.setClearColor(light.background,1);sun.intensity=light.sunIntensity;sky.intensity=light.ambientIntensity;sun.color.set(light.sunColor);sky.color.set(light.skyColor);
  sun.shadow.camera.left=sun.shadow.camera.bottom=-span;sun.shadow.camera.right=sun.shadow.camera.top=span;sun.shadow.camera.updateProjectionMatrix();sun.target.position.copy(center);
  scene.fog=new THREE.Fog(light.background,75,175);interactionCamera=camera;render(camera);const image=renderer.domElement.toDataURL('image/webp',.96),depth=photographDepth(scene,camera,renderer).toDataURL('image/png');
  const matrix=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).toArray();
  const labels=plan.desks.map(([x,z],index)=>({index,...project(new THREE.Vector3(x,1.42,z),camera)}));labels.push({index:-1,...project(new THREE.Vector3(...[plan.entry[0],1.8,plan.entry[1]+.15] as [number,number,number]),camera)});
  // Foreground boundary walls cover the lower parts of furniture just as the real scene does.
  const saved:THREE.Object3D[]=[];for(const child of model.root.children)if(child.visible){child.visible=false;saved.push(child);}
  for(const wall of model.walls)if(wall.normal.dot(dir)<0)wall.group.visible=true;model.entry.visible=true;
  renderer.setClearColor('#000000',0);render(camera);const foreground=renderer.domElement.toDataURL('image/webp',.96);
  saved.forEach(object=>object.visible=true);
  return{image,depth,foreground,frame:{width,height,matrix,pixelsPerMeter:height/(camera.top-camera.bottom),depthRange:camera.far-camera.near,labels,angle,stage,night}};
}

const furniture=createOfficeFurniture(),palette=new Map<string,THREE.MeshStandardMaterial>();
const color=(hex:string)=>{let material=palette.get(hex);if(!material){material=new THREE.MeshStandardMaterial({color:hex,roughness:.72});palette.set(hex,material);}return material;};
const pcMaterials:HomeComputerMaterials={wood:color('#c8ae85'),darkWood:color('#3b4746'),fabric:color('#465b5d'),white:color('#e4e9e4'),cream:color('#d5cfbd'),metal:color('#687676'),color,screen:color('#708f9a'),screenOffice:color('#7b9dab'),screenGaming:color('#527f82')};
const spriteScene=new THREE.Scene();spriteScene.add(new THREE.HemisphereLight('#e6eee9','#a19b83',2.2));const spriteSun=new THREE.DirectionalLight('#fff0d1',3.1);spriteSun.position.set(-4,12,-4);spriteScene.add(spriteSun);
export function officeSprite(kind:'worker'|'low'|'mid'|'high',variant:number,angle:number){
  const group=new THREE.Group();
  if(kind==='worker'){const person=furniture.worker(variant,3);person.position.z=.75;group.add(person);}else{group.position.set(0,-.02,-.12);addHomeComputer(group,pcMaterials,kind==='high'?'premium':kind==='mid'?'standard':'basic');}
  spriteScene.add(group);const center=new THREE.Vector3(0,.9,0),camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,100);camera.position.copy(center).addScaledVector(direction(angle*Math.PI/2),15);camera.lookAt(center);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  renderer.setSize(1024,1024);renderer.setClearColor('#000000',0);renderer.render(spriteScene,camera);
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;const ctx=canvas.getContext('2d')!;ctx.drawImage(renderer.domElement,0,0);
  const depthCanvas=photographDepth(spriteScene,camera,renderer);const bytes=ctx.getImageData(0,0,1024,1024).data;let left=1024,top=1024,right=0,bottom=0;
  for(let y=0;y<1024;y++)for(let x=0;x<1024;x++)if(bytes[(y*1024+x)*4+3]!>3){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  left=Math.max(0,left-2);top=Math.max(0,top-2);right=Math.min(1023,right+2);bottom=Math.min(1023,bottom+2);
  const crop=document.createElement('canvas');crop.width=right-left+1;crop.height=bottom-top+1;crop.getContext('2d')!.drawImage(canvas,left,top,crop.width,crop.height,0,0,crop.width,crop.height);
  const origin=new THREE.Vector3().project(camera),anchor=[(origin.x+1)*512-left,(1-origin.y)*512-top];
  spriteScene.remove(group);if(kind!=='worker')group.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.dispose();});
  const croppedDepth=document.createElement('canvas');croppedDepth.width=crop.width;croppedDepth.height=crop.height;croppedDepth.getContext('2d')!.drawImage(depthCanvas,left,top,crop.width,crop.height,0,0,crop.width,crop.height);
  return{image:crop.toDataURL('image/webp',.96),depth:croppedDepth.toDataURL('image/png'),sprite:{width:crop.width,height:crop.height,anchor,pixelsPerMeter:ppm,depthOrigin:(origin.z+1)/2*65534,depthRange:camera.far-camera.near,...(kind==='worker'?officeWorkerAppearance(variant):{})}};
}
export function finish(){clearPhotographDepth();current?.dispose();furniture.dispose();palette.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();}

export function officeInteraction(){const ids=COMPANY_OFFICES[currentStage-1]!.desks.map((_,i)=>String(i));ids.push('-1');renderer.setSize(width,height);return{image:photographInteractions(scene,interactionCamera,renderer,ids,o=>ancestorInteraction(o,'seat')),ids};}
