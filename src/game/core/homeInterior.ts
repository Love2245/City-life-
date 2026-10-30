import type { GameState } from "../types";
import { currentResidence, permanentResidence, isResidenceLocation, RESIDENCE_TIERS } from "./residence";
import { bestHomeItem, HOME_KINDS, type HomeFurnitureKind } from "./homeFurniture";
import {HOME_FLOOR_PLANS} from './homeFloorPlans';
import {FIXED_HOME_PLANS,FIXED_STAY_ITEMS} from './homeStay';
import {withBedsideTrash} from './homeBedside';
import {HOME_ALIASES} from './homeAliases';

export type HomeObjectKind = HomeFurnitureKind | "wardrobe" | "bookshelf" | "door" | "storage" | "trash";
export type HomePoint = [number, number];
export type HomeScale=[number,number,number];
export interface HomeAnchor { position: HomePoint; width: number; height: number; rotation?:number; alternatives?: HomePoint[]; alternativeRotation?:number; mirrorX?:boolean;scale?:HomeScale }
export interface HomeRoom { name: string; rect: [number, number, number, number]; type: "living" | "bedroom" | "bath" | "kitchen" | "entry" | "study" | "dining" | "dressing";viewYaw?:number }
export interface HomeWindow { x:number; z:number; width:number; wall:'back'|'left'|'right'|'front'; room:string }
export interface HomeFixture {kind:'counter'|'island'|'dining'|'bathVanity'|'bathTub'|'coffeeTable'|'bench'|'media'|'nightstand'|'sideTable'|'dressingTable'|'rug';position:HomePoint;size:HomePoint;rotation?:number;requires?:HomeObjectKind;owner?:HomeObjectKind;decorative?:boolean}
export interface HomePassage {name:string;rect:[number,number,number,number]}
export interface HomePlan { id: string; residenceId?:string; title: string; size: HomePoint; outline: HomePoint[]; rooms: HomeRoom[]; partitions: [number, number, number, number][]; windows:HomeWindow[]; anchors: Partial<Record<HomeObjectKind, HomeAnchor>>;fixtures?:HomeFixture[];passages?:HomePassage[];openKitchen?:boolean }
export const HOME_FITTINGS:ReadonlySet<HomeObjectKind>=new Set(['bed','computer','shower','kitchen','wardrobe','bookshelf','door','storage','trash']);
export function homeObjectAvailable(state:GameState,kind:HomeObjectKind):boolean{
  const id=currentHomeSceneId(state);
  if(id&&HOME_FIXED_IDS.has(id))return fixedHomeObjectKinds(id).includes(kind);
  return HOME_FITTINGS.has(kind)||(HOME_KINDS.includes(kind as HomeFurnitureKind)&&!!bestHomeItem(state,kind as HomeFurnitureKind));
}

