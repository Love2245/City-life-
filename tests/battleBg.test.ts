import { describe, it, expect } from "vitest";
import { battleBgKeyFor, battleBgPeriod } from "../src/lib/battleBg";

describe("v1.37 对决背景映射", () => {
  it("场地 → 背景 key（Boss 优先）", () => {
    expect(battleBgKeyFor("park", false)).toBe("park");
    expect(battleBgKeyFor("lake_park", false)).toBe("park");
    expect(battleBgKeyFor("amusement_park", false)).toBe("arena");
    expect(battleBgKeyFor("market_fair", false)).toBe("arena");
    expect(battleBgKeyFor("street", false)).toBe("alley");
    expect(battleBgKeyFor("home", false)).toBe("alley");
    expect(battleBgKeyFor("street", true)).toBe("boss");
  });

  it("时间段 → 时段 key（20-6 夜 / 17-20 黄昏 / 6-17 白天）", () => {
    expect(battleBgPeriod(7)).toBe("day");
    expect(battleBgPeriod(12)).toBe("day");
    expect(battleBgPeriod(17)).toBe("dusk");
    expect(battleBgPeriod(19)).toBe("dusk");
    expect(battleBgPeriod(20)).toBe("night");
    expect(battleBgPeriod(23)).toBe("night");
    expect(battleBgPeriod(5)).toBe("night");
  });
});
