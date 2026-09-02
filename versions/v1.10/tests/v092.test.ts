/**
 * v0.92 新增机制回归测试：
 * 会籍月卡 / 菜市场生鲜 + 烹饪 / 便利店堂食打包 / 生存指标惩罚体系。
 */
import { describe, it, expect } from "vitest";
import type { GameState } from "../src/game/types";
import { createInitialState } from "../src/game/core/state";
import { canPerform, performAction, getAction } from "../src/game/core/actions";
import {
  buyMembership,
  isMembershipActive,
  membershipDaysLeft,
  checkMembershipExpiry,
} from "../src/game/core/membership";
import { canCook, missingIngredients, getRecipe, RECIPES } from "../src/game/core/cooking";
import { addItem, itemCount } from "../src/game/core/items";
import {
  canWork,
  guardSurvival,
  dailySurvivalSettlement,
  cureDepression,
  isDepressed,
  attrSeverity,
  worstSeverity,
  survivalWarnings,
  DEPRESSION_DAYS,
  DEAD_HEALTH_GRACE_DAYS,
} from "../src/game/core/survival";
import { hasStatus, upsertStatus } from "../src/game/core/statuses";

/** 造一个「白天、在指定地点、有钱、状态健康」的干净局面 */
function freshAt(locationId: string, money = 2000): GameState {
  const s = createInitialState();
  s.time.hour = 12;
  s.locationId = locationId;
  s.player.money = money;
  s.player.attrs.stamina = 80;
  s.player.attrs.health = 80;
  s.player.attrs.mood = 70;
  s.player.attrs.hygiene = 80;
  s.player.attrs.satiety = 70;
  return s;
}

/** 切到有厨房的出租屋（v1.10：需持烹饪器具 flag） */
function withKitchen(s: GameState): GameState {
  s.living.mode = "lease";
  s.living.lease = {
    housingId: "old_apartment",
    monthlyRent: 1200,
    paidUntil: { year: s.time.year, month: s.time.month + 1, day: s.time.day },
  } as unknown as GameState["living"]["lease"];
  s.flags["cook_utensil"] = true;
  return s;
}

/** 模拟一次「每日生存结算」并落地抑郁状态。
 *  逻辑层 dailySurvivalSettlement 不默认写状态，必须显式传 hooks，
 *  否则 depressed 状态不会进入 state.statuses（isDepressed 查不到）。 */
function runDaily(s: GameState): void {
  dailySurvivalSettlement(s, {
    upsertStatus: (id, sev) => upsertStatus(s, id, sev ?? 1),
    log: () => {},
  });
}

// ───────────────────────── 健身月卡 ─────────────────────────
describe("v0.92 健身房月卡有效期", () => {
  it("未办卡时锻炼被锁定", () => {
    const s = freshAt("gym");
    const a = getAction("exercise_gym")!;
    const r = canPerform(s, a);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("健身月卡");
  });

  it("办卡后扣款、卡片入包、解锁锻炼", () => {
    const s = freshAt("gym");
    const r = performAction(s, "gym_membership");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(2000 - 300);
    expect(itemCount(s, "gym_card")).toBe(1);
    expect(isMembershipActive(s, "gym")).toBe(true);
    expect(membershipDaysLeft(s, "gym")).toBe(30);
    expect(canPerform(s, getAction("exercise_gym")!).ok).toBe(true);
  });

  it("有效期内不能重复办卡", () => {
    const s = freshAt("gym");
    performAction(s, "gym_membership");
    const again = performAction(s, "gym_membership");
    expect(again.ok).toBe(false);
    expect(again.reason).toContain("有效期内");
    expect(s.player.money).toBe(2000 - 300);
  });

  it("到期后自动失效：卡片回收 + 锻炼重新锁定", () => {
    const s = freshAt("gym");
    buyMembership(s, "gym");
    // 时间推到 31 天后（统一 30 天月：次月同日 + 1）
    s.time.month += 1;
    s.time.day += 1;
    checkMembershipExpiry(s);
    expect(isMembershipActive(s, "gym")).toBe(false);
    expect(itemCount(s, "gym_card")).toBe(0);
    expect(s.flags["gym_member"]).toBe(false);
    expect(canPerform(s, getAction("exercise_gym")!).ok).toBe(false);
  });

  it("老存档只挂 flag 无到期日 → 对账后判定失效", () => {
    const s = freshAt("gym");
    s.flags["gym_member"] = true; // v0.91 遗留写法
    checkMembershipExpiry(s);
    expect(s.flags["gym_member"]).toBe(false);
    expect(isMembershipActive(s, "gym")).toBe(false);
  });
});

