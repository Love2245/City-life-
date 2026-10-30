/** Mobile offices use photographs and transparent equipment/person layers only. */
import manifest from '../assets/mobile-stills/company/manifest.json';
import {COMPANY_OFFICES,OFFICE_ADDRESSES,type OfficeSeat} from '../game/core/companyOffice';
import {officeWorkerAppearance} from './companyWorkerAppearance';
import {createStillScene,projectStillWorld,type StillLayer} from './stillScene';
import {photographLight} from './stillContactShadows';
import type {OfficeLabel} from './companyOffice3D';
import type {WeatherId} from '../game/types';
import {officeLightScheme,officeLightingMetadata} from './officeLighting';
import type {QualityMode} from './scenePipeline';

interface Frame {hitSrc?:string;hitIds?:string[];depthSrc?:string;depthRange?:number;src:string;foreground:string;width:number;height:number;matrix:number[];pixelsPerMeter:number;labels:{index:number;x:number;y:number;depth:number}[]}
interface Sprite {depthSrc?:string;depthRange?:number;depthOrigin?:number;src:string;width:number;height:number;anchor:number[];pixelsPerMeter:number}
const data=manifest as unknown as {frames:Record<string,Frame>;sprites:Record<string,Sprite>};
const images=import.meta.glob('../assets/mobile-stills/company/*.{webp,png}',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
function url(file:string){const value=images[`../assets/mobile-stills/company/${file}`];if(!value)throw new Error(`Missing company still: ${file}`);return value;}

export function companyStillComposition(stage:number,angle:number,seats:OfficeSeat[],hour:number,month=9){
  const plan=COMPANY_OFFICES[stage-1]!,frame=data.frames[`${stage}-${angle}-${officeLightScheme(hour,month).frame}`];
  if(!frame)throw new Error('Missing company view');
  const layers:StillLayer[]=[];
  const project=(point:number[])=>projectStillWorld(point,frame.matrix,frame.width,frame.height);
  const add=(key:string,x:number,z:number,depth:number,hitId:string)=>{
    const sprite=data.sprites[key];if(!sprite)throw new Error(`Missing company sprite ${key}`);
    const scale=frame.pixelsPerMeter/sprite.pixelsPerMeter,anchor=project([x,0,z]);
    layers.push({hitId,src:url(sprite.src),x:anchor.x-sprite.anchor[0]!*scale,y:anchor.y-sprite.anchor[1]!*scale,width:sprite.width*scale,height:sprite.height*scale,depth,depthSrc:sprite.depthSrc?url(sprite.depthSrc):undefined,depthScale:(sprite.depthRange??1)/(frame.depthRange??1),depthShift:(anchor.depth!+1)/2*65534-(sprite.depthOrigin??0)*(sprite.depthRange??1)/(frame.depthRange??1)});
  };
  for(const seat of seats){const position=plan.desks[seat.index];if(!position)continue;const[x,z]=position;
    const rotation=plan.deskRotations?.[seat.index]??0,sin=Math.sin(rotation),cos=Math.cos(rotation),spriteAngle=((angle-Math.round(rotation/(Math.PI/2)))%4+4)%4;
    if(seat.tier)add(`pc-${seat.tier}-${spriteAngle}`,x,z,project([x-.12*sin,.8,z-.12*cos]).depth!,String(seat.index));
    if(seat.index>0&&seat.personId&&seat.present){const look=officeWorkerAppearance(seat.index,seat.personId);add(`worker-${look.look}-${look.headgear}-${spriteAngle}`,x,z,project([x+.75*sin,.9,z+.75*cos]).depth!,'employee:'+seat.index);}
  }
  return{frame,layers};
}

export function createCompanyStill(host:HTMLDivElement,stage:number,onLabels:(labels:OfficeLabel[])=>void,onChoose:(index:number)=>void,_quality:QualityMode='auto',_resolution=1,_resolutionMode?:import('./renderResolution').RenderResolution){
  let weather:WeatherId='sunny';
  let angle=0,hour=12,month=9,seats:OfficeSeat[]=[],disposed=false,run=0;
  let active:ReturnType<typeof companyStillComposition>|undefined;
  function publish(){if(!active||disposed)return;host.dataset.stillAnchors=JSON.stringify(active.frame.labels);onLabels(active.frame.labels.map(label=>({index:label.index,...scene.imageToHost(label.x,label.y)})));}
  const scene=createStillScene(host,{onLayout:publish,onRotate(direction){angle=((angle+direction)%4+4)%4;void paint().catch(report);},onClick(x,y){
    const id=scene.objectAt(x,y);if(id!==undefined){onChoose(Number(id.startsWith('employee:')?id.slice(9):id));return;}if(active?.frame.hitSrc)return;
    if(!active)return;
    const nearest=active.frame.labels.map(label=>({index:label.index,distance:Math.hypot(label.x-x,label.y-y)})).sort((a,b)=>a.distance-b.distance)[0];
    if(nearest&&nearest.distance<90)onChoose(nearest.index);
  },onError(error){host.dataset.stillError=String(error);}});
  host.dataset.companyRenderer='stills';host.dataset.officeBuilding=JSON.stringify(OFFICE_ADDRESSES[stage-1]);scene.canvas.setAttribute('aria-label','公司固定视角场景，点击办公桌或门的定位操作');
  const wash=document.createElement('div');wash.dataset.officeLightWash='true';wash.setAttribute('aria-hidden','true');Object.assign(wash.style,{position:'absolute',inset:'0',pointerEvents:'none',mixBlendMode:'soft-light'});host.appendChild(wash);
  function lighting(){const light=officeLightScheme(hour,month,weather);scene.canvas.style.filter=light.filter;wash.style.background=light.wash;host.dataset.officeLighting=officeLightingMetadata(light);}
  const report=(error:unknown)=>{if(disposed)return;host.dataset.stillError=String(error);host.dispatchEvent(new CustomEvent('scene-context-lost',{bubbles:true}));console.error('Company still unavailable',error);};
  async function paint(){if(disposed)return;lighting();const generation=++run,composition=companyStillComposition(stage,angle,seats,hour,month);
    const f=composition.frame,depthRange=f.depthRange??199.9,night=officeLightScheme(hour,month).frame==='night';
    const committed=await scene.update({src:url(f.src),hitSrc:f.hitSrc?url(f.hitSrc):undefined,hitIds:f.hitIds,depthSrc:f.depthSrc?url(f.depthSrc):undefined,contactShadows:{pixelsPerMeter:f.pixelsPerMeter,depthRange,strength:.27,radius:.32,light:photographLight(f.matrix,f.width,f.height,f.pixelsPerMeter,depthRange)},foreground:f.depthSrc?undefined:url(f.foreground),width:f.width,height:f.height,fit:'cover',camera:{key:`company-${stage}-${angle}`,center:[f.width/2,f.height/2],viewHeight:f.height*.7},background:night?'#122039':'#c6ceca',photographBackground:night?[18,32,57]:undefined},composition.layers);
    if(disposed||generation!==run||!committed)return;
    active=composition;lighting();host.dataset.companyStillAngle=String(angle);publish();
  }
  return{ready:scene.ready,
    update(next:OfficeSeat[],time:number,nextWeather:WeatherId='sunny',nextMonth=9){if(disposed)return;seats=next;hour=time;weather=nextWeather;month=nextMonth;void paint().catch(report);},
    rotate(radians:number){angle=((angle+Math.round(radians/(Math.PI/2)))%4+4)%4;void paint().catch(report);},
    zoom(factor:number){scene.zoom(1/factor);},resetView(){scene.resetView();},
    reset(){scene.resetView();angle=0;void paint().catch(report);},setWalls(_mode?:string,_height?:number){},setQuality(_mode?:QualityMode){},setResolution(_scale?:number,_resolutionMode?:import('./renderResolution').RenderResolution){},
    dispose(){if(disposed)return;disposed=true;run++;scene.dispose();wash.remove();delete host.dataset.companyRenderer;delete host.dataset.companyStillAngle;delete host.dataset.officeLighting;delete host.dataset.officeBuilding;},
  };
}
