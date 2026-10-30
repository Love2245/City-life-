/**
 * v1.3 自媒体直播
 * ------------------------------------------------------------------
 * 直播才艺赚影响力（fame）与打赏（money）。
 * 前置：当前设备已安装直播软件，并拥有电脑或有效网吧机位。
 * 限制：每天最多直播 1 次（lastStreamDay 闸门）；收益受笔记本档位加成。
 */
import type { GameState } from "../types";
import { gameDay } from "./calendar";
import { randomInt } from "../rng";
import { hasLaptop as hasPc, laptopTier as pcTierOf } from "./projects";
import { recordMoney } from "./weekly";
import { LIVE_FEATURE_ENABLED, isLaptopAppInstalled, type AppPlatform } from "./apps";
import { changeGrowthStat } from "./growthStats";
/** 笔记本档位 → 直播收益系数与基础打赏（v1.43 统一走 projects 的电脑档位，网吧机按办公本计） */
function laptopTier(state: GameState): { tier: "low" | "mid" | "high"; mult: number } {
  const tier = pcTierOf(state);
  if (tier === "high") return { tier: "high", mult: 1.8 };
  if (tier === "mid") return { tier: "mid", mult: 1.35 };
  return { tier: "low", mult: 1.0 };
}

export interface LiveCheck {
  ok: boolean;
  reason?: string;
  tier?: "low" | "mid" | "high";
  /** 供界面显示对应的安装/上机入口，不解析错误文案。 */
  missing?: "installation" | "computer";
}

/** 直播前置校验 */
export function canLive(state: GameState, platform: AppPlatform = "phone"): LiveCheck {
  if (!LIVE_FEATURE_ENABLED) return { ok: false, reason: "自媒体直播暂未开放，等待后续开发" };
  const installed = platform === "laptop" ? isLaptopAppInstalled(state, "live") : !!state.flags.app_live;
  if (!installed) return {
    ok: false,
    reason: `尚未在${platform === "laptop" ? "电脑" : "手机"}安装「自媒体直播」，请到${platform === "laptop" ? "电脑软件商城" : "手机应用市场"}安装`,
    missing: "installation",
  };
  if (!hasPc(state)) return {
    ok: false, reason: "需要自有电脑或有效网吧机位才能开播，可前往网吧上机", missing: "computer",
  };
  return { ok: true, tier: laptopTier(state).tier };
}

/** 开播：每天 1 次，按档位给 fame + money */
export function startLive(state: GameState, platform: AppPlatform = "phone"): { ok: boolean; text: string; fame?: number; money?: number } {
  if (!state.live) state.live = { streaming: false, lastStreamDay: -1, totalFameGain: 0 };
  // 直播在本次调用内完成，没有后台进行中的会话；兼容清除旧档遗留的 true。
  state.live.streaming = false;
  const check = canLive(state, platform);
  if (!check.ok) return { ok: false, text: check.reason ?? "无法开播" };

  const today = gameDay(state.time);
  if (state.live.lastStreamDay === today) {
    return { ok: false, text: "今天已经播过了，明天再来吧" };
  }

  const { mult } = laptopTier(state);
  // 基础打赏 60~120，fame 8~18，按档位放大
  const rnd = (a: number, b: number) => randomInt(state.rng, a, b);
  const money = Math.round(rnd(60, 120) * mult);
  const fame = Math.round(rnd(8, 18) * mult);

  state.player.money += money;
  recordMoney(state, money); // 周记：直播打赏计入收入
  // 影响力与其它属性一样 clamp 0-100（此前直加可突破上限）
  changeGrowthStat(state, "fame", fame);
  state.live.lastStreamDay = today;
  state.live.totalFameGain += fame;
  state.live.streaming = false;

  return { ok: true, text: `直播结束：收获打赏 ¥${money}，影响力 +${fame}`, fame, money };
}

/** 今日是否已直播 */
export function liveToday(state: GameState): boolean {
  if (!state.live) return false;
  return state.live.lastStreamDay === gameDay(state.time);
}
