/**
 * v1.42 自由烹饪逻辑。
 * 纯逻辑层：不依赖 UI / actions，便于存档迁移和单元测试。
 * 保留旧版 recipe id 和成品记录，菜谱统一使用具体食材和调料匹配。
 */
import type { GameState, Effects } from "../types";
import { applyEffects } from "../engine";
import { recordFoodEaten } from "./achievements";
import { getItem } from "./items";
import {
  cookingCategoryOf,
  canonicalCookingItemId,
  cookingItemCount,
  cookingStock,
  fridgeCount,
  hasFridge,
  canStoreInFridge,
  removeCookingItem,
  removeFromFridge,
  storeInFridge,
  type FridgeTier,
} from "./fridge";
import { hasFacility } from "./housing";

export interface RecipeDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 旧版直接行动使用的精确 itemId → 数量需求。 */
  needs: Record<string, number>;
  duration: number;
  effects: Effects;
  cookingSkill?: number;
  freeForm?: boolean;
  ingredientCategories?: Record<string, number>;
  seasonings?: string[];
  clue?: string;
}

const fx = (satiety: number, health: number, mood: number, log: string, cooking = 1): Effects => ({
  satiety, health, mood, skills: { cooking }, log, cureStatuses: ["hungry"],
});

/** 原有 24 道菜谱和统一进入工作台的泡面。 */
export const RECIPES: RecipeDef[] = [
  { id: "dish_veg", name: "清炒时蔬", icon: "🥬", clue: "卷心菜", desc: "一把卷心菜下锅，家常但踏实。", needs: { cabbage: 1 }, ingredientCategories: { cabbage: 1 }, duration: 1, effects: fx(36, 6, 4, "炒了盘时蔬，热腾腾地吃完了"), freeForm: true },
  { id: "dish_salad", name: "自制沙拉", icon: "🥗", clue: "番茄 + 沙拉酱", desc: "番茄拌上沙拉酱，省事又清爽。", needs: { tomato: 1 }, ingredientCategories: { tomato: 1 }, seasonings: ["salad_dressing"], duration: 0.5, effects: fx(22, 8, 2, "自己拌了份沙拉，比便利店的便宜多了"), freeForm: true },
  { id: "dish_meat", name: "红烧肉", icon: "🥩", clue: "猪肉 + 酱油 + 糖", desc: "小火慢炖，一口下去全是幸福感。", needs: { pork: 1 }, ingredientCategories: { pork: 1 }, seasonings: ["soy_sauce", "sugar"], duration: 1.5, effects: { ...fx(52, 4, 10, "炖了锅红烧肉，香得邻居敲门"), stress: -2 }, cookingSkill: 1, freeForm: true },
  { id: "dish_full_meal", name: "两菜一汤", icon: "🍲", clue: "卷心菜 + 猪肉 + 大米 + 盐", desc: "正经吃一顿家常饭，身心都被治愈。", needs: { cabbage: 1, pork: 1, rice: 1 }, ingredientCategories: { cabbage: 1, pork: 1, rice: 1 }, seasonings: ["salt"], duration: 2, effects: { ...fx(72, 10, 14, "认真做了两菜一汤，久违地好好吃了顿饭", 2), stress: -8 }, cookingSkill: 2, freeForm: true },
  { id: "dish_steak", name: "香煎牛排", icon: "🥩", clue: "牛肉 + 盐", desc: "一块牛肉煎出香气，给自己一点仪式感。", needs: { beef: 1 }, ingredientCategories: { beef: 1 }, seasonings: ["salt"], duration: 1.5, effects: { ...fx(66, 6, 16, "用新厨具煎了块牛排，仪式感拉满", 2), stress: -6 }, cookingSkill: 2, freeForm: true },

  { id: "pudding", name: "布丁", icon: "🍮", clue: "奶香甜点", desc: "奶香滑嫩，适合当作一天的小奖励。", needs: {}, duration: 1, ingredientCategories: { milk: 1, egg: 1 }, effects: fx(38, 3, 8, "做了一杯奶香布丁，入口细腻"), freeForm: true },
  { id: "egg_tart", name: "蛋挞", icon: "🥧", clue: "奶香甜点 + 甜味调料", desc: "牛奶、鸡蛋和糖烤出的酥香蛋挞。", needs: {}, duration: 1.5, ingredientCategories: { milk: 1, egg: 2 }, seasonings: ["sugar"], effects: fx(46, 4, 12, "烤出两个蛋挞，甜香飘满厨房"), freeForm: true },
  { id: "stir_fried_vegetables", name: "炒蔬菜", icon: "🥗", clue: "卷心菜 + 胡萝卜 + 洋葱", desc: "三样蔬菜快速翻炒，清爽又管饱。", needs: {}, duration: 1, ingredientCategories: { cabbage: 1, carrot: 1, onion: 1 }, effects: fx(52, 9, 5, "三份蔬菜下锅，炒出一盘亮晶晶的家常菜", 2), freeForm: true },
  { id: "salt_vegetables", name: "盐炒蔬菜", icon: "🧂", clue: "卷心菜 + 盐", desc: "卷心菜配盐，最简单的家常味。", needs: {}, duration: 0.75, ingredientCategories: { cabbage: 1 }, seasonings: ["salt"], effects: fx(34, 6, 4, "撒上一点盐，炒出最朴素的蔬菜香"), freeForm: true },
  { id: "salad", name: "沙拉", icon: "🥗", clue: "胡萝卜 + 沙拉酱", desc: "新鲜胡萝卜拌上沙拉酱，清爽开胃。", needs: {}, duration: 0.5, ingredientCategories: { carrot: 1 }, seasonings: ["salad_dressing"], effects: fx(28, 10, 5, "拌了一碗清爽沙拉，今天也要好好吃饭"), freeForm: true },
  { id: "small_stir_fry", name: "小炒肉", icon: "🍖", clue: "胡萝卜 + 洋葱 + 猪肉 + 酱油", desc: "蔬菜、肉片和酱油一同翻炒，锅气十足。", needs: {}, duration: 1.5, ingredientCategories: { carrot: 1, onion: 1, pork: 1 }, seasonings: ["soy_sauce"], effects: { ...fx(62, 6, 11, "蔬菜和肉片一起翻炒，小炒肉香得不行", 2), stress: -3 }, freeForm: true },
  { id: "tomato_egg", name: "番茄炒蛋", icon: "🍅", clue: "番茄 + 鸡蛋 + 盐", desc: "酸甜番茄配嫩滑鸡蛋，永远不会出错。", needs: {}, duration: 1, ingredientCategories: { tomato: 1, egg: 1 }, seasonings: ["salt"], effects: fx(50, 8, 9, "做了一盘番茄炒蛋，酸甜的香味让人胃口大开", 2), freeForm: true },
  { id: "egg_fried_rice", name: "蛋炒饭", icon: "🍚", clue: "大米 + 鸡蛋 + 酱油", desc: "隔夜米饭和鸡蛋翻炒，是忙碌日子的可靠一餐。", needs: {}, duration: 1, ingredientCategories: { rice: 1, egg: 1 }, seasonings: ["soy_sauce"], effects: fx(58, 5, 8, "一碗蛋炒饭出锅，米香和酱油香刚刚好", 2), freeForm: true },
  { id: "potato_beef", name: "土豆烧牛肉", icon: "🥘", clue: "土豆 + 牛肉 + 酱油", desc: "软糯土豆吸满牛肉汤汁，暖胃又耐饱。", needs: {}, duration: 2, ingredientCategories: { potato: 1, beef: 1 }, seasonings: ["soy_sauce"], effects: { ...fx(72, 8, 12, "土豆烧牛肉炖得软烂，吃完浑身暖和", 2), stress: -5 }, freeForm: true },
  { id: "spicy_chicken", name: "辣子鸡", icon: "🌶️", clue: "鸡肉 + 辣椒粉", desc: "香辣过瘾，给普通的一天加点劲。", needs: {}, duration: 1.5, ingredientCategories: { chicken: 1 }, seasonings: ["chili_powder"], effects: { ...fx(60, 3, 14, "做了一盘辣子鸡，辣得额头冒汗却停不下来", 2), stress: -4 }, freeForm: true },
  { id: "onion_beef", name: "洋葱炒牛肉", icon: "🧅", clue: "洋葱 + 牛肉 + 酱油", desc: "洋葱的甜和牛肉的香在锅里融合。", needs: {}, duration: 1.5, ingredientCategories: { onion: 1, beef: 1 }, seasonings: ["soy_sauce"], effects: fx(64, 7, 10, "洋葱炒牛肉出锅，甜香和肉香交织在一起", 2), freeForm: true },
  { id: "mushroom_egg", name: "蘑菇炒蛋", icon: "🍄", clue: "蘑菇 + 鸡蛋 + 盐", desc: "蘑菇鲜味配鸡蛋，清淡也有层次。", needs: {}, duration: 1, ingredientCategories: { mushroom: 1, egg: 1 }, seasonings: ["salt"], effects: fx(48, 8, 7, "蘑菇炒蛋鲜香出锅，厨房里都是春天的味道", 2), freeForm: true },
  { id: "cabbage_pork", name: "卷心菜炒肉", icon: "🥬", clue: "卷心菜 + 猪肉 + 酱油", desc: "脆甜卷心菜和猪肉片的家常组合。", needs: {}, duration: 1.25, ingredientCategories: { cabbage: 1, pork: 1 }, seasonings: ["soy_sauce"], effects: fx(62, 6, 9, "卷心菜炒肉带着家常锅气，吃得很踏实", 2), freeForm: true },
  { id: "chicken_rice", name: "鸡肉饭", icon: "🍗", clue: "大米 + 鸡肉 + 酱油", desc: "一锅米饭配上鲜嫩鸡肉，简单的一人餐。", needs: {}, duration: 1.5, ingredientCategories: { rice: 1, chicken: 1 }, seasonings: ["soy_sauce"], effects: fx(68, 7, 9, "做了一份鸡肉饭，米饭吸满了鸡汁", 2), freeForm: true },
  { id: "pork_rice", name: "猪肉饭", icon: "🍛", clue: "大米 + 猪肉 + 酱油", desc: "酱香猪肉盖在米饭上，饱腹感十足。", needs: {}, duration: 1.5, ingredientCategories: { rice: 1, pork: 1 }, seasonings: ["soy_sauce"], effects: fx(70, 5, 10, "猪肉饭热气腾腾，一碗下肚特别满足", 2), freeForm: true },
  { id: "sweet_milk_rice_porridge", name: "甜牛奶米粥", icon: "🥣", clue: "大米 + 牛奶 + 糖", desc: "牛奶和大米煮成软糯甜粥，适合清晨。", needs: {}, duration: 1.5, ingredientCategories: { rice: 1, milk: 1 }, seasonings: ["sugar"], effects: fx(55, 9, 11, "煮了一锅甜牛奶米粥，温柔地填饱了肚子", 2), freeForm: true },
  { id: "carrot_mushroom", name: "胡萝卜炒蘑菇", icon: "🥕", clue: "胡萝卜 + 蘑菇 + 盐", desc: "颜色明亮的素菜，鲜甜又有嚼劲。", needs: {}, duration: 1, ingredientCategories: { carrot: 1, mushroom: 1 }, seasonings: ["salt"], effects: fx(45, 10, 7, "胡萝卜炒蘑菇颜色鲜亮，清清爽爽一盘菜", 2), freeForm: true },
  { id: "spicy_pork", name: "香辣猪肉", icon: "🌶️", clue: "猪肉 + 酱油 + 辣椒粉", desc: "酱香和辣味让猪肉更有记忆点。", needs: {}, duration: 1.5, ingredientCategories: { pork: 1 }, seasonings: ["soy_sauce", "chili_powder"], effects: fx(66, 4, 13, "香辣猪肉下饭得很，今天多吃了半碗", 2), freeForm: true },
  { id: "vegetable_rice", name: "蔬菜焖饭", icon: "🍚", clue: "胡萝卜 + 大米 + 酱油", desc: "一锅焖饭把胡萝卜的清甜都锁进米粒。", needs: {}, duration: 1.5, ingredientCategories: { carrot: 1, rice: 1 }, seasonings: ["soy_sauce"], effects: fx(65, 9, 8, "蔬菜焖饭一锅出，省事又有滋有味", 2), freeForm: true },
  // 追加在末尾，保留旧烹饪书页面索引。
  { id: "instant_noodles", name: "煮泡面", icon: "🍜", clue: "泡面", desc: "用一份泡面简单煮一餐。", needs: {}, ingredientCategories: { noodles: 1 }, duration: 1, effects: { satiety: 26, mood: -3, health: -2, log: "煮了碗泡面，将就一顿", cureStatuses: ["hungry"] }, freeForm: true },
];

