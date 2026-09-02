import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";
import { gameDay } from "../src/game/core/calendar";
import {
  TAROT_CARDS,
  tarotCard,
  tarotTotal,
  tarotUnlockedCount,
  evaluateTarot,
  tickTarotDaily,
  emptyTarotCounters,
  initialTarot,
  onWorkDone,
  markLateToday,
  onEventTriggered,
  onEventChoice,
  onContactMessaged,
  onLibraryStudy,
  onRecoveredDepressionOrInjury,
  markCollapsed,
  markMajorCrisis,
  checkCrisisRecovered,
  recordNightAction,
  recordCollapsedThenActed,
} from "../src/game/core/tarot";
import type { GameState } from "../src/game/types";

describe("塔罗牌组：数据完整性", () => {
  it("恰好 22 张大阿卡纳，id 连续 0-21 且无重复", () => {
    expect(TAROT_CARDS.length).toBe(22);
    expect(tarotTotal()).toBe(22);
    const ids = TAROT_CARDS.map((c) => c.id);
    expect(ids).toEqual([...Array(22).keys()]);
    expect(new Set(ids).size).toBe(22);
  });

  it("每张牌都有名称/象征/条件提示，tarotCard 可按 id 检索", () => {
    for (const c of TAROT_CARDS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.symbol.length).toBeGreaterThan(0);
      expect(c.hint.length).toBeGreaterThan(0);
      expect(tarotCard(c.id)).toBe(c);
    }
    expect(tarotCard(99)).toBeUndefined();
  });

  it("首尾两张为「愚者」与「世界」", () => {
    expect(TAROT_CARDS[0].name).toBe("愚者");
    expect(TAROT_CARDS[21].name).toBe("世界");
  });
});

describe("塔罗牌组：初始状态", () => {
  it("新档只赠愚者(0)，计数器全部归零", () => {
    const s = createInitialState();
    expect(s.tarot.unlocked).toEqual([0]);
    expect(tarotUnlockedCount(s)).toBe(1);
    expect(s.pendingTarot).toEqual([]);
    expect(s.counters).toEqual(emptyTarotCounters());
  });

  it("存档版本为 22", () => {
    expect(createInitialState().version).toBe(22);
    expect(SAVE_VERSION).toBe(22);
  });
});

describe("evaluateTarot：解锁与幂等", () => {
  it("满足条件即解锁并推入 pendingTarot", () => {
    const s = createInitialState();
    s.counters.workPayCount = 1; // 魔术师
    const newly = evaluateTarot(s);
    expect(newly).toContain(1);
    expect(s.tarot.unlocked).toContain(1);
    expect(s.pendingTarot).toContain(1);
  });

  it("重复评估不会重复解锁、不会重复弹窗", () => {
    const s = createInitialState();
    s.counters.workPayCount = 3;
    evaluateTarot(s);
    s.pendingTarot = [];
    const again = evaluateTarot(s);
    expect(again).toEqual([]);
    expect(s.pendingTarot).toEqual([]);
    expect(s.tarot.unlocked.filter((id) => id === 1).length).toBe(1);
  });

  it("集齐 0-20 后「世界」(21) 自动解锁", () => {
    const s = createInitialState();
    s.tarot.unlocked = [...Array(20).keys()]; // 0-19，缺 20
    evaluateTarot(s);
    expect(s.tarot.unlocked).not.toContain(21);

    s.tarot.unlocked.push(20);
    const newly = evaluateTarot(s);
    expect(newly).toContain(21);
    expect(tarotUnlockedCount(s)).toBe(22);
  });

  it("同一次评估内补满第 20 张时，世界牌立即跟着点亮", () => {
    const s = createInitialState();
    // 0-19 已有，20「审判」靠 4 种结局达成
    s.tarot.unlocked = [...Array(20).keys()];
    s.unlockedEndings = ["a", "b", "c", "d"];
    const newly = evaluateTarot(s);
    expect(newly).toContain(20);
    expect(newly).toContain(21);
  });
});

