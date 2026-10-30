/** 1.498 共享收藏的医院强化与旧卡包兼容入口。旧品质仅供迁移与追溯。 */
import type { CardPackEntry, CatCardDef, GameState, PetState } from '../types';
import { getDuelCard, STARTER_CARDS, legacyCardId } from './catDuelCards';
import { collectionDefId, ensureCatDuel, duelDeckLocked, makeDuelOffer, chooseDuelOffer, deckOf, saveDuelDeck } from './catDuelCollection';
import { gameDay } from './calendar';
import { advanceHours } from './time';
import { recordMoney } from './weekly';
import { canPerform, getAction } from './actions';
export type CardQuality=0|1|2|3;
export const QUALITY_LABEL:Record<CardQuality,string>={0:'普通',1:'强化＋',2:'旧稀有',3:'旧史诗'};
export const TRAIN_BONUS_STEP=1;
export const TRAIN_BONUS_MAX=1;
export function variantDefId(baseId:string,q:number,b:number):string{return baseId+(q>0||b>0?'_plus':'');}
export function parseVariantId(defId:string):{baseId:string;q:number;b:number}{const p=legacyCardId(defId);return {baseId:p.baseId,q:p.q,b:p.upgraded?Math.max(1,p.b):0};}
export function ensureVariantsRegistered():void{}
export function registerVariantCards():void{}
export function cardTrainable(def:CatCardDef|undefined):boolean{return !!def&&!legacyCardId(def.id).upgraded;}
/** Retained solely as a legacy pet record. Live combat uses the shared collection. */
export function createInitialPack():CardPackEntry[]{return STARTER_CARDS.flatMap((id,i)=>[0,1].map(n=>({uid:`cp_${i*2+n+1}`,defId:id})));}
export function ensureCardPack(pet:PetState):CardPackEntry[]{return pet.cardPack??(pet.cardPack=createInitialPack());}
export function cardPackOf(pet:PetState):readonly CardPackEntry[]{return pet.cardPack?.length?pet.cardPack:createInitialPack();}
export function packDeckIds(pack:CardPackEntry[]):string[]{return pack.map(c=>getDuelCard(c.defId)?.id??c.defId);}
export type CardOfferSource='train'|'duel'|'tournament';
export const OFFER_CHANCE_TRAIN=.15;
export const OFFER_CHANCE_DUEL=1;
export function rollCardOffer(state:GameState,source:CardOfferSource):string|null{return makeDuelOffer(state,source)?.choices[0]??null;}
export function acceptCardOffer(state:GameState,_petUid:string,defId:string):{ok:boolean;reason?:string}{const offer=state.catDuel?.offer;return offer?chooseDuelOffer(state,offer.id,defId):{ok:false,reason:'没有待领取的选牌奖励'};}
export const HOSPITAL_WEEK_LIMIT=3;
export const HOSPITAL_PRICES=[200,400,600] as const;
export function hospitalPrice(n:number):number{return HOSPITAL_PRICES[Math.max(0,Math.min(2,Math.floor(n)))];}
function weekIndexOf(state:GameState):number{return Math.floor(gameDay(state.time)/7);}
export function hospitalWeeklyUsed(state:GameState,kind:'special'|'focus'):number{return kind==='focus'?0:state.flags.hosp_week===weekIndexOf(state)?Number(state.flags.hosp_special_count)||0:0;}
function bumpWeekly(state:GameState):void{const wk=weekIndexOf(state);if(state.flags.hosp_week!==wk){state.flags.hosp_week=wk;state.flags.hosp_special_count=0;}state.flags.hosp_special_count=(Number(state.flags.hosp_special_count)||0)+1;}
export function canTrainCardAtHospital(state:GameState,kind:'special'|'focus'):{ok:boolean;reason?:string}{
  if(state.endingId)return {ok:false,reason:'本局生活已结束，不能继续训练'};
  if(state.flags.hospitalized)return {ok:false,reason:'正在住院，请先安心养病'};
  if(state.work?.active)return {ok:false,reason:'请先完成当前工作班次'};
  if(duelDeckLocked(state))return {ok:false,reason:'对决或赛事进行中，收藏卡强化暂时锁定'};
  const action=getAction(kind==='special'?'cat_special_train':'cat_focus_train');
  return action?canPerform(state,action):{ok:false,reason:'医院训练暂不可用'};
}
export function specialTrainCard(state:GameState,petUid:string,entryUid:string):{ok:boolean;reason?:string;cost?:number;newDefId?:string}{
  const access=canTrainCardAtHospital(state,'special');if(!access.ok)return access;
  const pet=state.pets.find(p=>p.uid===petUid);
  if(!pet||pet.fostered)return {ok:false,reason:'请先携带一只未寄养的猫咪'};
  const d=ensureCatDuel(state);const entry=d.collection.find(c=>c.uid===entryUid);
  if(!entry)return {ok:false,reason:'这张牌不在共享收藏中'};
  if(entry.upgraded)return {ok:false,reason:'这张牌已经是强化＋版，不能再次强化'};
  const used=hospitalWeeklyUsed(state,'special');if(used>=HOSPITAL_WEEK_LIMIT)return {ok:false,reason:'本周已经强化3次，下周再来吧'};
  const cost=hospitalPrice(used);if(state.player.money<cost)return {ok:false,reason:`强化需要 ${cost} 元，余额不足`};
  entry.upgraded=true;state.player.money-=cost;recordMoney(state,-cost);bumpWeekly(state);advanceHours(state,1);
  return {ok:true,cost,newDefId:collectionDefId(entry)};
}
/** Compatibility command: free removal from the loadout, never destroys a collectible. */
export function focusTrainCard(state:GameState,petUid:string,entryUid:string):{ok:boolean;reason?:string;cost?:number}{
  if(!deckOf(state,petUid).includes(entryUid))return {ok:false,reason:'这张收藏卡不在出战牌组中'};
  const result=saveDuelDeck(state,petUid,deckOf(state,petUid).filter(uid=>uid!==entryUid));return {...result,...(result.ok?{cost:0}:{})};
}