const recipeMap = new Map(RECIPES.map((r) => [r.id, r]));
export function getRecipe(id: string): RecipeDef | undefined { return recipeMap.get(id); }
export function recipeList(): RecipeDef[] { return RECIPES; }

export function isRecipeUnlocked(state: GameState, recipeId: string): boolean {
  return Array.isArray(state.cooking?.unlockedRecipeIds) && state.cooking.unlockedRecipeIds.includes(recipeId);
}

function ensureCooking(state: GameState): NonNullable<GameState["cooking"]> {
  if (!state.cooking || typeof state.cooking !== "object") state.cooking = { unlockedRecipeIds: [] };
  if (!Array.isArray(state.cooking.unlockedRecipeIds)) state.cooking.unlockedRecipeIds = [];
  return state.cooking;
}

function cookingEnvironment(state: GameState): { ok: boolean; reason?: string } {
  if (!state.flags?.["cook_utensil"]) return { ok: false, reason: "没有烹饪器具做不了饭——去商场内部的家居店买一套厨具" };
  if (state.living.mode === "gov" || (state.living.mode === "nightly" && !state.living.nightly)) {
    return { ok: false, reason: "当前仍在政府住宿/流浪，不能开火做饭；先租房或购买产权房" };
  }
  if (!hasFacility(state, "cook")) return { ok: false, reason: "当前住处没有灶台或厨房，先找一处能做饭的住处" };
  return { ok: true };
}