describe("每日结算 tickTarotDaily：连续天数计数器", () => {
  it("皇后：饱腹/心情/干净度均≥80 累加，任一跌破即归零", () => {
    const s = createInitialState();
    s.player.attrs.satiety = 85;
    s.player.attrs.mood = 90;
    s.player.attrs.hygiene = 82;
    tickTarotDaily(s);
    tickTarotDaily(s);
    expect(s.counters.queenStreak).toBe(2);

    s.player.attrs.hygiene = 40;
    tickTarotDaily(s);
    expect(s.counters.queenStreak).toBe(0);
  });

  it("皇后连续 5 天 → 解锁「皇后」(3)", () => {
    const s = createInitialState();
    s.player.attrs.satiety = 90;
    s.player.attrs.mood = 90;
    s.player.attrs.hygiene = 90;
    for (let i = 0; i < 5; i++) tickTarotDaily(s);
    expect(s.tarot.unlocked).toContain(3);
  });

  it("星星：心情≥85 连续 10 天 → 解锁「星星」(17)", () => {
    const s = createInitialState();
    s.player.attrs.mood = 88;
    for (let i = 0; i < 10; i++) tickTarotDaily(s);
    expect(s.counters.starStreak).toBe(10);
    expect(s.tarot.unlocked).toContain(17);
  });

  it("正义：五项属性稳定 50-80 才累加，超出上限也算断", () => {
    const s = createInitialState();
    const a = s.player.attrs;
    a.stamina = 60;
    a.health = 60;
    a.mood = 60;
    a.hygiene = 60;
    a.satiety = 60;
    tickTarotDaily(s);
    expect(s.counters.justiceStreak).toBe(1);

    a.mood = 95; // 高于 80 → 失衡
    tickTarotDaily(s);
    expect(s.counters.justiceStreak).toBe(0);
  });

  it("皇帝：有工作 + 当天上过班 + 未迟到才累加；迟到断链并清标记", () => {
    const s = createInitialState();
    s.career.jobId = "factory";
    s.career.lastWorkDay = gameDay(s.time);
    tickTarotDaily(s);
    expect(s.counters.emperorStreak).toBe(1);

    markLateToday(s);
    expect(s.flags.wasLateToday).toBe(true);
    tickTarotDaily(s);
    expect(s.counters.emperorStreak).toBe(0);
    expect(s.flags.wasLateToday).toBe(false);
  });

  it("皇帝：无业或当天缺勤都不算守序的一天", () => {
    const s = createInitialState();
    s.career.jobId = null;
    tickTarotDaily(s);
    expect(s.counters.emperorStreak).toBe(0);

    s.career.jobId = "factory";
    s.career.lastWorkDay = gameDay(s.time) - 3; // 今天没去
    tickTarotDaily(s);
    expect(s.counters.emperorStreak).toBe(0);
  });

  it("隐者：无业连续 50 天且存款≥5000 → 解锁(9)；一旦入职即归零", () => {
    const s = createInitialState();
    s.career.jobId = null;
    s.player.money = 8000;
    for (let i = 0; i < 50; i++) tickTarotDaily(s);
    expect(s.counters.joblessStreak).toBe(50);
    expect(s.tarot.unlocked).toContain(9);

    s.career.jobId = "clerk";
    tickTarotDaily(s);
    expect(s.counters.joblessStreak).toBe(0);
  });
});

