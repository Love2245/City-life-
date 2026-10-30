/**
 * 轻量批量模拟器（质量门禁用，不参与正式游戏 UI）。
 * 用同一套 GameState / RNG / 工作 / 睡眠逻辑跑 30/90/360 天，输出经济与事件指标，
 * 便于后续平衡调整有数据依据，而不是凭感觉改数值。
 */
import type { GameMode } from "../types";
import { createInitialState } from "./state";
import { refreshLaborMarket, performJob, completeWork } from "./jobs";
import { rollEvent, applyEventChoice } from "./events";
import { naturalWakeHours, sleep } from "./time";
import { gameDay } from "./calendar";

export type SimulationHorizon = 30 | 90 | 360;

export interface SimulationOptions {
  days?: SimulationHorizon;
  runs?: number;
  seed?: number;
  mode?: GameMode;
}

export interface SimulationRun {
  survived: boolean;
  endingId: string | null;
  days: number;
  finalMoney: number;
  earned: number;
  eventIds: string[];
}

export interface SimulationReport {
  days: SimulationHorizon;
  runs: number;
  bankruptcyRate: number;
  endingReachRate: number;
  eventRepeatRate: number;
  finalMoney: { min: number; median: number; max: number; average: number };
  income: { min: number; median: number; max: number; average: number };
  runsDetail: SimulationRun[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function summary(values: number[]): SimulationReport["finalMoney"] {
  if (values.length === 0) return { min: 0, median: 0, max: 0, average: 0 };
  return {
    min: Math.min(...values),
    median: median(values),
    max: Math.max(...values),
    average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
  };
}

/** 单局保守策略：优先接无门槛日结，睡到自然醒，偶尔承接第一个可用事件选项。 */
export function simulateRun(days: SimulationHorizon, seed: number, mode: GameMode = "normal"): SimulationRun {
  const state = createInitialState(seed);
  state.mode = mode;
  const startMoney = state.player.money;
  const eventIds: string[] = [];
  const startDay = gameDay(state.time);

  while (!state.endingId && gameDay(state.time) - startDay < days) {
    refreshLaborMarket(state);
    const offer = state.laborMarket.offers[0];
    if (offer) {
      const previousLocation = state.locationId;
      state.locationId = "labor_market";
      const begun = performJob(state, offer.uid);
      if (begun.ok && begun.session) completeWork(state, begun.session.id, 0);
      state.locationId = previousLocation;
    }

    const event = rollEvent(state, 0.2);
    if (event) {
      eventIds.push(event.id);
      // 选第一个可用选项；若门槛不满足则尝试其余选项，模拟器不阻塞在弹窗上。
      for (let i = 0; i < event.choices.length; i++) {
        if (applyEventChoice(state, event.id, i).ok) break;
      }
    }

    // 恰好 07:00 时自然醒为 0 小时（sleep 是安全空操作）；模拟器至少要推进 1 小时，
    // 否则 while 循环不耗时不结束。初始存档正是 07:00，这条守卫必须有。
    const hours = Math.max(1, naturalWakeHours(state));
    sleep(state, hours);
  }

  const elapsed = Math.min(days, Math.max(0, gameDay(state.time) - startDay));
  const earned = state.player.money - startMoney;
  return {
    survived: !state.endingId,
    endingId: state.endingId,
    days: elapsed,
    finalMoney: Math.round(state.player.money),
    earned: Math.round(earned),
    eventIds,
  };
}

export function runBatchSimulation(options: SimulationOptions = {}): SimulationReport {
  const days = options.days ?? 30;
  const runs = Math.max(1, Math.min(1000, Math.floor(options.runs ?? 30)));
  const seed = options.seed ?? 1395;
  const details = Array.from({ length: runs }, (_, i) => simulateRun(days, seed + i * 9973, options.mode ?? "normal"));
  const money = details.map((r) => r.finalMoney);
  const income = details.map((r) => r.earned);
  const events = details.flatMap((r) => r.eventIds);
  const uniqueEvents = new Set(events).size;
  return {
    days,
    runs,
    bankruptcyRate: details.filter((r) => r.endingId === "ending_bankrupt").length / runs,
    endingReachRate: details.filter((r) => !!r.endingId).length / runs,
    eventRepeatRate: events.length === 0 ? 0 : 1 - uniqueEvents / events.length,
    finalMoney: summary(money),
    income: summary(income),
    runsDetail: details,
  };
}
