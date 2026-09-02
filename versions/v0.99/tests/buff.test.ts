import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { reconcileStatuses, upsertStatus, hasStatus, STATUS_NAMES, STATUS_ICONS } from "../src/game/core/statuses";
import { sleepSettlement } from "../src/game/core/time";
import { rollEvent } from "../src/game/core/events";

describe("v0.95 状态/Buff 扩展", () => {
  it("新状态有中文名与图标", () => {
    expect(STATUS_NAMES.insomnia).toBe("失眠");
    expect(STATUS_NAMES.cold).toBe("感冒");
    expect(STATUS_NAMES.lucky).toBe("好运");
    expect(STATUS_NAMES.unlucky).toBe("霉运");
    expect(STATUS_ICONS.insomnia).toBe("🌙");
    expect(STATUS_ICONS.cold).toBe("🤧");
    expect(STATUS_ICONS.lucky).toBe("🍀");
    expect(STATUS_ICONS.unlucky).toBe("☔");
  });

  it("失眠：短睡(<4h)累积，长睡(≥8h)解除", () => {
    const s = createInitialState();
    reconcileStatuses(s, { slept: true, hoursSlept: 3 });
    expect(hasStatus(s, "insomnia")).toBe(true);
    reconcileStatuses(s, { slept: true, hoursSlept: 8 });
    expect(hasStatus(s, "insomnia")).toBe(false);
  });

  it("恶性循环：失眠 severity≥2 时每晚 20% 概率得感冒（固定 rng）", () => {
    // 构造 rng 使 chance(rng, 0.2) 命中：seed 确定性可复现
    const s = createInitialState(1);
    upsertStatus(s, "insomnia", 2); // severity ≥ 2
    let gotCold = false;
    for (let i = 0; i < 100 && !gotCold; i++) {
      reconcileStatuses(s, { slept: true, hoursSlept: 5 });
      gotCold = hasStatus(s, "cold");
    }
    expect(gotCold).toBe(true); // 100 次内必中
  });

  it("雨天（weather=rain）失眠→感冒概率提升", () => {
    const s = createInitialState(1);
    upsertStatus(s, "insomnia", 2);
    s.weather = { id: "rain", lastRollDay: 0 };
    let gotCold = false;
    for (let i = 0; i < 20 && !gotCold; i++) {
      reconcileStatuses(s, { slept: true, hoursSlept: 5 });
      gotCold = hasStatus(s, "cold");
    }
    expect(gotCold).toBe(true); // 50% 概率 20 次内必中
  });

  it("感冒恶化：感冒 + 健康<40 → 升级为生病（sick）", () => {
    const s = createInitialState();
    upsertStatus(s, "cold");
    s.player.attrs.health = 30;
    reconcileStatuses(s, {});
    expect(hasStatus(s, "cold")).toBe(false);
    expect(hasStatus(s, "sick")).toBe(true);
  });

  it("健康恢复后感冒不恶化（health≥40 保持 cold）", () => {
    const s = createInitialState();
    upsertStatus(s, "cold");
    s.player.attrs.health = 60;
    reconcileStatuses(s, {});
    expect(hasStatus(s, "cold")).toBe(true);
    expect(hasStatus(s, "sick")).toBe(false);
  });

  it("良性循环：好运期间心情结算 +2", () => {
    const s = createInitialState();
    upsertStatus(s, "lucky");
    const before = s.player.attrs.mood;
    sleepSettlement(s, { stayedUp: false, hours: 8 });
    // 基础 +8 + 档位加成(政府住房 v0.97=5) + 好运(2) = +15；若 mood 满则 100
    expect(s.player.attrs.mood).toBe(Math.min(100, before + 8 + 5 + 2));
  });

  it("霉运期间心情结算 -1", () => {
    const s = createInitialState();
    upsertStatus(s, "unlucky");
    const before = s.player.attrs.mood;
    sleepSettlement(s, { stayedUp: false, hours: 8 });
    expect(s.player.attrs.mood).toBe(Math.min(100, before + 8 + 5 - 1));
  });

  it("好运/霉运 3 晚后自动解除", () => {
    const s = createInitialState();
    upsertStatus(s, "lucky");
    for (let i = 0; i < 3; i++) {
      sleepSettlement(s, { stayedUp: false, hours: 8 });
    }
    expect(hasStatus(s, "lucky")).toBe(false);
  });

  it("霉运时负面事件权重放大（rollEvent 可复现）", () => {
    const s = createInitialState(7);
    s.locationId = "street";
    s.time = { ...s.time, year: 2026, month: 11, day: 1 }; // difficulty 3（负面事件 pickpocket 可入池）
    upsertStatus(s, "unlucky");
    let negative = 0;
    for (let i = 0; i < 50; i++) {
      const ev = rollEvent(s, 1); // 必触发
      if (ev && ev.tone === "negative") negative++;
    }
    expect(negative).toBeGreaterThan(0); // 霉运使负面事件权重 ×1.5，必能抽到
  });
});
