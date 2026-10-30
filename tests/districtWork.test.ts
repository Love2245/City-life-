import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { applyForJob, performJob, completeWork, JOB_DEFS, pauseWork, resumeWork, settleJobEffects } from "../src/game/core/jobs";
import { getAction, canPerform, performAction } from "../src/game/core/actions";
import { getMiniGameConfig, getMiniGameConfigFor, type RestaurantCfg } from "../src/game/core/minigame";
import { gameDay } from "../src/game/core/calendar";
import { migrateSave } from "../src/game/core/migrate";
import { createCraftState, primaryCraft, advanceCraft, craftKind } from "../src/lib/restaurantCraft";
import { startNetbarSession } from "../src/game/core/projects";
import { startDistrictLeisure, settleDistrictLeisure, stepDistrictLeisure } from "../src/game/core/districtLeisure";

function ready(locationId: string, hour = 18) {
  const s = createInitialState(14826); Object.assign(s.time, { month: 9, day: 8, hour, minute: 0 });
  s.locationId = locationId; s.player.money = 10000;
  Object.assign(s.player.attrs, { health: 100, satiety: 100, stamina: 100, mood: 70 });
  s.flags.item_certificate = true;
  s.player.skills.service = 10;
  return s;
}
describe("新区工作、摊位和明确玩法分派", () => {
  it("酒保周一夜班跨午夜仍归开班日，按正式合同记账且不增加饮酒杯数", () => {
    const s = ready("boyue_nightclub"), job = JOB_DEFS.find(j => j.id === "job_boyue_bartender")!;
    expect(applyForJob(s, job).ok).toBe(true);
    const day = gameDay(s.time), started = performJob(s, job.id);
    expect(started.ok).toBe(true); expect(started.session).toMatchObject({ day, workedMinutes: 480, baseWage: settleJobEffects(s, job).money });
    const id = started.session!.id;
    pauseWork(s); expect(resumeWork(s)?.id).toBe(id);
    expect(completeWork(s, id, 1).ok).toBe(true);
    expect(s.time).toMatchObject({ day: 9, hour: 2, minute: 0 });
    expect(s.career.periodBaseWages).toBe(started.session!.baseWage); expect(s.career.periodGameBonus).toBe(Math.round(started.session!.baseWage * .05));
    expect(s.flags[`worked_${job.id}_${day}`]).toBe(true); expect(s.districtServices?.alcoholCups).toBe(0);
    const settled = JSON.stringify(s); expect(completeWork(s, id, 1).ok).toBe(false); expect(JSON.stringify(s)).toBe(settled);
  });
  it("分店到岗绑定真实地点，行业技能共享，大学网吧不再受首次开放日期限制", () => {
    const s = ready("cafe", 7), branch = JOB_DEFS.find(j => j.id === "job_boyue_cafe_staff")!;
    expect(applyForJob(s, branch).ok).toBe(true); expect(performJob(s, branch.id).ok).toBe(false);
    s.locationId = branch.locationId!; expect(performJob(s, branch.id).ok).toBe(true);
    expect(s.work?.active?.jobId).toBe(branch.id);
    expect(getMiniGameConfigFor(s, branch.id)?.type).toBe(getMiniGameConfig("job_cafe_staff")?.type);
    const closed = ready("boyue_internet_cafe"); closed.time.month = 8; closed.time.day = 30;
    expect(startNetbarSession(closed).ok).toBe(true);
    const netbar = JOB_DEFS.find(j => j.id === "job_boyue_netbar_admin")!;
    const working = ready('boyue_internet_cafe',9);working.time.month=8;working.time.day=31;
    expect(applyForJob(working, netbar).ok).toBe(true);
    const attempt=performJob(working, netbar.id);expect(attempt.ok,attempt.reason).toBe(true);
  });
  it("调酒按配料、加冰、摇匀与装饰推进，不通过标题猜测游戏类型", () => {
    const cfg = getMiniGameConfig("job_boyue_bartender") as RestaurantCfg;
    expect(craftKind(cfg)).toBe("cocktail");
    const craft = createCraftState(), recipe = ["gin", "ice", "lime"];
    primaryCraft(craft, "cocktail", recipe, 0); advanceCraft(craft, "cocktail", 1000);
    expect(craft.measured).toBe(true); expect(craft.phase).toBe("prep");
    primaryCraft(craft, "cocktail", recipe, 0); advanceCraft(craft, "cocktail", 1000);
    expect(craft.iceAdded).toBe(true); expect(craft.phase).toBe("cook");
    for (let i = 0; i < 3; i++) { primaryCraft(craft, "cocktail", recipe, 0); advanceCraft(craft, "cocktail", 1000); }
    expect(craft.phase).toBe("finish"); primaryCraft(craft, "cocktail", recipe, 0); advanceCraft(craft, "cocktail", 1000);
    expect(craft.phase).toBe("done");
    expect(getMiniGameConfig("street_perform")).toMatchObject({ type: "rhythm", activity: "singing" });
  });
  it("四处摊位共享料理包与进度，各处每天单独计次，新摊跨午夜不按旧街营业时段收摊", () => {
    const s = ready("snack_street", 20); s.player.skills.cooking = 2;
    s.inventory.vegetable = 4; s.inventory.meat = 4;
    const venues = [["snack_street", "stall_snack_street"], ["dev_food_street", "stall_dev_food_street"], ["boyue_food_street", "stall_boyue_food_street"], ["boyue_snack_street", "stall_boyue_snack_street"]];
    for (const [location, action] of venues) {
      s.locationId = location; s.time.hour = 20; s.time.minute = 0;
      const cash = s.player.money, progress = s.career.projects.snack_stall ?? 0;
      expect(performAction(s, action).ok, action).toBe(true);
      expect(s.player.money).toBe(cash); // 收入在餐饮小游戏收摊时按服务人数结算，不能提前再发项目端收入。
      expect(s.career.projects.snack_stall).toBeGreaterThan(progress);
      expect(canPerform(s, getAction(action)!).ok).toBe(false);
    }
    expect(s.inventory.vegetable ?? 0).toBe(0); expect(s.inventory.meat ?? 0).toBe(0);
    const old = getMiniGameConfigFor(s, "stall_snack_street") as RestaurantCfg;
    expect(old.stallCloseMinute).toBe(gameDay(s.time) * 1440 + 1440);
    for (const [, action] of venues.slice(1)) expect((getMiniGameConfigFor(s, action) as RestaurantCfg).stallCloseMinute).toBeUndefined();
    for (const [, action] of venues) expect(getMiniGameConfig(action)).toMatchObject({ stallPerCustomerPay: 13.5, stallHourPerCustomer: .5 });
  });
  it("通胀后的街机显示费率与实扣相同，刷新不重付", () => {
    const s = ready("boyue_arcade"); s.region = "boyue_night_market"; s.economy.priceIndex = 1.6;
    expect(startDistrictLeisure(s, "claw").ok).toBe(true); const id = s.districtLeisure!.active!.id;
    expect(s.districtLeisure!.active!.paid).toBe(8); expect(s.player.money).toBe(9992);
    const restored = migrateSave(s); expect(restored.districtLeisure!.active!.id).toBe(id); expect(restored.player.money).toBe(9992);
    stepDistrictLeisure(restored, id, { type: "grab" }); expect(settleDistrictLeisure(restored, id).ok).toBe(true);
    expect(restored.player.money).toBe(9992);
  });
});
