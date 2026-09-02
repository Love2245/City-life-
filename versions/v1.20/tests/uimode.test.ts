import { describe, it, expect } from "vitest";
import { initZoom, setGameMode, setZoom, setAttrWidth, uiState } from "../src/stores/uiStore.svelte";

describe("v1.11 游戏模式与 UI 缩放", () => {
  it("gameMode 默认 pc，setGameMode 切换并持久化", () => {
    expect(uiState.gameMode).toBe("pc");
    setGameMode("mobile");
    expect(uiState.gameMode).toBe("mobile");
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

  it("手游模式 setAttrWidth clamp 120-220", () => {
    setGameMode("mobile");
    setAttrWidth(200);
    expect(uiState.attrWidth).toBe(200);
    setAttrWidth(300);
    expect(uiState.attrWidth).toBe(220);
    setAttrWidth(50);
    expect(uiState.attrWidth).toBe(120);
    setGameMode("pc");
  });

  it("setGameMode 切手游时 attrWidth>220 自动 clamp 到 220", () => {
    setGameMode("pc");
    setAttrWidth(260);
    expect(uiState.attrWidth).toBe(260);
    setGameMode("mobile");
    expect(uiState.attrWidth).toBe(220);
    setGameMode("pc");
  });
});
