import {officeCameraLimits,constrainOfficeCamera} from './companyCamera';
import * as THREE from 'three';
import {displayPixelScale,type RenderResolution} from './renderResolution';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { addHomeComputer, type HomeComputerMaterials } from './homeComputerModel';
import { createOfficeFurniture } from './companyOfficeFurniture';
import { COMPANY_OFFICES, type OfficePlan, type OfficeSeat } from '../game/core/companyOffice';
import { createScenePipeline, scenePixelRatio, sceneQuality, type QualityMode } from './scenePipeline';
import { batchSceneFixturesAsync } from './sceneBatching';
import { createSceneReadiness, createSceneWorkBudget, sceneRenderIsCovered } from './sceneLoadWork';
import type { HomeWallMode } from './homeWallView';
import {officeLightScheme,officeLightingMetadata,type OfficeLightScheme} from './officeLighting';
import type {WeatherId} from '../game/types';
import {buildOfficeSurroundings} from './companyOfficeSurroundings';
import {createWallTransition} from './wallTransition';
import {createOfficeInstances} from './officeInstancing';

/** The exit uses index -1; non-negative indices always remain actual workstations. */
export interface OfficeLabel { index: number; x: number; y: number; visible: boolean }

/** Small repeatable materials also work offline and in no-DOM model tests. */
function surface(kind:'oak'|'carpet'){
  const n=128,data=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=(y*n+x)*4,grain=kind==='oak'?Math.sin(x*.9+Math.sin(y*.05)*3)*3+Math.sin(x*5+y*.013)*2:((x*13+y*7)%11)-5;
    const seam=kind==='oak'&&(x%32===0||y===(Math.floor(x/32)%2?64:0)),base=kind==='oak'?[186,162,126]:[151,162,157];
    for(let c=0;c<3;c++)data[i+c]=base[c]!+grain-(seam?22:0);data[i+3]=255;
  }
  const t=new THREE.DataTexture(data,n,n);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.needsUpdate=true;return t;
}

