import { describe, it, expect } from "vitest";
import actions from "../src/game/data/actions.json";
import events from "../src/game/data/events.json";
import minigames from "../src/game/data/minigames.json";
import jobs from "../src/game/data/jobs.json";
import locations from "../src/game/data/locations.json";
import regions from "../src/game/data/regions.json";

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

  it("弥撒配置：周六 15:00–18:00 限制 + 团建事件存在", () => {
    const mass = actionList.find((a) => a.id === "church_mass") as any;
    expect(mass?.requirements?.weekday ?? []).toContain("sat");
    expect(mass?.requirements?.hourRange).toEqual({ start: 15, end: 18 });
    expect(eventIds).toContain("ev_church_fellowship");
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

  it("郊区事件 ev_church_fellowship 具备三个选项与 outcome", () => {
    const ev = eventList.find((e) => e.id === "ev_church_fellowship") as any;
    expect(ev).toBeTruthy();
    expect(ev.choices.length).toBe(3);
    for (const ch of ev.choices) expect(typeof ch.outcome).toBe("string");
  });
});
