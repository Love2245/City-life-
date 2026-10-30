import type { GameState, PetState } from '../types';
import type { CatDuelState, DuelCollectionCard, DuelOffer } from '../catDuelTypes';
import { DUEL_CARDS, DUEL_COPY_LIMIT, DUEL_MAX_DECK, DUEL_MIN_DECK, STARTER_CARDS, getDuelCard, legacyCardId } from './catDuelCards';
import { randomInt } from '../rng';

export function collectionDefId(c: DuelCollectionCard): string { return c.cardId+(c.upgraded?'_plus':''); }
function add(state: CatDuelState, cardId: string, upgraded=false, legacy?: DuelCollectionCard['legacy']): DuelCollectionCard {
  const c={uid:`dc_${++state.sequence}`,cardId,upgraded,...(legacy?{legacy}:{})};
  state.collection.push(c);return c;
}
export function createCatDuelState(pets: readonly PetState[]=[]): CatDuelState {
  const state:CatDuelState={rulesVersion:2,collection:[],decks:{},sequence:0,legacyDecks:{}};
  const migratedDecks:Record<string,string[]>={};
  for(const pet of pets){
    migratedDecks[pet.uid]=[];
    state.legacyDecks[pet.uid]=(pet.cardPack??[]).map(c=>({...c}));
    for(const old of pet.cardPack??[]){
      const parsed=legacyCardId(old.defId);if(!getDuelCard(parsed.baseId))continue;
      const imported=add(state,parsed.baseId,parsed.upgraded,{petUid:pet.uid,entryUid:old.uid,defId:old.defId,quality:parsed.q,bonus:parsed.b});
      migratedDecks[pet.uid].push(imported.uid);
    }
  }
  // 补足可用起手牌，不丢弃旧副本。所有猫共享同一份实例收藏。
  for(const id of STARTER_CARDS){
    const count=state.collection.filter(c=>c.cardId===id).length;
    for(let n=count;n<2;n++)add(state,id);
  }
  for(const pet of pets){const migrated=migratedDecks[pet.uid];state.decks[pet.uid]=checkCollectionDeck(state,migrated).ok?migrated:starterDeck(state);}
  return state;
}
export function starterDeck(state: CatDuelState): string[] {
  return STARTER_CARDS.flatMap(id=>state.collection.filter(c=>c.cardId===id).sort((a,b)=>Number(b.upgraded)-Number(a.upgraded)).slice(0,2).map(c=>c.uid));
}
/** Read-only selectors never repair reactive saves during a Svelte render. */
export function duelStateOf(state: GameState): CatDuelState { return state.catDuel??createCatDuelState(state.pets); }
export function ensureCatDuel(state: GameState): CatDuelState { return state.catDuel??(state.catDuel=createCatDuelState(state.pets)); }
export function deckOf(state: GameState,petUid: string): string[] {
  const d=duelStateOf(state);return d.decks[petUid]??starterDeck(d);
}
export function deckCheck(state: GameState,uids: readonly string[]): {ok:boolean;reason?:string} {
  return checkCollectionDeck(duelStateOf(state),uids);
}
function checkCollectionDeck(state:CatDuelState,uids:readonly string[]):{ok:boolean;reason?:string}{
  const collection=state.collection;
  if(uids.length<DUEL_MIN_DECK||uids.length>DUEL_MAX_DECK)return {ok:false,reason:`牌组须为 ${DUEL_MIN_DECK}–${DUEL_MAX_DECK} 张（当前 ${uids.length} 张）`};
  if(new Set(uids).size!==uids.length)return {ok:false,reason:'同一张收藏卡不能重复放入牌组'};
  const counts=new Map<string,number>();let attacks=0;
  for(const uid of uids){
    const c=collection.find(c=>c.uid===uid);const def=c&&getDuelCard(collectionDefId(c));
    if(!c||!def)return {ok:false,reason:'牌组包含不存在的收藏卡'};
    const count=(counts.get(c.cardId)??0)+1;counts.set(c.cardId,count);
    if(count>DUEL_COPY_LIMIT)return {ok:false,reason:`「${getDuelCard(c.cardId)?.name}」普通版与＋版合计最多 ${DUEL_COPY_LIMIT} 张`};
    if(def.type==='attack'||def.effect.poison)attacks++;
  }
  return attacks?{ok:true}:{ok:false,reason:'至少携带一张攻击牌或中毒牌，避免无法结束战斗'};
}
export function duelDeckLocked(state: GameState): boolean {
  const entry=state.catTournament?.entry;
  return !!state.catBattle||!!(entry?.started&&!entry.settled);
}
export function saveDuelDeck(state:GameState,petUid:string,uids:string[]):{ok:boolean;reason?:string}{
  if(duelDeckLocked(state))return {ok:false,reason:'对决或赛事进行中，参赛牌组已锁定'};
  if(!state.pets.some(p=>p.uid===petUid))return {ok:false,reason:'找不到这只猫咪'};
  const valid=deckCheck(state,uids);if(!valid.ok)return valid;
  ensureCatDuel(state).decks[petUid]=[...uids];return {ok:true};
}

