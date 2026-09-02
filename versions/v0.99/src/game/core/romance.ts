/**
 * v0.99 恋爱与社交互动（核心，纯逻辑层）。
 * 与 relationships.ts 的边界：relationships.ts 保持「不 import engine/time」（避免成环），
 * 本文件承载需要结算/推进时间的互动：约会 / 送礼 / 表白 / 蹭住 / 借钱 / 邂逅。
 *
 * 循环依赖规避：
 * - 本文件 import engine（applyEffects/pushLog）与 time（advanceHours）是允许的，
 *   因为 engine/time 都不反向 import 本文件（time 只 import relationships 的纯 tick 函数）。
 * - borrow 的资格判定 canBorrow 放在 relationships.ts（纯），本文件只做借/还的动作。
 */
import type { GameState, NpcDef, ResultDelta } from "../types";
import { applyEffects, pushLog } from "../engine";
import { advanceHours } from "./time";
import { chance, randomInt } from "../rng";
import { scaleCost } from "./difficulty";
import { getItem, removeItem } from "./items";
import { addContact, getContact, hasContact } from "./contacts";
import {
  addAffinity,
  ensureRelationship,
  getRelationship,
  relationLevel,
  getNpcDef,
  allNpcs,
  canBorrow,
} from "./relationships";
import type { PhoneResult } from "./phone";

/** 约会档位（公园免费 / 咖啡厅 / 电影 / 餐厅） */
export interface DateTier {
  id: string;
  name: string;
  cost: number;
  hours: number;
  icon: string;
}
export const DATE_TIERS: DateTier[] = [
  { id: "park", name: "公园散步", cost: 0, hours: 2, icon: "🌳" },
  { id: "cafe", name: "咖啡厅", cost: 60, hours: 2.5, icon: "☕" },
  { id: "movie", name: "看电影", cost: 80, hours: 2.5, icon: "🎬" },
  { id: "restaurant", name: "餐厅晚餐", cost: 150, hours: 3, icon: "🍽️" },
];

/** 各档位的「花费加成」：花得越多越能打动人 */
function tierBonus(id: string): number {
  if (id === "cafe") return 0.05;
  if (id === "movie") return 0.08;
  if (id === "restaurant") return 0.12;
  return 0;
}

/**
 * 约会：friend 及以上可约；成功率 = 0.5 + charm×0.01 + (hygiene-50)×0.004 + (mood-50)×0.004 + 档位加成，clamp[0.15,0.95]。
 * 干净度 < 30 直接失败。成功 +8~12 好感、心情 +4；失败 +1 好感、心情 -5。每 2 日冷却。
 */
export function dateNpc(state: GameState, npcId: string, tierId: string): PhoneResult {
  const rel = getRelationship(state, npcId);
  if (!rel) return { ok: false, text: "还不认识这个人", reason: "未认识" };
  if (rel.state === "stranger" || rel.state === "acquaintance")
    return { ok: false, text: "关系还没到能约出来的程度（需朋友）", reason: "好感不足" };
  const tier = DATE_TIERS.find((t) => t.id === tierId) ?? DATE_TIERS[0];
  const cdKey = `date_cd_${npcId}`;
  const last = state.flags[cdKey];
  if (typeof last === "number" && gameDay(state.time) - last < 2)
    return { ok: false, text: "刚约过，过两天再来吧", reason: "冷却中" };

  const cost = scaleCost(state, tier.cost);
  if (state.player.money < cost) return { ok: false, text: `钱不够（需 ${cost} 元）`, reason: "钱不够" };

  const name = getNpcDef(npcId)?.name ?? npcId;
  applyEffects(state, { money: -cost, stamina: -10 }, tier.icon);
  advanceHours(state, tier.hours);

  // 干净度过低直接失败
  if (state.player.attrs.hygiene < 30) {
    addAffinity(state, npcId, 1, { name });
    applyEffects(state, { mood: -5 }, tier.icon);
    state.flags[cdKey] = gameDay(state.time);
    pushLog(state, "🌹", `和${name}约会，你一身汗味，对方有点尴尬`);
    return {
      ok: false,
      text: `你凑近时${name}闻到你一身汗味，约会草草结束。`,
      deltas: [{ key: "mood", label: "心情", value: -5 }, { key: "money", label: "花费", value: -cost }],
    };
  }

  const p =
    0.5 +
    state.player.stats.charm * 0.01 +
    (state.player.attrs.hygiene - 50) * 0.004 +
    (state.player.attrs.mood - 50) * 0.004 +
    tierBonus(tier.id);
  const rate = Math.max(0.15, Math.min(0.95, p));
  const success = chance(state.rng, rate);

  state.romance.dateCount[npcId] = (state.romance.dateCount[npcId] ?? 0) + 1;
  state.flags[cdKey] = gameDay(state.time);

  if (success) {
    const gain = randomInt(state.rng, 8, 12);
    const before = rel.affinity;
    const log = addAffinity(state, npcId, gain, { name });
    const delta = rel.affinity - before;
    applyEffects(state, { mood: 4 }, tier.icon);
    pushLog(state, "🌹", `和${name}在${tier.name}约了一趟${log ? `，${log}` : ""}`);
    return {
      ok: true,
      text: `和${name}在${tier.name}度过了愉快的一晚。`,
      deltas: [
        { key: "mood", label: "心情", value: 4 },
        { key: "money", label: "花费", value: -cost },
        { key: "affinity", label: `${name}好感`, value: delta },
      ],
    };
  } else {
    const before = rel.affinity;
    addAffinity(state, npcId, 1, { name });
    applyEffects(state, { mood: -5 }, tier.icon);
    pushLog(state, "🌹", `和${name}的约会有些冷场`);
    return {
      ok: true,
      text: `和${name}的约会不太顺利，有点尴尬。`,
      deltas: [
        { key: "mood", label: "心情", value: -5 },
        { key: "money", label: "花费", value: -cost },
        { key: "affinity", label: `${name}好感`, value: rel.affinity - before },
      ],
    };
  }
}

