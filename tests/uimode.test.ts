import { describe, it, expect } from "vitest";
import { initZoom, setGameMode, setZoom, setAttrWidth, uiState } from "../src/stores/uiStore.svelte";

describe("v1.11 游戏模式与 UI 缩放", () => {
  it("gameMode 默认 pc，setGameMode 切换并持久化（含 v1.3-beta2 tablet）", () => {
    expect(uiState.gameMode).toBe("pc");
    setGameMode("mobile");
    expect(uiState.gameMode).toBe("mobile");
    setGameMode("tablet");
    expect(uiState.gameMode).toBe("tablet");
    setGameMode("pc");
    expect(uiState.gameMode).toBe("pc");
  });

  it("setZoom 往返且 clamp 0.5-1.5", () => {
    setZoom(1.2);
    expect(uiState.zoom).toBe(1.2);
    setZoom(2.0);
    expect(uiState.zoom).toBe(1.5);
    setZoom(0.2);
    expect(uiState.zoom).toBe(0.5);
    setZoom(1);
  });

  it("initZoom 从 localStorage 恢复（无 document 时安全）", () => {
    // node 环境无 document/localStorage，initZoom 不应抛错
    expect(() => initZoom()).not.toThrow();
  });
});

describe("v1.12 左侧栏宽度", () => {
  it("PC 模式 setAttrWidth clamp 140-260", () => {
    setGameMode("pc");
    setAttrWidth(200);
    expect(uiState.attrWidth).toBe(200);
    setAttrWidth(300);
    expect(uiState.attrWidth).toBe(260);
    setAttrWidth(100);
    expect(uiState.attrWidth).toBe(140);
  });

  it("手游模式 setAttrWidth clamp 30-80（v1.21-beta4-hotfix 收窄左栏，让出游玩画面）", () => {
    setGameMode("mobile");
    setAttrWidth(100);
    expect(uiState.attrWidth).toBe(80);
    setAttrWidth(300);
    expect(uiState.attrWidth).toBe(80);
    setAttrWidth(50);
    expect(uiState.attrWidth).toBe(50);
    setGameMode("pc");
  });

  it("setGameMode 切手游时 attrWidth>80 自动 clamp 到 80", () => {
    setGameMode("pc");
    setAttrWidth(260);
    expect(uiState.attrWidth).toBe(260);
    setGameMode("mobile");
    expect(uiState.attrWidth).toBe(80);
    setGameMode("pc");
  });

  it("v1.21-beta4：任何 gameMode 下 attrWidth 都应落在合法区间内（防御性回归）", () => {
    setGameMode("pc");
    setAttrWidth(99);
    expect(uiState.attrWidth).toBeGreaterThanOrEqual(140);
    expect(uiState.attrWidth).toBeLessThanOrEqual(260);
    setGameMode("mobile");
    setAttrWidth(500);
    expect(uiState.attrWidth).toBeGreaterThanOrEqual(30);
    expect(uiState.attrWidth).toBeLessThanOrEqual(80);
    setGameMode("pc");
  });

  it("v1.3-beta2 平板模式 setAttrWidth clamp 60-140", () => {
    setGameMode("tablet");
    setAttrWidth(96);
    expect(uiState.attrWidth).toBe(96);
    setAttrWidth(300);
    expect(uiState.attrWidth).toBe(140);
    setAttrWidth(10);
    expect(uiState.attrWidth).toBe(60);
    setGameMode("pc");
  });

  it("v1.3-beta2 setGameMode 切平板时 attrWidth 超界自动 clamp", () => {
    setGameMode("pc");
    setAttrWidth(260);
    expect(uiState.attrWidth).toBe(260);
    setGameMode("tablet");
    expect(uiState.attrWidth).toBe(140);
    setGameMode("pc");
  });
});