/** Called on load/migration, never on every engine tick. Old pet data remains untouched. */
export function normalizeCatDuel(state:GameState):void {
  const d=ensureCatDuel(state);
  if(!Array.isArray(d.collection)||!d.collection.length){state.catDuel=createCatDuelState(state.pets);}
  const next=state.catDuel!;next.decks??={};next.legacyDecks??={};next.rulesVersion=2;
  const seen=new Set<string>();
  next.collection=next.collection.filter(c=>{
    if(!c||typeof c.uid!=='string'||seen.has(c.uid)||!getDuelCard(c.cardId))return false;
    c.upgraded=!!c.upgraded;seen.add(c.uid);return true;
  });
  next.sequence=Math.max(Number.isSafeInteger(next.sequence)?next.sequence:0,...next.collection.map(c=>Number(c.uid.replace(/^dc_/,''))||0));
  for(const id of STARTER_CARDS)while(next.collection.filter(c=>c.cardId===id).length<2)add(next,id);
  for(const pet of state.pets){
    const deck=next.decks[pet.uid];
    if(!deck||!deckCheck(state,deck).ok){
      if(deck)next.legacyDecks[`${pet.uid}:repaired`]=deck.map(uid=>({uid,defId:next.collection.find(c=>c.uid===uid)?.cardId??'unknown'}));
      next.decks[pet.uid]=starterDeck(next);
    }
  }
  if(next.offer&&(!Array.isArray(next.offer.choices)||!next.offer.choices.length||next.offer.choices.some(id=>!getDuelCard(id))))delete next.offer;
  if(state.catBattle&&!state.catBattle.duel){
    const b=state.catBattle;
    next.legacyBattle=JSON.parse(JSON.stringify(b));
    next.recovery={opponentId:b.opponentId,playerUid:b.playerUid,tournamentId:b.tournamentId,casual:b.casual};
    state.catBattle=undefined;
    delete state.flags.cat_battle_pending;
  }
  // Lock old in-progress tournaments on their next safe re-entry, with a legal shared deck.
  const entry=state.catTournament?.entry;
  if(entry?.started&&!entry.settled&&entry.lockedDeck){
    if(!state.pets.some(p=>p.uid===entry.lockedDeck!.petUid)||entry.lockedDeck.cards.some(c=>!getDuelCard(c.defId))){delete entry.lockedDeck;}
  }
}

export function makeDuelOffer(state:GameState,source:DuelOffer['source']):DuelOffer|null {
  if(state.flags.cat_duel_practice)return null;
  const d=ensureCatDuel(state);if(d.offer)return d.offer;
  const counts=new Map<string,number>();for(const c of d.collection)counts.set(c.cardId,(counts.get(c.cardId)??0)+1);
  const pool=[...DUEL_CARDS];
  const choices:string[]=[];
  while(pool.length&&choices.length<3){
    const unseen=pool.filter(c=>!counts.has(c.id)),underTwo=pool.filter(c=>(counts.get(c.id)??0)<2);const candidates=unseen.length?unseen:underTwo.length?underTwo:pool;
    const chosen=candidates[randomInt(state.rng,0,candidates.length-1)];
    choices.push(chosen.id);pool.splice(pool.findIndex(c=>c.id===chosen.id),1);
  }
  if(!choices.length)return null;
  return d.offer={id:`offer_${++d.sequence}`,source,choices};
}
export function chooseDuelOffer(state:GameState,offerId:string,cardId:string|null):{ok:boolean;reason?:string}{
  const d=ensureCatDuel(state);const offer=d.offer;
  if(!offer||offer.id!==offerId)return {ok:false,reason:'这份奖励已经领取或已失效'};
  if(cardId&&!offer.choices.includes(cardId))return {ok:false,reason:'这张牌不属于当前奖励'};
  if(cardId)add(d,cardId);
  delete d.offer;return {ok:true};
}
