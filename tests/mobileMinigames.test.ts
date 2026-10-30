// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import MemoryGame from "../src/components/layout/minigames/MemoryGame.svelte";
import ReactionShift from "../src/components/layout/minigames/ReactionShift.svelte";
import type { MemoryCfg, WhackCfg } from "../src/game/core/minigame";

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

function mountTracked(component: ReturnType<typeof mount>, target: HTMLElement): void {
  mounted.push({ component, target });
  flushSync();
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    unmount(entry.component);
    entry.target.remove();
  }
  vi.useRealTimers();
});

describe("手机小游戏按钮渲染", () => {
  it("记忆牌配置缺图标时仍显示可点击的八张牌", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const cfg: MemoryCfg = {
      type: "memory",
      title: "记忆配对测试",
      icon: "🧠",
      desc: "测试配置兜底",
      icons: [],
      showMs: 10_000,
    };

    mountTracked(mount(MemoryGame, { target, props: { cfg, onFinish: vi.fn() } }), target);

    const cards = target.querySelectorAll<HTMLButtonElement>(".mem-card");
    expect(cards).toHaveLength(8);
    expect(cards[0].type).toBe("button");
    expect(cards[0].getAttribute("aria-label")).toContain("卡牌 1");
  });

  it("反应场景能显示开始按钮，并在开局后生成可点目标", () => {
    vi.useFakeTimers();
    const target = document.createElement("div");
    document.body.appendChild(target);
    const cfg: WhackCfg = {
      type: "whack",
      title: "反应测试",
      icon: "🧹",
      desc: "测试目标渲染",
      targets: 4,
      timeLimit: 30,
      goodLabel: "目标",
      goodIcon: "🧽",
      badLabel: "障碍",
      badIcon: "🥫",
    };

    mountTracked(mount(ReactionShift, { target, props: { cfg, onFinish: vi.fn() } }), target);

    const start = target.querySelector<HTMLButtonElement>("button.start");
    expect(start).not.toBeNull();
    start!.click();
    vi.advanceTimersByTime(50);
    flushSync();
    expect(target.querySelectorAll<HTMLButtonElement>("button.object").length).toBeGreaterThan(0);
  });
});
