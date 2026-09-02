// 都市生活 v0.991 — 多周目档案测试（命运点 / 永久加成 / 回忆录 / 模式解锁）
import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  emptyProfile,
  calcFatePoints,
  buildMemoirEntry,
  buyBoost,
  canBuyBoost,
  applyBoosts,
  applyNewGameSetup,
  settleProfile,
  BOOST_DEFS,
} from "../src/game/core/profile";
import { getMaxStamina } from "../src/game/core/stats";
import { getEnding } from "../src/game/core/endings";
import { gameDay } from "../src/game/core/calendar";
import type { GameState, Allocation } from "../src/game/types";

function fresh(): GameState {
  return createInitialState(7);
}

function badEndingState(): GameState {
  const s = fresh();
  s.player.negativeMoneyStreak = 3; // 触发 bad 结局（负债类）
  s.player.money = 50;
  return s;
}

describe("v0.991 命运点结算", () => {
  it("结局表现决定命运点：存活天数与余额有加成", () => {
    const s = badEndingState();
    const ending = getEnding("ending_bankrupt")!;
    const points = calcFatePoints(s, ending);
    // bad 基础 2 + dayBonus(day<10 → 0) + moneyBonus(money<300 → 0) = 2
    expect(points).toBeGreaterThanOrEqual(2);
  });

  it("活得更久、攒更多 → 命运点更高", () => {
    const a = badEndingState();
    a.time.day = 25; // 活 24 天 → dayBonus +2
    const b = badEndingState();
    b.time.day = 5;
    const ending = getEnding("ending_bankrupt")!;
    expect(calcFatePoints(a, ending)).toBeGreaterThan(calcFatePoints(b, ending));
  });
});

describe("v0.991 回忆录条目", () => {
  it("结局结算生成完整生平记录", () => {
    const s = badEndingState();
    const ending = getEnding("ending_bankrupt")!;
    const entry = buildMemoirEntry(s, ending, 5);
    expect(entry.endingId).toBe(ending.id);
    expect(entry.endingName).toBe(ending.name);
    expect(entry.tier).toBe(ending.tier);
    expect(entry.survivedDays).toBe(gameDay(s.time));
    expect(entry.fatePoints).toBe(5);
    expect(entry.reason.length).toBeGreaterThan(0);
    expect(entry.mode).toBe("normal");
  });

  it("结局原因摘要覆盖触发条件", () => {
    const s = badEndingState();
    s.player.lowMoodStreak = 5;
    s.player.hungryStreak = 3;
    const ending = getEnding("ending_bankrupt")!;
    const entry = buildMemoirEntry(s, ending, 2);
    expect(entry.reason).toContain("负债");
  });
});

describe("v0.991 命运商店", () => {
  it("点数不足拒绝购买", () => {
    const p = emptyProfile();
    const r = canBuyBoost(p, "boost_driving_license");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("命运点不足");
  });

  it("购买扣点并升档；叠档价格递增", () => {
    const p = emptyProfile();
    p.fatePoints = 100;
    const r1 = buyBoost(p, "boost_stamina"); // 首档 4 点
    expect(r1.ok).toBe(true);
    expect(p.boosts["boost_stamina"]).toBe(1);
    expect(p.fatePoints).toBe(96);
    const r2 = buyBoost(p, "boost_stamina"); // 二档 8 点
    expect(r2.ok).toBe(true);
    expect(p.boosts["boost_stamina"]).toBe(2);
    expect(p.fatePoints).toBe(88);
  });

  it("满档后不可再买", () => {
    const p = emptyProfile();
    p.fatePoints = 500;
    p.boosts["boost_stamina"] = 3;
    const r = canBuyBoost(p, "boost_stamina");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("已满档");
  });

  it("一次性加成只能买一次", () => {
    const p = emptyProfile();
    p.fatePoints = 100;
    buyBoost(p, "boost_driving_license");
    const r = canBuyBoost(p, "boost_driving_license");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("已购买");
  });
});

