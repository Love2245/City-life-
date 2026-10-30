import {stillWeatherFilter} from './stillWeather';
import {createStillScene,type StillLayer} from './stillScene';
import manifest from '../assets/mobile-stills/venues/manifest.json';
import {STORE_FACILITIES,isStoreFacilityInteractive,type StoreFacilityId,type StoreFacilitySelection} from './convenienceStore/facilities';
import {CAFE_FACILITIES,isCafeFacilityInteractive,type CafeFacilityId,type CafeFacilitySelection} from './cafeRoom/facilities';
import type {StoreRoomOptions} from './convenienceStore3D';
import type {CafeRoomOptions} from './cafeRoom3D';
import type {SceneNameLabel} from './sceneLabels';
import type {WeatherId} from '../game/types';

type Selection={id:string;title:string;zone:string;x:number;y:number;visible:boolean};
type Point={id:string;x:number;y:number;visible:boolean};
type Frame={hitSrc?:string;hitIds?:string[];file:string;width:number;height:number;points?:Point[];rect?:{x:number;y:number;width:number;height:number}};
const frames=manifest.views as Record<string,Frame>;
const images=import.meta.glob('../assets/mobile-stills/venues/*.{webp,png}',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const image=(file:string)=>{const url=images[`../assets/mobile-stills/venues/${file}`];if(!url)throw Error(`Missing still image ${file}`);return url;};
function createVenueStill(host:HTMLDivElement,venue:'store'|'cafe',options:{night?:boolean;weather?:WeatherId;linPresent?:boolean;onSelect?:(selection:Selection|null)=>void;onProject?:(selection:Selection)=>void;onLabels?:(labels:SceneNameLabel[])=>void}){
  let angle=0,night=options.night??false,linPresent=options.linPresent??false,weather=options.weather??'sunny',doorOpen=false,selected:string|null=null,disposed=false,generation=0;
  // A requested view can still be decoding. Keep its hotspots and NPC state
  // separate from the complete photograph currently visible to the player.
  let displayed:{frame:Frame;angle:number;night:boolean;linPresent:boolean;weather:WeatherId;doorOpen:boolean}|undefined;
  const definitions:Record<string,{title:string;zone:string}>=venue==='store'?STORE_FACILITIES:CAFE_FACILITIES;
  const interactive=(id:string)=>venue==='store'?isStoreFacilityInteractive(id as StoreFacilityId):isCafeFacilityInteractive(id as CafeFacilityId);
  const current=()=>{const key=`${venue}-${angle}-${night?'night':'day'}-${doorOpen?'open':'closed'}`;return frames[key+'-'+weather]??frames[key]!;};
  function available(point:Point){return interactive(point.id)&&(point.id!=='lin'||displayed?.linPresent)&&point.visible;}
  function selection(id:string):Selection|undefined{const point=displayed?.frame.points?.find(point=>point.id===id&&available(point));if(!point)return;return{id,...definitions[id]!,...scene.imageToHost(point.x,point.y)};}
  function publish(){if(disposed||!displayed)return;host.dataset.stillAnchors=JSON.stringify(displayed.frame.points);const labels=(displayed.frame.points??[]).filter(available).map(point=>({id:point.id,title:definitions[point.id]!.title,...scene.imageToHost(point.x,point.y)}));options.onLabels?.(labels);if(selected){const value=selection(selected);if(value)options.onProject?.(value);else{selected=null;options.onSelect?.(null);}}const{frame:_frame,...state}=displayed;host.dataset.venueStill=JSON.stringify({venue,...state});}
  const scene=createStillScene(host,{onLayout:publish,onRotate(direction){angle=((angle+direction)%4+4)%4;void refresh().catch(report);},onClick(x,y){const id=scene.objectAt(x,y);if(id){selectFacility(id);return;}if(displayed?.frame.hitSrc){selectFacility(null);return;}const match=(displayed?.frame.points??[]).filter(available).map(point=>({point,distance:Math.hypot(point.x-x,point.y-y)})).filter(hit=>hit.distance<100).sort((a,b)=>a.distance-b.distance)[0];selectFacility(match?.point.id??null);}});
  const film=document.createElement('div');film.dataset.stillWeather='true';Object.assign(film.style,{position:'absolute',inset:'0',pointerEvents:'none'});host.append(film);host.dataset.mobileScene='still';scene.canvas.setAttribute('aria-label',`${venue==='store'?'便利店':'咖啡厅'}固定视角场景，直接点击设施互动，左键拖动，右键切换方向`);
  async function refresh(){if(disposed)return;const run=++generation,frame=current(),next={frame,angle,night,linPresent,weather,doorOpen},layers:StillLayer[]=[];
    if(venue==='cafe'){const layer=frames[`cafe-${angle}-${night?'night':'day'}-${linPresent?'lin':'stool'}`];if(layer?.rect)layers.push({hitId:linPresent?'lin':undefined,src:image(layer.file),...layer.rect});}
    const committed=await scene.update({src:image(frame.file),hitSrc:frame.hitSrc?image(frame.hitSrc):undefined,hitIds:frame.hitIds,width:frame.width,height:frame.height,fit:'cover',camera:{key:`${venue}-${angle}`,center:[frame.width/2,frame.height*.51],viewHeight:frame.height*.65},background:night?'#172a30':'#c1d0cc'},layers);
    if(!committed||disposed||run!==generation)return;
    displayed=next;host.dataset.stillSurfaceWeather=frame.file.endsWith('-rain.webp')?'rain':frame.file.endsWith('-snow.webp')?'snow':'dry';scene.canvas.style.filter=stillWeatherFilter(next.weather);delete host.dataset.stillError;
    film.style.background=next.weather==='cloudy'?'#a9bbce0c':'transparent';publish();
  }
  function selectFacility(id:string|null){if(id===null){selected=null;options.onSelect?.(null);return true;}const value=selection(id);if(!value)return false;selected=id;options.onSelect?.(value);return true;}
  // The initial failure reaches the existing loading cover through ready;
  // later failures use the same retry/flat-scene event as desktop context loss.
  const report=(error:unknown)=>{if(disposed)return;host.dataset.stillError=String(error);if(displayed)host.dispatchEvent(new CustomEvent('scene-context-lost',{bubbles:true}));console.error('Venue still unavailable',error);};
  const initial=refresh();void initial.catch(report);
  return{ready:Promise.all([initial,scene.ready]).then(()=>{}),
    update(state:{night:boolean;weather?:WeatherId;linPresent?:boolean}){const nextLin=state.linPresent??linPresent,nextWeather=state.weather??weather;if(state.night===night&&nextLin===linPresent&&nextWeather===weather)return;night=state.night;linPresent=nextLin;weather=nextWeather;void refresh().catch(report);},
    selectFacility,rotate(radians:number){angle=((angle+Math.round(radians/(Math.PI/2)))%4+4)%4;void refresh().catch(report);},
    zoom(factor:number){scene.zoom(1/factor);},resetView(){scene.resetView();},
    toggleDoor(){doorOpen=!doorOpen;void refresh().catch(report);},setQuality(){},setResolution(){},
    dispose(){if(disposed)return;disposed=true;generation++;scene.dispose();film.remove();delete host.dataset.mobileScene;delete host.dataset.venueStill;},
  };
}
export function createStoreStill(host:HTMLDivElement,options:StoreRoomOptions={}){return createVenueStill(host,'store',{...options,onSelect:selection=>options.onSelect?.(selection as StoreFacilitySelection|null),onProject:selection=>options.onProject?.(selection as StoreFacilitySelection)});}
export function createCafeStill(host:HTMLDivElement,options:CafeRoomOptions={}){return createVenueStill(host,'cafe',{...options,onSelect:selection=>options.onSelect?.(selection as CafeFacilitySelection|null),onProject:selection=>options.onProject?.(selection as CafeFacilitySelection)});}
