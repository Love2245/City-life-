import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { gameDay } from "../src/game/core/calendar";
import { networkTransitPlan, rideNetworkTransit } from "../src/game/core/actions";
import { networkDestinationsFrom } from "../src/game/core/transit";
import type { GameState } from "../src/game/types";

function at(station: string, hour = 12, minute = 0): GameState {
  const state = createInitialState(148);
  state.locationId = station;
  state.region = station === "suburb_bus_station" || station === "suburb_train_station" ? "suburban_edge" : station === "development_bus_station" ? "development_culture" : "downtown_station";
  state.area = state.region;
  state.time.year = 2026; state.time.month = 9; state.time.day = 1; state.time.hour = hour; state.time.minute = minute;
  state.player.money = 1000;
  state.player.attrs = { stamina:100, health:100, mood:80, hygiene:100, satiety:100 };
  return state;
}
const minute = (s: GameState) => gameDay(s.time) * 1440 + s.time.hour * 60 + s.time.minute;

describe("站点到站点城际网络", () => {
  it("同类车站都列入可直达目的地", () => {
    expect(networkDestinationsFrom("bus_station")).toEqual(["suburb_bus_station", "development_bus_station"]);
    expect(networkDestinationsFrom("suburb_bus_station")).toEqual(["bus_station", "development_bus_station"]);
    expect(networkDestinationsFrom("development_bus_station")).toEqual(["bus_station", "suburb_bus_station"]);
    expect(networkDestinationsFrom("high_speed_rail")).toEqual(["suburb_train_station"]);
  });

  it("先预览再确认：巴士候车、车程、扣款和站内抵达只结算一次", () => {
    const s = at("bus_station", 12, 15), before = minute(s), money = s.player.money;
    expect(networkTransitPlan(s, "suburb_bus_station")).toMatchObject({ ok:true, fare:16, waitMinutes:45, travelMinutes:75, totalMinutes:120, privateCarMinutes:60, privateBikeMinutes:90 });
    expect(s.player.money).toBe(money); expect(minute(s)).toBe(before);
    const r = rideNetworkTransit(s, "suburb_bus_station");
    expect(r).toMatchObject({ ok:true, plan:{ fare:16, waitMinutes:45, travelMinutes:75 } });
    expect(s.locationId).toBe("suburb_bus_station"); expect(s.region).toBe("suburban_edge");
    expect(s.player.money).toBe(984); expect(minute(s) - before).toBe(120); expect(s.intercityTicket).toBeUndefined();
  });

  it("保留全天整点的树堰—伯月新区直达线", () => {
    const s = at("bus_station", 22, 20);
    expect(networkTransitPlan(s, "development_bus_station")).toMatchObject({ ok:true, fare:8, waitMinutes:40, travelMinutes:45, totalMinutes:85, privateCarMinutes:30, privateBikeMinutes:45 });
    expect(rideNetworkTransit(s, "development_bus_station").ok).toBe(true);
    expect(s.locationId).toBe("development_bus_station"); expect(s.player.money).toBe(992);
    expect(s.time.day).toBe(1); expect(s.time.hour).toBe(23); expect(s.time.minute).toBe(45);
  });

  it("伯月新区与紫羊巴士站可直达，并采用长线路成本", () => {
    const s = at("development_bus_station", 10, 0);
    expect(networkTransitPlan(s, "suburb_bus_station")).toMatchObject({ ok:true, fare:10, waitMinutes:0, travelMinutes:45, totalMinutes:45, privateCarMinutes:30, privateBikeMinutes:45 });
    expect(rideNetworkTransit(s, "suburb_bus_station").ok).toBe(true);
    expect(s.locationId).toBe("suburb_bus_station"); expect(s.player.money).toBe(990);
  });

  it("三条巴士直达线对称，绕经伯月比树堰—紫羊直达多十五分钟", () => {
    const routes = [
      ["bus_station", "development_bus_station", 8, 45],
      ["development_bus_station", "suburb_bus_station", 10, 45],
      ["bus_station", "suburb_bus_station", 16, 75],
    ] as const;
    for (const [origin, destination, fare, travelMinutes] of routes) {
      expect(networkTransitPlan(at(origin), destination)).toMatchObject({ fare, travelMinutes });
      expect(networkTransitPlan(at(destination), origin)).toMatchObject({ fare, travelMinutes });
    }
    expect(45 + 45).toBeGreaterThan(75);
  });

  it("城际火车按车站时刻表即刻发车并抵达对应站", () => {
    const s = at("high_speed_rail", 12, 0), before = minute(s);
    expect(networkTransitPlan(s, "suburb_train_station")).toMatchObject({ ok:true, fare:12, waitMinutes:0, travelMinutes:60, privateCarMinutes:60, privateBikeMinutes:90 });
    expect(rideNetworkTransit(s, "suburb_train_station").ok).toBe(true);
    expect(s.locationId).toBe("suburb_train_station"); expect(s.player.money).toBe(988); expect(minute(s)-before).toBe(60);
  });

  it("余额不足、无效站点或未处理的旧车票不会扣款或推进时间", () => {
    const s = at("bus_station"); s.player.money = 7; const before = minute(s);
    expect(networkTransitPlan(s, "development_bus_station")).toMatchObject({ ok:false });
    expect(rideNetworkTransit(s, "development_bus_station").ok).toBe(false);
    expect(rideNetworkTransit(s, "suburb_train_station").ok).toBe(false);
    expect(s.player.money).toBe(7); expect(minute(s)).toBe(before);
    const ticketed = at("bus_station");
    ticketed.intercityTicket = { mode:"bus", originStationId:"bus_station", destinationStationId:"suburb_bus_station", departureDay:gameDay(ticketed.time)+1, departureMinute:360, fare:35, durationHours:2.5 };
    const ticketedBefore = minute(ticketed);
    expect(networkTransitPlan(ticketed, "development_bus_station")).toMatchObject({ ok:false, reason:"请先处理已购买的旧车票" });
    expect(rideNetworkTransit(ticketed, "development_bus_station").ok).toBe(false);
    expect(ticketed.player.money).toBe(1000); expect(minute(ticketed)).toBe(ticketedBefore);
  });
});