/**
 * 送礼：消耗背包中一件物品，按价值分档加好感（<20→+4 / <60→+8 / 否则 +15），
 * 对方喜欢 +3、讨厌 -3。每 3 日冷却。
 */
export function giftNpc(state: GameState, npcId: string, itemId: string): PhoneResult {
  if (!getRelationship(state, npcId)) return { ok: false, text: "还不认识这个人", reason: "未认识" };
  if (!state.ownedItems.includes(itemId)) return { ok: false, text: "背包里没有这件东西", reason: "无此物品" };
  const def = getItem(itemId);
  if (!def) return { ok: false, text: "物品数据缺失", reason: "无此物品" };
  const cdKey = `gift_cd_${npcId}`;
  const last = state.flags[cdKey];
  if (typeof last === "number" && gameDay(state.time) - last < 3)
    return { ok: false, text: "刚送过礼，过几天再送吧", reason: "冷却中" };

  const npc = getNpcDef(npcId);
  const price = def.cost ?? 0;
  const base = price < 20 ? 4 : price < 60 ? 8 : 15;
  let bonus = 0;
  if (npc?.likes?.includes(itemId)) bonus += 3;
  if (npc?.dislikes?.includes(itemId)) bonus -= 3;
  const gain = Math.max(1, base + bonus);

  state.ownedItems = state.ownedItems.filter((x) => x !== itemId);
  removeItem(state, itemId); // 同步扣减 inventory 数量（无则 no-op）
  const rel = getRelationship(state, npcId)!;
  const before = rel.affinity;
  const log = addAffinity(state, npcId, gain, { name: npc?.name ?? npcId });
  const after = rel.affinity;
  applyEffects(state, { mood: 3 }, "🎁");
  state.flags[cdKey] = gameDay(state.time);
  pushLog(state, "🎁", `送了${npc?.name ?? npcId}一份${def.name}${log ? `，${log}` : ""}`);
  return {
    ok: true,
    text: `你送了${def.name}给${npc?.name ?? npcId}。`,
    deltas: [
      { key: "affinity", label: `${npc?.name ?? npcId}好感`, value: after - before },
      { key: "mood", label: "心情", value: 3 },
    ],
  };
}

/**
 * 表白：仅可攻略 NPC，需好感 ≥ 85 且约会 ≥ 3 次。成功率 0.7 + fame×0.005。
 * 成功 → 恋人（flags.confessed + state=lover + romance.partnerId）；失败 → 好感 -5、心情 -5。
 */
