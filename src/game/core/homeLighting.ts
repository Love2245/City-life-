import type {GameState,WeatherId} from '../types';
import {currentHomeSceneId,HOME_SCENE_IDS,type HomePlan} from './homeInterior';
export type HomeLightMode='auto'|'on'|'off';
export interface HomeLightScheme { phase:string; daylight:number; lamps:boolean; sky:string; windowColor:string; lampColor:string; bounce:number; keyIntensity:number;windowIntensity:number;ceilingIntensity:number;lampIntensity:number;shadowIntensity:number }
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
/** Game art lighting, sampled from the game's clock and weather, not wall time. */
export function homeLightScheme(hour:number,month:number,weather:WeatherId,mode:HomeLightMode='auto'):HomeLightScheme {
  const summer=month>=5&&month<=8,winter=month===12||month<=2;
  const sunrise=summer?5.5:winter?7:6,sunset=summer?19:winter?17.5:18;
  const t=clamp((hour-sunrise)/(sunset-sunrise));
  const direct=hour>sunrise&&hour<sunset?Math.pow(Math.sin(Math.PI*t),.65):0;
  const twilight=clamp((hour-sunrise+.6)/.6)*clamp((sunset+.6-hour)/.6);
  const daylight=direct*.88+twilight*.12;
  const weatherScale=weather==='rain'?.55:weather==='cloudy'?.72:weather==='snow'?.7:1;
  const warm=t<.22||t>.78;
  const lamps=mode==='on'||mode==='auto'&&(hour<sunrise||hour>=sunset);
  const natural=daylight*weatherScale;
  return {phase:hour<sunrise||hour>=23?'深夜':hour<9?'清晨':hour<16.5?'日间':hour<sunset+.5?'傍晚':'夜晚',daylight:daylight*weatherScale,
    lamps,sky:daylight===0?'#182b47':warm?'#dcb19a':weatherScale<1?'#9caeb9':'#bdd9e6',
    windowColor:daylight===0?'#789ac6':warm?'#ffcf9a':'#f4f6ff',lampColor:'#ffd2a0',bounce:daylight===0?(lamps?.44:.08):.34+natural*.78,
    keyIntensity:natural*.28,windowIntensity:natural*2.6+(natural===0?.03:0),ceilingIntensity:lamps?8.5:0,lampIntensity:lamps?2.8:0,shadowIntensity:natural>.12?.18+natural*.14:.2};
}
export function homeCeilingAreas(plan:HomePlan){return plan.id==='studio'?plan.rooms.filter(r=>r.type!=='kitchen'):plan.rooms;}
/** 一次只让一个主光源投影；选择只依赖建筑与日夜，不跟随镜头。 */
export function homeShadowSource(plan:HomePlan,scheme:HomeLightScheme):{kind:'window'|'ceiling'|'none';index:number} {
  const priority:Record<string,number>={living:6,bedroom:5,dining:4,dressing:3,study:2,entry:1,kitchen:1,bath:0};
  if(scheme.daylight>.12&&plan.windows.length){
    const order=plan.windows.map((win,index)=>({index,score:(priority[plan.rooms.find(r=>r.name===win.room)?.type??'']??0)*100+win.width})).sort((a,b)=>b.score-a.score);
    return {kind:'window',index:order[0].index};
  }
  if(scheme.lamps){
    const order=homeCeilingAreas(plan).map((room,index)=>({index,score:(priority[room.type]??0)*100+room.rect[2]*room.rect[3]})).sort((a,b)=>b.score-a.score);
    if(order.length)return{kind:'ceiling',index:order[0].index};
  }
  return{kind:'none',index:-1};
}
export function homeLightMode(state:GameState):HomeLightMode {const id=currentHomeSceneId(state);return id?state.homeLighting?.[id]??'auto':'auto';}
/** Switching an installed light is permitted in both personal homes and fixed guest rooms. */
export function setHomeLightMode(state:GameState,mode:HomeLightMode):boolean {const id=currentHomeSceneId(state);if(!id)return false;state.homeLighting??={};state.homeLighting[id]=mode;return true;}
export function normalizeHomeLighting(state:GameState):void {if(!state.homeLighting)return;const clean:Record<string,HomeLightMode>={};for(const id of HOME_SCENE_IDS){const mode=state.homeLighting[id];if(mode==='auto'||mode==='on'||mode==='off')clean[id]=mode;}state.homeLighting=clean;}
