import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  addAffinity,
  ensureRelationship,
  affinityToState,
  tickRelationshipDecay,
  getRelationship,
  relationLevel,
  DAILY_AFFINITY_CAP,
} from "../src/game/core/relationships";
import { callContact, smsContact } from "../src/game/core/contacts";
import { migrateSave } from "../src/game/core/migrate";
import { gameDay } from "../src/game/core/calendar";
import type { GameState } from "../src/game/types";

function fresh(): GameState {
  const s = createInitialState(1);
  s.player.attrs.health = 100;
  s.player.attrs.stamina = 100;
  s.player.stats.intelligence = 60;
  s.player.stats.charm = 60;
  return s;
}

describe("v0.99 好感度地基", () => {
  it("affinityToState 阈值（lover 需 confessed）", () => {
    expect(affinityToState(10)).toBe("stranger");
    expect(affinityToState(20)).toBe("acquaintance");
    expect(affinityToState(40)).toBe("friend");
    expect(affinityToState(65)).toBe("close_friend");
    expect(affinityToState(85)).toBe("close_friend"); // 未表白不算恋人
    expect(affinityToState(85, true)).toBe("lover");
    expect(affinityToState(100, true)).toBe("lover");
  });

  it("ensureRelationship 幂等 + 初始好感", () => {
    const s = fresh();
    ensureRelationship(s, "npc_x", { initialAffinity: 30 });
    const r = getRelationship(s, "npc_x");
    expect(r?.affinity).toBe(30);
    expect(r?.state).toBe("acquaintance");
    ensureRelationship(s, "npc_x", { initialAffinity: 99 }); // 幂等，不覆盖
    expect(getRelationship(s, "npc_x")?.affinity).toBe(30);
    expect(s.relationships).toHaveLength(1);
  });

  it("addAffinity 每日上限 " + DAILY_AFFINITY_CAP, () => {
    const s = fresh();
    ensureRelationship(s, "npc_x", { initialAffinity: 0 });
    expect(addAffinity(s, "npc_x", 10)).toContain("好感 +10");
    expect(getRelationship(s, "npc_x")?.affinity).toBe(10);
    addAffinity(s, "npc_x", 10); // 剩余上限 5 → 截断
    expect(getRelationship(s, "npc_x")?.affinity).toBe(15);
    const log3 = addAffinity(s, "npc_x", 10); // 已达上限
    expect(log3).toBe("");
    expect(getRelationship(s, "npc_x")?.affinity).toBe(15);
  });

  it("addAffinity 边际递减（≥65 ×0.6，≥85 ×0.4）", () => {
    const s = fresh();
    ensureRelationship(s, "npc_y", { initialAffinity: 70 });
    addAffinity(s, "npc_y", 10); // 70≥65 → ×0.6 = 6
    expect(getRelationship(s, "npc_y")?.affinity).toBe(76);
    const s2 = fresh();
    ensureRelationship(s2, "npc_z", { initialAffinity: 95 });
    addAffinity(s2, "npc_z", 20); // 95≥85 → ×0.4 = 8，且 clamp 100
    expect(getRelationship(s2, "npc_z")?.affinity).toBe(100);
  });

  it("tickRelationshipDecay：7 天内不衰减", () => {
    const s = fresh();
    ensureRelationship(s, "npc_a", { initialAffinity: 50 });
    const r = getRelationship(s, "npc_a")!;
    r.lastInteractDay = gameDay(s.time) - 3;
    tickRelationshipDecay(s);
    expect(getRelationship(s, "npc_a")?.affinity).toBe(50);
  });

  it("tickRelationshipDecay：10 天未互动 -1，20 天 -2", () => {
    const s = fresh();
    ensureRelationship(s, "npc_b", { initialAffinity: 50 });
    getRelationship(s, "npc_b")!.lastInteractDay = gameDay(s.time) - 10;
    tickRelationshipDecay(s);
    expect(getRelationship(s, "npc_b")?.affinity).toBe(49);

    const s2 = fresh();
    ensureRelationship(s2, "npc_c", { initialAffinity: 50 });
    getRelationship(s2, "npc_c")!.lastInteractDay = gameDay(s2.time) - 20;
    tickRelationshipDecay(s2);
    expect(getRelationship(s2, "npc_c")?.affinity).toBe(48);
  });

  it("tickRelationshipDecay：父母（noDecay）不衰减", () => {
    const s = fresh();
    ensureRelationship(s, "parent_mother", { initialAffinity: 60, noDecay: true });
    const r = getRelationship(s, "parent_mother")!;
    expect(r.flags?.noDecay).toBe(true);
    r.lastInteractDay = gameDay(s.time) - 30;
    tickRelationshipDecay(s);
    expect(getRelationship(s, "parent_mother")?.affinity).toBe(60);
  });

  it("callContact 加好感并建立 Relationship（每日限 1 次）", () => {
    const s = fresh();
    callContact(s, "parent_mother");
    const r = getRelationship(s, "parent_mother");
    expect(r).toBeDefined();
    expect(r?.flags?.noDecay).toBe(true);
    expect(r?.affinity).toBe(62); // 60 + 2
    const before = r?.affinity;
    callContact(s, "parent_mother"); // 同日再打，不再加
    expect(getRelationship(s, "parent_mother")?.affinity).toBe(before);
  });

  it("smsContact 加好感（每日限 2 次）", () => {
    const s = fresh();
    smsContact(s, "parent_mother"); // +1 → 61
    smsContact(s, "parent_mother"); // +1 → 62
    smsContact(s, "parent_mother"); // 第 3 次，封顶
    expect(getRelationship(s, "parent_mother")?.affinity).toBe(62);
  });

  it("relationLevel 回退 stranger", () => {
    const s = fresh();
    expect(relationLevel(s, "nobody")).toBe("stranger");
  });

  it("v18 → v19：反向补建父母 Relationship + romance 默认值", () => {
    const v18 = { ...createInitialState(), version: 18 } as unknown as GameState;
    delete (v18 as unknown as Record<string, unknown>).romance;
    const m = migrateSave(v18);
    expect(m.version).toBe(19);
    expect(m.romance).toEqual({ partnerId: undefined, dateCount: {}, cohabiting: false });
    const noDecayIds = m.relationships
      .filter((r) => r.flags?.noDecay)
      .map((r) => r.npcId)
      .sort();
    expect(noDecayIds).toEqual(["parent_father", "parent_mother"]);
    expect(getRelationship(m, "parent_mother")?.affinity).toBe(60);
  });
});