export function canUseCookingWorkbench(state: GameState): { ok: boolean; reason?: string } { return cookingEnvironment(state); }

export function missingIngredients(state: GameState, recipe: RecipeDef): string[] {
  const miss: string[] = [];
  const stock = cookingStock(state);
  for (const [itemId, need] of Object.entries(recipe.needs)) {
    const have = stock.find((row) => row.id === canonicalCookingItemId(itemId))?.qty ?? 0;
    if (have < need) miss.push(`${getItem(itemId)?.name ?? itemId} ×${need - have}`);
  }
  return miss;
}

export function canCook(state: GameState, recipeId: string): { ok: boolean; reason?: string } {
  const recipe = recipeMap.get(recipeId);
  if (!recipe) return { ok: false, reason: "没有这道菜的做法" };
  const env = cookingEnvironment(state);
  if (!env.ok) return env;
  const miss = missingIngredients(state, recipe);
  if (miss.length) return { ok: false, reason: `食材不够：还差 ${miss.join("、")}，去菜市场买` };
  if (recipe.cookingSkill && state.player.skills.cooking < recipe.cookingSkill) return { ok: false, reason: `厨艺不足（需 ${recipe.cookingSkill} 级），先做点简单的练手` };
  return { ok: true };
}

export function consumeIngredients(state: GameState, recipeId: string): { ok: boolean; reason?: string; recipe?: RecipeDef } {
  const check = canCook(state, recipeId);
  if (!check.ok) return check;
  const recipe = recipeMap.get(recipeId)!;
  const stock = cookingStock(state);
  const amounts: Record<string, number> = {};
  for (const [itemId, need] of Object.entries(recipe.needs)) {
    let remaining = need;
    const group = stock.find((row) => row.id === canonicalCookingItemId(itemId));
    for (const source of group?.sources ?? []) {
      const take = Math.min(remaining, source.qty);
      if (take > 0) amounts[source.id] = (amounts[source.id] ?? 0) + take;
      remaining -= take;
      if (remaining <= 0) break;
    }
    if (remaining > 0) return { ok: false, reason: "食材在操作过程中发生变化，请重试" };
  }
  if (!consumeCookingItems(state, amounts)) return { ok: false, reason: "食材在操作过程中发生变化，请重试" };
  return { ok: true, recipe };
}

