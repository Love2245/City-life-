import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { purchaseAndRideIntercityTicket } from "../src/game/core/actions";
import { goToMap, enterRegion } from "../src/game/core/regions";
import { INTERCITY_BUS_FARE } from "../src/game/core/transit";

/**
 * v1.43 导航死档修复。
 *
 * 死档路径：玩家无载具，乘巴士到郊区 → 点右上角「回主地图」→
 * 旧 goToMap 把 region 清空为 undefined，ScenePanel 改用住处推断城市，
 * 被丢回市区；市区里郊区的二级区域按跨城判定需先购票，而郊区的快捷入口又需私人载具，
 * 两边都进不去 → 死档。
 *
 * 修复：goToMap 回到玩家「当前所在的城市」一级（郊区/市区），而非清空。
 */
describe("v1.43 导航死档修复：郊区返回郊区一级", () => {
  /** 把玩家放到市区巴士站，模拟「无载具靠公共交通跨城」 */
  function boardFromDowntown(s: ReturnType<typeof createInitialState>) {
    s.locationId = "bus_station";
    s.region = "downtown_station";
    s.area = "downtown_station";
    s.player.money = 500;
    s.time.hour = 11;
    s.time.minute = 0;
  }

  it("坐巴士到郊区后点回主地图，回到郊区一级而非市区", () => {
    const s = createInitialState();
    boardFromDowntown(s);
    const before = s.player.money;
    const ride = purchaseAndRideIntercityTicket(s, "bus");
    expect(ride.ok).toBe(true);
    expect(s.player.money).toBe(before - INTERCITY_BUS_FARE);
    // 落地郊区 L2（城市边缘）
    expect(s.region).toBe("suburban_edge");

    // 模拟点击「回主地图」
    goToMap(s);

    // 关键：回到郊区一级，不是市区、也不是清空（旧行为的死档根因）
    expect(s.region).toBe("suburb");
    expect(s.region).not.toBe("downtown");
    expect(s.navStack).toEqual(["map", "suburb"]);
    expect(s.locationId).toBe("map");
  });

  it("回到郊区一级后，郊区二级区域可正常进入（同城市不要求跨城购票，无死档）", () => {
    const s = createInitialState();
    boardFromDowntown(s);
    purchaseAndRideIntercityTicket(s, "bus");
    goToMap(s); // region = suburb
    // 郊区内部的二级区域应可自由进入，无需巴士票
    expect(enterRegion(s, "suburban_edge").ok).toBe(true);
    expect(s.region).toBe("suburban_edge");
    expect(enterRegion(s, "rural").ok).toBe(true);
  });

  it("在郊区内部区域点回主地图回到郊区一级", () => {
    const s = createInitialState();
    s.region = "suburban_edge"; // 已在郊区农村地带
    goToMap(s);
    expect(s.region).toBe("suburb");
  });

  it("在市区点回主地图仍停在市区（不影响原行为）", () => {
    const s = createInitialState();
    s.region = "downtown_center";
    goToMap(s);
    expect(s.region).toBe("downtown");
  });
});
