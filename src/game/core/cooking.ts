/**
 * 烹饪系统 v0.92（v1.10 改造）：用背包里的生鲜食材，在**持有烹饪器具**时做饭。
 * 纯逻辑层（不 import actions.ts，避免循环依赖）。
 *
 * 设计：
 * - 菜市场买到的蔬菜/肉类是「生食材」，不能直接吃，必须带回住处下厨；
 * - v1.10：默认（含出租屋）没有烹饪器具，需去百货商场购买厨具；
 *   持「cook_utensil」flag 且非流浪/露宿（gov / ATM 露宿）即可做饭；
 * - 做好的饭菜「当场吃掉」（不再入包），直接结算属性 + 涨厨艺。
 */
import type { GameState, Effects } from "../types";
import { itemCount, removeItem, getItem } from "./items";

/** 菜谱定义 */
export interface RecipeDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 所需食材：itemId → 数量 */
  needs: Record<string, number>;
  /** 耗时（小时） */
  duration: number;
  /** 做完当场吃掉的结算效果 */
  effects: Effects;
  /** 需要的最低厨艺（缺省 0） */
  cookingSkill?: number;
}

/** 全部菜谱 */
export const RECIPES: RecipeDef[] = [
  {
    id: "dish_veg",
    name: "清炒时蔬",
    icon: "🥬",
    desc: "一把青菜下锅，家常但踏实（需蔬菜 ×1 → +36 饱腹，4 元吃一顿）",
    needs: { vegetable: 1 },
    duration: 1,
    effects: {
      satiety: 36,
      health: 6,
      mood: 4,
      skills: { cooking: 1 },
      log: "炒了盘时蔬，热腾腾地吃完了",
      cureStatuses: ["hungry"],
    },
  },
  {
    id: "dish_salad",
    name: "自制沙拉",
    icon: "🥗",
    desc: "蔬菜切一切拌一拌，省事又健康（需蔬菜 ×1 → +22 饱腹 +8 健康）",
    needs: { vegetable: 1 },
    duration: 0.5,
    effects: {
      satiety: 22,
      health: 8,
      mood: 2,
      log: "自己拌了份沙拉，比便利店的便宜多了",
      cureStatuses: ["hungry"],
    },
  },
  {
    id: "dish_meat",
    name: "红烧肉",
    icon: "🥩",
    desc: "小火慢炖，一口下去全是幸福感（需肉类 ×1 → +52 饱腹 +10 心情）",
    needs: { meat: 1 },
    duration: 1.5,
    effects: {
      satiety: 52,
      health: 4,
      mood: 10,
      skills: { cooking: 1 },
      log: "炖了锅红烧肉，香得邻居敲门",
      cureStatuses: ["hungry"],
    },
    cookingSkill: 1,
  },
  {
    id: "dish_full_meal",
    name: "两菜一汤",
    icon: "🍲",
    desc: "正经吃一顿家常饭，身心都被治愈（需蔬菜 ×1 + 肉类 ×1 → +72 饱腹，19 元一桌）",
    needs: { vegetable: 1, meat: 1 },
    duration: 2,
    effects: {
      satiety: 72,
      health: 10,
      mood: 14,
      stress: -8,
      skills: { cooking: 2 },
      log: "认真做了两菜一汤，久违地好好吃了顿饭",
      cureStatuses: ["hungry"],
    },
    cookingSkill: 2,
  },
  {
    id: "dish_steak",
    name: "香煎牛排",
    icon: "🥩",
    desc: "厨具套装限定：小火慢煎，配点黑椒汁（需肉类 ×1 → +66 饱腹 +16 心情，需厨艺 2）",
    needs: { meat: 1 },
    duration: 1.5,
    effects: {
      satiety: 66,
      health: 6,
      mood: 16,
      stress: -6,
      skills: { cooking: 2 },
      log: "用新厨具煎了块牛排，仪式感拉满",
      cureStatuses: ["hungry"],
    },
    cookingSkill: 2,
  },
];

const recipeMap = new Map(RECIPES.map((r) => [r.id, r]));

export function getRecipe(id: string): RecipeDef | undefined {
  return recipeMap.get(id);
}

/** 食材缺口描述（"蔬菜 ×1"），用于按钮禁用提示 */
export function missingIngredients(state: GameState, recipe: RecipeDef): string[] {
  const miss: string[] = [];
  for (const [itemId, need] of Object.entries(recipe.needs)) {
    const have = itemCount(state, itemId);
    if (have < need) {
      const def = getItem(itemId);
      miss.push(`${def?.name ?? itemId} ×${need - have}`);
    }
  }
  return miss;
}

/** 能否做这道菜（设施 / 食材 / 厨艺） */
export function canCook(state: GameState, recipeId: string): { ok: boolean; reason?: string } {
  const r = recipeMap.get(recipeId);
  if (!r) return { ok: false, reason: "没有这道菜的做法" };

  // v1.10：做饭需持烹饪器具（cook_utensil flag），且非流浪/露宿（gov / ATM 露宿不可）
  const homeless = state.living.mode === "gov" || (state.living.mode === "nightly" && (state.living.nightly ?? "atm") === "atm");
  if (!state.flags["cook_utensil"]) {
    return { ok: false, reason: "没有烹饪器具做不了饭——去百货商场买一套厨具" };
  }
  if (homeless) {
    return { ok: false, reason: "流浪在外没有地方做饭，先找个落脚的地方" };
  }
  const miss = missingIngredients(state, r);
  if (miss.length) {
    return { ok: false, reason: `食材不够：还差 ${miss.join("、")}，去菜市场买` };
  }
  if (r.cookingSkill && state.player.skills.cooking < r.cookingSkill) {
    return { ok: false, reason: `厨艺不足（需 ${r.cookingSkill} 级），先做点简单的练手` };
  }
  return { ok: true };
}

/**
 * 下厨：校验 → 扣食材 → 返回结算效果（由 actions 层负责 applyEffects/推进时间）。
 * 不在这里 applyEffects，保持本模块与 engine 解耦、便于单测。
 */
export function consumeIngredients(
  state: GameState,
  recipeId: string,
): { ok: boolean; reason?: string; recipe?: RecipeDef } {
  const check = canCook(state, recipeId);
  if (!check.ok) return check;
  const r = recipeMap.get(recipeId)!;
  for (const [itemId, need] of Object.entries(r.needs)) {
    removeItem(state, itemId, need);
  }
  return { ok: true, recipe: r };
}
