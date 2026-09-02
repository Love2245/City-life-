// 都市生活 v0.99 — 关系系统核心测试
import { describe, it, expect, afterEach } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  ensureRelationship,
  addAffinity,
  findRelationship,
  relationLevel,
  currentState,
  canBorrow,
  npcPerkOf,
  tickRelationshipDecay,
  tickRomance,
  tickColleagueAffinity,
  tickLoans,
  STATE_LABEL,
} from "../src/game/core/relationships";
import { getNpcDef } from "../src/game/core/npcs";
import { gameDay } from "../src/game/core/calendar";
import type { GameState } from "../src/game/types";

function fresh(): GameState {
  return createInitialState(1);
}

const CLEANUP: Array<() => void> = [];
afterEach(() => {
  for (const fn of CLEANUP.splice(0)) fn();
});

describe("v0.99 关系地基", () => {
  it("ensureRelationship 用 NPC 初始好感建关系", () => {
    const s = fresh();
    const rel = ensureRelationship(s, "npc_lin_xiaoyu");
    expect(rel.affinity).toBe(5);
    expect(rel.state).toBe("stranger");
    expect(rel.lastInteractionDay).toBe(gameDay(s.time));
  });

  it("addAffinity 钳制 0..100 并更新互动日", () => {
    const s = fresh();
    ensureRelationship(s, "npc_lin_xiaoyu");
    addAffinity(s, "npc_lin_xiaoyu", 1000);
    expect(findRelationship(s, "npc_lin_xiaoyu")!.affinity).toBe(100);
    addAffinity(s, "npc_lin_xiaoyu", -1000);
    expect(findRelationship(s, "npc_lin_xiaoyu")!.affinity).toBe(0);
  });

  it("好感达 contactAt 打联系人 flag", () => {
    const s = fresh();
    ensureRelationship(s, "npc_chen_jie"); // contactAt 30
    addAffinity(s, "npc_chen_jie", 20); // 15 + 20 = 35 ≥ 30
    expect(s.flags["npc_contact_npc_chen_jie"]).toBe(true);
  });

  it("relationLevel / currentState 按好感分档", () => {
    expect(relationLevel(0)).toBe("stranger");
    expect(relationLevel(25)).toBe("acquaintance");
    expect(relationLevel(45)).toBe("friend");
    expect(relationLevel(75)).toBe("close_friend");
    const s = fresh();
    const rel = ensureRelationship(s, "npc_lin_xiaoyu");
    rel.affinity = 45;
    expect(currentState(rel)).toBe("friend");
    expect(STATE_LABEL.friend).toBe("朋友");
  });

  it("canBorrow：朋友 + borrow 特权 + 无在途借款", () => {
    const s = fresh();
    const rel = ensureRelationship(s, "npc_zhao_gang"); // friend→borrow
    rel.state = "friend";
    rel.affinity = 50;
    expect(canBorrow(s, "npc_zhao_gang")).toBe(true);
    s.romance.loanNpc = "npc_chen_jie"; // 已有在途借款
    expect(canBorrow(s, "npc_zhao_gang")).toBe(false);
  });
});

describe("v0.99 关系 tick", () => {
  it("关系淡漠：>7 天无互动好感 -2", () => {
    const s = fresh();
    const rel = ensureRelationship(s, "npc_zhao_gang");
    rel.affinity = 40;
    rel.lastInteractionDay = gameDay(s.time) - 8;
    const logs = tickRelationshipDecay(s);
    expect(logs.length).toBe(1);
    expect(findRelationship(s, "npc_zhao_gang")!.affinity).toBe(38);
  });

  it("恋爱维护：恋人 14 天无互动好感归 30", () => {
    const s = fresh();
    const rel = ensureRelationship(s, "npc_lin_xiaoyu");
    rel.state = "lover";
    rel.affinity = 90;
    rel.lastInteractionDay = gameDay(s.time) - 15;
    tickRomance(s);
    expect(findRelationship(s, "npc_lin_xiaoyu")!.affinity).toBe(30);
  });

  it("同事日久生情：在职时同事类 NPC 每天 +1", () => {
    const s = fresh();
    const def = getNpcDef("npc_zhao_gang")!;
    def.type = "colleague";
    CLEANUP.push(() => {
      def.type = undefined;
    });
    const rel = ensureRelationship(s, "npc_zhao_gang");
    rel.affinity = 10;
    const logsOff = tickColleagueAffinity(s); // 未在职
    expect(logsOff.length).toBe(0);
    s.flags["employed"] = true;
    const logs = tickColleagueAffinity(s);
    expect(logs.length).toBe(1);
    expect(findRelationship(s, "npc_zhao_gang")!.affinity).toBe(11);
  });

  it("借款逾期：>30 天未还好感 -30 并拉黑", () => {
    const s = fresh();
    const rel = ensureRelationship(s, "npc_zhao_gang");
    rel.affinity = 50;
    rel.state = "friend";
    rel.loan = { amount: 200, since: gameDay(s.time) - 31 };
    s.romance.loanNpc = "npc_zhao_gang";
    tickLoans(s);
    expect(rel.state).toBe("blocked");
    expect(rel.affinity).toBe(20);
    expect(rel.loan).toBeUndefined();
    expect(s.romance.loanNpc).toBeUndefined();
  });
});

describe("v0.992 NPC 特权兑现", () => {
  it("王磊 close_friend 档 → 内推办公室文员 flag 生效", () => {
    const s = fresh();
    ensureRelationship(s, "npc_wang_lei").affinity = 70; // close_friend 档
    addAffinity(s, "npc_wang_lei", 1); // 好感变化触发 syncNpcPerks
    expect(s.flags["referral_job_office_assistant"]).toBe(true);
  });

  it("陈姐 friend 档 → free_meal 特权", () => {
    const s = fresh();
    ensureRelationship(s, "npc_chen_jie").affinity = 45; // friend
    addAffinity(s, "npc_chen_jie", 1);
    expect(npcPerkOf(s, "npc_chen_jie")).toBe("free_meal");
  });

  it("赵刚 close_friend 档 → 内推装卸工 flag 生效", () => {
    const s = fresh();
    ensureRelationship(s, "npc_zhao_gang").affinity = 70;
    addAffinity(s, "npc_zhao_gang", 1);
    expect(s.flags["referral_job_loading"]).toBe(true);
  });
});
