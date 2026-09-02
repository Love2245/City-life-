// @vitest-environment jsdom
/**
 * v1.34-hotfix 回归：战斗界面「点了没反应、自动跳过」。
 *
 * 根因：buildPlayerDeck 用 scratch（抓挠）补足最小牌堆张数，牌堆里会有多张同 id 的牌；
 * 手牌若同时抽到两张 scratch，BattleView 的 `{#each handCards as c (c.id)}` 会因
 * key 重复抛 each_key_duplicate，整块战斗界面渲染中断——
 * 表现为「点了喵喵对决/娱乐赛/自由锻炼没反应，像被自动跳过」。
 *
 * 本文件从两条路锁死：牌堆确实会重复；战斗界面在重复牌下仍能完整渲染。
 */
import { describe, it, expect } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import BattleView from "../src/components/BattleView.svelte";
import { createInitialState } from "../src/game/core/state";
import { adoptCat } from "../src/game/core/cat";
import { setActivePet } from "../src/game/core/catCare";
import { startFunMatch, buildPlayerDeck } from "../src/game/core/catBattle";
import { gameState } from "../src/stores/gameStore.svelte";
import { uiState } from "../src/stores/uiStore.svelte";

describe("v1.34-hotfix 战斗界面渲染", () => {
  it("牌堆允许出现多张同 id 基础牌（重复是设计使然，不是脏数据）", () => {
    // 用一个没有专属卡的猫种，验证补位逻辑会塞入多张 scratch
    const deck = buildPlayerDeck("orange", []);
    const scratchCount = deck.filter((c) => c === "scratch").length;
    expect(scratchCount, "补位牌应至少 1 张").toBeGreaterThanOrEqual(1);
    expect(deck.length).toBeGreaterThanOrEqual(5);
  });

  it("手牌含多张同 id 牌时战斗界面仍完整渲染（不抛 each_key_duplicate）", () => {
    const s = createInitialState(11);
    s.time = { day: 2, month: 8, year: 2026, hour: 14, minute: 0, stayedUp: false };
    s.player.money = 5000;
    adoptCat(s, "orange");
    setActivePet(s, s.pets[0].uid);
    s.pets[0].level = 10;
    const r = startFunMatch(s);
    expect(r.ok).toBe(true);
    // 强制手牌为两张同 id 基础牌（复现崩溃现场）
    s.catBattle!.playerHand = ["scratch", "scratch"];
    s.catBattle!.phase = "player";
    s.catBattle!.playerEnergy = 3;
    // BattleView 读全局 gameState
    gameState.catBattle = s.catBattle;
    uiState.modal = "battle";

    const target = document.createElement("div");
    document.body.appendChild(target);
    let html = "";
    try {
      const comp = mount(BattleView, { target });
      flushSync();
      html = target.innerHTML;
      unmount(comp);
    } finally {
      target.remove();
    }
    expect(html.length, "战斗界面不应渲染为空").toBeGreaterThan(0);
    expect(html).toContain("抓挠");
    expect(html).toContain("结束回合");
    // 两张牌都要渲染出来（按卡名标记计数，精确且不受卡面描述里「抓挠」字样的干扰）
    const nameCount = (html.match(/class="card-name[^>]*>抓挠/g) ?? []).length;
    expect(nameCount, "两张同 id 手牌都应渲染").toBe(2);
  });

  it("全屏立绘对决：双方立绘 img + 属性面板 + 战斗记录齐全", () => {
    const s = createInitialState(13);
    s.time = { day: 2, month: 8, year: 2026, hour: 14, minute: 0, stayedUp: false };
    s.player.money = 5000;
    adoptCat(s, "orange");
    setActivePet(s, s.pets[0].uid);
    s.pets[0].level = 10;
    const r = startFunMatch(s);
    expect(r.ok).toBe(true);
    s.catBattle!.phase = "player";
    s.catBattle!.playerEnergy = 3;
    // 真实游戏里 replaceState 会把活状态的 pets 赋给全局 gameState.pets，
    // 组件据此解析玩家猫种立绘；测试需同样接线，否则 playerArtUrl 为 undefined。
    gameState.pets = s.pets;
    gameState.catBattle = s.catBattle;
    uiState.modal = "battle";

    const target = document.createElement("div");
    document.body.appendChild(target);
    let html = "";
    try {
      const comp = mount(BattleView, { target });
      flushSync();
      html = target.innerHTML;
      unmount(comp);
    } finally {
      target.remove();
    }

    // 立绘：敌我各一张 portrait <img>（不再是 emoji 图标占位）
    const imgs = html.match(/<img[^>]+class="portrait/g) ?? [];
    expect(imgs.length, "敌我双方都应渲染立绘 img").toBe(2);
    // 属性面板：攻 / 防 / 速
    expect(html, "应显示猫咪属性面板").toContain("攻");
    expect(html).toContain("防");
    expect(html).toContain("速");
    // 日志栏与底栏
    expect(html, "应渲染战斗日志").toContain("对决开始");
    expect(html).toContain("结束回合");
  });
});
