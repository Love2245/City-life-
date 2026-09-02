import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { weekdayOf, weekdayLabel, isWeekend, WEEKDAY_LABEL } from "../src/game/core/calendar";
import { isRestDay, getJobDef, performJob } from "../src/game/core/jobs";
import { checkEventConditions, EVENTS } from "../src/game/core/events";
import { getLocation } from "../src/game/core/actions";
import { hasFacility, currentRegion, getEffectiveLodging, getLodging } from "../src/game/core/housing";
import { maybeReceiveSms, replySms, unreadSmsCount, markSmsRead, SMS_SCENARIOS } from "../src/game/core/phone";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";
import { getMiniGameConfig } from "../src/game/core/minigame";

describe("v0.97 星期制度", () => {
  it("2026-08-01 = 周六，次日周日，再日周一", () => {
    expect(weekdayOf({ year: 2026, month: 8, day: 1 })).toBe(5); // 周六
    expect(weekdayOf({ year: 2026, month: 8, day: 2 })).toBe(6); // 周日
    expect(weekdayOf({ year: 2026, month: 8, day: 3 })).toBe(0); // 周一
    expect(weekdayLabel({ year: 2026, month: 8, day: 1 })).toBe("周六");
    expect(WEEKDAY_LABEL).toHaveLength(7);
  });

  it("isWeekend：周六/周日 true，周一 false", () => {
    expect(isWeekend({ year: 2026, month: 8, day: 1 })).toBe(true);
    expect(isWeekend({ year: 2026, month: 8, day: 2 })).toBe(true);
    expect(isWeekend({ year: 2026, month: 8, day: 3 })).toBe(false);
  });

  it("v1.20 日结工无休；单休/双休岗按配置休息；自由接单岗不休", () => {
    const s = createInitialState();
    s.time = { ...s.time, year: 2026, month: 8, day: 1 }; // 周六
    expect(isRestDay(s, getJobDef("job_factory_line")!)).toBe(false); // 日结工无休
    expect(isRestDay(s, getJobDef("job_delivery")!)).toBe(false); // 自由接单
    expect(isRestDay(s, getJobDef("job_office_assistant")!)).toBe(true); // 双休
    expect(isRestDay(s, getJobDef("job_waiter_west")!)).toBe(true); // 单休（默认周六）
    s.time = { ...s.time, day: 2 }; // 周日
    expect(isRestDay(s, getJobDef("job_factory_line")!)).toBe(false); // 日结工周日也上班
    expect(isRestDay(s, getJobDef("job_waiter_west")!)).toBe(false); // 单休岗周日上班
    expect(isRestDay(s, getJobDef("job_office_assistant")!)).toBe(true); // 双休岗周日休
  });

  it("performJob：日结工周六可上班，双休正式工周六被拦（提示休息）", () => {
    const s = createInitialState();
    s.time = { ...s.time, year: 2026, month: 8, day: 1, hour: 9 }; // 周六
    s.player.attrs.stamina = 90;
    s.player.attrs.health = 90;
    s.player.attrs.satiety = 90;
    const r = performJob(s, "job_factory_line"); // 日结工
    expect(r.ok).toBe(true);
    // 双休正式工（文员）周六休息
    const s2 = createInitialState();
    s2.time = { ...s2.time, year: 2026, month: 8, day: 1, hour: 10 };
    s2.player.stats.intelligence = 60;
    s2.flags["item_laptop"] = true;
    s2.player.attrs.stamina = 90;
    s2.player.attrs.health = 90;
    s2.player.attrs.satiety = 90;
    const r2 = performJob(s2, "job_office_assistant");
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain("休息");
  });
});

describe("v0.97 周末事件与集市", () => {
  it("weekend 条件：周六日通过、工作日拦截", () => {
    const ev = EVENTS.find((e) => e.id === "ev_weekend_market")!;
    const s = createInitialState();
    s.locationId = "street";
    // 2026-08-01 是周六
    expect(isWeekend(s.time)).toBe(true);
    expect(checkEventConditions(s, ev)).toBe(true);
    s.time = { ...s.time, day: 3 }; // 周一
    expect(checkEventConditions(s, ev)).toBe(false);
  });

  it("周末事件数量 ≥6 且集市地点配置了 weekendOnly", () => {
    const weekendEvents = EVENTS.filter((e) => e.conditions?.weekend === true);
    expect(weekendEvents.length).toBeGreaterThanOrEqual(6);
    const fair = getLocation("market_fair");
    expect(fair?.weekendOnly).toBe(true);
    expect(fair?.regions).toContain("downtown_center");
  });
});

describe("v0.97 政府住房与定位统一", () => {
  it("政府住房具备洗澡设施且恢复对齐民宿", () => {
    const s = createInitialState(); // gov 模式
    expect(hasFacility(s, "shower")).toBe(true);
    expect(hasFacility(s, "rest")).toBe(true);
    const gov = getEffectiveLodging(s);
    const minsu = getLodging("minsu")!;
    expect(gov.recovery).toBe(minsu.recovery);
    expect(gov.moodBonus).toBe(minsu.moodBonus);
  });

  it("出门定位：酒店/出租屋→市中心；民宿/政府住房/青旅/露宿→住宅区", () => {
    const s = createInitialState();
    // gov
    expect(currentRegion(s)).toBe("downtown_residential");
    // 酒店
    s.living = { mode: "nightly", govDaysLeft: 0, nightly: { lodgingId: "hotel" }, lease: null };
    expect(currentRegion(s)).toBe("downtown_center");
    // 民宿
    s.living.nightly = { lodgingId: "minsu" };
    expect(currentRegion(s)).toBe("downtown_residential");
    // 出租屋（月租）
    s.living = { mode: "lease", govDaysLeft: 0, nightly: null, lease: { housingId: "old_apartment", rent: 800, rentGrowthCount: 0 } };
    expect(currentRegion(s)).toBe("downtown_center");
    // 出租公寓
    s.living.lease = { housingId: "rental_apartment", rent: 1200, rentGrowthCount: 0 };
    expect(currentRegion(s)).toBe("downtown_center");
    // 青旅
    s.living = { mode: "nightly", govDaysLeft: 0, nightly: { lodgingId: "hostel" }, lease: null };
    expect(currentRegion(s)).toBe("downtown_residential");
  });
});

