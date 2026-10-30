import { describe, expect, it } from "vitest";
import locationsData from "../src/game/data/locations.json";
import { allNpcs, getNpcDef, npcAtLocation, npcPresenceAt } from "../src/game/core/npcs";
import { actionsAtLocation } from "../src/game/core/actions";

const time = (weekday: number, hour: number, minute = 0) => ({ weekday, hour, minute });

function contains(hour: number, minute: number, range: [number, number]): boolean {
  const now = hour + minute / 60;
  const [start, end] = range;
  if (start === end) return true;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

describe("v1.44 NPC 每周作息", () => {
  it("12 名 NPC 都配置了合法地点，复用地点明确选定区域且同一时刻只有一处排班", () => {
    const locations = locationsData as Array<{ id: string; regions?: string[]; openHours?: { start: number; end: number } | null }>;
    const locationIds = new Set(locations.map((location) => location.id));
    const locationHours = new Map(
      locations.map((location) => [
        location.id,
        location.openHours ? [location.openHours.start, location.openHours.end] as [number, number] : [0, 24] as [number, number],
      ] as const),
    );
    expect(allNpcs()).toHaveLength(12);

    for (const npc of allNpcs()) {
      expect(npc.weeklySchedule?.length, `${npc.id} 缺少 weeklySchedule`).toBeGreaterThan(0);
      for (const entry of npc.weeklySchedule ?? []) {
        expect(entry.weekdays.length, `${npc.id} 存在空星期段`).toBeGreaterThan(0);
        expect(locationIds.has(entry.locationId), `${npc.id} 的作息地点 ${entry.locationId} 不存在`).toBe(true);
        const regions = locations.find((location) => location.id === entry.locationId)?.regions ?? [];
        if (regions.length > 1) {
          expect(entry.regionId, `${npc.id} 的复用地点 ${entry.locationId} 必须明确指定区域`).toBeDefined();
        }
        if (entry.regionId) {
          expect(
            regions,
            `${npc.id} 的作息地点 ${entry.locationId} 未配置区域归属`,
          ).toContain(entry.regionId);
        }
        if (entry.hourRange) {
          expect(entry.hourRange[0]).toBeGreaterThanOrEqual(0);
          expect(entry.hourRange[1]).toBeLessThanOrEqual(24);
        }
      }

      for (let weekday = 0; weekday < 7; weekday += 1) {
        for (let hour = 0; hour < 24; hour += 1) {
          for (const minute of [0, 30]) {
            const active = (npc.weeklySchedule ?? []).filter((entry) => {
              const range = entry.allDay
                ? locationHours.get(entry.locationId) ?? [0, 24]
                : entry.hourRange ?? [0, 24];
              const effectiveDay = entry.overnight && range[0] > range[1] && hour + minute / 60 < range[1] ? (weekday + 6) % 7 : weekday;
              return entry.weekdays.includes(effectiveDay) && contains(hour, minute, range);
            });
            expect(new Set(active.map((e)=>e.randomGroup ?? e)).size, `${npc.id} 在周${weekday + 1} ${hour}:${minute} 存在重叠作息`).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("关键作息按星期和时段切换地点", () => {
    expect(npcAtLocation("npc_lin_xiaoyu", "library", time(6, 13))).toBe(true);
    expect(npcPresenceAt("npc_lin_xiaoyu", time(6, 10))).toBeNull();

    expect(npcAtLocation("npc_chen_jie", "market", time(6, 10))).toBe(true);
    expect(npcAtLocation("npc_chen_jie", "fast_food", time(0, 10))).toBe(true);
    expect(npcAtLocation("npc_wang_lei", "park", time(4, 7))).toBe(true);
    expect(npcAtLocation("npc_wang_lei", "hospital", time(4, 15))).toBe(true);

    expect(npcAtLocation("npc_netbar_boss", "electronics_store", time(6, 14))).toBe(true);
    expect(npcAtLocation("npc_netbar_boss", "electronics_store", time(6, 15))).toBe(true);
    expect(npcPresenceAt("npc_netbar_boss", time(6, 18))).toBeNull();

    expect(npcAtLocation("npc_suburb_farmer", "pasture", time(5, 10))).toBe(true);
    expect(npcAtLocation("npc_suburb_farmer", "camping_base", time(6, 10))).toBe(true);

    expect(npcAtLocation("npc_fan_kejie", "boyue_lounge_bar", time(0, 20))).toBe(true);
    expect(npcAtLocation("npc_fan_kejie", "boyue_arcade", time(1, 16))).toBe(true);
    expect(npcAtLocation("npc_fan_kejie", "dev_food_street", time(2, 18))).toBe(true);
    expect(npcAtLocation("npc_fan_kejie", "boyue_nightclub", time(4, 22))).toBe(true);
    expect(npcAtLocation("npc_jack_fanma", "boyue_engineering_college", time(0, 10))).toBe(true);
    expect(npcAtLocation("npc_jack_fanma", "boyue_gym", time(0, 16))).toBe(true);
    expect(npcAtLocation("npc_jack_fanma", "boyue_basketball_court", time(1, 17))).toBe(true);
    expect(npcAtLocation("npc_jack_fanma", "boyue_lounge_bar", time(4, 20))).toBe(true);
    expect(npcAtLocation("npc_fan_kexi", "dev_university", time(0, 10))).toBe(true);
    expect(npcAtLocation("npc_fan_kexi", "dev_food_street", time(2, 17))).toBe(true);
    expect(npcAtLocation("npc_fan_kexi", "western_restaurant", time(5, 12))).toBe(true);
    expect(npcAtLocation("npc_fan_kexi", "boyue_western_restaurant", time(6, 12))).toBe(true);
  });

  it("共享地点 ID 按具体区域区分 NPC 的唯一实际位置", () => {
    const saturday = { ...time(0, 14), regionId: "downtown_center" };
    const residential = { ...time(0, 14), regionId: "downtown_residential" };

    expect(npcAtLocation("npc_netbar_boss", "internet_cafe", saturday)).toBe(false);
    expect(npcAtLocation("npc_netbar_boss", "internet_cafe", residential)).toBe(true);
    expect(npcPresenceAt("npc_netbar_boss", residential)?.regionId).toBe("downtown_residential");
    expect(npcAtLocation("npc_lin_xiaoyu", "cafe", { ...time(0, 8), regionId: "downtown_center" })).toBe(false);
    expect(npcAtLocation("npc_lin_xiaoyu", "cafe", { ...time(0, 8), regionId: "downtown_residential" })).toBe(true);
    expect(npcPresenceAt("npc_lin_xiaoyu", { ...time(0, 8), regionId: "downtown_residential" })?.regionId).toBe("downtown_residential");
    expect(npcAtLocation("npc_wang_lei", "park", { ...time(5, 7), regionId: "downtown_center" })).toBe(true);
    expect(npcAtLocation("npc_wang_lei", "park", { ...time(5, 7), regionId: "downtown_residential" })).toBe(false);

    expect(npcAtLocation("npc_netbar_boss", "electronics_store", { ...time(6, 16), regionId: "downtown_mall" })).toBe(true);
    expect(npcAtLocation("npc_netbar_boss", "electronics_store", { ...time(6, 16), regionId: "downtown_residential" })).toBe(false);
  });

  it("旧版固定 meetLocation 在多区域地点使用稳定的首个区域", () => {
    const legacyNpc = { id: "legacy_npc", name: "旧版 NPC", meetLocation: "cafe" };
    expect(npcPresenceAt(legacyNpc, time(0, 10))?.regionId).toBe("downtown_commercial");
  });

  it("已删除 NPC 不再出现在人物注册表", () => {
    expect(getNpcDef("npc_pharmacist")).toBeUndefined();
    expect(getNpcDef("npc_suburb_station_staff")).toBeUndefined();
    expect(getNpcDef("npc_li_na")).toBeUndefined();
    expect(getNpcDef("npc_oldtown_station_clerk")).toBeUndefined();
    expect(getNpcDef("npc_school_coordinator")).toBeUndefined();
  });

  it("全天班次跟随场所营业时间，泛化搭话行动不再出现在场景", () => {
    expect(npcPresenceAt(getNpcDef("npc_librarian")!, time(0, 6))).toBeNull();
    expect(npcAtLocation("npc_librarian", "library", time(0, 7))).toBe(true);
    expect(npcPresenceAt(getNpcDef("npc_flower_market_owner")!, time(0, 7))).toBeNull();
    expect(npcAtLocation("npc_flower_market_owner", "flower_market", time(0, 8))).toBe(true);
    expect(actionsAtLocation("cafe").some((action) => action.handler === "meet_someone")).toBe(false);
  });
});
