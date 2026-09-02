/**
 * v1.3 自媒体直播
 * ------------------------------------------------------------------
 * 直播才艺赚影响力（fame）与打赏（money）。
 * 前置：已安装 app_live 且拥有笔记本（任一档位）。
 * 限制：每天最多直播 1 次（lastStreamDay 闸门）；收益受笔记本档位加成。
 */
import type { GameState } from "../types";
import { gameDay } from "./calendar";

/** 笔记本档位 → 直播收益系数与基础打赏 */
function laptopTier(state: GameState): { tier: "low" | "mid" | "high"; mult: number } {
  if (state.flags["item_laptop_pro"]) return { tier: "high", mult: 1.8 };
  if (state.flags["item_laptop_mid"]) return { tier: "mid", mult: 1.35 };
  if (state.flags["item_laptop"]) return { tier: "low", mult: 1.0 };
  return { tier: "low", mult: 1.0 };
}

export interface LiveCheck {
  ok: boolean;
  reason?: string;
  tier?: "low" | "mid" | "high";
}

/** 直播前置校验 */
export function canLive(state: GameState): LiveCheck {
  if (!state.flags["app_live"]) return { ok: false, reason: "尚未安装「自媒体直播」App" };
  const hasLaptop =
    !!state.flags["item_laptop"] ||
    !!state.flags["item_laptop_mid"] ||
    !!state.flags["item_laptop_pro"];
  if (!hasLaptop) return { ok: false, reason: "需要一台笔记本才能开播" };
  return { ok: true, tier: laptopTier(state).tier };
}

/** 开播：每天 1 次，按档位给 fame + money */
export function startLive(state: GameState): { ok: boolean; text: string; fame?: number; money?: number } {
  if (!state.live) state.live = { streaming: false, lastStreamDay: -1, totalFameGain: 0 };
  const check = canLive(state);
  if (!check.ok) return { ok: false, text: check.reason ?? "无法开播" };

  const today = gameDay(state.time);
  if (state.live.lastStreamDay === today) {
    return { ok: false, text: "今天已经播过了，明天再来吧" };
  }

  const { mult } = laptopTier(state);
  // 基础打赏 60~120，fame 8~18，按档位放大
  const rnd = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1));
  const money = Math.round(rnd(60, 120) * mult);
  const fame = Math.round(rnd(8, 18) * mult);

  state.player.money += money;
  state.player.stats.fame += fame;
  state.live.lastStreamDay = today;
  state.live.totalFameGain += fame;
  state.live.streaming = true;

  return { ok: true, text: `直播结束：收获打赏 ¥${money}，影响力 +${fame}`, fame, money };
}

/** 今日是否已直播 */
export function liveToday(state: GameState): boolean {
  if (!state.live) return false;
  return state.live.lastStreamDay === gameDay(state.time);
}
