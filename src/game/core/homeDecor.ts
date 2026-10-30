import type {GameState} from '../types';
import {HOME_ALIASES} from './homeAliases';
import {formalHomeId,HOME_FORMAL_IDS} from './homeInterior';

export type HomeSurface='wall'|'floor';
export type HomeSurfacePattern='plaster'|'linen'|'stripe'|'oak'|'walnut'|'vinyl'|'stone'|'woven';
export interface HomeSurfaceStyle {id:string;name:string;surface:HomeSurface;color:string;detail:string;pattern:HomeSurfacePattern}
export const HOME_DECOR_CATALOG:readonly HomeSurfaceStyle[]=[
  {id:'home_wall_ivory',name:'暖白素色墙纸',surface:'wall',color:'#e5ded0',detail:'#d0c5b5',pattern:'plaster'},
  {id:'home_wall_sage',name:'浅绿细纹墙纸',surface:'wall',color:'#c1cbb8',detail:'#acb69e',pattern:'stripe'},
  {id:'home_wall_blue',name:'雾蓝织纹墙纸',surface:'wall',color:'#b9c8cd',detail:'#a5b7bd',pattern:'linen'},
  {id:'home_wall_linen',name:'米杏亚麻墙纸',surface:'wall',color:'#d8c9b0',detail:'#bfb096',pattern:'linen'},
  {id:'home_floor_oak',name:'浅橡木地板贴',surface:'floor',color:'#c1a47c',detail:'#90704a',pattern:'oak'},
  {id:'home_floor_walnut',name:'胡桃木地板贴',surface:'floor',color:'#8b6951',detail:'#634a37',pattern:'walnut'},
  {id:'home_floor_stone',name:'暖灰拼接地垫',surface:'floor',color:'#b8b6aa',detail:'#95958b',pattern:'stone'},
  {id:'home_floor_woven',name:'亚麻编织地垫',surface:'floor',color:'#b7aa8e',detail:'#93856c',pattern:'woven'},
];
const styles=new Map(HOME_DECOR_CATALOG.map(s=>[s.id,s]));
const baseWall=(color:string,pattern:HomeSurfacePattern='plaster',detail='#bdb3a0'):HomeSurfaceStyle=>({id:`base-wall-${color}-${pattern}`,name:'房源原装墙面',surface:'wall',color,detail,pattern});
const baseFloor=(color:string,pattern:HomeSurfacePattern='oak',detail='#94714c'):HomeSurfaceStyle=>({id:`base-floor-${color}-${pattern}`,name:'房源原装地面',surface:'floor',color,detail,pattern});
const DEFAULTS:Record<string,{wall:HomeSurfaceStyle;floor:HomeSurfaceStyle}>={
  old_apartment:{wall:baseWall('#d0c2a9'),floor:baseFloor('#ad9874')},
  suburb_room:{wall:baseWall('#d5d1c1'),floor:baseFloor('#b2afa0','vinyl','#979586')},
  rental_apartment:{wall:baseWall('#e2dbcd','linen','#cfc8b8'),floor:baseFloor('#c9b28b')},
  boyue_talent_apartment:{wall:baseWall('#c5d0c2','stripe','#b4c1ad'),floor:baseFloor('#c7c4ad','oak','#a49e84')},
  own_old_unit:{wall:baseWall('#d8ccb6','stripe','#c2b599'),floor:baseFloor('#a58b69','walnut','#7b624a')},
  own_apartment:{wall:baseWall('#c5d0d4','linen','#b0bfc5'),floor:baseFloor('#cfb994')},
  own_villa:{wall:baseWall('#d9d1c0','linen','#c6baa5'),floor:baseFloor('#9d795b','walnut','#75543e')},
  dev_incubator:{wall:baseWall('#d0d3c8'),floor:baseFloor('#c0bba7')},
  minsu:{wall:baseWall('#ded3bf','linen','#c5b89e'),floor:baseFloor('#ac9474')},
  hotel_budget:{wall:baseWall('#d2d2ca'),floor:baseFloor('#aaa79a','vinyl','#8f8c80')},
  hotel:{wall:baseWall('#cfbfaa','linen','#ad9c87'),floor:baseFloor('#96785e','walnut','#715740')},
  hotel_mooncourt:{wall:baseWall('#d8d9d0','linen','#b8c2ba'),floor:baseFloor('#b69b76','oak','#876d50')},
  hotel_boyue_quick:{wall:baseWall('#dbe1de','linen','#bbc7c3'),floor:baseFloor('#c6b89c')},
  hotel_boyu_nightmarket:{wall:baseWall('#d7c6ad','linen','#b39b80'),floor:baseFloor('#a78b72','walnut','#7c644e')},
  npc_guest_room:{wall:baseWall('#cad2c1','stripe','#b3bda7'),floor:baseFloor('#b7a185')},
};
export function homeSurfaceItem(id:string):HomeSurfaceStyle|undefined{return styles.get(id);}
export function defaultHomeDecor(homeId:string){return DEFAULTS[homeId]??DEFAULTS[HOME_ALIASES[homeId]]??DEFAULTS.old_apartment;}
export function homeDecorFor(state:GameState,homeId=formalHomeId(state)??'old_apartment'){
  const original=defaultHomeDecor(homeId),chosen=state.homeDecor?.[homeId];
  return {wall:homeSurfaceItem(chosen?.wall??'')??original.wall,floor:homeSurfaceItem(chosen?.floor??'')??original.floor};
}
/** Purchased finishes remain available; selecting them never consumes time or money. */
export function setHomeDecor(state:GameState,surface:HomeSurface,itemId?:string):{ok:boolean;reason?:string}{
  const home=formalHomeId(state);if(!home)return {ok:false,reason:'请先回到自己的正式住处'};
  if(state.work?.active||state.fishing?.active||state.districtLeisure?.active)return {ok:false,reason:'请先完成当前活动'};
  const item=itemId?homeSurfaceItem(itemId):undefined;
  if(itemId&&(!item||item.surface!==surface))return {ok:false,reason:'这件材料不能用于这里'};
  if(itemId&&(state.inventory[itemId]??0)<1)return {ok:false,reason:'先在家居店购买这款材料'};
  state.homeDecor??={};state.homeDecor[home]??={};
  if(itemId)state.homeDecor[home][surface]=itemId;else delete state.homeDecor[home][surface];
  if(!Object.keys(state.homeDecor[home]).length)delete state.homeDecor[home];
  return {ok:true};
}
export function normalizeHomeDecor(state:GameState):void{
  if(!state.homeDecor)return;const clean:NonNullable<GameState['homeDecor']>={};
  for(const home of HOME_FORMAL_IDS){const choice=state.homeDecor[home];if(!choice||typeof choice!=='object')continue;const record:{wall?:string;floor?:string}={};
    for(const surface of ['wall','floor'] as const){const id=choice[surface];if(typeof id==='string'&&homeSurfaceItem(id)?.surface===surface&&(state.inventory?.[id]??0)>0)record[surface]=id;}
    if(Object.keys(record).length)clean[home]=record;
  }state.homeDecor=clean;
}
