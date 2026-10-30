import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { ACTIONS, performAction } from "../src/game/core/actions";
import { JOB_DEFS } from "../src/game/core/jobs";
import { settleInvestments } from "../src/game/core/invest";
import { tickLoans } from "../src/game/core/relationships";
import { checkEnding } from "../src/game/core/endings";
import { nap } from "../src/game/core/time";
import { addItem } from "../src/game/core/items";
import { getMiniGameConfigFor } from "../src/game/core/minigame";

describe("v1.455 审计修复回归", () => {
  it("投资收益围绕产品期望值波动，而不是系统性负收益", () => {
    const meanRate = (productId: string, samples: number): number => {
      let total = 0;
      for (let seed = 1; seed <= samples; seed += 1) {
        const state = createInitialState(seed);
        state.time.day = 30;
        const value = 1_000_000;
        state.economy.investments = [{
          id: `audit_${productId}_${seed}`,
          productId,
          principal: value,
          value,
          boughtDay: 0,
        }];
        settleInvestments(state);
        total += (state.economy.investments[0].value / value) - 1;
      }
      return total / samples;
    };

    expect(Math.abs(meanRate("fund", 2_000) - 0.006)).toBeLessThan(0.002);
    expect(Math.abs(meanRate("stock", 2_000) - 0.02)).toBeLessThan(0.005);
  });

  it("三种摆摊都配置了按日限制和正向小游戏收入，项目端不提前重复结算", () => {
    const expected = [
      ["stall_street_night", "stall_street_day", 2, 30],
      ["stall_market_fair", "stall_market_day", 3, 55],
      ["stall_snack_street", "stall_snack_day", 2, 45],
    ] as const;
    for (const [actionId, flag, duration, income] of expected) {
      const action = ACTIONS.find((row) => row.id === actionId);
      expect(action?.duration).toBeGreaterThanOrEqual(duration);
      expect(action?.requirements?.oncePerDay).toBe(flag);
      const project = action?.projectId;
      expect(project).toBeTruthy();
      // 通过项目数据间接确认按次收入已经接通；避免把金额重复写进测试 fixture。
      const state = createInitialState(7);
      state.player.skills.cooking = 2;
      state.locationId = action!.locationId;
      state.time.hour = 9;
      if (project === "market_stall") {
        addItem(state, "farm_vegetable", 1);
        addItem(state, "farm_egg", 1);
      } else {
        addItem(state, "vegetable", 1);
        addItem(state, "meat", 1);
      }
      const before = state.player.money;
      const beforeStamina = state.player.attrs.stamina;
      const beforeTime = structuredClone(state.time);
      const result = performAction(state, actionId);
      expect(result.ok, `${actionId}: ${result.reason ?? ""}`).toBe(true);
      expect(state.player.money).toBe(before);
      expect(state.player.attrs.stamina).toBe(beforeStamina);
      expect(state.time).toEqual(beforeTime);
      expect(state.flags[flag]).toBe(0);
      const config = getMiniGameConfigFor(state, actionId);
      expect(config).toMatchObject({ type: "restaurant", stall: true });
      expect(config?.type === "restaurant" ? config.stallPerCustomerPay ?? 0 : 0).toBeGreaterThan(0);
      const second = performAction(state, actionId);
      expect(second.ok).toBe(false);
      expect(second.reason, actionId).toContain("今天已经做过一次");
      expect(income).toBeGreaterThan(0);
    }
  });

  it("工资数据落在参考带内，低门槛巴士临时班不再压过持证岗位", () => {
    for (const job of JOB_DEFS) {
      const money = job.effects.money ?? 0;
      if (job.duration <= 0 || money <= 0) continue;
      const hourly = money / job.duration;
      expect(hourly, job.id).toBeGreaterThanOrEqual(15);
      expect(hourly, job.id).toBeLessThanOrEqual(20);
    }
    const bus = ACTIONS.find((row) => row.id === "bus_station_gig")!;
    const certified = JOB_DEFS.find((job) => job.id === "job_convenience_clerk")!;
    expect((bus.effects.money ?? 0) / (bus.duration ?? 1)).toBeLessThanOrEqual(
      (certified.effects.money ?? 0) / certified.duration,
    );
  });

  it("小睡消耗对应清醒时段的饱腹，不再免费循环恢复", () => {
    const state = createInitialState();
    state.time.hour = 12;
    state.player.attrs.satiety = 50;
    nap(state, 2);
    expect(state.player.attrs.satiety).toBe(44);
    expect(state.time.hour).toBe(14);
  });

  it("逾期 NPC 借款先追扣现金，余额进入债务并参与破产结局", () => {
    const state = createInitialState();
    state.player.money = 50;
    state.relationships.push({
      npcId: "npc_wang_lei",
      affinity: 70,
      state: "friend",
      loan: { amount: 500, since: -31 },
    });
    const logs = tickLoans(state);
    expect(state.player.money).toBe(0);
    expect(state.player.debt).toBe(450);
    expect(state.relationships[0].loan).toBeUndefined();
    expect(state.relationships[0].state).toBe("blocked");
    expect(logs.join(" ")).toContain("剩余欠款 450 元");

    state.player.money = 100;
    tickLoans(state);
    expect(state.player.money).toBe(0);
    expect(state.player.debt).toBe(350);

    state.player.negativeMoneyStreak = 0;
    expect(checkEnding(state)).toBeNull(); // 单有债务不会即时离场
    state.player.debtStreak = 2;
    expect(checkEnding(state)).toBeNull();
    state.player.debtStreak = 3;
    expect(checkEnding(state)?.id).toBe("ending_bankrupt");
  });
});

