/**
 * v1.4 猫咪系统：数据 / 图鉴 / 获取（P1 基础架构）。
 * 纯逻辑层。养成（P2）与战斗（P3）在后续阶段扩展。
 */
import type { CatCombatAttrs, CatDef, CatPersonality, CatRarity, GameState, PetState } from "../types";
import { randomInt } from "../rng";
import { absoluteDay } from "./membership";
import { createInitialPack } from "./cardPack";
import catsData from "../data/cats.json";

export const CAT_DATA = catsData as unknown as { version: number; cats: CatDef[] };
export const CATS: CatDef[] = CAT_DATA.cats;

const catMap = new Map<string, CatDef>(CATS.map((c) => [c.id, c]));

export function getCatDef(catId: string): CatDef | undefined {
  return catMap.get(catId);
}

export function allCatDefs(): CatDef[] {
  return CATS;
}

/** 性格 → 属性修正（±10% 体系，参考 monster_rpg_project） */
const PERSONALITY_MOD: Record<CatPersonality, Partial<CatCombatAttrs>> = {
  bold: { atk: 1.1, def: 0.95 },
  calm: { def: 1.1, spd: 0.95 },
  lazy: { hp: 1.1, atk: 0.95 },
  lively: { spd: 1.1, hp: 0.95 },
  stubborn: { atk: 1.05, def: 1.05, spd: 0.95 },
};

export const CAT_PERSONALITIES = Object.keys(PERSONALITY_MOD) as CatPersonality[];

/** 随机性格（走 state.rng，可复现） */
export function randomPersonality(state: GameState): CatPersonality {
  return CAT_PERSONALITIES[randomInt(state.rng, 0, CAT_PERSONALITIES.length - 1)];
}

/** 计算某等级猫咪的战斗属性（基础 + 等级成长 + 性格修正 + 训练加成） */
export function computeCatAttrs(
  cat: CatDef,
  level: number,
  personality: CatPersonality,
  trainBonus?: Partial<CatCombatAttrs>,
): CatCombatAttrs {
  const mod = PERSONALITY_MOD[personality] ?? {};
  const raw = {
    hp: cat.base.hp + cat.growth.hp * (level - 1),
    atk: cat.base.atk + cat.growth.atk * (level - 1),
    def: cat.base.def + cat.growth.def * (level - 1),
    spd: cat.base.spd + cat.growth.spd * (level - 1),
  };
  return {
    hp: Math.max(1, Math.round(raw.hp * (mod.hp ?? 1)) + (trainBonus?.hp ?? 0)),
    atk: Math.max(1, Math.round(raw.atk * (mod.atk ?? 1)) + (trainBonus?.atk ?? 0)),
    def: Math.max(1, Math.round(raw.def * (mod.def ?? 1)) + (trainBonus?.def ?? 0)),
    spd: Math.max(1, Math.round(raw.spd * (mod.spd ?? 1)) + (trainBonus?.spd ?? 0)),
  };
}

/** 是否已拥有该猫种 */
export function hasCat(state: GameState, catId: string): boolean {
  return state.pets.some((p) => p.catId === catId);
}

/** 升到下一级所需经验（等级越高越慢） */
export function expToNext(level: number): number {
  return 40 + (level - 1) * 20;
}

/**
 * 获得经验并结算升级（P3 战斗奖励）。
 * 升级时重算战斗属性（基础 + 成长 + 性格 + 训练加成）。返回是否升级。
 */
export function gainCatExp(pet: PetState, amount: number): boolean {
  if (amount <= 0) return false;
  pet.exp += amount;
  let leveled = false;
  while (pet.exp >= expToNext(pet.level)) {
    pet.exp -= expToNext(pet.level);
    pet.level += 1;
    leveled = true;
  }
  if (leveled) {
    const def = getCatDef(pet.catId);
    if (def) pet.attrs = computeCatAttrs(def, pet.level, pet.personality, pet.trainBonus);
  }
  return leveled;
}

/** 收养猫咪：创建 PetState 并写入 state.pets，解锁图鉴。Boss 不可收养。 */
export function adoptCat(state: GameState, catId: string, name?: string): PetState | null {
  const def = getCatDef(catId);
  if (!def || def.rarity === "boss") return null;
  const personality = randomPersonality(state);
  const pet: PetState = {
    uid: `pet_${state.pets.length + 1}`,
    catId,
    icon: def.icon,
    name: name ?? def.name,
    personality,
    level: 1,
    exp: 0,
    attrs: computeCatAttrs(def, 1, personality),
    care: { satiety: 80, mood: 80, hygiene: 80 },
    acquiredDay: absoluteDay(state.time),
    // v1.37 卡包系统：收养即获得初始卡包（8 进攻 + 8 防守，均为普通品质）
    cardPack: createInitialPack(),
  };
  state.pets.push(pet);
  // v1.32：首次收养自动设为携带（后续收养不覆盖当前携带）
  if (!state.activePet) state.activePet = pet.uid;
  state.catFlags[`cat_${catId}`] = true;
  state.flags[`cat_adopted_${catId}`] = true;
  return pet;
}

/** v1.33 宠物店领养定价：稀有度 → 价格（元）。普通亲民，传说天价。 */
export const CAT_ADOPT_PRICE: Record<Exclude<CatRarity, "boss">, number> = {
  common: 800,
  rare: 3500,
  super: 12000,
  legend: 30000,
};

/** v1.38 宠物店可领养猫种：仅「黄金猫」（其他获取渠道：初始即橘猫、公园随机薄荷猫）。 */
const SHOP_CAT_IDS = ["golden"];
export function adoptableCats(): CatDef[] {
  return CATS.filter((c) => SHOP_CAT_IDS.includes(c.id));
}

/** 达成目标型获取：检查并发放（幂等，已拥有则跳过）。返回新收养的猫或 null。 */
export function checkCatAcquisition(state: GameState): PetState | null {
  for (const def of CATS) {
    if (!def.acquireGoal) continue;
    if (hasCat(state, def.id)) continue;
    if (goalMet(state, def.acquireGoal)) {
      return adoptCat(state, def.id);
    }
  }
  return null;
}

function goalMet(state: GameState, goal: NonNullable<CatDef["acquireGoal"]>): boolean {
  if (goal.money != null && state.player.money < goal.money) return false;
  if (goal.fame != null && state.player.stats.fame < goal.fame) return false;
  if (goal.skillMax && state.player.skills[goal.skillMax] < 10) return false;
  if (goal.flag && !state.flags[goal.flag]) return false;
  return true;
}
