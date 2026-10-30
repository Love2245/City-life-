import manifest from '../assets/mobile-stills/home/manifest.json';
import {createStillScene,projectStillWorld,type StillLayer,type StillFrame} from './stillScene';
import {stillWeatherFilter} from './stillWeather';
import {photographLight} from './stillContactShadows';
import type {HomeRoomState,HomeRoomView,HomeRoomLabel} from './homeRoomState';
import type {HomePlan,HomeObjectKind} from '../game/core/homeInterior';
import {homeLightScheme} from '../game/core/homeLighting';
import {defaultHomeDecor} from '../game/core/homeDecor';
import {homeCatNestPlacement,homePetSpots,type HomeObstacle} from './homePetPlacement';

interface ImagePart {src:string;depthSrc?:string;x:number;y:number;width:number;height:number}
interface ObjectRecord {sprite:ImagePart|null;fittings:ImagePart|null;origin:number[];bounds:HomeObstacle}
interface PetRecord {sprite:ImagePart|null;origin:number[];rotation?:number;scale:number}
interface HomeStillAngle {hitSrc?:string;hitIds?:string[];weatherBackground?:Record<string,ImagePart>;weatherBase?:Record<string,ImagePart>;matrix:number[];yaw:number;base?:ImagePart;background?:ImagePart;floor:Record<string,ImagePart>;walls:Record<string,ImagePart>;foreground?:Record<string,ImagePart|null>;sprites:Record<string,ObjectRecord>;pets:Record<string,PetRecord>}
interface HomeStillData {id:string;fixed:boolean;width:number;height:number;views:HomeStillAngle[]}
const data=manifest as unknown as {aliases:Record<string,string>;homes:Record<string,HomeStillData>};
const urls=import.meta.glob('/src/assets/mobile-stills/home/**/*.{webp,png}',{eager:true,query:'?url',import:'default'})as Record<string,string>;
const url=(src:string)=>urls['/src/assets/mobile-stills/home/'+src]??'';
export const homeStillResidenceIds=Object.keys(data.aliases);
export function homeStillDataFor(id:string):HomeStillData|undefined{return data.homes[data.aliases[id]??id];}
function partLayer(part:ImagePart|null|undefined,dx=0,dy=0,depth=0,scale=1,origin?:{x:number;y:number}):StillLayer|undefined{
  if(!part||!url(part.src))return;
  return {src:url(part.src),depthSrc:part.depthSrc?url(part.depthSrc):undefined,x:origin?origin.x+(part.x-origin.x)*scale+dx:part.x+dx,y:origin?origin.y+(part.y-origin.y)*scale+dy:part.y+dy,width:part.width*scale,height:part.height*scale,depth};
}
/** Pure metadata composition: saves alter the photograph layers, never a WebGL scene. */
export function composeHomeStill(plan:HomePlan,state:HomeRoomState,angle:number){
  const home=homeStillDataFor(plan.residenceId??'' );if(!home)throw new Error('Missing mobile home still: '+plan.residenceId);
  const view=home.views[((angle%4)+4)%4],project=(p:number[])=>projectStillWorld(p,view.matrix,home.width,home.height),layers:StillLayer[]=[],blocked:HomeObstacle[]=[],petHits:{uid?:string;x:number;y:number;width:number;height:number}[]=[];
  const add=(p:StillLayer|undefined)=>{if(p)layers.push(p);};
  const finishes=state.decor??defaultHomeDecor(home.id),base=home.fixed?(view.weatherBase?.[state.weather]??view.base!):(view.weatherBackground?.[state.weather]??view.background??view.floor[finishes.floor.id]??Object.values(view.floor)[0]);
  if(!base)throw new Error('Missing mobile home background: '+home.id);
  const bed=state.objects.find(o=>o.kind==='bed')?.position??plan.anchors.bed!.position,center=project([bed[0]-.1,.62,bed[1]+.45]),ppm=home.width/2*Math.hypot(view.matrix[0]!,view.matrix[4]!,view.matrix[8]!),distance=plan.openKitchen?4.6:3.45;
  const frame:StillFrame={src:url(base.src),depthSrc:!home.fixed&&base.depthSrc?url(base.depthSrc):undefined,width:home.width,height:home.height,background:'#718477',fit:'cover',camera:{key:`${home.id}:${angle}`,center:[center.x,center.y],viewHeight:2*Math.hypot(distance,distance*.91)*Math.tan(57*Math.PI/360)*ppm}};
  if(!home.fixed){
    if(view.background)add(partLayer(view.floor[finishes.floor.id]??Object.values(view.floor)[0],0,0,9999));
    add(partLayer(view.walls[finishes.wall.id]??Object.values(view.walls)[0],0,0,10000));
    add(partLayer(view.foreground?.[finishes.wall.id]??Object.values(view.foreground??{})[0],0,0,-10000));
    for(const object of state.objects){
      const anchor=plan.anchors[object.kind],alternate=!!anchor&&anchor.alternativeRotation!==undefined&&Math.abs((object.rotation??0)-anchor.alternativeRotation)<.0001&&Math.abs((anchor.rotation??0)-anchor.alternativeRotation)>.0001;
      const record=view.sprites[`${object.kind}:${object.item??'none'}:${alternate?1:0}`]??view.sprites[`${object.kind}:${object.item??'none'}:0`]??view.sprites[`${object.kind}:none:0`];if(!record)continue;
      const from=project(record.origin),to=project([object.position[0],0,object.position[1]]),dx=to.x-from.x,dy=to.y-from.y,wx=object.position[0]-record.origin[0],wz=object.position[1]-record.origin[2];
      const sprite=partLayer(record.sprite,dx,dy,to.depth);if(sprite)sprite.hitId=object.kind;if(sprite)sprite.depthShift=((to.depth??0)-(from.depth??0))/2*65534;add(sprite);const fitting=partLayer(record.fittings,0,0,project(record.origin).depth);if(fitting)fitting.hitId=object.kind;add(fitting);
      if(record.sprite)blocked.push({min:[record.bounds.min[0]+wx,record.bounds.min[1],record.bounds.min[2]+wz],max:[record.bounds.max[0]+wx,record.bounds.max[1],record.bounds.max[2]+wz]});
    }
    const cats=state.cats??[],small=plan.id==='studio',scale=small?(cats.length>2?.58:.68):1,radius=.56*scale,bed=state.catItems?.find(i=>i.kind==='bed')?.item??'cat_bed_basic',awake=homeLightScheme(state.hour,state.month,'sunny').daylight<.06;
    for(const cat of cats){
      const position=homeCatNestPlacement(plan,radius,blocked);if(!position)continue;
      const record=view.pets[`${cat.catId}:${bed}:${awake}`]??view.pets[`orange:${bed}:${awake}`];if(!record?.sprite)continue;
      const p=position.position,from=project(record.origin),to=project([p[0],0,p[1]]),layer=partLayer(record.sprite,to.x-from.x,to.y-from.y,to.depth,scale/record.scale,from);if(layer){layer.hitId='cat:'+cat.uid;layer.depthScale=scale/record.scale;layer.depthShift=(to.depth!+1)/2*65534-(from.depth!+1)/2*65534*layer.depthScale;}add(layer);if(layer)petHits.push({uid:cat.uid,x:layer.x,y:layer.y,width:layer.width,height:layer.height});
      blocked.push({min:[p[0]-radius,0,p[1]-radius],max:[p[0]+radius,1.2*scale,p[1]+radius]});
    }
    const supplies=cats.length?[{kind:'bowls'},{kind:'litter'},...(state.catItems??[]).filter(i=>i.kind!=='bed')]:[];
    for(const item of supplies){const record=view.pets[`${item.kind}:${'item'in item?item.item??'none':'none'}`];if(!record?.sprite)continue;
      const itemScale=small?.68:1,r=(item.kind==='toy'&&'item'in item&&item.item==='cat_toy_basic'?.13:item.kind==='toy'?.3:.35)*itemScale;let points=homePetSpots(plan,r,blocked,item.kind==='litter');if(item.kind==='litter'){const bath=plan.rooms.find(r=>r.type==='bath');if(bath)points=points.sort((a,b)=>Math.hypot(a[0]-bath.rect[0],a[1]-bath.rect[1])-Math.hypot(b[0]-bath.rect[0],b[1]-bath.rect[1]));}const p=points[0];if(!p)continue;
      const from=project(record.origin),to=project([p[0],0,p[1]]),layer=partLayer(record.sprite,to.x-from.x,to.y-from.y,to.depth,itemScale/record.scale,from);if(layer){layer.hitId='cat:';layer.depthScale=itemScale/record.scale;layer.depthShift=(to.depth!+1)/2*65534-(from.depth!+1)/2*65534*layer.depthScale;}add(layer);if(layer)petHits.push({x:layer.x,y:layer.y,width:layer.width,height:layer.height});blocked.push({min:[p[0]-r,0,p[1]-r],max:[p[0]+r,1,p[1]+r]});
    }
  }
  const labels=state.objects.map(object=>({kind:object.kind,...project([object.position[0],object.kind==='door'?.8:.65,object.position[1]])}));
  if(base.depthSrc)frame.depthSrc=url(base.depthSrc);
  if(home.fixed&&view.hitSrc){frame.hitSrc=url(view.hitSrc);frame.hitIds=view.hitIds;}
  const depthRange=199.99;
  frame.contactShadows={pixelsPerMeter:ppm,depthRange,strength:.3,radius:.34,light:photographLight(view.matrix,home.width,home.height,ppm,depthRange)};
  return {frame,layers,labels,petHits};
}
export function createHomeStillView(host:HTMLElement,plan:HomePlan,onLabels:(labels:HomeRoomLabel[])=>void,onPick:(kind:HomeObjectKind)=>void,onPetPick?:(uid?:string)=>void):HomeRoomView{
  let angle=0,state:HomeRoomState|undefined,disposed=false,run=0,lastComposition:ReturnType<typeof composeHomeStill>|undefined;
  let failInitial!:(error:unknown)=>void;const initialFailure=new Promise<never>((_,reject)=>{failInitial=reject;});void initialFailure.catch(()=>{});
  const scene=createStillScene(host,{onLayout(){labels();},onRotate(direction){angle=((angle+direction)%4+4)%4;void paint();},onClick(x,y){const id=scene.objectAt(x,y);if(id?.startsWith('cat:'))onPetPick?.(id.slice(4)||undefined);else if(state?.objects.some(o=>o.kind===id))onPick(id as HomeObjectKind);},onError(error){host.dataset.homeStillError=String(error);}});
  host.dataset.homeRenderer='stills';host.dataset.homeView='0';
  function labels(){if(!lastComposition||disposed)return;host.dataset.stillAnchors=JSON.stringify(lastComposition.labels);onLabels(lastComposition.labels.map(p=>({kind:p.kind,...scene.imageToHost(p.x,p.y)})));}
  async function paint(){
    if(!state||disposed)return;
    const own=++run,nextAngle=angle,nextState=state;
    try{
      const composition=composeHomeStill(plan,nextState,nextAngle),committed=await scene.update(composition.frame,composition.layers);
      if(disposed||own!==run||!committed)return;
      lastComposition=composition;
      const light=homeLightScheme(nextState.hour,nextState.month,nextState.weather,nextState.lightMode);
      scene.canvas.style.filter=light.daylight<.06?`brightness(${light.lamps?.72:.34}) saturate(.8)`:stillWeatherFilter(nextState.weather);
      const photo=homeStillDataFor(plan.residenceId!)!.views[nextAngle]!;host.dataset.stillSurfaceWeather=(photo.weatherBase??photo.weatherBackground)?.[nextState.weather]?nextState.weather:'dry';host.dataset.homeView=String(nextAngle);host.dataset.homeLayerCount=String(composition.layers.length);labels();
    }catch(error){
      if(disposed||own!==run)return;
      failInitial(error);host.dataset.homeStillError=String(error);host.dispatchEvent(new CustomEvent('scene-context-lost',{bubbles:true}));console.error('Home still unavailable',error);
    }
  }
  return {ready:Promise.race([scene.ready,initialFailure]),update(next){state=next;void paint();},rotate(radians){angle=((angle+(radians<0?-1:1))%4+4)%4;void paint();},focus(x,z){if(lastComposition){const home=homeStillDataFor(plan.residenceId!)!,p=projectStillWorld([x,.62,z],home.views[angle]!.matrix,home.width,home.height);scene.centerOn(p.x,p.y);}},zoom(factor){scene.zoom(1/factor);},resetView(){scene.resetView();},setWalls(){},select(){},hover(){},dispose(){disposed=true;run++;scene.dispose();}};
}