describe("埋点钩子", () => {
  it("onWorkDone：有偿工作计数 + 工种去重（死神需 5 种）", () => {
    const s = createInitialState();
    onWorkDone(s, "factory", 100);
    onWorkDone(s, "factory", 100); // 同工种不重复计入种类
    expect(s.counters.workPayCount).toBe(2);
    expect(s.counters.distinctJobKinds).toEqual(["factory"]);

    for (const j of ["clerk", "courier", "guard", "barista"]) onWorkDone(s, j, 50);
    expect(s.counters.distinctJobKinds.length).toBe(5);
    evaluateTarot(s);
    expect(s.tarot.unlocked).toContain(13);
  });

  it("onWorkDone：无偿（paid=0）不计魔术师", () => {
    const s = createInitialState();
    onWorkDone(s, "volunteer", 0);
    expect(s.counters.workPayCount).toBe(0);
    evaluateTarot(s);
    expect(s.tarot.unlocked).not.toContain(1);
  });

  it("onEventTriggered：不同事件去重累计，15 个 → 命运之轮(10)", () => {
    const s = createInitialState();
    for (let i = 0; i < 15; i++) onEventTriggered(s, `ev_${i}`);
    onEventTriggered(s, "ev_0"); // 重复
    expect(s.counters.distinctEvents.length).toBe(15);
    evaluateTarot(s);
    expect(s.tarot.unlocked).toContain(10);
  });

  it("onEventChoice：只有白名单里的助人选项才计数", () => {
    const s = createInitialState();
    onEventChoice(s, "ev_library_student", 0); // 助人
    onEventChoice(s, "ev_library_student", 1); // 非助人
    onEventChoice(s, "ev_not_registered", 0); // 未登记事件
    expect(s.counters.helpedEvents).toBe(1);
  });

  it("onContactMessaged：不同联系人去重（恋人需 3 人 + 联系人≥5）", () => {
    const s = createInitialState();
    onContactMessaged(s, "mom");
    onContactMessaged(s, "mom");
    onContactMessaged(s, "dad");
    expect(s.counters.messagedDistinct).toEqual(["mom", "dad"]);
  });

  it("onLibraryStudy + 智力≥60 → 女祭司(2)", () => {
    const s = createInitialState();
    onLibraryStudy(s, 6);
    onLibraryStudy(s, 5);
    expect(s.counters.libraryStudyHours).toBe(11);
    s.player.stats.intelligence = 60;
    evaluateTarot(s);
    expect(s.tarot.unlocked).toContain(2);
  });

  it("力量(8)：体质≥70 且从抑郁/重伤恢复", () => {
    const s = createInitialState();
    s.player.stats.fitness = 75;
    evaluateTarot(s);
    expect(s.tarot.unlocked).not.toContain(8);

    onRecoveredDepressionOrInjury(s);
    evaluateTarot(s);
    expect(s.tarot.unlocked).toContain(8);
  });

  it("recordNightAction：仅 23:00-4:59 计数", () => {
    const s = createInitialState();
    s.time.hour = 12;
    recordNightAction(s);
    expect(s.counters.nightActions).toBe(0);

    s.time.hour = 23;
    recordNightAction(s);
    s.time.hour = 2;
    recordNightAction(s);
    s.time.hour = 5;
    recordNightAction(s); // 5 点不算
    expect(s.counters.nightActions).toBe(2);
  });

  it("倒吊人(12)：晕倒后未睡继续行动", () => {
    const s = createInitialState();
    recordCollapsedThenActed(s);
    expect(s.counters.collapsedThenActed).toBe(false);

    markCollapsed(s);
    expect(s.flags.collapsed_not_slept).toBe(true);
    recordCollapsedThenActed(s);
    expect(s.counters.collapsedThenActed).toBe(true);
    expect(s.flags.collapsed_not_slept).toBe(false);

    evaluateTarot(s);
    expect(s.tarot.unlocked).toContain(12);
  });

  it("高塔(16)：跌入危机后必须活着恢复到安全线才点亮", () => {
    const s = createInitialState();
    checkCrisisRecovered(s);
    expect(s.counters.survivedMajorNegative).toBe(false);

    markMajorCrisis(s);
    s.player.attrs.health = 20; // 还没缓过来
    checkCrisisRecovered(s);
    expect(s.counters.survivedMajorNegative).toBe(false);

    s.player.attrs.health = 70;
    s.player.money = 500;
    s.player.criticalHealthStreak = 0;
    s.player.negativeMoneyStreak = 0;
    checkCrisisRecovered(s);
    expect(s.counters.survivedMajorNegative).toBe(true);
    expect(s.counters.majorCrisisHit).toBe(false);

    evaluateTarot(s);
    expect(s.tarot.unlocked).toContain(16);
  });

  it("高塔(16)：已 game over 不算「活下来」", () => {
    const s = createInitialState();
    markMajorCrisis(s);
    s.player.attrs.health = 80;
    s.endingId = "starved";
    checkCrisisRecovered(s);
    expect(s.counters.survivedMajorNegative).toBe(false);
  });
});

