/**
 * v1.4 P2 猫咪养成系统：喂食 / 清洁 / 玩耍 / 训练 / 状态衰减 / 用品加成。
 * 纯逻辑层。战斗（P3）在后续阶段扩展。
 * - 生存状态（饱食/心情/干净）独立于主角，随每日结算衰减
 * - 用品走背包（state.inventory），购买开销计入周记
 * - 训练采用「每日次数上限 + 收益递减」，受心情与用品加成影响
 */
import type { CatCombatAttrs, CatInjury, CatInjuryLevel, CatItemDef, CatTrainType, GameState, PetState } from "../types";
import { pushLog } from "../engine";
import { recordMoney } from "./weekly";
import { nextRandom } from "../rng";
import { getCatDef, computeCatAttrs } from "./cat";
import { addItem, removeItem, itemCount } from "./items";
import { gameDay } from "./calendar";
import catItemsData from "../data/catItems.json";

export const CAT_ITEM_DATA = catItemsData as unknown as { version: number; items: CatItemDef[] };
export const CAT_ITEMS: CatItemDef[] = CAT_ITEM_DATA.items;
/** 自动照料机沿用旧 ID，作为背包常驻设备并随存档持久化。 */
export const AUTO_FEEDER_ITEM_ID = "cat_auto_feeder";
// 保留旧存档 flag，跨版本继续执行每日最多一条自动照料汇总反馈。
const AUTO_CARE_NOTICE_DAY_FLAG = "cat_auto_feeder_notice_day";

const catItemMap = new Map<string, CatItemDef>(CAT_ITEMS.map((i) => [i.id, i]));

export function getCatItem(id: string): CatItemDef | undefined {
  return catItemMap.get(id);
}

export function allCatItems(): CatItemDef[] {
  return CAT_ITEMS;
}

/** 猫咪用品背包清单（catItems.json，独立于普通物品展示） */
export function catInventoryList(state: GameState): Array<{ item: CatItemDef; qty: number }> {
  const out: Array<{ item: CatItemDef; qty: number }> = [];
  for (const [id, qty] of Object.entries(state.inventory)) {
    const item = getCatItem(id);
    if (!item) continue;
    out.push({ item, qty });
  }
  out.sort((a, b) => a.item.name.localeCompare(b.item.name, "zh"));
  return out;
}

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

export const CARE_MAX = 100;
/** 饱食值是 0–100 的整数；低于 1/3 时（0–33）触发自动喂食。 */
export const AUTO_FEED_MIN_SATIETY = Math.ceil(CARE_MAX / 3);
/** 低于此阈值触发惩罚（饱食→属性下降 / 干净→心情额外下降） */
export const CARE_LOW = 30;
/** 低于此阈值触发严重惩罚 */
export const CARE_CRITICAL = 15;

/** 每日衰减（入睡结算时） */
export const DAILY_SATIETY_DECAY = 20;
export const DAILY_MOOD_DECAY = 10;
export const DAILY_HYGIENE_DECAY = 15;
/** v1.39 每日回复最大生命值的比例 */
export const DAILY_HP_RECOVER_PCT = 0.2;
/** 干净度过低时的心情额外衰减 */
export const DIRTY_MOOD_PENALTY = 5;

/** 清洁：花费与恢复 */
export const CLEAN_COST = 15;
export const CLEAN_HYGIENE = 40;
export const CLEAN_MOOD = 3;

/** 玩耍：心情恢复与饱食消耗 */
export const PLAY_MOOD = 12;
export const PLAY_SATIETY_COST = 2;

/** 训练：每日上限 / 基础收益 / 递减系数 / 花费 / 心情阈值 */
export const TRAIN_DAILY_LIMIT = 3;
export const TRAIN_BASE_GAIN = 2;
export const TRAIN_DIMINISH = 0.6;
export const TRAIN_COST = 20;
export const TRAIN_MOOD_THRESHOLD = 30;
/** 心情过低时训练效率惩罚 */
export const TRAIN_MOOD_EFF = 0.5;

export const CAT_TRAIN_TYPES: CatTrainType[] = ["atk", "def", "spd", "hp"];
export const TRAIN_LABEL: Record<CatTrainType, string> = {
  atk: "攻击",
  def: "防御",
  spd: "速度",
  hp: "体质",
};

/* ------------------------------------------------------------------ *
 * 宠物访问
 * ------------------------------------------------------------------ */

export function getPet(state: GameState, uid: string): PetState | undefined {
  const pet = state.pets.find((p) => p.uid === uid);
  return pet && !isCatFostered(pet) ? pet : undefined;
}

/** 寄养猫仍是玩家所有的猫，但暂时不能参与日常玩法。 */
export function isCatFostered(pet: PetState): boolean {
  return pet.fostered === true;
}

/** 当前可照顾、携带及参战的猫咪。 */
export function availableCatsOf(state: GameState): PetState[] {
  return state.pets.filter((pet) => !isCatFostered(pet));
}

