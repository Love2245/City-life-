// @vitest-environment jsdom
/**
 * v1.43.1 对话交互可达性回归：
 * 旧版只能点底部台词框推进、结束入口只在右上角，玩家容易以为"卡死 / 按钮无效 / 文本被截断"。
 * 这里锁住三条可达性约束：舞台点击可推进、选项态有中心结束按钮、选项态台词框有明确指引。
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import NpcTalkModal from "../src/components/layout/NpcTalkModal.svelte";
import { createInitialState } from "../src/game/core/state";
import { gameState, replaceState } from "../src/stores/gameStore.svelte";
import { closeNpcTalk, uiState } from "../src/stores/uiStore.svelte";

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

function setup(): HTMLElement {
  replaceState(createInitialState(99));
  gameState.locationId = "cafe";
  gameState.region = "downtown_residential";
  gameState.time.day = 3;
  gameState.time.hour = 8;
  uiState.npcTalk = { npcId: "npc_lin_xiaoyu", entry: "meet" };
  const target = document.createElement("div");
  document.body.appendChild(target);
  const component = mount(NpcTalkModal, { target });
  mounted.push({ component, target });
  flushSync();
  return target;
}

function revealChoices(target: HTMLElement): void {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (target.querySelectorAll(".choice-btn").length > 0) return;
    target.querySelector<HTMLElement>(".dialogue-box")?.click();
    flushSync();
  }
  throw new Error("台词播放完毕后仍未显示回答选项");
}

beforeAll(() => {
  if (!Element.prototype.animate) {
    Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  }
});

afterEach(() => {
  for (const item of mounted.splice(0)) {
    unmount(item.component);
    item.target.remove();
  }
  closeNpcTalk();
  replaceState(createInitialState(99));
});

describe("v1.43.1 对话交互可达性", () => {
  it("点击舞台非按钮区域也能推进台词或进入回答（不再只能点台词框）", () => {
    const target = setup();
    const before = target.querySelector<HTMLElement>(".dialogue-box")!.textContent;
    expect(target.querySelector(".dialogue-can-advance")).not.toBeNull();

    target.querySelector<HTMLElement>(".character-layout")!.click();
    flushSync();

    const after = target.querySelector<HTMLElement>(".dialogue-box")!.textContent;
    const hasChoices = target.querySelectorAll(".choice-btn").length > 0;
    expect(hasChoices || after !== before).toBe(true);
  });

  it("选项出现时提供中心位置的「结束对话」按钮，且点击能真正结束对话", () => {
    const target = setup();
    revealChoices(target);

    const endBtn = target.querySelector<HTMLButtonElement>(".choice-end-btn");
    expect(endBtn).not.toBeNull();
    expect(endBtn!.textContent).toContain("结束对话");

    endBtn!.click();
    flushSync();
    expect(uiState.npcTalk).toBeNull();
  });

  it("选项态的台词框给出明确指引，不再是无响应的假按钮", () => {
    const target = setup();
    revealChoices(target);

    const box = target.querySelector<HTMLElement>(".dialogue-box")!;
    expect(box.classList.contains("dialogue-awaiting-choice")).toBe(true);
    expect(box.textContent).toContain("请在上方选择你的回答");
  });

  it("多句台词时显示句子进度，避免读成「被截断」", () => {
    const target = setup();
    const counter = target.querySelector<HTMLElement>(".line-counter");
    if (counter) {
      expect(counter.textContent).toMatch(/第 \d+ \/ \d+ 句/);
    } else {
      // 单句节点没有进度条是正常的，但必须立刻可推进
      expect(target.querySelector(".dialogue-can-advance")).not.toBeNull();
    }
  });
});
