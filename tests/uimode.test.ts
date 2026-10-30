import { describe, it, expect } from "vitest";
import { initZoom, isMobileLayout, setGameMode, setZoom, setAttrWidth, uiState } from "../src/stores/uiStore.svelte";

describe("v1.44.2 PC/PE 模式预设与 UI 缩放", () => {
  it("gameMode 默认 pc；setGameMode 支持 pc/pe", () => {
    expect(uiState.gameMode).toBe("pc");
    setGameMode("pe");
    expect(uiState.gameMode).toBe("pe");
    setGameMode("pc");
    expect(uiState.gameMode).toBe("pc");
  });

  it("PE 默认使用 70% UI 缩放，PC 使用 100%；日志按设备布局显示", () => {
    setGameMode("pe");
    expect(uiState.zoom).toBe(0.7);
    expect(uiState.showLog).toBe(false);
    setGameMode("pc");
    expect(uiState.zoom).toBe(1);
    expect(uiState.showLog).toBe(true);
  });

  it("切换预设后仍可手动微调缩放", () => {
    setGameMode("pe");
    setZoom(0.7);
    expect(uiState.zoom).toBe(0.7);
    setGameMode("pc");
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

  it("PE 模式套用移动端左栏区间 104-260（v1.44.3：PE 即移动端布局）", () => {
    // 旧断言写的是「PE 沿用端游区间 140-260（旧手游布局已下线）」。那条假设正是
    // 本次 bug 的来源：PE 名义上是手机预设，却因为 data-game-mode 写成 "pe"
    // 而拿不到 mobile.css 的任何规则。现在 PE 与旧手游模式共用同一布局判据。
    setGameMode("pe");
    expect(isMobileLayout()).toBe(true);
    setAttrWidth(100);
    expect(uiState.attrWidth).toBe(104);
    setAttrWidth(200);
    expect(uiState.attrWidth).toBe(200);
    setAttrWidth(50);
    expect(uiState.attrWidth).toBe(104);
    setGameMode("pc");
    expect(isMobileLayout()).toBe(false);
  });

  it("PE 预设把 data-game-mode 归一化为 mobile（mobile.css 全量规则都挂在这个属性上）", () => {
    // 行为级回归锁：旧实现直接写 uiState.gameMode（取值 "pe"），而 mobile.css 的
    // 400+ 条规则全部以 [data-game-mode="mobile"] 为前缀，于是小游戏等比缩小、
    // 喵喵对决安全区等规则静默失效。此断言在旧实现下必然失败。
    const style = { setProperty: (_k: string, _v: string) => {} };
    const documentElement: { style: typeof style; dataset: Record<string, string> } = {
      style,
      dataset: {},
    };
    const holder = globalThis as { document?: unknown };
    const original = holder.document;
    holder.document = { documentElement };
    try {
      setGameMode("pe");
      expect(documentElement.dataset.gameMode).toBe("mobile");
      setGameMode("pc");
      expect(documentElement.dataset.gameMode).toBe("pc");
    } finally {
      holder.document = original;
    }
  });

  it("切换预设时保留合理的侧栏宽度", () => {
    setGameMode("pc");
    setAttrWidth(260);
    expect(uiState.attrWidth).toBe(260);
    setGameMode("pe");
    expect(uiState.attrWidth).toBe(260);
    setGameMode("pc");
  });
});
