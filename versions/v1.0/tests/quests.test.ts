import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  acceptJobQuest,
  refreshDailyQuests,
  activeQuests,
  upcomingQuest,
  isPunctual,
  latenessOfJob,
  latePenalty,
  questIdOf,
  QUEST_LATE_FINE_ABSENT,
} from "../src/game/core/quests";
import { getJobDef, performJob, refreshLaborMarket, takeJobOffer } from "../src/game/core/jobs";
import { checkAutoQuit } from "../src/game/core/career";
import { advanceHours } from "../src/game/core/time";
import type { JobDef } from "../src/game/types";

function def(id: string): JobDef {
  const d = getJobDef(id);
  if (!d) throw new Error(`岗位不存在：${id}`);
  return d;
}

/** 让角色有体力/健康干活；v0.97 统一切到周一（周六是休息日，避免上班被拦） */
function ready(seed = 1) {
  const s = createInitialState(seed);
  s.time = { ...s.time, day: 3 }; // 2026-08-03 周一
  s.player.attrs.health = 90;
  s.player.attrs.stamina = 90;
  s.player.money = 1000;
  return s;
}

describe("任务系统 - 数据配置", () => {
  it("自由接单岗 punctual=false，正式工 punctual=true", () => {
    expect(isPunctual(def("job_delivery"))).toBe(false);
    expect(isPunctual(def("job_express"))).toBe(false);
    expect(isPunctual(def("job_ride_hailing"))).toBe(false);
    expect(isPunctual(def("job_taxi"))).toBe(false);
    expect(isPunctual(def("job_cafe_staff"))).toBe(true);
    expect(isPunctual(def("job_warehouse"))).toBe(true);
  });

  it("需按时的岗位都配了 startHour", () => {
    const ids = [
      "job_convenience_day", "job_market_cleaner", "job_sales", "job_security",
      "job_factory_line", "job_sorting", "job_factory_qc", "job_loading",
      "job_factory_tech", "job_warehouse", "job_office_assistant",
      "job_cafe_staff", "job_driving_tutor", "job_waiter_west", "job_waiter_fast",
    ];
    for (const id of ids) {
      expect(def(id).startHour, id).toBeTypeOf("number");
    }
  });
});

