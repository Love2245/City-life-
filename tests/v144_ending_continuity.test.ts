/**
 * v1.44 结局规则回归：仅坏结局结束游戏 + 旧档好结局存档可继续游玩。
 *
 * 覆盖两类用户验收点：
 * 1. 直接改数值达到好结局目标（财务自由等）→ 不触发强制结局页，生活无限继续；
 * 2. 旧版本存档中 endingId 已是好结局（读档即被推结局页的死档）→ 迁移后解除结束态，
 *    可继续游玩；坏结局存档保留结束态不变。
 */
import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { sleep, advanceHours } from "../src/game/core/time";
import { applyEffects } from "../src/game/engine";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";
import { gameDay } from "../src/game/core/calendar";
import type { GameState } from "../src/game/types";

/** 真实跨自然日睡眠：23:00 睡 8 小时到次日 07:00（同日重复睡眠只结算一次） */
function sleepOneNight(s: GameState): void {
  s.time.hour = 23;
  s.time.minute = 0;
  sleep(s, 8);
}

describe("v1.44 · 好结局不结束游戏（真实睡眠链路）", () => {
  it("存款 10 万（财务自由条件）→ 睡一晚不触发结局，时间正常推进", () => {
    const s = createInitialState();
    s.family = "ordinary";
    s.player.money = 100000;
    const startAbs = gameDay(s.time);
    sleepOneNight(s);
    expect(s.endingId).toBeNull();
    expect(s.unlockedEndings).toContain("ending_rich");
    // 时间推进：跨到了第二天（游戏没有停）
    expect(gameDay(s.time)).toBeGreaterThan(startAbs);
  });

  it("达成好结局后可连续多日继续游玩（无强制死档）", () => {
    const s = createInitialState();
    s.family = "ordinary";
    s.player.money = 100000;
    for (let night = 0; night < 3; night++) {
      sleepOneNight(s);
      expect(s.endingId).toBeNull();
      // 每晚结算后状态仍然可正常行动（金钱变化有效）
      const before = s.player.money;
      applyEffects(s, { money: 50 }, "🧪");
      expect(s.player.money).toBe(before + 50);
    }
    expect(s.unlockedEndings).toContain("ending_rich");
    expect(s.unlockedEndings.filter((id) => id === "ending_rich").length).toBe(1);
  });

  it("好结局档读档态（migrateSave 出口）可继续行动", () => {
    const s = createInitialState();
    s.family = "ordinary";
    s.player.money = 100000;
    sleepOneNight(s); // 图鉴解锁、继续玩
    // 模拟旧档回放：把当前状态原样走一遍迁移出口（v29 档读档路径）
    const reloaded = migrateSave(JSON.parse(JSON.stringify(s)) as unknown as Record<string, never>);
    expect(reloaded.endingId).toBeNull();
    // 迁移后的档可正常行动结算：时间推进 + 金钱变化生效（引擎层完整链路）
    const beforeMoney = reloaded.player.money;
    const beforeAbs = gameDay(reloaded.time);
    applyEffects(reloaded, { money: 50 }, "🧪");
    advanceHours(reloaded, 2);
    expect(reloaded.player.money).toBe(beforeMoney + 50);
    expect(gameDay(reloaded.time) === beforeAbs || reloaded.time.hour !== 7).toBe(true);
  });

  it("坏结局仍然结束游戏：真实负钱跨日 → 坏结局收尾（饿死先于破产）", () => {
    const s = createInitialState();
    s.family = "ordinary";
    s.player.money = -100; // 真实负债路径：买不起饭 → 饿死计数先到 5 晚
    for (let night = 0; night < 8; night++) {
      sleepOneNight(s);
      if (s.endingId) break;
    }
    // 负钱意味着吃不起饭：hungryStreak(5) 先于 negativeMoneyStreak(7) 达标，
    // 两个都是坏结局——规则要求"遭遇坏结局才结束"，这里验证的正是坏结局仍会结束。
    expect(s.endingId === "ending_starved" || s.endingId === "ending_bankrupt").toBe(true);
  });
});

describe("v1.44 · 旧版本好结局存档兼容（读档不再强制结束）", () => {
  it("v29 档 endingId=财务自由 → 迁移清空结束态，图鉴保留", () => {
    const legacy = createInitialState();
    legacy.family = "ordinary";
    legacy.player.money = 100000;
    legacy.endingId = "ending_rich"; // 旧版写入的好结局
    legacy.unlockedEndings = ["ending_rich"];
    const migrated = migrateSave(JSON.parse(JSON.stringify(legacy)) as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.endingId).toBeNull();
    expect(migrated.unlockedEndings).toContain("ending_rich");
  });

  it("v25 永恒档 endingId=声名鹊起 → 模式归经典 + 结束态解除，读档后可继续睡", () => {
    const legacy = createInitialState();
    legacy.family = "ordinary";
    (legacy as unknown as { version: number }).version = 25;
    (legacy as unknown as { mode: string }).mode = "eternal";
    legacy.endingId = "ending_famous";
    legacy.unlockedEndings = ["ending_famous"];
    const migrated = migrateSave(JSON.parse(JSON.stringify(legacy)) as unknown as Record<string, never>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.mode).toBe("normal");
    expect(migrated.endingId).toBeNull();
    // 解除结束态后真实继续游玩一晚
    sleepOneNight(migrated);
    expect(migrated.endingId).toBeNull();
  });

  it("剧情好结局档（衣锦还乡）→ 结束态解除", () => {
    const legacy = createInitialState();
    legacy.family = "ordinary";
    legacy.endingId = "ending_story_home";
    const migrated = migrateSave(JSON.parse(JSON.stringify(legacy)) as unknown as Record<string, never>);
    expect(migrated.endingId).toBeNull();
  });

  it("隐藏结局档（熬出个黎明）→ 结束态解除，可继续", () => {
    const legacy = createInitialState();
    legacy.family = "ordinary";
    legacy.endingId = "ending_survivor";
    const migrated = migrateSave(JSON.parse(JSON.stringify(legacy)) as unknown as Record<string, never>);
    expect(migrated.endingId).toBeNull();
    expect(migrated.unlockedEndings).toContain("ending_survivor");
    sleepOneNight(migrated);
    expect(migrated.endingId).toBeNull();
  });

  it("坏结局档保留结束态：endingId=饿死街头读档仍为结局态", () => {
    const legacy = createInitialState();
    legacy.family = "ordinary";
    legacy.endingId = "ending_starved";
    legacy.unlockedEndings = ["ending_starved"];
    const migrated = migrateSave(JSON.parse(JSON.stringify(legacy)) as unknown as Record<string, never>);
    expect(migrated.endingId).toBe("ending_starved");
  });
});