export interface RecipeSelection {
  ok: boolean;
  ingredients: string[];
  seasonings: string[];
  missing: string[];
  reason?: string;
}

/** 只读取库存并规划原始 id，不扣料；旧库存与对应具体食材共用一份数量。 */
export function selectKnownRecipeIngredients(state: GameState, recipeId: string): RecipeSelection {
  const recipe = getRecipe(recipeId);
  const ingredients: string[] = [];
  const seasonings = [...(recipe?.seasonings ?? [])];
  const missing: string[] = [];
  if (!recipe?.freeForm || !isRecipeUnlocked(state, recipeId)) {
    return { ok: false, ingredients, seasonings, missing, reason: "尚未掌握这道菜" };
  }
  const stock = cookingStock(state);
  for (const [category, quantity] of Object.entries(recipe.ingredientCategories ?? {})) {
    let remaining = quantity;
    for (const row of stock.filter((item) => cookingCategoryOf(item.id) === category)) {
      for (const source of row.sources) {
        const take = Math.min(remaining, source.qty);
        for (let index = 0; index < take; index++) ingredients.push(source.id);
        remaining -= take;
        if (remaining === 0) break;
      }
      if (remaining === 0) break;
    }
    if (remaining > 0) missing.push(`${getItem(category)?.name ?? category} ×${remaining}`);
  }
  for (const id of seasonings) {
    if (cookingItemCount(state, id) < 1) missing.push(`${getItem(id)?.name ?? id} ×1`);
  }
  if (missing.length) return { ok: false, ingredients, seasonings, missing, reason: `还缺 ${missing.join("、")}` };
  if (recipe.cookingSkill && state.player.skills.cooking < recipe.cookingSkill) {
    return { ok: false, ingredients, seasonings, missing, reason: `厨艺需要 ${recipe.cookingSkill} 级` };
  }
  return { ok: true, ingredients, seasonings, missing };
}

