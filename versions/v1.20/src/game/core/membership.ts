/**
 * 会籍（月卡）系统 v0.92：购买 → 入背包（记绝对到期日）→ 到期自动失效。
 * 纯逻辑层，不依赖 DOM/Svelte。
 *
 * 设计要点：
 * 1. 月卡以「物品」形式存在于背包（inventory），玩家可直观看到并查询剩余天数；
 * 2. 有效期用**绝对到期日**（year/month/day）记录在 state.memberships，
 *    避免按次递减在跨天/跳时（晕倒跳 12h、住院跳天）时漏扣；
 * 3. 到期由每晚 sleepSettlement 调用 checkMembershipExpiry 收回：
 *    删除背包物品 + 清 flag + 删 memberships 条目 → 相关行动自动重新锁定。
 */
import type { GameState } from "../types";
import { pushLog } from "../engine";
import { addItem, removeItem } from "./items";
import { linearDay } from "./calendar";

/** 会籍定义 */
export interface MembershipDef {
  /** 会籍 id（= state.memberships 的 key） */
  id: string;
  /** 中文名 */
  name: string;
  icon: string;
  /** 对应背包物品 id */
  itemId: string;
  /** 解锁标记（写入 state.flags） */
  flag: string;
  /** 价格（元） */
  price: number;
  /** 有效天数 */
  days: number;
}

/** 全部会籍（目前仅健身房月卡，后续可扩展游泳/瑜伽等） */
export const MEMBERSHIPS: Record<string, MembershipDef> = {
  gym: {
    id: "gym",
    name: "健身月卡",
    icon: "💳",
    itemId: "gym_card",
    flag: "gym_member",
    price: 300,
    days: 30,
  },
};

/** 每月天数（与 time.rollDay 的日历保持一致：统一 30 天月） */
const DAYS_PER_MONTH = 30;

/** 把 (year, month, day) 折算成单调递减的绝对天序号，便于比较与做差。
 *  v0.936：改为从纪元（year1/month1/day1 = 0）起算，使「活满 N 天」可直接用 absoluteDay 比较，
 *  并修复「熬出个黎明」（dayMin 360）等依赖绝对天的判定。差值比较不受常数偏移影响，会员 / 载具逻辑不变。
 *  v0.95：统一走 calendar.linearDay（差值语义，+1 保持旧档兼容）。 */
export function absoluteDay(t: { year: number; month: number; day: number }): number {
  return linearDay(t) + 1;
}

/** 会籍是否有效（未过期） */
export function isMembershipActive(state: GameState, id: string): boolean {
  const exp = state.memberships?.[id];
  if (!exp) return false;
  return absoluteDay(state.time) < absoluteDay(exp);
}

/** 会籍剩余天数（无效返回 0） */
export function membershipDaysLeft(state: GameState, id: string): number {
  const exp = state.memberships?.[id];
  if (!exp) return 0;
  return Math.max(0, absoluteDay(exp) - absoluteDay(state.time));
}

/**
 * 购买会籍：校验（重复/余额）→ 扣款 → 物品入背包 → 记到期日 → 置 flag。
 * 已持有且未到期时禁止重复购买（避免浪费金钱）。
 */
export function buyMembership(
  state: GameState,
  id: string,
): { ok: boolean; reason?: string; daysLeft?: number } {
  const def = MEMBERSHIPS[id];
  if (!def) return { ok: false, reason: "未知的会籍类型" };

  if (isMembershipActive(state, id)) {
    return {
      ok: false,
      reason: `${def.name}还在有效期内（剩 ${membershipDaysLeft(state, id)} 天），不用重复办`,
    };
  }
  if (state.player.money < def.price) {
    return { ok: false, reason: `金钱不足（需 ${def.price} 元）` };
  }

  state.player.money -= def.price;

  // 过期残留清理（到期未被结算收回的情况兜底）
  if (state.memberships?.[id]) clearMembership(state, id, false);

  const exp = { ...state.time, day: state.time.day + def.days };
  // 归一化：day 溢出时进位到月/年，保证 absoluteDay 比较正确
  while (exp.day > DAYS_PER_MONTH) {
    exp.day -= DAYS_PER_MONTH;
    exp.month++;
    if (exp.month > 12) {
      exp.month = 1;
      exp.year++;
    }
  }

  state.memberships[id] = { day: exp.day, month: exp.month, year: exp.year };
  state.flags[def.flag] = true;
  addItem(state, def.itemId);

  pushLog(
    state,
    def.icon,
    `办了张${def.name}（${def.price} 元），有效期 ${def.days} 天，${exp.year}年${exp.month}月${exp.day}日到期`,
  );
  return { ok: true, daysLeft: def.days };
}

/** 收回会籍：删背包物品 + 清 flag + 删到期记录 */
function clearMembership(state: GameState, id: string, log = true): void {
  const def = MEMBERSHIPS[id];
  if (!def) return;
  delete state.memberships[id];
  state.flags[def.flag] = false;
  removeItem(state, def.itemId, 1);
  if (log) {
    pushLog(state, def.icon, `${def.name}已到期失效，想继续练得重新办卡`);
  }
}

/**
 * 到期检查（每晚 sleepSettlement 调用）。
 * 同时做「flag 与实际有效期对账」，修正老存档/异常写入导致的 flag 悬空。
 */
export function checkMembershipExpiry(state: GameState): void {
  if (!state.memberships) state.memberships = {};
  for (const id of Object.keys(MEMBERSHIPS)) {
    const def = MEMBERSHIPS[id];
    const has = !!state.memberships[id];
    if (has && !isMembershipActive(state, id)) {
      clearMembership(state, id);
    } else if (!has && state.flags[def.flag]) {
      // 无到期记录却挂着 flag（老存档 v≤10 的静态 flag）→ 视为失效
      state.flags[def.flag] = false;
    }
  }
}

/** 会籍状态摘要（UI 展示用） */
export function membershipSummary(
  state: GameState,
): Array<{ id: string; name: string; icon: string; daysLeft: number; active: boolean }> {
  return Object.values(MEMBERSHIPS).map((def) => ({
    id: def.id,
    name: def.name,
    icon: def.icon,
    daysLeft: membershipDaysLeft(state, def.id),
    active: isMembershipActive(state, def.id),
  }));
}
