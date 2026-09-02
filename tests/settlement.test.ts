import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { sleepSettlement, advanceHours } from "../src/game/core/time";
import { triggerCollapse } from "../src/game/engine";
import { recordMoney } from "../src/game/core/weekly";

function ready() {
  const s = createInitialState(12345);
  s.time.day = 3;
  s.time.hour = 9;
  s.time.minute = 0;
  return s;
}
const rentLogs = (s: ReturnType<typeof ready>) =>
  s.log.filter((l) => l.text.includes("交房租") || l.text.includes("交了房租")).length;

describe("P1-3 晕倒结算去重（settledToday 哨兵）", () => {
  it("sleepSettlement 同日不重复扣月租", () => {
    const s = ready();
    s.living.mode = "lease";
    s.living.lease = { housingId: "rent_room", rent: 500, rentGrowthCount: 0 };
    s.time.day = 1;
    expect(rentLogs(s)).toBe(0);
    sleepSettlement(s);
    expect(rentLogs(s)).toBe(1); // 第一次扣月租
    sleepSettlement(s); // 同日第二次：月租被哨兵拦截
    expect(rentLogs(s)).toBe(1); // 不再重复扣
    expect(s.flags["settledToday"]).toBe(s.time.day);
  });

  it("triggerCollapse 后当晚再睡不重复发薪/月租/结局", () => {
    const s = ready();
    s.player.attrs.stamina = 1;
    triggerCollapse(s, "测试力竭");
    expect(s.flags["settledToday"]).toBe(s.time.day);
    const endingLogs = s.log.filter((l) => l.text.includes("触发结局")).length;
    const rentL = rentLogs(s);
    sleepSettlement(s); // 当晚再睡
    // 发薪/月租/结局类日志不再新增（生存日志仍可能新增，不影响这些计数）
    expect(s.log.filter((l) => l.text.includes("触发结局")).length).toBe(endingLogs);
    expect(rentLogs(s)).toBe(rentL);
  });

  it("跨天后 settledToday 重置，新一天可正常结算", () => {
    const s = ready();
    sleepSettlement(s);
    expect(s.flags["settledToday"]).toBe(3);
    advanceHours(s, 24); // 跨到 day 4
    expect(s.flags["settledToday"]).toBeUndefined();
    sleepSettlement(s);
    expect(s.flags["settledToday"]).toBe(4);
  });

  it("P1-11 周日晕倒后再睡：周报不被空数据覆盖", () => {
    const s = ready();
    s.time.day = 2; // 周日（2026-08-02，weekdayOf=6）
    recordMoney(s, 200);
    recordMoney(s, -50);
    s.player.attrs.stamina = 1;
    triggerCollapse(s, "测试力竭"); // 第一次结算：生成周报（含医药费支出）
    expect(s.weekly.pending).toBe(true);
    expect(s.weekly.report!.earned).toBe(200);
    const spentAfterFirst = s.weekly.report!.spent;
    expect(spentAfterFirst).toBeGreaterThanOrEqual(50); // 含 50 记账 + 医药费
    sleepSettlement(s); // 当晚再睡：周报不应被清空覆盖
    expect(s.weekly.report!.earned).toBe(200);
    expect(s.weekly.report!.spent).toBe(spentAfterFirst);
    expect(s.weekly.pending).toBe(true);
  });
});
