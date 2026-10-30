import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { travelToRegion } from "../src/game/core/actions";

describe("v1.43 私人交通跨城落点提示（L7）", () => {
  it("自驾跨城后停在目标城市边缘，并给出「还要再进城」的提示", () => {
    const s = createInitialState(9);
    s.flags["item_car"] = true;
    s.region = "downtown_center"; // 当前在市区
    s.locationId = "map";
    s.player.attrs.stamina = 100;

    const r = travelToRegion(s, "rural"); // 农村地带隶属郊区 → 跨城

    expect(r.ok).toBe(true);
    expect(s.region).toBe("suburban_edge"); // 统一落在郊区边缘（城市边缘）
    const hint = s.log.find((entry) => entry.text.includes("还得再往城里走一段"));
    expect(hint, "跨城落地缺少「已抵达 XX 边缘」的过渡提示").toBeDefined();
    expect(hint!.text).toContain("紫羊区");
  });

  it("没有私人载具时跨城仍被拒绝（提示去车站购票）", () => {
    const s = createInitialState(9);
    s.region = "downtown_center";
    s.locationId = "map";

    const r = travelToRegion(s, "rural");

    expect(r.ok).toBe(false);
    expect(r.reason).toContain("购票");
  });
});
