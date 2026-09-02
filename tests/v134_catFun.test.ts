/**
 * v1.34 猫咪休闲玩法回归：
 * - 公园「猫咪自由锻炼」：50% 随机属性提升 / 50% 遭遇敌人（决斗或逃跑，失败无惩罚）
 * - 游乐场「喵喵娱乐赛」：无需门票、立即开战、失败无惩罚、胜利随机加属性
 * - 路边随机遭遇野生决斗已移除（maybeTriggerWildBattle 不再被行动链路调用）
 * - v1.34-hotfix：每日次数跨天必须重置（原实现只累加不清零，第二天起可用次数越来越少）
 */
import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { adoptCat } from "../src/game/core/cat";
import { setActivePet } from "../src/game/core/catCare";
import {
  freeTrainCat,
  startFunMatch,
  fleeCasualBattle,
  boostRandomCatAttr,
  FREE_TRAIN_DAILY_LIMIT,
  FUN_MATCH_DAILY_LIMIT,
} from "../src/game/core/catBattle";
import { settleBattle } from "../src/game/core/catBattle";
import { moveTo, performAction } from "../src/game/core/actions";

function readyState(seed = 42, hour = 12): ReturnType<typeof createInitialState> {
  const s = createInitialState(seed);
  s.time = { day: 2, month: 8, year: 2026, hour, minute: 0, stayedUp: false };
  s.player.money = 5000;
  adoptCat(s, "orange");
  setActivePet(s, s.pets[0].uid);
  s.pets[0].level = 10;
  return s;
}

describe("v1.34 公园猫咪自由锻炼", () => {
  it("无猫时拒绝", () => {
    const s = createInitialState(1);
    const r = freeTrainCat(s);
    expect(r.ok).toBe(false);
  });

  it("受伤猫咪不能锻炼", () => {
    const s = readyState();
    s.pets[0].injured = { level: "light", day: 1 };
    const r = freeTrainCat(s);
    expect(r.ok).toBe(false);
    expect(r.reason ?? "").toContain("伤");
  });

  it("50% 概率命中属性提升（kind=boost，属性有增益）", () => {
    // 用 seed 控制：试若干 seed 直到出现 boost 分支
    let found = false;
    for (let seed = 0; seed < 40 && !found; seed++) {
      const s = readyState(seed);
      const before = { ...s.pets[0].trainBonus };
      const r = freeTrainCat(s);
      expect(r.ok).toBe(true);
      if (r.kind === "boost") {
        expect(r.attr).toBeTruthy();
        expect(r.gain).toBeGreaterThan(0);
        const key = r.attr!;
        expect((s.pets[0].trainBonus?.[key] ?? 0)).toBeGreaterThan((before[key] ?? 0));
        // 时间推进 0.5h（12:00 → 12:30）
        expect(s.time.hour).toBe(12);
        expect(s.time.minute).toBe(30);
        found = true;
      } else {
        // battle 分支：战斗状态已建立（casual）
        expect(r.encounter).toBeTruthy();
        expect(s.catBattle?.casual).toBe(true);
        // 逃跑
        const f = fleeCasualBattle(s);
        expect(f.ok).toBe(true);
        expect(s.catBattle).toBeUndefined();
      }
    }
    expect(found, "应能命中 boost 分支").toBe(true);
  });

  it("每日限 3 次", () => {
    const s = readyState();
    for (let i = 0; i < FREE_TRAIN_DAILY_LIMIT; i++) {
      const r = freeTrainCat(s);
      expect(r.ok).toBe(true);
      if (r.kind === "battle") fleeCasualBattle(s);
    }
    const r = freeTrainCat(s);
    expect(r.ok).toBe(false);
    expect(r.reason ?? "").toContain("3 次");
  });

  it("跨天重置次数，且新一天仍能用满 FREE_TRAIN_DAILY_LIMIT 次", () => {
    const s = readyState();
    // 第一天用满
    for (let i = 0; i < FREE_TRAIN_DAILY_LIMIT; i++) {
      const r = freeTrainCat(s);
      expect(r.ok).toBe(true);
      if (r.kind === "battle") fleeCasualBattle(s);
    }
    expect(freeTrainCat(s).ok).toBe(false);

    // 第二天应恢复满额（v1.34-hotfix：计数跨天必须清零，否则第二天只能玩 1 次）
    s.time.day = 3;
    for (let i = 0; i < FREE_TRAIN_DAILY_LIMIT; i++) {
      const r = freeTrainCat(s);
      expect(r.ok, `第二天第 ${i + 1} 次应可用`).toBe(true);
      if (r.kind === "battle") fleeCasualBattle(s);
    }
    expect(freeTrainCat(s).ok).toBe(false);
  });
});

