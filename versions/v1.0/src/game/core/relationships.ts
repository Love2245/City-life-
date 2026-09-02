/**
 * 都市生活 v0.99 — 关系系统核心（纯 tick 层）
 * 架构铁律：本文件禁止 import engine / time（避免循环依赖）；
 * tick 函数返回日志文本数组，由调用方（time.ts）统一 pushLog。
 */
import type { GameState, Relationship, RelationState } from "../types";
import { gameDay } from "./calendar";
import { getNpcDef, npcNick } from "./npcs";

const AFFINITY_MIN = 0;
const AFFINITY_MAX = 100;

function clampAffinity(v: number): number {
  return Math.max(AFFINITY_MIN, Math.min(AFFINITY_MAX, v));
}

export function findRelationship(state: GameState, npcId: string): Relationship | undefined {
  return state.relationships.find((r) => r.npcId === npcId);
}

export function ensureRelationship(state: GameState, npcId: string): Relationship {
  let rel = findRelationship(state, npcId);
  if (!rel) {
    const def = getNpcDef(npcId);
    rel = {
      npcId,
      affinity: def?.initialAffinity ?? 0,
      state: "stranger",
      lastInteractionDay: gameDay(state.time),
    };
    state.relationships = [...state.relationships, rel];
  }
  return rel;
}

/** 好感增减（0-100 钳制），并更新上次互动日 */
export function addAffinity(
  state: GameState,
  npcId: string,
  amount: number,
  _reason?: string,
): number {
  const rel = ensureRelationship(state, npcId);
  rel.affinity = clampAffinity(rel.affinity + amount);
  rel.lastInteractionDay = gameDay(state.time);
  const def = getNpcDef(npcId);
  if (def?.contactAt !== undefined && rel.affinity >= def.contactAt) {
    // 达到联系人门槛：记 flag 供 UI 高亮（联系人列表仍由 contacts 系统管理）
    state.flags[`npc_contact_${npcId}`] = true;
  }
  // v0.992：好感变化可能晋升关系状态 → 兑现该档位的特权（如内推免证书）
  syncNpcPerks(state, npcId);
  return rel.affinity;
}

/** 当前生效的 NPC 特权（按当前关系状态查 perks 表，lover 归入 close_friend 档） */
export function npcPerkOf(state: GameState, npcId: string): string | undefined {
  const rel = findRelationship(state, npcId);
  const def = getNpcDef(npcId);
  if (!rel || !def?.perks) return undefined;
  const key = currentState(rel) === "lover" ? "close_friend" : currentState(rel);
  return def.perks[key] ?? (key !== "close_friend" ? def.perks["close_friend"] : undefined);
}

/**
 * v0.992 兑现 NPC 特权：
 * · referral_<jobId> → 写 state.flags["referral_<jobId>"]，打通「内推免证书」全链路
 *   （JobBoard/PhoneView 徽标 + 应聘跳过证书校验都由 isReferred 消费）。
 * · 其余特权（如 free_meal）由 time.ts 每日结算兑现。
 */
export function syncNpcPerks(state: GameState, npcId: string): void {
  const perk = npcPerkOf(state, npcId);
  if (perk?.startsWith("referral_")) {
    const jobId = perk.slice("referral_".length);
    state.flags[`referral_${jobId}`] = true;
  }
}

/** 仅按好感度推导展示层级（lover/blocked 由 state 字段决定） */
export function relationLevel(affinity: number): Exclude<RelationState, "lover" | "blocked"> {
  if (affinity >= 70) return "close_friend";
  if (affinity >= 40) return "friend";
  if (affinity >= 20) return "acquaintance";
  return "stranger";
}

export function currentState(rel: Relationship): RelationState {
  if (rel.state === "lover" || rel.state === "blocked") return rel.state;
  return relationLevel(rel.affinity);
}

export const STATE_LABEL: Record<RelationState, string> = {
  stranger: "陌生人",
  acquaintance: "相识",
  friend: "朋友",
  close_friend: "挚友",
  lover: "恋人",
  blocked: "已拉黑",
};

/** 关系特权：按当前关系状态查 NPC 的 perks 表（v0.992 统一走 npcPerkOf） */
export function relationshipPerk(state: GameState, npcId: string): string | undefined {
  return npcPerkOf(state, npcId);
}

/** 可借款：已是朋友、具备 borrow 特权、无在途借款、未被拉黑 */
export function canBorrow(state: GameState, npcId: string): boolean {
  const rel = findRelationship(state, npcId);
  const def = getNpcDef(npcId);
  if (!rel || rel.state === "blocked") return false;
  if (rel.state !== "friend") return false;
  if (def?.perks?.["friend"] !== "borrow") return false;
  if (state.romance.loanNpc) return false;
  return true;
}

// 8.6.4.1) 关系自然淡漠：非恋人关系超过 7 天无互动，好感 -2
export function tickRelationshipDecay(state: GameState): string[] {
  const logs: string[] = [];
  const today = gameDay(state.time);
  for (const rel of state.relationships) {
    if (rel.state === "lover" || rel.state === "blocked") continue;
    if (rel.lastInteractionDay === undefined) continue;
    if (today - rel.lastInteractionDay > 7) {
      const before = rel.affinity;
      rel.affinity = clampAffinity(before - 2);
      logs.push(`与${npcNick(rel.npcId)}有些生疏了（好感 ${before}→${rel.affinity}）`);
    }
  }
  return logs;
}

// 8.6.4.2) 恋爱维护：已表白恋人连续 14 天不互动 → 渐行渐远（好感归 30）
export function tickRomance(state: GameState): string[] {
  const logs: string[] = [];
  const today = gameDay(state.time);
  for (const rel of state.relationships) {
    if (rel.state !== "lover") continue;
    if (rel.lastInteractionDay === undefined) continue;
    if (today - rel.lastInteractionDay > 14) {
      rel.affinity = 30;
      logs.push(`与${npcNick(rel.npcId)}渐行渐远，感情冷却到 30`);
    }
  }
  return logs;
}

// 8.6.4.3) 同事日久生情：在职时每天给同事类 NPC +1 好感
export function tickColleagueAffinity(state: GameState): string[] {
  const logs: string[] = [];
  if (!state.flags["employed"]) return logs;
  for (const rel of state.relationships) {
    const def = getNpcDef(rel.npcId);
    if (def?.type !== "colleague") continue;
    if (rel.state === "blocked") continue;
    const before = rel.affinity;
    rel.affinity = clampAffinity(before + 1);
    logs.push(`和同事${npcNick(rel.npcId)}相处多了些默契（好感 ${before}→${rel.affinity}）`);
  }
  return logs;
}

// 8.6.4.4) 借款逾期：欠款超 30 天未还 → 好感 -30 并拉黑
export function tickLoans(state: GameState): string[] {
  const logs: string[] = [];
  const today = gameDay(state.time);
  for (const rel of state.relationships) {
    if (!rel.loan) continue;
    if (today - rel.loan.since > 30) {
      const before = rel.affinity;
      rel.affinity = clampAffinity(before - 30);
      rel.state = "blocked";
      rel.loan = undefined;
      if (state.romance.loanNpc === rel.npcId) state.romance.loanNpc = undefined;
      logs.push(`${npcNick(rel.npcId)}因久催不还拉黑了你（好感 ${before}→${rel.affinity}）`);
    }
  }
  return logs;
}
