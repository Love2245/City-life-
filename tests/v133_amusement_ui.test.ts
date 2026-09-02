// @vitest-environment jsdom
/**
 * v1.33-hotfix 渲染层回归：进入游乐场后场景面板必须完整渲染。
 * 缺陷原型：ScenePanel 在计算行动收益标签时抛 TypeError，整个面板渲染为空，
 * 只有背景（独立组件）切换成功，看起来就像「游乐场进不去」。
 */
import { describe, it, expect } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import ScenePanel from "../src/components/layout/ScenePanel.svelte";
import { gameState } from "../src/stores/gameStore.svelte";
import { moveTo } from "../src/game/core/actions";

describe("v1.33-hotfix 场景面板渲染", () => {
  it("进入游乐场后面板渲染出地点卡与全部六个设施", () => {
    gameState.time.hour = 12;
    gameState.player.money = 5000;
    moveTo(gameState, "suburb");
    moveTo(gameState, "suburban_edge");
    const r = moveTo(gameState, "amusement_park");
    expect(r.ok).toBe(true);

    const target = document.createElement("div");
    document.body.appendChild(target);
    let html = "";
    try {
      const comp = mount(ScenePanel, { target });
      flushSync();
      html = target.innerHTML;
      unmount(comp);
    } finally {
      target.remove();
    }

    expect(html.length, "场景面板不应渲染为空").toBeGreaterThan(0);
    expect(html, "应渲染出地点名").toContain("游乐场");
    expect(html, "应渲染出出门按钮").toContain("出门");
    for (const name of ["冰淇淋店", "电影院", "保龄球馆", "飞镖气球", "套圈", "喵喵对决赛赛场", "喵喵娱乐赛"]) {
      expect(html, `行动卡「${name}」未渲染`).toContain(name);
    }
  });
});