function normalizedCounts(ingredients: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of ingredients) {
    const category = cookingCategoryOf(id);
    if (!category || category === "seasoning" || category === "prepared") return {};
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
}
/**
 * 自由烹饪采用“包含配方即可”：玩家可以多放一份食材或调料，
 * 只要配方所需的类别/数量都在投入中，就按最具体的配方结算。
 * 这样不会因为拿错顺序或顺手多放一份材料而必定得到失败作品。
 */
function containsIngredientCounts(actual: Record<string, number>, expected: Record<string, number>): boolean {
  return Object.entries(expected).every(([category, count]) => (actual[category] ?? 0) >= count);
}
function containsSeasonings(actual: string[], expected: string[] = []): boolean {
  const actualSet = new Set(actual);
  return expected.every((id) => actualSet.has(id));
}

export function matchFreeformRecipe(ingredients: string[], seasonings: string[]): RecipeDef | undefined {
  if (ingredients.length < 1 || ingredients.length > 3 || seasonings.length > 2 || new Set(seasonings).size !== seasonings.length) return undefined;
  const counts = normalizedCounts(ingredients);
  if (Object.keys(counts).length === 0) return undefined;
  const validSeasonings = seasonings.map((id) => cookingCategoryOf(id) === "seasoning" ? id : "");
  if (validSeasonings.some((id) => !id)) return undefined;
  const candidates = RECIPES.filter(
    (recipe) => recipe.freeForm && containsIngredientCounts(counts, recipe.ingredientCategories ?? {}) && containsSeasonings(validSeasonings, recipe.seasonings),
  );
  if (candidates.length === 0) return undefined;
  // 优先包含更多具体食材的配方，再用调料数量和总需求数稳定排序。
  candidates.sort((a, b) => {
    const aExact = Object.keys(a.ingredientCategories ?? {}).length;
    const bExact = Object.keys(b.ingredientCategories ?? {}).length;
    if (bExact !== aExact) return bExact - aExact;
    const aSeasonings = a.seasonings?.length ?? 0;
    const bSeasonings = b.seasonings?.length ?? 0;
    if (bSeasonings !== aSeasonings) return bSeasonings - aSeasonings;
    const aTotal = Object.values(a.ingredientCategories ?? {}).reduce((sum, n) => sum + n, 0);
    const bTotal = Object.values(b.ingredientCategories ?? {}).reduce((sum, n) => sum + n, 0);
    if (bTotal !== aTotal) return bTotal - aTotal;
    return a.id.localeCompare(b.id);
  });
  return candidates[0];
}

export type CookingQuality = "普通" | "美味" | "完美";
export function cookingQuality(state: GameState): CookingQuality {
  const skill = Math.max(0, state.player.skills?.cooking ?? 0);
  return skill >= 6 ? "完美" : skill >= 3 ? "美味" : "普通";
}
export function effectsForQuality(recipe: RecipeDef, quality: CookingQuality): Effects {
  const mult = quality === "完美" ? 1.3 : quality === "美味" ? 1.15 : 1;
  const out: Effects = { ...recipe.effects };
  for (const key of ["satiety", "health", "mood", "stress"] as const) {
    if (out[key] === undefined) continue;
    // 更高品质不应放大泡面原有的健康和心情损失。
    if ((key === "health" || key === "mood") && (out[key] ?? 0) < 0) continue;
    out[key] = Math.round((out[key] ?? 0) * mult);
  }
  return out;
}

/** 厨艺已在成品入库时结算；取出食用只应用食物效果。 */
export function storedMealEffects(recipe: RecipeDef, quality: CookingQuality): Effects {
  const { skills: _skills, ...effects } = effectsForQuality(recipe, quality);
  return { ...effects, log: `吃掉了${quality}品质的${recipe.name}` };
}

export function pendingCookOf(state: GameState): { recipe: RecipeDef; quality: CookingQuality; effects: Effects } | undefined {
  const pending = state.cooking?.pendingCook;
  if (!pending || (pending.quality !== "普通" && pending.quality !== "美味" && pending.quality !== "完美")) return undefined;
  const recipe = getRecipe(pending.recipeId);
  if (!recipe) return undefined;
  return { recipe, quality: pending.quality, effects: effectsForQuality(recipe, pending.quality) };
}

/** Resolve one saved result. A failed storage attempt leaves the meal pending for retry. */
export function settlePendingCook(
  state: GameState,
  disposition: "eat" | "store",
): { ok: true; recipe: RecipeDef; quality: CookingQuality } | { ok: false; reason: string } {
  const pending = pendingCookOf(state);
  if (!pending) return { ok: false, reason: "没有待处理的成品" };
  const { recipe, quality, effects } = pending;
  if (disposition === "store") {
    if (!storeCookedMeal(state, recipe.id, quality)) return { ok: false, reason: "冰箱空间不足；可立即食用这道菜，或先在厨房用掉一些库存" };
    applyEffects(state, { skills: effects.skills, log: `把${recipe.name}放进冰箱，等待合适的时候享用` }, recipe.icon);
  } else {
    applyEffects(state, effects, recipe.icon);
    recordFoodEaten(state, `recipe_${recipe.id}`);
  }
  delete state.cooking.pendingCook;
  return { ok: true, recipe, quality };
}

