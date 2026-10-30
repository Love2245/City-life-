import type {HomePlan,HomePoint} from '../game/core/homeInterior';

export type HomeWallMode='cutaway'|'low'|'full';
export const HOME_LOW_WALL_HEIGHT=.65;
export const HOME_FULL_WALL_HEIGHT=2.65;
export function clampLowWallHeight(value:number):number {
  return Number.isFinite(value)?Math.round(Math.max(.45,Math.min(1.2,value))*20)/20:HOME_LOW_WALL_HEIGHT;
}
export function isHomeWallMode(value:unknown):value is HomeWallMode {
  return value==='cutaway'||value==='low'||value==='full';
}
export const HOME_WALL_OPTIONS:readonly {value:HomeWallMode;label:string}[]=[
  {value:'cutaway',label:'自动剖切'},{value:'low',label:'低墙查看'},{value:'full',label:'完整墙体'},
];

/** 只降下镜头与查看位置之间真正遮挡视线的墙；左右侧墙和后墙保持完整。 */
export function homeExteriorWallHeight(segment:readonly number[],target:HomePoint,eye:HomePoint,mode:HomeWallMode,previous?:number,lowHeight=HOME_LOW_WALL_HEIGHT):number {
  const low=clampLowWallHeight(lowHeight);
  if(mode==='full')return HOME_FULL_WALL_HEIGHT;
  if(mode==='low')return low;
  const dx=eye[0]-target[0],dz=eye[1]-target[1],length=Math.hypot(dx,dz);
  if(length<.001)return 2.65;
  const along=(x:number,z:number)=>((x-target[0])*dx+(z-target[1])*dz)/length;
  const side=(x:number,z:number)=>((x-target[0])*dz-(z-target[1])*dx)/length;
  const t1=along(segment[0],segment[1]),t2=along(segment[2],segment[3]);
  const from=Math.max(.05,Math.min(t1,t2)),to=Math.min(length+.12,Math.max(t1,t2));
  if(from>to)return 2.65;
  const s1=side(segment[0],segment[1]),s2=side(segment[2],segment[3]);
  const at=(t:number)=>s1+(s2-s1)*(t-t1)/(t2-t1);
  const a=Math.abs(t2-t1)<1e-7?s1:at(from),b=Math.abs(t2-t1)<1e-7?s2:at(to);
  const gap=a*b<=0?0:Math.min(Math.abs(a),Math.abs(b));
  // 降墙后多保留一点离开余量，防止视线擦过墙端时来回闪动。
  return gap<(previous!==undefined&&previous<HOME_FULL_WALL_HEIGHT-.01?.25:.08)?low:HOME_FULL_WALL_HEIGHT;
}

export function homeWallHeight(_plan:HomePlan,segment:readonly number[],target:HomePoint,eye:HomePoint,mode:HomeWallMode,previous?:number,lowHeight=HOME_LOW_WALL_HEIGHT):number {
  return homeExteriorWallHeight(segment,target,eye,mode,previous,lowHeight);
}
