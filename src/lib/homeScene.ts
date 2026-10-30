import type { GameState } from "../game/types";
import { currentHomeSceneId, canCustomizeCurrentHome, homeSceneObjectItem, homeAnchor, homeObjectAvailable, type HomePlan, type HomeObjectKind } from "../game/core/homeInterior";
import { homeSprite, HOME_FURNITURE, type HomeFurnitureKind } from "../game/core/homeFurniture";

const trashSprite='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 130"><path d="M18 32h64l-7 81c-1 12-49 12-50 0z" fill="#78867e" stroke="#45584c" stroke-width="3"/><ellipse cx="50" cy="32" rx="33" ry="12" fill="#293a32" stroke="#a4afa8" stroke-width="5"/><path d="M35 33l-6-20 20-5 11 24" fill="#eee9d9"/><path d="M34 52l4 52m25-52-3 52" stroke="#a4afa8" stroke-width="3"/></svg>');
const images=import.meta.glob('/src/assets/home/v1.49/matte/*.webp',{eager:true,import:'default'}) as Record<string,string>;
export function homeSpriteUrl(key:string):string|undefined{return images[`/src/assets/home/v1.49/matte/${key}.webp`];}
export function projectHome(plan:HomePlan,x:number,z:number,y=0):[number,number]{
  const u=900/(plan.size[0]+plan.size[1]);
  return [50+plan.size[1]*u+(x-z)*u,160+(x+z)*u*.48-y*u*.82];
}
export function homePolygon(plan:HomePlan,points:readonly (readonly number[])[],height=0):string{return points.map(([x,z])=>projectHome(plan,x,z,height).join(',')).join(' ');}
export function homeObjects(state:GameState,plan:HomePlan){
  if (!currentHomeSceneId(state)) return [];
  return Object.keys(plan.anchors).filter(key=>homeObjectAvailable(state,key as HomeObjectKind)).map(key=>{
    const kind=key as HomeObjectKind,a=homeAnchor(state,kind)!;
    const family=HOME_FURNITURE[kind as HomeFurnitureKind];
    const item=homeSceneObjectItem(state,kind),customizable=canCustomizeCurrentHome(state);
    const bought=family?(customizable?homeSprite(state,kind as HomeFurnitureKind):family.sprites[(family.items as readonly string[]).indexOf(item??'')]):undefined;
    const defaultKey:Partial<Record<HomeObjectKind,string>>={bed:'bed-basic',computer:'desk',shower:'shower',kitchen:'stove',wardrobe:'wardrobe',bookshelf:'bookshelf',storage:'tv-console'};
    const sprite=kind==='computer'?'desk':bought??defaultKey[kind];
    const [x,y]=projectHome(plan,...a.position);
    const u=900/(plan.size[0]+plan.size[1]),width=a.width*u*1.65,height=a.height*u*1.65;
    return {kind,x,y,width,height,sprite:kind==='trash'?trashSprite:sprite?homeSpriteUrl(sprite):undefined,device:kind==='computer'&&bought?homeSpriteUrl(bought):undefined,owned:customizable&&!!bought,adjustable:customizable&&!!a.alternatives?.length,zIndex:a.position[0]+a.position[1]};
  }).sort((a,b)=>a.zIndex-b.zIndex);
}
