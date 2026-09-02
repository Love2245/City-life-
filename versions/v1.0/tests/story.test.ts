import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { gameDay } from "../src/game/core/calendar";
import {
  startStory,
  drawStoryCards,
  cardDrawable,
  resolveStoryCard,
  tickStory,
  remitToFamily,
  arcGoalMet,
  decideStoryFinal,
  activeStoryCards,
  STORY_DEFAULT_ALLOCATION,
  STORY_FAIL_LIMIT,
} from "../src/game/core/story";
import { applyNewGameSetup } from "../src/game/core/profile";
import { CARD_MAP } from "../src/game/data/story";
import { checkEnding } from "../src/game/core/endings";
import { migrateSave, SAVE_VERSION } from "../src/game/core/migrate";
import { sleep } from "../src/game/core/time";
import type { GameState, StoryKind } from "../src/game/types";

function storyState(arc: StoryKind = "repay_debt", seed = 1): GameState {
  const s = createInitialState(seed);
  applyNewGameSetup(s, "destitute", STORY_DEFAULT_ALLOCATION, [], { fatePoints: 0, unlocked: { eternal: true, story: true }, boosts: {}, memoirs: [] }, "story");
  startStory(s, arc);
  return s;
}

describe("v1.0 剧情模式：开局", () => {
  it("startStory 固定赤贫家庭并选中主线", () => {
    const s = storyState("repay_debt");
    expect(s.mode).toBe("story");
    expect(s.family).toBe("destitute");
    expect(s.story.arc).toBe("repay_debt");
    expect(s.story.stage).toBe(0);
    expect(s.story.conscience).toBe(0);
    expect(s.story.nextDrawDay).toBeGreaterThan(0);
  });

  it("applyNewGameSetup 全流程不丢金钱加成（赤贫 + 属性分配）", () => {
    const s = createInitialState(1);
    applyNewGameSetup(s, "destitute", STORY_DEFAULT_ALLOCATION, [], { fatePoints: 100, unlocked: { eternal: true, story: true }, boosts: { boost_money: 1 }, memoirs: [] }, "story");
    // 赤贫初始 0 + 金钱点 3×100 + 命运加成 200
    expect(s.player.money).toBe(500);
    expect(s.player.stats.intelligence).toBe(30 + 3 * 2);
  });
});

describe("v1.0 剧情模式：抽卡", () => {
  it("到期抽卡：保底推进卡 + 随机卡入列，下次抽卡日推进", () => {
    const s = storyState("repay_debt");
    s.player.money = 1000;
    s.time.day = 5; // gameDay 4，进入 repay_s0 窗口
    s.story.nextDrawDay = gameDay(s.time);
    drawStoryCards(s);
    const acts = activeStoryCards(s);
    expect(acts.length).toBeGreaterThanOrEqual(1);
    expect(acts.some((x) => x.def.id === "repay_s0")).toBe(true);
    expect(s.story.nextDrawDay).toBeGreaterThan(gameDay(s.time));
  });

  it("非无视可行解不足 2 条的卡不可抽（防死局）", () => {
    const s = storyState();
    s.player.money = 100; // neutral_red_white 的 money 解要 200
    s.inventory = { phone: 1 }; // 无手稿 → special 解不可行；yield 可行 → 只有 1 条
    const card = CARD_MAP["neutral_red_white"];
    s.time.day = 26; // 窗口 [25,300]
    expect(cardDrawable(s, card)).toBe(false);
  });

  it("核心剧情卡（赌鬼投靠）只留 1 条可行解也可抽", () => {
    const s = storyState();
    s.player.money = 50; // 砸钱 800 不可行，仅"先住下"可行
    s.time.day = 26;
    expect(cardDrawable(s, CARD_MAP["neutral_gambler_arrives"])).toBe(true);
  });

  it("窗口未到不抽卡", () => {
    const s = storyState();
    s.time.day = 1; // gameDay 0，repay_s0 窗口 [3,30]
    s.story.nextDrawDay = 0;
    drawStoryCards(s);
    expect(activeStoryCards(s).length).toBe(0);
  });

  it("阶段 ≥2 后其他线障碍卡可进入池（经 drawable 校验）", () => {
    const s = storyState("repay_debt");
    s.player.money = 1000;
    s.story.stage = 2;
    s.time.day = 61;
    // 正义线障碍卡（屈服 + 砸钱两解）在阶段 2 后可混入
    expect(cardDrawable(s, CARD_MAP["justice_obstacle_threat"])).toBe(true);
  });
});

