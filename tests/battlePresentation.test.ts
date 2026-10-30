import { describe, expect, it } from "vitest";
import { classifyBattleLine } from "../src/game/core/battlePresentation";

describe("战斗日志归属", () => {
  it("敌方名字包含玩家名字时，治疗、格挡和状态伤害仍归给敌方", () => {
    expect(classifyBattleLine("💗 喵喵 使出了「治愈」，恢复 4 点 HP！", "喵", "喵喵"))
      .toMatchObject({ side: "enemy", float: { side: "enemy", text: "+4" } });
    expect(classifyBattleLine("🛡️ 喵喵 使出了「守护」，获得 5 点格挡！", "喵", "喵喵"))
      .toMatchObject({ side: "enemy", anim: "defend" });
    expect(classifyBattleLine("☠️ 喵喵 受到中毒伤害 3 点！", "喵", "喵喵"))
      .toMatchObject({ side: "enemy", float: { side: "enemy" } });
  });

  it("名字为空或双方同名时不猜测状态伤害归属", () => {
    expect(classifyBattleLine("💗 喵喵 使出了「治愈」，恢复 4 点 HP！", "", "喵喵"))
      .toMatchObject({ side: "enemy" });
    expect(classifyBattleLine("☠️ 喵 受到中毒伤害 3 点！", "喵", "喵"))
      .toBeNull();
  });
});
