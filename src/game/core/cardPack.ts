/**
 * v1.37 猫咪卡包系统：卡组持久化 / 品质变体卡 / 卡牌刷新 / 医院卡牌训练。
 *
 * 设计要点：
 * - 卡包挂在 PetState.cardPack（{ uid, defId }[]），defId 指向「含品质与强化变体」的卡牌定义；
 * - 品质变体在加载期由基础卡批量生成并注册进 cardMap（catBattle.registerCardDef），
 *   战斗引擎（resolveCard / getCardDef）零改动即可支持全部变体；
 * - defId 编码：`${baseId}` | `${baseId}_q{n}` | `${baseId}_b{n}` | `${baseId}_q{n}_b{n}`；
 * - 刷新渠道：户外锻炼 15% / 对决胜利 35% / 比赛胜利 100%（稀有度权重上移）；
 * - 医院两项训练均按「本周已用次数」定价 200/400/600，每周各限 3 次。
 */
import type { CardPackEntry, CatCardDef, CatCardEffect, GameState, PetState } from "../types";
import { randomInt } from "../rng";
import { gameDay } from "./calendar";
import { advanceHours } from "./time";
import { recordMoney } from "./weekly";
import { CARD_DATA, getCardDef, registerCardDef } from "./catBattle";

/* ------------------------------------------------------------------ *
 * 品质与变体卡生成
 * ------------------------------------------------------------------ */

/** 品质档位 0-3 */
export type CardQuality = 0 | 1 | 2 | 3;

export const QUALITY_LABEL: Record<CardQuality, string> = {
  0: "普通",
  1: "精良",
  2: "稀有",
  3: "史诗",
};

const QUALITY_SUFFIX: Record<CardQuality, string> = {
  0: "",
  1: "·精良",
  2: "·稀有",
  3: "·史诗",
};

/** 品质数值倍率（power/block/heal ×(1+0.3q)，healPct/statusChance +0.05q） */
const QUALITY_MULT = 0.3;
/** 医院特殊训练每级加值（power/block/heal +3/级，略高于猫咪自行锻炼的 ~2/次） */
export const TRAIN_BONUS_STEP = 3;
/** 特殊训练强化等级上限 */
export const TRAIN_BONUS_MAX = 5;

/** 由基础卡 id + 品质 + 强化级合成变体 defId */
export function variantDefId(baseId: string, q: number, b: number): string {
  let id = baseId;
  if (q > 0) id += `_q${q}`;
  if (b > 0) id += `_b${b}`;
  return id;
}

/** 解析变体 defId → { baseId, q, b }（基础卡返回自身） */
export function parseVariantId(defId: string): { baseId: string; q: number; b: number } {
  const m = defId.match(/^(.*?)(?:_q(\d))?(?:_b(\d))?$/);
  if (!m) return { baseId: defId, q: 0, b: 0 };
  return { baseId: m[1], q: Number(m[2] ?? 0), b: Number(m[3] ?? 0) };
}

/** 按（品质 × 强化级）调整卡牌效果 */
function boostedEffect(base: CatCardEffect | undefined, q: number, b: number): CatCardEffect | undefined {
  if (!base) return undefined;
  const e: CatCardEffect = { ...base };
  const mult = 1 + QUALITY_MULT * q;
  if (e.power != null) e.power = Math.round(e.power * mult) + TRAIN_BONUS_STEP * b;
  if (e.block != null) e.block = Math.round(e.block * mult) + TRAIN_BONUS_STEP * b;
  if (e.heal != null) e.heal = Math.round(e.heal * mult) + TRAIN_BONUS_STEP * b;
  if (e.healPct != null) e.healPct = Math.min(0.95, Math.round((e.healPct + 0.05 * q + 0.04 * b) * 100) / 100);
  if (e.statusChance != null) e.statusChance = Math.min(1, Math.round((e.statusChance + 0.05 * q + 0.05 * b) * 100) / 100);
  return e;
}

/** 该卡是否可在医院特殊训练中强化（纯抽牌/净化等固定效果卡不可强化） */
export function cardTrainable(def: CatCardDef | undefined): boolean {
  if (!def?.effect) return false;
  const e = def.effect;
  return def.type === "attack" || def.type === "defend" || e.healPct != null || e.heal != null || e.status != null;
}

/** 生成一张变体卡定义 */
function makeVariantDef(base: CatCardDef, q: number, b: number): CatCardDef {
  const name = base.name + QUALITY_SUFFIX[q as CardQuality] + (b > 0 ? ` +${b}` : "");
  const qualityNote: string[] = [];
  if (q > 0) qualityNote.push(`${QUALITY_LABEL[q as CardQuality]}品质，数值更强`);
  if (b > 0) qualityNote.push(`经特殊训练强化 +${b}`);
  return {
    ...base,
    id: variantDefId(base.id, q, b),
    name,
    desc: qualityNote.length ? `${base.desc}（${qualityNote.join("；")}）` : base.desc,
    effect: boostedEffect(base.effect, q, b),
    quality: q as CardQuality,
    baseId: base.id,
  };
}

