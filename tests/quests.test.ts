import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { hireJob, processWorkCalendar } from "../src/game/core/career";
import { getJobDef, takeJobOffer } from "../src/game/core/jobs";
import { advanceHours } from "../src/game/core/time";
import { activeQuests, acceptJobQuest, completeJobQuest, isPunctual, latePenalty,
  latenessOfJob, questIdOf, refreshDailyQuests, upcomingQuest } from "../src/game/core/quests";
import { gameDay } from "../src/game/core/calendar";

const formal = getJobDef("job_factory_qc")!;
const day = getJobDef("job_delivery")!;
function ready() {
  const s = createInitialState(41);
  s.time.day = 3; // 周一，gameDay 2
  s.time.hour = 7;
  return s;
}
describe("v1.465 工作待办", () => {
  it("只有正式工有定时班次；日结无需预约，也不存在迟到罚款", () => {
    const s = ready();
    expect(isPunctual(formal)).toBe(true);
    expect(isPunctual(day)).toBe(false);
    acceptJobQuest(s, day);
    expect(s.quests).toHaveLength(0);
    s.time.hour = 23;
    expect(latenessOfJob(s, day)).toBe(0);
    expect(latePenalty(3)).toMatchObject({ fine: 0, absent: false });
  });
  it("录用后立即生成当天唯一任务，重复刷新与重复查询不产生副本", () => {
    const s = ready();
    hireJob(s, formal);
    refreshDailyQuests(s);
    const first = acceptJobQuest(s, formal);
    const second = acceptJobQuest(s, formal);
    expect(first.id).toBe(questIdOf(gameDay(s.time), formal.id));
    expect(first.id).toBe(second.id);
    expect(first.startHour).toBe(formal.startHour);
    expect(s.quests.filter(q => q.jobId === formal.id)).toHaveLength(1);
    const before = JSON.stringify(s.quests);
    expect(upcomingQuest(s)?.id).toBe(first.id);
    expect(activeQuests(s)[0].id).toBe(first.id);
    expect(JSON.stringify(s.quests)).toBe(before);
  });
  it("未录用不能用预约伪造工作入口；日结抢活立即创建小游戏班次", () => {
    const s = ready();
    const offered = acceptJobQuest(s, formal);
    expect(offered.jobId).toBe(formal.id);
    expect(s.quests).toHaveLength(0);
    s.locationId = "labor_market";
    s.laborMarket.generatedDay = gameDay(s.time);
    s.laborMarket.offers = [{ uid: "one", jobId: day.id, quota: 1 }];
    const before = s.player.money;
    const result = takeJobOffer(s, "one");
    expect(result.ok).toBe(true);
    expect(result.session?.kind).toBe("day");
    expect(result.mode).toBe("worked");
    expect(s.player.money).toBe(before);
    expect(s.quests).toHaveLength(0);
    expect(s.laborMarket.offers[0].quota).toBe(0);
  });
  it("本班完成显示完成，到了次日才清理；不会重复生成同日工作待办", () => {
    const s = ready();
    hireJob(s, formal);
    const currentDay = gameDay(s.time);
    completeJobQuest(s, formal, currentDay);
    s.flags["worked_" + formal.id + "_" + currentDay] = true;
    s.career.nextShiftDay = currentDay + 1;
    refreshDailyQuests(s);
    expect(s.quests.filter(q => q.jobId === formal.id)).toHaveLength(1);
    expect(s.quests[0].status).toBe("done");
    advanceHours(s, 24);
    expect(s.quests.some(q => q.id === questIdOf(currentDay, formal.id))).toBe(false);
    expect(s.quests.filter(q => q.type === "job")).toHaveLength(1);
  });
  it("休息日及首班前不生成缺勤；班末缺勤记录一次并无罚款", () => {
    const s = createInitialState(42); // 周六
    hireJob(s, formal);
    expect(s.career.firstShiftDay).toBe(2); // 下周一
    expect(s.quests.filter(q => q.type === "job")).toHaveLength(0);
    advanceHours(s, 2 * 24);
    expect(s.career.consecutiveAbsences).toBe(0);
    expect(s.quests.filter(q => q.jobId === formal.id)).toHaveLength(1);
    advanceHours(s, 11); // 十小时正式班次从 8:00 工作至 18:00。
    processWorkCalendar(s);
    expect(s.career.consecutiveAbsences).toBe(1);
    expect(s.quests.find(q => q.jobId === formal.id)?.status).toBe("missed");
    expect(s.quests.find(q => q.jobId === formal.id)?.fine).toBe(0);
    expect(s.player.money).toBe(500);
  });
});
