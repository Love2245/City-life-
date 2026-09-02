// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { mount, unmount } from "svelte";
import App from "../src/App.svelte";
import BackgroundView from "../src/views/BackgroundView.svelte";
import { backToMenu, currentView } from "../src/stores/gameStore.svelte";

beforeAll(() => {
  // jsdom 缺失的浏览器 API 兜底，避免环境噪音干扰真实崩溃定位
  if (!Element.prototype.animate) {
    Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  }
  if (!window.matchMedia) {
    (window as any).matchMedia = (q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    });
  }
  if (!(globalThis as any).ResizeObserver) {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});

/** 每个用例从干净的菜单态开始（gameState 是模块级单例，需重置） */
beforeEach(() => {
  backToMenu();
});

const tick = () => new Promise((r) => setTimeout(r, 50));

describe("进入游戏不崩溃 (v1.215 回归)", () => {
  it("普通模式：开始新生活 进入角色创建界面", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const app = mount(App, { target });
    await tick();
    const find = (t: string): HTMLButtonElement | null => {
      let f: HTMLButtonElement | null = null;
      target.querySelectorAll("button").forEach((b) => {
        if ((b.textContent ?? "").includes(t)) f = b as HTMLButtonElement;
      });
      return f;
    };
    find("开始新生活")!.click();
    await tick();
    expect(currentView.name).toBe("background");
    unmount(app);
    // 客户端挂载 BackgroundView（含 onMount），确认进入角色创建页不崩溃
    const t2 = document.createElement("div");
    document.body.appendChild(t2);
    const bg = mount(BackgroundView, { target: t2 });
    await tick();
    expect(t2.querySelectorAll("button").length).toBeGreaterThan(0);
    unmount(bg);
  });
});
