// 都市生活 v0.99 — 社交互动测试（约会/送礼/表白/分手/蹭住/借款/偶遇/电话）
import { describe, it, expect, afterEach } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  dateNpc,
  giftNpc,
  confessNpc,
  breakUpNpc,
  crashAtNpc,
  borrowFrom,
  repayLoan,
  maybeMeetNpc,
  callNpc,
  socialActionsAvailable,
  giftableCount,
} from "../src/game/core/romance";
import { ensureRelationship, findRelationship } from "../src/game/core/relationships";
import { callFriend } from "../src/game/core/phone";
import { getNpcDef } from "../src/game/core/npcs";
import { gameDay } from "../src/game/core/calendar";
import type { GameState } from "../src/game/types";

function fresh(): GameState {
  const s = createInitialState(7);
  s.player.money = 500;
  return s;
}

const CLEANUP: Array<() => void> = [];
afterEach(() => {
  for (const fn of CLEANUP.splice(0)) fn();
});
function forceMeetChance(npcId: string, p: number): void {
  const def = getNpcDef(npcId)!;
  const orig = def.meetChance;
  def.meetChance = p;
  CLEANUP.push(() => {
    def.meetChance = orig;
  });
}

describe("v0.99 约会 dateNpc", () => {
  it("可恋爱 + 好感≥20 + 有钱 → 成功并计入约会次数", () => {
    const s = fresh();
    ensureRelationship(s, "npc_lin_xiaoyu").affinity = 30;
    const moneyBefore = s.player.money;
    const r = dateNpc(s, "npc_lin_xiaoyu");
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(moneyBefore - 30);
    expect(s.romance.dateCount["npc_lin_xiaoyu"]).toBe(1);
    expect(findRelationship(s, "npc_lin_xiaoyu")!.affinity).toBeGreaterThanOrEqual(30 + 8);
  });

  it("非可恋爱 NPC 拒绝", () => {
    const s = fresh();
    const r = dateNpc(s, "npc_zhao_gang");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_romanceable");
  });
});

describe("v0.99 送礼 giftNpc", () => {
  it("消耗背包计数，喜欢加成 +3", () => {
    const s = fresh();
    s.inventory = { fruit: 2 }; // fruit 非奢侈品/农产 → base 4
    ensureRelationship(s, "npc_lin_xiaoyu"); // likes fruit
    const r = giftNpc(s, "npc_lin_xiaoyu", "fruit");
    expect(r.ok).toBe(true);
    expect(s.inventory["fruit"] ?? 0).toBe(1);
    expect(findRelationship(s, "npc_lin_xiaoyu")!.affinity).toBe(5 + 4 + 3);
  });

  it("讨厌的礼物扣分（保底 +1）：奢侈品送讨厌者", () => {
    const s = fresh();
    s.inventory = { luxury_bag: 1 }; // 陈姐 dislikes luxury_bag
    ensureRelationship(s, "npc_chen_jie");
    giftNpc(s, "npc_chen_jie", "luxury_bag");
    expect(findRelationship(s, "npc_chen_jie")!.affinity).toBe(15 + Math.max(1, 15 - 3));
  });

  it("背包无该物品拒绝", () => {
    const s = fresh();
    const r = giftNpc(s, "npc_lin_xiaoyu", "fruit");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_item");
  });

  it("giftableCount 只统计可送物品（消耗品/礼物类；手机等功能性物品不计）", () => {
    const s = fresh();
    s.inventory = { fruit: 2, phone: 1, luxury_watch: 1 }; // fruit 4×2 + 奢侈品 15×1 = 23；phone 不可送
    expect(giftableCount(s)).toBe(4 * 2 + 15);
  });

  it("非可送物品拒绝（手机不能当礼物，且不扣背包）", () => {
    const s = fresh();
    s.inventory = { phone: 1 };
    ensureRelationship(s, "npc_lin_xiaoyu");
    const r = giftNpc(s, "npc_lin_xiaoyu", "phone");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_giftable");
    expect(s.inventory["phone"]).toBe(1);
  });
});

describe("v0.99 表白 / 分手", () => {
  it("好感≥85 且约会≥3 → 成为恋人", () => {
    const s = fresh();
    const rel = ensureRelationship(s, "npc_lin_xiaoyu");
    rel.affinity = 90;
    s.romance.dateCount["npc_lin_xiaoyu"] = 4;
    const r = confessNpc(s, "npc_lin_xiaoyu");
    expect(r.ok).toBe(true);
    expect(rel.state).toBe("lover");
    expect(s.romance.confessed?.["npc_lin_xiaoyu"]).toBe(true);
  });

  it("条件不足被婉拒", () => {
    const s = fresh();
    ensureRelationship(s, "npc_lin_xiaoyu").affinity = 60;
    const r = confessNpc(s, "npc_lin_xiaoyu");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("conditions_unmet");
  });

  it("分手：恋人降级相识、好感封顶 50、清表白记录", () => {
    const s = fresh();
    const rel = ensureRelationship(s, "npc_lin_xiaoyu");
    rel.state = "lover";
    rel.affinity = 90;
    s.romance.confessed = { npc_lin_xiaoyu: true };
    const r = breakUpNpc(s, "npc_lin_xiaoyu");
    expect(r.ok).toBe(true);
    expect(rel.state).toBe("acquaintance");
    expect(rel.affinity).toBeLessThanOrEqual(50);
    expect(s.romance.confessed).not.toHaveProperty("npc_lin_xiaoyu");
    expect(socialActionsAvailable(s, "npc_lin_xiaoyu").break).toBe(false);
  });
});

