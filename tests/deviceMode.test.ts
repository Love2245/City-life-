// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { uiState, initZoom, completeDeviceSetup, setShowLog, setZoom } from "../src/stores/uiStore.svelte";
import { mobileLayoutMode, shouldShowRotatePrompt } from "../src/lib/mobileLayout";

const modeKey = "urban-life-ui-gamemode";
const logKey = "urban-life-show-log";
const setupKey = "urban-life-device-setup-v1";
const zoomKey = "urban-life-ui-zoom";

beforeEach(() => {
  localStorage.clear();
  uiState.gameMode = "pc";
  uiState.zoom = 1;
  uiState.showLog = true;
  uiState.deviceSetupOpen = false;
});

describe("首次设备选择与三种布局模式", () => {
  it("首次启动显示设备选择，手机选择保存为 70% PE 预设", () => {
    initZoom();
    expect(uiState.deviceSetupOpen).toBe(true);
    completeDeviceSetup("pe");
    expect(uiState.deviceSetupOpen).toBe(false);
    expect(uiState.gameMode).toBe("pe");
    expect(uiState.zoom).toBe(0.7);
    expect(uiState.showLog).toBe(false);
    expect(localStorage.getItem(setupKey)).toBe("1");
    expect(localStorage.getItem(modeKey)).toBe("pe");
  });

  it("平板保留 PC 布局并强制关闭底部行动日志", () => {
    completeDeviceSetup("tablet");
    expect(uiState.gameMode).toBe("tablet");
    expect(mobileLayoutMode(uiState.gameMode)).toBe("pc");
    expect(uiState.zoom).toBe(1);
    expect(uiState.showLog).toBe(false);
    setShowLog(true);
    expect(uiState.showLog).toBe(false);

    localStorage.setItem(modeKey, "tablet");
    localStorage.setItem(logKey, "true");
    localStorage.setItem(setupKey, "1");
    initZoom();
    expect(uiState.gameMode).toBe("tablet");
    expect(uiState.showLog).toBe(false);
    expect(localStorage.getItem(logKey)).toBe("false");
    expect(uiState.deviceSetupOpen).toBe(false);
  });

  it("电脑保持 PC 模式，底部行动日志可手动开关", () => {
    completeDeviceSetup("pc");
    expect(uiState.gameMode).toBe("pc");
    expect(uiState.showLog).toBe(true);
    setShowLog(false);
    expect(uiState.showLog).toBe(false);
    setShowLog(true);
    expect(uiState.showLog).toBe(true);
  });

  it("首次升级把旧 PE 预设迁移到 70%，之后保留玩家自选缩放", () => {
    localStorage.setItem(modeKey, "pe");
    localStorage.setItem(zoomKey, "1");
    localStorage.setItem("urban-life-pe-zoom-v2", "1");
    localStorage.setItem(setupKey, "1");
    initZoom();
    expect(uiState.zoom).toBe(0.7);
    expect(localStorage.getItem(zoomKey)).toBe("0.7");

    setZoom(0.9);
    initZoom();
    expect(uiState.zoom).toBe(0.9);
  });

  it("手机竖屏始终拦截，包括菜单、弹窗和小游戏；横屏与桌面不拦截", () => {
    expect(shouldShowRotatePrompt("pe", true)).toBe(true);
    expect(shouldShowRotatePrompt("mobile", true)).toBe(true);
    expect(shouldShowRotatePrompt("pe", false)).toBe(false);
    expect(shouldShowRotatePrompt("mobile", false)).toBe(false);
    expect(shouldShowRotatePrompt("tablet", true)).toBe(false);
    expect(shouldShowRotatePrompt("pc", true)).toBe(false);
  });

});
