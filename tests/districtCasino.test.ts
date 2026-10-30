import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  buyCasinoChips, enterCasinoRoom, leaveCasinoRoom, normalizeDistrictLeisure,
  redeemCasinoChips, startDistrictLeisure, stepDistrictLeisure, settleDistrictLeisure,
  type BlackjackSession, type CasinoSession, type LeisureKind,
} from "../src/game/core/districtLeisure";
import type { GameState } from "../src/game/types";

function at(day = 6): GameState {
  const s = createInitialState(14848);
  s.locationId = "boyue_texas_shop"; s.region = "boyue_night_market"; s.area = s.region;
  s.time.year = 2026; s.time.month = 9; s.time.day = day; s.time.hour = 18; s.time.minute = 0;
  s.player.money = 500; s.player.attrs = { stamina:100, health:100, mood:80, hygiene:100, satiety:100 };
  return s;
}
const clone = <T>(value:T):T => JSON.parse(JSON.stringify(value));
const card = (rank:number,suit=0) => suit * 13 + rank - 2;

describe("德州小店大厅与筹码账本", () => {
  it("每个营业夜首次入场送100筹码，同夜重进不重复；跨夜恢复赠送", () => {
    const s = at();
    expect(enterCasinoRoom(s, "leisure").ok).toBe(true); expect(s.districtLeisure?.casinoChips).toBe(100);
    leaveCasinoRoom(s); expect(enterCasinoRoom(s, "competition").ok).toBe(true);
    expect(s.player.money).toBe(450); expect(s.districtLeisure?.casinoChips).toBe(100);
    leaveCasinoRoom(s); s.time.day = 7; s.time.hour = 18;
    expect(enterCasinoRoom(s, "leisure").ok).toBe(true); expect(s.districtLeisure?.casinoChips).toBe(200);
  });

  it("竞技场余额不足不扣票也不赠筹码；筹码买入和兑回按5:1", () => {
    const s = at(); s.player.money = 49; const before = clone(s);
    expect(enterCasinoRoom(s, "competition")).toMatchObject({ ok:false }); expect(s).toEqual(before);
    s.player.money = 100; expect(enterCasinoRoom(s, "leisure").ok).toBe(true);
    expect(buyCasinoChips(s, 20).ok).toBe(true); expect(s.player.money).toBe(80); expect(s.districtLeisure?.casinoChips).toBe(200);
    expect(redeemCasinoChips(s, 25).ok).toBe(true); expect(s.player.money).toBe(85); expect(s.districtLeisure?.casinoChips).toBe(175);
    const unchanged = clone(s); expect(redeemCasinoChips(s, 24).ok).toBe(false); expect(s).toEqual(unchanged);
  });

  it("21点以筹码下注和返还；不改变现金账本", () => {
    const s = at(); expect(enterCasinoRoom(s, "leisure").ok).toBe(true);
    const cash = s.player.money, weekly = clone(s.weekly);
    expect(startDistrictLeisure(s, "blackjack", { bet:50, currency:"chips" }).ok).toBe(true);
    const hand = s.districtLeisure!.active as BlackjackSession;
    const prefix = [card(14), card(9,1), card(10), card(9,2)];
    hand.deck = [...prefix, ...Array.from({length:52},(_,i)=>i).filter(c=>!prefix.includes(c))];
    hand.player = [prefix[0],prefix[2]]; hand.dealer = [prefix[1],prefix[3]]; hand.cursor=4; hand.phase="ready";
    expect(s.districtLeisure?.casinoChips).toBe(50);
    const result = settleDistrictLeisure(s, hand.id);
    expect(result.result).toMatchObject({ payout:125, chipDelta:75, moneyDelta:0 });
    expect(s.districtLeisure?.casinoChips).toBe(175); expect(s.player.money).toBe(cash); expect(s.weekly).toEqual(weekly);
  });

  it.each(["high_low","slots","roulette_redblack","roulette_highlow","roulette_number"] as LeisureKind[])("%s 结果预先存档，读档不重摇且按揭晓与结算各一次", kind => {
    const s = at(); enterCasinoRoom(s, "leisure");
    const choice = kind === "roulette_redblack" ? "red" : kind === "roulette_highlow" ? "low" : kind === "roulette_number" ? 0 : "high";
    expect(startDistrictLeisure(s, kind, { bet:50, currency:"chips", choice }).ok).toBe(true);
    const active = s.districtLeisure!.active as CasinoSession, saved = clone(s), rngCalls = s.rng.calls;
    normalizeDistrictLeisure(saved);
    expect(saved.districtLeisure).toEqual(s.districtLeisure); expect(saved.rng.calls).toBe(rngCalls);
    expect(stepDistrictLeisure(saved, active.id, { type:"reveal" }).ok).toBe(true);
    const afterReveal = saved.districtLeisure!.active!; expect(afterReveal.phase).toBe("ready");
    const before = saved.time.hour * 60 + saved.time.minute;
    expect(settleDistrictLeisure(saved, active.id).ok).toBe(true);
    expect(saved.time.hour * 60 + saved.time.minute).toBe(before + 5);
    const once = clone(saved); expect(settleDistrictLeisure(saved, active.id).ok).toBe(false); expect(saved).toEqual(once);
  });

  it("娱乐场次下注范围遵从入场场次", () => {
    const s = at(); enterCasinoRoom(s, "leisure"); s.districtLeisure!.casinoChips = 3000;
    expect(startDistrictLeisure(s, "blackjack", { bet:49, currency:"chips" }).ok).toBe(false);
    expect(startDistrictLeisure(s, "blackjack", { bet:501, currency:"chips" }).ok).toBe(false);
    expect(startDistrictLeisure(s, "blackjack", { bet:51, currency:"chips" }).ok).toBe(false);
    leaveCasinoRoom(s); expect(enterCasinoRoom(s,"competition").ok).toBe(true);
    expect(startDistrictLeisure(s, "blackjack", { bet:999, currency:"chips" }).ok).toBe(false);
    expect(startDistrictLeisure(s, "blackjack", { bet:50001, currency:"chips" }).ok).toBe(false);
    expect(startDistrictLeisure(s, "blackjack", { bet:1000, currency:"chips" }).ok).toBe(true);
  });
});
