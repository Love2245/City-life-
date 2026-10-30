// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import MiniGameModal from "../src/components/layout/MiniGameModal.svelte";
import RegionMapView from "../src/components/layout/RegionMapView.svelte";
import CityMapView from "../src/components/layout/CityMapView.svelte";
import { createInitialState } from "../src/game/core/state";
import { getMiniGameConfig } from "../src/game/core/minigame";
import { replaceState, gameState } from "../src/stores/gameStore.svelte";
import { uiState } from "../src/stores/uiStore.svelte";
import * as audio from "../src/lib/audio";

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

beforeAll(() => {
  if (!Element.prototype.animate) {
    Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
  }
  if (!globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)) as any;
    globalThis.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as any;
  }
});

function attachTarget(): HTMLElement {
  const target = document.createElement("div");
  document.body.appendChild(target);
  return target;
}

function track(component: ReturnType<typeof mount>, target: HTMLElement): void {
  mounted.push({ component, target });
  flushSync();
}

afterEach(() => {
  for (const item of mounted.splice(0)) {
    unmount(item.component);
    item.target.remove();
  }
  uiState.modal = null;
  uiState.minigamePayload = null;
  replaceState(createInitialState(1));
  vi.restoreAllMocks();
});

describe("工作小游戏退出提示", () => {
  it("没有真实工作班次时，不显示旧版平均表现工资提示", () => {
    const state = createInitialState(701);
    state.career.jobId = "job_school_tutor";
    state.career.kind = "weekly";
    replaceState(state);
    uiState.minigamePayload = {
      key: "job_school_tutor",
      title: "学校辅导答题",
      icon: "🎓",
      config: getMiniGameConfig("job_school_tutor")!,
      todayPay: 90,
    };
    uiState.modal = "minigame";
    const target = attachTarget();
    track(mount(MiniGameModal, { target }), target);

    const warning = target.querySelector<HTMLElement>(".mg-score-warning");
    const close = target.querySelector<HTMLButtonElement>(".mg-close");
    expect(warning).toBeNull();
    expect(close?.title).toContain("按 0 分结算");
    expect(close?.title).not.toContain("跳过");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    flushSync();

    expect(gameState.career.miniGameScoreCount ?? 0).toBe(0);
  });

  it("无班次的旧载荷关闭不会累计正式工表现工资", () => {
    const state = createInitialState(705);
    state.career.jobId = "job_school_tutor";
    state.career.kind = "weekly";
    replaceState(state);
    uiState.minigamePayload = {
      key: "job_school_tutor",
      title: "学校辅导答题",
      icon: "🎓",
      config: getMiniGameConfig("job_school_tutor")!,
      todayPay: 90,
    };
    uiState.modal = "minigame";
    const target = attachTarget();
    track(mount(MiniGameModal, { target }), target);

    target.querySelector<HTMLButtonElement>(".mg-close")!.click();
    flushSync();

    expect(gameState.career.miniGameScoreCount ?? 0).toBe(0);
  });

  it("非当前在职岗位不显示本期工资警告，但结束按钮仍说明按 0 分结算", () => {
    replaceState(createInitialState(702));
    uiState.minigamePayload = {
      key: "job_school_tutor",
      title: "学校辅导答题",
      icon: "🎓",
      config: getMiniGameConfig("job_school_tutor")!,
      todayPay: 90,
    };
    uiState.modal = "minigame";
    const target = attachTarget();
    track(mount(MiniGameModal, { target }), target);

    expect(target.querySelector(".mg-score-warning")).toBeNull();
    expect(target.querySelector<HTMLButtonElement>(".mg-close")?.getAttribute("aria-label")).toContain("按 0 分结算");
  });
});

describe("地图导航音效和打烊说明", () => {
  it("区域地图导航只交给上层移动处理播放音效", () => {
    replaceState(createInitialState(703));
    const select = vi.fn();
    const sound = vi.spyOn(audio, "playSound");
    const target = attachTarget();
    track(mount(RegionMapView, { target, props: { parentRegionId: "downtown", onSelect: select } }), target);

    const pin = [...target.querySelectorAll<HTMLButtonElement>(".map-pin")].find((button) => !button.disabled);
    expect(pin).toBeDefined();
    pin!.click();
    flushSync();

    expect(select).toHaveBeenCalledTimes(1);
    expect(sound).not.toHaveBeenCalled();
    const source = readFileSync(resolve(process.cwd(), "src/components/layout/RegionMapView.svelte"), "utf8");
    expect(source).not.toContain('playSound("walk")');
  });

  it("地点地图在标牌上显示打烊原因，成功导航不在地图层重复播放音效", () => {
    replaceState(createInitialState(704));
    const select = vi.fn();
    const sound = vi.spyOn(audio, "playSound");
    const target = attachTarget();
    const reason = "今天已打烊，明早 8:00 开门";
    track(mount(CityMapView, {
      target,
      props: {
        regionId: "downtown_commercial",
        items: [
          { id: "housing_agency", name: "房屋中介", icon: "🏛️", locked: false, closed: false, gradient: "", travelHours: 0 },
          { id: "cafe", name: "咖啡厅", icon: "☕", locked: false, closed: true, closedText: reason, gradient: "", travelHours: 0 },
        ],
        onSelect: select,
      },
    }), target);

    const closedPin = [...target.querySelectorAll<HTMLButtonElement>(".map-pin")]
      .find((button) => button.textContent?.includes("咖啡厅"));
    expect(closedPin?.disabled).toBe(true);
    expect(closedPin?.querySelector(".pin-disabled-reason")?.textContent).toBe(reason);

    const openPin = [...target.querySelectorAll<HTMLButtonElement>(".map-pin")]
      .find((button) => button.textContent?.includes("房屋中介"));
    expect(openPin).toBeDefined();
    openPin!.click();
    flushSync();

    expect(select).toHaveBeenCalledWith("housing_agency");
    expect(sound).not.toHaveBeenCalled();
    const sceneSource = readFileSync(resolve(process.cwd(), "src/components/layout/ScenePanel.svelte"), "utf8");
    for (const fnName of ["goNow", "goRegionNow"]) {
      const start = sceneSource.indexOf(`function ${fnName}(`);
      const next = sceneSource.indexOf("\n  function ", start + 1);
      const body = sceneSource.slice(start, next < 0 ? undefined : next);
      expect(body, `${fnName} 的普通地图导航不应播放交通录音`).not.toMatch(/playInteractionSound|journeySound/);
    }
  });
});
