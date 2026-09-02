import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { adoptCat } from "../src/game/core/cat";
import {
  startBattle,
  randomCasualOpponent,
  maybeTriggerWildBattle,
} from "../src/game/core/catBattle";
import type { GameState } from "../src/game/types";

function freshState(seed: number): GameState {
  const s = createInitialState(seed);
  adoptCat(s, "orange"); // 1 级、自动携带
  return s;
}

describe("v1.36 喵喵对决随机性修复", () => {
  it("每场对决的抽牌堆顺序各不相同（抽卡不再是固定顺序）", () => {
    const orders = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const s = freshState(1000 + i);
      const r = startBattle(s, "wild_stray");
      expect(r.ok, `第 ${i} 场应成功发起对决: ${r.reason ?? ""}`).toBe(true);
      orders.add(s.catBattle!.playerDrawPile.join(","));
    }
    expect(orders.size, "30 场独立对决应产生多种抽牌顺序").toBeGreaterThan(1);
  });

  it("休闲对手从候选池随机抽取（不应每次都是同一只）", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const s = freshState(2000 + i);
      const opp = randomCasualOpponent(s, "normal");
      expect(opp, "应抽到休闲对手").toBeTruthy();
      seen.add(opp!.id);
    }
    expect(seen.size, "休闲对手应随机抽取而非固定").toBeGreaterThan(1);
  });

  it("野生遭遇在不同存档下抽到不同敌人（不再是固定敌人）", () => {
    const seen = new Set<string>();
    let triggered = 0;
    for (let i = 0; i < 200 && seen.size < 6; i++) {
      const s = freshState(3000 + i * 7);
      s.locationId = "street"; // 离开家才会触发野生遭遇
      if (maybeTriggerWildBattle(s, 1)) {
        triggered++;
        seen.add(s.catBattle!.opponentId);
      }
    }
    expect(triggered, "高触发概率下应触发若干次野生遭遇").toBeGreaterThan(1);
    expect(seen.size, "野生遭遇的敌人应随机抽取而非固定").toBeGreaterThan(1);
  });
});
