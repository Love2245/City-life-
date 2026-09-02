/**
 * 临时 Bug 复现验证（审查后删除）。
 * 验证核心逻辑层存在的游戏性 Bug。
 */
import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import type { GameState } from "../src/game/types";
import { ensureRelationship, addAffinity, canBorrow, currentState } from "../src/game/core/relationships";
import { performAction } from "../src/game/core/actions";
import { getEffectiveLodging, signLease } from "../src/game/core/housing";
import { sleep, advanceHours } from "../src/game/core/time";
import { rentVehicle, buyVehicle } from "../src/game/core/vehicle";
import { resolveVehicle } from "../src/game/core/jobs";
import { gameDay } from "../src/game/core/calendar";

describe("Bug 验证", () => {
  it("BUG1: 借款功能永远不可用（rel.state 永不为 friend）", () => {
    const s = createInitialState(42);
    // 模拟达到朋友关系（好感 60，dateNpc/giftNpc 只会调 addAffinity）
    const rel = ensureRelationship(s, "npc_lin_xiaoyu");
    addAffinity(s, "npc_lin_xiaoyu", 60, "test");
    // addAffinity 之后 currentState 应已派生为 friend
    expect(currentState(rel)).toBe("friend");
    // 但 canBorrow 用字段 rel.state 判断，字段仍是 stranger → 永远借不了
    expect(rel.state).toBe("stranger");
    expect(canBorrow(s, "npc_lin_xiaoyu")).toBe(false);
    // 即使好感 100
    addAffinity(s, "npc_lin_xiaoyu", 40, "test");
    expect(canBorrow(s, "npc_lin_xiaoyu")).toBe(false);
  });

  it("BUG2: 劳务市场 800 元永久电动车绕过了载具到期系统", () => {
    const s = createInitialState(42);
    s.player.money = 5000;
    s.locationId = "labor_market";
    // 800 元「买二手电动车」通用行动
    const r = performAction(s, "buy_e_bike_labor");
    expect(r.ok).toBe(true);
    // flag 置位，可跑外卖
    expect(s.flags["item_e_bike"]).toBe(true);
    expect(resolveVehicle(s)).toBe("e_bike");
    // 但 vehicles 里没有记录 → checkVehicleExpiry 永不回收（永久免费）
    expect(s.vehicles["e_bike"]).toBeUndefined();
    // 对比正规买断：buyVehicle 3000 元才永久拥有
    const s2 = createInitialState(42);
    s2.player.money = 5000;
    const buy = buyVehicle(s2, "e_bike");
    expect(buy.ok).toBe(true);
    expect(s2.vehicles["e_bike"]?.owned).toBe(true);
  });

  it("BUG3: 月租在每月 1 号入睡时扣，且签约当天是 1 号会双扣", () => {
    const s = createInitialState(42);
    // 开局 2026-08-01（day=1, 是月租结算日）
    s.player.money = 5000;
    s.locationId = "housing_agency";
    // 8月1号签约普通出租屋 1000 元
    const r = signLease(s, "old_apartment");
    expect(r.ok).toBe(true);
    const paid = 1000 - Math.round(1000 * 0); // 普通家庭无折扣
    expect(s.player.money).toBe(5000 - paid);
    // 当天晚上睡觉 → sleepSettlement 里 time.day===1 → 再扣一次房租
    s.time.hour = 22;
    sleep(s, 8);
    // 睡后 money 应再少 1000（双扣）
    expect(s.player.money).toBe(5000 - paid - 1000);
  });

  it("BUG4: 洗浴中心24h套餐跳过所有睡眠结算（工资/房租/状态/结局）", () => {
    const s = createInitialState(42);
    s.player.money = 10000;
    s.locationId = "bathhouse";
    s.flags["hospitalized"] = true; // 若住院应扣住院费/结算
    const beforeMoney = s.player.money;
    const r = performAction(s, "bath_center");
    expect(r.ok).toBe(true);
    // 泡 24h 后时间跨天，但 sleepSettlement 未执行 → hospitalized 标志没被处理、饱腹被强制补满
    // 若走了睡眠结算，hungryStreak/状态等应变化；这里验证跨天但结算缺失
    const crossed = r.crossedDay;
    expect(crossed).toBe(true);
    // 医院住院结算每晚 -60 元 + 健康+15，泡澡绕过 → 没有任何住院结算
    // （此处仅验证 slept_once 未标记，说明确实未走睡眠结算）
    expect(s.flags["slept_once"]).toBeUndefined();
    // 时间跨天但 workday 相关结算也没走
    void beforeMoney;
  });

  it("BUG5: 周期发薪根本没看发薪日——每周/月结岗每晚睡觉都发薪", () => {
    const s = createInitialState(42);
    // 在职周结岗，workedDays=3，时间设为非发薪日（day=10）
    s.time.day = 10;
    s.career.jobId = "job_factory_qc";
    s.career.kind = "weekly";
    s.career.workedDays = 3;
    s.career.lastWorkDay = gameDay(s.time) - 1;
    s.flags["employed"] = true;
    const moneyBefore = s.player.money;
    // day=10 不是 7/14/21/28，但睡觉就发薪
    s.time.hour = 22;
    sleep(s, 8);
    // isPayday(10)=false，但 paycheck 仍执行 → 发了 3*75=225
    expect(s.player.money).toBe(moneyBefore + 225);
  });

  it("BUG6: buy_ingredient 弹窗显示原始价与实际扣款（通胀价）不一致", () => {
    const s = createInitialState(42);
    s.player.money = 5000;
    s.economy.priceIndex = 2.0; // 模拟通胀 2 倍
    s.locationId = "market";
    const r = performAction(s, "buy_vegetable_market");
    expect(r.ok).toBe(true);
    // 实际扣款 = 4 * 2.0 = 8 元，但 deltas 显示 4 元
    const delta = r.result?.deltas.find((d) => d.key === "money");
    expect(delta?.value).toBe(-4); // 显示的未通胀价
    expect(s.player.money).toBe(5000 - 8); // 实际扣了 8
  });
});
