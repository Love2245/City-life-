import {buildCompanyDistrict} from './companyDistrict';
import {createCompanyCorridorArt} from './companyCorridorArt';
import * as THREE from 'three';
import {OFFICE_ADDRESSES,officeBuildingFootprint,type OfficePlan} from '../game/core/companyOffice';
import type {OfficeLightScheme} from './officeLighting';

/** Shared-floor shells and finishes remain outside the player's original office footprint. */
export function buildOfficeSurroundings(plan:OfficePlan){
  const root=new THREE.Group();root.name='office-building-context';
  const district=buildCompanyDistrict(plan),art=createCompanyCorridorArt(plan.stage);root.add(district.root);
  const address=OFFICE_ADDRESSES[plan.stage-1]!;root.userData.address=address;
  const walls:{group:THREE.Group;normal:THREE.Vector3}[]=[],lamps:THREE.MeshStandardMaterial[]=[];
  const [width,depth]=plan.size,f=officeBuildingFootprint(plan);
  function wall(parent:THREE.Object3D,name:string,x:number,z:number,w:number){const group=art.wall(parent,name,x,z,w);walls.push({group,normal:new THREE.Vector3(0,0,-1)});return group;}
  if(plan.stage<4){
    const suites=new THREE.Group();suites.name='neighbour-office-shells';suites.userData.opaqueCeilings=true;root.add(suites);const sideShells=new Map<string,THREE.Group>();
    for(const[name,x,z,w,d,normal]of [['west',-3,depth/2,6,depth,new THREE.Vector3(1,0,0)],['east',width+3,depth/2,6,depth,new THREE.Vector3(-1,0,0)],['opposite',width/2,depth+6.5,f.width,7,new THREE.Vector3(0,0,-1)]]as const){
      const shell=new THREE.Group();shell.name=name+'-enclosed-suite';suites.add(shell);sideShells.set(name,shell);
      art.surface(shell,name+'-opaque-room',x,1.39,z,w,2.78,d,'wallpaper',.45);art.surface(shell,name+'-office-ceiling',x,2.83,z,w+.04,.12,d+.04,'ceiling',.6);walls.push({group:shell,normal});
    }
    // A neighbouring suite also occupies recesses in an L-shaped office boundary.
    const xs=[...new Set(plan.outline.map(p=>p[0]))].sort((a,b)=>a-b),zs=[...new Set(plan.outline.map(p=>p[1]))].sort((a,b)=>a-b);
    let infill=0;
    for(let xi=0;xi<xs.length-1;xi++)for(let zi=0;zi<zs.length-1;zi++){
      const x=(xs[xi]!+xs[xi+1]!)/2,z=(zs[zi]!+zs[zi+1]!)/2;let inside=false;
      for(let i=0,j=plan.outline.length-1;i<plan.outline.length;j=i++){
        const[a,b]=plan.outline[i]!,[c,d]=plan.outline[j]!;
        if((b>z)!==(d>z)&&x<(c-a)*(z-b)/(d-b)+a)inside=!inside;
      }
      if(inside)continue;
      const shell=sideShells.get(x>width/2?'east':'west')!,w=xs[xi+1]!-xs[xi]!,d=zs[zi+1]!-zs[zi]!;
      art.surface(shell,'neighbour-corner-infill-'+infill,x,1.39,z,w,2.78,d,'wallpaper',.45);
      art.surface(shell,'neighbour-corner-ceiling-'+infill,x,2.83,z,w,.12,d,'ceiling',.6);infill++;
    }
  }
  const framingBounds=new THREE.Box3(new THREE.Vector3(-.45,-.25,-.25),new THREE.Vector3(width+.45,3.1,depth+(plan.stage===4?2.05:3.05)));
  if(plan.stage<4){
    const corridor=new THREE.Group();corridor.name=plan.stage===3?'highrise-arrival-lobby':'shared-office-corridor';root.add(corridor);const far=depth+2.86;
    art.surface(corridor,'corridor-floor',width/2,-.055,depth+1.46,f.width,.1,2.92,'floor',.6);
    for(const z of [depth+.12,depth+2.76])art.box(corridor,'corridor-floor-border',width/2,.003,z,f.width,.014,.075,art.accent);
    for(const x of [f.minX+.12,f.maxX-.12])art.box(corridor,'corridor-floor-end-border',x,.004,depth+1.46,.075,.014,2.68,art.accent);
    if(plan.stage<=2){
      const doorWidth=2.04,doorXs=[width*.16,width*.5,width*.84],edges=[f.minX,...doorXs.flatMap(x=>[x-doorWidth/2,x+doorWidth/2]),f.maxX];
      for(let i=0;i<edges.length-1;i+=2)wall(corridor,'corridor-wall-'+i,(edges[i]!+edges[i+1]!)/2,far,edges[i+1]!-edges[i]!);
      for(const[i,x]of doorXs.entries()){
        const group=art.door(corridor,'neighbour-company-'+i,x,far,`${address.floor}0${i+1}`,['青禾设计','云间科技','木石工作室'][i]!);group.userData.followsWall=true;walls.push({group,normal:new THREE.Vector3(0,0,-1)});
      }
      art.elevator(corridor,'shared-floor-elevator',f.minX+2.1,far-.1,address.floor);art.noticeBoard(corridor,width+3.1,far-.2,address.floor);
      art.fireStation(corridor,'corridor-fire-station',width+.8,far-.25);art.bench(corridor,width+3.1,depth+.48);
      if(plan.stage===2)art.waterStation(corridor,f.maxX-.65,far-.4);else art.planter(corridor,f.maxX-.65,far-.45);
      art.sign(corridor,'own-office-number',address.room,plan.entry[0]+.98,1.65,depth+.105,.58);
    }else{
      const back=wall(corridor,'highrise-lobby-wall',width/2,far,f.width);
      for(const[i,x]of [width*.23,width*.77].entries())art.elevator(corridor,'highrise-shared-lift-'+i,x,far-.1,address.floor);
      art.noticeBoard(corridor,width/2,far-.2,address.floor);art.fireStation(corridor,'highrise-fire-station',width/2-1.55,far-.25);
      art.bench(corridor,width+2.9,far-.5);art.planter(corridor,width+4.2,far-.5);art.waterStation(corridor,-3.8,far-.45);
      art.sign(back,'highrise-floor-directory',`${address.floor}F · 商务办公`,0,2.48,-.11,1.8);art.sign(corridor,'large-office-room-number',address.room,plan.entry[0]+1,1.65,depth+.105,.72);
    }
    const sideEntries=new THREE.Group();sideEntries.name='same-side-office-entries';corridor.add(sideEntries);
    const westDoor=art.door(sideEntries,'side-company-west',-3,depth+.09,`${address.floor}04`,plan.stage===1?'微光创客':'拾光咨询',Math.PI),eastDoor=art.door(sideEntries,'side-company-east',width+3,depth+.09,`${address.floor}05`,plan.stage===1?'知行工作室':'川流传媒',Math.PI);
    westDoor.userData.followsWall=eastDoor.userData.followsWall=true;walls.push({group:westDoor,normal:new THREE.Vector3(1,0,0)},{group:eastDoor,normal:new THREE.Vector3(-1,0,0)});
    const diffuser=new THREE.MeshStandardMaterial({color:'#fff4d9',emissive:'#fff1cc',emissiveIntensity:.35,roughness:.9});lamps.push(diffuser);
    for(const x of [width*.24,width*.74]){art.box(corridor,'corridor-light-rail',x,2.81,depth+1.4,2,.055,.24,'#6f7b75');art.box(corridor,'corridor-light-diffuser',x,2.775,depth+1.4,1.9,.02,.18,diffuser);}
  }else{
    const cabin=new THREE.Group();cabin.name='private-floor-elevator-cabin';cabin.position.set(plan.entry[0],0,plan.entry[1]);root.add(cabin);art.surface(cabin,'lift-cabin-floor',0,-.04,.95,1.65,.09,1.95,'floor',.45);
    const back=wall(cabin,'lift-cabin-back-wall',0,1.9,1.75);
    for(const side of [-1,1]){const group=new THREE.Group();group.name='lift-cabin-side-wall';group.position.x=side*.85;cabin.add(group);art.surface(group,'lift-cabin-side',0,1.25,.97,.1,2.5,1.85,'steel',.75);walls.push({group,normal:new THREE.Vector3(-side,0,0)});art.box(cabin,'lift-cabin-handrail',side*.78,.95,.95,.045,.045,1.55,'#e1e6de');}
    art.box(cabin,'lift-cabin-mirror-panel',0,1.45,1.835,1.3,1.3,.02,'#90a8aa');const panel=art.callPanel(cabin,'lift-cabin-control-panel',.77,1.24,.9);panel.rotation.y=Math.PI/2;art.sign(back,'lift-cabin-floor-number',`${address.floor}F`,0,2.25,-.075,.5);
    const diffuser=new THREE.MeshStandardMaterial({color:'#fff6e0',emissive:'#fff2cd',emissiveIntensity:.35});lamps.push(diffuser);art.box(cabin,'lift-ceiling-light',0,2.5,.35,1.6,.055,.12,diffuser);
  }
  let disposed=false;
  return{root,walls,framingBounds,address,
    setLighting(light:OfficeLightScheme){district.setLighting(light);art.setNight(light.frame==='night');for(const m of lamps)m.emissiveIntensity=light.frame==='night'?.9:.35;},
    dispose(){if(disposed)return;disposed=true;district.dispose();art.dispose();lamps.forEach(m=>m.dispose());root.clear();},
  };
}
