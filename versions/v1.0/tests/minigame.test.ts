import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  DIFFICULTY,
  getMiniGameConfig,
  configuredMiniGameKeys,
  judgeTiming,
  JUDGE_WINDOW,
  scaleTimeLimit,
  scaleWrongLimit,
  applyMiniGameReward,
} from "../src/game/core/minigame";
import { JOB_DEFS } from "../src/game/core/jobs";

describe("v0.96 工作小游戏：配置完整性", () => {
  it("全局难度系数 = 0.965", () => {
    expect(DIFFICULTY).toBe(0.965);
  });

  it("29 个游戏配置齐全（20 工作 + 3 锻炼 + 卖唱 + 摆摊 + v0.981 农牧果 3 + 寺庙义工）", () => {
    const keys = configuredMiniGameKeys();
    expect(keys.length).toBe(29);
  });

  it("每一份工作（JOB_DEFS 20 个）都有专属小游戏", () => {
    for (const job of JOB_DEFS) {
      const cfg = getMiniGameConfig(job.id);
      expect(cfg, `缺少配置: ${job.id}`).toBeDefined();
    }
  });

  it("锻炼 / 卖唱 / 摆摊行动有配置且为对应类型", () => {
    expect(getMiniGameConfig("exercise_gym")?.type).toBe("rhythm");
    expect(getMiniGameConfig("exercise_park")?.type).toBe("rhythm");
    expect(getMiniGameConfig("exercise_home_equip")?.type).toBe("rhythm");
    expect(getMiniGameConfig("street_perform")?.type).toBe("rhythm");
    // v0.981：修正死键 street_stall（那是创业项目 id）→ 真实行动 id stall_street_night
    expect(getMiniGameConfig("stall_street_night")?.type).toBe("sequence");
    expect(getMiniGameConfig("street_stall")).toBeUndefined();
  });

  it("v0.981 新增：农场 / 牧场 / 果园 / 寺庙义工小游戏", () => {
    expect(getMiniGameConfig("job_farm_hand")).toBeDefined();
    expect(getMiniGameConfig("job_pasture_milk")).toBeDefined();
    expect(getMiniGameConfig("job_orchard_pick")).toBeDefined();
    expect(getMiniGameConfig("temple_volunteer")).toBeDefined();
  });

  it("流水线：4 工序 × 4 轮 + 每轮乱序 + 限时", () => {
    const cfg = getMiniGameConfig("job_factory_line");
    expect(cfg?.type).toBe("sequence");
    if (cfg?.type === "sequence") {
      expect(cfg.steps.length).toBe(4);
      expect(cfg.rounds).toBeGreaterThanOrEqual(3);
      expect(cfg.rounds).toBeLessThanOrEqual(5);
      expect(cfg.shuffleEachRound).toBe(true);
      expect(cfg.timeLimit).toBeGreaterThan(0);
    }
  });

  it("咖啡店：配方表 + 多轮 + 乱序", () => {
    const cfg = getMiniGameConfig("job_cafe_staff");
    if (cfg?.type === "sequence") {
      expect(cfg.recipeTable && cfg.recipeTable.length >= 2).toBe(true);
      expect(cfg.rounds).toBe(2);
      expect(cfg.shuffleEachRound).toBe(true);
    }
  });

  it("音游（锻炼/卖唱）：轨道 1-3、音符 ≥8、有间隔与下落时长", () => {
    for (const key of ["exercise_gym", "exercise_park", "exercise_home_equip", "street_perform"]) {
      const cfg = getMiniGameConfig(key);
      expect(cfg?.type).toBe("rhythm");
      if (cfg?.type === "rhythm") {
        expect(cfg.tracks).toBeGreaterThanOrEqual(1);
        expect(cfg.tracks).toBeLessThanOrEqual(3);
        expect(cfg.notes).toBeGreaterThanOrEqual(8);
        expect(cfg.intervalMs).toBeGreaterThan(0);
        expect(cfg.fallMs).toBeGreaterThan(0);
      }
    }
  });

  it("quiz/whack 类配置字段完整", () => {
    const quiz = getMiniGameConfig("job_convenience_day");
    expect(quiz?.type).toBe("quiz");
    if (quiz?.type === "quiz") expect(quiz.questions.length).toBeGreaterThanOrEqual(3);
    const whack = getMiniGameConfig("job_market_cleaner");
    expect(whack?.type).toBe("whack");
    if (whack?.type === "whack") {
      expect(whack.goodLabel).toBeTruthy();
      expect(whack.badLabel).toBeTruthy();
      expect(whack.targets).toBeGreaterThan(0);
    }
  });
});

describe("v0.965 音游判定（难度系数缩放）", () => {
  it("判定窗 = 放宽基准（110/185/280）× 0.965", () => {
    expect(JUDGE_WINDOW.perfect).toBe(Math.round(110 * DIFFICULTY));
    expect(JUDGE_WINDOW.good).toBe(Math.round(185 * DIFFICULTY));
    expect(JUDGE_WINDOW.ok).toBe(Math.round(280 * DIFFICULTY));
  });

  it("judgeTiming 分级：perfect/good/ok/miss", () => {
    expect(judgeTiming(0)).toBe("perfect");
    expect(judgeTiming(JUDGE_WINDOW.perfect)).toBe("perfect");
    expect(judgeTiming(JUDGE_WINDOW.perfect + 1)).toBe("good");
    expect(judgeTiming(JUDGE_WINDOW.good + 1)).toBe("ok");
    expect(judgeTiming(JUDGE_WINDOW.ok + 1)).toBe("miss");
  });

  it("限时放宽（×1.15）且失误容错下限 2", () => {
    expect(scaleTimeLimit(15)).toBe(17.3); // 15 * 1.15
    expect(scaleTimeLimit(10)).toBe(11.5);
    expect(scaleWrongLimit(2)).toBe(2); // 下限 2
  });
});

describe("v0.96 评分奖励", () => {
  it("完美（ratio=1）：工资 +5%", () => {
    const s = createInitialState();
    s.player.money = 100;
    const r = applyMiniGameReward(s, "job_factory_line", 1, 100);
    expect(r.rewarded).toBe(true);
    expect(r.bonus).toBe(5);
    expect(s.player.money).toBe(105);
  });

  it("按得分比例加成（ratio=0.5 → 一半加成）", () => {
    const s = createInitialState();
    s.player.money = 100;
    const r = applyMiniGameReward(s, "job_factory_line", 0.5, 100);
    expect(r.bonus).toBe(Math.max(1, Math.round(100 * 0.05 * 0.5))); // round(2.5)=3
    expect(s.player.money).toBe(103);
  });

  it("0 分：无任何变化（绝不惩罚）", () => {
    const s = createInitialState();
    s.player.money = 100;
    const mood0 = s.player.attrs.mood;
    const r = applyMiniGameReward(s, "job_factory_line", 0, 100);
    expect(r.rewarded).toBe(false);
    expect(s.player.money).toBe(100);
    expect(s.player.attrs.mood).toBe(mood0);
  });

  it("工资为 0：按表现给心情补偿", () => {
    const s = createInitialState();
    const mood0 = s.player.attrs.mood;
    const r = applyMiniGameReward(s, "street_stall", 1, 0);
    expect(r.rewarded).toBe(true);
    expect(s.player.attrs.mood).toBe(Math.min(100, mood0 + 1));
  });
});