// ───────────────────── 菜市场 / 便利店 / 烹饪 ─────────────────────
describe("v0.92 菜市场生鲜与烹饪", () => {
  it("菜市场只卖水果/蔬菜/肉类，不再卖三明治与沙拉", () => {
    expect(getAction("buy_sandwich_market")).toBeUndefined();
    expect(getAction("buy_salad_market")).toBeUndefined();
    expect(getAction("buy_fruit_market")?.handler).toBe("buy_fresh");
    expect(getAction("buy_vegetable_market")?.handler).toBe("buy_ingredient");
    expect(getAction("buy_meat_market")?.handler).toBe("buy_ingredient");
  });

  it("买蔬菜直接入包，不当场生效", () => {
    const s = freshAt("market");
    const before = s.player.attrs.satiety;
    const r = performAction(s, "buy_vegetable_market");
    expect(r.ok).toBe(true);
    expect(itemCount(s, "vegetable")).toBe(1);
    expect(s.player.attrs.satiety).toBeLessThanOrEqual(before); // 生的，没吃（仅随时间衰减，不上升）
  });

  it("v1.10：无烹饪器具（含出租屋）→ 烹饪锁定；持器具可做饭", () => {
    const s = freshAt("home");
    s.living.mode = "lease";
    s.living.lease = {
      housingId: "old_apartment",
      monthlyRent: 1200,
      paidUntil: { year: s.time.year, month: s.time.month + 1, day: s.time.day },
    } as unknown as GameState["living"]["lease"];
    addItem(s, "vegetable", 1);
    const locked = canCook(s, "dish_veg");
    expect(locked.ok).toBe(false);
    expect(locked.reason).toContain("厨具");

    withKitchen(s);
    expect(canCook(s, "dish_veg").ok).toBe(true);
  });

  it("食材不足时给出明确缺口提示", () => {
    const s = withKitchen(freshAt("home"));
    const r = canCook(s, "dish_veg");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("蔬菜");
    expect(missingIngredients(s, getRecipe("dish_veg")!)).toEqual(["蔬菜 ×1"]);
  });

  it("下厨消耗食材并即时回饱腹", () => {
    const s = withKitchen(freshAt("home"));
    addItem(s, "vegetable", 1);
    s.player.attrs.satiety = 40;
    const r = performAction(s, "cook_dish_veg");
    expect(r.ok).toBe(true);
    expect(itemCount(s, "vegetable")).toBe(0);
    expect(s.player.attrs.satiety).toBeGreaterThan(40);
  });

  it("厨艺不足时高级菜谱锁定", () => {
    const s = withKitchen(freshAt("home"));
    addItem(s, "meat", 1);
    s.player.skills.cooking = 0;
    const r = canCook(s, "dish_meat");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("厨艺");
  });

  it("所有菜谱的食材都是可购买的真实物品", () => {
    const buyable = new Set(["vegetable", "meat"]);
    for (const r of RECIPES) {
      for (const id of Object.keys(r.needs)) {
        expect(buyable.has(id), `${r.id} 需要未上架的食材 ${id}`).toBe(true);
      }
    }
  });
});

// ───────────────────── 便利店堂食 / 打包 ─────────────────────
describe("v0.92 便利店堂食与打包", () => {
  it("便利店餐饮全部走堂食/打包询问", () => {
    for (const id of [
      "buy_lunch_convenience",
      "buy_drink_convenience",
      "buy_sandwich_convenience",
      "buy_salad_convenience",
      "buy_noodles_convenience",
    ]) {
      expect(getAction(id)?.handler, id).toBe("buy_food");
    }
  });

  it("堂食：当场吃完，效果立即生效且不入包", () => {
    const s = freshAt("convenience_store");
    s.player.attrs.satiety = 30;
    const r = performAction(s, "buy_lunch_convenience", { dine: "eat" });
    expect(r.ok).toBe(true);
    expect(itemCount(s, "bento")).toBe(0);
    expect(s.player.attrs.satiety).toBeGreaterThan(30);
  });

  it("打包：只入背包，饱腹不变", () => {
    const s = freshAt("convenience_store");
    s.player.attrs.satiety = 30;
    const r = performAction(s, "buy_lunch_convenience", { dine: "pack" });
    expect(r.ok).toBe(true);
    expect(itemCount(s, "bento")).toBe(1);
    expect(s.player.attrs.satiety).toBeLessThanOrEqual(30); // 打包不进食，饱腹不因吃上升（仅随时间衰减）
  });

  it("缺省不传选项时按打包处理（兜底不丢东西）", () => {
    const s = freshAt("convenience_store");
    performAction(s, "buy_lunch_convenience");
    expect(itemCount(s, "bento")).toBe(1);
  });

  it("水果摊：可当场吃掉也可带走", () => {
    const eatState = freshAt("market");
    eatState.player.attrs.satiety = 40;
    performAction(eatState, "buy_fruit_market", { dine: "eat" });
    expect(itemCount(eatState, "fruit")).toBe(0);
    expect(eatState.player.attrs.satiety).toBeGreaterThan(40);

    const packState = freshAt("market");
    performAction(packState, "buy_fruit_market", { dine: "pack" });
    expect(itemCount(packState, "fruit")).toBe(1);
  });
});

