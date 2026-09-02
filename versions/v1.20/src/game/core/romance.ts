/**
 * 都市生活 v0.99 — 社交互动核心
 * 架构铁律：本文件允许 import engine / time / items（承载需结算的互动函数）。
 */
import type { GameState, ResultDelta } from "../types";
import { applyEffects, pushLog } from "../engine";
import { advanceHours } from "./time";
import { gameDay } from "./calendar";
import { chance } from "../rng";
import { getItem, itemCount, removeItem } from "./items";
import { getNpcDef, allNpcs, npcNick } from "./npcs";
import { ensureRelationship, addAffinity, findRelationship, canBorrow } from "./relationships";
import type { PhoneResult } from "./phone";

/**
 * v0.991 人物显示名：陌生人显示「？？？」，建立初步关系后显示占位称呼（nick），真名留待 1.0。
 * v0.992 修复：只要建立关系条目（偶遇/互动过）即视为「初步关系」，不再要求 state 字段脱离 stranger。
 */
export function npcDisplayName(state: GameState, npcId: string): string {
  const rel = findRelationship(state, npcId);
  return rel ? npcNick(npcId) : "？？？";
}

// 约会好感递增分档：约会次数越多，单次增益越小
export const DATE_TIERS: { min: number; gain: number }[] = [
  { min: 0, gain: 8 },
  { min: 3, gain: 6 },
  { min: 6, gain: 4 },
  { min: 10, gain: 2 },
];

function dateGain(dateCount: number): number {
  let g = DATE_TIERS[0].gain;
  for (const t of DATE_TIERS) if (dateCount >= t.min) g = t.gain;
  return g;
}

export interface SocialAvailability {
  call: boolean;
  gift: boolean;
  date: boolean;
  confess: boolean;
  break: boolean;
  borrow: boolean;
  crash: boolean;
  repay: boolean;
}

export function socialActionsAvailable(state: GameState, npcId: string): SocialAvailability {
  const rel = findRelationship(state, npcId);
  const aff = rel?.affinity ?? 0;
  const lover = rel?.state === "lover";
  const blocked = rel?.state === "blocked";
  const dates = state.romance.dateCount[npcId] ?? 0;
  return {
    call: !blocked,
    gift: giftableCount(state) > 0 && !blocked,
    date: !blocked && aff >= 20 && !lover,
    confess: !blocked && aff >= 85 && dates >= 3,
    break: lover,
    borrow: canBorrow(state, npcId),
    crash: !blocked && !!rel && state.living.mode === "nightly",
    repay: !!rel?.loan,
  };
}

/** 背包中可赠送物品总价值（送礼能力直观指标；仅统计可送物品） */
export function giftableCount(state: GameState): number {
  return Object.entries(state.inventory).reduce((s, [id, qty]) => {
    return s + (isGiftable(id) ? giftValue(id) * qty : 0);
  }, 0);
}

/** 是否可作为礼物赠送：消耗品或带礼物类标签。
 *  v0.992 修复：原先全部物品都可送（手机/驾驶本/月卡也能送出去，送完手机还能用但背包里没了）。 */
export function isGiftable(itemId: string): boolean {
  const def = getItem(itemId);
  if (!def) return false;
  if (def.consumable) return true;
  const tags = def.tags ?? [];
  return tags.includes("奢侈品") || tags.includes("农产") || tags.includes("礼物");
}

/** 礼物价值分档（0.985 物品体系：按 tags 判定） */
export function giftValue(itemId: string): number {
  const def = getItem(itemId);
  const tags = def?.tags ?? [];
  if (tags.includes("奢侈品")) return 15;
  if (tags.includes("农产")) return 8;
  return 4;
}

/** 约会：消耗金钱/时间，按分档加好感 */
export function dateNpc(state: GameState, npcId: string): PhoneResult {
  const def = getNpcDef(npcId);
  if (!def?.romanceable) {
    return { ok: false, text: `${def?.name ?? npcNick(npcId)} 不是可以约会的人`, reason: "not_romanceable" };
  }
  const rel = findRelationship(state, npcId);
  const aff = rel?.affinity ?? 0;
  if (aff < 20) return { ok: false, text: "好感还不够，先多接触吧", reason: "affinity_low" };
  const cost = 30;
  if (state.player.money < cost) return { ok: false, text: "钱不够，约不起", reason: "no_money" };

  const count = (state.romance.dateCount[npcId] ?? 0) + 1;
  const gain = dateGain(count);
  applyEffects(state, { money: -cost, mood: 5, stress: -3 });
  advanceHours(state, 3);
  addAffinity(state, npcId, gain, "date");
  state.romance.dateCount[npcId] = count;
  const text = `和${def.name}约会了，好感 +${gain}`;
  pushLog(state, "💕", text);
  return { ok: true, text, deltas: [{ key: "金钱", label: "金钱", value: -cost }] };
}

