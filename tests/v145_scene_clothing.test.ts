import { describe, expect, it } from "vitest";
import { applyEventChoice } from "../src/game/core/events";
import {
  onEnterClothingLocation,
  recordClothingWorkMilestone,
} from "../src/game/core/clothing";
import { createInitialState } from "../src/game/core/state";
import { npcGreetingNode } from "../src/game/data/npcGreetings";

describe("v1.45 场景服装与碰面文案", () => {
  it("进入电子厂只领取一次厂服，不强制覆盖当前穿搭", () => {
    const state = createInitialState(11);
    state.equipped.clothes = "cyan_jacket";

    onEnterClothingLocation(state, "electronics_factory");
    onEnterClothingLocation(state, "electronics_factory");

    expect(state.inventory.factory_uniform).toBe(1);
    expect(state.equipped.clothes).toBe("cyan_jacket");
  });

  it("农村工作超过三次后排队赠送农务工装，事件结算入包且不重复赠送", () => {
    const state = createInitialState(12);
    for (let index = 0; index < 4; index += 1) recordClothingWorkMilestone(state, "farm");

    expect(state.flags.rural_work_count).toBe(4);
    expect(state.flags.rural_workwear_event_ready).toBe(true);
    expect(state.pendingEvents).toContain("ev_rural_workwear_gift");

    const result = applyEventChoice(state, "ev_rural_workwear_gift", 0);
    expect(result.ok).toBe(true);
    expect(state.inventory.farm_workwear).toBe(1);
    expect(state.flags.rural_workwear_event_ready).toBeUndefined();

    recordClothingWorkMilestone(state, "farm");
    expect(state.pendingEvents?.filter((id) => id === "ev_rural_workwear_gift")).toHaveLength(1);
  });

  it("服务和物流工作达到熟练次数后也能获得对应工作服", () => {
    const state = createInitialState(13);
    for (let index = 0; index < 3; index += 1) recordClothingWorkMilestone(state, "cafe");
    for (let index = 0; index < 3; index += 1) recordClothingWorkMilestone(state, "logistics_center");

    expect(state.flags.service_apron_event_ready).toBe(true);
    expect(state.flags.delivery_vest_event_ready).toBe(true);
    expect(state.pendingEvents).toEqual([
      "ev_service_apron_gift",
      "ev_delivery_vest_gift",
    ]);
  });

  it("赵刚在小吃街是下工闲逛，王磊在医院是取药，碰面文案不误导身份", () => {
    const zhao = npcGreetingNode("npc_zhao_gang", "snack_street", 18, 1);
    const wang = npcGreetingNode("npc_wang_lei", "hospital", 15, 1);

    expect(zhao?.text).toMatch(/闲逛|下了工/);
    expect(zhao?.text).not.toMatch(/摊主|锅盖|炉子/);
    expect(wang?.text).toMatch(/取药|药袋/);
    expect(wang?.text).not.toMatch(/诊室|医生|复查/);
  });
});