describe("任务系统 - 生成与跨天", () => {
  it("acceptJobQuest 生成 pending 任务，字段正确", () => {
    const s = ready();
    s.time.day = 4; // 2026-08-04 → gameDay 3
    const q = acceptJobQuest(s, def("job_cafe_staff"));
    expect(q.status).toBe("pending");
    expect(q.type).toBe("job");
    expect(q.day).toBe(3);
    expect(q.jobId).toBe("job_cafe_staff");
    expect(q.startHour).toBe(9);
    expect(q.locationId).toBe("cafe");
    expect(q.id).toBe(questIdOf(3, "job_cafe_staff"));
    expect(s.quests).toHaveLength(1);
  });

  it("同日同岗重复 accept 幂等", () => {
    const s = ready();
    const a = acceptJobQuest(s, def("job_cafe_staff"));
    const b = acceptJobQuest(s, def("job_cafe_staff"));
    expect(s.quests).toHaveLength(1);
    expect(b.id).toBe(a.id);
  });

  it("自由接单岗不带 startHour", () => {
    const s = ready();
    const q = acceptJobQuest(s, def("job_delivery"));
    expect(q.startHour).toBeUndefined();
  });

  it("跨天把未完成任务归档清空，questsGeneratedDay 更新", () => {
    const s = ready(); // day=3（周一，gameDay 2）
    acceptJobQuest(s, def("job_cafe_staff"));
    expect(s.quests).toHaveLength(1);
    s.time.day = 4; // gameDay 3（跨天）
    refreshDailyQuests(s);
    expect(s.quests).toHaveLength(0);
    expect(s.questsGeneratedDay).toBe(3);
    expect(s.log.some((l) => l.text.includes("没完成"))).toBe(true);
  });

  it("在职正式工跨天自动生成今日上班任务", () => {
    const s = ready();
    s.career.jobId = "job_warehouse";
    s.career.kind = "monthly";
    s.career.lastWorkDay = 0; // 昨天（gameDay 0）上过班
    s.time.day = 2; // gameDay 1
    refreshDailyQuests(s);
    expect(s.quests).toHaveLength(1);
    expect(s.quests[0].jobId).toBe("job_warehouse");
    expect(s.quests[0].startHour).toBe(8);
  });

  it("当天已上过班不重复生成", () => {
    const s = ready();
    s.career.jobId = "job_warehouse";
    s.career.kind = "monthly";
    s.time.day = 2; // gameDay 1
    s.career.lastWorkDay = 1; // 今天已上过
    refreshDailyQuests(s);
    expect(s.quests).toHaveLength(0);
  });

  it("v0.975：周六（默认单休）不生成工作目标", () => {
    const s = ready();
    s.career.jobId = "job_warehouse"; // 默认 restDays=["sat"]
    s.career.kind = "monthly";
    s.career.lastWorkDay = -1; // 今天还没上过（哨兵）
    s.time.day = 1; // 2026-08-01 周六（gameDay 0）
    s.questsGeneratedDay = -1; // 与今天不同，触发刷新
    refreshDailyQuests(s);
    expect(s.quests).toHaveLength(0);
    expect(s.log.some((l) => l.text.includes("休息"))).toBe(true);
  });

  it("v0.975：周日（单休岗）仍生成工作目标", () => {
    const s = ready();
    s.career.jobId = "job_warehouse";
    s.career.kind = "monthly";
    s.career.lastWorkDay = 0;
    s.time.day = 2; // 2026-08-02 周日（gameDay 1）→ 单休岗不过周日的休息
    s.questsGeneratedDay = 0;
    refreshDailyQuests(s);
    expect(s.quests).toHaveLength(1);
    expect(s.quests[0].jobId).toBe("job_warehouse");
  });

  it("v0.975：双休岗（周六日）周日也不生成工作目标", () => {
    const s = ready();
    s.career.jobId = "job_office_assistant"; // restDays=["sat","sun"]
    s.career.kind = "monthly";
    s.career.lastWorkDay = 0;
    s.time.day = 2; // 周日
    s.questsGeneratedDay = 0;
    refreshDailyQuests(s);
    expect(s.quests).toHaveLength(0);
  });

  it("v0.975：自由接单岗（restDays=[]）周末照常生成", () => {
    const s = ready();
    s.career.jobId = "job_delivery"; // 外卖自由接单，restDays=[]
    s.career.kind = "weekly";
    s.career.lastWorkDay = -1;
    s.time.day = 1; // 周六
    s.questsGeneratedDay = -1;
    refreshDailyQuests(s);
    expect(s.quests).toHaveLength(1);
  });

  it("advanceHours 跨天自动触发刷新", () => {
    const s = ready(); // day=3（周一，gameDay 2）
    s.career.jobId = "job_warehouse";
    s.career.kind = "monthly";
    s.career.lastWorkDay = 0;
    s.time.hour = 20;
    advanceHours(s, 8); // 跨到次日 4 点
    expect(s.time.day).toBe(4); // gameDay 3
    expect(s.quests.some((q) => q.jobId === "job_warehouse")).toBe(true);
  });

  it("activeQuests 为纯读且完成项沉底", () => {
    const s = ready();
    acceptJobQuest(s, def("job_waiter_west")); // startHour 11
    acceptJobQuest(s, def("job_cafe_staff")); // startHour 9
    s.quests[1].status = "done";
    const before = JSON.stringify(s.quests);
    const list = activeQuests(s);
    expect(JSON.stringify(s.quests)).toBe(before); // 未改动原数组
    expect(list[0].jobId).toBe("job_waiter_west"); // 未完成在前
    expect(list[1].status).toBe("done");
  });

  it("upcomingQuest 取最早的待办定时任务", () => {
    const s = ready();
    acceptJobQuest(s, def("job_waiter_west")); // 11
    acceptJobQuest(s, def("job_cafe_staff")); // 9
    expect(upcomingQuest(s)?.jobId).toBe("job_cafe_staff");
  });
});

