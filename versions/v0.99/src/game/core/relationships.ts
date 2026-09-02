/**
 * v0.99 NPC 关系系统（核心，纯逻辑层）：
 * - ensureRelationship / getRelationship / addAffinity / affinityToState / relationLevel
 * - tickRelationshipDecay（夜间衰减，在 time.sleepSettlement 中 tickContactBenefits 之后调用）
 *
 * 设计铁律：本文件**禁止 import engine**（避免 engine.applyEffects ↔ relationships 成环）。
 * 所有日志以「返回字符串」方式交给调用方（engine.applyEffects / time.sleepSettlement）pushLog。
 * 与 contacts.ts 同样单向依赖：contacts → relationships，relationships 不回 import contacts。
 */
import type { GameState, Relationship, RelationState, NpcDef } from "../types";
import { gameDay } from "./calendar";
import npcsData from "../data/npcs.json";

const NPC_DEFS = (npcsData as unknown as { npcs: NpcDef[] }).npcs;
const NPC_MAP = new Map(NPC_DEFS.map((n) => [n.id, n]));

/** 单 NPC 每日好感获取上限（防刷） */
export const DAILY_AFFINITY_CAP = 15;

/** 等级中文标签（日志用） */
export const STATE_LABEL: Record<RelationState, string> = {
  stranger: "点头之交",
  acquaintance: "熟人",
  friend: "朋友",
  close_friend: "好友",
  lover: "恋人",
};

