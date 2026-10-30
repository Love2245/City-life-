import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {WeatherId} from '../../game/types';
import type {HomePlan} from '../../game/core/homeInterior';
import {homeEntryLanding} from './layout';
import {homeExteriorProfile,homeGroundY} from './housingProfiles';
import {districtBlocks,exteriorWeather} from './weather';
import {createWeatherAccumulation} from './accumulation';
import {createOutdoorPrecipitation} from './precipitation';
import {sceneTextureCanvas} from '../sceneTextureCanvas';
import {sceneFrameSeconds} from '../sceneAnimation';

type Detail='fine'|'light';
type Vec=[number,number,number];

/** Separate scenery root: it fills the view without enlarging indoor framing or camera bounds. */
export function createDistrictBackdrop(scene:THREE.Scene,options:{width:number;depth:number;height:number;kind:'home'|'cafe'|'store';villa:boolean;plan?:HomePlan;detail:Detail;host:HTMLElement;roadMap:THREE.Texture;pavingMap:THREE.Texture}){
  const {width:w,depth:d,height:h,host}=options,root=new THREE.Group();root.name='surrounding-neighborhood';root.userData.backgroundScenery=true;scene.add(root);
  const housing=options.kind==='home'&&options.plan?homeExteriorProfile(options.plan):undefined;
  const groundY=housing?homeGroundY(housing):-.165;
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  const shells:{root:THREE.Group;materials:THREE.MeshStandardMaterial[];bounds:THREE.Box3;center:THREE.Vector3;opacity:number;far:boolean}[]=[];
  let detail=options.detail,profile=exteriorWeather(),disposed=false,last=0,weatherApplied=false,timer:number|undefined;
  const reducedMotion=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  function own<T extends THREE.Material>(m:T){materials.add(m);return m;}
  function standard(color:string,roughness=.9){return own(new THREE.MeshStandardMaterial({color,roughness}));}
  function mesh(g:THREE.BufferGeometry,m:THREE.Material,parent:THREE.Object3D,at:Vec){geometries.add(g);const o=new THREE.Mesh(g,m);o.position.set(...at);o.receiveShadow=true;parent.add(o);return o;}
  function canvasTexture(key:string,width:number,height:number,draw:(c:CanvasRenderingContext2D)=>void){const t=new THREE.CanvasTexture(sceneTextureCanvas(key,width,height,draw));t.colorSpace=THREE.SRGBColorSpace;textures.add(t);return t;}
  const groundMap=canvasTexture('district-ground',512,512,c=>{c.fillStyle='#d1d0c1';c.fillRect(0,0,512,512);for(let i=0;i<18000;i++){c.fillStyle=i%3?'#ffffff12':'#465a4710';c.fillRect((i*131)%512,(i*233+Math.floor(i/512)*19)%512,i%3+1,1);}});groundMap.wrapS=groundMap.wrapT=THREE.RepeatWrapping;
  const ground=standard('#a4af9a'),road=standard('#ffffff',.95),paving=standard('#e1e1d2'),grass=standard('#819375'),trunk=standard('#71675a'),leaves=standard('#758d72'),stone=standard('#b0b0a1'),paint=standard('#d4d4c0');
  const streetGlows:THREE.MeshStandardMaterial[]=[];
  ground.map=groundMap;road.map=options.roadMap;paving.map=options.pavingMap;
  if(housing&&housing.floor>0&&options.plan){
    // The room is a cutaway of its real building. Lower storeys reach the same
    // ground as the district; an enclosed entrance core replaces exposed stilts.
    const lowerMap=canvasTexture(`district-lower-${housing.facade}`,256,256,c=>{c.fillStyle=housing.facade;c.fillRect(0,0,256,256);c.fillStyle='#899993';c.fillRect(40,48,72,118);c.fillRect(146,48,72,118);c.fillStyle='#d7d8c9';c.fillRect(36,168,82,10);c.fillRect(142,168,82,10);c.fillStyle='#a8aaa0';c.fillRect(0,246,256,8);});lowerMap.wrapS=lowerMap.wrapT=THREE.RepeatWrapping;
    const lowerMaterial=standard(housing.facade);lowerMaterial.map=lowerMap;
    const lowerShape=new THREE.Shape(options.plan.outline.map(([x,z])=>new THREE.Vector2(x,-z))),lower=new THREE.ExtrudeGeometry(lowerShape,{depth:-.22-groundY,bevelEnabled:false});lower.rotateX(-Math.PI/2);
    const lowerUv=lower.getAttribute('uv'),lowerPosition=lower.getAttribute('position'),lowerNormal=lower.getAttribute('normal');for(let i=0;i<lowerUv.count;i++)lowerUv.setXY(i,(Math.abs(lowerNormal.getX(i))>.5?lowerPosition.getZ(i):lowerPosition.getX(i))/3.4,lowerPosition.getY(i)/3.05);
    mesh(lower,lowerMaterial,root,[0,groundY,0]).name='residence-lower-storeys';
    const entry=homeEntryLanding(options.plan),core=new THREE.Group();core.position.set(entry.center[0],0,entry.center[1]);core.rotation.y=entry.yaw;root.add(core);
    const coreWidth=entry.span+(housing.entry==='stairwell'?3.08:0),coreShift=entry.shift+(housing.entry==='stairwell'?1.54:0),coreDepth=housing.entry==='stairwell'?2.24:entry.corridorWidth+.18,coreHeight=-.22-groundY;
    const coreMaterial=standard(housing.facade);
    mesh(new THREE.BoxGeometry(coreWidth,coreHeight,coreDepth),coreMaterial,core,[coreShift,groundY+coreHeight/2,coreDepth/2]).name='residence-entrance-core';
    // Floor bands make the building scale legible without loading whole city meshes.
    const bands:THREE.BufferGeometry[]=[];
    for(let floor=1;floor<housing.floor;floor++){
      const g=new THREE.BoxGeometry(coreWidth+.05,.07,coreDepth+.06);g.translate(coreShift,groundY+floor*3.05,coreDepth/2);bands.push(g);
    }
    if(bands.length){const merged=mergeGeometries(bands);bands.forEach(g=>g.dispose());if(merged)mesh(merged,stone,core,[0,0,0]);}
  }
  function flat(x:number,z:number,width:number,depth:number,y:number,m:THREE.Material,tile=2){const g=new THREE.PlaneGeometry(width,depth);g.rotateX(-Math.PI/2);const uv=g.getAttribute('uv'),pos=g.getAttribute('position');for(let i=0;i<uv.count;i++)uv.setXY(i,(pos.getX(i)+x)/tile,(pos.getZ(i)+z)/tile);return mesh(g,m,root,[x,y,z]);}
  // The floor extends beyond the reachable camera and fades into the same sky hue.
  flat(w/2,d/2,420,420,groundY,ground,5);
  const street=d+(housing?.district==='suburban-edge'?5.2:3.95);
  const lane=housing?.district==='city-center'?4.5:housing?.district==='suburban-edge'?2.7:housing?.district==='campus-courtyard'?3.2:2.2;
  const walk=housing?.district==='suburban-edge'?.9:1.9;
  flat(w/2,street,250,lane,groundY+.016,road);
  flat(w/2,street-lane/2-walk/2,250,walk,groundY+.12,paving);
  flat(w/2,street+lane/2+walk/2,250,walk,groundY+.12,paving);
  const crossStreets=housing?.district==='suburban-edge'?[-22]:[-15,w+16];
  for(const x of crossStreets){
    flat(x,d/2,4.0,250,groundY+.018,road);flat(x-2.8,d/2,1.6,250,groundY+.12,paving);flat(x+2.8,d/2,1.6,250,groundY+.12,paving);
  }
  // Road marks, garden beds and trunks are merged into a few static draws.
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  function add(g:THREE.BufferGeometry,m:THREE.Material){const list=batches.get(m)??[];list.push(g);batches.set(m,list);}
  function batchBox(at:Vec,size:Vec,m:THREE.Material){const g=new THREE.BoxGeometry(...size);g.translate(...at);add(g,m);}
  if(housing?.district!=='suburban-edge'){
    for(let x=-105;x<110;x+=3.4){if(x> -1.3&&x<w+2.1)continue;batchBox([x,groundY+.02,street],[1.5,.005,.045],paint);}
    for(const x of crossStreets)for(let z=-100;z<110;z+=3.4){if(Math.abs(z-street)<4)continue;batchBox([x,groundY+.023,z],[.045,.005,1.5],paint);}
  }
  for(const [x,z,bw,bd]of [[-6,2,3.4,5.5],[w+5,d*.4,3.5,6],[-5,d+9,4,4],[w+6,-5,4.5,5]]){
    batchBox([x,groundY+.035,z],[bw,.07,bd],grass);
    batchBox([x-bw/2,groundY+.06,z],[.09,.13,bd],stone);batchBox([x+bw/2,groundY+.06,z],[.09,.13,bd],stone);
    for(let i=0;i<2;i++){const tx=x+(i?1:-1)*bw*.2,tz=z+(i?1:-1)*bd*.27;
      const stem=new THREE.CylinderGeometry(.065,.09,1.6,6);stem.translate(tx,groundY+.8,tz);add(stem,trunk);
      for(let j=0;j<3;j++){const crown=new THREE.IcosahedronGeometry(.63+j*.08,1);crown.scale(1,1.12,1);crown.translate(tx+Math.sin(j*2)*.32,groundY+1.8+j*.24,tz+Math.cos(j*2)*.28);add(crown,leaves);}
    }
  }
  if(housing?.district==='campus-courtyard'){
    // Quiet campus courtyards have benches and orderly bicycle hoops.
    for(const x of [-5,w+5]){
      batchBox([x,groundY+.50,d+3.0],[2.2,.14,.52],trunk);for(const dx of [-.8,.8])batchBox([x+dx,groundY+.23,d+3],[.10,.46,.40],stone);
      for(let i=0;i<4;i++){batchBox([x-.9+i*.55,groundY+.40,d+.65],[.045,.8,.045],stone);batchBox([x-.9+i*.55,groundY+.78,d+.85],[.045,.045,.45],stone);}
    }
  }
  if(housing?.district==='suburban-edge'){
    const dirt=standard('#a89a7d'),fence=standard('#8a8e79');
    for(const x of [-4.3,w+4.3]){
      batchBox([x,groundY+.025,d*.45],[1.7,.05,3.2],dirt);
      for(let i=0;i<5;i++){batchBox([x-.65+i*.32,groundY+.08,d*.45],[.12,.08,2.85],grass);batchBox([x,groundY+.52,i*.75],[1.95,.055,.055],fence);}
    }
  }
  if(housing?.district==='night-market'){
    const marketBase=standard('#a48c74'),canvasA=standard('#9e6d57'),canvasB=standard('#6b8d83');
    const signMap=canvasTexture('district-night-market-sign',512,128,c=>{c.fillStyle='#493f40';c.fillRect(0,0,512,128);c.fillStyle='#e8bf80';c.font='600 42px "Microsoft YaHei",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('泊月 · 夜市小吃',256,64);});
    const sign=standard('#ffffff');sign.map=signMap;sign.emissive.set('#ffd594');sign.emissiveMap=signMap;streetGlows.push(sign);
    for(let i=0;i<6;i++){
      const x=-6+i*(w+12)/5,z=street+3.5;
      batchBox([x,groundY+.42,z],[1.75,.84,.78],marketBase);batchBox([x,groundY+1.72,z],[2.0,.10,1.16],i%2?canvasA:canvasB);
      for(const dx of [-.84,.84])batchBox([x+dx,groundY+.9,z],[.045,1.8,.045],stone);
      const panel=mesh(new THREE.PlaneGeometry(1.65,.32),sign,root,[x,groundY+1.45,z-.59]);panel.rotation.y=Math.PI;
    }
  }
  for(const [m,parts]of batches){const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());if(g)mesh(g,m,root,[0,0,0]);}batches.clear();

  const facadePairs=Array.from({length:4},(_,variant)=>{
    const draw=(emissive:boolean)=>canvasTexture(`district-facade-${variant}-${emissive}`,256,256,c=>{c.fillStyle=emissive?'#000000':['#bbc0b5','#b7afa0','#a8b6af','#b4b2a5'][variant];c.fillRect(0,0,256,256);
      for(let i=0;i<2;i++){const x=27+i*122;c.fillStyle=emissive?(i===variant%2?'#ddc58b':'#5b7478'):'#7f9597';c.fillRect(x,51,80,133);if(!emissive){c.fillStyle='#c6cec4';c.fillRect(x-3,47,86,5);c.fillRect(x-3,184,87,9);c.fillStyle='#c2c7bb';c.fillRect(x+38,51,3,133);c.fillRect(x,111,80,3);}}
      if(!emissive){c.fillStyle='#8b948815';for(let i=0;i<1800;i++)c.fillRect((i*137)%256,(i*193+Math.floor(i/11))%256,1,1);c.fillStyle='#8b8e7e';c.fillRect(0,248,256,4);}
    });const color=draw(false),emission=draw(true);for(const t of [color,emission])t.wrapS=t.wrapT=THREE.RepeatWrapping;return {color,emission};
  });
  for(const spec of districtBlocks(w,d,options.villa,housing?.district)){
    const g=new THREE.Group();g.position.set(spec.x,groundY,spec.z);root.add(g);
    const pair=facadePairs[spec.variant],body=own(new THREE.MeshStandardMaterial({map:pair.color,emissiveMap:pair.emission,emissive:'#ffffff',emissiveIntensity:.02,roughness:.94})),roof=standard(['#77847c','#8d8d7d','#737e7a','#909282'][spec.variant]);
    const geo=new THREE.BoxGeometry(spec.width,spec.height,spec.depth),uv=geo.getAttribute('uv'),p=geo.getAttribute('position'),n=geo.getAttribute('normal');
    for(let i=0;i<uv.count;i++)uv.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))/3.4,(p.getY(i)+spec.height/2)/2.85);
    mesh(geo,body,g,[0,spec.height/2,0]);
    const roofParts:THREE.BufferGeometry[]=[];for(const [at,size]of [ [[0,spec.height+.04,0],[spec.width+.22,.12,spec.depth+.22]], [[spec.width*.22,spec.height+.30,-spec.depth*.15],[1.25,.50,1.0]] ] as [Vec,Vec][]){const piece=new THREE.BoxGeometry(...size);piece.translate(...at);roofParts.push(piece);}
    const roofGeo=mergeGeometries(roofParts);roofParts.forEach(p=>p.dispose());if(roofGeo)mesh(roofGeo,roof,g,[0,0,0]);
    if(housing?.district==='suburban-edge'||housing?.district==='garden-neighborhood'){
      const rise=spec.depth*.18,half=spec.depth/2,roofLength=Math.hypot(half,rise),angle=Math.atan2(rise,half);
      for(const side of [-1,1]){const slope=mesh(new THREE.BoxGeometry(spec.width+.5,.12,roofLength+.25),roof,g,[0,spec.height+rise/2+.12,side*half/2]);slope.rotation.x=side*angle;}
    }
    const bounds=new THREE.Box3().setFromObject(g);shells.push({root:g,materials:[body,roof],bounds,center:bounds.getCenter(new THREE.Vector3()),opacity:1,far:spec.far});
  }

  // One sky texture and one fog instance are reused for every weather transition.
  const skyCanvas=document.createElement('canvas');skyCanvas.width=512;skyCanvas.height=256;const sky=new THREE.CanvasTexture(skyCanvas);sky.colorSpace=THREE.SRGBColorSpace;textures.add(sky);
  const previousBackground=scene.background,previousFog=scene.fog,fog=new THREE.Fog('#c7cec1',45,150);scene.background=sky;scene.fog=fog;
  const accumulation=createWeatherAccumulation(root,w,d,groundY);
  const precipitation=createOutdoorPrecipitation(w,d,groundY,reducedMotion);
  function weather(value:WeatherId,night:boolean){
    if(weatherApplied&&profile.weather===value&&profile.night===night)return profile;weatherApplied=true;
    profile=exteriorWeather(value,night);const c=skyCanvas.getContext('2d')!,gradient=c.createLinearGradient(0,0,0,256);gradient.addColorStop(0,profile.sky);gradient.addColorStop(.68,profile.horizon);gradient.addColorStop(1,profile.fog);c.fillStyle=gradient;c.fillRect(0,0,512,256);sky.needsUpdate=true;
    fog.color.set(profile.fog);ground.color.set(profile.ground);grass.color.set(profile.snow?'#d9e3da':value==='heatwave'?'#9a9b72':'#819375');leaves.color.set(profile.snow?'#b9c9bd':night?'#5a7564':'#758d72');
    road.color.set(profile.snow?'#a5b6b6':profile.wet?'#687d84':'#ffffff');road.roughness=profile.wet?.34:.95;paving.color.set(profile.snow?'#e8efea':profile.wet?'#a7babc':'#e1e1d2');paving.roughness=profile.wet?.48:.9;
    for(const shell of shells){shell.materials[0].emissiveIntensity=night?.66:.025;shell.materials[0].color.set(profile.snow?'#d4dfdc':night?'#a8b8bc':'#ffffff');shell.materials[1].color.set(profile.snow?'#d8e3de':night?'#586b70':'#858d83');}
    for(const glow of streetGlows)glow.emissiveIntensity=night?.85:.05;
    accumulation.setWeather(value);precipitation.setWeather(profile.precipitation,night);
    if(profile.precipitation==='none'&&timer!==undefined){cancelAnimationFrame(timer);timer=undefined;}
    host.dataset[`${options.kind}Weather`]=JSON.stringify({id:value,night,precipitation:profile.precipitation,wet:profile.wet,snow:profile.snow,animated:!reducedMotion&&profile.precipitation!=='none'});return profile;
  }
  function setDetail(value:Detail){detail=value;let far=0;for(const shell of shells)shell.root.visible=value==='fine'||!shell.far||far++<4;precipitation.setDetail(value);host.dataset[`${options.kind}Backdrop`]=JSON.stringify({type:housing?.district??'street-block',residenceId:housing?.id,floor:housing?.floor,buildings:shells.filter(s=>s.root.visible).length,detail:value,groundY,interactive:false});}
  const primaryBox=new THREE.Box3(new THREE.Vector3(-.6,0,-.6),new THREE.Vector3(w+.6,h+.3,d+.6));
  const roomScreen=new THREE.Box2(),shellScreen=new THREE.Box2(),point=new THREE.Vector3(),screenPoint=new THREE.Vector2(),center=new THREE.Vector3(w/2,1,d/2);
  function project(box:THREE.Box3,result:THREE.Box2,camera:THREE.Camera){result.makeEmpty();for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){point.set(x,y,z).project(camera);screenPoint.set(point.x,point.y);result.expandByPoint(screenPoint);}}
  function update(camera:THREE.Camera,target:THREE.Vector3,now:number){
    if(disposed)return false;const dt=sceneFrameSeconds(now,last);last=now;camera.updateMatrixWorld();
    fog.near=camera.position.distanceTo(target)+Math.hypot(w,d)*.65;fog.far=fog.near+profile.fogSpan;
    project(primaryBox,roomScreen,camera);const dx=camera.position.x-center.x,dz=camera.position.z-center.z;let moving=false;
    for(const shell of shells){if(!shell.root.visible)continue;project(shell.bounds,shellScreen,camera);const foreground=(shell.center.x-center.x)*dx+(shell.center.z-center.z)*dz>0;
      const goal=foreground&&roomScreen.intersectsBox(shellScreen)?.055:1;shell.opacity=THREE.MathUtils.damp(shell.opacity,goal,14,dt);if(Math.abs(goal-shell.opacity)<.001)shell.opacity=goal;else moving=true;
      for(const m of shell.materials){const transparent=shell.opacity<.999;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.opacity=shell.opacity;m.depthWrite=!transparent;}
    }
    return moving;
  }
  let lastWeatherFrame=0;
  function scheduleFrame(request:()=>void){if(disposed||reducedMotion||document.hidden||profile.precipitation==='none'||timer!==undefined)return;
    const tick=(now:number)=>{timer=undefined;if(disposed||document.hidden||profile.precipitation==='none')return;if(now-lastWeatherFrame<(detail==='fine'?15:30)){timer=requestAnimationFrame(tick);return;}lastWeatherFrame=now;request();};timer=requestAnimationFrame(tick);
  }
  function visible(){if(!document.hidden)options.host.dispatchEvent(new Event('scene-weather-resume'));}
  document.addEventListener('visibilitychange',visible);
  setDetail(detail);weather('sunny',false);
  return {root,weather,setDetail,update,scheduleFrame,weatherLayer:precipitation.scene,
    dispose(){disposed=true;if(timer!==undefined)cancelAnimationFrame(timer);document.removeEventListener('visibilitychange',visible);precipitation.dispose();accumulation.dispose();root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());if(scene.background===sky)scene.background=previousBackground;if(scene.fog===fog)scene.fog=previousFog;},
  };
}
