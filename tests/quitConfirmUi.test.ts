// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import MainMenuView from "../src/views/MainMenuView.svelte";
import ConfirmDialog from "../src/components/layout/ConfirmDialog.svelte";
import { createInitialState } from "../src/game/core/state";
import { currentView, navigation, replaceState } from "../src/stores/gameStore.svelte";
import { uiState, dismissToast } from "../src/stores/uiStore.svelte";
import { desktopWindowState, initializeDesktopWindow } from "../src/lib/desktopWindow.svelte";

const closeMock = vi.fn(() => Promise.resolve());
const destroyMock = vi.fn(() => Promise.resolve());
const saveBeforeCloseMock = vi.fn(() => Promise.resolve());
let closeHandler: ((event: { preventDefault: () => void }) => Promise<void>) | undefined;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve("windows")) }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: closeMock,
    destroy: destroyMock,
    unminimize: vi.fn(() => Promise.resolve()),
    setFocus: vi.fn(() => Promise.resolve()),
    setFullscreen: vi.fn(() => Promise.resolve()),
    isFullscreen: vi.fn(() => Promise.resolve(false)),
    onCloseRequested: (handler: (event: { preventDefault: () => void }) => Promise<void>) => {
      closeHandler = handler;
      return Promise.resolve(() => {});
    },
    setMinSize: vi.fn(() => Promise.resolve()),
    innerSize: vi.fn(() => Promise.resolve({ width: 800, height: 600 })),
    setSize: vi.fn(() => Promise.resolve()),
    center: vi.fn(() => Promise.resolve()),
  }),
  currentMonitor: vi.fn(() => Promise.resolve(null)),
  LogicalSize: class {},
}));

let components: ReturnType<typeof mount>[] = [];
let cleanup: (() => void) | undefined;
let target: HTMLDivElement;

beforeEach(async () => {
  closeMock.mockClear(); destroyMock.mockClear(); saveBeforeCloseMock.mockClear(); closeHandler = undefined;
  // jsdom 下没有本地服务，ready 上报的 fetch 必须被短路，否则相对 URL 会同步抛错。
  globalThis.fetch = vi.fn(() => Promise.reject(new Error("test: no server"))) as unknown as typeof fetch;
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  cleanup = await initializeDesktopWindow({ saveBeforeClose: saveBeforeCloseMock, onError: () => {} });
  replaceState(createInitialState(149210));
  currentView.name = "menu"; navigation.returnView = "menu";
  uiState.modal = null; uiState.confirmRequest = null; uiState.toast = null; uiState.deviceSetupOpen = false;
  target = document.createElement("div"); document.body.append(target);
  components = [mount(MainMenuView, { target }), mount(ConfirmDialog, { target })];
  flushSync();
});
afterEach(async () => {
  for (const component of components) await unmount(component);
  components = [];
  cleanup?.(); // 与真实卸载一致：重置退出守卫标志，避免轮询未沉降时把标志卡死
  cleanup = undefined;
  target.remove();
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  desktopWindowState.available = false;
  dismissToast();
});

function clickByAriaLabel(label: string): void {
  const button = [...target.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === label);
  expect(button, `找不到按钮 ${label}`).toBeTruthy();
  button!.click(); flushSync();
}
function clickText(text: string): void {
  const button = [...target.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text);
  expect(button, `找不到按钮 ${text}`).toBeTruthy();
  button!.click(); flushSync();
}

describe("主菜单退出按钮（关机图标）", () => {
  it("桌面环境下渲染退出按钮，点击先弹应用内确认框而不是直接关闭", async () => {
    expect(desktopWindowState.available).toBe(true);
    clickByAriaLabel("退出游戏");
    expect(uiState.confirmRequest).toBeTruthy();
    expect(uiState.confirmRequest!.danger).toBe(true);
    expect(uiState.confirmRequest!.confirmLabel).toBe("退出游戏");
    expect(target.textContent).toContain("确定要退出游戏吗");
    expect(closeMock).not.toHaveBeenCalled();
  });

  it("取消确认不关闭窗口", async () => {
    clickByAriaLabel("退出游戏");
    clickText("取消");
    await Promise.resolve();
    expect(uiState.confirmRequest).toBeNull();
    expect(closeMock).not.toHaveBeenCalled();
    expect(destroyMock).not.toHaveBeenCalled();
  });

  it("确认后走 close → 自动存档 → 正式关闭链路", async () => {
    clickByAriaLabel("退出游戏");
    clickText("退出游戏");
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(closeMock).toHaveBeenCalled();
    expect(closeHandler).toBeTypeOf("function");
    await closeHandler!({ preventDefault: () => {} });
    expect(saveBeforeCloseMock).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalledTimes(2);
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(destroyMock).toHaveBeenCalled();
  });

  it("确认后存档失败也直接退出，不把玩家困在重试提示里", async () => {
    saveBeforeCloseMock.mockRejectedValueOnce(new Error("磁盘写入失败"));
    clickByAriaLabel("退出游戏");
    clickText("退出游戏");
    await new Promise(resolve => setTimeout(resolve, 50));
    await closeHandler!({ preventDefault: () => {} });
    expect(saveBeforeCloseMock).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalledTimes(2);
    await new Promise(resolve => setTimeout(resolve, 300)); // 等轮询沉降，finally 复位退出守卫
  });

  it("关闭链路整体卡住时 8 秒后 destroy 兜底", async () => {
    vi.useFakeTimers();
    try {
      clickByAriaLabel("退出游戏");
      clickText("退出游戏");
      await vi.advanceTimersByTimeAsync(8500);
      expect(closeMock).toHaveBeenCalled();
      expect(destroyMock).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