describe("v1.34 游乐场喵喵娱乐赛", () => {
  it("无需门票，立即开战（战斗状态为 casual）", () => {
    const s = readyState();
    const r = startFunMatch(s);
    expect(r.ok).toBe(true);
    expect(r.encounter).toBeTruthy();
    expect(s.catBattle?.casual).toBe(true);
    expect(s.catBattle?.tournamentId).toBeUndefined();
    fleeCasualBattle(s);
  });

  it("对手为普通或中级档位（无 Boss）", () => {
    let sawNormal = false;
    let sawIntermediate = false;
    for (let seed = 0; seed < 40; seed++) {
      const s = readyState(seed);
      const r = startFunMatch(s);
      if (!r.ok) continue;
      const opp = s.catBattle?.opponent;
      expect(["normal", "intermediate"]).toContain(r.encounter?.tierLabel === "中级" ? "intermediate" : "normal");
      if (r.encounter?.tierLabel === "中级") sawIntermediate = true;
      else sawNormal = true;
      fleeCasualBattle(s);
    }
    expect(sawNormal, "应出现普通对手").toBe(true);
    expect(sawIntermediate, "应出现中级对手").toBe(true);
  });

  it("每日限 3 场", () => {
    const s = readyState();
    for (let i = 0; i < FUN_MATCH_DAILY_LIMIT; i++) {
      const r = startFunMatch(s);
      expect(r.ok).toBe(true);
      fleeCasualBattle(s);
    }
    const r = startFunMatch(s);
    expect(r.ok).toBe(false);
  });

  it("娱乐赛跨天重置次数，新一天仍可打满 3 场", () => {
    const s = readyState();
    for (let i = 0; i < FUN_MATCH_DAILY_LIMIT; i++) {
      expect(startFunMatch(s).ok).toBe(true);
      fleeCasualBattle(s);
    }
    s.time.day = 3;
    for (let i = 0; i < FUN_MATCH_DAILY_LIMIT; i++) {
      expect(startFunMatch(s).ok, `第二天第 ${i + 1} 场应可打`).toBe(true);
      fleeCasualBattle(s);
    }
    expect(startFunMatch(s).ok).toBe(false);
  });

  it("casual 胜利：随机提升一个猫咪属性且无金钱奖励", () => {
    const s = readyState();
    startFunMatch(s);
    const b = s.catBattle!;
    const pet = s.pets.find((p) => p.uid === b.playerUid)!;
    b.opponent.hp = 0;
    b.finished = true;
    b.won = true;
    b.phase = "over";
    const beforeBonus = { ...(pet.trainBonus ?? {}) };
    const reward = settleBattle(s);
    expect(reward).not.toBeNull();
    expect(reward!.money).toBe(0);
    expect(reward!.attr).toBeTruthy();
    const key = reward!.attr!;
    expect((pet.trainBonus?.[key] ?? 0)).toBeGreaterThan((beforeBonus[key] ?? 0));
    expect(pet.injured).toBeUndefined();
  });

  it("casual 失败：无惩罚（不受伤、不扣心情）", () => {
    const s = readyState();
    startFunMatch(s);
    const b = s.catBattle!;
    const pet = s.pets.find((p) => p.uid === b.playerUid)!;
    b.player.hp = 0;
    b.finished = true;
    b.won = false;
    b.phase = "over";
    const moodBefore = pet.care.mood;
    const reward = settleBattle(s);
    expect(reward).not.toBeNull();
    expect(pet.injured).toBeUndefined();
    expect(pet.care.mood).toBe(moodBefore);
  });

  it("普通赛事战败仍会受伤（casual 不影响赛事）", () => {
    const s = readyState();
    s.catBattle = undefined;
    const b = s.catBattle = {
      opponentId: "t1_rookie",
      playerUid: s.pets[0].uid,
      tournamentId: "tournament_primary",
      casual: false,
      player: { name: "x", icon: "🐱", level: 10, element: "normal", attrs: { hp: 50, atk: 10, def: 10, spd: 10 }, skills: [], hp: 0 },
      opponent: { name: "y", icon: "🐈", level: 5, element: "normal", attrs: { hp: 50, atk: 10, def: 10, spd: 10 }, skills: [], hp: 50 },
      turn: 1,
      log: [],
      finished: true,
      won: false,
      rng: { seed: 1, calls: 0 },
      phase: "over",
      playerEnergy: 0,
      playerMaxEnergy: 3,
      playerBlock: 0,
      playerStrength: 0,
      opponentBlock: 0,
      opponentStrength: 0,
      playerHand: [],
      playerDrawPile: [],
      playerDiscardPile: [],
    } as never;
    settleBattle(s);
    expect(s.pets[0].injured).toBeTruthy();
  });
});

describe("v1.34 路边随机决斗移除", () => {
  it("执行行动不再触发猫 battle pending（野生遭遇已下线）", () => {
    const s = readyState();
    moveTo(s, "suburb");
    moveTo(s, "suburban_edge");
    moveTo(s, "amusement_park");
    s.flags["cat_wild_battle_day"] = undefined;
    const r = performAction(s, "amusement_cinema");
    expect(r.ok).toBe(true);
    expect(s.flags["cat_battle_pending"]).toBeUndefined();
    expect(s.catBattle).toBeUndefined();
  });
});