describe("v0.991 永久加成应用", () => {
  it("自带驾照：开局有驾驶本 flag 与物品", () => {
    const p = emptyProfile();
    p.boosts["boost_driving_license"] = 1;
    const s = fresh();
    applyBoosts(s, p);
    expect(s.flags["item_driving_license"]).toBe(true);
    expect(s.inventory["driving_license"]).toBe(1);
  });

  it("体力/金钱/魅力加成按档位叠加", () => {
    const p = emptyProfile();
    p.boosts["boost_stamina"] = 2;
    p.boosts["boost_money"] = 1;
    p.boosts["boost_charm"] = 3;
    const s = fresh();
    const staminaBefore = s.player.attrs.stamina;
    const moneyBefore = s.player.money;
    const charmBefore = s.player.stats.charm;
    applyBoosts(s, p);
    expect(s.player.attrs.stamina).toBe(staminaBefore + 20);
    expect(s.player.money).toBe(moneyBefore + 200);
    expect(s.player.stats.charm).toBe(charmBefore + 15);
  });

  it("幸运加成开局带水果", () => {
    const p = emptyProfile();
    p.boosts["boost_lucky"] = 1;
    const s = fresh();
    applyBoosts(s, p);
    expect(s.inventory["fruit"]).toBe(2);
  });
});

describe("v0.991 结局结算：发点 + 回忆录 + 解锁", () => {
  it("结算后点数累积、回忆录新增、永恒/剧情解锁", () => {
    const p = emptyProfile();
    const s = badEndingState();
    const ending = getEnding("ending_bankrupt")!;
    const points = settleProfile(p, s, ending);
    expect(p.fatePoints).toBe(points);
    expect(p.memoirs.length).toBe(1);
    expect(p.memoirs[0].endingId).toBe(ending.id);
    expect(p.unlocked.eternal).toBe(true);
    expect(p.unlocked.story).toBe(true);
  });

  it("多次结算点数持续累积（需多次游玩）", () => {
    const p = emptyProfile();
    const s1 = badEndingState();
    const s2 = badEndingState();
    const ending = getEnding("ending_bankrupt")!;
    const p1 = settleProfile(p, s1, ending);
    const p2 = settleProfile(p, s2, ending);
    expect(p.fatePoints).toBe(p1 + p2);
    expect(p.memoirs.length).toBe(2);
  });

  it("兑换表完整且价格合理", () => {
    expect(BOOST_DEFS.length).toBeGreaterThanOrEqual(5);
    for (const b of BOOST_DEFS) {
      expect(b.cost).toBeGreaterThan(0);
      expect(b.name.length).toBeGreaterThan(0);
    }
  });
});

describe("v0.992 开局全流程集成（顺序类 bug 回归）", () => {
  const zeroAlloc: Allocation = { money: 0, charm: 0, stamina: 0, intelligence: 0, items: 0 };

  it("顺序铁律：家庭初始资金不被永久加成覆盖（手头宽裕生效）", () => {
    const s = createInitialState();
    const p = emptyProfile();
    p.boosts["boost_money"] = 2; // +400
    applyNewGameSetup(s, "ordinary", zeroAlloc, [], p, "normal");
    // ordinary 初始 500 + 加成 400 = 900（applyFamily 必须先于 applyBoosts，否则加成被覆盖）
    expect(s.player.money).toBe(500 + 400);
  });

  it("体力加成作用于上限而非当前值：staminaCapBonus 派生进 getMaxStamina", () => {
    const s = createInitialState();
    const p = emptyProfile();
    p.boosts["boost_stamina"] = 3;
    applyNewGameSetup(s, "ordinary", zeroAlloc, [], p, "normal");
    expect(s.player.staminaCapBonus).toBe(30);
    expect(getMaxStamina(s)).toBe(130); // 100 + 30
    expect(s.player.attrs.stamina).toBeLessThanOrEqual(getMaxStamina(s));
  });

  it("永恒模式：物价上浮 30% + 免费住房补贴减半", () => {
    const s = createInitialState();
    applyNewGameSetup(s, "ordinary", zeroAlloc, [], emptyProfile(), "eternal");
    expect(s.economy.priceIndex).toBe(1.3);
    expect(s.living.govDaysLeft).toBe(3); // 7 → floor(7/2)
  });

  it("普通模式不受永恒调整影响", () => {
    const s = createInitialState();
    applyNewGameSetup(s, "ordinary", zeroAlloc, [], emptyProfile(), "normal");
    expect(s.economy.priceIndex).toBe(1);
    expect(s.living.govDaysLeft).toBe(7);
  });
});