/**
 * L9 修复（v1.43）：按配方需求贪心算出「真正被这道菜用掉」的食材下标。
 *
 * 自由烹饪允许「包含配方即可」多放材料，但多放的部分不该被白扣 ——
 * 旧版是先 `removeCookingItem` 全部投入、再匹配配方，于是额外食材 / 调料
 * 照样被吞掉却不参与成品，可能误耗贵重材料。这里把「消耗」与「匹配」对齐：
 * 按具体类别扣除，与 `matchFreeformRecipe` 的口径一致。
 */
function consumedIngredientIndexes(recipe: RecipeDef, ingredients: string[]): Set<number> {
  const needExact = { ...recipe.ingredientCategories };
  const used = new Set<number>();
  ingredients.forEach((id, index) => {
    const category = cookingCategoryOf(id);
    if (!category) return;
    if ((needExact[category] ?? 0) > 0) {
      needExact[category] -= 1;
      used.add(index);
    }
  });
  return used;
}

/** 汇总后一次预检；若意外扣料失败，恢复背包和冰箱的原始数量。 */
function consumeCookingItems(state: GameState, amounts: Record<string, number>): boolean {
  const entries = Object.entries(amounts).filter(([, qty]) => qty > 0);
  if (entries.some(([id, qty]) => cookingItemCount(state, id) < qty)) return false;
  const before = entries.map(([id]) => ({ id, inventory: state.inventory[id], fridge: state.fridge?.items?.[id] }));
  for (const [id, qty] of entries) {
    if (removeCookingItem(state, id, qty)) continue;
    for (const saved of before) {
      if (saved.inventory === undefined) delete state.inventory[saved.id];
      else state.inventory[saved.id] = saved.inventory;
      if (state.fridge?.items) {
        if (saved.fridge === undefined) delete state.fridge.items[saved.id];
        else state.fridge.items[saved.id] = saved.fridge;
      }
    }
    return false;
  }
  return true;
}

export interface FreeformCookResult {
  ok: boolean;
  reason?: string;
  recipe?: RecipeDef;
  quality?: CookingQuality;
  failed?: boolean;
  storedMealId?: string;
  hasFridge: boolean;
  /** 未被这道菜计入、已原样留在背包 / 冰箱里的食材与调料 id（L9）。 */
  returned?: string[];
}