/** 花鸟市场宠物商店的免费寄养入口；原地保留整只 PetState，避免等级/卡组等资料丢失。 */
export function fosterCat(state: GameState, uid: string): CatActionResult {
  if (state.locationId !== "flower_market") return { ok: false, reason: "请到花鸟市场宠物商店办理寄养" };
  const pet = state.pets.find((p) => p.uid === uid);
  if (!pet) return { ok: false, reason: "没有找到这只猫咪" };
  if (isCatFostered(pet)) return { ok: false, reason: `「${pet.name}」已经在寄养了` };
  if (state.catBattle?.playerUid === uid) {
    return { ok: false, reason: "当前对决结算并结束后才能寄养这只猫咪" };
  }
  pet.fostered = true;
  if (state.activePet === uid) state.activePet = undefined;
  pushLog(state, "🏠", `「${pet.name}」已在花鸟市场宠物商店免费寄养；它的状态、等级和卡组都会保留`);
  return { ok: true, verdict: `「${pet.name}」已免费寄养。寄养期间不会衰减、生病或跑掉，随时可以领回。` };
}

/** 在花鸟市场宠物商店领回寄养猫，不收费用，也不改动养成资料。 */
export function reclaimCat(state: GameState, uid: string): CatActionResult {
  if (state.locationId !== "flower_market") return { ok: false, reason: "请到花鸟市场宠物商店领回猫咪" };
  const pet = state.pets.find((p) => p.uid === uid);
  if (!pet || !isCatFostered(pet)) return { ok: false, reason: "没有找到这只寄养中的猫咪" };
  pet.fostered = false;
  pushLog(state, "🐾", `已从花鸟市场宠物商店免费领回「${pet.name}」`);
  return { ok: true, verdict: `「${pet.name}」已免费领回，原有状态和养成进度都保留着。` };
}

/** 当前携带的猫咪 */
export function activePetOf(state: GameState): PetState | undefined {
  return state.activePet ? getPet(state, state.activePet) : undefined;
}

/** 设置携带猫咪（undefined = 收起）。目标不存在返回 false。 */
export function setActivePet(state: GameState, uid: string | undefined): boolean {
  if (uid === undefined) {
    state.activePet = undefined;
    return true;
  }
  if (!getPet(state, uid)) return false;
  state.activePet = uid;
  return true;
}

