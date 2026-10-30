import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  LAPTOP_APPS, LAPTOP_MARKET_APPS, installedLaptopApps, installLaptopApp,
  isLaptopAppInstalled, migrateLegacyLaptopApps,
} from "../src/game/core/apps";
import { canLive, liveToday, startLive } from "../src/game/core/live";
import { gameDay } from "../src/game/core/calendar";

describe("电脑软件与手机安装隔离", () => {
  it("电脑目录仅包含有窗口的应用，每个入口唯一；重复安装只打开", () => {
    const state = createInitialState(1465);
    expect(LAPTOP_APPS.map((app) => app.id)).toEqual([
      "settings", "store", "wechat", "moments", "dev", "forum", "shop", "takeout", "live", "invest",
    ]);
    expect(new Set(LAPTOP_APPS.map((app) => app.id)).size).toBe(LAPTOP_APPS.length);
    expect(LAPTOP_MARKET_APPS).toHaveLength(5);
    expect(installedLaptopApps(state).map((app) => app.id)).toEqual(["settings", "store", "wechat", "moments"]);
    state.flags.app_shop = true;
    expect(isLaptopAppInstalled(state, "shop")).toBe(false);
    expect(installLaptopApp(state, "shop").alreadyInstalled).toBe(false);
    expect(isLaptopAppInstalled(state, "shop")).toBe(true);
    expect(installLaptopApp(state, "shop")).toMatchObject({ ok: true, alreadyInstalled: true });
    expect(installedLaptopApps(state).filter((app) => app.id === "shop")).toHaveLength(1);
    expect(installLaptopApp(state, "app_delivery").ok).toBe(false);
    expect(state.flags.app_delivery).toBeFalsy();
  });

  it("旧档电脑已显示的软件一次迁移为已安装，手机记录保持独立", () => {
    const state = createInitialState(1466);
    state.flags.app_shop = true;
    migrateLegacyLaptopApps(state);
    expect(LAPTOP_MARKET_APPS.every((app) => isLaptopAppInstalled(state, app.id))).toBe(true);
    expect(state.flags.app_shop).toBe(true);
    expect(state.flags.app_live).toBeFalsy();
    delete state.flags.laptop_app_shop;
    migrateLegacyLaptopApps(state);
    expect(state.flags.laptop_app_shop).toBeFalsy();
  });
});

describe("直播暂停开放", () => {
  it("旧档的双端安装标记保留，桌面隐藏且拒绝开播和安装", () => {
    const state = createInitialState(1467);
    state.flags.item_laptop = true;
    state.flags.app_live = true;
    state.flags.laptop_app_live = true;
    state.live.totalFameGain = 20;
    const before = state.player.money;
    expect(canLive(state, "phone").ok).toBe(false);
    expect(canLive(state, "laptop").ok).toBe(false);
    expect(startLive(state, "laptop").ok).toBe(false);
    expect(installLaptopApp(state, "live").ok).toBe(false);
    expect(installedLaptopApps(state).some(app => app.id === "live")).toBe(false);
    expect(state.player.money).toBe(before);
    expect(state.live.totalFameGain).toBe(20);
    expect(state.flags.app_live).toBe(true);
    expect(state.flags.laptop_app_live).toBe(true);
    expect(liveToday(state)).toBe(false);
  });
});