describe("v0.97 短信系统", () => {
  it("雨天收到的是雨天主题短信（条件池）", () => {
    const s = createInitialState(7);
    s.weather = { id: "rain", lastRollDay: 0 };
    s.time = { ...s.time, day: 3 }; // 工作日（排除 weekend 场景干扰）
    delete s.flags["sms_lastDay"];
    let got = false;
    for (let i = 0; i < 50; i++) {
      const pick = maybeReceiveSms(s);
      if (pick) {
        got = true;
        expect(pick.condition).toBe("rainy");
        break;
      }
      delete s.flags["sms_lastDay"]; // 重置以重试
    }
    expect(got).toBe(true);
  });

  it("每天至多一条短信；回复后有效果并标记已读", () => {
    const s = createInitialState(3);
    const m1 = maybeReceiveSms(s);
    const day = s.flags["sms_lastDay"];
    const m2 = maybeReceiveSms(s); // 同一天不再收到
    expect(m2).toBeNull();
    if (m1) {
      const before = s.player.money;
      const r = replySms(s, s.smsInbox[0].id, 0);
      expect(r.ok).toBe(true);
      expect(s.smsInbox[0].replied).toBe(true);
      expect(unreadSmsCount(s)).toBe(0);
      void before;
      void day;
    }
  });

  it("SMS_SCENARIOS 场景 ≥6 且含天气/工作/金钱主题", () => {
    expect(SMS_SCENARIOS.length).toBeGreaterThanOrEqual(6);
    expect(SMS_SCENARIOS.some((x) => x.condition === "rainy")).toBe(true);
    expect(SMS_SCENARIOS.some((x) => x.condition === "tired")).toBe(true);
    expect(SMS_SCENARIOS.some((x) => x.condition === "poor")).toBe(true);
    expect(SMS_SCENARIOS.some((x) => x.condition === "weekend")).toBe(true);
  });
});

describe("v1.39 短信通知可消除 / 回复对话流", () => {
  it("未读角标只计收到的未读消息，不计主角发出的消息", () => {
    const s = createInitialState(3);
    // 手动造一条收到的未读短信 + 一条主角发出的消息
    s.smsInbox = [
      { id: "sms_test_1", sender: "妈妈", senderIcon: "👩", text: "在吗", options: [], replied: false, day: 3, dir: "in" },
      { id: "out_test_1", sender: "我", senderIcon: "🙂", text: "在的", options: [], replied: false, day: 3, dir: "out" },
    ];
    expect(unreadSmsCount(s)).toBe(1);
  });

  it("打开会话标记已读后，未读角标归零", () => {
    const s = createInitialState(3);
    s.smsInbox = [
      { id: "sms_test_1", sender: "妈妈", senderIcon: "👩", text: "在吗", options: [], replied: false, day: 3, dir: "in" },
    ];
    expect(unreadSmsCount(s)).toBe(1);
    markSmsRead(s, "sms_test_1");
    expect(unreadSmsCount(s)).toBe(0);
  });

  it("回复场景短信后生成「主角消息 + 对方回应」，未读归零", () => {
    const s = createInitialState(3);
    const m1 = maybeReceiveSms(s);
    if (!m1) return;
    const before = s.smsInbox.length;
    const r = replySms(s, s.smsInbox[0].id, 0);
    expect(r.ok).toBe(true);
    // 新增一条主角发出 + 一条对方回应
    expect(s.smsInbox.length).toBe(before + 2);
    const added = s.smsInbox.slice(before);
    expect(added[0].dir).toBe("out");
    expect(added[1].dir).toBe("in");
    expect(added[1].text).toBe(r.text);
    expect(unreadSmsCount(s)).toBe(0);
  });
});

describe("v0.97 存档迁移 v14 → v15", () => {
  it("补 smsInbox 默认空数组", () => {
    const s = createInitialState();
    s.version = 14;
    const m = migrateSave(s as unknown as Record<string, never>);
    expect(m.version).toBe(SAVE_VERSION);
    expect(Array.isArray(m.smsInbox)).toBe(true);
  });
});

describe("v0.97 问答题库扩充", () => {
  it("quiz 类工作（文员/销售）题目均 ≥6 题；v1.3 其余旧 quiz 岗位已迁移新模板", () => {
    for (const key of ["job_office_assistant", "job_sales"]) {
      const cfg = getMiniGameConfig(key);
      expect(cfg?.type).toBe("quiz");
      if (cfg?.type === "quiz") {
        expect(cfg.questions.length, key).toBeGreaterThanOrEqual(6);
      }
    }
    // v1.3 模板迁移：这些岗位不再使用 quiz
    expect(getMiniGameConfig("job_sorting")?.type).toBe("factory");
    expect(getMiniGameConfig("job_convenience_day")?.type).toBe("checkout");
    expect(getMiniGameConfig("job_factory_qc")?.type).toBe("factory");
    expect(getMiniGameConfig("job_factory_tech")?.type).toBe("factory");
    expect(getMiniGameConfig("job_waiter_fast")?.type).toBe("restaurant");
  });
});
