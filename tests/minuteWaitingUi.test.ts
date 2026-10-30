// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import AttributeSidebar from "../src/components/layout/AttributeSidebar.svelte";
import ResultModal from "../src/components/ResultModal.svelte";
import SleepModal from "../src/components/layout/SleepModal.svelte";
import { createInitialState } from "../src/game/core/state";
import { formatTime } from "../src/game/core/time";
import { gameState, replaceState } from "../src/stores/gameStore.svelte";
import { uiState } from "../src/stores/uiStore.svelte";

const mounted: { target: HTMLDivElement; component: ReturnType<typeof mount> }[] = [];
function render(component: any) {
  const target = document.createElement("div"); document.body.append(target);
  mounted.push({ target, component: mount(component, { target }) }); flushSync();
  return target;
}
function click(target: HTMLElement, label: string) {
  const button = [...target.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === label);
  expect(button, label).toBeDefined(); expect(button!.disabled).toBe(false);
  button!.click(); flushSync();
}
beforeAll(() => {
  Element.prototype.animate ??= (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as any;
});
beforeEach(() => {
  const state = createInitialState(20261020); state.time.hour = 8; state.time.minute = 48;
  replaceState(state); uiState.gameMode = "pe"; uiState.modal = null; uiState.resultPayload = null;
});
afterEach(async () => {
  for (const item of mounted.splice(0)) { await unmount(item.component); item.target.remove(); }
  uiState.modal = null; uiState.resultPayload = null; uiState.gameMode = "pc";
});

describe("分钟等待与数值显示界面", () => {
  it("左侧等待栏提供一分钟与五分钟，点击后的时钟和结算一致", () => {
    const sidebar = render(AttributeSidebar), result = render(ResultModal);
    click(sidebar, "等 1 分钟");
    expect(formatTime(gameState.time.hour, gameState.time.minute)).toBe("08:49");
    expect(result.textContent).toContain("实际用时 1 分钟");
    click(result, "继续 →");
    click(sidebar, "等 5 分钟");
    expect(formatTime(gameState.time.hour, gameState.time.minute)).toBe("08:54");
    expect(result.textContent).toContain("实际用时 5 分钟");
  });

  it("自然醒及带小数的行动结算不会显示长串小数", () => {
    gameState.time.hour = 20; gameState.time.minute = 40;
    const sleep = render(SleepModal);
    expect(sleep.textContent).toContain("10 小时 20 分钟");
    expect(sleep.textContent).not.toMatch(/\d+\.\d{3,}/);
    uiState.resultPayload = { actionId: "test", name: "结算", icon: "⏳", duration: 31 / 180,
      deltas: [{ key: "stamina", label: "体力", value: -10 - 1 / 3 }], verdict: "完成" };
    const result = render(ResultModal);
    expect(result.textContent).toContain("实际用时 10 分钟");
    expect(result.textContent).toContain("-10.33");
    expect(result.textContent).not.toMatch(/\d+\.\d{3,}/);
  });
});