/** v1.38 把携带的猫咪送回家（放回家里，不再携带） */
export function putCatHome(state: GameState): { ok: boolean; reason?: string } {
  const pet = activePetOf(state);
  if (!pet) return { ok: false, reason: "现在没有携带猫咪" };
  setActivePet(state, undefined);
  pushLog(state, "🏠", `把「${pet.name}」送回家待着了，它在家等你回来`);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * v1.39 生命值（战后保留 / 每日回复 / 归零需治疗）
 * ------------------------------------------------------------------ */

/** 猫咪生命上限（attrs.hp，随等级/训练重算） */
export function catMaxHp(pet: PetState): number {
  return Math.max(1, pet.attrs.hp);
}

/** 猫咪当前生命值（缺省 = 满血，兼容旧存档） */
export function catCurHp(pet: PetState): number {
  return pet.curHp == null ? catMaxHp(pet) : Math.max(0, Math.min(catMaxHp(pet), pet.curHp));
}

/** 设置当前生命值（钳制在 [0, 上限]） */
export function setCatHp(pet: PetState, hp: number): void {
  pet.curHp = Math.max(0, Math.min(catMaxHp(pet), Math.round(hp)));
}

/** 恢复生命值，返回实际恢复量 */
export function healCatHp(pet: PetState, amount: number): number {
  const before = catCurHp(pet);
  const actual = Math.max(0, Math.min(catMaxHp(pet) - before, Math.round(amount)));
  if (actual > 0) setCatHp(pet, before + actual);
  return actual;
}

/** 是否倒地（生命归零，需宠物医院治疗） */
export function catDowned(pet: PetState): boolean {
  return catCurHp(pet) <= 0;
}

/** 宠物医院恢复生命：按当前缺失量收费，恢复至满血 */
export function restoreCatHp(state: GameState, pet: PetState): CatActionResult {
  if (isCatFostered(pet)) return { ok: false, reason: `「${pet.name}」正在寄养，暂时不能治疗` };
  const max = catMaxHp(pet);
  const cur = catCurHp(pet);
  if (cur >= max) return { ok: false, reason: "「" + pet.name + "」生命值是满的，不需要治疗" };
  const missing = max - cur;
  const cost = Math.max(30, Math.round(missing * 0.5));
  if (state.player.money < cost) {
    return { ok: false, reason: `恢复生命需要 ${cost} 元，钱不够了` };
  }
  state.player.money -= cost;
  recordMoney(state, -cost);
  setCatHp(pet, max);
  pushLog(state, "🏥", `给「${pet.name}」做了生命恢复治疗，恢复 ${missing} 点 HP（-${cost} 元）`);
  return {
    ok: true,
    deltas: [
      { key: "money", label: "金钱", value: -cost },
      { key: "cat_hp", label: "生命", value: missing },
    ],
    verdict: `「${pet.name}」恢复了 ${missing} 点生命，又精神抖擞了。`,
  };
}

/* ------------------------------------------------------------------ *
 * 生存状态影响
 * ------------------------------------------------------------------ */

/** 饱食度过低 → 战斗属性下降（P3 战斗结算时应用）；受伤 → 属性下降 */
export function catAttrMultiplier(pet: PetState): number {
  let mult = 1;
  if (pet.care.satiety < CARE_CRITICAL) mult *= 0.6;
  else if (pet.care.satiety < CARE_LOW) mult *= 0.8;
  mult *= injuryAttrMultiplier(pet.injured);
  return mult;
}

/** 心情过低 → 训练效率减半；受伤 → 训练效率再降低；生病 → 训练效率再减半 */
export function catTrainEfficiency(pet: PetState): number {
  let eff = pet.care.mood < TRAIN_MOOD_THRESHOLD ? TRAIN_MOOD_EFF : 1;
  eff *= injuryTrainEfficiency(pet.injured);
  if (pet.sick) eff *= 0.5;
  return eff;
}

/** 有效战斗属性（基础属性 × 饱食修正 + 猫窝 DEF 加成） */
export function catBattleAttrs(state: GameState, pet: PetState): CatCombatAttrs {
  const mult = catAttrMultiplier(pet);
  const defBonus = catDefBonus(state);
  return {
    hp: Math.max(1, Math.round(pet.attrs.hp * mult)),
    atk: Math.max(1, Math.round(pet.attrs.atk * mult)),
    def: Math.max(1, Math.round(pet.attrs.def * mult) + defBonus),
    spd: Math.max(1, Math.round(pet.attrs.spd * mult)),
  };
}

/* ------------------------------------------------------------------ *
 * 用品加成（按已拥有最高档）
 * ------------------------------------------------------------------ */

/** 训练效率加成（玩具/训练道具/豪华猫粮） */
export function catTrainBoost(state: GameState): number {
  let boost = 0;
  for (const item of CAT_ITEMS) {
    if (!item.trainBoost) continue;
    if (itemCount(state, item.id) > 0) boost = Math.max(boost, item.trainBoost);
  }
  return boost;
}

/** 猫窝 DEF 加成（豪华档） */
export function catDefBonus(state: GameState): number {
  let bonus = 0;
  for (const item of CAT_ITEMS) {
    if (!item.defBonus) continue;
    if (itemCount(state, item.id) > 0) bonus = Math.max(bonus, item.defBonus);
  }
  return bonus;
}

/** 猫窝心情加成（每日结算时应用） */
export function catMoodBonus(state: GameState): number {
  let bonus = 0;
  for (const item of CAT_ITEMS) {
    if (item.cat !== "bed" || !item.mood) continue;
    if (itemCount(state, item.id) > 0) bonus = Math.max(bonus, item.mood);
  }
  return bonus;
}

/* ------------------------------------------------------------------ *
 * 养成操作
 * ------------------------------------------------------------------ */

export interface CatActionResult {
  ok: boolean;
  reason?: string;
  deltas?: Array<{ key: string; label: string; value: number }>;
  verdict?: string;
}

function clampCare(v: number): number {
  return Math.max(0, Math.min(CARE_MAX, v));
}

/** 实际增量（考虑已接近上限） */
function actualGain(prev: number, add: number): number {
  return Math.round(add - Math.max(0, prev + add - CARE_MAX));
}

/** 喂食：消耗猫粮恢复饱食（+心情）。itemId 缺省时自动用背包里最高档猫粮。 */
export function feedCat(
  state: GameState,
  pet: PetState,
  itemId?: string,
  opts: { silent?: boolean; clearSickness?: boolean } = {},
): CatActionResult {
  if (isCatFostered(pet)) return { ok: false, reason: `「${pet.name}」正在寄养，暂时不能照顾` };
  const item = itemId ? getCatItem(itemId) : bestFoodItem(state);
  if (!item) return { ok: false, reason: "背包里没有猫粮，先去买一些吧" };
  if (!removeItem(state, item.id, 1)) return { ok: false, reason: `背包里没有${item.name}了` };
  const satGain = actualGain(pet.care.satiety, item.satiety ?? 0);
  const moodGain = item.mood ? actualGain(pet.care.mood, item.mood) : 0;
  pet.care.satiety = clampCare(pet.care.satiety + (item.satiety ?? 0));
  pet.care.mood = clampCare(pet.care.mood + (item.mood ?? 0));
  // v1.39 喂猫粮可恢复少量生命值
  const hpGain = item.hp ? healCatHp(pet, item.hp) : 0;
  if (opts.clearSickness !== false) clearSicknessIfRecovered(state, pet, !opts.silent);
  state.flags["cat_cared_once"] = true;
  if (!opts.silent) {
    pushLog(
      state,
      item.icon,
      `给「${pet.name}」喂了${item.name}（饱食 +${satGain}${item.mood ? `，心情 +${moodGain}` : ""}${hpGain > 0 ? `，生命 +${hpGain}` : ""}）`,
    );
  }
  return {
    ok: true,
    deltas: [
      { key: "cat_satiety", label: "饱食", value: satGain },
      ...(item.mood ? [{ key: "cat_mood", label: "心情", value: moodGain }] : []),
      ...(hpGain > 0 ? [{ key: "cat_hp", label: "生命", value: hpGain }] : []),
    ],
    verdict: `${pet.name}吃得心满意足，冲你打了个呼噜。`,
  };
}

/**
 * 自动照料机 tick：照料所有未寄养的猫（不要求携带）。饱食低于 34 时消耗猫粮补至
 * 至少 34；干净低于 34 时自动恢复到 100。每游戏日最多汇总反馈一次。
 */
export function tickCatAutoFeeder(state: GameState): string[] {
  if (itemCount(state, AUTO_FEEDER_ITEM_ID) <= 0) return [];

  const fed: string[] = [];
  const cleaned: string[] = [];
  const stillHungry: string[] = [];
  let portions = 0;
  for (const pet of availableCatsOf(state)) {
    if (pet.care.satiety < AUTO_FEED_MIN_SATIETY) {
      let petPortions = 0;
      while (pet.care.satiety < AUTO_FEED_MIN_SATIETY) {
        const food = bestFoodItem(state);
        if (!food) break;
        const before = pet.care.satiety;
        const result = feedCat(state, pet, food.id, { silent: true, clearSickness: false });
        if (!result.ok || pet.care.satiety <= before) break;
        petPortions++;
        portions++;
      }
      if (petPortions > 0) fed.push(pet.name);
      if (pet.care.satiety < AUTO_FEED_MIN_SATIETY) stillHungry.push(pet.name);
    }
    if (pet.care.hygiene < AUTO_FEED_MIN_SATIETY) {
      pet.care.hygiene = CARE_MAX;
      cleaned.push(pet.name);
    }
  }

  if (fed.length === 0 && cleaned.length === 0 && stillHungry.length === 0) return [];
  const today = gameDay(state.time);
  if (state.flags[AUTO_CARE_NOTICE_DAY_FLAG] === today) return [];
  state.flags[AUTO_CARE_NOTICE_DAY_FLAG] = today;

  const details = [
    fed.length > 0 ? `为${fed.length}只猫补充${portions}份猫粮（${fed.join("、")}）` : "",
    cleaned.length > 0 ? `为${cleaned.length}只猫完成清洁（${cleaned.join("、")}）` : "",
  ].filter(Boolean).join("；");
  const shortage = stillHungry.length > 0
    ? `；猫粮不足，${stillHungry.join("、")}的饱食度仍低于 ${AUTO_FEED_MIN_SATIETY}`
    : "";
  return [`自动照料机：${details || "无须照料"}${shortage}`];
}

function bestFoodItem(state: GameState): CatItemDef | undefined {
  const tierOrder: Record<string, number> = { lux: 0, good: 1, basic: 2 };
  const foods = CAT_ITEMS.filter((i) => i.cat === "food").sort(
    (a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9),
  );
  for (const f of foods) {
    if (itemCount(state, f.id) > 0) return f;
  }
  return undefined;
}

/** 清洁：花钱恢复干净度（+心情）。开销计入周记。 */
export function cleanCat(state: GameState, pet: PetState): CatActionResult {
  if (isCatFostered(pet)) return { ok: false, reason: `「${pet.name}」正在寄养，暂时不能照顾` };
  if (state.player.money < CLEAN_COST) {
    return { ok: false, reason: `给猫洗澡需要 ${CLEAN_COST} 元，钱不够了` };
  }
  state.player.money -= CLEAN_COST;
  recordMoney(state, -CLEAN_COST);
  const hygGain = actualGain(pet.care.hygiene, CLEAN_HYGIENE);
  const moodGain = actualGain(pet.care.mood, CLEAN_MOOD);
  pet.care.hygiene = clampCare(pet.care.hygiene + CLEAN_HYGIENE);
  pet.care.mood = clampCare(pet.care.mood + CLEAN_MOOD);
  clearSicknessIfRecovered(state, pet);
  state.flags["cat_cared_once"] = true;
  pushLog(state, "🛁", `给「${pet.name}」洗了个澡（干净度 +${hygGain}，心情 +${moodGain}，-${CLEAN_COST} 元）`);
  return {
    ok: true,
    deltas: [
      { key: "money", label: "金钱", value: -CLEAN_COST },
      { key: "cat_hygiene", label: "干净度", value: hygGain },
      { key: "cat_mood", label: "心情", value: moodGain },
    ],
    verdict: `${pet.name}甩了甩毛，嫌弃地看了你一眼，但明显干净多了。`,
  };
}

/** 玩耍：消耗背包里最好的玩具恢复心情（玩具的 mood 生效；无玩具时基础恢复） */
export function playWithCat(state: GameState, pet: PetState): CatActionResult {
  if (isCatFostered(pet)) return { ok: false, reason: `「${pet.name}」正在寄养，暂时不能照顾` };
  const toy = bestToyItem(state);
  const moodBase = toy?.mood ? PLAY_MOOD + toy.mood : PLAY_MOOD;
  if (toy) removeItem(state, toy.id, 1);
  const moodGain = actualGain(pet.care.mood, moodBase);
  pet.care.mood = clampCare(pet.care.mood + moodBase);
  pet.care.satiety = clampCare(pet.care.satiety - PLAY_SATIETY_COST);
  clearSicknessIfRecovered(state, pet);
  state.flags["cat_cared_once"] = true;
  pushLog(
    state,
    toy?.icon ?? "🧶",
    `陪「${pet.name}」玩了一会儿${toy ? `（用掉了${toy.name}` : ""}，心情 +${moodGain}${toy ? "）" : ""}`,
  );
  return {
    ok: true,
    deltas: [
      { key: "cat_mood", label: "心情", value: moodGain },
      { key: "cat_satiety", label: "饱食", value: -PLAY_SATIETY_COST },
    ],
    verdict: `${pet.name}玩得尾巴直竖，扑来扑去，累得直喘气。`,
  };
}

/** 背包里最高档玩具（lux > good > basic） */
function bestToyItem(state: GameState): CatItemDef | undefined {
  const tierOrder: Record<string, number> = { lux: 0, good: 1, basic: 2 };
  const toys = CAT_ITEMS.filter((i) => i.cat === "toy").sort(
    (a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9),
  );
  for (const t of toys) {
    if (itemCount(state, t.id) > 0) return t;
  }
  return undefined;
}

/** v1.38 使用猫咪特殊用品（药水 / 净化剂 / 复活石说明） */
export function useCatItem(state: GameState, pet: PetState, itemId: string): CatActionResult {
  if (isCatFostered(pet)) return { ok: false, reason: `「${pet.name}」正在寄养，暂时不能使用用品` };
  const item = getCatItem(itemId);
  if (!item) return { ok: false, reason: "未知用品" };
  if (itemId === "cat_potion") {
    if (!pet.injured) return { ok: false, reason: "「" + pet.name + "」没有受伤，用不上药水" };
    if (!removeItem(state, item.id, 1)) return { ok: false, reason: `背包里没有${item.name}了` };
    pet.injured = undefined;
    pushLog(state, "🧪", `给「${pet.name}」用了一瓶猫用药水，伤势痊愈了！`);
    return { ok: true, deltas: [{ key: "cat_injury", label: "伤势", value: 0 }], verdict: "伤口愈合，猫咪又生龙活虎了。" };
  }
  // v1.39 生命药剂：恢复 50% 最大生命值（可把倒地猫咪拉回可参战状态）
  if (itemId === "cat_hp_potion") {
    if (!removeItem(state, item.id, 1)) return { ok: false, reason: `背包里没有${item.name}了` };
    const hpGain = healCatHp(pet, Math.round(catMaxHp(pet) * 0.5));
    if (hpGain <= 0) {
      addItem(state, item.id, 1);
      return { ok: false, reason: "「" + pet.name + "」生命值是满的，用不上药剂" };
    }
    pushLog(state, "💊", `给「${pet.name}」喂了一瓶生命药剂，恢复 ${hpGain} 点 HP`);
    return { ok: true, deltas: [{ key: "cat_hp", label: "生命", value: hpGain }], verdict: `${pet.name}喝了药剂，精神头回来了。` };
  }
  if (itemId === "cat_purifier") {
    if (!pet.sick) return { ok: false, reason: "「" + pet.name + "」没生病，用不上净化剂" };
    if (!removeItem(state, item.id, 1)) return { ok: false, reason: `背包里没有${item.name}了` };
    pet.sick = false;
    pet.neglectDays = 0;
    pet.consecutiveSickDays = 0;
    const moodGain = actualGain(pet.care.mood, 8);
    pet.care.mood = clampCare(pet.care.mood + 8);
    pushLog(state, "✨", `给「${pet.name}」用了净化剂，病气一扫而空（心情 +${moodGain}）`);
    return { ok: true, deltas: [{ key: "cat_mood", label: "心情", value: moodGain }], verdict: "猫咪精神焕发，蹭了蹭你的手。" };
  }
  if (itemId === "cat_revive") {
    return { ok: false, reason: "复活石会在对战中自动生效，不用提前使用" };
  }
  return { ok: false, reason: "这件用品不能直接使用" };
}

/** 训练：每日上限 + 收益递减 + 心情效率 + 用品加成。开销计入周记。 */
export function trainCat(state: GameState, pet: PetState, type: CatTrainType): CatActionResult {
  if (isCatFostered(pet)) return { ok: false, reason: `「${pet.name}」正在寄养，暂时不能训练` };
  if (catDowned(pet)) {
    return { ok: false, reason: "「" + pet.name + "」生命值归零倒下了，先带它去宠物医院治疗吧" };
  }
  if ((pet.trainedToday ?? 0) >= TRAIN_DAILY_LIMIT) {
    return { ok: false, reason: "今天训练次数用完了，明天再来吧" };
  }
  if (state.player.money < TRAIN_COST) {
    return { ok: false, reason: `训练需要 ${TRAIN_COST} 元，钱不够了` };
  }
  state.player.money -= TRAIN_COST;
  recordMoney(state, -TRAIN_COST);
  const count = pet.trainCounts?.[type] ?? 0;
  const baseGain = Math.max(1, Math.round(TRAIN_BASE_GAIN * Math.pow(TRAIN_DIMINISH, count)));
  const gain = Math.max(1, Math.round(baseGain * catTrainEfficiency(pet) * (1 + catTrainBoost(state))));
  pet.trainBonus = { ...(pet.trainBonus ?? {}), [type]: (pet.trainBonus?.[type] ?? 0) + gain };
  pet.trainedToday = (pet.trainedToday ?? 0) + 1;
  pet.trainCounts = { ...(pet.trainCounts ?? {}), [type]: count + 1 };
  const def = getCatDef(pet.catId);
  if (def) pet.attrs = computeCatAttrs(def, pet.level, pet.personality, pet.trainBonus);
  pet.care.mood = clampCare(pet.care.mood - 3);
  pushLog(state, "🥊", `「${pet.name}」完成了${TRAIN_LABEL[type]}训练（${TRAIN_LABEL[type]} +${gain}，-${TRAIN_COST} 元）`);
  return {
    ok: true,
    deltas: [
      { key: "money", label: "金钱", value: -TRAIN_COST },
      { key: `cat_${type}`, label: TRAIN_LABEL[type], value: gain },
    ],
    verdict: `${pet.name}训练得很卖力，${TRAIN_LABEL[type]}有所提升。`,
  };
}

/* ------------------------------------------------------------------ *
 * 每日结算
 * ------------------------------------------------------------------ */

/**
 * 每日衰减（跨天时调用）：饱食/心情/干净下降，干净度过低心情额外下降；
 * 重置训练计数；猫窝心情加成生效。返回需要提示的日志文案。
 */
export function tickCatCareDaily(state: GameState): string[] {
  const logs: string[] = [];
  const bedBonus = catMoodBonus(state);
  for (const pet of availableCatsOf(state)) {
    pet.care.satiety = clampCare(pet.care.satiety - DAILY_SATIETY_DECAY);
    pet.care.mood = clampCare(pet.care.mood - DAILY_MOOD_DECAY + bedBonus);
    pet.care.hygiene = clampCare(pet.care.hygiene - DAILY_HYGIENE_DECAY);
    // v1.39 每日回复最大生命值的 20%；倒地猫咪也会缓慢恢复，恢复到正值后即可参战。
    const hpRecover = Math.round(catMaxHp(pet) * DAILY_HP_RECOVER_PCT);
    if (hpRecover > 0 && catCurHp(pet) < catMaxHp(pet)) {
      const healed = healCatHp(pet, hpRecover);
      if (healed > 0) logs.push(`${pet.name}休息了一晚，生命恢复了 ${healed} 点`);
    }
    if (pet.care.hygiene < CARE_LOW) {
      pet.care.mood = clampCare(pet.care.mood - DIRTY_MOOD_PENALTY);
    }
    // 先根据设备运行前的自然日结状态判断是否康复，避免自动照料机间接代替治病。
    clearSicknessIfRecovered(state, pet);
    pet.trainedToday = 0;
    pet.trainCounts = {};
  }

  // 每日衰减后先自动喂食，再判定照顾疏忽；低于 34 点的猫会在当日日结时被补粮。
  logs.push(...tickCatAutoFeeder(state));

  const runaway: PetState[] = [];
  for (const pet of availableCatsOf(state)) {

    // v1.38 生病机制：连续低数值（饱食或心情 < 30）超过 2 天 → 生病
    if (pet.care.satiety < CARE_LOW || pet.care.mood < CARE_LOW) {
      pet.neglectDays = (pet.neglectDays ?? 0) + 1;
      if (pet.neglectDays >= 2 && !pet.sick) {
        pet.sick = true;
        logs.push(`${pet.name} 因为长期没人照顾，病倒了！喂食或陪玩能帮它恢复`);
      }
    } else {
      pet.neglectDays = 0;
    }
    if (pet.sick) {
      // 缺少计数器的旧存档从本次首次观测起算，绝不追溯既往病程。
      pet.consecutiveSickDays = Math.max(0, pet.consecutiveSickDays ?? 0) + 1;
      if (pet.consecutiveSickDays >= 7) runaway.push(pet);
    } else {
      pet.consecutiveSickDays = 0;
    }

    // 低数值提醒
    if (pet.care.satiety < CARE_LOW && itemCount(state, AUTO_FEEDER_ITEM_ID) <= 0) {
      logs.push(`${pet.name}饿得直叫，快喂点吃的吧`);
    }
    if (pet.care.mood < CARE_LOW) logs.push(`${pet.name}情绪低落，陪它玩玩吧`);
    if (pet.care.hygiene < CARE_LOW) logs.push(`${pet.name}身上脏兮兮的，该洗个澡了`);
    if ((pet.care.satiety < CARE_CRITICAL && itemCount(state, AUTO_FEEDER_ITEM_ID) <= 0)
      || pet.care.mood < CARE_CRITICAL || pet.care.hygiene < CARE_CRITICAL) {
      logs.push(`⚠️ ${pet.name}的某项状态已经非常低了，再不照顾可能会生病！`);
    }
  }
  if (runaway.length > 0) {
    const runawayUids = new Set(runaway.map((pet) => pet.uid));
    state.pets = state.pets.filter((candidate) => !runawayUids.has(candidate.uid));
    if (state.activePet && runawayUids.has(state.activePet)) state.activePet = undefined;
    logs.push(`😿 ${runaway.map((pet) => `「${pet.name}」`).join("、")}已经连续生病七天，悄悄跑掉了。猫咪图鉴和已有记录会保留。`);
  }
  return logs;
}

/** v1.38 数值恢复后清除生病状态（饱食与心情都回到健康线） */
export function clearSicknessIfRecovered(state: GameState, pet: PetState, emitLog = true): boolean {
  if (!pet.sick || isCatFostered(pet)) return false;
  if (pet.care.satiety >= CARE_LOW && pet.care.mood >= CARE_LOW) {
    pet.sick = false;
    pet.neglectDays = 0;
    pet.consecutiveSickDays = 0;
    if (emitLog) pushLog(state, "💚", `「${pet.name}」的病好了，又变得活蹦乱跳！`);
    return true;
  }
  return false;
}

/** v1.38 猫粮打包购买：小/中/大三档（仅对猫粮生效；非猫粮忽略 size） */
export type CatFoodSize = "small" | "medium" | "large";
export interface BuyCatItemOpts {
  size?: CatFoodSize;
}
/** 各档位：数量倍率 / 总价倍率（中=九五折×5、大=八折×25） */
export const CAT_FOOD_SIZE: Record<CatFoodSize, { qty: number; priceMul: number; label: string }> = {
  small: { qty: 1, priceMul: 1, label: "小包" },
  medium: { qty: 5, priceMul: 0.95, label: "中包" },
  large: { qty: 25, priceMul: 0.8, label: "大包" },
};

/** 购买猫咪用品：扣款（计入周记）+ 入背包。猫粮支持小/中/大包。 */
export function buyCatItem(state: GameState, itemId: string, opts?: BuyCatItemOpts): CatActionResult {
  const item = getCatItem(itemId);
  if (!item) return { ok: false, reason: "未知猫咪用品" };
  if (item.id === AUTO_FEEDER_ITEM_ID) {
    if (state.pets.length === 0) return { ok: false, reason: "先领养至少一只猫咪，才能购买自动照料机" };
    if (itemCount(state, item.id) > 0) return { ok: false, reason: "已经有一台自动照料机了，无需重复购买" };
  }
  const size = opts?.size ?? "small";
  let qty = 1;
  let price = item.price;
  if (item.cat === "food") {
    const sz = CAT_FOOD_SIZE[size];
    qty = sz.qty;
    price = Math.round(item.price * sz.qty * sz.priceMul);
  }
  if (state.player.money < price) {
    return { ok: false, reason: `买${item.name}需要 ${price} 元，钱不够了` };
  }
  state.player.money -= price;
  recordMoney(state, -price);
  addItem(state, item.id, qty);
  const sizeLabel = item.cat === "food" ? `（${CAT_FOOD_SIZE[size].label} ×${qty}）` : "";
  pushLog(state, item.icon, `买了${qty}份${item.name}${sizeLabel}（-${price} 元），装进了背包`);
  return {
    ok: true,
    deltas: [{ key: "money", label: "金钱", value: -price }],
    verdict: `${qty}份${item.name}${sizeLabel}已经装进背包，随时可以给猫咪用。`,
  };
}

/* ------------------------------------------------------------------ *
 * v1.33 P3 受伤 / 医院治疗
 * ------------------------------------------------------------------ */

export const INJURY_LABEL: Record<CatInjuryLevel, string> = {
  light: "轻伤",
  medium: "中伤",
  heavy: "重伤",
};

export const INJURY_ICON: Record<CatInjuryLevel, string> = {
  light: "🤕",
  medium: "😵",
  heavy: "💀",
};

/** 伤势 → 单次治疗费用（元） */
export function injuryTreatCost(level: CatInjuryLevel): number {
  switch (level) {
    case "light":
      return 30;
    case "medium":
      return 80;
    case "heavy":
      return 150;
    default:
      return 30;
  }
}

/** 伤势 → 训练效率倍率（轻 0.7 / 中 0.5 / 重 0.3） */
export function injuryTrainEfficiency(inj: CatInjury | undefined): number {
  if (!inj) return 1;
  switch (inj.level) {
    case "light":
      return 0.7;
    case "medium":
      return 0.5;
    case "heavy":
      return 0.3;
    default:
      return 1;
  }
}

/** 伤势 → 属性倍率（轻 0.9 / 中 0.75 / 重 0.6），用于战斗属性降档提示 */
export function injuryAttrMultiplier(inj: CatInjury | undefined): number {
  if (!inj) return 1;
  switch (inj.level) {
    case "light":
      return 0.9;
    case "medium":
      return 0.75;
    case "heavy":
      return 0.6;
    default:
      return 1;
  }
}

/** 伤势提升一级（light→medium→heavy），已是重伤不再加深 */
export function escalateInjury(inj: CatInjury | undefined): CatInjury {
  const level: CatInjuryLevel = !inj ? "light" : inj.level === "light" ? "medium" : "heavy";
  return { level, day: inj?.day ?? 0 };
}

/**
 * 对决失败置伤：随机轻/中/重（heavier=true 时至少中伤，用于对决赛战败）。
 * 已有伤势则加重一级，不降级。
 */
export function applyBattleInjury(
  state: GameState,
  pet: PetState,
  opts?: { heavier?: boolean },
): void {
  if (isCatFostered(pet)) return;
  const roll = randomInjuryLevel(state.rng);
  let level: CatInjuryLevel = opts?.heavier && roll === "light" ? "medium" : roll;
  if (pet.injured) level = escalateInjury(pet.injured).level;
  const prev = pet.injured?.level;
  pet.injured = { level, day: absoluteDayOf(state) };
  pushLog(
    state,
    INJURY_ICON[level],
    `「${pet.name}」在对决中落败，受了${INJURY_LABEL[level]}${prev ? `（${INJURY_LABEL[prev]}加重）` : ""}！去宠物医院治疗吧`,
  );
}

/** 随机伤势等级（轻 60% / 中 30% / 重 10%） */
function randomInjuryLevel(rng: { seed: number; calls: number }): CatInjuryLevel {
  const r = nextRandom(rng);
  if (r < 0.6) return "light";
  if (r < 0.9) return "medium";
  return "heavy";
}

function absoluteDayOf(state: GameState): number {
  const t = state.time;
  return (t.year - 2026) * 360 + (t.month - 1) * 30 + t.day;
}

/** 宠物医院治疗：按伤势收费 → 伤势降一级（重伤多次治疗）。返回是否治愈。 */
export function treatInjury(state: GameState, pet: PetState): CatActionResult {
  if (isCatFostered(pet)) return { ok: false, reason: `「${pet.name}」正在寄养，暂时不能治疗` };
  if (!pet.injured) return { ok: false, reason: "「" + pet.name + "」没有受伤，不需要治疗" };
  const cost = injuryTreatCost(pet.injured.level);
  if (state.player.money < cost) {
    return { ok: false, reason: `治疗${INJURY_LABEL[pet.injured.level]}需要 ${cost} 元，钱不够了` };
  }
  state.player.money -= cost;
  recordMoney(state, -cost);
  const was = pet.injured.level;
  const healed = was === "light";
  const nextLevel: CatInjuryLevel | undefined = healed ? undefined : was === "heavy" ? "medium" : "light";
  if (healed) {
    pet.injured = undefined;
  } else {
    pet.injured = { level: nextLevel!, day: pet.injured.day };
  }
  pushLog(
    state,
    "🏥",
    `给「${pet.name}」治疗${INJURY_LABEL[was]}（-${cost} 元）${healed ? "，痊愈了！" : `，伤势减轻为${INJURY_LABEL[nextLevel!]}，还需继续治疗`}`,
  );
  return {
    ok: true,
    deltas: [
      { key: "money", label: "金钱", value: -cost },
      { key: "cat_injury", label: "伤势", value: healed ? 0 : -1 },
    ],
    verdict: healed
      ? `「${pet.name}」的${INJURY_LABEL[was]}治好了，恢复活蹦乱跳。`
      : `「${pet.name}」的伤势减轻了，但还没完全好，改天再来复查。`,
  };
}
