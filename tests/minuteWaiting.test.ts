import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { advanceHours, formatTime, naturalWakeHours, sleep } from "../src/game/core/time";
import { waitHere, waitOptions } from "../src/game/core/actions";
import { callFamily, FAMILY_MESSAGES, replyFamilyMessage } from "../src/game/core/phone";
import { applyForJob, getJobDef, performJob } from "../src/game/core/jobs";
import { formatDuration } from "../src/game/core/quests";
import { formatMoney, formatNumber, signed } from "../src/lib/format";

function officeMorning() {
  const state = createInitialState(20261020);
  state.time.day = 3;
  state.time.hour = 7;
  state.time.minute = 0;
  state.player.attrs.stamina = 100;
  state.player.attrs.health = 100;
  state.player.stats.intelligence = 100;
  state.player.skills.management = 10;
  state.flags.item_laptop = true;
  state.flags.item_training_cert = true;
  const job = getJobDef("job_office_assistant")!;
  expect(applyForJob(state, job).ok).toBe(true);
  state.locationId = job.locationId!;
  state.time.hour = 8;
  return { state, job };
}

describe("通话后按分钟候班", () => {
  it("08:00 电话加家人消息后为 08:48，短等待能精确到 09:00 并开始完整班次", () => {
    const { state, job } = officeMorning();
    expect(callFamily(state).ok).toBe(true);
    expect(replyFamilyMessage(state, FAMILY_MESSAGES.ordinary[0], 0).ok).toBe(true);
    expect(formatTime(state.time.hour, state.time.minute)).toBe("08:48");
    expect(waitHere(state, 1 / 60).result?.name).toBe("等待 1 分钟");
    expect(formatTime(state.time.hour, state.time.minute)).toBe("08:49");
    expect(waitHere(state, 5 / 60).ok).toBe(true);
    expect(formatTime(state.time.hour, state.time.minute)).toBe("08:54");
    const smart = waitOptions(state).find(option => option.label === "等到 09:00 上班");
    expect(smart?.hours).toBe(6 / 60);
    expect(waitHere(state, smart!.hours).ok).toBe(true);
    expect(formatTime(state.time.hour, state.time.minute)).toBe("09:00");
    const work = performJob(state, job.id);
    expect(work.ok, work.reason).toBe(true);
    expect(work.session?.workedMinutes).toBe(Math.round(job.duration * 60));
    expect(work.session?.startMinute).toBe(work.session?.endMinute! - work.session?.standardMinutes!);
  });

  it("08:48 也能直接等到上班，工作按钮本身仍支持提前到岗", () => {
    const { state, job } = officeMorning();
    state.time.minute = 48;
    const smart = waitOptions(state).find(option => option.label === "等到 09:00 上班");
    expect(smart?.hours).toBe(12 / 60);
    const work = performJob(state, job.id);
    expect(work.ok, work.reason).toBe(true);
    expect(formatTime(state.time.hour, state.time.minute)).toBe("09:00");
    expect(work.session?.workedMinutes).toBe(Math.round(job.duration * 60));
  });

  it("从 23:59 等待一分钟正常跨天；一小时拆成 60 次不会多扣饱腹", () => {
    const state = createInitialState(42);
    state.time.hour = 23; state.time.minute = 59;
    const day = state.time.day;
    expect(waitHere(state, 1 / 60).ok).toBe(true);
    expect(formatTime(state.time.hour, state.time.minute)).toBe("00:00");
    expect(state.time.day).toBe(day + 1);
    const split = createInitialState(42), whole = createInitialState(42);
    for (let i = 0; i < 60; i++) expect(waitHere(split, 1 / 60).ok).toBe(true);
    expect(waitHere(whole, 1).ok).toBe(true);
    expect(split.time).toEqual(whole.time);
    expect(split.player.attrs.satiety).toBe(whole.player.attrs.satiety);
  });

  it("按分钟推进，62 分钟等待不再先舍入到百分之一小时", () => {
    const state = createInitialState();
    const result = waitHere(state, 62 / 60);
    expect(result.result?.name).toBe("等待 1 小时 2 分钟");
    expect(result.result?.duration).toBe(62 / 60);
    expect(formatTime(state.time.hour, state.time.minute)).toBe("08:02");
    state.time.minute = 2.000000000000003;
    advanceHours(state, 1 / 60);
    expect(state.time.minute).toBe(3);
    expect(formatTime(8, 59.99999999999999)).toBe("09:00");
  });

  it.each([NaN, Infinity, -Infinity, 0, -1])("拒绝无效等待 %s，不改动时钟与属性", hours => {
    const state = createInitialState();
    const before = structuredClone(state);
    expect(waitHere(state, hours).ok).toBe(false);
    expect(state).toEqual(before);
  });
});

describe("玩家可见数字", () => {
  it("耗时以整分钟显示，数值最多两位小数，不带浮点残余或负零", () => {
    expect(formatDuration(10.333333333333334 / 60)).toBe("10 分钟");
    expect(formatDuration(10 + 1 / 3)).toBe("10 小时 20 分钟");
    expect(formatNumber(10 + 1 / 3)).toBe("10.33");
    expect(formatMoney(1234 + 1 / 3)).toBe("1,234.33");
    expect(signed(1 / 3)).toBe("+0.33");
    expect(signed(-1 / 3)).toBe("-0.33");
    expect(signed(-0.000000001)).toBe("0");
    expect(signed(0.000000001)).toBe("0");
    expect(formatMoney(500)).toBe("500");
  });

  it("非整点自然醒的日志使用小时和分钟", () => {
    const state = createInitialState();
    state.time.hour = 20; state.time.minute = 40;
    state.flags.item_laptop = true;
    sleep(state, naturalWakeHours(state));
    const log = state.log.findLast(entry => entry.icon === "🛏️");
    expect(log?.text).not.toMatch(/\d+\.\d{3,}/);
    expect(log?.text).toMatch(/睡了 \d+ 小时(?: \d+ 分钟)?，体力恢复/);
  });
});