describe("结局相关牌", () => {
  it("太阳(19)：解锁好结局或隐藏结局", () => {
    const s = createInitialState();
    s.unlockedEndings = ["homeless_death"]; // bad 结局不算
    evaluateTarot(s);
    expect(s.tarot.unlocked).not.toContain(19);
  });

  it("审判(20)：解锁 ≥4 种不同结局", () => {
    const s = createInitialState();
    s.unlockedEndings = ["e1", "e2", "e3"];
    evaluateTarot(s);
    expect(s.tarot.unlocked).not.toContain(20);

    s.unlockedEndings.push("e4");
    evaluateTarot(s);
    expect(s.tarot.unlocked).toContain(20);
  });
});

describe("存档迁移 v17 → v18", () => {
  function makeV17(): Record<string, unknown> {
    const base = createInitialState() as unknown as Record<string, unknown>;
    const v17: Record<string, unknown> = { ...base, version: 17 };
    delete v17.tarot;
    delete v17.counters;
    delete v17.pendingTarot;
    v17.achievements = { unlocked: ["ach_first_salary", "ach_rich"] };
    v17.pendingAch = ["ach_rich"];
    return v17;
  }

  it("迁移后带上 tarot / counters / pendingTarot，并丢弃旧成就字段", () => {
    const migrated = migrateSave(makeV17());
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(Array.isArray(migrated.tarot.unlocked)).toBe(true);
    expect(migrated.tarot.unlocked).toContain(0);
    expect(migrated.counters).toBeDefined();
    expect(migrated.pendingTarot).toEqual([]);
    const raw = migrated as unknown as Record<string, unknown>;
    expect(raw.achievements).toBeUndefined();
    expect(raw.pendingAch).toBeUndefined();
  });

  it("按存档现状回溯补发可判定的牌，但不刷屏（pendingTarot 清空）", () => {
    const v17 = makeV17();
    v17.unlockedEndings = ["e1", "e2", "e3", "e4"]; // 审判可立即判定
    const migrated = migrateSave(v17);
    expect(migrated.tarot.unlocked).toContain(20);
    expect(migrated.pendingTarot).toEqual([]);
  });

  it("依赖累计计数器的牌从 0 重新累计", () => {
    const migrated = migrateSave(makeV17());
    expect(migrated.counters).toEqual(emptyTarotCounters());
    expect(migrated.tarot.unlocked).not.toContain(3); // 皇后靠 queenStreak
  });

  it("缺失 seen / economy / contacts 的残档也能迁移", () => {
    const v17 = makeV17();
    delete v17.seen;
    delete v17.economy;
    delete v17.contacts;
    const migrated = migrateSave(v17);
    expect(migrated.seen).toBeDefined();
    expect(migrated.economy).toBeDefined();
    expect(migrated.contacts.length).toBeGreaterThan(0);
  });
});

describe("initialTarot 契约", () => {
  it("返回全新对象，互不共享引用", () => {
    const a = initialTarot();
    const b = initialTarot();
    a.unlocked.push(5);
    expect(b.unlocked).toEqual([0]);
  });

  it("emptyTarotCounters 的数组字段也不共享引用", () => {
    const a = emptyTarotCounters();
    const b = emptyTarotCounters();
    a.distinctEvents.push("x");
    a.distinctJobKinds.push("y");
    a.messagedDistinct.push("z");
    expect(b.distinctEvents).toEqual([]);
    expect(b.distinctJobKinds).toEqual([]);
    expect(b.messagedDistinct).toEqual([]);
  });
});

describe("类型出口存在性（防止后续重构漏改）", () => {
  it("GameState 上 tarot / counters / pendingTarot 三件套齐备", () => {
    const s: GameState = createInitialState();
    expect(s).toHaveProperty("tarot");
    expect(s).toHaveProperty("counters");
    expect(s).toHaveProperty("pendingTarot");
  });
});
