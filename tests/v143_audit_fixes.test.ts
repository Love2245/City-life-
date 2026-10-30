import { grantTempleStay } from "../src/game/core/residence";
import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  currentRegion,
  canSleepHere,
  selectLodging,
} from "../src/game/core/housing";
import { sleep } from "../src/game/core/time";
import { performAction } from "../src/game/core/actions";
import eventsData from "../src/game/data/events.json";
import actionsData from "../src/game/data/actions.json";

/**
 * v1.43.x 逐项审计修复回归：
 *  A. 住院期间外宿预订作废且不收外宿费（避免出院后在家误扣）
 *  B. nightly 玩家不在 home 时选住宿视为「今晚外宿」，可在当前地点入睡（不再软锁）
 *  C. 行动实扣费与校验口径一致（走通胀/折扣，不再用裸价）
 *  D. 新增免费「简单洗漱」，穷且脏时不会彻底卡死
 *  E. ev_autumn_leaves 设冷却，无法在公园无限刷钱
 */

describe("审计修复 A：住院期间外宿作废且不误扣", () => {
  function leaseInCenter(s: ReturnType<typeof createInitialState>) {
    s.living = {
      mode: "lease",
      govDaysLeft: 0,
      nightly: null,
      lease: { housingId: "rental_apartment", rent: 3200, rentGrowthCount: 0 },
      awayNight: { lodgingId: "hotel" },
    };
    s.player.money = 1000;
    s.time.day = 15;
    s.time.month = 6; // 避免跨月月租干扰
  }

  it("住院：外宿预订作废，只收住院费 60，不收酒店 150", () => {
    const s = createInitialState();
    leaseInCenter(s);
    s.flags["hospitalized"] = true;
    s.locationId = "home";
    const before = s.player.money;
    sleep(s, 8);
    expect(s.living.awayNight).toBeNull(); // 外宿作废
    expect(s.player.money).toBe(before - 60); // 仅住院费，未误扣酒店
  });

  it("未住院：借宿收当晚房费 150，睡醒继续入住", () => {
    const s = createInitialState();
    leaseInCenter(s);
    s.flags["hospitalized"] = false;
    s.locationId = "home";
    const before = s.player.money;
    sleep(s, 8);
    expect(s.living.awayNight?.lodgingId).toBe("hotel");
    expect(s.player.money).toBe(before - 150);
  });
});

describe("审计修复 B：nightly 玩家不在 home 选住宿=外宿（防软锁）", () => {
  function nightly(s: ReturnType<typeof createInitialState>) {
    s.living = {
      mode: "nightly",
      govDaysLeft: 0,
      nightly: { lodgingId: "atm" },
      lease: null,
      awayNight: null,
    };
    s.player.money = 99999;
  }

  it("无固定住处：寺庙入住直接成为当前的家", () => {
    const s = createInitialState();
    nightly(s);
    s.locationId = "temple"; // 必须在寺庙办理挂单
    s.flags["temple_volunteered"] = 1;
    grantTempleStay(s);
    const ok = selectLodging(s, "temple", { forceAwayNight: true });
    expect(ok).toBe(true);
    expect(s.living.awayNight).toBeNull();
    expect(s.living.nightly?.lodgingId).toBe("temple"); // 当前入住地址与建筑一致
    expect(canSleepHere(s)).toBe(true); // 外宿可在当前地点睡
  });

  it("在 home：选住宿仍改常驻 nightly（搬家语义保留）", () => {
    const s = createInitialState();
    nightly(s);
    s.locationId = "home";
    selectLodging(s, "hostel");
    expect(s.living.nightly?.lodgingId).toBe("hostel");
    expect(s.living.awayNight).toBeNull();
  });
});

describe("审计修复 C：行动实扣费与校验口径一致（通胀/折扣）", () => {
  it("通胀 2 倍下，便利店采购泡面按实际价格扣款", () => {
    const s = createInitialState();
    (s as unknown as { economy: { priceIndex: number } }).economy = {
      ...(s as unknown as { economy?: { priceIndex: number } }).economy,
      priceIndex: 2,
    };
    s.player.money = 100;
    s.locationId = "convenience_store";
    const before = s.player.money;
    const r = performAction(s, "buy_noodles_convenience", { dine: "pack" });
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(before - 8);
  });
});

describe("审计修复 D：免费简单洗漱（防穷且脏软锁）", () => {
  it("wash_basic 存在、在家可触发、免费、能恢复干净度", () => {
    const a = (actionsData as Array<Record<string, unknown>>).find(
      (x) => x.id === "wash_basic",
    );
    expect(a).toBeDefined();
    expect(a!.locationId).toBe("home");
    const req = (a!.requirements ?? {}) as { money?: number };
    expect(req.money ?? 0).toBe(0); // 免费
    const eff = (a!.effects ?? {}) as { hygiene?: number };
    expect((eff.hygiene ?? 0) > 0).toBe(true);
  });
});

describe("审计修复 E：公园捡钱事件有冷却（防无限刷钱）", () => {
  it("ev_autumn_leaves 设了 cooldown，无法反复触发", () => {
    const ev = (eventsData as { events: Array<Record<string, unknown>> }).events.find(
      (e) => e.id === "ev_autumn_leaves",
    );
    expect(ev).toBeDefined();
    expect((ev!.cooldown as number) >= 1).toBe(true);
  });
});