export function cookFreeform(state: GameState, ingredients: string[], seasonings: string[], selectedRecipeId?: string): FreeformCookResult {
  const env = cookingEnvironment(state);
  if (!env.ok) return { ok: false, reason: env.reason, hasFridge: hasFridge(state) };
  if (state.cooking?.pendingCook) return { ok: false, reason: "先处理已经做好的成品，再开始下一道菜", hasFridge: hasFridge(state) };
  if (ingredients.length < 1 || ingredients.length > 3) return { ok: false, reason: "食材需要选择 1–3 份", hasFridge: hasFridge(state) };
  if (seasonings.length > 2 || new Set(seasonings).size !== seasonings.length) return { ok: false, reason: "调料最多选择两种且不能重复", hasFridge: hasFridge(state) };
  if (Object.keys(normalizedCounts(ingredients)).length === 0) return { ok: false, reason: "请选择可烹饪的食材", hasFridge: hasFridge(state) };
  if (seasonings.some((id) => cookingCategoryOf(id) !== "seasoning")) return { ok: false, reason: "请选择有效调料", hasFridge: hasFridge(state) };
  const itemNeed: Record<string, number> = {};
  for (const id of ingredients) itemNeed[id] = (itemNeed[id] ?? 0) + 1;
  for (const [id, qty] of Object.entries(itemNeed)) if (cookingItemCount(state, id) < qty) return { ok: false, reason: `食材不足：${getItem(id)?.name ?? id}`, hasFridge: hasFridge(state) };
  for (const id of seasonings) if (cookingItemCount(state, id) < 1) return { ok: false, reason: `调料不足：${getItem(id)?.name ?? id}`, hasFridge: hasFridge(state) };

  // 先匹配再消耗：多放的材料不能再被无声吞掉。
  let recipe = matchFreeformRecipe(ingredients, seasonings);
  if (selectedRecipeId) {
    const selected = getRecipe(selectedRecipeId);
    if (!selected?.freeForm || !isRecipeUnlocked(state, selectedRecipeId)) return { ok: false, reason: "尚未掌握这道菜", hasFridge: hasFridge(state) };
    if (!containsIngredientCounts(normalizedCounts(ingredients), selected.ingredientCategories ?? {}) || !containsSeasonings(seasonings, selected.seasonings)) {
      return { ok: false, reason: "选中的菜谱材料不匹配，请重新选择", hasFridge: hasFridge(state) };
    }
    recipe = selected;
  }
  if (recipe?.cookingSkill && state.player.skills.cooking < recipe.cookingSkill) return { ok: false, reason: `厨艺不足（需 ${recipe.cookingSkill} 级）`, hasFridge: hasFridge(state) };
  if (!recipe) {
    // 维持原设计：这锅组合没有形成菜肴，失败作品连同投入一起销毁。
    const failedAmounts = { ...itemNeed };
    for (const id of seasonings) failedAmounts[id] = (failedAmounts[id] ?? 0) + 1;
    if (!consumeCookingItems(state, failedAmounts)) return { ok: false, reason: "食材在操作过程中发生变化，请重试", hasFridge: hasFridge(state) };
    return { ok: true, failed: true, hasFridge: hasFridge(state), reason: "这锅组合没有形成菜肴，失败作品已自动销毁" };
  }

  const returned: string[] = [];
  const usedIndexes = consumedIngredientIndexes(recipe, ingredients);
  const consumed: Record<string, number> = {};
  ingredients.forEach((id, index) => {
    if (usedIndexes.has(index)) consumed[id] = (consumed[id] ?? 0) + 1;
    else returned.push(id);
  });
  const declaredSeasonings = new Set(recipe.seasonings ?? []);
  for (const id of seasonings) {
    if (declaredSeasonings.has(id)) consumed[id] = (consumed[id] ?? 0) + 1;
    else returned.push(id);
  }
  if (!consumeCookingItems(state, consumed)) return { ok: false, reason: "食材在操作过程中发生变化，请重试", hasFridge: hasFridge(state) };

  const quality = cookingQuality(state); const cooking = ensureCooking(state);
  if (!cooking.unlockedRecipeIds.includes(recipe.id)) cooking.unlockedRecipeIds.push(recipe.id);
  cooking.lastRecipeId = recipe.id; cooking.lastQuality = quality;
  // Ingredients and cook time are already spent. Commit the result before UI work so
  // synchronous autosave/reload cannot leave the player with neither ingredients nor a meal.
  cooking.pendingCook = { recipeId: recipe.id, quality };
  return { ok: true, recipe, quality, hasFridge: hasFridge(state), storedMealId: `cooked:${recipe.id}`, returned };
}

export function eatCookedRecipe(state: GameState, recipeId: string, quality?: CookingQuality): Effects | undefined {
  const recipe = getRecipe(recipeId); if (!recipe) return undefined;
  const eff = effectsForQuality(recipe, quality ?? state.cooking?.lastQuality ?? "普通");
  applyEffects(state, eff, recipe.icon); return eff;
}
export function cookedMealSlots(_recipeId: string): number { return 2; }

/** 冰箱中成品使用的稳定 id；成品统一占两格。 */
export function cookedMealId(recipeId: string): string { return `cooked:${recipeId}`; }

export function recipeIdFromCookedMeal(itemId: string): string | undefined {
  return itemId.startsWith("cooked:") && itemId.length > 7 ? itemId.slice(7) : undefined;
}

export function storedMealQuality(state: GameState, itemId: string): CookingQuality {
  const batches = state.cooking?.mealQualityBatches?.[itemId];
  const lastBatch = Array.isArray(batches) ? batches[batches.length - 1] : undefined;
  if (lastBatch && isCookingQuality(lastBatch.quality)) return lastBatch.quality;
  const legacyQuality = state.cooking?.mealQualities?.[itemId];
  return isCookingQuality(legacyQuality) ? legacyQuality : "普通";
}

function isCookingQuality(value: unknown): value is CookingQuality {
  return value === "普通" || value === "美味" || value === "完美";
}

function normalizedMealQualityBatches(state: GameState, itemId: string): Array<{ quality: CookingQuality; quantity: number }> {
  const raw = state.cooking?.mealQualityBatches?.[itemId];
  if (!Array.isArray(raw)) return [];
  const byQuality = new Map<CookingQuality, number>();
  for (const row of raw) {
    if (!row || !isCookingQuality(row.quality) || !Number.isFinite(row.quantity) || row.quantity <= 0) continue;
    const quantity = Math.floor(row.quantity);
    if (quantity > 0) byQuality.set(row.quality, (byQuality.get(row.quality) ?? 0) + quantity);
  }
  return [...byQuality].map(([quality, quantity]) => ({ quality, quantity }));
}

