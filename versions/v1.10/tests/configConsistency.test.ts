import { describe, it, expect } from "vitest";
import actions from "../src/game/data/actions.json";
import events from "../src/game/data/events.json";
import minigames from "../src/game/data/minigames.json";
import jobs from "../src/game/data/jobs.json";
import locations from "../src/game/data/locations.json";
import regions from "../src/game/data/regions.json";
import npcs from "../src/game/data/npcs.json";
import items from "../src/game/data/items.json";

// 注意各数据文件的顶层形状并不一致：
//   actions/locations/regions/jobs → 纯数组；events → { version, events: [] }；minigames → { difficulty, games: {} }
const actionList = actions as Array<Record<string, unknown>>;
const eventList = (events as { events: Array<Record<string, any>> }).events;
const miniGames = (minigames as { games: Record<string, unknown> }).games;
const actionIds = actionList.map((a) => a.id as string);
const eventIds = eventList.map((e) => e.id as string);
const locationIds = new Set((locations as Array<{ id: string }>).map((l) => l.id));
const regionIds = new Set((regions as Array<{ id: string }>).map((r) => r.id));
const jobIds = new Set((jobs as Array<{ id: string }>).map((j) => j.id));

describe("v0.981 配置一致性", () => {
  it("行动 id 唯一", () => {
    expect(new Set(actionIds).size).toBe(actionIds.length);
  });

  it("事件 id 唯一且无死引用", () => {
    expect(new Set(eventIds).size).toBe(eventIds.length);
  });

  it("所有行动的 locationId 指向真实地点", () => {
    for (const a of actionList) {
      const loc = a.locationId as string | undefined;
      if (loc) expect(locationIds.has(loc), `行动 ${a.id} 的 locationId ${loc} 不存在`).toBe(true);
    }
  });

  it("新增宗教行动全部存在", () => {
    for (const id of [
      "church_confession",
      "church_worship",
      "temple_worship",
      "temple_vegetarian",
      "temple_lodging",
    ]) {
      expect(actionIds, `缺少宗教行动 ${id}`).toContain(id);
    }
  });

  it("弥撒配置：周六 15:00–18:00 限制（v1.05 聚餐已合并到弥撒结算）", () => {
    const mass = actionList.find((a) => a.id === "church_mass") as any;
    expect(mass?.requirements?.weekday ?? []).toContain("sat");
    expect(mass?.requirements?.hourRange).toEqual({ start: 15, end: 18 });
    // v1.05：ev_church_fellowship 已从随机事件池移除，改为弥撒结算时直接 applyEffects
  });

  it("小游戏 key 指向真实 job / 行动", () => {
    for (const key of Object.keys(miniGames)) {
      const valid = jobIds.has(key) || actionIds.includes(key);
      expect(valid, `小游戏 ${key} 无对应 job 或行动`).toBe(true);
    }
  });

  it("事件 conditions.region / locationIn 引用真实区域或地点", () => {
    for (const e of eventList) {
      const c = (e.conditions ?? {}) as { region?: string[]; locationIn?: string[] };
      for (const r of c.region ?? []) {
        expect(regionIds.has(r), `事件 ${e.id} 的 region ${r} 不存在`).toBe(true);
      }
      for (const l of c.locationIn ?? []) {
        expect(locationIds.has(l), `事件 ${e.id} 的 locationIn ${l} 不存在`).toBe(true);
      }
    }
  });

  // v1.05：ev_church_fellowship 已合并到弥撒结算，不再作为独立事件存在，此测试移除
});

describe("v0.99 配置一致性（社交系统）", () => {
  const npcList = npcs as Array<Record<string, any>>;
  const itemIds = new Set((items as { items: Array<{ id: string }> }).items.map((i) => i.id));
  const npcIds = new Set(npcList.map((n) => n.id));

  it("NPC id 唯一", () => {
    expect(npcIds.size).toBe(npcList.length);
  });

  it("NPC 偶遇地点引用真实地点", () => {
    for (const n of npcList) {
      if (n.meetLocation) {
        expect(locationIds.has(n.meetLocation), `NPC ${n.id} 的 meetLocation ${n.meetLocation} 不存在`).toBe(true);
      }
    }
  });

  it("NPC 喜欢/讨厌的礼物引用真实物品", () => {
    for (const n of npcList) {
      for (const it of n.likes ?? []) {
        expect(itemIds.has(it), `NPC ${n.id} 喜欢不存在的物品 ${it}`).toBe(true);
      }
      for (const it of n.dislikes ?? []) {
        expect(itemIds.has(it), `NPC ${n.id} 讨厌不存在的物品 ${it}`).toBe(true);
      }
    }
  });

  it("周结/月结岗位的满勤门槛可达（双休岗不再出现 6/26 天死门槛）", () => {
    const formal = jobs as Array<{ id: string; kind: string; restDays?: string[] }>;
    for (const j of formal) {
      if (j.kind !== "weekly" && j.kind !== "monthly") continue;
      const restCount = j.restDays?.length ?? 1;
      const workable = j.kind === "weekly" ? 7 - restCount : 30 - restCount * 4;
      expect(workable, `岗位 ${j.id} 的满勤门槛不可达（应出勤 ${workable} 天）`).toBeGreaterThanOrEqual(1);
    }
  });

  it("发薪日文案不再声称“周日发薪”（发薪日实为周五）", () => {
    const descs = (jobs as Array<{ desc?: string }>).map((j) => j.desc ?? "");
    for (const d of descs) expect(d).not.toContain("周日发薪");
  });
});