describe("v1.0 剧情模式：解法与推进", () => {
  it("砸钱解：扣现金、寄回目标资金、无良心变化", () => {
    const s = storyState("repay_debt");
    s.player.money = 1000;
    s.story.activeCards = [{ cardId: "repay_s0", triggeredDay: 0, deadlineDay: 99, status: "active" }];
    const r = resolveStoryCard(s, "repay_s0", 1); // 存 500
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(500);
    expect(s.story.goalFund).toBe(500);
    expect(s.story.stage).toBe(1);
  });

  it("屈服解：体力付出、寄回部分目标资金", () => {
    const s = storyState("repay_debt");
    s.story.activeCards = [{ cardId: "repay_s0", triggeredDay: 0, deadlineDay: 99, status: "active" }];
    const before = s.player.attrs.stamina;
    const r = resolveStoryCard(s, "repay_s0", 0); // 干苦力
    expect(r.ok).toBe(true);
    expect(s.story.goalFund).toBe(300);
    expect(s.player.attrs.stamina).toBeLessThan(before);
    expect(s.story.stage).toBe(1);
  });

  it("特殊解：需要好感，成功后寄回全额定金", () => {
    const s = storyState("repay_debt");
    s.relationships = [{ npcId: "npc_zhao_gang", affinity: 30, state: "friend", lastInteractionDay: 0 }];
    s.story.activeCards = [{ cardId: "repay_s0", triggeredDay: 0, deadlineDay: 99, status: "active" }];
    const r = resolveStoryCard(s, "repay_s0", 2);
    expect(r.ok).toBe(true);
    expect(s.story.goalFund).toBe(400);
  });

  it("终局卡解决 → finalTriggered 就绪", () => {
    const s = storyState("repay_debt");
    s.story.stage = 4;
    s.player.money = 5000;
    s.story.activeCards = [{ cardId: "repay_s4", triggeredDay: 0, deadlineDay: 99, status: "active" }];
    const r = resolveStoryCard(s, "repay_s4", 0); // 凑齐尾款
    expect(r.ok).toBe(true);
    expect(r.completed).toBe(true);
    expect(s.story.finalTriggered).toBe(true);
  });

  it("赌鬼卡解决后 gambler 清空", () => {
    const s = storyState();
    s.player.money = 1000;
    s.story.activeCards = [{ cardId: "neutral_gambler_arrives", triggeredDay: 0, deadlineDay: 99, status: "active" }];
    s.story.gambler = { sinceDay: 0, deadlineDay: 7, state: "active" };
    const r = resolveStoryCard(s, "neutral_gambler_arrives", 0); // 800 打发
    expect(r.ok).toBe(true);
    expect(s.story.gambler).toBeNull();
    expect(s.player.money).toBe(200);
  });
});

describe("v1.0 剧情模式：失约与赌鬼", () => {
  it("过期未决 → 失约 + ignoreConsequence + 计数", () => {
    const s = storyState("repay_debt");
    s.story.activeCards = [{ cardId: "repay_s1", triggeredDay: 0, deadlineDay: 5, status: "active" }];
    s.time.day = 7; // gameDay 6 > 5
    tickStory(s);
    expect(s.story.activeCards[0].status).toBe("failed");
    expect(s.story.failedObligations).toBe(1);
    expect(s.story.conscience).toBeLessThan(0);
  });

  it("赌鬼每日开销 + 到期偷钱", () => {
    const s = storyState();
    s.player.money = 300;
    s.story.activeCards = [{ cardId: "neutral_gambler_arrives", triggeredDay: 0, deadlineDay: 7, status: "active" }];
    s.story.gambler = { sinceDay: 0, deadlineDay: 7, state: "active" };
    s.time.day = 3; // gameDay 2：开销
    tickStory(s);
    expect(s.player.money).toBeLessThan(300);
    // 到期偷钱
    const s2 = storyState();
    s2.player.money = 500;
    s2.story.activeCards = [{ cardId: "neutral_gambler_arrives", triggeredDay: 0, deadlineDay: 6, status: "active" }];
    s2.story.gambler = { sinceDay: 0, deadlineDay: 6, state: "active" };
    s2.time.day = 8; // gameDay 7 > 6
    tickStory(s2);
    expect(s2.story.gambler).toBeNull();
    expect(s2.story.failedObligations).toBe(1);
    expect(s2.player.money).toBeLessThan(500);
  });

  it("良心 ≤-5 触发一次噩梦提醒", () => {
    const s = storyState();
    s.story.conscience = -6;
    const moodBefore = s.player.attrs.mood;
    tickStory(s);
    expect(s.player.attrs.mood).toBeLessThan(moodBefore);
    expect(s.flags["story_nightmare_warned"]).toBe(true);
  });
});