/** Architecture, equipment and people have separate lifetimes: clock changes do not rebuild desks. */
export function buildCompanyOffice(plan:OfficePlan,detail:'fine'|'light'='fine'){
  const root=new THREE.Group();root.name=`company-office-${plan.stage}`;
  const surroundings=buildOfficeSurroundings(plan);root.add(surroundings.root);
  const furniture=createOfficeFurniture(detail),materials=new Map<string,THREE.MeshStandardMaterial>(),geometries=new Set<THREE.BufferGeometry>(),textures=new Set<THREE.Texture>();
  const color=(hex:string)=>{let m=materials.get(hex);if(!m){m=new THREE.MeshStandardMaterial({color:hex,roughness:.72});materials.set(hex,m);}return m;};
  const wood=surface('oak'),cloth=surface('carpet');textures.add(wood);textures.add(cloth);
  const floorMaterial=new THREE.MeshStandardMaterial({map:wood,roughness:.84}),carpet=new THREE.MeshStandardMaterial({map:cloth,roughness:1});materials.set('floor',floorMaterial);materials.set('carpet',carpet);
  const glass=new THREE.MeshStandardMaterial({color:'#b4d6d5',transparent:true,opacity:.18,roughness:.22,metalness:.1,depthWrite:false,side:THREE.DoubleSide});materials.set('glass',glass);
  const windowGlass=glass.clone();materials.set('window-glass',windowGlass);
  const lampDiffuser=new THREE.MeshStandardMaterial({color:'#fff3d2',roughness:.72,emissive:'#fff1cb',emissiveIntensity:.025});materials.set('lamp-diffuser',lampDiffuser);
  const pcMaterials:HomeComputerMaterials={wood:color('#c8ae85'),darkWood:color('#3b4746'),fabric:color('#465b5d'),white:color('#e4e9e4'),cream:color('#d5cfbd'),metal:color('#687676'),color,screen:color('#708f9a'),screenOffice:color('#7b9dab'),screenGaming:color('#527f82')};
  function box(parent:THREE.Object3D,name:string,x:number,y:number,z:number,w:number,h:number,d:number,paint:string|THREE.Material){
    const g=new THREE.BoxGeometry(w,h,d);geometries.add(g);const m=new THREE.Mesh(g,typeof paint==='string'?color(paint):paint);m.name=name;m.position.set(x,y,z);m.castShadow=paint!==glass&&paint!==windowGlass;m.receiveShadow=true;parent.add(m);return m;
  }
  const architecture=new THREE.Group();architecture.name='office-architecture';root.add(architecture);
  const shape=new THREE.Shape(plan.outline.map(([x,z])=>new THREE.Vector2(x,-z))),floorGeometry=new THREE.ShapeGeometry(shape);geometries.add(floorGeometry);
  const uv=floorGeometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/2,-uv.getY(i)/2);
  const floor=new THREE.Mesh(floorGeometry,floorMaterial);floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.name='office-floor';architecture.add(floor);
  const slab=floor.clone();slab.material=color('#646f6d');slab.position.y=-.14;architecture.add(slab);
  const walls:{group:THREE.Group;normal:THREE.Vector3}[]=[...surroundings.walls];
  for(let i=0;i<plan.outline.length;i++){
    const a=plan.outline[i]!,b=plan.outline[(i+1)%plan.outline.length]!,length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const g=new THREE.Group();g.name=`outer-wall-${i}`;g.position.set((a[0]+b[0])/2,0,(a[1]+b[1])/2);g.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);root.add(g);
    const dx=b[0]-a[0],dz=b[1]-a[1],along=((plan.entry[0]-a[0])*dx+(plan.entry[1]-a[1])*dz)/length;
    const atEntry=Math.abs((plan.entry[0]-a[0])*dz-(plan.entry[1]-a[1])*dx)/length<.01&&along>.72&&along<length-.72;
    const opening=along-length/2,spans=atEntry?[[-length/2,opening-.73],[opening+.73,length/2]]:[[-length/2,length/2]];
    for(const[left,right]of spans){const x=(left!+right!)/2,w=right!-left!;box(g,'wall-base',x,.28,0,w,.56,.16,'#dedfd3');box(g,'wall-skirting',x,.07,-.015,w,.14,.2,'#76837e');}
    if(i===0){
      box(g,'window-sill',0,.65,.04,length,.12,.3,'#e5e4d8');
      // High-floor views use open window frames; no opaque reflection sheet blocks the skyline.
      if(plan.stage<3)box(g,'panoramic-window',0,1.66,0,length-.18,1.95,.035,windowGlass);
      for(let x=-length/2+.08;x<length/2;x+=1.6){box(g,'window-mullion',x,1.65,0,.055,2.05,.1,'#586c6d');box(g,'roller-blind',x+.67,2.45,.05,1.25,.2,.065,'#b8bcae');}
      box(g,'window-lintel',0,2.72,0,length,.16,.19,'#e9e8db');
    }else{for(const[left,right]of spans){const x=(left!+right!)/2,w=right!-left!;box(g,'wall-plaster',x,1.66,0,w,2.2,.16,'#e2e2d7');box(g,'wall-coping',x,2.77,0,w,.055,.2,'#a9b0a5');}}
    walls.push({group:g,normal:new THREE.Vector3(-(b[1]-a[1])/length,0,(b[0]-a[0])/length)});
  }
  for(const zone of plan.zones){
    const[x,z,w,d]=zone.rect;
    // A slight tint separates team islands without painting a rigid floor grid.
    const rug=plan.stage>=3?carpet.clone():carpet;
    if(plan.stage>=3){rug.color.set('#ffffff').lerp(new THREE.Color(zone.color),.38);materials.set(`zone-${zone.name}`,rug);}
    box(architecture,`zone-${zone.name}`,x+w/2,.015,z+d/2,w,.025,d,rug).castShadow=false;
  }
  for(const[i,[x1,z1,x2,z2]]of plan.partitions.entries()){
    const length=Math.hypot(x2-x1,z2-z1),g=new THREE.Group();g.position.set((x1+x2)/2,0,(z1+z2)/2);g.rotation.y=-Math.atan2(z2-z1,x2-x1);g.name=`glass-meeting-partition-${i}`;architecture.add(g);
    box(g,'glass-panel',0,1.2,0,length,2.4,.035,glass);
    for(const x of [-length/2,length/2])box(g,'partition-upright',x,1.2,0,.045,2.4,.07,'#566666');
    for(const y of [.08,2.4])box(g,'partition-rail',0,y,0,length,.045,.07,'#566666');
    box(g,'privacy-band',0,1.15,0,length,.19,.045,'#bccdc6');
  }
  const workstations:THREE.Group[]=[],equipment:THREE.Group[]=[],workers:THREE.Group[]=[],equipmentKeys:string[]=[],workerKeys:string[]=[];
  for(const[index,[x,z]]of plan.desks.entries()){
    const desk=new THREE.Group();desk.name=`workstation-${index}`;desk.position.set(x,0,z);desk.rotation.y=plan.deskRotations?.[index]??0;desk.userData.seat=index;root.add(desk);workstations.push(desk);
    const executive=index===0&&plan.stage>=3;
    const desktop=executive?furniture.executiveDesk(plan.stage===4):furniture.desk(index===0);desk.add(desktop);
    const chair=furniture.chair();chair.position.z=.75;if(executive)chair.scale.set(1.08,1.13,1.08);desk.add(chair);
    const pc=new THREE.Group(),person=new THREE.Group();pc.name=`equipment-${index}`;person.name=`person-${index}`;desk.add(pc,person);equipment.push(pc);workers.push(person);
  }
  const[mx,mz,mw,md]=plan.meeting,table=furniture.meetingTable(mw,md);table.position.set(mx,0,mz);architecture.add(table);
  for(const [index,[x,z,width,yaw]]of (plan.screens??[]).entries()){
    const screen=new THREE.Group();screen.name=`team-acoustic-screen-${index}`;screen.position.set(x,0,z);screen.rotation.y=yaw;architecture.add(screen);
    box(screen,'acoustic-fabric',0,1.015,0,width,.38,.052,'#82968b');
    box(screen,'screen-top-trim',0,1.213,0,width+.025,.025,.06,'#b2bdb2');
    for(const side of [-1,1])box(screen,'screen-support',side*(width/2-.12),.895,0,.026,.25,.07,'#596b62');
  }
  for(const [index,[x,z,yaw]]of (plan.utilities??[]).entries()){
    const cabinet=new THREE.Group();cabinet.name=`shared-print-storage-${index}`;cabinet.position.set(x,0,z);cabinet.rotation.y=yaw;architecture.add(cabinet);
    box(cabinet,'storage-plinth',0,.065,0,2.02,.13,.57,'#59645e');
    box(cabinet,'storage-body',0,.475,0,2.1,.74,.64,'#d4d5c8');
    box(cabinet,'storage-oak-top',0,.866,0,2.16,.045,.69,'#bda783');
    for(const side of [-1,1]){
      box(cabinet,'storage-door',side*.52,.475,.33,1.015,.69,.027,'#e0e0d4');
      box(cabinet,'storage-handle',side*.15,.63,.353,.19,.018,.025,'#6b7870');
    }
    box(cabinet,'shared-printer-base',-.45,.995,0,.64,.21,.45,'#52625e');
    box(cabinet,'shared-printer-lid',-.45,1.13,-.035,.65,.065,.43,'#d6dfd7');
    box(cabinet,'printer-paper-tray',-.45,.925,.27,.39,.028,.16,'#f0eee1');
    box(cabinet,'printer-control-panel',-.18,1.109,.18,.095,.025,.075,'#7da1a4');
    for(let i=0;i<3;i++)box(cabinet,'shared-reference-folder',.36+i*.14,.998,-.025,.095,.22,.24,['#9eae9f','#b5a58c','#87989d'][i]!);
  }
  const count=plan.stage===4?4:2;
  for(const side of [-1,1])for(let i=0;i<count;i++){const chair=furniture.chair();chair.position.set(mx-mw*.32+mw*.64*i/(count-1),0,mz+side*(md/2+.45));chair.rotation.y=side===1?0:Math.PI;architecture.add(chair);}
  for(const[x,z]of plan.shelves){const shelf=furniture.shelf();shelf.position.set(x,0,z);shelf.rotation.y=z<1?Math.PI:x<1?-Math.PI/2:Math.PI/2;architecture.add(shelf);}
  for(const[x,z]of plan.plants){const p=furniture.plant();p.position.set(x,0,z);architecture.add(p);}
  const lounge=furniture.lounge();lounge.position.set(plan.lounge[0],0,plan.lounge[1]);lounge.rotation.y=plan.lounge[0]<plan.size[0]/2?-Math.PI/2:Math.PI/2;architecture.add(lounge);
  if(plan.stage>=3){
    const loungeTable=furniture.coffeeTable();loungeTable.position.set(plan.lounge[0]+1.15,0,plan.lounge[1]);loungeTable.rotation.y=-Math.PI/2;architecture.add(loungeTable);
    const suite=new THREE.Group();suite.name='founder-office-suite';architecture.add(suite);
    const spacious=plan.stage===4,[fx,fz]=plan.desks[0]!,yaw=plan.deskRotations?.[0]??0;
    for(const offset of spacious?[-.5,.5]:[0]){
      const visitor=furniture.chair();visitor.position.set(offset,0,-1.35).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(new THREE.Vector3(fx,0,fz));visitor.rotation.y=yaw+Math.PI;suite.add(visitor);
    }
    const privateLounge=furniture.lounge();privateLounge.position.set(.55,0,spacious?4.2:3.45);privateLounge.rotation.y=-Math.PI/2;suite.add(privateLounge);
    const privateTable=furniture.coffeeTable();privateTable.position.set(1.6,0,spacious?4.2:3.45);privateTable.rotation.y=-Math.PI/2;suite.add(privateTable);
    const plant=furniture.plant();plant.position.set(spacious?5.5:4.45,0,spacious?.65:3.85);suite.add(plant);
    box(suite,'founder-meeting-rug',1.5,.031,spacious?4.2:3.45,2.45,.018,spacious?2:1.95,'#d7c7a3').castShadow=false;
    const wall=plan.stage===4?5.7:4.8,door=plan.stage===4?4.35:3.4;
    for(const x of [door-.6,door+.6])box(architecture,'founder-office-door-frame',x,1.2,wall,.055,2.4,.1,'#725f49');
    box(architecture,'founder-office-door-lintel',door,2.4,wall,1.25,.06,.1,'#725f49');
  }
  const[bx,bz]=plan.board;box(architecture,'planning-whiteboard-frame',bx,1.65,bz,2.1,1.15,.08,'#8a9992');box(architecture,'planning-whiteboard',bx,1.65,bz+.05,2,1.04,.03,'#eff0e5');
  for(let i=0;i<4;i++){box(architecture,'planning-column',bx-.69+i*.45,1.97,bz+.073,.3,.035,.012,'#7a9b92');for(let j=0;j<2;j++)box(architecture,'planning-sticky-note',bx-.69+i*.45,1.76-j*.25,bz+.08,.23,.16,.015,['#d7c890','#a4b9b0','#b0bfcd','#d4b4a0'][i]!);}
  const[ex,ez]=plan.entry;box(architecture,'office-entry-mat',ex,.025,ez-.55,1.45,.035,.85,'#596963');
  // A full-height, open door remains visible when surrounding walls are cut down.
  const entry=new THREE.Group();entry.name='office-exit-door';entry.position.set(ex,0,ez);entry.userData.seat=-1;entry.userData.officeExit=true;root.add(entry);
  for(const x of [-.68,.68])box(entry,'office-door-frame',x,1.2,0,.105,2.4,.19,'#65736e');
  box(entry,'office-door-lintel',0,2.42,0,1.47,.11,.2,'#65736e');box(entry,'office-door-threshold',0,.032,0,1.36,.055,.23,'#b1b8b1');
  const leaf=new THREE.Group();leaf.name='office-door-leaf';leaf.position.set(-.615,.065,0);leaf.rotation.y=-Math.PI*.31;entry.add(leaf);
  if(plan.stage===4){
    entry.userData.elevator=true;leaf.position.set(0,.035,.01);leaf.rotation.y=0;
    for(const side of [-1,1]){
      box(leaf,'elevator-sliding-door',side*.53,1.13,.055,.3,2.26,.055,'#a7b7b5');
      box(leaf,'elevator-door-trim',side*.39,1.13,.018,.025,2.26,.03,'#e3e9df');
    }
    box(entry,'elevator-call-panel',.92,1.1,-.09,.2,.42,.045,'#536d76');
    box(entry,'elevator-call-button',.92,1.09,-.12,.08,.08,.025,'#e6ce8e');
    box(entry,'elevator-floor-display',0,2.59,-.04,.54,.2,.06,'#2b454d');
  }else{
  for(const x of [.035,1.195])box(leaf,'door-leaf-upright',x,1.13,0,.07,2.26,.075,'#6b756d');
  for(const y of [.035,.73,2.225])box(leaf,'door-leaf-rail',.615,y,0,1.16,.07,.075,'#6b756d');
  box(leaf,'door-lower-panel',.615,.385,0,1.1,.62,.055,plan.stage===1?'#b99e77':'#a5b6af');
  box(leaf,'door-glass',.615,1.48,0,1.1,1.4,.028,glass);box(leaf,'door-frosted-band',.615,1.18,0,1.1,.18,.032,'#c9d9cf');
  for(const z of [-.085,.085]){box(leaf,'door-pull-handle',1.065,1.1,z,.032,.36,.032,'#c5cbc4');for(const y of [.96,1.24])box(leaf,'door-handle-mount',1.065,y,z/2,.034,.035,.085,'#c5cbc4');}
  for(const y of [.23,1.1,1.99])box(entry,'office-door-hinge',-.62,y,.02,.08,.1,.11,'#9aa69e');
  }
  box(entry,'office-exit-sign',0,2.61,0,1.05,.23,.09,'#486b5b');
  box(entry,'exit-arrow-shaft',.12,2.61,.052,.35,.024,.012,'#f1eee1');for(const side of [-1,1]){const stroke=box(entry,'exit-arrow-head',.29,2.61+side*.04,.052,.13,.024,.012,'#f1eee1');stroke.rotation.z=-side*Math.PI/4;}
  box(entry,'exit-sign-person-body',-.24,2.6,.052,.035,.075,.012,'#f1eee1');box(entry,'exit-sign-person-head',-.24,2.67,.052,.045,.035,.012,'#f1eee1');
  if(plan.stage===4){
    const huddle=furniture.meetingTable(2.6,1.2);huddle.position.set(10.2,0,2.6);huddle.name='collaboration-table';architecture.add(huddle);
    for(const x of [8.5,11.9]){const chair=furniture.chair();chair.position.set(x,0,2.6);chair.rotation.y=x<10.2?-Math.PI/2:Math.PI/2;architecture.add(chair);}
    box(architecture,'reception-desk',2.3,.57,8.2,2.6,1.14,.72,'#b8986e');box(architecture,'reception-stone-top',2.3,1.17,8.2,2.7,.08,.84,'#dddcd1');
    for(let x=1.12;x<3.5;x+=.13)box(architecture,'reception-oak-flute',x,.57,8.57,.045,1.05,.035,'#d0b184');
    box(architecture,'reception-sign-wall',2.5,1.2,7.25,3.8,2.4,.12,'#aab9ad');for(let i=0;i<5;i++)box(architecture,'reception-brand-mark',1.8+i*.28,1.65,7.33,.12,.12+i*.07,.04,'#e6d6aa');
  }
  // Rails keep the cutaway readable; solid ceilings would obscure all workstations.
  for(const z of plan.stage<3?[1,3.8]:[1,4,7]){
    const w=plan.stage===4?7:plan.size[0]*.65,x=plan.stage===4?9:plan.size[0]/2;box(architecture,'suspended-linear-light',x,2.86,z,w,.065,.12,'#535f5b');
    box(architecture,'light-diffuser',x,2.82,z,w-.06,.016,.1,lampDiffuser);
  }
  let disposed=false,prepared=false;const instances=detail==='light'?createOfficeInstances(root,workstations):undefined;const templates=new Map<string,THREE.Group>();
  function computer(tier:NonNullable<OfficeSeat['tier']>){
    let template=templates.get(tier);if(!template){template=new THREE.Group();template.name='assigned-computer';template.position.set(0,-.02,-.12);addHomeComputer(template,pcMaterials,tier==='high'?'premium':tier==='mid'?'standard':'basic');templates.set(tier,template);template.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});}return template.clone(true);
  }
  return{root,workstations,walls,entry,pickables:()=>[...workstations,entry,...(instances?.pickables()??[])],framingBounds:surroundings.framingBounds,address:surroundings.address,
    setLighting(light:OfficeLightScheme){surroundings.setLighting(light);windowGlass.color.set(light.windowColor);windowGlass.emissive.set(light.windowColor);windowGlass.emissiveIntensity=light.windowEmission;windowGlass.opacity=light.frame==='night'?.32:.18;lampDiffuser.emissive.set(light.lampColor);lampDiffuser.emissiveIntensity=light.lampEmission;},
    update(snapshot:OfficeSeat[]){let changed=false;const changing=()=>{if(!changed&&prepared)instances?.restore();changed=true;};for(const seat of snapshot){const index=seat.index,g=equipment[index],p=workers[index];if(!g||!p)continue;
      if(equipmentKeys[index]!==String(seat.tier)){changing();g.clear();if(seat.tier)g.add(computer(seat.tier));equipmentKeys[index]=String(seat.tier);}
      const key=index>0&&seat.present?seat.personId:'';if(workerKeys[index]!==key){changing();p.clear();if(key){const person=furniture.worker(index,seat.stars,seat.personId);person.position.z=.75;p.add(person);}workerKeys[index]=key;}
    }if(changed&&prepared)instances?.rebuild();return changed;},
    async prepare(checkpoint:()=>Promise<void>){
      instances?.rebuild();
      const owners=new Set<THREE.Object3D>([...workstations,...equipment,...workers,entry,...walls.map(w=>w.group)]);
      await batchSceneFixturesAsync(root,owners,g=>geometries.add(g),checkpoint);
      for(const template of templates.values())await batchSceneFixturesAsync(template,new Set(),g=>geometries.add(g),checkpoint);
      prepared=true;
    },
    dispose(){if(disposed)return;disposed=true;instances?.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());furniture.dispose();surroundings.dispose();root.clear();templates.clear();},
  };
}