describe("任务系统 - 迟到判定", () => {
  it("准点/早到返回 0", () => {
    const s = ready();
    s.time.hour = 9;
    s.time.minute = 0;
    expect(latenessOfJob(s, def("job_cafe_staff"))).toBe(0);
    s.time.hour = 7;
    expect(latenessOfJob(s, def("job_cafe_staff"))).toBe(0);
  });

  it("夜班环形判定：startHour=20，凌晨 2 点迟到 6h，18 点算早到", () => {
    const s = ready();
    s.time.hour = 2;
    expect(latenessOfJob(s, def("job_security"))).toBe(6);
    s.time.hour = 18; // 提前 2 小时到
    expect(latenessOfJob(s, def("job_security"))).toBe(0);
    s.time.hour = 8; // 12h 夜班到 8 点已经收工，算整班旷了
    expect(latenessOfJob(s, def("job_security"))).toBe(12);
  });

  it("自由接单岗永不迟到", () => {
    const s = ready();
    s.time.hour = 23;
    expect(latenessOfJob(s, def("job_delivery"))).toBe(0);
  });

  it("latePenalty 四档边界", () => {
    expect(latePenalty(0)).toMatchObject({ ratio: 1, absent: false, fine: 0 });
    expect(latePenalty(0.5)).toMatchObject({ ratio: 0.8, moodPenalty: -3, absent: false });
    expect(latePenalty(1)).toMatchObject({ ratio: 0.8, absent: false });
    expect(latePenalty(1.5)).toMatchObject({ ratio: 0.5, moodPenalty: -6, absent: false });
    expect(latePenalty(2)).toMatchObject({ ratio: 0.5, absent: false });
    expect(latePenalty(2.1)).toMatchObject({ ratio: 0, absent: true, fine: QUEST_LATE_FINE_ABSENT });
  });
});

