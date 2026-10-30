// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import SettingsView from "../src/views/SettingsView.svelte";
import { createInitialState } from "../src/game/core/state";
import { replaceState } from "../src/stores/gameStore.svelte";
import { uiState } from "../src/stores/uiStore.svelte";

let component: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  replaceState(createInitialState(20261020));
  uiState.modal = null;
  uiState.deviceSetupOpen = true;
  target = document.createElement("div");
  document.body.append(target);
  component = mount(SettingsView, { target });
  flushSync();
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  target.remove();
  uiState.deviceSetupOpen = false;
});

describe("设置页排版", () => {
  it("上半部分卡片进两列容器，底部三张卡单独成组", () => {
    const twoColumn = target.querySelector(".settings-cards");
    expect(twoColumn, "缺少两列容器").not.toBeNull();
    const columnCards = twoColumn!.querySelectorAll(":scope > .setting-card");
    expect(columnCards.length, "两列容器内卡片过少").toBeGreaterThanOrEqual(5);

    const rest = target.querySelector(".settings-rest");
    expect(rest, "缺少底部容器").not.toBeNull();
    expect(rest!.querySelector(".updates-card"), "更新日志应在底部容器").not.toBeNull();
    expect(rest!.querySelector(".danger-zone"), "危险操作应在底部容器").not.toBeNull();

    // 长的更新日志混进两列会把列撑得极高、右列留白，必须留在底部单列区域
    expect(twoColumn!.querySelector(".updates-card")).toBeNull();
    expect(twoColumn!.querySelector(".danger-zone")).toBeNull();
  });

  it("两列容器里没有卡在容器外的散落设置卡", () => {
    const page = target.querySelector(".settings-page")!;
    const directCards = [...page.children].filter((node) => node.classList.contains("setting-card"));
    expect(directCards, "设置卡应全部放进列容器或底部容器").toEqual([]);
  });
});