/** 返回冰箱当前各品质的份数。旧档保留原有单一品质语义，不推测旧库存曾经的品质分布。 */
export function storedMealBatches(state: GameState, itemId: string): Array<{ quality: CookingQuality; quantity: number }> {
  let remaining = Math.max(0, Math.floor(fridgeCount(state, itemId)));
  if (remaining <= 0) return [];
  const byQuality = new Map<CookingQuality, number>();
  for (const batch of normalizedMealQualityBatches(state, itemId)) {
    const quantity = Math.min(batch.quantity, remaining);
    if (quantity <= 0) continue;
    byQuality.set(batch.quality, (byQuality.get(batch.quality) ?? 0) + quantity);
    remaining -= quantity;
  }
  if (remaining > 0) {
    const legacyQuality = state.cooking?.mealQualities?.[itemId];
    const quality = isCookingQuality(legacyQuality) ? legacyQuality : "普通";
    byQuality.set(quality, (byQuality.get(quality) ?? 0) + remaining);
  }
  return [...byQuality].map(([quality, quantity]) => ({ quality, quantity }));
}

/** 把刚做好的菜存入冰箱，并记录品质；容量不足时不产生任何副作用。 */
export function storeCookedMeal(state: GameState, recipeId: string, quality: CookingQuality): boolean {
  const itemId = cookedMealId(recipeId);
  if (!canStoreInFridge(state, itemId, 1)) return false;
  const previousQuantity = fridgeCount(state, itemId);
  const previousBatches = normalizedMealQualityBatches(state, itemId);
  const previouslyTracked = previousBatches.reduce((sum, batch) => sum + batch.quantity, 0);
  const hasUntrackedLegacyStock = previousQuantity > previouslyTracked;
  if (!storeInFridge(state, itemId, 1)) return false;
  const cooking = ensureCooking(state);
  cooking.mealQualityBatches ??= {};
  // 先构造完本地数组再写入。赋值后继续修改原数组会绕过 Svelte 深层代理，
  // 连续入库时玩家实际看到的品质批次会缺失，而纯对象单元测试无法发现。
  const batches = previousBatches;
  const existing = batches.find((batch) => batch.quality === quality);
  if (existing) existing.quantity += 1;
  else batches.push({ quality, quantity: 1 });
  cooking.mealQualityBatches[itemId] = batches;
  // Keep the old scalar field as a compatibility hint only when there was no
  // untracked stock whose original quality must remain untouched.
  if (!hasUntrackedLegacyStock) {
    cooking.mealQualities ??= {};
    cooking.mealQualities[itemId] = quality;
  }
  return true;
}

/** 消耗一份已冷藏成品并结算饱腹/健康/心情；没有该成品时安全失败。 */
export function eatStoredMeal(state: GameState, itemId: string, requestedQuality?: CookingQuality): { ok: boolean; reason?: string; recipe?: RecipeDef; quality?: CookingQuality; effects?: Effects } {
  const recipeId = recipeIdFromCookedMeal(itemId);
  const recipe = recipeId ? getRecipe(recipeId) : undefined;
  if (!recipe) return { ok: false, reason: "冰箱里没有这道菜" };
  const batches = storedMealBatches(state, itemId);
  const quality = requestedQuality ?? batches[0]?.quality ?? storedMealQuality(state, itemId);
  if (!isCookingQuality(quality) || (requestedQuality && !isCookingQuality(requestedQuality))) {
    return { ok: false, reason: "冰箱里没有指定品质的成品" };
  }
  if (!(batches.find((batch) => batch.quality === quality)?.quantity ?? 0)) {
    return { ok: false, reason: "冰箱里没有指定品质的成品" };
  }
  if (!removeFromFridge(state, itemId, 1)) return { ok: false, reason: "这份成品已经被取走了" };
  const recordedBatches = normalizedMealQualityBatches(state, itemId);
  const recorded = recordedBatches.find((batch) => batch.quality === quality);
  if (recorded) recorded.quantity -= 1;
  state.cooking?.mealQualityBatches && (state.cooking.mealQualityBatches[itemId] = recordedBatches.filter((batch) => batch.quantity > 0));
  if (state.cooking?.mealQualityBatches?.[itemId]?.length === 0) delete state.cooking.mealQualityBatches[itemId];
  const effects = storedMealEffects(recipe, quality);
  applyEffects(state, effects, recipe.icon);
  recordFoodEaten(state, `recipe_${recipe.id}`);
  if (fridgeCount(state, itemId) <= 0) delete state.cooking?.mealQualities?.[itemId];
  return { ok: true, recipe, quality, effects };
}
export type { FridgeTier };
