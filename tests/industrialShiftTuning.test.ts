import { describe, expect, it } from "vitest";
import { getJobDef } from "../src/game/core/jobs";

describe("重工业与物流中心班次工资", () => {
  it.each([
    ["job_factory_line", 155, -75],
    ["job_factory_qc", 160, -45],
    ["job_factory_tech", 170, -55],
    ["job_sorting", 155, -75],
    ["job_loading", 170, -70],
    ["job_warehouse", 160, -50],
  ])("%s 为 10 小时并统一显示对应工资", (id, wage, stamina) => {
    const job = getJobDef(id)!;
    expect(job.duration).toBe(10);
    expect(job.startHour).toBe(8);
    expect(job.endHour).toBe(18);
    expect(job.effects.money).toBe(wage);
    expect(job.effects.stamina).toBe(stamina);
    expect(job.desc).toContain("10 小时");
    expect(job.desc).toContain(`${wage} 元`);
  });

  it("全职外卖保留自己的班次和按单结算", () => {
    expect(getJobDef("job_delivery_fulltime")).toMatchObject({ duration: 8, startHour: 8, endHour: 16 });
  });
});
