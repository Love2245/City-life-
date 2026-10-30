import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createInitialState } from "../src/game/core/state";
import { HOUSING, selectLodging } from "../src/game/core/housing";
import { themeOfHour } from "../src/game/core/time";
import { grantTempleStay, grantWorkerDormStay } from "../src/game/core/residence";
import { sceneBackgroundUrl } from "../src/lib/sceneVisuals";
import { atlasVisualFor } from "../src/lib/mapVisuals";
import {
  HOUSING_VISUAL_KEYS, currentHousingVisualKey, currentSceneBackgroundUrl, housingBackgroundUrl,
} from "../src/lib/housingVisuals";

describe("housing visual resolution", () => {
  it("maps every housing tier to an available three-theme background (tiers may share art)", () => {
    const state = createInitialState();
    const resolved: string[] = [];
    state.living.mode = "gov";
    resolved.push(currentHousingVisualKey(state));
    for (const tier of HOUSING.nightly) {
      state.living.mode = "nightly";
      state.living.nightly = { lodgingId: tier.id };
      if (tier.id === "temple") grantTempleStay(state);
      if (tier.id === "worker_dorm") grantWorkerDormStay(state);
      resolved.push(currentHousingVisualKey(state));
    }
    for (const tier of HOUSING.lease) {
      state.living.mode = "lease";
      state.living.lease = { housingId: tier.id, rent: tier.price, rentGrowthCount: 0 };
      resolved.push(currentHousingVisualKey(state));
    }
    for (const tier of HOUSING.buy) {
      state.living.mode = "own";
      state.living.ownedId = tier.id;
      resolved.push(currentHousingVisualKey(state));
    }
    const uniqueResolved = [...new Set(resolved)];
    expect(uniqueResolved).toEqual(HOUSING_VISUAL_KEYS);
    expect(new Set(resolved).size).toBe(HOUSING_VISUAL_KEYS.length);
    for (const key of uniqueResolved) {
      for (const theme of ["day", "dusk", "night"] as const) {
        if (["hotel_boyue_quick", "hotel_boyu_nightmarket", "dev_incubator", "boyue_talent_apartment", "camping_lodging"].includes(key)) {
          expect(housingBackgroundUrl(key, theme)).toContain(`/v1.48/housing/${key}/${theme}.webp`);
          const file = resolve(process.cwd(), `src/assets/bg/v1.48/housing/${key}/${theme}.webp`);
          expect(existsSync(file), `missing v1.48 housing asset: ${file}`).toBe(true);
          expect(statSync(file).size, `empty v1.48 housing asset: ${file}`).toBeGreaterThan(128);
          continue;
        }
        const path = `/src/assets/bg/v1.46/housing/${key}/${theme}.webp`;
        expect(housingBackgroundUrl(key, theme, { [path]: path })).toBe(path);
        const file = resolve(process.cwd(), `src/assets/bg/v1.46/housing/${key}/${theme}.webp`);
        expect(existsSync(file), `missing housing asset: ${file}`).toBe(true);
        expect(statSync(file).size, `empty housing asset: ${file}`).toBeGreaterThan(128);
      }
    }
    state.living.mode = "lease";
    state.living.lease = { housingId: "suburb_room", rent: 800, rentGrowthCount: 0 };
    expect(currentHousingVisualKey(state)).toBe("old_apartment");
  });

  it("uses the checked-in room while retaining the previous building until arrival", () => {
    const state = createInitialState();
    state.player.money = 99999;
    state.locationId = "home";
    state.living.mode = "lease";
    state.living.lease = { housingId: "old_apartment", rent: 1000, rentGrowthCount: 0 };
    state.living.ownedId = "own_villa";
    state.living.nightly = { lodgingId: "hostel" };
    const before = currentSceneBackgroundUrl(state, "day");
    selectLodging(state, "hotel");
    expect(currentHousingVisualKey(state)).toBe("hotel");
    expect(currentSceneBackgroundUrl(state, "day")).toBe(before);
    state.living.mode = "nightly";
    state.living.awayNight = null;
    selectLodging(state, "minsu");
    expect(currentHousingVisualKey(state)).toBe("minsu");
  });

  it("uses each new residence's own room for its intro and while that residence is occupied", () => {
    const state = createInitialState();
    const locations = [
            "hotel_boyu_nightmarket",
      "boyue_talent_apartment",
    ] as const;

    for (const id of locations) {
      state.locationId = id;
      state.living.mode = "gov";
      expect(currentSceneBackgroundUrl(state, "day"), `${id} arrival intro`).toContain(`/v1.48/housing/${id}/day.webp`);

      if (id.startsWith("hotel_")) {
        state.living.mode = "nightly";
        state.living.nightly = { lodgingId: id };
        state.living.awayNight = null;
      } else {
        state.living.mode = "lease";
        state.living.lease = { housingId: id, rent: 650, rentGrowthCount: 0 };
      }
      expect(currentHousingVisualKey(state), `${id} active lodging key`).toBe(id);
      expect(currentSceneBackgroundUrl(state, "day"), `${id} occupied backdrop`).toContain(`/v1.48/housing/${id}/day.webp`);
    }
  });

  it("uses core defaults for missing or invalid housing", () => {
    const state = createInitialState();
    state.living.mode = "nightly";
    state.living.nightly = null;
    expect(currentHousingVisualKey(state)).toBe("atm");
    state.living.nightly = { lodgingId: "invalid" };
    expect(currentHousingVisualKey(state)).toBe("gov");
    state.living.mode = "lease";
    state.living.lease = null;
    expect(currentHousingVisualKey(state)).toBe("gov");
    state.living.mode = "own";
    state.living.ownedId = "invalid";
    expect(currentHousingVisualKey(state)).toBe("gov");
  });

  it("uses night at late hours and safely falls back when a pack asset is absent", () => {
    const path = "/src/assets/bg/v1.46/housing/hotel/night.webp";
    expect(housingBackgroundUrl("hotel", "late-night", { [path]: "hotel-night" })).toBe("hotel-night");
    for (const hour of [0, 3, 4, 20, 23]) expect(themeOfHour(hour)).toBe("night");
    expect(themeOfHour(5)).toBe("day");
    expect(themeOfHour(17)).toBe("dusk");
    expect(housingBackgroundUrl("hotel", "dusk", {})).toBe(sceneBackgroundUrl("home", "dusk"));
  });

  it("preserves non-home scene and map resolution regardless of housing", () => {
    const state = createInitialState();
    state.time.hour = 20;
    for (const location of ["hotel", "temple", "hospital", "street"]) {
      state.locationId = location;
      expect(currentSceneBackgroundUrl(state, "night")).toBe(sceneBackgroundUrl(location, "night"));
    }
    state.locationId = "map";
    state.region = "downtown";
    expect(currentSceneBackgroundUrl(state, "day")).toBe(atlasVisualFor("downtown", "sunny", state.time.hour).url);
  });

  it("keeps atlas, venue and campsite lighting on the same game-hour boundaries", () => {
    const state = createInitialState();
    state.locationId = "camping_base";
    state.time.hour = 20;
    state.living.mode = "gov";
    expect(currentSceneBackgroundUrl(state, "night")).toContain("/v1.48/scenes/camping_base_night.webp");

    state.living.mode = "nightly";
    state.living.nightly = { lodgingId: "camping_lodging" };

    // Even if a caller holds a stale dusk theme, the game clock wins for a stay at the campsite.
    expect(currentHousingVisualKey(state)).toBe("camping_lodging");
    expect(currentSceneBackgroundUrl(state, "dusk")).toContain("/v1.48/housing/camping_lodging/night.webp");

    for (const hour of [4, 5, 16, 17, 19, 20, 22, 23]) {
      const expected = themeOfHour(hour);
      const atlas = atlasVisualFor("development_reserve", "sunny", hour);
      expect(atlas.time === "late-night" ? "night" : atlas.time).toBe(expected);
      expect(sceneBackgroundUrl("moon_mountain", "day", hour)).toBe(sceneBackgroundUrl("moon_mountain", expected));
    }
  });

  it("matches windowed facility lighting to each parent district map", () => {
    const parentScenes = {
      development_culture: ["dev_art_gallery", "dev_museum", "dev_science_museum"],
      boyue_olympic: ["boyue_sports_store", "boyue_swimming_pool"],
    } as const;
    const periods = [
      [12, "day"],
      [18, "dusk"],
      [21, "night"],
      [23, "night"],
    ] as const;

    for (const [mapId, venues] of Object.entries(parentScenes)) {
      for (const [hour, expectedPeriod] of periods) {
        const map = atlasVisualFor(mapId, "sunny", hour);
        const mapPeriod = map.time === "late-night" ? "night" : map.time;
        expect(mapPeriod, `${mapId} at ${hour}:00`).toBe(expectedPeriod);
        for (const venue of venues) {
          const scene = sceneBackgroundUrl(venue, "day", hour);
          const suffix = expectedPeriod === "day" ? "" : `_${expectedPeriod}`;
          expect(scene, `${venue} at ${hour}:00`).toContain(`/v1.48/scenes/${venue}${suffix}.webp`);
        }
      }
    }
  });

  it("selects dusk and night variants for every time-aware v1.48 venue", () => {
    const timedVenues = [
      "treasure_lake",
      "moon_mountain",
      "dev_university",
      "dev_food_street",
      "development_bus_station",
      "camping_base",
      "boyue_football_field",
      "boyue_engineering_college",
      "boyue_central_fountain",
      "boyue_basketball_court",
    ];

    for (const venue of timedVenues) {
      expect(sceneBackgroundUrl(venue, "day", 17), `${venue} dusk`).toBe(sceneBackgroundUrl(venue, "dusk"));
      expect(sceneBackgroundUrl(venue, "dusk", 20), `${venue} night`).toBe(sceneBackgroundUrl(venue, "night"));
    }
  });
});