export function confessNpc(state: GameState, npcId: string): PhoneResult {
  const npc = getNpcDef(npcId);
  if (!npc) return { ok: false, text: "查无此人", reason: "无此 NPC" };
  if (!npc.romanceable) return { ok: false, text: "对方只是朋友，没往那方面想", reason: "不可攻略" };
  const rel = getRelationship(state, npcId);
  if (!rel) return { ok: false, text: "还不认识", reason: "未认识" };
  if (rel.affinity < 85) return { ok: false, text: "好感还不够（需 85）", reason: "好感不足" };
  if ((state.romance.dateCount[npcId] ?? 0) < 3)
    return { ok: false, text: "相处时间太短，再多约几次吧（需 3 次约会）", reason: "约会不足" };
  if (rel.flags?.confessed) return { ok: false, text: "你们已经是恋人了", reason: "已表白" };

  const rate = 0.7 + state.player.stats.fame * 0.005;
  const success = chance(state.rng, Math.min(0.95, rate));
  if (success) {
    rel.flags = rel.flags ?? {};
    rel.flags.confessed = true;
    rel.state = "lover";
    state.romance.partnerId = npcId;
    applyEffects(state, { mood: 10 }, "💍");
    pushLog(state, "💍", `你向${npc.name}表白成功，你们在一起了！`);
    return {
      ok: true,
      text: `你鼓起勇气表白，${npc.name}红着脸答应了。`,
      deltas: [{ key: "mood", label: "心情", value: 10 }],
    };
  } else {
    applyEffects(state, { mood: -5 }, "💔");
    const before = rel.affinity;
    addAffinity(state, npcId, -5, { name: npc.name });
    pushLog(state, "💔", `你向${npc.name}表白，被婉拒了`);
    return {
      ok: false,
      text: `你表白了，但${npc.name}说还需要时间……`,
      deltas: [
        { key: "mood", label: "心情", value: -5 },
        { key: "affinity", label: `${npc.name}好感`, value: getRelationship(state, npcId)!.affinity - before },
      ],
    };
  }
}

/**
 * 蹭住：好友及以上可去对方家过夜，省下一晚住宿费（sleepSettlement 兑现）。
 * 已有固定住处（lease/own）则无需蹭住。
 */
export function crashAtNpc(state: GameState, npcId: string): PhoneResult {
  const rel = getRelationship(state, npcId);
  if (!rel) return { ok: false, text: "还不认识这个人", reason: "未认识" };
  if (rel.state !== "close_friend" && rel.state !== "lover")
    return { ok: false, text: "关系还没铁到能去蹭住（需好友）", reason: "好感不足" };
  if (state.living.mode !== "nightly")
    return { ok: false, text: "你已有固定住处，不用去蹭", reason: "无需蹭住" };
  const name = getNpcDef(npcId)?.name ?? npcId;
  state.romance.crashTonight = npcId;
  pushLog(state, "🛏️", `今晚打算去${name}家蹭住，省下一晚住宿费`);
  return { ok: true, text: `你和${name}说好今晚去他家打地铺。`, deltas: [] };
}

/**
 * 给指定 NPC 打电话：+2 好感、心情 +3、压力 -2，每日每 NPC 一次。
 * 与 callFriend（随机挑一个朋友）互补：这里针对具体某个人。
 */
export function callNpc(state: GameState, npcId: string): PhoneResult {
  const rel = getRelationship(state, npcId);
  if (!rel) return { ok: false, text: "还不认识这个人", reason: "未认识" };
  const cdKey = `call_cd_${npcId}`;
  if (typeof state.flags[cdKey] === "number" && gameDay(state.time) - (state.flags[cdKey] as number) < 1)
    return { ok: false, text: "今天已经打过了", reason: "冷却中" };
  const name = getNpcDef(npcId)?.name ?? npcId;
  const before = rel.affinity;
  const log = addAffinity(state, npcId, 2, { name });
  applyEffects(state, { mood: 3, stress: -2 }, "📞");
  state.flags[cdKey] = gameDay(state.time);
  pushLog(state, "📞", `给${name}打了个电话${log ? `，${log}` : ""}`);
  return {
    ok: true,
    text: `和${name}聊了会，心情好了些。`,
    deltas: [
      { key: "mood", label: "心情", value: 3 },
      { key: "affinity", label: `${name}好感`, value: rel.affinity - before },
    ],
  };
}

