import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { adoptCat } from "../src/game/core/cat";
import { startBattle } from "../src/game/core/catBattle";
import {
  createInitialPack,
  ensureCardPack,
  acceptCardOffer,
  specialTrainCard,
  focusTrainCard,
  hospitalWeeklyUsed,
  HOSPITAL_PRICES,
  HOSPITAL_WEEK_LIMIT,
  parseVariantId,
  variantDefId,
} from "../src/game/core/cardPack";
import { getCardDef } from "../src/game/core/catBattle";
import type { GameState } from "../src/game/types";

function freshState(seed: number, money = 10000): GameState {
  const s = createInitialState(seed);
  adoptCat(s, "orange");
  s.player.money = money;
  return s;
}

function packStats(s: GameState): { atk: number; def: number; skill: number; q0: number } {
  const pack = s.pets[0].cardPack ?? [];
  let atk = 0, def = 0, skill = 0, q0 = 0;
  for (const e of pack) {
    const c = getCardDef(e.defId);
    if (c?.type === "attack") atk++;
    else if (c?.type === "defend") def++;
    else skill++;
    if ((c?.quality ?? 0) === 0) q0++;
  }
  return { atk, def, skill, q0 };
}

describe("v1.37 卡包系统", () => {
  it("初始卡包 = 8 进攻 + 8 防守，全部普通品质", () => {
    const s = freshState(1);
    const pack = ensureCardPack(s.pets[0]);
    expect(pack.length).toBe(16);
    const st = packStats(s);
    expect(st.atk).toBe(8);
    expect(st.def).toBe(8);
    expect(st.skill).toBe(0);
    expect(st.q0).toBe(16);
  });

  it("对决抽牌堆由卡包构成（不再是指定基础卡组）", () => {
    const s = freshState(2);
    const r = startBattle(s, "wild_stray");
    expect(r.ok).toBe(true);
    const packIds = new Set(s.pets[0].cardPack!.map((e) => e.defId));
    // 初始 16 张，开战抽了 5 张上手，抽牌堆剩 11
    expect(s.catBattle!.playerDrawPile.length).toBe(16 - s.catBattle!.playerHand.length);
    for (const id of s.catBattle!.playerDrawPile) {
      expect(packIds.has(id), `抽牌堆出现卡包外的卡: ${id}`).toBe(true);
    }
  });

  it("品质变体卡已注册：getCardDef 可取到精良/稀有/史诗变体，数值更强", () => {
    const q1 = getCardDef("scratch_q1");
    const q3 = getCardDef("scratch_q3_b3");
    const base = getCardDef("scratch");
    expect(q1).toBeTruthy();
    expect(q3).toBeTruthy();
    expect(q1!.effect!.power!).toBeGreaterThan(base!.effect!.power!);
    expect(q3!.effect!.power!).toBeGreaterThan(q1!.effect!.power!);
    expect(q3!.quality).toBe(3);
    expect(q3!.baseId).toBe("scratch");
    expect(parseVariantId("scratch_q2_b3")).toEqual({ baseId: "scratch", q: 2, b: 3 });
    expect(parseVariantId("guard")).toEqual({ baseId: "guard", q: 0, b: 0 });
  });

  it("接受刷新后卡牌进入卡包，下次对决进入抽牌堆或手牌", () => {
    const s = freshState(3);
    const r = acceptCardOffer(s, s.pets[0].uid, "pounce_q2");
    expect(r.ok).toBe(true);
    expect(s.pets[0].cardPack!.length).toBe(17);
    const ok = startBattle(s, "wild_stray");
    expect(ok.ok).toBe(true);
    const all = [...s.catBattle!.playerDrawPile, ...s.catBattle!.playerHand];
    expect(all).toContain("pounce_q2");
  });

  it("特殊训练：强化攻卡伤害 +3/级，周定价 200/400/600，每周限 3 次", () => {
    const s = freshState(4);
    const pack = ensureCardPack(s.pets[0]);
    const scratchEntry = pack.find((e) => e.defId === "scratch")!;
    const before = getCardDef("scratch")!.effect!.power!;

    const r1 = specialTrainCard(s, s.pets[0].uid, scratchEntry.uid);
    expect(r1.ok).toBe(true);
    expect(r1.cost).toBe(HOSPITAL_PRICES[0]);
    expect(getCardDef(scratchEntry.defId)!.effect!.power!).toBe(before + 3);
    expect(hospitalWeeklyUsed(s, "special")).toBe(1);

    const r2 = specialTrainCard(s, s.pets[0].uid, scratchEntry.uid);
    expect(r2.ok).toBe(true);
    expect(r2.cost).toBe(HOSPITAL_PRICES[1]);
    expect(hospitalWeeklyUsed(s, "special")).toBe(2);

    const r3 = specialTrainCard(s, s.pets[0].uid, scratchEntry.uid);
    expect(r3.ok).toBe(true);
    expect(r3.cost).toBe(HOSPITAL_PRICES[2]);
    expect(hospitalWeeklyUsed(s, "special")).toBe(3);

    const r4 = specialTrainCard(s, s.pets[0].uid, scratchEntry.uid);
    expect(r4.ok).toBe(false);
    expect(r4.reason).toContain("次数已用完");
  });

  it("专注训练：删卡后卡组精简；保底各留 1 攻 1 防", () => {
    const s = freshState(5);
    // 构造 1 攻 2 防 + 1 技能卡的边缘卡组，验证删除与保底
    s.pets[0].cardPack = [
      { uid: "cp_1", defId: "scratch" },
      { uid: "cp_2", defId: "guard" },
      { uid: "cp_3", defId: "guard" },
      { uid: "cp_4", defId: "meow" },
    ];
    // 删除最后一张进攻卡应被拒绝（保底 1 攻）
    const rDeny = focusTrainCard(s, s.pets[0].uid, "cp_1");
    expect(rDeny.ok).toBe(false);
    expect(rDeny.reason).toContain("至少");
    expect(s.pets[0].cardPack!.length).toBe(4);
    // 删除一张防守卡成功，价格 200，本周计数 +1
    const r = focusTrainCard(s, s.pets[0].uid, "cp_2");
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(200);
    expect(s.pets[0].cardPack!.length).toBe(3);
    expect(hospitalWeeklyUsed(s, "focus")).toBe(1);
    // 现在只剩 1 攻 1 防 1 技能，再删防守卡也应被拒绝
    const rDeny2 = focusTrainCard(s, s.pets[0].uid, "cp_3");
    expect(rDeny2.ok).toBe(false);
    expect(rDeny2.reason).toContain("至少");
  });

  it("周定价常量 200/400/600，周上限为 3", () => {
    expect([...HOSPITAL_PRICES]).toEqual([200, 400, 600]);
    expect(HOSPITAL_WEEK_LIMIT).toBe(3);
    expect(hospitalWeeklyUsed(freshState(6), "focus")).toBe(0);
    expect(variantDefId("scratch", 1, 0)).toBe("scratch_q1");
  });
});
