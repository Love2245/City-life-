import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { adoptCat } from "../src/game/core/cat";
import { startBattle, endPlayerTurn, getBossDef } from "../src/game/core/catBattle";

/** 模拟一只"完全被动"的猫：只结束回合、不出任何牌，用来检验 Boss/强敌是否够硬。 */
function passiveFightToEnd(state: GameState): void {
  let guard = 0;
  while (state.catBattle && !state.catBattle.finished && guard < 40) {
    endPlayerTurn(state);
    guard++;
  }
}

describe("v1.36 强敌/Boss 强度与敌方AI", () => {
  it("一级初始猫（被动）对决顶级对手 t3_king 必败（一级猫不再能单挑强敌）", () => {
    const s = createInitialState(42);
    adoptCat(s, "orange"); // 一级初始猫
    const r = startBattle(s, "t3_king");
    expect(r.ok, `应能发起 t3_king 对决: ${r.reason ?? ""}`).toBe(true);
    passiveFightToEnd(s);
    expect(s.catBattle!.finished, "对决应当能结束").toBe(true);
    expect(s.catBattle!.won, "一级初始猫应打不过顶级对手").toBe(false);
  });

  it("最终Boss 携带非攻防的控制技（web_trap），AI 有减益手段可用", () => {
    const boss = getBossDef();
    expect(boss.skills.includes("web_trap"), "Boss 应携带 web_trap 控制技以丰富AI行为").toBe(true);
    // Boss 基础数值应显著高于一级猫（橘猫 hp80/atk12），构成真正的挑战
    expect(boss.attrs.hp).toBeGreaterThan(200);
    expect(boss.attrs.atk).toBeGreaterThan(30);
  });
});
