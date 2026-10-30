import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createInitialState } from "../src/game/core/state";
import {
  ACTION_VISUAL_KEYS,
  actionTextureUrl,
  sceneBackgroundUrl,
  visualKeyForAction,
  visualKeyForGroup,
  type ActionVisualKey,
} from "../src/lib/sceneVisuals";
import { currentSceneBackgroundUrl } from "../src/lib/housingVisuals";

type VisualAction = Parameters<typeof visualKeyForAction>[0];

function action(
  id: string,
  locationId = "home",
  handler?: VisualAction["handler"],
  group?: VisualAction["group"],
): VisualAction {
  return { id, locationId, handler, group };
}

describe("1.4 抽象 UI 视觉映射", () => {
  it("每个视觉分类都有可用的 WebP 素材，并且缺失分类回退到 general", () => {
    const textureRoot = resolve(process.cwd(), "src/assets/ui/v1.4/action-textures");
    for (const key of ACTION_VISUAL_KEYS) {
      const file = resolve(textureRoot, `${key}.webp`);
      expect(existsSync(file), `缺少 ${key}.webp`).toBe(true);
      expect(statSync(file).size, `${key}.webp 为空文件`).toBeGreaterThan(0);
      expect(actionTextureUrl(key), `${key} 没有解析到 URL`).toBeTruthy();
    }
    expect(actionTextureUrl("missing" as ActionVisualKey)).toBe(actionTextureUrl("general"));
  });

  it("代表性动作按语义映射，不按区域复制纹理", () => {
    expect(visualKeyForAction(action("sleep_home"))).toBe("rest");
    expect(visualKeyForAction(action("use_laptop_home"))).toBe("desk");
    expect(visualKeyForAction(action("eat_noodles_home"))).toBe("food");
    expect(visualKeyForAction(action("shower_home"))).toBe("wash");
    expect(visualKeyForAction(action("exercise_home_equip"))).toBe("exercise");
    expect(visualKeyForAction(action("cat_buy_cat_food_basic", "pet_store"))).toBe("market");
    expect(visualKeyForAction(action("cat_treat_injury", "pet_hospital"))).toBe("medical");
    expect(visualKeyForAction(action("station_intercity_bus", "bus_station"))).toBe("transit");
    expect(visualKeyForAction(action("suburb_station_intercity_train", "suburb_train_station"))).toBe("transit");
    expect(visualKeyForAction(action("school_tutor", "school"))).toBe("work");
    expect(visualKeyForAction(action("snack_street_skewer", "snack_street"))).toBe("food");
  });

  it("分组和固定设施使用稳定的共享分类", () => {
    expect(visualKeyForGroup("cook")).toBe("food");
    expect(visualKeyForGroup("read")).toBe("desk");
    expect(visualKeyForGroup("pet_food")).toBe("market");
    expect(visualKeyForGroup("hos_treat")).toBe("medical");
    expect(visualKeyForGroup("market_stall")).toBe("food");
    expect(visualKeyForGroup("market_shop")).toBe("market");
    expect(visualKeyForAction(action("station_intercity_bus", "bus_station"))).toBe(
      visualKeyForAction(action("station_intercity_bus", "suburb_bus_station")),
    );
  });

  it("地点 day/dusk/night 背景通过共享解析器保持可加载", () => {
    for (const theme of ["day", "dusk", "night"] as const) {
      expect(sceneBackgroundUrl("home", theme)).toBeTruthy();
      expect(sceneBackgroundUrl("downtown", theme)).toBeTruthy();
      expect(sceneBackgroundUrl("downtown_station", theme)).toBeTruthy();
      expect(sceneBackgroundUrl("flower_market", theme)).toBeTruthy();
      expect(sceneBackgroundUrl("suburb_bus_station", theme)).toBeTruthy();
      expect(sceneBackgroundUrl("npc_guest_room", theme)).toBe(sceneBackgroundUrl("minsu", theme));
    }
    expect(sceneBackgroundUrl("missing_location", "day")).toBeUndefined();
  });

  it("Boyue 两条美食街各自解析晴、阴、雨背景，不回退到其他街区", () => {
    const ids = ["boyue_food_street", "boyue_snack_street"] as const;
    for (const id of ids) {
      for (const [weather, period] of [
        ["cloudy", "cloudy-day"],
        ["rain", "rain-day"],
        ["rain", "rain-dusk"],
        ["rain", "rain-night"],
      ] as const) {
        const url = sceneBackgroundUrl(id, period === "cloudy-day" || period === "rain-day" ? "day" : period === "rain-dusk" ? "dusk" : "night", undefined, weather);
        expect(url, `${id}/${period} 没有专用背景`).toContain(`/v1.48/scenes/${id}_${period}.webp`);
        const file = resolve(process.cwd(), "src/assets/bg/v1.48/scenes", `${id}_${period}.webp`);
        expect(existsSync(file), `${id}/${period} 文件不存在`).toBe(true);
        expect(statSync(file).size, `${id}/${period} 文件为空`).toBeGreaterThan(128);
      }

      for (const theme of ["day", "dusk", "night"] as const) {
        expect(sceneBackgroundUrl(id, theme), `${id}/${theme} 缺少独立母图`).toContain(`/v1.48/scenes/${id}${theme === "day" ? ".webp" : `_${theme}.webp`}`);
      }
      // The requested cloudy-day treatment is dedicated; cloudy dusk/night keep their matching time-of-day masters.
      expect(sceneBackgroundUrl(id, "dusk", undefined, "cloudy")).toBe(sceneBackgroundUrl(id, "dusk"));
      expect(sceneBackgroundUrl(id, "night", undefined, "cloudy")).toBe(sceneBackgroundUrl(id, "night"));
    }
  });

  it("师范学院美食街解析独立母图、阴天与三个雨天时段", () => {
    const id = "dev_food_street";
    for (const [weather, period, theme] of [
      ["cloudy", "cloudy-day", "day"],
      ["rain", "rain-day", "day"],
      ["rain", "rain-dusk", "dusk"],
      ["rain", "rain-night", "night"],
    ] as const) {
      const url = sceneBackgroundUrl(id, theme, undefined, weather);
      expect(url, `${id}/${period} 没有专用背景`).toContain(`/v1.48/scenes/${id}_${period}.webp`);
      const file = resolve(process.cwd(), "src/assets/bg/v1.48/scenes", `${id}_${period}.webp`);
      expect(existsSync(file), `${id}/${period} 文件不存在`).toBe(true);
      expect(statSync(file).size, `${id}/${period} 文件为空`).toBeGreaterThan(128);
    }
    for (const [theme, suffix] of [["day", ""], ["dusk", "_dusk"], ["night", "_night"]] as const) {
      expect(sceneBackgroundUrl(id, theme)).toContain(`/v1.48/scenes/${id}${suffix}.webp`);
    }
    expect(sceneBackgroundUrl(id, "dusk", undefined, "rain")).toContain(`/v1.48/scenes/${id}_rain-dusk.webp`);
    expect(sceneBackgroundUrl(id, "night", undefined, "rain")).toContain(`/v1.48/scenes/${id}_rain-night.webp`);
  });

  it("新区域住宿入口解析专属房间且不影响市中心酒店", () => {
    const locations = [
      "hotel_boyue_quick",
      "hotel_boyu_nightmarket",
      "dev_incubator",
      "boyue_talent_apartment",
    ] as const;

    for (const id of locations) {
      for (const theme of ["day", "dusk", "night"] as const) {
        expect(sceneBackgroundUrl(id, theme), `${id}/${theme}`).toContain(`/v1.48/housing/${id}/${theme}.webp`);
      }
    }

    for (const theme of ["day", "dusk", "night"] as const) {
      expect(sceneBackgroundUrl("hotel", theme)).toContain(`/src/assets/bg/v1.4/hotel/${theme}.webp`);
    }
  });

  it("current venue background follows the live weather and time for both Boyue food streets", () => {
    const state = createInitialState();
    for (const id of ["boyue_food_street", "boyue_snack_street", "dev_food_street"] as const) {
      state.locationId = id;
      state.weather.id = "rain";
      state.time.hour = 18;
      expect(currentSceneBackgroundUrl(state, "day")).toContain(`/v1.48/scenes/${id}_rain-dusk.webp`);
      state.time.hour = 22;
      expect(currentSceneBackgroundUrl(state, "day")).toContain(`/v1.48/scenes/${id}_rain-night.webp`);
      state.weather.id = "cloudy";
      state.time.hour = 12;
      expect(currentSceneBackgroundUrl(state, "day")).toContain(`/v1.48/scenes/${id}_cloudy-day.webp`);
    }
  });
});