/** 送礼：价值分档 + 喜恶加成（消耗 inventory 计数）。v0.992 增加可送校验（防送出手机/驾照等功能性物品） */
export function giftNpc(state: GameState, npcId: string, itemId: string): PhoneResult {
  const have = itemCount(state, itemId);
  if (have <= 0) return { ok: false, text: "背包里没有这个礼物", reason: "no_item" };
  const def = getItem(itemId);
  if (!def) return { ok: false, text: "物品不存在", reason: "unknown_item" };
  if (!isGiftable(itemId)) {
    return { ok: false, text: `${def.name}不能当礼物送人`, reason: "not_giftable" };
  }

  const base = giftValue(itemId);
  const npcDef = getNpcDef(npcId);
  let bonus = 0;
  if (npcDef?.likes?.includes(itemId)) bonus += 3;
  if (npcDef?.dislikes?.includes(itemId)) bonus -= 3;
  const total = Math.max(1, base + bonus);

  addAffinity(state, npcId, total, "gift");
  removeItem(state, itemId);
  applyEffects(state, { mood: 2 });
  const text = `把${def.name}送给了${npcDef?.name ?? npcNick(npcId)}，TA挺受用，好感 +${total}`;
  pushLog(state, "🎁", text);
  return { ok: true, text };
}

/** 表白：需好感 ≥85 且约会次数 ≥3 */
export function confessNpc(state: GameState, npcId: string): PhoneResult {
  const def = getNpcDef(npcId);
  if (!def?.romanceable) return { ok: false, text: `${def?.name ?? npcNick(npcId)} 不是恋爱对象`, reason: "not_romanceable" };
  const rel = ensureRelationship(state, npcId);
  const dates = state.romance.dateCount[npcId] ?? 0;
  if (rel.affinity < 85 || dates < 3) {
    return { ok: false, text: "好感或约会次数不足，表白被婉拒", reason: "conditions_unmet" };
  }
  rel.state = "lover";
  rel.lastInteractionDay = gameDay(state.time);
  state.romance.confessed = { ...state.romance.confessed, [npcId]: true };
  const text = `向${def.name}表白成功，你们成了恋人`;
  pushLog(state, "❤️", text);
  return { ok: true, text };
}

/** 分手：恋人降级相识（好感封顶 50），清除表白记录，联动结局判定 */
export function breakUpNpc(state: GameState, npcId: string): PhoneResult {
  const rel = findRelationship(state, npcId);
  if (!rel || rel.state !== "lover") return { ok: false, text: "你们还不是恋人", reason: "not_lover" };
  const name = npcNick(npcId);
  rel.state = "acquaintance";
  rel.affinity = Math.min(rel.affinity, 50);
  rel.lastInteractionDay = gameDay(state.time);
  if (state.romance.confessed) {
    const next = { ...state.romance.confessed };
    delete next[npcId];
    state.romance.confessed = next;
  }
  applyEffects(state, { mood: -5, stress: 5 });
  const text = `和${name}分手了，退回朋友关系`;
  pushLog(state, "💔", text);
  return { ok: true, text, deltas: [{ key: "心情", label: "心情", value: -5 }] };
}

/** 蹭住：需当前为 nightly 漂泊状态且已有关系 */
export function crashAtNpc(state: GameState, npcId: string): PhoneResult {
  if (state.living.mode !== "nightly") return { ok: false, text: "你有固定住处，不需要蹭住", reason: "not_nightly" };
  const rel = findRelationship(state, npcId);
  if (!rel || rel.state === "blocked") return { ok: false, text: "和 TA 还不够熟", reason: "no_relation" };
  state.romance.crashTonight = npcId;
  const text = `今晚去${npcNick(npcId)}家蹭一晚，明早道个谢`;
  pushLog(state, "🛏️", text);
  return { ok: true, text };
}

/** 借款（v0.992 核心层校验金额范围，不再依赖 UI 限制） */
export function borrowFrom(state: GameState, npcId: string, amount: number): PhoneResult {
  if (!canBorrow(state, npcId)) return { ok: false, text: "现在没法找 TA 借钱", reason: "cannot_borrow" };
  if (!Number.isFinite(amount) || amount < 10 || amount > 500) {
    return { ok: false, text: "借款金额需在 10-500 元之间", reason: "invalid_amount" };
  }
  const rounded = Math.round(amount);
  const rel = ensureRelationship(state, npcId);
  applyEffects(state, { money: rounded, mood: 2 });
  rel.loan = { amount: rounded, since: gameDay(state.time) };
  state.romance.loanNpc = npcId;
  const text = `从${npcNick(npcId)}那借了 ${rounded} 元，说好发工资就还`;
  pushLog(state, "💸", text);
  return { ok: true, text, deltas: [{ key: "金钱", label: "金钱", value: rounded }] };
}