describe("任务系统 - performJob 迟到结算", () => {
  it("固定岗迟到 0.5h：可上班，工钱打 8 折", () => {
    const s = ready();
    s.flags["item_certificate"] = true;
    s.player.skills.service = 5;
    s.time.hour = 9;
    s.time.minute = 30;
    const money0 = s.player.money;
    const r = performJob(s, "job_cafe_staff");
    expect(r.ok).toBe(true);
    const base = def("job_cafe_staff").effects.money ?? 0;
    expect(s.player.money - money0).toBe(Math.round(base * 0.8));
  });

  it("固定岗准点：全额工钱", () => {
    const s = ready();
    s.flags["item_certificate"] = true;
    s.player.skills.service = 5;
    s.time.hour = 9;
    const money0 = s.player.money;
    const r = performJob(s, "job_cafe_staff");
    expect(r.ok).toBe(true);
    expect(s.player.money - money0).toBe(def("job_cafe_staff").effects.money ?? 0);
  });

  it("固定岗迟到 3h 且已接下任务：判旷工，扣 50 元且不上班", () => {
    const s = ready();
    s.flags["item_certificate"] = true;
    s.player.skills.service = 5;
    s.time.hour = 8;
    acceptJobQuest(s, def("job_cafe_staff")); // 先接下这份活
    s.time.hour = 12; // startHour 9 → 迟到 3h
    const money0 = s.player.money;
    const r = performJob(s, "job_cafe_staff");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("罚");
    expect(s.player.money).toBe(money0 - QUEST_LATE_FINE_ABSENT);
    expect(s.time.hour).toBe(12); // 没上班，时间不推进
  });

  it("固定岗迟到 3h 但没接过任务：拒绝且不罚款", () => {
    const s = ready();
    s.flags["item_certificate"] = true;
    s.player.skills.service = 5;
    s.time.hour = 12;
    const money0 = s.player.money;
    const r = performJob(s, "job_cafe_staff");
    expect(r.ok).toBe(false);
    expect(s.player.money).toBe(money0);
  });

  it("正式工迟到 1.5h：可上班，当场扣 50% 日薪，workedDays 仍 +1", () => {
    const s = ready();
    s.time.hour = 9;
    s.time.minute = 30; // job_warehouse startHour=8
    const money0 = s.player.money;
    const r = performJob(s, "job_warehouse");
    expect(r.ok).toBe(true);
    expect(s.career.workedDays).toBe(1);
    const daily = def("job_warehouse").effects.money ?? 0;
    expect(s.player.money).toBe(money0 - Math.round(daily * 0.5));
  });

  it("正式工旷工：不入职、lastWorkDay 不变、扣 50 元", () => {
    const s = ready();
    s.career.jobId = "job_warehouse";
    s.career.kind = "monthly";
    s.career.workedDays = 3;
    s.career.lastWorkDay = 0; // 昨天上过班
    s.time.day = 2; // gameDay 1
    refreshDailyQuests(s); // 在职正式工今日自动排班 → 有任务在身
    s.time.hour = 11; // startHour 8 → 迟到 3h
    const money0 = s.player.money;
    const r = performJob(s, "job_warehouse");
    expect(r.ok).toBe(false);
    expect(s.career.lastWorkDay).toBe(0);
    expect(s.career.workedDays).toBe(3);
    expect(s.player.money).toBe(money0 - QUEST_LATE_FINE_ABSENT);
  });

  it("连续 3 天不上班触发自动离职", () => {
    const s = ready();
    s.career.jobId = "job_warehouse";
    s.career.kind = "monthly";
    s.career.lastWorkDay = 0;
    s.time.day = 4; // gameDay 3 ≥ 3
    checkAutoQuit(s);
    expect(s.career.jobId).toBeNull();
  });

  it("自由接单岗深夜开工不受迟到影响", () => {
    const s = ready(2);
    s.time.hour = 22;
    refreshLaborMarket(s);
    s.laborMarket.offers = [{ uid: "free_0", jobId: "job_delivery", quota: 1 }];
    const money0 = s.player.money;
    const r = performJob(s, "free_0");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBeGreaterThan(money0);
  });

  it("没接过的定时日结岗迟到太久：拒绝但不罚款（未立约不违约）", () => {
    const s = ready(2);
    s.time.hour = 14; // job_market_cleaner startHour=6
    s.laborMarket.offers = [{ uid: "clean_0", jobId: "job_market_cleaner", quota: 1 }];
    const money0 = s.player.money;
    const r = performJob(s, "clean_0");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("人家不要你了");
    expect(s.player.money).toBe(money0); // 不罚钱
    expect(s.laborMarket.offers[0].quota).toBe(1); // 名额不减
  });

  it("takeJobOffer：未到点只排进任务栏，不立即开工", () => {
    const s = ready(2);
    s.time.hour = 7; // job_market_cleaner startHour=6 → 已过；换个 10 点的
    s.laborMarket.offers = [{ uid: "sales_0", jobId: "job_sales", quota: 1 }];
    const money0 = s.player.money;
    const r = takeJobOffer(s, "sales_0");
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("scheduled");
    expect(r.startHour).toBe(10);
    expect(s.player.money).toBe(money0); // 还没干活
    expect(s.time.hour).toBe(7); // 时间没推进
    expect(s.quests.some((q) => q.jobId === "job_sales")).toBe(true);
  });

  it("takeJobOffer：已到点直接开工", () => {
    const s = ready(2);
    s.time.hour = 10;
    s.laborMarket.offers = [{ uid: "sales_0", jobId: "job_sales", quota: 1 }];
    const money0 = s.player.money;
    const r = takeJobOffer(s, "sales_0");
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("worked");
    expect(s.player.money).toBeGreaterThan(money0);
  });

  it("接下后旷工才罚款", () => {
    const s = ready(2);
    s.time.hour = 7;
    s.laborMarket.offers = [{ uid: "sales_0", jobId: "job_sales", quota: 1 }];
    takeJobOffer(s, "sales_0");
    s.time.hour = 13; // startHour 10 → 迟到 3h
    const money0 = s.player.money;
    const r = performJob(s, "sales_0");
    expect(r.ok).toBe(false);
    expect(s.player.money).toBe(money0 - QUEST_LATE_FINE_ABSENT);
    expect(s.quests.find((q) => q.jobId === "job_sales")?.status).toBe("failed");
  });

  it("上班成功会把当日任务标记为 done", () => {
    const s = ready();
    s.flags["item_certificate"] = true;
    s.player.skills.service = 5;
    s.time.hour = 9;
    acceptJobQuest(s, def("job_cafe_staff"));
    performJob(s, "job_cafe_staff");
    expect(s.quests.find((q) => q.jobId === "job_cafe_staff")?.status).toBe("done");
  });

  it("旷工会把当日任务标记为 failed 并记录罚款", () => {
    const s = ready();
    s.flags["item_certificate"] = true;
    s.player.skills.service = 5;
    s.time.hour = 9;
    acceptJobQuest(s, def("job_cafe_staff"));
    s.time.hour = 13; // 迟到 4h
    performJob(s, "job_cafe_staff");
    const q = s.quests.find((x) => x.jobId === "job_cafe_staff");
    expect(q?.status).toBe("failed");
    expect(q?.fine).toBe(QUEST_LATE_FINE_ABSENT);
  });
});