/** 各等级好感下限（衰减地板 = 下限 - 5，避免刚升级就瞬间掉级） */
const STATE_FLOOR: Record<RelationState, number> = {
  stranger: 0,
  acquaintance: 20,
  friend: 40,
  close_friend: 65,
  lover: 85,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function getNpcDef(id: string): NpcDef | undefined {
  return NPC_MAP.get(id);
}

export function allNpcs(): NpcDef[] {
  return NPC_DEFS;
}

/**
 * 好感度 → 关系等级（单一派生函数，避免多处判断不一致）。
 * lover 必须经「表白」确认（flags.confessed=true），否则高好感也只是 close_friend，
 * 杜绝「和房东聊多了自动变恋人」的荒诞结果。
 */
export function affinityToState(affinity: number, confessed = false): RelationState {
  if (affinity >= 85 && confessed) return "lover";
  if (affinity >= 65) return "close_friend";
  if (affinity >= 40) return "friend";
  if (affinity >= 20) return "acquaintance";
  return "stranger";
}

export function getRelationship(state: GameState, npcId: string): Relationship | undefined {
  return state.relationships.find((r) => r.npcId === npcId);
}

/** 无关系时回退 stranger */
export function relationLevel(state: GameState, npcId: string): RelationState {
  return getRelationship(state, npcId)?.state ?? "stranger";
}

/**
 * 确保某 NPC 的关系记录存在（幂等）。
 * 新建时初始好感取 opts.initialAffinity → npcs.json.initialAffinity → 0。
 * opts.noDecay=true（如父母）标记免衰减。
 */
export function ensureRelationship(
  state: GameState,
  npcId: string,
  opts?: { initialAffinity?: number; noDecay?: boolean },
): Relationship {
  const existing = state.relationships.find((r) => r.npcId === npcId);
  if (existing) return existing;
  const today = gameDay(state.time);
  const init = opts?.initialAffinity ?? getNpcDef(npcId)?.initialAffinity ?? 0;
  const rel: Relationship = {
    npcId,
    affinity: init,
    state: affinityToState(init, false),
    lastInteractDay: today,
    todayGain: 0,
    todayGainDay: today,
    flags: opts?.noDecay ? { noDecay: true } : {},
  };
  state.relationships = [...state.relationships, rel];
  return rel;
}

/**
 * 增加好感（受每日上限 + 边际递减约束），返回日志文案（空串表示未变化/已达上限）。
 * 调用方负责 pushLog。
 */
export function addAffinity(
  state: GameState,
  npcId: string,
  amount: number,
  opts?: { name?: string; reason?: string; initialAffinity?: number },
): string {
  const rel = ensureRelationship(state, npcId, { initialAffinity: opts?.initialAffinity });
  const today = gameDay(state.time);
  if (rel.todayGainDay !== today) {
    rel.todayGain = 0;
    rel.todayGainDay = today;
  }
  let eff = amount;
  // 边际递减：高好感后增益减半再减半
  if (eff > 0) {
    if (rel.affinity >= 85) eff *= 0.4;
    else if (rel.affinity >= 65) eff *= 0.6;
  }
  // 每日上限
  if (eff > 0) {
    const remain = DAILY_AFFINITY_CAP - rel.todayGain;
    if (remain <= 0) return "";
    if (eff > remain) eff = remain;
  }
  if (eff === 0) return "";
  const before = rel.affinity;
  rel.affinity = clamp(rel.affinity + eff, 0, 100);
  rel.todayGain += eff;
  rel.lastInteractDay = today;
  const confessed = !!rel.flags?.confessed;
  rel.state = affinityToState(rel.affinity, confessed);
  const name = opts?.name ?? getNpcDef(npcId)?.name ?? npcId;
  const delta = Math.round(rel.affinity - before);
  if (delta === 0) return "";
  return `${name} 好感 ${delta > 0 ? "+" : ""}${delta}（${STATE_LABEL[rel.state]}）`;
}

/**
 * 夜间衰减：超过 7 天未互动每天 -1，超过 14 天每天 -2。
 * 父母（flags.noDecay）不衰减；衰减不跌破「当前等级下限 - 5」，避免刚升级就掉级。
 * 返回需记录的日志文案数组（调用方 pushLog）。
 */
export function tickRelationshipDecay(state: GameState): string[] {
  const today = gameDay(state.time);
  const logs: string[] = [];
  for (const rel of state.relationships) {
    if (rel.flags?.noDecay) continue; // 父母免衰减
    const days = today - (rel.lastInteractDay ?? 0);
    if (days <= 7) continue;
    const loss = days > 14 ? 2 : 1;
    const floor = Math.max(0, STATE_FLOOR[rel.state] - 5);
    const next = Math.max(floor, rel.affinity - loss);
    if (next === rel.affinity) continue;
    rel.affinity = next;
    const confessed = !!rel.flags?.confessed;
    rel.state = affinityToState(rel.affinity, confessed);
    const name = getNpcDef(rel.npcId)?.name ?? rel.npcId;
    logs.push(`和${name}生疏了些（${STATE_LABEL[rel.state]}）`);
  }
  return logs;
}

/**
 * 夜间恋爱维护：lover（已表白）连续 14 天不互动 → 渐行渐远，好感归 30、解除恋人关系。
 * 返回需记录的日志文案数组（调用方 pushLog）。
 */
export function tickRomance(state: GameState): string[] {
  const today = gameDay(state.time);
  const logs: string[] = [];
  for (const rel of state.relationships) {
    if (!rel.flags?.confessed) continue;
    const days = today - (rel.lastInteractDay ?? 0);
    if (days <= 14) continue;
    const name = getNpcDef(rel.npcId)?.name ?? rel.npcId;
    rel.affinity = 30;
    rel.flags.confessed = false;
    rel.flags.brokenUp = true;
    rel.state = affinityToState(rel.affinity, false);
    if (state.romance.partnerId === rel.npcId) state.romance.partnerId = undefined;
    logs.push(`和${name}渐行渐远，这段关系凉了（好感归 30）`);
  }
  return logs;
}

/**
 * 同事日久生情：在职（career.jobId 存在）时，每天给同事类联系人（employee/leader/manager）+1 好感。
 * 受每日上限约束；每日仅触发一次（colleague_cd 标志）。返回需记录的日志文案数组。
 */
export function tickColleagueAffinity(state: GameState): string[] {
  if (!state.career.jobId) return [];
  const today = gameDay(state.time);
  if (state.flags["colleague_cd"] === today) return [];
  state.flags["colleague_cd"] = today;
  const logs: string[] = [];
  for (const c of state.contacts) {
    if (c.relation !== "employee" && c.relation !== "leader" && c.relation !== "manager") continue;
    const log = addAffinity(state, c.id, 1, { name: c.name });
    if (log) logs.push(`和同事${c.name}日久生情（${log}）`);
  }
  return logs;
}

/**
 * 借款逾期惩罚：欠款 > 0 且距借款超过 30 天未还 → 好感 -30 并拉黑（flags.blacklisted）。
 * 返回需记录的日志文案数组（调用方 pushLog）。
 */
export function tickLoans(state: GameState): string[] {
  if (state.player.debt <= 0) return [];
  const npc = state.romance.loanNpc;
  if (!npc) return [];
  const days = gameDay(state.time) - (state.romance.loanDay ?? 0);
  if (days <= 30) return [];
  const rel = getRelationship(state, npc);
  const name = getNpcDef(npc)?.name ?? npc;
  if (rel) {
    rel.affinity = Math.max(0, rel.affinity - 30);
    rel.flags = rel.flags ?? {};
    rel.flags.blacklisted = true;
    rel.state = affinityToState(rel.affinity, !!rel.flags.confessed);
  }
  return [`${name}等钱等得没了耐心，把你拉黑了（好感 -30）`];
}

/** v0.99 借钱资格与额度：friend 及以上可借，额度 = min(affinity×10, 500) */
export function canBorrow(
  state: GameState,
  npcId: string,
): { ok: boolean; amount: number; reason?: string } {
  const rel = getRelationship(state, npcId);
  if (!rel) return { ok: false, amount: 0, reason: "还不熟，开不了这个口" };
  if (rel.state === "stranger" || rel.state === "acquaintance")
    return { ok: false, amount: 0, reason: "关系还不够铁，人家不一定借" };
  if (rel.flags?.blacklisted) return { ok: false, amount: 0, reason: "之前欠钱没还，已被拉黑" };
  const cap = Math.min(Math.floor(rel.affinity * 10), 500);
  if (cap <= 0) return { ok: false, amount: 0, reason: "好感太低，借不到" };
  if (state.player.debt > 0) return { ok: false, amount: 0, reason: "还有旧账没还，先还了再说" };
  if (state.romance.loanNpc) return { ok: false, amount: 0, reason: "已经欠着别人的钱了" };
  return { ok: true, amount: cap };
}

/** 读取某 NPC 在当前关系等级下的「特权」键（如 borrow / referral_job_xxx），供 UI 展示 */
export function relationshipPerk(npcId: string, state: RelationState): string | undefined {
  const def = getNpcDef(npcId);
  if (!def?.perks) return undefined;
  return def.perks[state];
}