export const HOME_PLANS: Record<string, HomePlan> = Object.fromEntries(Object.entries(HOME_FLOOR_PLANS).map(([id,plan])=>[id,withBedsideTrash(plan)]));
export const HOME_FORMAL_IDS = new Set(["old_apartment","suburb_room","rental_apartment","boyue_talent_apartment","own_old_unit","own_apartment","own_villa",...Object.keys(HOME_ALIASES).filter(id=>!id.startsWith('hotel'))]);
export const HOME_FIXED_IDS:ReadonlySet<string>=new Set(Object.keys(FIXED_HOME_PLANS));
export const HOME_SCENE_IDS:ReadonlySet<string>=new Set([...HOME_FORMAL_IDS,...HOME_FIXED_IDS]);
const FORMAL_IDS=HOME_FORMAL_IDS;
export const HOME_TOUR_RESIDENCES=RESIDENCE_TIERS.filter(t=>HOME_SCENE_IDS.has(t.id));
export function formalHomeId(state: GameState): string | undefined {
  if (!(["lease","own"] as string[]).includes(state.living.mode) || state.living.awayNight || !isResidenceLocation(state)) return;
  const permanent=permanentResidence(state), current=currentResidence(state);
  return current.id===permanent.id && FORMAL_IDS.has(current.id) ? current.id : undefined;
}
/** Scene identity is independent of ownership; a booked room must be at its actual address. */
export function currentHomeSceneId(state:GameState):string|undefined {
  if(!isResidenceLocation(state))return;
  const current=currentResidence(state);
  if(HOME_FIXED_IDS.has(current.id))return current.id;
  return formalHomeId(state);
}
export function canCustomizeCurrentHome(state:GameState):boolean{return !!formalHomeId(state);}
export function fixedHomeObjectKinds(id:string):HomeObjectKind[]{return FIXED_HOME_PLANS[id]?Object.keys(homePlanFor(id).anchors) as HomeObjectKind[]:[];}
export function fixedHomeItem(id:string,kind:HomeObjectKind):string|undefined{return FIXED_STAY_ITEMS[id]?.[kind];}
/** Selects a model tier only. Fixed accommodation never reads or writes player furniture. */
export function homeSceneObjectItem(state:GameState,kind:HomeObjectKind):string|undefined {
  const id=currentHomeSceneId(state);if(!id)return;
  if(HOME_FIXED_IDS.has(id))return fixedHomeItem(id,kind);
  return HOME_KINDS.includes(kind as HomeFurnitureKind)?bestHomeItem(state,kind as HomeFurnitureKind):undefined;
}
const residencePlans=new Map<string,HomePlan>();
export function homePlanFor(id: string): HomePlan {
  const cached=residencePlans.get(id);if(cached)return cached;
  const canonical=HOME_ALIASES[id]??id;
  const base=FIXED_HOME_PLANS[id]??HOME_PLANS[canonical==='own_villa'?'house':canonical==='own_apartment'?'premium':canonical==='own_old_unit'?'compact':['old_apartment','suburb_room'].includes(canonical)?'studio':'apartment'];
  const mirrored=canonical==='suburb_room'||id==='boyue_talent_apartment',sx=1,sz=1;
  const point=([x,z]:HomePoint):HomePoint=>[(mirrored?base.size[0]-x:x)*sx,z*sz];
  const plan:HomePlan={...base,residenceId:id,size:[base.size[0]*sx,base.size[1]*sz],outline:base.outline.map(point),
    rooms:base.rooms.map(r=>({...r,viewYaw:r.viewYaw===undefined?undefined:mirrored?-r.viewYaw:r.viewYaw,rect:[(mirrored?base.size[0]-r.rect[0]-r.rect[2]:r.rect[0])*sx,r.rect[1]*sz,r.rect[2]*sx,r.rect[3]*sz]})),
    windows:base.windows.map(w=>({...w,x:point([w.x,w.z])[0],z:w.z*sz,width:w.width,wall:mirrored?(w.wall==='left'?'right':w.wall==='right'?'left':w.wall):w.wall})),
    partitions:base.partitions.map(p=>[...point([p[0],p[1]]),...point([p[2],p[3]])] as [number,number,number,number]),
    anchors:Object.fromEntries(Object.entries(base.anchors).map(([kind,a])=>[kind,{...a,position:point(a!.position),alternatives:a!.alternatives?.map(point),rotation:mirrored?-(a!.rotation??0):a!.rotation,alternativeRotation:mirrored?-(a!.alternativeRotation??0):a!.alternativeRotation,mirrorX:mirrored}])),
    fixtures:base.fixtures?.map(f=>({...f,position:point(f.position),rotation:mirrored?-(f.rotation??0):f.rotation})),
    passages:base.passages?.map(p=>({...p,rect:[(mirrored?base.size[0]-p.rect[0]-p.rect[2]:p.rect[0])*sx,p.rect[1]*sz,p.rect[2]*sx,p.rect[3]*sz]}))};
  if(mirrored)plan.outline.reverse();
  const supplied=withBedsideTrash(plan);residencePlans.set(id,supplied);return supplied;
}
/** Scene units have a shared architectural scale; labels are approximate usable floor areas. */
export function homeAreaSquareMetres(plan:HomePlan):number {
  let twiceArea=0;for(let i=0;i<plan.outline.length;i++){const a=plan.outline[i],b=plan.outline[(i+1)%plan.outline.length];twiceArea+=a[0]*b[1]-b[0]*a[1];}
  return Math.round(Math.abs(twiceArea)/2*.75**2);
}
export function homeAnchor(state: GameState, kind: HomeObjectKind): HomeAnchor | undefined {
  const id=currentHomeSceneId(state); if(!id)return;
  const source=homePlanFor(id).anchors[kind]; if(!source)return;
  if(HOME_FIXED_IDS.has(id))return source;
  const preference=state.homeLayouts?.[id]?.[kind];
  const alternate=preference===1?source.alternatives?.[0]:undefined;
  return alternate?{...source,position:alternate,rotation:source.alternativeRotation??source.rotation}:source;
}
export function rearrangeHomeObject(state: GameState, kind: HomeObjectKind): {ok:boolean;reason?:string} {
  const id=formalHomeId(state); if(!id)return {ok:false,reason:"请先回到自己的正式住处"};
  if(state.work?.active || state.fishing?.active || state.districtLeisure?.active)return {ok:false,reason:"请先完成当前活动"};
  const source=homePlanFor(id).anchors[kind];
  if(!source?.alternatives?.length)return {ok:false,reason:"这件家具的位置随户型固定"};
  if(!bestHomeItem(state,kind as HomeFurnitureKind))return {ok:false,reason:"请先购置这件家具"};
  state.homeLayouts ??= {}; state.homeLayouts[id] ??= {};
  state.homeLayouts[id][kind]=state.homeLayouts[id][kind]===1?0:1;
  return {ok:true};
}
/** Bounded optional save extension; unknown homes, furniture, and positions are discarded. */
export function normalizeHomeLayouts(state: GameState): void {
  if(!state.homeLayouts)return;
  const clean: NonNullable<GameState["homeLayouts"]>={};
  for(const id of FORMAL_IDS){
    const source=state.homeLayouts[id];if(!source||typeof source!=="object")continue;
    const values:Record<string,number>={};
    for(const [kind,position]of Object.entries(source))if(position===1&&homePlanFor(id).anchors[kind as HomeObjectKind]?.alternatives?.length)values[kind]=1;
    if(Object.keys(values).length)clean[id]=values;
  }
  state.homeLayouts=clean;
}



