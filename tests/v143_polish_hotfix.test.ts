import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { buyInvestment, sellInvestment } from "../src/game/core/invest";
import { placeTakeout, TAKEOUT_MENU } from "../src/game/core/takeout";
import { rentVehicle, returnVehicle } from "../src/game/core/vehicle";
import { triggerCollapse } from "../src/game/engine";
import eventsData from "../src/game/data/events.json";

/**
 * v1.43.x 热修回归：
 *  1. 现金流全部计入周记（投资买卖 / 外卖下单 / 载具押金收退走 recordMoney）
 *  2. ev_national_day 补 once（与春节事件口径一致，防节假日当天反复刷钱）
 *  3. nightly 住青旅晕倒回家，导航区域与 housing.json 的 hostel.region 一致
 */

describe("热修 1：现金流全部计入周记（recordMoney）", () => {
  it("投资买入计支出、赎回计收入", () => {
    const s = createInitialState();
    s.player.money = 1000;
    const r = buyInvestment(s, "deposit", 400);
    expect(r.ok).toBe(true);
    expect(s.weekly.spent).toBe(400);
    const inv = s.economy.investments[0];
    const r2 = sellInvestment(s, inv.id);
    expect(r2.ok).toBe(true);
    expect(s.weekly.earned).toBe(400);
  });

  it("外卖下单计支出", () => {
    const s = createInitialState();
    s.player.money = 999;
    const item = TAKEOUT_MENU[0];
    const r = placeTakeout(s, item.id);
    expect(r.ok).toBe(true);
    expect(s.weekly.spent).toBe(item.price);
    expect(s.player.money).toBe(999 - item.price);
  });

  it("租车押金计支出、退租计收入，现金闭环不变", () => {
    const s = createInitialState();
    s.player.money = 2000;
    expect(rentVehicle(s, "e_bike").ok).toBe(true);
    expect(s.weekly.spent).toBe(600);
    expect(returnVehicle(s, "e_bike").ok).toBe(true);
    expect(s.weekly.earned).toBe(600);
    expect(s.player.money).toBe(2000); // 押金收支相抵
  });
});

describe("热修 2：国庆兼职事件改为一次性（防当天反复刷钱）", () => {
  it("ev_national_day 设了 once，与春节事件口径一致", () => {
    const ev = (eventsData as { events: Array<Record<string, unknown>> }).events.find(
      (e) => e.id === "ev_national_day",
    );
    expect(ev).toBeDefined();
    expect(ev!.once).toBe(true);
  });
});

describe("热修 3：nightly 住青旅晕倒回家，导航落 downtown_station", () => {
  it("collapseHomeRegion 与 housing.json 的 hostel.region 一致", () => {
    const s = createInitialState();
    s.living = {
      mode: "nightly",
      govDaysLeft: 0,
      nightly: { lodgingId: "hostel" },
      lease: null,
      awayNight: null,
    };
    s.player.money = 500;
    s.player.attrs.stamina = 0; // 体力归零触发晕倒
    triggerCollapse(s, "体力透支（测试）");
    expect(s.region).toBe("downtown_station");
    expect(s.navStack).toEqual(["map", "downtown", "downtown_station"]);
  });
});
