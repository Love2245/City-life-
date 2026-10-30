import { afterEach,beforeEach,describe, expect, it,vi } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { linearDay } from "../src/game/core/calendar";
import {
  blackjackValue, canUseDistrictLeisure, consumePerfectDanceDrink, evaluatePokerHand,
  hasPerfectDanceDrink, normalizeDistrictLeisure, PLATFORM_LEVEL, startDistrictLeisure,
  stepDistrictLeisure, settleDistrictLeisure, type BlackjackSession, type PokerSession,
  type ClawSession, type DanceSession, type PlatformSession, type LeisureKind,
} from "../src/game/core/districtLeisure";

const card = (rank: number, suit = 0) => suit * 13 + rank - 2;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
let entropyWord=137;
beforeEach(()=>{entropyWord=137;vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation(array=>{const words=array as Uint32Array;for(let i=0;i<words.length;i++)words[i]=entropyWord=(Math.imul(1664525,entropyWord)+1013904223)>>>0;return array;});});
afterEach(()=>vi.restoreAllMocks());
function at(kind: LeisureKind = "blackjack", seed = 148148) {
  const s = createInitialState(seed);
  s.locationId = kind === "claw" || kind === "platform" ? "boyue_arcade" : kind === "dance" ? "boyue_nightclub" : kind === "singing" ? "boyue_lounge_bar" : "boyue_texas_shop";
  s.region = "boyue_night_market"; s.area = s.region;
  s.time.day = 1; s.time.hour = 18; s.time.minute = 0;
  s.player.money = 5000; s.player.attrs = { stamina: 100, health: 100, satiety: 100, hygiene: 100, mood: 40 };
  return s;
}
const time = (s: ReturnType<typeof at>) => linearDay(s.time) * 1440 + s.time.hour * 60 + s.time.minute;
function rigBlackjack(s: ReturnType<typeof at>, player: number[], dealer: number[], next: number[] = []) {
  const a = s.districtLeisure!.active as BlackjackSession;
  const prefix = [player[0], dealer[0], player[1], dealer[1], ...next];
  a.deck = [...prefix, ...Array.from({ length: 52 }, (_, i) => i).filter(c => !prefix.includes(c))];
  a.player = player; a.dealer = dealer; a.cursor = 4; a.phase = blackjackValue(player).natural || blackjackValue(dealer).natural ? "ready" : "playing";
  return a;
}
function rigPoker(s: ReturnType<typeof at>, player: number[], dealer: number[], board: number[]) {
  const a = s.districtLeisure!.active as PokerSession;
  const prefix = [player[0], dealer[0], player[1], dealer[1], ...board];
  a.deck = [...prefix, ...Array.from({ length: 52 }, (_, i) => i).filter(c => !prefix.includes(c))];
  a.player = player; a.dealer = dealer; a.board = board;
  return a;
}

