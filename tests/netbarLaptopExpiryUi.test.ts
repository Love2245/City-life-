// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import LaptopDesktopView from "../src/components/layout/LaptopDesktopView.svelte";
import { createInitialState } from "../src/game/core/state";
import { gameDay } from "../src/game/core/calendar";
import { installLaptopApp, LAPTOP_APPS, LAPTOP_MARKET_APPS } from "../src/game/core/apps";
import { gameState, replaceState } from "../src/stores/gameStore.svelte";
import { uiState } from "../src/stores/uiStore.svelte";

let mounted: { component: ReturnType<typeof mount>; target: HTMLElement } | undefined;

afterEach(() => {
  if (mounted) {
    unmount(mounted.component);
    mounted.target.remove();
    mounted = undefined;
  }
  uiState.modal = null;
  replaceState(createInitialState(1));
});

describe("笔记本任务栏与网吧机时", () => {
  it("笔记本桌面已打开时机时到期会自动下机", () => {
    const state = createInitialState(703);
    state.locationId = "internet_cafe";
    state.flags["netbar_session"] = 1;
    state.flags["netbar_session_until_minute"] = gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
    replaceState(state);
    uiState.modal = "laptop";

    const target = document.createElement("div");
    document.body.appendChild(target);
    mounted = { component: mount(LaptopDesktopView, { target }), target };
    flushSync();

    expect(uiState.modal).toBeNull();
  });

  it("应用只在任务栏显示一个活动入口，桌面关机图标保留原网吧机时", () => {
    const state = createInitialState(704);
    state.locationId = "internet_cafe";
    state.flags["netbar_session"] = 1;
    const until = gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute + 90;
    state.flags["netbar_session_until_minute"] = until;
    for (const app of LAPTOP_MARKET_APPS) installLaptopApp(state, app.id);
    replaceState(state);
    uiState.modal = "laptop";

    const target = document.createElement("div");
    document.body.appendChild(target);
    mounted = { component: mount(LaptopDesktopView, { target }), target };
    flushSync();

    expect(target.querySelectorAll(".laptop-desktop")).toHaveLength(1);
    expect(target.querySelectorAll(".taskbar")).toHaveLength(1);
    target.querySelector<HTMLButtonElement>('.desk-icon[data-app-id="shop"]')!.click();
    flushSync();
    expect(target.querySelectorAll(".tb-pin")).toHaveLength(LAPTOP_APPS.filter(app => app.enabled !== false).length);
    expect(target.querySelectorAll('.tb-pin[data-app-id="shop"]')).toHaveLength(1);
    expect(target.querySelector(".tb-running, .tb-run")).toBeNull();

    const shutdown = target.querySelector<HTMLButtonElement>('.desktop-icons [data-action="shutdown"]')!;
    expect(shutdown.tagName).toBe("BUTTON");
    expect(shutdown.getAttribute("aria-label")).toBe("关机");
    expect(shutdown.tabIndex).toBe(0);
    shutdown.focus();
    expect(document.activeElement).toBe(shutdown);
    shutdown.click();
    flushSync();

    expect(uiState.modal).toBeNull();
    expect(gameState.flags["netbar_session"]).toBe(1);
    expect(gameState.flags["netbar_session_until_minute"]).toBe(until);
  });
});
