import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { RESIDENCE_TIERS } from "../src/game/core/residence";
import { selectLodging } from "../src/game/core/housing";
import type { WeatherId } from "../src/game/types";
import { loadingConditions, loadingRegionOf, sceneLoadingTarget } from "../src/lib/sceneLoadingTarget";

function mapState(region?: string, area?: string) {
  const state = createInitialState();
  state.locationId = "map";
  state.region = region;
  state.area = area;
  return state;
}

function homeState(id: string) {
  const state = createInitialState();
  const tier = RESIDENCE_TIERS.find(candidate => candidate.id === id)!;
  expect(tier).toBeDefined();
  state.living.mode = id.startsWith("own_") ? "own" : "lease";
  state.living.lease = state.living.mode === "lease" ? { housingId: id, rent: tier.price, rentGrowthCount: 0 } : null;
  state.living.ownedId = state.living.mode === "own" ? id : undefined;
  state.living.awayNight = null;
  state.locationId = tier.locationId ?? id;
  state.region = "downtown_center";
  return state;
}

describe("loading destination identity and physical district", () => {
  it.each([
    ["downtown", "downtown_center"],
    ["suburb", "rural"],
    ["development", "development_reserve"],
    ["boyue", "boyue_night_market"],
  ])("resolves %s from its own ID and a child district", (top, child) => {
    expect(loadingRegionOf(mapState(top))).toBe(top);
    expect(loadingRegionOf(mapState(child))).toBe(top);
    expect(sceneLoadingTarget(mapState(child), "2d")).toMatchObject({ regionId: top, sceneKey: `map:${top}`, kind: "map" });
  });

  it("uses the last physical area for a legacy map without region, instead of the residence", () => {
    const state = mapState(undefined, "development_culture");
    expect(RESIDENCE_TIERS.find(tier => tier.id === "gov")?.region).toBe("downtown_residential");
    expect(loadingRegionOf(state)).toBe("development");
    expect(sceneLoadingTarget(state, "3d").sceneKey).toBe("map:development");
  });

  it("keeps the airport in Boyue even when the region and ID prefix point at development", () => {
    const state = mapState("development", "development_culture");
    state.locationId = "airport";
    expect(loadingRegionOf(state)).toBe("boyue");
    expect(sceneLoadingTarget(state, "2d")).toMatchObject({ regionId: "boyue", sceneKey: "place:airport:boyue" });
    expect(loadingRegionOf(mapState("development_airport"))).toBe("boyue");
  });

  it("uses the registered location before a stale area when region is absent", () => {
    const state = mapState(undefined, "downtown_residential");
    state.locationId = "moon_mountain";
    expect(loadingRegionOf(state)).toBe("development");
    state.locationId = "boyue_snack_street";
    expect(loadingRegionOf(state)).toBe("boyue");
  });

  it.each([
    ["old_apartment", "downtown"],
    ["rental_apartment", "downtown"],
    ["suburb_room", "suburb"],
    ["boyue_talent_apartment", "boyue"],
    ["own_old_unit", "downtown"],
    ["own_apartment", "downtown"],
    ["own_villa", "downtown"],
  ])("uses the actual address and unique housing model key for %s", (id, top) => {
    const state = homeState(id);
    expect(loadingRegionOf(state)).toBe(top);
    expect(sceneLoadingTarget(state, "3d")).toMatchObject({ regionId: top, sceneKey: `3d:home:${id}`, kind: "3d" });
    expect(sceneLoadingTarget(state, "2d")).toMatchObject({ regionId: top, sceneKey: `2d:home:${id}`, kind: "3d" });
    state.locationId = "home";
    expect(sceneLoadingTarget(state, "3d").sceneKey).toBe(`3d:home:${id}`);
  });

  it.each([
    ["convenience_store", "downtown_center", "downtown"],
    ["boyue_convenience_store", "boyue_university", "boyue"],
    ["commercial_convenience_store", "downtown_commercial", "downtown"],
    ["cafe", "downtown_residential", "downtown"],
    ["boyue_cafe", "boyue_mall", "boyue"],
  ])("keeps the facility and branch identity for %s", (id, region, top) => {
    const state = mapState(region);
    state.locationId = id;
    expect(sceneLoadingTarget(state, "3d")).toMatchObject({ sceneKey: `3d:${id}`, regionId: top, kind: "3d" });
    expect(sceneLoadingTarget(state, "2d")).toMatchObject({ sceneKey: `2d:${id}`, regionId: top, kind: "3d" });
  });

  it("loads the booked Mooncourt guest room only at its hotel address", () => {
    const state = mapState("downtown_commercial");
    state.player.money = 1000;
    state.locationId = "hotel_mooncourt";
    expect(sceneLoadingTarget(state, "3d").kind).toBe("map");
    expect(selectLodging(state, "hotel_mooncourt")).toBe(true);
    expect(sceneLoadingTarget(state, "3d")).toMatchObject({
      sceneKey: "3d:home:hotel_mooncourt", regionId: "downtown", kind: "3d",
    });
    state.locationId = "commercial_exchange";
    expect(sceneLoadingTarget(state, "3d").kind).toBe("map");
  });

  it("shares a first-level map key between its overview and children", () => {
    expect(new Set(["development", "development_culture", "development_university", "development_reserve"].map(region => sceneLoadingTarget(mapState(region), "2d").sceneKey))).toEqual(new Set(["map:development"]));
  });

  it("preserves the scene key across all four times and six weather states", () => {
    const states = [mapState("boyue_night_market"), homeState("suburb_room")];
    const periods = [[12, "day"], [18, "dusk"], [21, "night"], [0, "late-night"]] as const;
    const weather: WeatherId[] = ["sunny", "cloudy", "rain", "snow", "heatwave", "coldwave"];
    for (const state of states) {
      const initial = sceneLoadingTarget(state, "3d");
      for (const [hour, time] of periods) for (const id of weather) {
        state.time.hour = hour;
        state.weather.id = id;
        expect(loadingConditions(state)).toEqual({ time, weather: id });
        expect(sceneLoadingTarget(state, "3d")).toMatchObject({ sceneKey: initial.sceneKey, regionId: initial.regionId, time, weather: id });
      }
    }
  });

  it.each([
    [0, "late-night"], [4, "late-night"], [5, "day"], [16, "day"],
    [17, "dusk"], [19, "dusk"], [20, "night"], [22, "night"], [23, "late-night"],
  ])("uses the shared time boundary at hour %i", (hour, time) => {
    expect(loadingConditions({ time: { hour } })).toEqual({ time, weather: "sunny" });
  });
});