describe("真实牌局、收费与持久会话", () => {
  it("发完整52牌，不因余额、下注大小、命运或连胜改变牌序", () => {
    const a = at(), b = at(); b.player.money = 90000; b.flags.gambling_wins = 80; b.player.staminaCapBonus = 99;
    expect(startDistrictLeisure(a, "blackjack", { bet: 20 }).ok).toBe(true);
    entropyWord=137;
    expect(startDistrictLeisure(b, "blackjack", { bet: 2000 }).ok).toBe(true);
    const x = a.districtLeisure!.active as BlackjackSession, y = b.districtLeisure!.active as BlackjackSession;
    expect(x.deck).toEqual(y.deck); expect(new Set(x.deck).size).toBe(52);
    expect(x.player).toEqual([x.deck[0], x.deck[2]]); expect(x.dealer).toEqual([x.deck[1], x.deck[3]]);
    expect(a.weekly.spent).toBe(20); expect(time(a)).toBe(time(at()));
  });
  it("重复开始与错误操作不再扣款，旧组件id不会改变新会话", () => {
    const s = at(); startDistrictLeisure(s, "blackjack"); const original = clone(s);
    expect(startDistrictLeisure(s, "poker").ok).toBe(false);
    expect(stepDistrictLeisure(s, 999, { type: "hit" }).ok).toBe(false);
    expect(stepDistrictLeisure(s, s.districtLeisure!.active!.id, { type: "grab" }).ok).toBe(false);
    expect(s).toEqual(original);
  });
  it.each([NaN, 19, 2001, 20.5])("拒绝无效21点下注%s且失败不变", bet => {
    const s = at(), old = clone(s); expect(startDistrictLeisure(s, "blackjack", { bet }).ok).toBe(false); expect(s).toEqual(old);
  });
  it.each([["blackjack", 20], ["blackjack", 2000], ["poker", 20], ["poker", 1000]] as const)("%s金额端点%s准入，德州总投入不超过2000", (kind, bet) => {
    const s = at(kind); expect(startDistrictLeisure(s, kind, { bet }).ok).toBe(true);
    const a = s.districtLeisure!.active!;
    if (kind === "poker") { stepDistrictLeisure(s, a.id, { type: "continue" }); expect(a.paid).toBe(bet * 2); expect(a.paid).toBeLessThanOrEqual(2000); }
    else expect(a.paid).toBe(bet);
  });
  it("德州底注1001和余额不足的开始失败不变", () => {
    const s = at("poker"), old = clone(s); expect(startDistrictLeisure(s, "poker", { bet: 1001 }).ok).toBe(false); expect(s).toEqual(old);
    s.player.money = 19; const poor = clone(s); expect(startDistrictLeisure(s, "poker", { bet: 20 }).ok).toBe(false); expect(s).toEqual(poor);
  });
  it("A按1/11计；天然赢2.5倍，双方天然则平局退注", () => {
    expect(blackjackValue([card(14), card(6)])).toEqual({ total: 17, soft: true, natural: false });
    expect(blackjackValue([card(14), card(6), card(10)])).toEqual({ total: 17, soft: false, natural: false });
    const s = at(); startDistrictLeisure(s, "blackjack", { bet: 100 });
    const a = rigBlackjack(s, [card(14), card(10)], [card(9, 1), card(9, 2)]); const t = time(s);
    const result = settleDistrictLeisure(s, a.id); expect(result.result?.payout).toBe(250);
    expect(s.player.money).toBe(5150); expect(s.weekly).toMatchObject({ spent: 100, earned: 250 }); expect(time(s) - t).toBe(5);
    const after = clone(s); expect(settleDistrictLeisure(s, a.id).ok).toBe(false); expect(s).toEqual(after);
    const tie = at(); startDistrictLeisure(tie, "blackjack", { bet: 100 });
    const b = rigBlackjack(tie, [card(14), card(10)], [card(14, 1), card(10, 1)]);
    expect(settleDistrictLeisure(tie, b.id).result?.payout).toBe(100);
  });
  it("庄含软17停牌；同点平局；玩家爆牌不让庄继续抽牌", () => {
    const s = at(); startDistrictLeisure(s, "blackjack", { bet: 100 });
    const a = rigBlackjack(s, [card(10), card(7)], [card(14, 1), card(6, 1)]);
    stepDistrictLeisure(s, a.id, { type: "stand" }); expect(a.dealer).toHaveLength(2); expect(settleDistrictLeisure(s, a.id).result?.payout).toBe(100);
    const b = at(); startDistrictLeisure(b, "blackjack"); const hand = rigBlackjack(b, [card(10), card(9)], [card(2, 1), card(3, 1)], [card(8)]);
    stepDistrictLeisure(b, hand.id, { type: "hit" }); expect(hand.phase).toBe("ready"); expect(hand.cursor).toBe(5); expect(hand.dealer).toHaveLength(2);
    expect(settleDistrictLeisure(b, hand.id).result?.payout).toBe(0);
  });
  it("牌堆耗尽时结束本轮，不把 undefined 塞进手牌", () => {
    const s = at(); startDistrictLeisure(s, "blackjack");
    const hand = rigBlackjack(s, [card(10), card(7)], [card(2, 1), card(3, 1)]);
    hand.cursor = hand.deck.length;
    expect(stepDistrictLeisure(s, hand.id, { type: "hit" }).ok).toBe(true);
    expect(hand.phase).toBe("ready");
    expect(hand.player.every(Number.isInteger)).toBe(true);
    expect(hand.dealer.every(Number.isInteger)).toBe(true);
    expect(settleDistrictLeisure(s, hand.id).ok).toBe(true);
  });
  it("德州弃牌只损底注；追加一次、普通高牌获胜也获奖，耗时10分钟", () => {
    const s = at("poker"); startDistrictLeisure(s, "poker", { bet: 100 }); const a = s.districtLeisure!.active!;
    stepDistrictLeisure(s, a.id, { type: "fold" }); expect(settleDistrictLeisure(s, a.id).result?.moneyDelta).toBe(-100); expect(s.player.money).toBe(4900);
    const b = at("poker"); startDistrictLeisure(b, "poker", { bet: 100 });
    const hand = rigPoker(b, [card(14), card(11, 1)], [card(10, 2), card(9, 3)], [card(2, 1), card(4, 2), card(6, 3), card(8), card(13, 1)]);
    const oldTime = time(b); expect(stepDistrictLeisure(b, hand.id, { type: "continue" }).ok).toBe(true);
    expect(stepDistrictLeisure(b, hand.id, { type: "continue" }).ok).toBe(false);
    const r = settleDistrictLeisure(b, hand.id); expect(r.result?.payout).toBe(400); expect(b.player.money).toBe(5200); expect(time(b) - oldTime).toBe(10);
    expect(b.weekly).toMatchObject({ spent: 200, earned: 400 });
  });
  it("德州开局需备足两倍底注，已开局余额被外部扣除仍可弃牌", () => {
    const s = at("poker"); s.player.money = 199;
    const rejected = clone(s);
    expect(startDistrictLeisure(s, "poker", { bet: 100 }).ok).toBe(false); expect(s).toEqual(rejected);
    s.player.money = 200; expect(startDistrictLeisure(s, "poker", { bet: 100 }).ok).toBe(true);
    s.player.money = 0; const old = clone(s), id = s.districtLeisure!.active!.id;
    expect(stepDistrictLeisure(s, id, { type: "continue" }).ok).toBe(false); expect(s).toEqual(old);
    expect(stepDistrictLeisure(s, id, { type: "fold" }).ok).toBe(true); expect(settleDistrictLeisure(s, id).ok).toBe(true);
  });
  it.each([
    [[card(14), card(14, 1)], [card(13), card(13, 1)], [card(14, 2), card(14, 3), card(2), card(5, 1), card(9, 2)], 400],
    [[card(14), card(13)], [card(2, 1), card(3, 1)], [card(12), card(11), card(10), card(5, 2), card(9, 3)], 400],
  ])("获胜四条/同花顺也只领取双方等额投入的底池", (player, dealer, board, payout) => {
    const s = at("poker"); startDistrictLeisure(s, "poker", { bet: 100 }); const a = rigPoker(s, player, dealer, board);
    stepDistrictLeisure(s, a.id, { type: "continue" }); expect(settleDistrictLeisure(s, a.id).result?.payout).toBe(payout);
  });
  it("公共皇家同花顺同牌分池，退回全部已投入筹码", () => {
    const s = at("poker"); startDistrictLeisure(s, "poker", { bet: 100 });
    const a = rigPoker(s, [card(2, 1), card(3, 2)], [card(4, 1), card(5, 2)], [card(10), card(11), card(12), card(13), card(14)]);
    stepDistrictLeisure(s, a.id, { type: "continue" }); expect(settleDistrictLeisure(s, a.id).result?.payout).toBe(200);
  });
  it("牌型处理A2345、两组三条、三对子与踢脚牌", () => {
    expect(evaluatePokerHand([card(14), card(2, 1), card(3, 2), card(4, 3), card(5), card(8, 1), card(9, 2)]).category).toBe(4);
    expect(evaluatePokerHand([card(14), card(14, 1), card(14, 2), card(13), card(13, 1), card(13, 2), card(2)]).category).toBe(6);
    const threePairs = evaluatePokerHand([card(14), card(14, 1), card(13), card(13, 1), card(12), card(12, 1), card(2)]);
    const worse = evaluatePokerHand([card(14), card(14, 1), card(13), card(13, 1), card(11), card(10, 1), card(2)]);
    expect(threePairs.category).toBe(2); expect(threePairs.key).toBeGreaterThan(worse.key);
  });
});

