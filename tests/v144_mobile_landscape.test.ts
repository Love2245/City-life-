// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  attrWidthRangeFor,
  clampAttrWidth,
  clampMobileZoom,
  clampRenderScale,
  clampUiZoom,
  effectiveMobileZoom,
  isMobileGameMode,
  mobileLayoutMode,
  safeAreaTokens,
  shouldCompactSidebars,
  touchTargetForZoom,
} from "../src/lib/mobileLayout";
import {
  isMobileLayout,
  setAttrWidth,
  setGameMode,
  setRenderScale,
  setZoom,
  uiState,
} from "../src/stores/uiStore.svelte";

function resetUi(): void {
  localStorage.clear();
  setGameMode("pc");
  setZoom(1);
  setRenderScale(1);
  setAttrWidth(250);
}

describe("v1.44 移动端横屏：布局策略的可执行行为", () => {
  beforeEach(resetUi);

  it("PE 与旧 mobile 模式都归一为移动布局，PC 保持桌面布局", () => {
    expect(isMobileGameMode("pe")).toBe(true);
    expect(isMobileGameMode("mobile")).toBe(true);
    expect(isMobileGameMode("pc")).toBe(false);
    expect(mobileLayoutMode("pe")).toBe("mobile");
    expect(mobileLayoutMode("pc")).toBe("pc");

    setGameMode("pe");
    expect(isMobileLayout()).toBe(true);
    expect(document.documentElement.dataset.gameMode).toBe("mobile");
    expect(uiState.zoom).toBe(0.7);
    expect(uiState.showLog).toBe(false);
    setGameMode("pc");
    expect(isMobileLayout()).toBe(false);
    expect(document.documentElement.dataset.gameMode).toBe("pc");
  });

  it("移动端安全区按有效 UI 缩放折算，四边都保留", () => {
    const tokens = safeAreaTokens({ top: 20, right: 62, bottom: 20, left: 62 }, 0.5, 1);
    expect(tokens.top).toBeCloseTo(20 / 0.7);
    expect(tokens.right).toBeCloseTo(62 / 0.7);
    expect(tokens.bottom).toBeCloseTo(20 / 0.7);
    expect(tokens.left).toBeCloseTo(62 / 0.7);
    expect(effectiveMobileZoom(2, 0.25)).toBeCloseTo(1.3);
  });

  it("横屏只有在确实放不下时才收起侧栏", () => {
    expect(shouldCompactSidebars(719, false)).toBe(true);
    expect(shouldCompactSidebars(720, false)).toBe(false);
    expect(shouldCompactSidebars(874, true)).toBe(true);
    expect(shouldCompactSidebars(874, false)).toBe(false);
  });

  it("PC 与 PE 使用各自的属性栏宽度边界", () => {
    expect(attrWidthRangeFor("pc")).toEqual({ min: 140, max: 260 });
    expect(attrWidthRangeFor("pe")).toEqual({ min: 104, max: 260 });
    expect(clampAttrWidth(100, "pe")).toBe(104);
    expect(clampAttrWidth(100, "pc")).toBe(140);
    setGameMode("pe");
    setAttrWidth(100);
    expect(uiState.attrWidth).toBe(104);
  });

  it("缩放与渲染分辨率使用与设置控件一致的边界", () => {
    expect(clampUiZoom(2)).toBe(1.5);
    expect(clampUiZoom(0.2)).toBe(0.5);
    expect(clampMobileZoom(2)).toBe(1.3);
    expect(clampMobileZoom(0.2)).toBe(0.7);
    expect(clampRenderScale(1.01)).toBe(1);
    expect(clampRenderScale(0.2)).toBe(0.5);

    setZoom(1.26);
    expect(uiState.zoom).toBe(1.3);
    setRenderScale(0.63);
    expect(uiState.renderScale).toBe(0.65);
    expect(document.documentElement.style.getPropertyValue("--ui-zoom")).toBe("1.3");
    expect(document.documentElement.style.getPropertyValue("--render-scale")).toBe("0.65");
  });

  it("触控目标在缩放后至少保留 44px 的实际尺寸", () => {
    expect(touchTargetForZoom(0.5)).toBeCloseTo(44 / 0.7);
    expect(touchTargetForZoom(1)).toBe(44);
    expect(touchTargetForZoom(2)).toBe(44);
    expect(touchTargetForZoom(0.5, 0.5)).toBeCloseTo(44 / 0.7);
  });
});