/** 把全部基础卡的品质/强化变体注册进 cardMap（首次 getCardDef 时惰性执行，幂等） */
let _variantsRegistered = false;
export function ensureVariantsRegistered(): void {
  if (_variantsRegistered) return;
  _variantsRegistered = true;
  registerVariantCards();
}

/** 把全部基础卡的品质/强化变体注册进 cardMap（catBattle 模块加载完成时调用一次） */
export function registerVariantCards(): void {
  for (const base of CARD_DATA.cards) {
    for (let q = 0; q <= 3; q++) {
      for (let b = 0; b <= TRAIN_BONUS_MAX; b++) {
        if (q === 0 && b === 0) continue; // 基础卡本体已在 cardMap
        registerCardDef(makeVariantDef(base, q, b));
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * 卡包（猫咪卡组）
 * ------------------------------------------------------------------ */

/** 初始进攻卡（8 张，全部普通品质） */
const PACK_ATTACK_INIT = ["scratch", "scratch", "scratch", "scratch", "scratch", "pounce", "pounce", "pounce"];
/** 初始防守卡（8 张，全部普通品质） */
const PACK_DEFEND_INIT = ["guard", "guard", "guard", "guard", "guard", "fortify", "fortify", "fortify"];

/** 包内下一个可用 uid（cp_N，N 取现有最大值 +1） */
function nextPackUid(pack: CardPackEntry[]): string {
  let max = 0;
  for (const e of pack) {
    const n = Number(e.uid.replace(/^cp_/, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `cp_${max + 1}`;
}

/** v1.37 初始卡包：8 张进攻 + 8 张防守，均为普通品质 */
export function createInitialPack(): CardPackEntry[] {
  const pack: CardPackEntry[] = [];
  for (const defId of [...PACK_ATTACK_INIT, ...PACK_DEFEND_INIT]) {
    pack.push({ uid: `cp_${pack.length + 1}`, defId });
  }
  return pack;
}

/** 读取（缺省自动补建初始卡包）并写回宠物，保证旧存档平滑迁移 */
export function ensureCardPack(pet: PetState): CardPackEntry[] {
  if (pet.cardPack && pet.cardPack.length > 0) return pet.cardPack;
  pet.cardPack = createInitialPack();
  return pet.cardPack;
}

/** 卡包 → 抽牌堆 id 列表 */
export function packDeckIds(pack: CardPackEntry[]): string[] {
  return pack.map((e) => e.defId);
}

/* ------------------------------------------------------------------ *
 * 卡牌刷新（户外锻炼 / 对决胜利 / 比赛胜利）
 * ------------------------------------------------------------------ */

export type CardOfferSource = "train" | "duel" | "tournament";

/** 刷新触发概率：户外锻炼较低 / 对决胜利较高 */
export const OFFER_CHANCE_TRAIN = 0.15;
export const OFFER_CHANCE_DUEL = 0.35;

/** 品质权重：普通渠道（训练/对决）与比赛渠道（稀有度上移） */
const QUALITY_WEIGHTS_NORMAL: [number, number, number, number] = [0.6, 0.25, 0.12, 0.03];
const QUALITY_WEIGHTS_TOURNAMENT: [number, number, number, number] = [0, 0.45, 0.4, 0.15];

/** 卡牌刷新：随机一张基础卡 + 随机品质（比赛胜利权重上移），返回变体 defId */
export function rollCardOffer(state: GameState, source: CardOfferSource): string {
  const pool = CARD_DATA.cards.filter((c) => !c.id.endsWith("_exclusive"));
  const base = pool[randomInt(state.rng, 0, pool.length - 1)];
  const weights = source === "tournament" ? QUALITY_WEIGHTS_TOURNAMENT : QUALITY_WEIGHTS_NORMAL;
  // 万分之一精度掷品质（走 state.rng，可复现）
  const roll = randomInt(state.rng, 1, 10000) / 10000;
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  let q = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] / total;
    if (roll < acc) {
      q = i;
      break;
    }
  }
  return variantDefId(base.id, q, 0);
}

/** 接受卡牌刷新：加入卡包（下次对决进入抽牌堆） */
export function acceptCardOffer(state: GameState, petUid: string, defId: string): { ok: boolean; reason?: string } {
  const pet = state.pets.find((p) => p.uid === petUid);
  if (!pet) return { ok: false, reason: "找不到这只猫咪" };
  if (!getCardDef(defId)) return { ok: false, reason: "未知卡牌" };
  const pack = ensureCardPack(pet);
  pack.push({ uid: nextPackUid(pack), defId });
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * 宠物医院：特殊训练（强化）/ 专注训练（删卡）
 * ------------------------------------------------------------------ */

export const HOSPITAL_WEEK_LIMIT = 3;
/** 按本周已用次数定价：第 1/2/3 次 = 200/400/600 */
export const HOSPITAL_PRICES = [200, 400, 600] as const;

export function hospitalPrice(weeklyCount: number): number {
  return HOSPITAL_PRICES[Math.min(weeklyCount, HOSPITAL_PRICES.length - 1)];
}

/** 周序号（开局日起算，7 天一周） */
function weekIndexOf(state: GameState): number {
  return Math.floor(gameDay(state.time) / 7);
}

/** 读本周已用次数（跨周自动归零） */
function weeklyCount(state: GameState, countKey: string): number {
  const wk = weekIndexOf(state);
  return state.flags["hosp_week"] === wk ? ((state.flags[countKey] as number) || 0) : 0;
}

/** 本周次数 +1（跨周先重置周号） */
function bumpWeekly(state: GameState, countKey: string): void {
  const wk = weekIndexOf(state);
  if (state.flags["hosp_week"] !== wk) {
    state.flags["hosp_week"] = wk;
    state.flags["hosp_special_count"] = 0;
    state.flags["hosp_focus_count"] = 0;
  }
  state.flags[countKey] = ((state.flags[countKey] as number) || 0) + 1;
}

export function hospitalWeeklyUsed(state: GameState, kind: "special" | "focus"): number {
  return weeklyCount(state, kind === "special" ? "hosp_special_count" : "hosp_focus_count");
}

function findEntry(pet: PetState, entryUid: string): CardPackEntry | undefined {
  return ensureCardPack(pet).find((e) => e.uid === entryUid);
}

/**
 * 特殊训练：付费强化一张卡（攻 +伤害 / 防 +格挡 / 治疗 +效果），每周限 3 次。
 * 成功后该卡 defId 升级为更高强化级的变体，下次对决生效。
 */
export function specialTrainCard(
  state: GameState,
  petUid: string,
  entryUid: string,
): { ok: boolean; reason?: string; cost?: number; newDefId?: string } {
  const pet = state.pets.find((p) => p.uid === petUid);
  if (!pet) return { ok: false, reason: "找不到这只猫咪" };
  const entry = findEntry(pet, entryUid);
  if (!entry) return { ok: false, reason: "卡牌不在卡包里" };
  const def = getCardDef(entry.defId);
  if (!cardTrainable(def)) return { ok: false, reason: `「${def?.name ?? entry.defId}」效果固定，无法强化` };
  const { baseId, q, b } = parseVariantId(entry.defId);
  if (b >= TRAIN_BONUS_MAX) return { ok: false, reason: "这张卡已经强化到顶了（+5）" };

  const used = hospitalWeeklyUsed(state, "special");
  if (used >= HOSPITAL_WEEK_LIMIT) return { ok: false, reason: `本周特殊训练次数已用完（${HOSPITAL_WEEK_LIMIT} 次）` };
  const cost = hospitalPrice(used);
  if (state.player.money < cost) return { ok: false, reason: `本次训练需要 ${cost} 元，钱不够了` };

  state.player.money -= cost;
  recordMoney(state, -cost);
  entry.defId = variantDefId(baseId, q, b + 1);
  bumpWeekly(state, "hosp_special_count");
  advanceHours(state, 1);
  return { ok: true, cost, newDefId: entry.defId };
}

/**
 * 专注训练：付费永久删除一张卡精简卡组，每周限 3 次。
 * 至少各保留 1 张进攻卡与防守卡，防止卡组报废。
 */
export function focusTrainCard(
  state: GameState,
  petUid: string,
  entryUid: string,
): { ok: boolean; reason?: string; cost?: number } {
  const pet = state.pets.find((p) => p.uid === petUid);
  if (!pet) return { ok: false, reason: "找不到这只猫咪" };
  const pack = ensureCardPack(pet);
  const entry = pack.find((e) => e.uid === entryUid);
  if (!entry) return { ok: false, reason: "卡牌不在卡包里" };
  const def = getCardDef(entry.defId);

  const used = hospitalWeeklyUsed(state, "focus");
  if (used >= HOSPITAL_WEEK_LIMIT) return { ok: false, reason: `本周专注训练次数已用完（${HOSPITAL_WEEK_LIMIT} 次）` };
  const cost = hospitalPrice(used);
  if (state.player.money < cost) return { ok: false, reason: `本次训练需要 ${cost} 元，钱不够了` };

  // 保底校验：删除后仍需各留 ≥1 张进攻 / 防守卡
  const rest = pack.filter((e) => e.uid !== entryUid);
  const atk = rest.filter((e) => getCardDef(e.defId)?.type === "attack").length;
  const dfs = rest.filter((e) => getCardDef(e.defId)?.type === "defend").length;
  if (def?.type === "attack" && atk < 1) return { ok: false, reason: "至少要保留 1 张进攻卡" };
  if (def?.type === "defend" && dfs < 1) return { ok: false, reason: "至少要保留 1 张防守卡" };

  state.player.money -= cost;
  recordMoney(state, -cost);
  pet.cardPack = rest;
  bumpWeekly(state, "hosp_focus_count");
  advanceHours(state, 1);
  return { ok: true, cost };
}
