import { describe, expect, it } from "vitest";
import { doorJingles, musicForScene, type MusicScene } from "../src/lib/musicRouting";

function scene(overrides: Partial<MusicScene> = {}): MusicScene {
  return { hour: 8, locationId: null, regionId: "city", inGame: true, sessionKey: 1, ...overrides };
}

describe("地图与设施配乐路由", () => {
  it.each([
    [0, "dawn"], [5, "dawn"], [6, "morning"], [11, "morning"],
    [12, "noon"], [17, "noon"], [18, "night"], [23, "night"],
  ] as const)("游戏时间 %s 点自动选 %s", (hour, expected) => {
    expect(musicForScene(scene({ hour }), "auto")).toBe(expected);
  });

  it.each([
    ["boyue_nightclub", "nightclub"],
    ["boyue_lounge_bar", "lounge"],
    ["cafe", "cafe"],
    ["boyue_cafe", "cafe"],
    ["boyue_texas_shop", "texas"],
    ["temple", "temple"],
    ["church", "church"],
  ] as const)("进入 %s 后使用专属 %s 配乐", (locationId, expected) => {
    expect(musicForScene(scene({ locationId }), "auto")).toBe(expected);
    expect(musicForScene(scene({ locationId }), "night")).toBe(expected);
  });

  it("普通设施、地图和等待开门时沿用地图配乐", () => {
    for (const locationId of [null, "convenience_store", "boyue_convenience_store", "library"]) {
      expect(musicForScene(scene({ locationId }), "auto")).toBe("morning");
      expect(musicForScene(scene({ locationId }), "night")).toBe("night");
    }
    expect(musicForScene(scene({ locationId: "church", admitted: false }), "auto")).toBe("morning");
  });

  it("菜单不沿用存档中设施的专属音乐", () => {
    expect(musicForScene(scene({ locationId: "temple", inGame: false }), "auto")).toBe("morning");
  });

  it("旧下午手动选择兼容为午间地图配乐", () => {
    expect(musicForScene(scene({ hour: 22 }), "afternoon")).toBe("noon");
  });
});

describe("便利店和咖啡厅进出门乐句", () => {
  it.each([
    ["convenience_store", "store-enter", "store-exit"],
    ["boyue_convenience_store", "store-enter", "store-exit"],
    ["cafe", "cafe-enter", "cafe-exit"],
    ["boyue_cafe", "cafe-enter", "cafe-exit"],
  ] as const)("%s 的进出门乐句各触发一次", (locationId, enter, exit) => {
    const outside = scene();
    const inside = scene({ locationId });
    expect(doorJingles(outside, inside)).toEqual([enter]);
    expect(doorJingles(inside, outside)).toEqual([exit]);
    expect(doorJingles(inside, scene({ locationId, hour: 12 }))).toEqual([]);
  });

  it("首次同步、菜单切换和读入其他游戏会话不触发乐句", () => {
    const inside = scene({ locationId: "cafe" });
    expect(doorJingles(null, inside)).toEqual([]);
    expect(doorJingles(scene({ inGame: false }), inside)).toEqual([]);
    expect(doorJingles(inside, scene({ inGame: false }))).toEqual([]);
    expect(doorJingles(scene(), scene({ locationId: "cafe", sessionKey: 2 }))).toEqual([]);
    expect(doorJingles(inside, scene({ sessionKey: 2 }))).toEqual([]);
  });

  it("等待开门不触发进门，真正入内才触发", () => {
    const waiting = scene({ locationId: "convenience_store", admitted: false });
    const admitted = scene({ locationId: "convenience_store", admitted: true });
    expect(doorJingles(scene(), waiting)).toEqual([]);
    expect(doorJingles(waiting, admitted)).toEqual(["store-enter"]);
    expect(doorJingles(waiting, scene())).toEqual([]);
  });

  it("同场景状态刷新不重复触发，跨区域的同名设施仍视为进出", () => {
    const inside = scene({ locationId: "cafe", regionId: "city" });
    expect(doorJingles(inside, { ...inside, admitted: true })).toEqual([]);
    expect(doorJingles(inside, scene({ locationId: "cafe", regionId: "boyue" }))).toEqual(["cafe-exit", "cafe-enter"]);
  });

  it("短乐句设施间直接转场按离开再进入排序", () => {
    expect(doorJingles(scene({ locationId: "cafe" }), scene({ locationId: "convenience_store" })))
      .toEqual(["cafe-exit", "store-enter"]);
  });

  it("其他设施和地图之间移动没有进出门乐句", () => {
    expect(doorJingles(scene({ locationId: "temple" }), scene({ locationId: "church" }))).toEqual([]);
    expect(doorJingles(scene(), scene({ locationId: "library" }))).toEqual([]);
  });
});
