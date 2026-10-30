import { housingAtLocation } from "../src/game/core/residence";
import { developmentHousingBackgroundUrl, sceneBackgroundUrl } from "../src/lib/sceneVisuals";
import { currentSceneBackgroundUrl } from "../src/lib/housingVisuals";
import { createInitialState } from "../src/game/core/state";
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packRoot = resolve(projectRoot, "src/assets/bg/v1.4");
const locations = JSON.parse(
  readFileSync(resolve(projectRoot, "src/game/data/locations.json"), "utf8"),
) as Array<{ id: string }>;

const sceneIds = [
  "main",
  "downtown",
  "suburb",
  ...locations.filter((location) => location.id !== "map").map((location) => location.id),
  "downtown_center",
  "downtown_industrial",
  "downtown_mall",
  "downtown_residential",
  "downtown_station",
  "suburban_edge",
  "rural",
  "heavy_industry",
];

const sceneAliases: Record<string, string> = {
  // 新增的商场外平价店复用同构临街服装店背景，避免旧素材包出现空白。
  budget_clothing_store: "clothing_store",
};

const districtSyncedWindowedScenes = [
  "dev_art_gallery",
  "dev_incubator",
  "dev_museum",
  "dev_science_museum",
  "boyue_sports_store",
  "boyue_swimming_pool",
];

describe("场景背景素材包", () => {
  it("旧场景保留三时段原图，新增场景的独立或复用背景登记且实际存在", () => {
    for (const id of [...new Set(sceneIds)]) {
      for (const theme of ["day", "dusk", "night"]) {
        if (id.startsWith("commercial_") || id.startsWith('company_office_') || id.startsWith('campus_') || ["municipal_hall", "moon_monument"].includes(id)) {
          const state = createInitialState();
          state.locationId = id;
          state.region = id.startsWith('campus_teacher')?'campus_teacher':id.startsWith('campus_engineering')?'campus_engineering':"downtown_commercial";
          state.time.hour = theme === "day" ? 12 : theme === "dusk" ? 18 : 21;
          const url = currentSceneBackgroundUrl(state, theme as "day" | "dusk" | "night");
          expect(url, `${id}/${theme} 没有登记实际背景`).toBeTruthy();
          const assetPath = new URL(url!, "http://localhost").pathname;
          expect(assetPath).toMatch(/^\/src\/assets\/bg\//);
          const file = resolve(projectRoot, `.${decodeURI(assetPath)}`);
          expect(existsSync(file), `${id}/${theme} 背景不存在`).toBe(true);
          expect(statSync(file).size).toBeGreaterThan(0);
          continue;
        }
        if (id.startsWith("boyue_")) {
          const url = sceneBackgroundUrl(id, theme as "day" | "dusk" | "night");
          expect(url, `${id}/${theme} 没有实际背景`).toBeTruthy();
          const assetPath = new URL(url!, "http://localhost").pathname;
          expect(assetPath, `${id}/${theme} 背景应来自本地素材包`).toMatch(/^\/src\/assets\/bg\//);
          const file = resolve(projectRoot, `.${decodeURI(assetPath)}`);
          expect(existsSync(file), `${id}/${theme} 引用了不存在的文件 ${assetPath}`).toBe(true);
          expect(statSync(file).size, `${id}/${theme} 背景为空`).toBeGreaterThan(0);
          continue;
        }
        const development = resolve(projectRoot, "src/assets/bg/v1.48/scenes", `${id}.webp`);
        if (existsSync(development)) {
          // 新区时段变体按 *_dusk / *_night 独立登记；基础图保留为日景或固定室内光源。
          expect(statSync(development).size, `${id} 的开发区背景为空`).toBeGreaterThan(0);
          expect(sceneBackgroundUrl(id, theme as "day" | "dusk" | "night"), `${id} 未登记到实际背景解析器`).toBeTruthy();
          continue;
        }
        const housing = housingAtLocation(id);
        const legacy = resolve(packRoot, sceneAliases[id] ?? id, `${theme}.webp`);
        const currentHousing = housing && resolve(projectRoot, "src/assets/bg/v1.48/housing", housing.visualId ?? housing.id, `${theme}.webp`);
        const olderHousing = housing && resolve(projectRoot, "src/assets/bg/v1.46/housing", housing.visualId ?? housing.id, `${theme}.webp`);
        const file = currentHousing && existsSync(currentHousing)
          ? currentHousing
          : existsSync(legacy) || !housing
            ? legacy
            : olderHousing!;
        expect(existsSync(file), `缺少 ${id}/${theme}.webp`).toBe(true);
        expect(statSync(file).size, `${id}/${theme}.webp 为空文件`).toBeGreaterThan(0);
      }
    }
  });

  it("新区临窗设施有与所属区域同步的黄昏和夜景原图", () => {
    for (const id of districtSyncedWindowedScenes) {
      for (const theme of ["dusk", "night"] as const) {
        const url = sceneBackgroundUrl(id, theme, theme === "dusk" ? 18 : 21);
        const newHousingUrl = developmentHousingBackgroundUrl(id, theme);
        if (newHousingUrl) {
          expect(url, `${id}/${theme} 未优先切换到新区专用内景`).toContain(`/v1.48/housing/${id}/${theme}.webp`);
          const file = resolve(projectRoot, "src/assets/bg/v1.48/housing", id, `${theme}.webp`);
          expect(existsSync(file), `缺少新区住宿内景 ${id}/${theme}.webp`).toBe(true);
          expect(statSync(file).size, `${id}/${theme}.webp 为空`).toBeGreaterThan(0);
          continue;
        }
        expect(url, `${id}/${theme} 没有切换到专用时段图`).toContain(`/v1.48/scenes/${id}_${theme}.webp`);
        const file = resolve(projectRoot, "src/assets/bg/v1.48/scenes", `${id}_${theme}.webp`);
        expect(existsSync(file), `缺少 ${id}_${theme}.webp`).toBe(true);
        expect(statSync(file).size, `${id}_${theme}.webp 为空`).toBeGreaterThan(0);
      }
    }
  });
});
