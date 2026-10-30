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
import { moveTo } from "../src/game/core/actions";
import { canSleepHere } from "../src/game/core/housing";
import { sleep } from "../src/game/core/time";
import { housingAtLocation, isResidenceBuildingVisible, NPC_CRASH_STAY_DAY } from "../src/game/core/residence";
import { mapAnchor } from "../src/lib/mapAtlas";
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

  it("已拉黑或已成恋人时拒绝约会，不扣钱也不推进时间", () => {
    const s = fresh();
    const rel = ensureRelationship(s, "npc_lin_xiaoyu");
    rel.affinity = 90;
    rel.state = "blocked";
    expect(socialActionsAvailable(s, rel.npcId).call).toBe(false);
    const money = s.player.money;
    const hour = s.time.hour;

    expect(dateNpc(s, rel.npcId).reason).toBe("blocked");
    expect(s.player.money).toBe(money);
    expect(s.time.hour).toBe(hour);

    rel.state = "lover";
    expect(dateNpc(s, rel.npcId).reason).toBe("already_lover");
    expect(s.player.money).toBe(money);
    expect(s.time.hour).toBe(hour);
  });

  it("只有可恋爱对象才显示约会入口", () => {
    const s = fresh();
    expect(socialActionsAvailable(s, "npc_zhao_gang").call).toBe(false);
    const rel = ensureRelationship(s, "npc_zhao_gang");
    rel.affinity = 100;
    s.romance.dateCount[rel.npcId] = 5;

    expect(socialActionsAvailable(s, rel.npcId).call).toBe(true);
    expect(socialActionsAvailable(s, rel.npcId).date).toBe(false);
    expect(socialActionsAvailable(s, rel.npcId).confess).toBe(false);
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

  it("拉黑对象不能表白解封，已成恋人时不能重复表白", () => {
    const s = fresh();
    const rel = ensureRelationship(s, "npc_lin_xiaoyu");
    rel.affinity = 90;
    rel.state = "blocked";
    s.romance.dateCount[rel.npcId] = 3;

    expect(confessNpc(s, rel.npcId).reason).toBe("blocked");
    expect(rel.state).toBe("blocked");
    expect(socialActionsAvailable(s, rel.npcId).confess).toBe(false);

    rel.state = "lover";
    expect(confessNpc(s, rel.npcId).reason).toBe("already_lover");
    expect(rel.state).toBe("lover");
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
    const rel = ensureRelationship(s, "npc_lin_xiaoyu");
    // v1.215 起蹭住要求「至少成为朋友」，且同一周同一位 NPC 只能打扰一次
    rel.affinity = 45;
    rel.state = "friend";
    const r2 = crashAtNpc(s, "npc_lin_xiaoyu");
    expect(r2.ok).toBe(true);
    expect(s.romance.crashTonight).toBe("npc_lin_xiaoyu");
    // 同一周重复蹭住被每周上限拦截
    const r3 = crashAtNpc(s, "npc_lin_xiaoyu");
    expect(r3.ok).toBe(false);
    expect(r3.reason).toBe("weekly_limit");
  });

  it("朋友家客房是可见的真实地图地址，醒来留在原处但不能再睡", () => {
    const s = fresh();
    s.living.mode = "nightly";
    s.living.nightly = { lodgingId: "atm" };
    s.locationId = "map";
    s.region = "downtown_residential";
    s.area = "downtown_residential";
    s.navStack = ["map", "downtown", "downtown_residential"];
    const rel = ensureRelationship(s, "npc_lin_xiaoyu");
    rel.affinity = 45;
    rel.state = "friend";

    expect(crashAtNpc(s, "npc_lin_xiaoyu").ok).toBe(true);
    expect(isResidenceBuildingVisible(s, "npc_guest_room")).toBe(true);
    expect(housingAtLocation("npc_guest_room")?.visualId).toBe("minsu");
    expect(mapAnchor("downtown_residential", "npc_guest_room")).toEqual({ x: 62, y: 72 });
    expect(moveTo(s, "npc_guest_room").ok).toBe(true);
    expect(s.locationId).toBe("npc_guest_room");
    expect(canSleepHere(s)).toBe(true);

    sleep(s, 8);
    expect(s.locationId).toBe("npc_guest_room");
    expect(s.romance.crashTonight).toBeUndefined();
    expect(s.flags[NPC_CRASH_STAY_DAY]).toBeUndefined();
    expect(canSleepHere(s)).toBe(false);
  });

  it("蹭住有门槛：仅相识阶段不能开口", () => {
    const s = fresh();
    s.living.mode = "nightly";
    const rel = ensureRelationship(s, "npc_lin_xiaoyu");
    rel.affinity = 20;
    rel.state = "acquaintance";
    const r = crashAtNpc(s, "npc_lin_xiaoyu");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("affinity_low");
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

  it("还款清账 +10 信任，并且周支出只记一次", () => {
    const s = fresh();
    const rel = ensureRelationship(s, "npc_zhao_gang");
    rel.state = "friend";
    rel.affinity = 40;
    rel.loan = { amount: 100, since: gameDay(s.time) };
    const moneyBefore = s.player.money;
    const spentBefore = s.weekly.spent;
    repayLoan(s, "npc_zhao_gang", 100);
    expect(s.player.money).toBe(moneyBefore - 100);
    expect(s.weekly.spent).toBe(spentBefore + 100);
    expect(rel.loan).toBeUndefined();
    expect(rel.affinity).toBe(50);
  });

  it("部分还款只把实际支付金额计入周支出一次", () => {
    const s = fresh();
    const rel = ensureRelationship(s, "npc_zhao_gang");
    rel.loan = { amount: 200, since: gameDay(s.time) };
    const spentBefore = s.weekly.spent;

    const result = repayLoan(s, "npc_zhao_gang", 75);

    expect(result.ok).toBe(true);
    expect(s.weekly.spent).toBe(spentBefore + 75);
    expect(rel.loan?.amount).toBe(125);
  });

  it("拒绝非有限或非正还款金额，不污染现金或欠款", () => {
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      const s = fresh();
      const rel = ensureRelationship(s, "npc_zhao_gang");
      rel.loan = { amount: 100, since: gameDay(s.time) };
      const moneyBefore = s.player.money;

      const result = repayLoan(s, rel.npcId, amount);

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("invalid_amount");
      expect(s.player.money).toBe(moneyBefore);
      expect(rel.loan?.amount).toBe(100);
    }
  });
});

describe("v0.99 偶遇 maybeMeetNpc（按排班地点区域）", () => {
  it("住宅区咖啡馆条件满足且命中 → 建关系 +3 初遇好感", () => {
    const s = fresh();
    s.player.stats.charm = 30;
    s.time.day = 3;
    s.time.hour = 8;
    s.locationId = "cafe";
    s.region = "downtown_residential";
    forceMeetChance("npc_lin_xiaoyu", 1); // 林小雨只在住宅区 cafe 排班
    const met = maybeMeetNpc(s, "cafe");
    expect(met).toBe("npc_lin_xiaoyu");
    const rel = findRelationship(s, "npc_lin_xiaoyu")!;
    expect(rel.affinity).toBeGreaterThanOrEqual(5 + 3);
  });

  it("魅力不足不偶遇", () => {
    const s = fresh();
    s.player.stats.charm = 5; // 需 ≥15
    s.locationId = "cafe";
    s.region = "downtown_residential";
    forceMeetChance("npc_lin_xiaoyu", 1);
    const met = maybeMeetNpc(s, "cafe");
    expect(met).toBeNull();
    expect(findRelationship(s, "npc_lin_xiaoyu")).toBeUndefined();
  });

  it("已认识不再偶遇", () => {
    const s = fresh();
    s.player.stats.charm = 30;
    s.locationId = "cafe";
    s.region = "downtown_residential";
    ensureRelationship(s, "npc_lin_xiaoyu");
    forceMeetChance("npc_lin_xiaoyu", 1);
    expect(maybeMeetNpc(s, "cafe")).toBeNull();
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