describe("营业、真实小游戏与恢复", () => {
  it("德州周末夜归属、打烊余时、住院和班次门禁", () => {
    const s = at(); s.time.day = 2; s.time.hour = 5; s.time.minute = 55;
    expect(canUseDistrictLeisure(s, "blackjack").ok).toBe(true); expect(canUseDistrictLeisure(s, "poker").ok).toBe(false);
    s.time.minute = 56; expect(canUseDistrictLeisure(s, "blackjack").ok).toBe(false);
    s.time.day = 1; s.time.minute = 0; expect(canUseDistrictLeisure(s, "blackjack").ok).toBe(false);
    s.time.hour = 18; s.flags.hospitalized = true; expect(canUseDistrictLeisure(s, "blackjack").ok).toBe(false);
    delete s.flags.hospitalized; s.work!.active = { status: "paused" } as NonNullable<typeof s.work>["active"]; expect(canUseDistrictLeisure(s, "blackjack").ok).toBe(false);
  });
  it("跨午夜结算保持原会话、实际耗时；刚好06打烊时退回所属地图", () => {
    const s = at(); s.time.hour = 23; s.time.minute = 58; startDistrictLeisure(s, "blackjack");
    const a = rigBlackjack(s, [card(10), card(7)], [card(10, 1), card(6, 1)], [card(2)]);
    stepDistrictLeisure(s, a.id, { type: "stand" }); const t = time(s); expect(settleDistrictLeisure(s, a.id).ok).toBe(true);
    expect(time(s) - t).toBe(5); expect(s.time).toMatchObject({ day: 2, hour: 0, minute: 3 });
    const closing = at(); closing.time.day = 2; closing.time.hour = 5; closing.time.minute = 55;
    expect(startDistrictLeisure(closing, "blackjack").ok).toBe(true);
    const hand = rigBlackjack(closing, [card(10), card(7)], [card(10, 1), card(7, 1)]); stepDistrictLeisure(closing, hand.id, { type: "stand" });
    expect(settleDistrictLeisure(closing, hand.id).ok).toBe(true); expect(closing.time).toMatchObject({ hour: 6, minute: 0 }); expect(closing.locationId).toBe("map");
  });
  it("舞蹈30分钟余时门槛准确，魅力窗口按难度缩放且技能小幅辅助，错误输入不改节拍", () => {
    const s = at("dance"); s.time.hour = 5; s.time.minute = 30;
    expect(canUseDistrictLeisure(s, "dance").ok).toBe(true); s.time.minute = 31; expect(canUseDistrictLeisure(s, "dance").ok).toBe(false);
    s.time.hour = 18; s.time.minute = 0; s.player.stats.charm = 0; startDistrictLeisure(s, "dance");
    expect((s.districtLeisure!.active as DanceSession).hitWindowMs).toBe(121); const old = clone(s), id = s.districtLeisure!.active!.id;
    expect(stepDistrictLeisure(s, id, { type: "dance_tick", dtMs: NaN }).ok).toBe(false); expect(s).toEqual(old);
    s.player.attrs.stamina = 9; s.districtLeisure!.active = null; expect(canUseDistrictLeisure(s, "dance").ok).toBe(false);
  });
  it("进行中统一锁定其他推进时间与移动，结算释放锁后正确扣时", async () => {
    const { moveTo, waitHere } = await import("../src/game/core/actions"); const { advanceHours } = await import("../src/game/core/time");
    const s = at("platform"); startDistrictLeisure(s, "platform"); const t = time(s), id = s.districtLeisure!.active!.id;
    expect(moveTo(s, "boyue").ok).toBe(false); expect(waitHere(s, 1).ok).toBe(false); advanceHours(s, 1); expect(time(s)).toBe(t);
    stepDistrictLeisure(s, id, { type: "forfeit" }); expect(settleDistrictLeisure(s, id).ok).toBe(true); expect(time(s) - t).toBe(30);
  });
  it.each(["blackjack", "poker", "claw", "platform", "dance", "singing"] as LeisureKind[])("%s恢复原快照且不会再扣款/抽牌/推进时间", kind => {
    const s = at(kind); startDistrictLeisure(s, kind); const saved = clone(s), calls = s.rng.calls;
    normalizeDistrictLeisure(saved); expect(saved.districtLeisure).toEqual(s.districtLeisure); expect(saved.rng.calls).toBe(calls); expect(time(saved)).toBe(time(s));
    expect(startDistrictLeisure(saved, kind).ok).toBe(false);
  });
  it("坏牌堆不会在读档时重洗生成新获奖机会", () => {
    const s = at(); startDistrictLeisure(s, "blackjack"); const a = s.districtLeisure!.active as BlackjackSession; a.deck[1] = a.deck[0]; const calls = s.rng.calls;
    normalizeDistrictLeisure(s); expect(s.districtLeisure!.active).toBeNull(); expect(s.rng.calls).toBe(calls); expect(s.player.money).toBe(4980);
  });
  it("抓娃娃用独立5%随机结果，移动和恢复不重新抽取；仅胜利给玩偶+30", () => {
    const s = at("claw"); let wins = 0;
    for (let i = 0; i < 5000; i++) { s.districtLeisure = undefined; s.player.money = 5000; startDistrictLeisure(s, "claw"); const a = s.districtLeisure!.active as ClawSession; if (a.success) wins++; }
    expect(wins / 5000).toBeGreaterThan(0.035); expect(wins / 5000).toBeLessThan(0.065);
    const a = s.districtLeisure!.active as ClawSession, calls = s.rng.calls; a.success = true;
    stepDistrictLeisure(s, a.id, { type: "claw_move", delta: 0.1 }); expect(s.rng.calls).toBe(calls);
    const oldTime = time(s); stepDistrictLeisure(s, a.id, { type: "grab" }); const r = settleDistrictLeisure(s, a.id);
    expect(r.result).toMatchObject({ moodDelta: 30, payout: 0, itemId: a.plushId }); expect(s.inventory[a.plushId]).toBe(1); expect(time(s) - oldTime).toBe(5);
    const old = clone(s); expect(settleDistrictLeisure(s, a.id).ok).toBe(false); expect(s).toEqual(old);
  });
  it("横版实际物理能跳过缺口、收集金币，三命和进度恢复，结束固定30分钟无现金", () => {
    const s = at("platform"); startDistrictLeisure(s, "platform"); let a = s.districtLeisure!.active as PlatformSession;
    for (let i = 0; i < 2000 && a.phase === "playing"; i++) {
      const ground = PLATFORM_LEVEL.platforms[a.checkpoint];
      const nearEdge = a.x > ground.x + ground.width - 30;
      const nearEnemy = (a.checkpoint === 1 || a.checkpoint === 3 || a.checkpoint === 5) && a.x > ground.x + 25;
      const nearCoin = a.checkpoint === 0 && PLATFORM_LEVEL.coins.some((c, n) => !a.collected.includes(n) && c.x - a.x > 10 && c.x - a.x < 35);
      stepDistrictLeisure(s, a.id, { type: "platform_tick", dtMs: 50, move: 1, jump: a.grounded && (nearEdge || nearEnemy || nearCoin) });
    }
    expect(a.elapsedMs).toBeGreaterThan(1000); expect(a.x).toBeGreaterThan(480); expect(a.collected.length).toBeGreaterThan(0);
    expect(a.complete, JSON.stringify(a)).toBe(true);
    const saved = clone(s); normalizeDistrictLeisure(saved); expect(saved.districtLeisure).toEqual(s.districtLeisure);
    if (a.phase === "playing") stepDistrictLeisure(s, a.id, { type: "forfeit" });
    const oldTime = time(s); const r = settleDistrictLeisure(s, a.id);
    expect(r.result!.moodDelta).toBeGreaterThanOrEqual(3); expect(r.result!.moodDelta).toBeLessThanOrEqual(15); expect(r.result!.payout).toBe(0); expect(s.player.money).toBe(4995); expect(time(s) - oldTime).toBe(30);
  });
  it("舞蹈按真实节拍命中；魅力扩大窗口；满分当夜一次酒券而不发现金", () => {
    const s = at("dance"); s.player.stats.charm = 100; startDistrictLeisure(s, "dance", { track: 0 }); const a = s.districtLeisure!.active as DanceSession;
    expect(a.hitWindowMs).toBe(135);
    for (const note of a.notes) {
      while (a.elapsedMs < note.atMs) stepDistrictLeisure(s, a.id, { type: "dance_tick", dtMs: Math.min(100, note.atMs - a.elapsedMs) });
      stepDistrictLeisure(s, a.id, { type: "dance_hit", lane: note.lane });
    }
    while (a.phase === "playing") stepDistrictLeisure(s, a.id, { type: "dance_tick", dtMs: 100 });
    const oldTime = time(s); const r = settleDistrictLeisure(s, a.id);
    expect(r.result).toMatchObject({ moodDelta: 15, staminaDelta: -10, perfect: true, payout: 0 }); expect(time(s) - oldTime).toBe(30);
    expect(s.player.money).toBe(5000); expect(hasPerfectDanceDrink(s)).toBe(true); expect(consumePerfectDanceDrink(s)).toBe(true); expect(consumePerfectDanceDrink(s)).toBe(false);
    s.districtLeisure!.dancePerfectNight = s.districtLeisure!.danceDrinkClaimedNight; expect(hasPerfectDanceDrink(s)).toBe(false);
    s.time.hour = 5; s.time.day = 2; expect(hasPerfectDanceDrink(s)).toBe(false);
  });
  it("错过音符会实际计miss，关闭/恢复保留当前时间和音符；提前结束不绕过耗时体力", () => {
    const s = at("dance"); startDistrictLeisure(s, "dance"); const a = s.districtLeisure!.active as DanceSession;
    for (let i = 0; i < 30; i++) stepDistrictLeisure(s, a.id, { type: "dance_tick", dtMs: 100 });
    expect(a.notes[0].status).toBe("miss"); const saved = clone(s); normalizeDistrictLeisure(saved); expect(saved.districtLeisure).toEqual(s.districtLeisure);
    stepDistrictLeisure(s, a.id, { type: "forfeit" }); const r = settleDistrictLeisure(s, a.id); expect(r.result).toMatchObject({ moodDelta: -2, staminaDelta: -10, perfect: false }); expect(hasPerfectDanceDrink(s)).toBe(false);
  });
  it("驻唱报酬按命中率递减，快照金额和每日次数不因恢复重置", () => {
    const s = at("singing"); s.player.stats.charm = 50; s.player.stats.fame = 50;
    expect(startDistrictLeisure(s, "singing").ok).toBe(true); const a = s.districtLeisure!.active as DanceSession;
    expect(a.incomeBase).toBe(54); expect(s.districtLeisure!.singingLastDay).toBe(0);
    const saved = clone(s); normalizeDistrictLeisure(saved); expect(saved.districtLeisure).toEqual(s.districtLeisure);
    for (const note of a.notes) {
      while (a.elapsedMs < note.atMs) stepDistrictLeisure(s, a.id, { type: "dance_tick", dtMs: Math.min(100, note.atMs - a.elapsedMs) });
      stepDistrictLeisure(s, a.id, { type: "dance_hit", lane: note.lane });
    }
    while (a.phase === "playing") stepDistrictLeisure(s, a.id, { type: "dance_tick", dtMs: 100 });
    const t = time(s); const result = settleDistrictLeisure(s, a.id);
    expect(result.result?.payout).toBe(a.incomeBase); expect(result.result!.payout).toBeLessThanOrEqual(a.incomeBase!); expect(time(s) - t).toBe(180);
    expect(s.weekly.earned).toBe(result.result?.payout); expect(s.weekly.jobsDone).toBe(0); expect(hasPerfectDanceDrink(s)).toBe(false);
    expect(canUseDistrictLeisure(s, "singing").ok).toBe(false);
    const old = clone(s); expect(settleDistrictLeisure(s, a.id).ok).toBe(false); expect(s).toEqual(old);
  });
  it("驻唱零命中不发报酬，曲目配置生成的音符数与结尾时长一致", () => {
    const s = at("singing"); s.player.stats.charm = 50;
    expect(startDistrictLeisure(s, "singing", { track: 2 }).ok).toBe(true);
    const a = s.districtLeisure!.active as DanceSession;
    expect(a.notes).toHaveLength(64);
    expect(a.lengthMs).toBe(a.notes[a.notes.length - 1].atMs + 1200);
    a.notes.forEach((note) => { note.status = "miss"; });
    a.phase = "ready";
    expect(settleDistrictLeisure(s, a.id).result?.payout).toBe(0);
  });
  it("驻唱最晚03:00、每日为自然日，疾病/干净度/魅力限制不能绕过", () => {
    const s = at("singing"); s.time.hour = 3; s.time.day = 2; s.player.stats.charm = 25;
    expect(canUseDistrictLeisure(s, "singing").ok).toBe(true); s.time.minute = 1; expect(canUseDistrictLeisure(s, "singing").ok).toBe(false);
    s.time.hour = 18; s.time.minute = 0; s.districtLeisure = { nextSessionId: 1, active: null, singingLastDay: 0 };
    expect(canUseDistrictLeisure(s, "singing").ok).toBe(true); s.player.stats.charm = 24; expect(canUseDistrictLeisure(s, "singing").ok).toBe(false);
    s.player.stats.charm = 25; s.player.attrs.hygiene = 10; expect(canUseDistrictLeisure(s, "singing").ok).toBe(false);
    s.player.attrs.hygiene = 100; s.statuses = [{ id: "sick", severity: 1, daysLeft: 2 } as typeof s.statuses[number]]; expect(canUseDistrictLeisure(s, "singing").ok).toBe(false);
  });
});