/** 借钱：friend 及以上可借，额度由 canBorrow 决定；写入 player.debt 与 romance.loanNpc/loanDay */
export function borrowFrom(state: GameState, npcId: string, amount: number): PhoneResult {
  const can = canBorrow(state, npcId);
  if (!can.ok) return { ok: false, text: can.reason ?? "借不了", reason: can.reason };
  const amt = Math.max(1, Math.min(Math.floor(amount), can.amount));
  if (amt <= 0) return { ok: false, text: "金额无效", reason: "金额无效" };
  state.player.debt += amt;
  state.romance.loanNpc = npcId;
  state.romance.loanDay = gameDay(state.time);
  const name = getNpcDef(npcId)?.name ?? npcId;
  const log = addAffinity(state, npcId, 1, { name });
  pushLog(state, "💰", `向${name}借了 ${amt} 元${log ? `，${log}` : ""}`);
  return {
    ok: true,
    text: `${name}二话不说转了你 ${amt} 元。`,
    deltas: [
      { key: "money", label: "借到", value: amt },
      { key: "debt", label: "欠款", value: amt },
    ],
  };
}

/** 还钱：从现金扣除，还清后清空借款追踪 */
export function repayLoan(state: GameState, amount: number): PhoneResult {
  if (state.player.debt <= 0) return { ok: false, text: "当前没有借款", reason: "无借款" };
  const pay = Math.max(1, Math.min(Math.floor(amount), state.player.money, state.player.debt));
  if (pay <= 0) return { ok: false, text: "钱不够还", reason: "钱不够" };
  state.player.money -= pay;
  state.player.debt -= pay;
  if (state.player.debt <= 0) {
    state.player.debt = 0;
    state.romance.loanNpc = undefined;
    state.romance.loanDay = undefined;
  }
  pushLog(state, "💰", `还了 ${pay} 元借款`);
  return {
    ok: true,
    text: `还了 ${pay} 元，欠款剩 ${state.player.debt} 元。`,
    deltas: [{ key: "money", label: "金钱", value: -pay }],
  };
}

/**
 * 邂逅：进入地点时按 NPC 的 meetLocation / meetChance 偶遇。
 * 命中后建关系并 +3 好感；好感达到 contactAt 则交换联系方式（addContact）。
 * 每日每 NPC 至多一次。返回偶遇到的 npcId（无则 null）。
 */
export function maybeMeetNpc(state: GameState, locId: string, locName: string): string | null {
  const cands = allNpcs().filter((n: NpcDef) => n.meetLocation === locId && !hasContact(state, n.id));
  for (const n of cands) {
    if (n.meetConditions?.minCharm && state.player.stats.charm < n.meetConditions.minCharm) continue;
    if (n.meetConditions?.hourRange) {
      const [a, b] = n.meetConditions.hourRange;
      const h = state.time.hour;
      const inRange = a < b ? h >= a && h < b : h >= a || h < b;
      if (!inRange) continue;
    }
    const cdKey = `meet_cd_${n.id}`;
    if (typeof state.flags[cdKey] === "number" && state.flags[cdKey] === gameDay(state.time)) continue;
    if (!chance(state.rng, n.meetChance ?? 0.2)) continue;
    state.flags[cdKey] = gameDay(state.time);
    ensureRelationship(state, n.id, { initialAffinity: n.initialAffinity });
    const log = addAffinity(state, n.id, 3, { name: n.name });
    pushLog(state, n.avatar, `在${locName}偶遇了${n.name}。${log}`);
    const rel = getRelationship(state, n.id);
    if (rel && rel.affinity >= (n.contactAt ?? 25)) {
      addContact(state, n.id);
      pushLog(state, "📇", `和${n.name}聊得来，交换了联系方式`);
    }
    return n.id;
  }
  return null;
}

/** 仅用于 UI：判断某 NPC 当前可展示的社交动作 */
export function socialActionsAvailable(state: GameState, npcId: string): {
  canDate: boolean;
  canGift: boolean;
  canBorrow: boolean;
  canConfess: boolean;
  canCrash: boolean;
} {
  const rel = getRelationship(state, npcId);
  const lvl = rel ? rel.state : relationLevel(state, npcId);
  const npc = getNpcDef(npcId);
  const borrow = canBorrow(state, npcId);
  return {
    canDate: lvl === "friend" || lvl === "close_friend" || lvl === "lover",
    canGift: !!rel,
    canBorrow: borrow.ok,
    canConfess: !!npc?.romanceable && !!rel && rel.affinity >= 85 && (state.romance.dateCount[npcId] ?? 0) >= 3 && !rel.flags?.confessed,
    canCrash: (lvl === "close_friend" || lvl === "lover") && state.living.mode === "nightly",
  };
}

// gameDay 复用（与 relationships.ts 一致来源）
import { gameDay } from "./calendar";
