/**
 * v1.38 猫咪饰品系统：数据 / 购买 / 佩戴 / 赛事掉落。
 *
 * 效果在对决开始时生效（startBattle → applyAccessoryBattleEffects）：
 * 开局额外力量 / 开局额外格挡 / 最大 HP 提升 / 额外抽牌。
 * 获取途径：宠物用品店高价购买；猫咪争霸赛冠军按档位掉落不同品质饰品。
 */
import type { CatAccessoryDef, CatAccessoryEffect, GameState, PetState } from "../types";
import { randomInt } from "../rng";
import { recordMoney } from "./weekly";
import catAccessoriesData from "../data/catAccessories.json";

export const ACCESSORY_DATA = catAccessoriesData as unknown as { version: number; accessories: CatAccessoryDef[] };
export const ACCESSORIES: CatAccessoryDef[] = ACCESSORY_DATA.accessories;

/** 饰品品质中文名 */
export const ACC_QUALITY_LABEL: Record<CatAccessoryQuality, string> = {
  0: "普通",
  1: "精良",
  2: "稀有",
  3: "史诗",
};

const accessoryMap = new Map<string, CatAccessoryDef>(ACCESSORIES.map((a) => [a.id, a]));

export function getAccessoryDef(id: string): CatAccessoryDef | undefined {
  return accessoryMap.get(id);
}

export function allAccessories(): CatAccessoryDef[] {
  return ACCESSORIES;
}

/** 是否已拥有 */
export function hasAccessory(state: GameState, id: string): boolean {
  return (state.ownedAccessories[id] ?? 0) > 0;
}

/** 购买饰品：扣款入 ownedAccessories */
export function buyAccessory(state: GameState, id: string): { ok: boolean; reason?: string } {
  const def = getAccessoryDef(id);
  if (!def) return { ok: false, reason: "未知饰品" };
  if (state.player.money < def.price) return { ok: false, reason: `「${def.name}」需要 ${def.price} 元，钱不够了` };
  state.player.money -= def.price;
  recordMoney(state, -def.price);
  state.ownedAccessories[id] = (state.ownedAccessories[id] ?? 0) + 1;
  return { ok: true };
}

/** 佩戴饰品到指定猫咪 */
export function equipAccessory(state: GameState, petUid: string, id: string): { ok: boolean; reason?: string } {
  const pet = state.pets.find((p) => p.uid === petUid);
  if (!pet) return { ok: false, reason: "找不到这只猫咪" };
  if (!hasAccessory(state, id)) return { ok: false, reason: "还没有这件饰品" };
  pet.accessory = id;
  return { ok: true };
}

/** 卸下饰品 */
export function unequipAccessory(state: GameState, petUid: string): { ok: boolean; reason?: string } {
  const pet = state.pets.find((p) => p.uid === petUid);
  if (!pet) return { ok: false, reason: "找不到这只猫咪" };
  pet.accessory = undefined;
  return { ok: true };
}

/** 读取当前佩戴饰品的战斗效果 */
export function equippedAccessoryEffect(pet: PetState | undefined): CatAccessoryEffect | undefined {
  if (!pet?.accessory) return undefined;
  return getAccessoryDef(pet.accessory)?.effect;
}

/**
 * 赛事冠军按档位掉落饰品（品质随档位提升）。
 * 返回饰品 id（rank===1 冠军保证掉落，品质按档位权重随机）。
 */
export function rollAccessoryForTier(state: GameState, tierId: string): string {
  const weights: Array<[number, number, number, number]> = {
    tournament_primary: [0.6, 0.4, 0, 0],
    tournament_mid: [0.2, 0.6, 0.2, 0],
    tournament_advanced: [0, 0.3, 0.6, 0.1],
    ultimate: [0, 0, 0.7, 0.3],
  };
  const w = weights[tierId] ?? [0.6, 0.4, 0, 0];
  const roll = randomInt(state.rng, 1, 100);
  let q = 0;
  let acc = 0;
  for (let i = 0; i < w.length; i++) {
    acc += w[i] * 100;
    if (roll <= acc) {
      q = i;
      break;
    }
  }
  const pool = ACCESSORIES.filter((a) => a.quality === q);
  if (pool.length === 0) pool.push(...ACCESSORIES);
  return pool[randomInt(state.rng, 0, pool.length - 1)].id;
}
