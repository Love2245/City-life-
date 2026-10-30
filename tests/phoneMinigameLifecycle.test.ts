// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import PhoneMinesweeper from "../src/components/layout/minigames/PhoneMinesweeper.svelte";
import PhoneSnake from "../src/components/layout/minigames/PhoneSnake.svelte";

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

function mountTracked(component: ReturnType<typeof mount>, target: HTMLElement): void {
  mounted.push({ component, target });
  flushSync();
}

function rowMajorRandom(): () => number {
  let randomCall = 0;
  return () => {
    const index = Math.floor(randomCall / 2);
    const coordinate = randomCall % 2 === 0 ? Math.floor(index / 9) : index % 9;
    randomCall += 1;
    return coordinate / 9;
  };
}

afterEach(() => {
  for (const { component, target } of mounted.splice(0)) {
    unmount(component);
    target.remove();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("phone minigame timer lifecycle", () => {
  it("stops the snake game timer when leaving the game", () => {
    vi.useFakeTimers();
    const target = document.createElement("div");
    document.body.append(target);
    const component = mount(PhoneSnake, { target });
    mountTracked(component, target);

    target.querySelector<HTMLButtonElement>(".sn-btn")!.click();
    flushSync();
    expect(vi.getTimerCount()).toBe(1);

    unmount(component);
    mounted.splice(mounted.findIndex((item) => item.component === component), 1);
    target.remove();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops the minesweeper timer immediately after a mine is revealed", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockImplementation(rowMajorRandom());
    const target = document.createElement("div");
    document.body.append(target);
    const component = mount(PhoneMinesweeper, { target });
    mountTracked(component, target);

    const cells = target.querySelectorAll<HTMLButtonElement>(".ms-cell");
    cells[0].click();
    flushSync();
    expect(target.querySelector(".ms-bad")).toBeNull();
    expect(vi.getTimerCount()).toBe(1);

    cells[10].click();
    flushSync();
    expect(target.querySelector(".ms-bad")?.textContent).toContain("踩雷了");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("guarantees the first revealed minesweeper cell is safe", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockImplementation(rowMajorRandom());
    const target = document.createElement("div");
    document.body.append(target);
    const component = mount(PhoneMinesweeper, { target });
    mountTracked(component, target);

    target.querySelector<HTMLButtonElement>(".ms-cell")!.click();
    flushSync();
    expect(target.querySelector(".ms-bad")).toBeNull();
    expect(target.querySelectorAll<HTMLButtonElement>(".ms-cell")[0].classList.contains("revealed")).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("does not consume first-click safety when a flagged cell is tapped", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockImplementation(rowMajorRandom());
    const target = document.createElement("div");
    document.body.append(target);
    const component = mount(PhoneMinesweeper, { target });
    mountTracked(component, target);
    const cells = target.querySelectorAll<HTMLButtonElement>(".ms-cell");
    const flagMode = target.querySelector<HTMLButtonElement>(".ms-head .ms-btn")!;

    flagMode.click();
    cells[0].click();
    flushSync();
    flagMode.click();
    cells[0].click();
    flushSync();
    expect(vi.getTimerCount()).toBe(0);

    cells[1].click();
    flushSync();
    expect(target.querySelector(".ms-bad")).toBeNull();
    expect(cells[1].classList.contains("revealed")).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("stops the minesweeper game timer when leaving an active game", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockImplementation(rowMajorRandom());
    const target = document.createElement("div");
    document.body.append(target);
    const component = mount(PhoneMinesweeper, { target });
    mountTracked(component, target);

    // This cell is safe but borders the seeded mine cluster, so revealing it
    // starts the clock without flood-filling the board into a win.
    target.querySelectorAll<HTMLButtonElement>(".ms-cell")[10].click();
    flushSync();
    expect(vi.getTimerCount()).toBe(1);

    unmount(component);
    mounted.splice(mounted.findIndex((item) => item.component === component), 1);
    target.remove();
    expect(vi.getTimerCount()).toBe(0);
  });
});
