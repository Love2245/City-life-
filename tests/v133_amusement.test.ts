/**
 * v1.33-hotfix 回归：游乐场无法进入。
 *
 * 原缺陷：actions.json 的 amusement_tournament 缺少 effects 字段，
 * ScenePanel 的 actionTags() 把 undefined 传给 effectTags()，读 effects.money 抛 TypeError，
 * 整个场景面板渲染中断——表现为「背景切到游乐场，但地点内容一片空白，进不去」。
 *
 * 本文件锁死数据层 + 逻辑层；渲染层见 v133_amusement_ui.test.ts。
 */
import { describe, it, expect } from "vitest";
import { gameState } from "../src/stores/gameStore.svelte";
import { moveTo, actionsOf, getAction, performAction, effectsOf, actionTagsOf, effectTagsOf } from "../src/game/core/actions";
import { createInitialState } from "../src/game/core/state";
import { adoptCat } from "../src/game/core/cat";
import { setActivePet } from "../src/game/core/catCare";
import { signupTournament } from "../src/game/core/tournament";

/** 把状态推进到游乐场（郊区 → 城市边缘 → 游乐场） */
function gotoAmusementPark(): void {
  gameState.time.hour = 12;
  gameState.player.money = 5000;
  moveTo(gameState, "suburb");
  moveTo(gameState, "suburban_edge");
  const r = moveTo(gameState, "amusement_park");
  expect(r.ok, "应当能进入游乐场").toBe(true);
}

describe("v1.33-hotfix 游乐场进入", () => {
  it("能真正走进游乐场，且设施齐全（含 v1.34 娱乐赛）", () => {
    gotoAmusementPark();
    expect(gameState.locationId).toBe("amusement_park");
    const ids = actionsOf("amusement_park").map((a) => a.id);
    for (const id of [
      "amusement_icecream",
      "amusement_cinema",
      "amusement_bowling",
      "amusement_dart",
      "amusement_ringtoss",
      "amusement_tournament",
      "amusement_fun_match",
    ]) {
      expect(ids, `游乐场缺少设施 ${id}`).toContain(id);
    }
  });

  it("v1.34 冰淇淋店：改为 buy_food（当场吃 / 打包带走），不再进小游戏", () => {
    const ice = getAction("amusement_icecream");
    expect(ice?.handler).toBe("buy_food");
    expect(ice?.itemId).toBe("icecream_sundae");
  });

  it("游乐场全部行动的收益标签都能算出来（无 effects 也不抛错）", () => {
    gotoAmusementPark();
    for (const a of actionsOf("amusement_park")) {
      expect(() => actionTagsOf(a, gameState), `行动 ${a.id} 收益标签计算抛错`).not.toThrow();
    }
  });

  it("赛场入口带 tournament_arena handler（点击进对决而非空结算）", () => {
    const arena = getAction("amusement_tournament");
    expect(arena, "缺少 amusement_tournament 行动").toBeTruthy();
    expect(arena?.handler).toBe("tournament_arena");
    expect(arena?.effects).toBeTypeOf("object");
  });

  it("effectsOf / actionTagsOf / effectTagsOf 对缺失数据一律兜底不抛错", () => {
    expect(effectsOf(undefined)).toEqual({});
    expect(effectsOf({ id: "x" } as never)).toEqual({});
    expect(effectTagsOf(undefined)).toEqual([]);
    expect(actionTagsOf({ id: "_probe", duration: 0 } as never, gameState)).toEqual([]);
  });

  it("带 effects 的行动标签照常输出（兜底不能把正常标签吃掉）", () => {
    const buy = getAction("amusement_icecream");
    const tags = actionTagsOf(buy!, gameState);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.some((t) => t.text.includes("💰"))).toBe(true);
  });

  it("点击赛场：未报名给出明确提示（不再是空结算）", () => {
    const s = createInitialState(7);
    s.time.hour = 14;
    s.player.money = 5000;
    moveTo(s, "suburb");
    moveTo(s, "suburban_edge");
    moveTo(s, "amusement_park");
    adoptCat(s, "orange");
    setActivePet(s, s.pets[0].uid);
    const r = performAction(s, "amusement_tournament");
    expect(r.ok, "未报名时应明确拒绝并给出原因").toBe(false);
    expect(r.reason ?? "").toContain("报名");
  });

  it("点击赛场：已报名则开赛并置起战斗标记（handler 生效）", () => {
    const s = createInitialState(7);
    s.time = { day: 2, month: 8, year: 2026, hour: 14, minute: 0, stayedUp: false };
    s.player.money = 5000;
    moveTo(s, "suburb");
    moveTo(s, "suburban_edge");
    moveTo(s, "amusement_park");
    adoptCat(s, "orange");
    setActivePet(s, s.pets[0].uid);
    s.pets[0].level = 20;
    signupTournament(s, "tournament_primary");
    const r = performAction(s, "amusement_tournament");
    expect(r.ok, `进赛场应成功：${r.reason ?? ""}`).toBe(true);
    expect(s.flags["cat_battle_pending"], "应置起待弹战斗标记").toBe(true);
    expect(r.result?.verdict ?? "").toContain("开战");
  });
});
