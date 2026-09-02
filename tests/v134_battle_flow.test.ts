// @vitest-environment jsdom
/**
 * v1.34-hotfix 回归：两个猫咪对决入口的**端到端点击链路**。
 *
 * 原缺陷：手牌出现多张同 id 基础牌时 BattleView 的 keyed each 抛
 * each_key_duplicate，整块战斗界面渲染中断——玩家点了「喵喵娱乐赛 /
 * 猫咪自由锻炼 → 应战」后毫无反应，像被自动跳过。
 *
 * 本文件在完整 GameView 上还原真实点击路径，确保两个入口都能真正开出战斗界面。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import GameView from "../src/views/GameView.svelte";
import { gameState, currentView } from "../src/stores/gameStore.svelte";
import { uiState } from "../src/stores/uiStore.svelte";
import { moveTo } from "../src/game/core/actions";
import { adoptCat } from "../src/game/core/cat";
import { setActivePet } from "../src/game/core/catCare";

function findBtn(root: Element, text: string): HTMLElement | undefined {
  return [...root.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes(text),
  ) as HTMLElement | undefined;
}
function click(el: Element | null | undefined): void {
  if (!el) return;
  (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

/** 准备：游戏视图 + 携带 Lv.10 猫咪 + 有钱 */
function setup(): void {
  currentView.name = "game";
  const s = gameState;
  s.time = { day: 2, month: 8, year: 2026, hour: 14, minute: 0, stayedUp: false };
  s.player.money = 5000;
  s.catBattle = undefined;
  s.flags["cat_battle_pending"] = false;
  s.flags["cat_free_train_day"] = 0;
  s.flags["cat_free_train_count"] = 0;
  uiState.modal = null;
  uiState.encounterPayload = null;
  if (s.pets.length === 0) adoptCat(s, "orange");
  setActivePet(s, s.pets[0].uid);
  s.pets[0].level = 10;
  s.pets[0].injured = undefined;
}

function mountGameView(): { target: HTMLDivElement; comp: Record<string, unknown> } {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const comp = mount(GameView, { target });
  flushSync();
  return { target, comp };
}

beforeEach(setup);

describe("v1.34-hotfix 对决入口端到端", () => {
  it("游乐场「喵喵娱乐赛」：点击后自动弹出战斗界面", () => {
    moveTo(gameState, "suburb");
    moveTo(gameState, "suburban_edge");
    moveTo(gameState, "amusement_park");

    const { target, comp } = mountGameView();
    try {
      const btn = findBtn(target, "喵喵娱乐赛");
      expect(btn, "应渲染出娱乐赛入口").toBeTruthy();
      click(btn);
      flushSync();
      flushSync();

      expect(uiState.modal, "应自动切到战斗界面").toBe("battle");
      expect(gameState.catBattle, "应建立战斗状态").toBeTruthy();
      expect(gameState.catBattle?.casual, "娱乐赛为休闲对决").toBe(true);
      expect(target.innerHTML, "战斗界面应渲染出手牌").toContain("结束回合");
    } finally {
      unmount(comp);
      target.remove();
    }
  });

  it("公园「猫咪自由锻炼」→ 遭遇 → 应战：能开出战斗界面", () => {
    moveTo(gameState, "suburb");
    moveTo(gameState, "suburban_edge");
    moveTo(gameState, "park");

    const { target, comp } = mountGameView();
    try {
      // 1. 展开「猫咪训练」分组
      const group = findBtn(target, "猫咪训练");
      expect(group, "应渲染出猫咪训练分组").toBeTruthy();
      click(group);
      flushSync();

      const trainBtn = findBtn(target, "猫咪自由锻炼");
      expect(trainBtn, "应渲染出自由锻炼入口").toBeTruthy();

      // 2. 反复触发直到抽到「遭遇敌人」分支（50% 概率）
      let opened = false;
      for (let i = 0; i < 12 && !opened; i++) {
        gameState.time.day = 2 + i; // 每次换一天，绕开每日上限
        click(findBtn(target, "猫咪自由锻炼"));
        flushSync();
        flushSync();
        if (uiState.modal === "cat_encounter") opened = true;
        else {
          // 属性提升分支：关掉结算窗继续
          uiState.modal = null;
          uiState.resultPayload = null;
          flushSync();
        }
      }
      expect(opened, "抽若干次应能命中遭遇分支").toBe(true);
      expect(gameState.catBattle, "遭遇时应建立战斗状态").toBeTruthy();

      // 3. 点「应战」→ 进入战斗
      const fightBtn = findBtn(target, "应战");
      expect(fightBtn, "抉择框应有应战按钮").toBeTruthy();
      click(fightBtn);
      flushSync();
      flushSync();

      expect(uiState.modal, "应战应切到战斗界面").toBe("battle");
      expect(target.innerHTML, "战斗界面应渲染出手牌").toContain("结束回合");
    } finally {
      unmount(comp);
      target.remove();
    }
  });

  it("公园「猫咪自由锻炼」→ 遭遇 → 逃跑：清空战斗、无损失", () => {
    moveTo(gameState, "suburb");
    moveTo(gameState, "suburban_edge");
    moveTo(gameState, "park");

    const { target, comp } = mountGameView();
    try {
      click(findBtn(target, "猫咪训练"));
      flushSync();
      let opened = false;
      for (let i = 0; i < 12 && !opened; i++) {
        gameState.time.day = 2 + i;
        click(findBtn(target, "猫咪自由锻炼"));
        flushSync();
        flushSync();
        if (uiState.modal === "cat_encounter") opened = true;
        else {
          uiState.modal = null;
          uiState.resultPayload = null;
          flushSync();
        }
      }
      expect(opened).toBe(true);

      const fleeBtn = findBtn(target, "撒腿就跑");
      expect(fleeBtn, "抉择框应有逃跑按钮").toBeTruthy();
      click(fleeBtn);
      flushSync();

      expect(gameState.catBattle, "逃跑后应清空战斗状态").toBeUndefined();
      expect(uiState.modal, "逃跑后应关闭弹窗").toBeNull();
    } finally {
      unmount(comp);
      target.remove();
    }
  });
});