describe("v1.0 剧情模式：寄钱与目标", () => {
  it("remitToFamily 现金转入目标资金", () => {
    const s = storyState("repay_debt");
    s.player.money = 1000;
    const r = remitToFamily(s, 800);
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(200);
    expect(s.story.goalFund).toBe(800);
  });

  it("非金钱型主线不能寄钱", () => {
    const s = storyState("learn_craft");
    const r = remitToFamily(s, 100);
    expect(r.ok).toBe(false);
  });

  it("arcGoalMet：还清赌债需 2 万", () => {
    const s = storyState("repay_debt");
    s.story.goalFund = 19999;
    expect(arcGoalMet(s)).toBe(false);
    s.story.goalFund = 20000;
    expect(arcGoalMet(s)).toBe(true);
  });

  it("arcGoalMet：讨个说法需三份证据", () => {
    const s = storyState("seek_justice");
    s.flags["story_evidence_witness"] = true;
    s.flags["story_evidence_ledger"] = true;
    expect(arcGoalMet(s)).toBe(false);
    s.flags["story_evidence_bribe"] = true;
    expect(arcGoalMet(s)).toBe(true);
  });

  it("arcGoalMet：学门手艺需厨艺 5 级", () => {
    const s = storyState("learn_craft");
    s.player.skills.cooking = 4;
    expect(arcGoalMet(s)).toBe(false);
    s.player.skills.cooking = 5;
    expect(arcGoalMet(s)).toBe(true);
  });
});

describe("v1.0 剧情模式：终局评级", () => {
  it("未达成目标或失约满 3 次 → 打道回府", () => {
    const s = storyState("repay_debt");
    s.story.finalTriggered = true;
    s.story.failedObligations = STORY_FAIL_LIMIT;
    decideStoryFinal(s);
    expect(s.flags["story_ending_story_flee"]).toBe(true);
  });

  it("目标达成 + 良心达标 → 光宗耀祖", () => {
    const s = storyState("repay_debt");
    s.story.goalFund = 20000;
    s.story.conscience = 3;
    s.story.finalTriggered = true;
    decideStoryFinal(s);
    expect(s.flags["story_ending_story_honor"]).toBe(true);
  });

  it("目标达成 + 良心 + 健康 + 深关系 → 都市之子", () => {
    const s = storyState("repay_debt");
    s.story.goalFund = 20000;
    s.story.conscience = 5;
    s.player.attrs.health = 80;
    s.player.attrs.mood = 70;
    s.relationships = [{ npcId: "npc_lin_xiaoyu", affinity: 90, state: "lover", lastInteractionDay: 0 }];
    s.story.finalTriggered = true;
    decideStoryFinal(s);
    expect(s.flags["story_ending_story_citizen"]).toBe(true);
  });

  it("checkEnding 接住故事结局 flag；普通模式不受影响", () => {
    const s = storyState("repay_debt");
    s.story.goalFund = 20000;
    s.story.conscience = 1;
    s.story.finalTriggered = true;
    decideStoryFinal(s);
    const e = checkEnding(s);
    expect(e?.id).toBe("ending_story_home");
    expect(s.endingId).toBe("ending_story_home");

    const n = createInitialState();
    n.player.money = 100000;
    expect(checkEnding(n)?.id).toBe("ending_rich"); // 普通模式仍走旧结局
  });
});

describe("v1.0 剧情模式：系统集成", () => {
  it("存档迁移 v21 → v22 补 story 字段", () => {
    const s = createInitialState() as GameState & { story?: unknown };
    s.version = 21;
    delete (s as unknown as Record<string, unknown>).story;
    const m = migrateSave(s);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.story.arc).toBeNull();
  });

  it("剧情模式 20 号不再扣家庭月供（赤贫 -1000）", () => {
    const s = storyState("repay_debt");
    s.time.day = 20;
    const before = s.player.money;
    sleep(s, 8);
    expect(s.player.money).toBe(before);
  });
});
