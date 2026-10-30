import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { inventoryGroupOf, inventoryList, ITEMS } from "../src/game/core/items";
import { JOB_DEFS, jobApplicationSuccessChance } from "../src/game/core/jobs";
import { membershipDaysLeft } from "../src/game/core/membership";
import { outfitOccasionFitForState } from "../src/game/core/playerOutfitResolver";
import type { GameState } from "../src/game/types";

describe("v1.462 背包归类与物品用途", () => {
  it("全部物品都有说明并可被稳定归类", () => {
    const groups = new Set(["consumables", "equipment", "credentials", "ingredients", "documents", "collectibles", "quest_items", "other"]);
    expect(ITEMS.length).toBeGreaterThanOrEqual(111);
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(ITEMS.length);
    for (const item of ITEMS) {
      expect(item.desc.trim(), `物品 ${item.id} 缺少详情`).not.toBe("");
      expect(groups.has(inventoryGroupOf(item)), `物品 ${item.id} 未归类`).toBe(true);
    }

    expect(inventoryGroupOf(ITEMS.find((item) => item.id === "bento")!)).toBe("consumables");
    expect(inventoryGroupOf(ITEMS.find((item) => item.id === "shirt")!)).toBe("equipment");
    expect(inventoryGroupOf(ITEMS.find((item) => item.id === "certificate")!)).toBe("credentials");
    expect(inventoryGroupOf(ITEMS.find((item) => item.id === "gym_card")!)).toBe("credentials");
    expect(inventoryGroupOf(ITEMS.find((item) => item.id === "tomato")!)).toBe("ingredients");
    expect(inventoryGroupOf(ITEMS.find((item) => item.id === "cat_orange")!)).toBe("other");
    expect(inventoryGroupOf(ITEMS.find((item) => item.id === "doc_guanyin")!)).toBe("documents");
    expect(ITEMS.filter((item) => inventoryGroupOf(item) === "other").length).toBeLessThanOrEqual(3);
  });

  it("名表和名牌包按持有数量之外的唯一物品参与既有场合评分", () => {
    const state = createInitialState(23);
    const baseInterview = outfitOccasionFitForState(state, "interview");
    const formalJob = JOB_DEFS.find((job) => job.kind === "formal");
    expect(formalJob).toBeDefined();
    const baseJobChance = jobApplicationSuccessChance(state, formalJob!);

    state.inventory.luxury_watch = 2;
    const withWatch = outfitOccasionFitForState(state, "interview");
    expect(withWatch.score).toBe(baseInterview.score + 1);
    expect(withWatch.bonus).toBe(baseInterview.bonus + 2);
    expect(jobApplicationSuccessChance(state, formalJob!)).toBe(baseJobChance);

    state.inventory.luxury_bag = 1;
    const withBoth = outfitOccasionFitForState(state, "interview");
    expect(withBoth.score).toBe(baseInterview.score + 2);
    expect(withBoth.bonus).toBe(Math.min(6, baseInterview.bonus + 4));

    const baseDate = outfitOccasionFitForState(createInitialState(23), "date");
    const dateState = createInitialState(23);
    dateState.inventory.luxury_watch = 1;
    expect(outfitOccasionFitForState(dateState, "date").score).toBe(baseDate.score + 1);

    const baseDaily = outfitOccasionFitForState(createInitialState(23), "daily");
    expect(outfitOccasionFitForState(state, "daily").score).toBe(baseDaily.score);
  });

  it("证照说明依据岗位现有 flag，月卡天数复用现有到期记录", () => {
    const drivingJobs = JOB_DEFS.filter((job) => job.requirements?.flag === "item_driving_license");
    const certificateJobs = JOB_DEFS.filter((job) => job.requirements?.flag === "item_certificate");
    expect(drivingJobs.map((job) => job.id)).toContain("job_driving_tutor");
    expect(certificateJobs.length).toBeGreaterThan(0);

    const state = createInitialState(29);
    state.memberships.gym = {
      day: state.time.day + 10,
      month: state.time.month,
      year: state.time.year,
    };
    expect(membershipDaysLeft(state, "gym")).toBe(10);
  });

  it("旧存档缺少新增分类字段或可选背包子对象时仍可读取", () => {
    const legacy = createInitialState(31);
    legacy.inventory.shirt = 1;
    expect(inventoryList(legacy).map((entry) => entry.item.id)).toContain("shirt");
    expect(inventoryGroupOf(inventoryList(legacy)[0].item)).toBe("equipment");

    delete (legacy as Partial<GameState>).inventory;
    expect(inventoryList(legacy)).toEqual([]);
    expect(outfitOccasionFitForState(legacy, "interview").score).toBeDefined();
  });
});