describe("v0.99 蹭住 / 借款", () => {
  it("蹭住需 nightly 状态且已有关系", () => {
    const s = fresh();
    const r1 = crashAtNpc(s, "npc_lin_xiaoyu"); // gov 模式
    expect(r1.ok).toBe(false);
    s.living.mode = "nightly";
    ensureRelationship(s, "npc_lin_xiaoyu");
    const r2 = crashAtNpc(s, "npc_lin_xiaoyu");
    expect(r2.ok).toBe(true);
    expect(s.romance.crashTonight).toBe("npc_lin_xiaoyu");
  });

  it("借款：朋友特权 + 无在途借款", () => {
    const s = fresh();
    const rel = ensureRelationship(s, "npc_zhao_gang");
    rel.state = "friend";
    rel.affinity = 60; // v1.215：canBorrow 按好感推导层级判定，补上与 state 一致的好感
    const moneyBefore = s.player.money;
    const r = borrowFrom(s, "npc_zhao_gang", 200);
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(moneyBefore + 200);
    expect(rel.loan?.amount).toBe(200);
    expect(s.romance.loanNpc).toBe("npc_zhao_gang");
  });

  it("还款清账 +10 信任", () => {
    const s = fresh();
    const rel = ensureRelationship(s, "npc_zhao_gang");
    rel.state = "friend";
    rel.affinity = 40;
    rel.loan = { amount: 100, since: gameDay(s.time) };
    const moneyBefore = s.player.money;
    repayLoan(s, "npc_zhao_gang", 100);
    expect(s.player.money).toBe(moneyBefore - 100);
    expect(rel.loan).toBeUndefined();
    expect(rel.affinity).toBe(50);
  });
});

describe("v0.99 偶遇 maybeMeetNpc", () => {
  it("条件满足且命中 → 建关系 +3 初遇好感", () => {
    const s = fresh();
    s.player.stats.charm = 30;
    s.time.hour = 12;
    forceMeetChance("npc_lin_xiaoyu", 1); // cafe 地点
    const met = maybeMeetNpc(s, "cafe");
    expect(met).toBe("npc_lin_xiaoyu");
    const rel = findRelationship(s, "npc_lin_xiaoyu")!;
    expect(rel.affinity).toBeGreaterThanOrEqual(5 + 3);
  });

  it("魅力不足不偶遇", () => {
    const s = fresh();
    s.player.stats.charm = 5; // 需 ≥15
    forceMeetChance("npc_lin_xiaoyu", 1);
    const met = maybeMeetNpc(s, "cafe");
    expect(met).toBeNull();
    expect(findRelationship(s, "npc_lin_xiaoyu")).toBeUndefined();
  });

  it("已认识不再偶遇", () => {
    const s = fresh();
    s.player.stats.charm = 30;
    ensureRelationship(s, "npc_lin_xiaoyu");
    forceMeetChance("npc_lin_xiaoyu", 1);
    expect(maybeMeetNpc(s, "cafe")).toBeNull();
  });

  it("同事类 NPC 仅在职时可偶遇（电子厂）", () => {
    const s = fresh();
    s.time.hour = 12;
    forceMeetChance("npc_li_na", 1);
    const off = maybeMeetNpc(s, "electronics_factory"); // 未在职
    expect(off).toBeNull();
    s.flags["employed"] = true;
    const on = maybeMeetNpc(s, "electronics_factory");
    expect(on).toBe("npc_li_na");
  });
});

describe("v0.99 电话 callNpc / callFriend", () => {
  it("callNpc 每日每 NPC 一次", () => {
    const s = fresh();
    ensureRelationship(s, "npc_lin_xiaoyu");
    const r1 = callNpc(s, "npc_lin_xiaoyu");
    expect(r1.ok).toBe(true);
    const r2 = callNpc(s, "npc_lin_xiaoyu");
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe("cooldown");
  });

  it("callFriend：无朋友扣心情", () => {
    const s = fresh();
    const moodBefore = s.player.attrs.mood;
    const r = callFriend(s);
    expect(r.ok).toBe(true);
    expect(s.player.attrs.mood).toBe(moodBefore - 2);
  });

  it("callFriend：有朋友 +5 心情", () => {
    const s = fresh();
    const rel = ensureRelationship(s, "npc_zhao_gang");
    rel.state = "friend";
    rel.affinity = 45;
    const moodBefore = s.player.attrs.mood;
    const r = callFriend(s);
    expect(r.ok).toBe(true);
    expect(s.player.attrs.mood).toBe(moodBefore + 5);
  });
});
