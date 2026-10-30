// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  mobileMapLayout,
  shouldCompactSidebars,
} from "../src/lib/mobileLayout";
import { setGameMode, setZoom, uiState } from "../src/stores/uiStore.svelte";

describe("手游地图布局行为", () => {
  beforeEach(() => {
    localStorage.clear();
    setGameMode("pc");
    setZoom(1);
  });

  it("主地图没有上级区域时不人为预留二级导航空间", () => {
    expect(mobileMapLayout({ mobile: true, locationId: "map", hasParentRegion: false })).toEqual({
      integrated: false,
      showBreadcrumbs: false,
      showWaitBar: false,
    });
  });

  it("进入二级地图后，路径导航与中央地图合并显示", () => {
    expect(mobileMapLayout({ mobile: true, locationId: "map", hasParentRegion: true })).toEqual({
      integrated: true,
      showBreadcrumbs: true,
      showWaitBar: false,
    });
  });

  it("端游保留独立等待栏，移动端把等待能力交给侧栏", () => {
    expect(mobileMapLayout({ mobile: false, locationId: "map", hasParentRegion: true })).toEqual({
      integrated: false,
      showBreadcrumbs: false,
      showWaitBar: true,
    });
  });

  it("非地图地点不会误进入地图合并态", () => {
    expect(mobileMapLayout({ mobile: true, locationId: "home", hasParentRegion: true }).integrated).toBe(false);
  });

  it("iPhone 横屏宽度保持三栏，窄屏或竖屏才折叠", () => {
    setGameMode("pe");
    expect(uiState.gameMode).toBe("pe");
    expect(shouldCompactSidebars(874, false)).toBe(false);
    expect(shouldCompactSidebars(719, false)).toBe(true);
    expect(shouldCompactSidebars(874, true)).toBe(true);
  });

  it("布局策略是纯输入函数，不依赖测试时的源码排版", () => {
    const first = mobileMapLayout({ mobile: true, locationId: "map", hasParentRegion: true });
    const second = mobileMapLayout({ mobile: true, locationId: "map", hasParentRegion: true });
    expect(second).toEqual(first);
  });

  it("移动状态栏略微加宽，场景导航保持深色半透明而非白底", () => {
    const css = readFileSync(resolve("src/styles/mobile.css"), "utf8");
    expect(css).toContain("--m-left-w: min(calc(var(--ui-attr-w, 144px) + 12px), 28%);");
    expect(css).toContain("left: calc(min(calc(var(--ui-attr-w, 144px) + 12px), 28%) - 6px);");
    expect(css).toContain("background: rgba(8, 16, 28, 0.58);");
    expect(css).toContain("border: 1px solid rgba(255, 255, 255, 0.1);");
  });
});