// ───────────────────── 生存指标惩罚体系 ─────────────────────
describe("v0.92 生存指标惩罚体系", () => {
  it("体力归零强行高强度活动 → 晕倒", () => {
    const s = freshAt("gym");
    buyMembership(s, "gym");
    s.player.attrs.stamina = 0;
    let collapsed = false;
    const g = guardSurvival(s, "健身房锻炼", () => {
      collapsed = true;
    });
    expect(g.ok).toBe(false);
    expect(collapsed).toBe(true);
  });

  it("饱腹归零同样触发晕倒并额外扣健康", () => {
    const s = freshAt("gym");
    s.player.attrs.satiety = 0;
    const healthBefore = s.player.attrs.health;
    let collapsed = false;
    const g = guardSurvival(s, "健身房锻炼", () => {
      collapsed = true;
    });
    expect(g.ok).toBe(false);
    expect(collapsed).toBe(true);
    expect(s.player.attrs.health).toBeLessThan(healthBefore);
  });

  it("干净度过低 → 无法上班", () => {
    const s = freshAt("home");
    s.player.attrs.hygiene = 10;
    const r = canWork(s);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("澡");
  });

  it("心情连续 7 天低于 30 → 抑郁，且抑郁期间无法上班", () => {
    const s = freshAt("home");
    s.player.attrs.mood = 20;
    for (let i = 0; i < DEPRESSION_DAYS; i++) runDaily(s);
    expect(isDepressed(s)).toBe(true);
    expect(hasStatus(s, "depressed")).toBe(true);
    const w = canWork(s);
    expect(w.ok).toBe(false);
    expect(w.reason).toContain("门诊");
  });

  it("心情回升会清空抑郁累计天数", () => {
    const s = freshAt("home");
    s.player.attrs.mood = 20;
    for (let i = 0; i < 3; i++) dailySurvivalSettlement(s);
    expect(s.player.depressionStreak).toBe(3);
    s.player.attrs.mood = 60;
    dailySurvivalSettlement(s);
    expect(s.player.depressionStreak).toBe(0);
  });

  it("心理门诊可治愈抑郁并恢复上班能力", () => {
    const s = freshAt("hospital");
    s.player.attrs.mood = 20;
    for (let i = 0; i < DEPRESSION_DAYS; i++) runDaily(s);
    expect(isDepressed(s)).toBe(true);

    const r = performAction(s, "treat_depression_hospital");
    expect(r.ok).toBe(true);
    expect(isDepressed(s)).toBe(false);
    expect(s.player.depressionStreak).toBe(0);
    expect(canWork(s).ok).toBe(true);
  });

  it("没有抑郁时心理门诊拒绝执行（不白花钱）", () => {
    const s = freshAt("hospital");
    const r = performAction(s, "treat_depression_hospital");
    expect(r.ok).toBe(false);
    expect(s.player.money).toBe(2000);
  });

  it("健康归零逐日累计，超过抢救期返回猝死信号", () => {
    const s = freshAt("home");
    s.player.attrs.health = 0;
    let dead = false;
    for (let i = 0; i <= DEAD_HEALTH_GRACE_DAYS; i++) {
      const r = dailySurvivalSettlement(s);
      if (r.suddenDeath) dead = true;
    }
    expect(s.player.criticalHealthStreak).toBeGreaterThan(DEAD_HEALTH_GRACE_DAYS);
    expect(dead).toBe(true);
  });

  it("健康恢复后猝死倒计时清零", () => {
    const s = freshAt("home");
    s.player.attrs.health = 0;
    dailySurvivalSettlement(s);
    expect(s.player.criticalHealthStreak).toBe(1);
    s.player.attrs.health = 30;
    dailySurvivalSettlement(s);
    expect(s.player.criticalHealthStreak).toBe(0);
  });

  it("告警分级与文案生成正确", () => {
    const s = freshAt("home");
    expect(attrSeverity("satiety", 80)).toBe("ok");
    expect(attrSeverity("satiety", 20)).toBe("warn");
    expect(attrSeverity("satiety", 5)).toBe("danger");
    expect(attrSeverity("satiety", 0)).toBe("critical");

    expect(worstSeverity(s)).toBe("ok");
    expect(survivalWarnings(s)).toHaveLength(0);

    s.player.attrs.satiety = 0;
    s.player.attrs.hygiene = 10;
    expect(worstSeverity(s)).toBe("critical");
    const warns = survivalWarnings(s);
    expect(warns.length).toBeGreaterThan(0);
    expect(warns[0].severity).toBe("critical");
  });

  it("治愈抑郁对非抑郁状态返回 false", () => {
    const s = freshAt("home");
    expect(cureDepression(s)).toBe(false);
  });
});
