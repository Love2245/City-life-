import {ensureCatDuel,deckOf,saveDuelDeck,makeDuelOffer} from '../src/game/core/catDuelCollection';
import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { adoptCat } from "../src/game/core/cat";
import { startBattle } from "../src/game/core/catBattle";
import {
  createInitialPack,
  ensureCardPack,
  acceptCardOffer,
  specialTrainCard,
  focusTrainCard,
  hospitalWeeklyUsed,
  HOSPITAL_PRICES,
  HOSPITAL_WEEK_LIMIT,
  parseVariantId,
  variantDefId,
} from "../src/game/core/cardPack";
import { getCardDef } from "../src/game/core/catBattle";
import type { GameState } from "../src/game/types";

function freshState(seed: number, money = 10000): GameState {
  const s = createInitialState(seed);
  adoptCat(s, "orange");
  s.player.money = money;
  s.locationId = "pet_hospital"; s.time.hour = 12;
  return s;
}

function packStats(s: GameState): { atk: number; def: number; skill: number; q0: number } {
  const pack = s.pets[0].cardPack ?? [];
  let atk = 0, def = 0, skill = 0, q0 = 0;
  for (const e of pack) {
    const c = getCardDef(e.defId);
    if (c?.type === "attack") atk++;
    else if (c?.type === "defend") def++;
    else skill++;
    if ((c?.quality ?? 0) === 0) q0++;
  }
  return { atk, def, skill, q0 };
}

describe("v1.37 卡包系统", () => {
  it('初始卡包为6种×2张，覆盖攻击、防御、抽牌和恢复',()=>{const s=freshState(1);expect(createInitialPack()).toHaveLength(12);expect(ensureCatDuel(s).collection).toHaveLength(12);expect(packStats(s)).toEqual({atk:4,def:4,skill:4,q0:12});});

  it('抽牌堆来自出战牌组，收藏中未装备的卡不进入战斗',()=>{const s=freshState(2),d=ensureCatDuel(s);d.collection.push({uid:'extra',cardId:'heavy_strike',upgraded:false});expect(startBattle(s,'wild_stray').ok).toBe(true);const b=s.catBattle!;expect(Object.values(b.duel!.cards)).toHaveLength(12);expect(Object.values(b.duel!.cards)).not.toContain('heavy_strike');});

  it('旧品质和多级强化都映射同一＋形态，不继续叠倍率',()=>{expect(getCardDef('scratch_q1')!.effect.power).toBeGreaterThan(getCardDef('scratch')!.effect.power!);expect(getCardDef('scratch_q3_b5')!.effect.power).toBe(getCardDef('scratch_plus')!.effect.power);});

  it('接受选牌后加入共享收藏，牌组需由玩家自行调整',()=>{const s=freshState(3),before=[...deckOf(s,s.activePet!)];const offer=makeDuelOffer(s,'duel')!;expect(acceptCardOffer(s,s.activePet!,offer.choices[0]).ok).toBe(true);expect(ensureCatDuel(s).collection).toHaveLength(13);expect(deckOf(s,s.activePet!)).toEqual(before);});

  it('寄养不删除旧卡包和共享收藏，但不能用寄养猫进行医院训练',()=>{const s=freshState(4),pet=s.pets[0],before=JSON.stringify(pet.cardPack);pet.fostered=true;const offer=makeDuelOffer(s,'duel')!;expect(acceptCardOffer(s,pet.uid,offer.choices[0]).ok).toBe(true);expect(specialTrainCard(s,pet.uid,ensureCatDuel(s).collection[0].uid).ok).toBe(false);expect(JSON.stringify(pet.cardPack)).toBe(before);});

  it('单张普通牌永久强化一次，三张分别收费200/400/600',()=>{const s=freshState(5),cards=ensureCatDuel(s).collection;for(let i=0;i<3;i++){const r=specialTrainCard(s,s.activePet!,cards[i].uid);expect(r.ok).toBe(true);expect(r.cost).toBe(HOSPITAL_PRICES[i]);expect(cards[i].upgraded).toBe(true);}expect(specialTrainCard(s,s.activePet!,cards[0].uid).ok).toBe(false);expect(specialTrainCard(s,s.activePet!,cards[3].uid).ok).toBe(false);expect(hospitalWeeklyUsed(s,'special')).toBe(3);expect(s.player.money).toBe(8800);});

  it('免费调整只移出牌组，保留收藏，且不能低于12张',()=>{const s=freshState(6),d=ensureCatDuel(s);d.collection.push({uid:'extra',cardId:'heavy_strike',upgraded:false});expect(saveDuelDeck(s,s.activePet!,[...deckOf(s,s.activePet!),'extra']).ok).toBe(true);const money=s.player.money,time=JSON.stringify(s.time);expect(focusTrainCard(s,s.activePet!,'extra')).toMatchObject({ok:true,cost:0});expect(d.collection).toHaveLength(13);expect(deckOf(s,s.activePet!)).toHaveLength(12);expect(focusTrainCard(s,s.activePet!,deckOf(s,s.activePet!)[0]).ok).toBe(false);expect(s.player.money).toBe(money);expect(JSON.stringify(s.time)).toBe(time);});

  it('周定价保持200/400/600，上限3次，旧变体映射＋',()=>{expect([...HOSPITAL_PRICES]).toEqual([200,400,600]);expect(HOSPITAL_WEEK_LIMIT).toBe(3);expect(variantDefId('scratch',1,0)).toBe('scratch_plus');expect(parseVariantId('scratch_q2_b4')).toMatchObject({baseId:'scratch',q:2,b:4});});
});
