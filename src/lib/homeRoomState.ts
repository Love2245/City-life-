import type { GameState, WeatherId } from '../game/types';
import { currentHomeSceneId, canCustomizeCurrentHome, HOME_FIXED_IDS, fixedHomeObjectKinds, fixedHomeItem, homeSceneObjectItem, homeAnchor, homeObjectAvailable, HOME_FITTINGS, type HomeObjectKind, type HomePlan, type HomePoint, type HomeScale } from '../game/core/homeInterior';
import { HOME_FURNITURE, type HomeFurnitureKind } from '../game/core/homeFurniture';
import { currentWeather } from '../game/core/weather';
import { homeLightMode, type HomeLightMode } from '../game/core/homeLighting';
import { defaultHomeDecor, homeDecorFor, type HomeSurfaceStyle } from '../game/core/homeDecor';
import { availableCatsOf } from '../game/core/catCare';
import type { HomeCat, HomeCatItem } from './homeCatModels';
import type { HomeWallMode } from './homeWallView';
import type { HomeDeviceMode } from './homeQuality';
import type { QualityMode } from './scenePipeline';

export interface HomeRoomObject { kind:HomeObjectKind; position:HomePoint; rotation?:number; item?:string;mirrorX?:boolean;scale?:HomeScale }
export interface HomeRoomState { objects:HomeRoomObject[]; hour:number; month:number; weather:WeatherId; lightMode:HomeLightMode;cats?:HomeCat[];catItems?:HomeCatItem[];activityKey?:string;decor?:{wall:HomeSurfaceStyle;floor:HomeSurfaceStyle} }
export interface HomeRoomLabel { kind:HomeObjectKind; x:number; y:number; visible:boolean }
export interface HomeRoomView {
  ready:Promise<void>;
  update(state:HomeRoomState):void; focus(x:number,z:number,yawHint?:number):void;
  rotate(radians:number):void; zoom(factor:number):void; dispose():void;
  setWalls(mode:HomeWallMode,lowHeight?:number):void; select(kind:HomeObjectKind|null):void; hover(kind:HomeObjectKind|null):void;
  resetView?():void;
  setQuality?(mode:QualityMode,device?:HomeDeviceMode):void;
  setResolution?(scale:number,resolution?:import('./renderResolution').RenderResolution):void; exterior?():void;
}
export function homeRoomState(state:GameState,plan:HomePlan):HomeRoomState {
  const id=currentHomeSceneId(state),customizable=canCustomizeCurrentHome(state);
  return {objects:id?Object.keys(plan.anchors).filter(key=>homeObjectAvailable(state,key as HomeObjectKind)).map(key=>{
    const a=homeAnchor(state,key as HomeObjectKind)!;return {kind:key as HomeObjectKind,position:[...a.position] as HomePoint,rotation:a.rotation,mirrorX:a.mirrorX,scale:a.scale,item:homeSceneObjectItem(state,key as HomeObjectKind)};
  }):[],cats:customizable?availableCatsOf(state).map(({uid,catId,name})=>({uid,catId,name})):[],catItems:customizable?catItemsOf(state):[],activityKey:[state.time.year,state.time.month,state.time.day,state.time.hour,state.time.minute,state.flags.log_sequence??0].join(':'),hour:state.time.hour+state.time.minute/60,month:state.time.month,weather:currentWeather(state),lightMode:homeLightMode(state),decor:customizable?homeDecorFor(state):defaultHomeDecor(id??plan.residenceId??'old_apartment')};
}
function catItemsOf(state:GameState):HomeCatItem[]{
  const items:HomeCatItem[]=[];
  for(const kind of ['bed','toy','train'] as const){const item=['lux','good','basic'].map(tier=>'cat_'+kind+'_'+tier).find(id=>(state.inventory[id]??0)>0);if(item)items.push({kind,item});}
  if((state.inventory.cat_auto_feeder??0)>0)items.push({kind:'device',item:'cat_auto_feeder'});
  return items;
}
/** Gallery data has no game-store reference, contract, clock advancement or save write. */
export function homePreviewRoom(plan:HomePlan,full:boolean,hour:number,lightMode:HomeLightMode='auto',weather:WeatherId='sunny',tier:'basic'|'standard'|'premium'='premium'):HomeRoomState {
  if(plan.residenceId&&HOME_FIXED_IDS.has(plan.residenceId))return {objects:fixedHomeObjectKinds(plan.residenceId).flatMap(kind=>{const a=plan.anchors[kind];return a?[{kind,position:[...a.position] as HomePoint,rotation:a.rotation,mirrorX:a.mirrorX,scale:a.scale,item:fixedHomeItem(plan.residenceId!,kind)}]:[];}),hour,month:9,weather,lightMode,cats:[],catItems:[],decor:defaultHomeDecor(plan.residenceId)};
  return {objects:Object.entries(plan.anchors).filter(([key])=>full||HOME_FITTINGS.has(key as HomeObjectKind)).map(([key,a])=>{
    const family=HOME_FURNITURE[key as HomeFurnitureKind];const index=family?tier==='basic'?0:tier==='standard'?Math.floor((family.items.length-1)/2):family.items.length-1:0;return {kind:key as HomeObjectKind,position:[...a!.position] as HomePoint,rotation:a!.rotation,mirrorX:a!.mirrorX,scale:a!.scale,item:full&&family?family.items[index]:undefined};
  }),hour,month:9,weather,lightMode,decor:defaultHomeDecor(plan.residenceId??(plan.id==='house'?'own_villa':plan.id==='apartment'?'rental_apartment':'old_apartment'))};
}