/** 还款 */
export function repayLoan(state: GameState, npcId: string, amount: number): PhoneResult {
  const rel = findRelationship(state, npcId);
  if (!rel?.loan) return { ok: false, text: "没有未清借款", reason: "no_loan" };
  const pay = Math.min(amount, rel.loan.amount, state.player.money);
  if (pay <= 0) return { ok: false, text: "钱不够还款", reason: "no_money" };
  applyEffects(state, { money: -pay });
  rel.loan.amount -= pay;
  let text: string;
  if (rel.loan.amount <= 0) {
    rel.loan = undefined;
    state.romance.loanNpc = undefined;
    addAffinity(state, npcId, 10, "repay");
    text = `把欠${npcNick(npcId)}的钱还清了，这交情更稳了`;
  } else {
    text = `还了 ${pay} 元，还剩 ${rel.loan.amount} 元`;
  }
  pushLog(state, "💳", text);
  return { ok: true, text, deltas: [{ key: "金钱", label: "金钱", value: -pay }] };
}

/** 偶遇：进入地点时按 NPC 的 meetChance / meetConditions 概率建立关系。
 *  v1.01 新增「常客保底」：同一地点累计到访达到 meetVisitCount 后必遇，
 *  避免脸黑永远遇不到；同事类 NPC（requireEmployed）保留仅在职偶遇。 */
export function maybeMeetNpc(state: GameState, locId: string): string | null {
  const hour = state.time.hour;
  const charm = state.player.stats.charm;
  for (const npc of allNpcs()) {
    if (npc.meetLocation !== locId) continue;
    if (findRelationship(state, npc.id)) continue; // 已认识不再偶遇
    const cond = npc.meetConditions;
    if (cond?.minCharm !== undefined && charm < cond.minCharm) continue;
    if (cond?.hourRange && (hour < cond.hourRange[0] || hour > cond.hourRange[1])) continue;
    if (cond?.minMoney !== undefined && state.player.money < cond.minMoney) continue;
    // v0.992 同事类 NPC：仅在职时可在工作地点偶遇
    if (cond?.requireEmployed && !state.flags["employed"]) continue;

    // v1.01 常客保底：到访计数（flags 仅存 number|boolean，用 number 累加）
    const visitKey = `meet_visits_${npc.id}`;
    const visits = (typeof state.flags[visitKey] === "number" ? (state.flags[visitKey] as number) : 0) + 1;
    state.flags[visitKey] = visits;
    const visitCap = npc.meetVisitCount ?? 0;
    const guaranteed = visitCap > 0 && visits >= visitCap;

    if (guaranteed || chanceHit(state, npc.meetChance ?? 0)) {
      ensureRelationship(state, npc.id);
      addAffinity(state, npc.id, 3, "meet");
      const text = guaranteed
        ? `你常来${npc.meetLocation ?? locId}，${npcDisplayName(state, npc.id)}慢慢眼熟了你，主动打了个招呼`
        : `在${npc.meetLocation ?? locId}遇见了${npcDisplayName(state, npc.id)}，聊了几句`;
      pushLog(state, "✨", text);
      return npc.id;
    }
  }
  return null;
}

function chanceHit(state: GameState, p: number): boolean {
  // 0.985 全局可复现 RNG（mulberry32）
  return chance(state.rng, p);
}

/** 给指定 NPC 打电话：+2 好感、心情 +3、压力 -2，每日每 NPC 一次（按绝对日）；耗 0.5 小时与联系人通话一致 */
export function callNpc(state: GameState, npcId: string): PhoneResult {
  const cd = `call_cd_${npcId}`;
  const today = gameDay(state.time);
  if (state.flags[cd] === today) return { ok: false, text: "今天已经打过电话了", reason: "cooldown" };
  const rel = findRelationship(state, npcId);
  if (!rel || rel.state === "blocked") return { ok: false, text: "现在不方便联系 TA", reason: "no_relation" };
  addAffinity(state, npcId, 2, "call");
  applyEffects(state, { mood: 3, stress: -2 });
  state.flags[cd] = today;
  advanceHours(state, 0.5); // v0.992 修复：与联系人通话 0.5h 体系一致
  const text = `给${npcNick(npcId)}打了个电话，随便唠了会儿`;
  pushLog(state, "📞", text);
  return { ok: true, text };
}

export type { ResultDelta };
