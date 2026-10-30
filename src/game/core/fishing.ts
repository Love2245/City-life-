import type { GameState } from "../types";
import { applyEffects, pushLog } from "../engine";
import { nextRandom, randomInt, weightedDraw } from "../rng";
import { advanceHours } from "./time";
import { canWork } from "./survival";
import { recordMoney } from "./weekly";
import { getDifficulty } from './minigame';

export const FISH_SPECIES = [
  {id:"crucian",name:"鲫鱼",color:"#bec59c",min:100,max:1800,rate:12,difficulty:1,weight:32,rarity:"常见"},
  {id:"carp",name:"鲤鱼",color:"#d6b878",min:300,max:8000,rate:9,difficulty:1.25,weight:24,rarity:"常见"},
  {id:"grass",name:"草鱼",color:"#94ad87",min:500,max:10000,rate:7,difficulty:1.35,weight:16,rarity:"常见"},
  {id:"silver",name:"鲢鱼",color:"#b1c9cc",min:400,max:8000,rate:6,difficulty:1.4,weight:10,rarity:"较少见"},
  {id:"bream",name:"鳊鱼",color:"#aec7bb",min:200,max:3000,rate:10,difficulty:1.2,weight:8,rarity:"较少见"},
  {id:"snakehead",name:"黑鱼",color:"#7c948b",min:300,max:5000,rate:18,difficulty:1.6,weight:5,rarity:"较少见"},
  {id:"bass",name:"鲈鱼",color:"#b4bf99",min:250,max:3500,rate:24,difficulty:1.7,weight:3,rarity:"稀有"},
  {id:"mandarin",name:"鳜鱼",color:"#c5b691",min:250,max:3000,rate:42,difficulty:1.9,weight:2,rarity:"稀有"},
  {id:"catfish",name:"鲶鱼",color:"#8a9489",min:300,max:6000,rate:14,difficulty:1.45,weight:5,rarity:"较少见"},
  {id:"yellow_catfish",name:"黄颡鱼",color:"#c2ad68",min:100,max:1800,rate:22,difficulty:1.55,weight:3,rarity:"稀有"},
  {id:"tilapia",name:"罗非鱼",color:"#829c90",min:200,max:2500,rate:10,difficulty:1.2,weight:0,rarity:"较少见"},
  {id:"bighead",name:"鳙鱼",color:"#a2b5ad",min:700,max:12000,rate:8,difficulty:1.5,weight:3,rarity:"稀有"},
] as const;
export type FishingSpotId = "treasure_lake" | "lake_park";
export const FISHING_SPOTS: Record<FishingSpotId, { name: string; region: string; waterside: string }> = {
  treasure_lake: { name: "珍宝湖", region: "伯月新区 · 自然保护区", waterside: "群山水库岸边" },
  lake_park: { name: "环湖公园", region: "紫羊区 · 城市边缘", waterside: "城市公园湖岸" },
};
export function fishingSpotOf(locationId: string): FishingSpotId | undefined {
  return locationId === "treasure_lake" || locationId === "lake_park" ? locationId : undefined;
}
// The reservoir and urban lake share common fish but have their own rare finds.
// Zero-weight species are filtered before drawing so even RNG value 0 cannot select one.
const PARK_FISH_WEIGHTS: Record<(typeof FISH_SPECIES)[number]["id"], number> = {
  crucian:34, carp:26, grass:12, silver:7, bream:11, snakehead:4, bass:2, mandarin:1,
  catfish:3, yellow_catfish:3, tilapia:8, bighead:0,
};
export function fishingPool(spot: FishingSpotId) {
  return FISH_SPECIES.map(species => ({item:species,weight:spot === "lake_park" ? PARK_FISH_WEIGHTS[species.id] : species.weight}))
    .filter(entry => entry.weight > 0);
}
function fishingSpotName(locationId?: string): string {
  const spot = locationId ? fishingSpotOf(locationId) : undefined;
  return spot ? FISHING_SPOTS[spot]?.name ?? "湖边" : "湖边";
}
export interface FishCatch { id:number; speciesId:string; grams:number }
export interface FishingCatchResult {
  fish: FishCatch;
  previousBest?: FishCatch;
  record: FishCatch;
  newRecord: boolean;
  /** Legacy catch results are normalized to treasure_lake. */
  locationId?: FishingSpotId;
}
export interface FishingSession {
  id:number; phase:"waiting"|"bite"|"fighting"|"ready"; fish:FishCatch;
  /** The spot where this cast began; fish sessions never switch locations. */
  locationId?: FishingSpotId;
  waitMs:number; biteMs:number; bar:number; velocity:number; fishPos:number;
  target:number; targetMs:number; progress:number; won:boolean; elapsedMs:number;
  zoneWidth?:number;
  fightingMs?:number;
}
export function fishingZoneWidth(session: FishingSession): number { return session.zoneWidth ?? .29; }
export interface FishingState {
  nextId:number;
  active:FishingSession|null;
  bucket:FishCatch[];
  specimens:Record<string,FishCatch>;
  /** All-time best by species; survives selling, releasing, and replacing a specimen. */
  bestRecords:Record<string,FishCatch>;
  /** A settled catch awaiting explicit acknowledgement in the fishing UI. */
  pendingCatch:FishingCatchResult|null;
}
type Check={ok:true}|{ok:false;reason:string};
export const fishSpecies=(id:string)=>FISH_SPECIES.find(s=>s.id===id);
export function fishValue(fish:FishCatch):number {return Math.round(fish.grams*(fishSpecies(fish.speciesId)?.rate??0)/10)/100;}
function data(s:GameState):FishingState {
  if(!s.fishing||typeof s.fishing!=="object"||Array.isArray(s.fishing))s.fishing={nextId:1,active:null,bucket:[],specimens:{},bestRecords:{},pendingCatch:null};
  const d=s.fishing;
  // Only repair missing fields. Writing observed objects back on every frame
  // repeatedly wraps them in store proxies and eventually stalls settlement.
  if(!d.bestRecords||typeof d.bestRecords!=="object"||Array.isArray(d.bestRecords))d.bestRecords={};
  if(!d.pendingCatch||typeof d.pendingCatch!=="object") {
    if(d.pendingCatch!==null)d.pendingCatch=null;
  }
  if(d.active){
    const spot=fishingSpotOf(d.active.locationId??"treasure_lake");
    if(!spot||!fishSpecies(d.active.fish?.speciesId??""))d.active=null;
    else if(!d.active.locationId)d.active.locationId=spot;
  }
  return d;
}
function canStart(s:GameState,allowPendingCatch:boolean):Check {
  if(!fishingSpotOf(s.locationId))return {ok:false,reason:"请到珍宝湖或环湖公园湖岸垂钓"};
  // This check is read from a Svelte $derived expression. Older saves may not
  // have fishing fields yet, so inspect them without mutating the save here.
  const fishing=s.fishing;
  if(fishing?.pendingCatch&&!allowPendingCatch)return {ok:false,reason:"请先查看本次鱼获"};
  const active=fishing?.active;
  const hasValidActive=!!active&&!!fishingSpotOf(active.locationId??"treasure_lake")&&!!fishSpecies(active.fish?.speciesId??"");
  if(hasValidActive||s.districtLeisure?.active)return {ok:false,reason:"请先完成当前这一轮"};
  if(!(s.inventory.fishing_rod>0))return {ok:false,reason:"先去野营基地买一支鱼竿"};
  if(!(s.inventory.fishing_bait>0))return {ok:false,reason:"鱼饵用完了，去渔具商店补充一些吧"};
  if(!(s.inventory.fishing_bucket>0)&&!s.flags.fishing_bucket_owned)return {ok:false,reason:"带上鱼桶，才能把鱼带回来"};
  const work=canWork(s);if(!work.ok)return {ok:false,reason:work.reason??"身体不适，先休息一下"};
  if(s.player.attrs.stamina<5)return {ok:false,reason:"太累了，先休息一下"};
  return {ok:true};
}
export function canStartFishing(s:GameState):Check {return canStart(s,false);}
export function canContinueFishing(s:GameState):Check {
  if(!s.fishing?.pendingCatch)return {ok:false,reason:"没有待确认的鱼获"};
  const spot=fishingSpotOf(s.locationId);
  const pendingSpot=fishingSpotOf(s.fishing.pendingCatch.locationId??"treasure_lake")??"treasure_lake";
  if(spot!==pendingSpot)return {ok:false,reason:`请回到${FISHING_SPOTS[pendingSpot].name}继续整理本次鱼获`};
  return canStart(s,true);
}
export function startFishing(s:GameState):Check {
  const check=canStartFishing(s);if(!check.ok)return check;
  const spot=fishingSpotOf(s.locationId);
  if(!spot)return {ok:false,reason:"请到珍宝湖或环湖公园湖岸垂钓"};
  const d=data(s),species=weightedDraw(s.rng,fishingPool(spot))!;
  const fish={id:d.nextId++,speciesId:species.id,grams:Math.round(species.min+(species.max-species.min)*nextRandom(s.rng)**2)};
  const tier=getDifficulty(s), size=(fish.grams-species.min)/(species.max-species.min);
  const zoneWidth=(tier==='easy'?.28:tier==='hard'?.18:.23)-size*.035;
  d.active={id:fish.id,fish,locationId:spot,phase:"waiting",waitMs:randomInt(s.rng,2000,5000),biteMs:tier==='easy'?3000:tier==='hard'?1400:2000,bar:.3,velocity:0,fishPos:.42,target:.42,targetMs:0,progress:.35,won:false,elapsedMs:0,zoneWidth,fightingMs:0};
  s.inventory.fishing_bait--;applyEffects(s,{stamina:-5},"🎣");
  pushLog(s,"🎣",`在${fishingSpotName(spot)}抛下一竿，浮标轻轻落在水面上。`);return {ok:true};
}
export function fishingInput(s:GameState,id:number,input:{type:"tick";dtMs:number;held:boolean}|{type:"hook"}|{type:"cancel"}):Check {
  const a=data(s).active;if(!a||a.id!==id)return {ok:false,reason:"这一竿已结束"};
  const spot=a.locationId??"treasure_lake";
  if(s.locationId!==spot)return {ok:false,reason:`请回到${fishingSpotName(spot)}继续这一竿`};
  if(a.phase==="ready")return {ok:false,reason:"请收好这一竿的结果"};
  if(input.type==="cancel"){a.phase="ready";a.won=false;return {ok:true};}
  if(input.type==="hook"){if(a.phase!=="bite")return {ok:false,reason:"等鱼儿咬钩再提竿"};a.phase="fighting";return {ok:true};}
  if(!Number.isFinite(input.dtMs))return {ok:false,reason:"无效操作"};
  const ms=Math.max(0,Math.min(50,input.dtMs)),dt=ms/1000;a.elapsedMs+=ms;
  if(a.phase==="waiting"){a.waitMs-=ms;if(a.waitMs<=0)a.phase="bite";}
  else if(a.phase==="bite"){a.biteMs-=ms;if(a.biteMs<=0)a.phase="ready";}
  else {
    const species=fishSpecies(a.fish.speciesId)!;
    // 小鱼保留原有速度；体型越接近该品类上限，游动与变向越急。
    const sizeRatio=Math.max(0,Math.min(1,(a.fish.grams-species.min)/(species.max-species.min)));
    const difficulty=species.difficulty*(1+.6*sizeRatio);
    const zone=fishingZoneWidth(a);
    a.fightingMs=(a.fightingMs??0)+ms;
    a.velocity+=(input.held?1.8:-1.4)*dt;a.velocity*=Math.pow(.955,dt*60);a.velocity=Math.max(-.52,Math.min(.58,a.velocity));
    a.bar+=a.velocity*dt;if(a.bar<0){a.bar=0;a.velocity=0;}if(a.bar>1-zone){a.bar=1-zone;a.velocity=0;}
    a.targetMs-=ms;if(a.targetMs<=0){a.target=.09+nextRandom(s.rng)*.82;a.targetMs=(850+nextRandom(s.rng)*850)/difficulty;}
    const speed=.15+difficulty*.065;a.fishPos+=Math.max(-speed*dt,Math.min(speed*dt,(a.target-a.fishPos)*dt*4));a.fishPos=Math.max(.055,Math.min(.945,a.fishPos));
    const inside=a.fishPos>=a.bar&&a.fishPos<=a.bar+zone;
    a.progress=Math.max(0,Math.min(1,a.progress+(inside?.105:-.14)*dt));
    if(a.progress>=1){a.phase="ready";a.won=true;}else if(a.progress<=0||a.fightingMs>=45000)a.phase="ready";
  }
  return {ok:true};
}
export function settleFishing(s:GameState,id:number):Check&{fish?:FishCatch} {
  const d=data(s),a=d.active;if(!a||a.id!==id||a.phase!=="ready")return {ok:false,reason:"这一竿还没结束"};
  const spot=a.locationId??"treasure_lake";
  if(s.locationId!==spot)return {ok:false,reason:`请回到${fishingSpotName(spot)}收竿`};
  const fish=a.won?{...a.fish}:undefined;d.active=null;
  if(fish){
    const previousBest=d.bestRecords[fish.speciesId];
    const newRecord=!previousBest||fish.grams>previousBest.grams;
    const record=newRecord?{...fish}:{...previousBest};
    d.bucket.push(fish);
    if(newRecord)d.bestRecords[fish.speciesId]={...fish};
    d.pendingCatch={fish:{...fish},...(previousBest?{previousBest:{...previousBest}}:{}),record,newRecord,locationId:spot};
    applyEffects(s,{mood:5},"🎣");
  }
  advanceHours(s,.5);pushLog(s,"🎣",fish?`在${fishingSpotName(spot)}钓到一条${(fishSpecies(fish.speciesId)?.name??"未知鱼种")}，重${(fish.grams/1000).toFixed(3)}千克。`:`鱼儿游走了。你在${fishingSpotName(spot)}收起线，望了一会儿湖面。`);
  return {ok:true,fish};
}
/** Start the next cast only after the player acknowledges the saved catch result. */
export function continueFishing(s:GameState):Check {
  const check=canContinueFishing(s);if(!check.ok)return check;
  const d=data(s),pending=d.pendingCatch;
  d.pendingCatch=null;
  const started=startFishing(s);
  if(!started.ok)d.pendingCatch=pending;
  return started;
}
/** Acknowledge a catch when the player chooses to end the outing instead of casting again. */
export function acknowledgeFishingCatch(s:GameState):Check {
  const d=data(s);if(!d.pendingCatch)return {ok:false,reason:"没有待确认的鱼获"};
  d.pendingCatch=null;return {ok:true};
}
export function sellFish(s:GameState,id:number):Check&{price?:number} {
  const d=data(s);if(!fishingSpotOf(s.locationId)||d.active)return {ok:false,reason:"请先到珍宝湖或环湖公园收竿，再找岸边鱼商"};
  const index=d.bucket.findIndex(f=>f.id===id);if(index<0)return {ok:false,reason:"这条鱼已处理"};
  const fish=d.bucket[index],price=fishValue(fish);d.bucket.splice(index,1);
  s.player.money=Math.round((s.player.money+price)*100)/100;recordMoney(s,price);
  pushLog(s,"🐟",`鱼商收下${(fishSpecies(fish.speciesId)?.name??"未知鱼种")}，付了${price.toFixed(2)}元。`);return {ok:true,price};
}
export function releaseFish(s:GameState,id:number):Check {
  const d=data(s);if(d.active)return {ok:false,reason:"请先结束这一趟垂钓"};
  const index=d.bucket.findIndex(f=>f.id===id);if(index<0)return {ok:false,reason:"这条鱼已处理"};
  const fish=d.bucket.splice(index,1)[0];
  const spot=fishingSpotOf(s.locationId);
  pushLog(s,"🐟",`将${(fishSpecies(fish.speciesId)?.name??"未知鱼种")}放回${spot?fishingSpotName(spot):"湖中"}。`);return {ok:true};
}
export function mountFish(s:GameState,id:number):Check {
  const d=data(s);if(d.active)return {ok:false,reason:"请先收好当前这一竿"};
  const index=d.bucket.findIndex(f=>f.id===id);if(index<0)return {ok:false,reason:"这条鱼已处理"};
  const fish=d.bucket[index],old=d.specimens[fish.speciesId];
  if(old&&old.grams>=fish.grams)return {ok:false,reason:"已有同品类更大的标本，这条鱼可以卖给鱼商"};
  d.bucket.splice(index,1);d.specimens[fish.speciesId]={...fish};s.inventory[`fish_specimen_${fish.speciesId}`]=1;
  pushLog(s,"🖼️",`将${(fishSpecies(fish.speciesId)?.name??"未知鱼种")}留成标本${old?"，替换了以前的收藏":""}。`);return {ok:true};
}
/** Old saves get safe defaults; pending fish, progress and consumed bait never reroll on reload. */
export function normalizeFishing(s:GameState):void {
  const d=data(s);
  const valid=(f:FishCatch)=>!!f&&Number.isSafeInteger(f.id)&&f.id>0&&!!fishSpecies(f.speciesId)&&Number.isInteger(f.grams)&&f.grams>=fishSpecies(f.speciesId)!.min&&f.grams<=fishSpecies(f.speciesId)!.max;
  const ids=new Set<number>();
  d.bucket=(Array.isArray(d.bucket)?d.bucket:[]).filter(f=>{if(!valid(f)||ids.has(f.id))return false;ids.add(f.id);return true;});
  const specimens=d.specimens&&typeof d.specimens==="object"?d.specimens:{};d.specimens={};
  for(const [key,f]of Object.entries(specimens))if(valid(f)&&key===f.speciesId&&!ids.has(f.id)){d.specimens[key]=f;ids.add(f.id);}
  const storedRecords=d.bestRecords&&typeof d.bestRecords==="object"?d.bestRecords:{};d.bestRecords={};
  for(const species of FISH_SPECIES){
    const candidate=storedRecords[species.id];
    if(valid(candidate)&&candidate.speciesId===species.id){d.bestRecords[species.id]={...candidate};ids.add(candidate.id);continue;}
    // Older saves have no history; seed a safe starting record from catches still in storage.
    const available=[...d.bucket,d.specimens[species.id]].filter((f):f is FishCatch=>!!f&&f.speciesId===species.id);
    const best=available.reduce<FishCatch|undefined>((current,fish)=>!current||fish.grams>current.grams?fish:current,undefined);
    if(best)d.bestRecords[species.id]={...best};
  }
  const pending=d.pendingCatch;
  if(!pending||!valid(pending.fish)||!valid(pending.record)||pending.record.speciesId!==pending.fish.speciesId||typeof pending.newRecord!=="boolean"||
    (pending.previousBest!==undefined&&(!valid(pending.previousBest)||pending.previousBest.speciesId!==pending.fish.speciesId))||
    !d.bucket.some(f=>f.id===pending.fish.id&&f.speciesId===pending.fish.speciesId&&f.grams===pending.fish.grams)||d.active){
    d.pendingCatch=null;
  }else{
    pending.locationId=fishingSpotOf(pending.locationId??"treasure_lake")??"treasure_lake";
    pending.fish={...pending.fish};pending.record={...pending.record};
    if(pending.previousBest)pending.previousBest={...pending.previousBest};
    const known=d.bestRecords[pending.fish.speciesId];
    if(!known||pending.record.grams>known.grams)d.bestRecords[pending.fish.speciesId]={...pending.record};
    ids.add(pending.record.id);if(pending.previousBest)ids.add(pending.previousBest.id);
  }
  for(const species of FISH_SPECIES){const itemId=`fish_specimen_${species.id}`;if(d.specimens[species.id])s.inventory[itemId]=1;else delete s.inventory[itemId];}
  const a=d.active;
  if(!a)d.active=null;
  if(a&&(!valid(a.fish)||a.id!==a.fish.id||ids.has(a.id)||!(["waiting","bite","fighting","ready"] as string[]).includes(a.phase)||typeof a.won!=="boolean"||![a.waitMs,a.biteMs,a.bar,a.velocity,a.fishPos,a.target,a.targetMs,a.progress,a.elapsedMs].every(Number.isFinite)||a.zoneWidth!==undefined&&(!Number.isFinite(a.zoneWidth)||a.zoneWidth<.1||a.zoneWidth>.35)||a.fightingMs!==undefined&&(!Number.isFinite(a.fightingMs)||a.fightingMs<0)||a.bar<0||a.bar>1-fishingZoneWidth(a)+.000001||a.progress<0||a.progress>1||a.fishPos<0||a.fishPos>1||a.elapsedMs<0))d.active=null;
  else if(a)a.locationId=fishingSpotOf(a.locationId??"treasure_lake")??"treasure_lake";
  const max=Math.max(0,...ids,d.active?.id??0);d.nextId=Number.isSafeInteger(d.nextId)?Math.max(max+1,d.nextId):max+1;
}
