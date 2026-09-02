/**
 * v1.01 修复验证：剧情指引辅助、NPC 相识机制、关系状态晋升。
 */
import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { startStory, storyGoalProgress, storyGoalDesc, storyStageHint, storyNextDrawIn, storyDeadlineLeft, storyStageName } from "../src/game/core/story";
import { maybeMeetNpc } from "../src/game/core/romance";
import { ensureRelationship, addAffinity, canBorrow, currentState } from "../src/game/core/relationships";
import { callFriend, smsPool } from "../src/game/core/phone";
import { applyEventChoice } from "../src/game/core/events";
import { getNpcDef } from "../src/game/core/npcs";

describe("v1.01 剧情流程指引", () => {
  it("剧情模式开局提供进度/倒计时/阶段指引", () => {
    const s = createInitialState(42);
    startStory(s, "repay_debt");
    expect(storyStageName(s)).toBe("站稳脚跟");
    expect(storyGoalProgress(s)).toBeGreaterThanOrEqual(0);
    expect(storyGoalDesc(s)).toContain("已寄");
    expect(storyStageHint(s).length).toBeGreaterThan(0);
    expect(storyNextDrawIn(s)).toBeGreaterThan(0);
    expect(storyDeadlineLeft(s)).toBeGreaterThan(300);
  });

  it("非金钱目标也能给出统一进度描述（学门手艺）", () => {
    const s = createInitialState(42);
    startStory(s, "learn_craft");
    s.player.skills.cooking = 3;
    expect(storyGoalProgress(s)).toBe(60);
    expect(storyGoalDesc(s)).toContain("厨艺 3/5");
  });

  it("讨个说法的证据进度按 flag 计数", () => {
    const s = createInitialState(42);
    startStory(s, "seek_justice");
    s.flags["story_evidence_witness"] = true;
    expect(storyGoalProgress(s)).toBe(33);
  });
});

describe("v1.01 NPC 相识机制", () => {
  it("常客保底：同一地点到访满 meetVisitCount 必遇", () => {
    // seed=1：首次随机值 0.627 ≥ meetChance 0.3 → 偶遇不命中，走计数路径
    const s = createInitialState(1);
    s.time.hour = 10; // 满足赵刚偶遇时段 8-18
    const def = getNpcDef("npc_zhao_gang")!;
    expect(def.meetVisitCount).toBe(2);
    // 第一次到访劳务市场：偶遇未命中，计数 +1
    s.locationId = "labor_market";
    maybeMeetNpc(s, "labor_market");
    expect(s.flags["meet_visits_npc_zhao_gang"]).toBe(1);
    expect(s.relationships.some((r) => r.npcId === "npc_zhao_gang")).toBe(false);
    // 第二次到访：保底必遇
    maybeMeetNpc(s, "labor_market");
    expect(s.relationships.some((r) => r.npcId === "npc_zhao_gang")).toBe(true);
  });

  it("熟人介绍：介绍人好感达标后认识被引荐者", () => {
    const s = createInitialState(42);
    const def = getNpcDef("npc_wang_lei")!;
    expect(def.introducedBy).toBe("npc_chen_jie");
    // 认识陈姐但好感未达标（<40）→ 不介绍
    ensureRelationship(s, "npc_chen_jie");
    addAffinity(s, "npc_chen_jie", 20);
    expect(s.relationships.some((r) => r.npcId === "npc_wang_lei")).toBe(false);
    // 好感加到 40 → 介绍王磊
    addAffinity(s, "npc_chen_jie", 25);
    expect(s.relationships.some((r) => r.npcId === "npc_wang_lei")).toBe(true);
  });

  it("关系状态随好感自动晋升为 friend（借款恢复可用）", () => {
    const s = createInitialState(42);
    ensureRelationship(s, "npc_lin_xiaoyu");
    addAffinity(s, "npc_lin_xiaoyu", 50);
    const rel = s.relationships.find((r) => r.npcId === "npc_lin_xiaoyu")!;
    expect(currentState(rel)).toBe("friend");
    expect(rel.state).toBe("friend"); // 字段同步（原 v1.0 永为 stranger）
    expect(canBorrow(s, "npc_lin_xiaoyu")).toBe(true);
  });

  it("给朋友打电话可找到朋友（关系状态修复）", () => {
    const s = createInitialState(42);
    ensureRelationship(s, "npc_zhao_gang");
    addAffinity(s, "npc_zhao_gang", 45);
    s.locationId = "home";
    const r = callFriend(s);
    expect(r.ok).toBe(true);
  });

  it("事件相识：选择 addNpc 选项后认识指定 NPC", () => {
    const s = createInitialState(42);
    s.locationId = "cafe";
    s.player.stats.charm = 30;
    const r = applyEventChoice(s, "ev_intro_cafe_girl", 0);
    expect(r.ok).toBe(true);
    expect(s.relationships.some((x) => x.npcId === "npc_lin_xiaoyu")).toBe(true);
  });
});

describe("v1.01 赤贫家庭短信适配", () => {
  it("赤贫家庭（剧情模式）不会收到发红包/打钱类短信", () => {
    const s = createInitialState(42);
    s.family = "destitute";
    s.player.money = 100; // 触发 poor 条件
    const pool = smsPool(s);
    expect(pool.some((x) => x.id === "sms_birthday")).toBe(false); // 妈妈发红包
    expect(pool.some((x) => x.id === "sms_money")).toBe(false); // 爸打钱 200
    expect(pool.some((x) => x.id === "sms_weekend_dinner")).toBe(false); // 温馨周末关怀
  });

  it("赤贫家庭短信池包含专属催钱/诉苦短信", () => {
    const s = createInitialState(42);
    s.family = "destitute";
    const pool = smsPool(s);
    expect(pool.some((x) => x.id === "sms_destitute_rice")).toBe(true);
    expect(pool.some((x) => x.id === "sms_destitute_debtor")).toBe(true);
    expect(pool.some((x) => x.id === "sms_destitute_grandma_med")).toBe(true);
    expect(pool.some((x) => x.id === "sms_destitute_gambler")).toBe(true);
    expect(pool.some((x) => x.id === "sms_destitute_birthday")).toBe(true); // 生日不发红包，只一碗长寿面
  });

  it("普通家庭不会收到赤贫专属短信", () => {
    const s = createInitialState(42);
    s.family = "ordinary";
    const pool = smsPool(s);
    expect(pool.some((x) => x.id.startsWith("sms_destitute_"))).toBe(false);
    // 普通家庭仍可收到温馨关怀
    expect(pool.some((x) => x.id === "sms_birthday" || x.id === "sms_weekend_dinner")).toBe(true);
  });
});