export function createCompanyOffice(host:HTMLElement,stage:number,onLabels:(labels:OfficeLabel[])=>void,onChoose:(index:number)=>void,qualityMode:QualityMode='auto',renderScale=1,resolution:RenderResolution='auto'){
  const started=performance.now(),plan=COMPANY_OFFICES[stage-1]!,model=buildCompanyOffice(plan,sceneQuality(qualityMode).id),scene=new THREE.Scene();scene.background=new THREE.Color('#c6ceca');scene.fog=new THREE.Fog('#c6ceca',75,175);scene.add(model.root);
  let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});}catch(error){model.dispose();throw error;}
  renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;host.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(38,1,.1,180),center=model.framingBounds.getCenter(new THREE.Vector3()).setY(.3),span=Math.max(...plan.size);
  const controls=new OrbitControls(camera,renderer.domElement);controls.mouseButtons.LEFT=THREE.MOUSE.PAN;controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;controls.touches.ONE=THREE.TOUCH.PAN;controls.target.copy(center);controls.minPolarAngle=Math.PI*.17;controls.maxPolarAngle=Math.PI*.29;controls.enableDamping=true;controls.dampingFactor=.14;controls.screenSpacePanning=false;
  let cameraLimits=officeCameraLimits(plan,center,span*2);
  function clampCamera(){constrainOfficeCamera(camera,controls.target,cameraLimits);host.dataset.officeCameraLimits=JSON.stringify(cameraLimits);}
  function reset(){const damping=controls.enableDamping;controls.enableDamping=false;controls.update();const aspect=Math.max(.5,host.clientWidth/Math.max(1,host.clientHeight)),size=model.framingBounds.getSize(new THREE.Vector3()),fit=Math.max(size.z+1,(size.x+3)/aspect),offset=new THREE.Vector3(fit*.48,fit*1.1,fit*1.1);cameraLimits=officeCameraLimits(plan,center,offset.length());controls.minDistance=cameraLimits.minDistance;controls.maxDistance=cameraLimits.maxDistance;camera.position.copy(center).add(offset);controls.target.copy(center);camera.lookAt(center);controls.update();controls.enableDamping=damping;clampCamera();}
  const ambient=new THREE.HemisphereLight('#e6eee9','#a19b83',2.2),sun=new THREE.DirectionalLight('#fff0d1',3.1),interiorFill=new THREE.DirectionalLight('#ffd2a0',0);
  sun.target.position.copy(center);sun.castShadow=true;sun.shadow.camera.left=-span;sun.shadow.camera.right=span;sun.shadow.camera.top=span;sun.shadow.camera.bottom=-span;sun.shadow.camera.far=80;sun.shadow.normalBias=.04;sun.shadow.bias=-.00015;
  interiorFill.position.copy(center).add(new THREE.Vector3(0,7,1));interiorFill.target.position.copy(center);interiorFill.castShadow=false;scene.add(ambient,sun,sun.target,interiorFill,interiorFill.target);
  let quality=sceneQuality(qualityMode),pipeline=createScenePipeline(renderer,scene,camera,[],quality),frame=0,disposed=false,warming=true,wallMode:HomeWallMode='cutaway',lowWall=.65,labelSignature='',width=0,height=0,ratio=0;
  const contactObjects=()=>[...model.workstations,...model.root.children.filter(o=>o instanceof THREE.InstancedMesh)];pipeline.setContactObjects(contactObjects);
  const readiness=createSceneReadiness(),checkpoint=createSceneWorkBudget(()=>disposed),direction=new THREE.Vector3();sun.shadow.mapSize.setScalar(quality.shadowSize);
  const wallTransitions=new Map(model.walls.map(wall=>[wall.group,createWallTransition(wall.group.scale.y)]));
  const reducedMotion=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):undefined;
  let wallsInitialized=false,lastFrame=0;
  function request(){if(!disposed&&!frame)frame=requestAnimationFrame(draw);}
  let lightingKey='';
  function lightAt(hour=12,weather:WeatherId='sunny',month=9){
    const light=officeLightScheme(hour,month,weather),key=JSON.stringify(light);
    if(key===lightingKey)return false;lightingKey=key;
    (scene.background as THREE.Color).set(light.background);(scene.fog as THREE.Fog).color.set(light.background);ambient.color.set(light.skyColor);ambient.groundColor.set(light.groundColor);ambient.intensity=light.ambientIntensity;
    sun.color.set(light.sunColor);sun.intensity=light.sunIntensity;sun.position.copy(center).add(new THREE.Vector3(...light.sunOffset).multiplyScalar(span));
    interiorFill.color.set(light.lampColor);interiorFill.intensity=light.fillIntensity;model.setLighting(light);
    host.dataset.officeLighting=officeLightingMetadata(light);host.dataset.officeBuilding=JSON.stringify(model.address);renderer.shadowMap.needsUpdate=true;return true;
  }
  lightAt();
  function syncWalls(seconds:number){direction.copy(camera.position).sub(controls.target);let moving=false;const scales:number[]=[],targets:number[]=[];
    for(const wall of model.walls){const near=wall.normal.dot(direction)<0,next=wallMode==='full'?1:wallMode==='low'?lowWall/2.8:near?lowWall/2.8:1,tween=wallTransitions.get(wall.group)!,value=tween.step(next,seconds,!wallsInitialized||reducedMotion?.matches);
      if(wall.group.scale.y!==value){wall.group.scale.y=value;renderer.shadowMap.needsUpdate=true;}moving||=tween.moving;scales.push(Number(value.toFixed(4)));targets.push(Number(next.toFixed(4)));
    }wallsInitialized=true;host.dataset.officeWallAnimation=JSON.stringify({moving,mode:wallMode,scales,targets});return moving;
  }
  function labels(){const anchors=[...plan.desks.map(([x,z],index)=>({x,y:1.42,z,index})),{x:plan.entry[0],y:1.8,z:plan.entry[1]+.15,index:-1}];const list=anchors.map(({x,y,z,index})=>{const p=new THREE.Vector3(x,y,z).project(camera);return{index,x:Math.round((p.x+1)*5000)/100,y:Math.round((1-p.y)*5000)/100,visible:p.z<1&&p.z>-1&&Math.abs(p.x)<.98&&Math.abs(p.y)<.95};});const next=JSON.stringify(list);if(next!==labelSignature){labelSignature=next;onLabels(list);}}
  function draw(now=performance.now()){frame=0;if(disposed||warming)return;if(sceneRenderIsCovered(host)){lastFrame=0;request();return;}const seconds=lastFrame?Math.min(.1,Math.max(0,(now-lastFrame)/1000)):1/60;lastFrame=now;const moving=controls.update();clampCamera();const wallsMoving=syncWalls(seconds);pipeline.render();labels();host.dataset.officeCamera=JSON.stringify({eye:camera.position.toArray(),target:controls.target.toArray()});host.dataset.officeDrawCalls=String(renderer.info.render.calls);host.dataset.officeTriangles=String(renderer.info.render.triangles);if(readiness.rendered(width,height)&&!host.dataset.officeReadyMs)host.dataset.officeReadyMs=String(Math.round(performance.now()-started));if(moving||wallsMoving)request();else lastFrame=0;}
  function resize(){if(disposed)return;const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight),r=scenePixelRatio(quality,w,h,renderScale,resolution,displayPixelScale(host),renderer.capabilities.maxTextureSize);if(w===width&&h===height&&r===ratio)return;const first=!width;width=w;height=h;ratio=r;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setPixelRatio(r);renderer.setSize(w,h);pipeline.resize(w,h);host.dataset.officeQuality=JSON.stringify({resolution,renderScale,pixelRatio:r,buffer:[renderer.domElement.width,renderer.domElement.height]});if(first)reset();request();}
  const observer=new ResizeObserver(resize);observer.observe(host);window.addEventListener('resize',resize);resize();controls.addEventListener('change',request);reducedMotion?.addEventListener?.('change',request);
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down:[number,number]=[0,0];
  const press=(e:PointerEvent)=>{down=[e.clientX,e.clientY];};
  const choose=(e:PointerEvent)=>{if(e.button!==0)return;if(Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(model.pickables(),true)[0];if(hit){if(hit.instanceId!==undefined&&hit.object.userData.officeSeats){onChoose(hit.object.userData.officeSeats[hit.instanceId]);return;}let target:THREE.Object3D|null=hit.object;while(target&&target.userData.seat===undefined)target=target.parent;if(target)onChoose(target.userData.seat);}};
  renderer.domElement.addEventListener('pointerdown',press);renderer.domElement.addEventListener('pointerup',choose);
  void(async()=>{try{await checkpoint(true);await model.prepare(checkpoint);if(disposed)return;syncWalls(0);await pipeline.warmup();await checkpoint(true);if(disposed)return;warming=false;readiness.assetsReady();renderer.shadowMap.needsUpdate=true;request();}catch(error){if(!disposed)readiness.fail(error);}})();
  return{ready:readiness.promise,
    update(seats:OfficeSeat[],hour:number,weather:WeatherId='sunny',month=9){if(disposed)return;const changed=model.update(seats),lit=lightAt(hour,weather,month);if(changed){pipeline.invalidateContacts();renderer.shadowMap.needsUpdate=true;}if(changed||lit)request();},
    rotate(angle:number){const offset=camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),angle);camera.position.copy(controls.target).add(offset);renderer.shadowMap.needsUpdate=true;controls.update();request();},reset(){reset();request();},
    setWalls(mode:HomeWallMode,height=.85){if(wallMode===mode&&lowWall===height)return;wallMode=mode;lowWall=height;renderer.shadowMap.needsUpdate=true;request();},
    setQuality(mode:QualityMode){const next=sceneQuality(mode);if(next.id===quality.id)return;quality=next;pipeline.dispose();pipeline=createScenePipeline(renderer,scene,camera,[],quality);pipeline.setContactObjects(contactObjects);sun.shadow.mapSize.setScalar(quality.shadowSize);sun.shadow.map?.dispose();sun.shadow.map=null;renderer.shadowMap.needsUpdate=true;ratio=0;resize();},
    setResolution(scale:number,mode:RenderResolution='auto'){if(scale===renderScale&&mode===resolution)return;renderScale=scale;resolution=mode;resize();},
    dispose(){if(disposed)return;disposed=true;readiness.cancel();cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',resize);renderer.domElement.removeEventListener('pointerdown',press);renderer.domElement.removeEventListener('pointerup',choose);controls.removeEventListener('change',request);reducedMotion?.removeEventListener?.('change',request);wallTransitions.clear();controls.dispose();pipeline.dispose();model.dispose();sun.shadow.map?.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();delete host.dataset.officeLighting;delete host.dataset.officeBuilding;delete host.dataset.officeCameraLimits;delete host.dataset.officeWallAnimation;},
  };
}
