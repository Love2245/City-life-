// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import FishingPanel from "../src/components/layout/FishingPanel.svelte";
import { createInitialState } from "../src/game/core/state";
import { gameState, replaceState } from "../src/stores/gameStore.svelte";
import { setGameMode, uiState } from "../src/stores/uiStore.svelte";
import { fishingInput, startFishing } from "../src/game/core/fishing";

let component: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement;

beforeAll(() => {
  Element.prototype.animate ??= (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
  window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as any;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null as any);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

beforeEach(() => {
  setGameMode("pc");
  const state = createInitialState(148);
  state.locationId = "treasure_lake";
  state.region = state.area = "development_reserve";
  const previousBest = { id: 1, speciesId: "crucian", grams: 100 };
  const fish = { id: 2, speciesId: "crucian", grams: 972 };
  state.inventory.fishing_rod = 1;
  state.inventory.fishing_bait = 3;
  state.inventory.fishing_bucket = 1;
  state.fishing = {
    nextId: 3,
    active: null,
    bucket: [previousBest, fish],
    specimens: {},
    bestRecords: { crucian: fish },
    pendingCatch: { fish, previousBest, record: fish, newRecord: true },
  };
  replaceState(state);
  target = document.createElement("div");
  document.body.append(target);
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  target.remove();
  uiState.modal = null;
  replaceState(createInitialState(148));
  setGameMode("pc");
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("钓鱼鱼获页历史纪录文案", () => {
  it.each(["继续钓鱼", "收竿"])("从抛竿入口连续更新后显示鱼种和重量，并可选择%s", async (choice) => {
    const state = createInitialState(150);
    state.locationId = "treasure_lake";
    state.region = state.area = "development_reserve";
    state.inventory.fishing_rod = 1;
    state.inventory.fishing_bait = 3;
    state.inventory.fishing_bucket = 1;
    replaceState(state);
    component = mount(FishingPanel, { target });
    flushSync();
    target.querySelector<HTMLButtonElement>(".fishing-panel button")!.click();
    flushSync();
    expect(document.body.querySelector(".water")?.textContent).toContain("静候鱼讯");
    const cast = gameState.fishing!.active!;
    const records = gameState.fishing!.bestRecords;
    fishingInput(gameState, cast.id, { type: "tick", dtMs: 16, held: false });
    expect(gameState.fishing!.bestRecords).toBe(records);
    cast.waitMs = 200000;
    for (let frame = 0; frame < 2000; frame++) {
      fishingInput(gameState, cast.id, { type: "tick", dtMs: 16, held: false });
    }
    cast.phase = "fighting";
    cast.progress = .999;
    fishingInput(gameState, cast.id, { type: "tick", dtMs: 50, held: false });
    flushSync();
    await Promise.resolve();
    flushSync();
    expect(document.body.querySelector(".catch-reveal")).not.toBeNull();
    expect(document.body.querySelector(".catch-reveal h2")?.textContent).toBeTruthy();
    expect(document.body.querySelector(".catch-weight")?.textContent).toContain("千克");
    expect(gameState.fishing!.bucket).toHaveLength(1);
    const caught = gameState.fishing!.bucket[0];
    const choose = [...document.body.querySelectorAll<HTMLButtonElement>(".catch-actions button")]
      .find(button => button.textContent?.trim() === choice)!;
    choose.click();
    flushSync();
    expect(gameState.fishing!.pendingCatch).toBeNull();
    expect(gameState.fishing!.bucket[0].id).toBe(caught.id);
    if (choice === "收竿") {
      expect(gameState.fishing!.active).toBeNull();
      expect(document.body.querySelector(".fishing-dialog")).toBeNull();
    } else {
      expect(gameState.fishing!.active!.id).not.toBe(caught.id);
      expect(document.body.querySelector(".water")?.textContent).toContain("静候鱼讯");
      expect(gameState.inventory.fishing_bait).toBe(1);
      expect(() => JSON.stringify(gameState)).not.toThrow();
    }
  });
  it.each([false, true])("遛鱼成功后自动显示鱼获，确认后能继续下一竿（结束时失焦：%s）", async (blur) => {
    const state = createInitialState(150);
    state.locationId = "treasure_lake";
    state.region = state.area = "development_reserve";
    state.inventory.fishing_rod = 1;
    state.inventory.fishing_bait = 3;
    state.inventory.fishing_bucket = 1;
    startFishing(state);
    state.fishing!.active!.phase = "fighting";
    state.fishing!.active!.progress = .999;
    replaceState(state);
    component = mount(FishingPanel, { target });
    flushSync();
    target.querySelector<HTMLButtonElement>(".fishing-panel button")!.click();
    flushSync();
    const id = gameState.fishing!.active!.id;
    fishingInput(gameState, id, { type: "tick", dtMs: 50, held: false });
    expect(gameState.fishing!.active!.phase).toBe("ready");
    if (blur) window.dispatchEvent(new Event("blur"));
    flushSync();
    await Promise.resolve();
    flushSync();
    expect(document.body.querySelector(".catch-reveal")).not.toBeNull();
    const next = [...document.body.querySelectorAll<HTMLButtonElement>(".catch-actions button")]
      .find(button => button.textContent?.includes("继续钓鱼"))!;
    next.click();
    flushSync();
    expect(gameState.fishing!.active!.phase).toBe("waiting");
    expect(gameState.fishing!.active!.id).not.toBe(id);
    expect(document.body.querySelector(".water")?.textContent).toContain("静候鱼讯");
  });
  it("明确区分刷新前纪录与包含本次的同种历史最佳", () => {
    component = mount(FishingPanel, { target });
    flushSync();

    const reveal = document.body.querySelector<HTMLElement>(".catch-reveal");
    const dialog = document.body.querySelector<HTMLElement>(".fishing-dialog");
    const record = reveal?.querySelector<HTMLElement>(".record-card");
    expect(dialog?.dataset.sceneLocation).toBe("treasure_lake");
    expect(dialog?.dataset.sceneBackground).toContain("treasure_lake");
    expect(reveal?.textContent).toContain("鲫鱼");
    expect(reveal?.textContent).toContain("0.972");
    expect(reveal?.querySelector(".record-badge")?.textContent).toContain("刷新纪录");
    expect(record?.getAttribute("aria-label")).toBe("同种历史最佳纪录（含本次）");
    expect(record?.textContent).toContain("同种历史最佳（含本次）");
    expect(record?.textContent).toContain("0.972 千克");
    expect(record?.textContent).toContain("此前纪录 0.100 千克 · 已刷新");
  });

  it.each([1, 3])("错过鱼讯并失焦后仍有结束提示或下一竿入口（初始鱼饵：%s）", async (bait) => {
    const state = createInitialState(150);
    state.locationId = "treasure_lake";
    state.region = state.area = "development_reserve";
    state.inventory.fishing_rod = 1;
    state.inventory.fishing_bait = bait;
    state.inventory.fishing_bucket = 1;
    startFishing(state);
    state.fishing!.active!.phase = "bite";
    state.fishing!.active!.biteMs = 1;
    replaceState(state);
    component = mount(FishingPanel, { target });
    flushSync();
    target.querySelector<HTMLButtonElement>(".fishing-panel button")!.click();
    flushSync();
    fishingInput(gameState, gameState.fishing!.active!.id, { type: "tick", dtMs: 50, held: false });
    window.dispatchEvent(new Event("blur"));
    flushSync();
    await Promise.resolve();
    flushSync();
    if (bait === 1) {
      expect(document.body.querySelector(".end-menu")?.textContent).toContain("鱼饵用完了");
      expect(gameState.fishing!.active).toBeNull();
    } else {
      expect(document.body.querySelector(".catch-notice")?.textContent).toContain("鱼儿游走了");
      const resume = document.body.querySelector<HTMLButtonElement>(".fishing-actions button")!;
      expect(resume.textContent).toContain("继续垂钓");
      resume.click();
      flushSync();
      expect(document.body.querySelector(".pause-note")).toBeNull();
      expect(gameState.fishing!.active!.phase).toBe("waiting");
    }
  });

  it("uses the saved catch location for its background when the player is elsewhere", () => {
    const state = createInitialState(149);
    state.locationId = "treasure_lake";
    state.region = state.area = "development_reserve";
    state.inventory.fishing_rod = 1;
    state.inventory.fishing_bait = 3;
    state.inventory.fishing_bucket = 1;
    const fish = { id: 2, speciesId: "carp", grams: 1250 };
    state.fishing = {
      nextId: 3,
      active: null,
      bucket: [fish],
      specimens: {},
      bestRecords: { carp: fish },
      pendingCatch: { fish, record: fish, newRecord: true, locationId: "lake_park" },
    };
    replaceState(state);

    component = mount(FishingPanel, { target });
    flushSync();

    const dialog = document.body.querySelector<HTMLElement>(".fishing-dialog");
    expect(dialog?.dataset.sceneLocation).toBe("lake_park");
    expect(dialog?.dataset.sceneBackground).toContain("lake_park");
    expect(dialog?.getAttribute("aria-label")).toContain("环湖公园");
  });

  it("允许收起待确认鱼获并从场景重新打开，不丢失鱼获", async () => {
    component = mount(FishingPanel, { target });
    flushSync();
    const close = document.body.querySelector<HTMLButtonElement>(".fishing-dialog .close-button")!;
    expect(close.disabled).toBe(false);
    close.click();
    await Promise.resolve();
    flushSync();

    expect(document.body.querySelector(".fishing-dialog")).toBeNull();
    expect(gameState.fishing?.pendingCatch?.fish.id).toBe(2);
    const reopen = target.querySelector<HTMLButtonElement>(".fishing-panel button")!;
    expect(reopen.textContent).toContain("查看本次鱼获");
    reopen.click();
    flushSync();
    expect(document.body.querySelector(".catch-reveal")).not.toBeNull();
  });

  it("可以关闭鱼获整理界面，回到场景后仍能继续处理鱼桶", async () => {
    component = mount(FishingPanel, { target });
    flushSync();
    const finish = [...document.body.querySelectorAll<HTMLButtonElement>(".catch-actions button")]
      .find(button => button.textContent?.trim() === "收竿")!;
    finish.click();
    flushSync();
    expect(document.body.querySelector(".fishing-dialog")).toBeNull();
    expect(gameState.fishing?.bucket.map(fish => fish.id)).toEqual([1, 2]);
    target.querySelector<HTMLButtonElement>(".fishing-panel button")!.click();
    flushSync();
    const close = document.body.querySelector<HTMLButtonElement>(".fishing-dialog .close-button")!;
    expect(close.disabled).toBe(false);
    close.click();
    await Promise.resolve();
    flushSync();

    expect(document.body.querySelector(".fishing-dialog")).toBeNull();
    expect(gameState.fishing?.pendingCatch).toBeNull();
    const reopen = target.querySelector<HTMLButtonElement>(".fishing-panel button")!;
    expect(reopen.textContent).toContain("整理鱼获");
    reopen.click();
    flushSync();
    expect(document.body.querySelector(".end-menu")).not.toBeNull();
  });

  it("进行中的鱼竿可通过常驻的结束按钮结算并直接返回场景", () => {
    const state = createInitialState(150);
    state.locationId = "treasure_lake";
    state.region = state.area = "development_reserve";
    state.inventory.fishing_rod = 1;
    state.inventory.fishing_bait = 3;
    state.inventory.fishing_bucket = 1;
    expect(startFishing(state).ok).toBe(true);
    replaceState(state);

    component = mount(FishingPanel, { target });
    flushSync();
    target.querySelector<HTMLButtonElement>(".fishing-panel button")!.click();
    flushSync();
    const finish = document.body.querySelector<HTMLButtonElement>(".finish-outing-button")!;
    expect(finish.getAttribute("aria-label")).toContain("结束垂钓并返回场景");
    finish.click();
    flushSync();

    expect(document.body.querySelector(".fishing-dialog")).toBeNull();
    expect(gameState.fishing?.active).toBeNull();
    expect(gameState.fishing?.pendingCatch).toBeNull();
  });

  it("本次鱼获页点击结束后直接返回场景并保留鱼桶内容", () => {
    component = mount(FishingPanel, { target });
    flushSync();
    document.body.querySelector<HTMLButtonElement>(".finish-outing-button")!.click();
    flushSync();

    expect(document.body.querySelector(".fishing-dialog")).toBeNull();
    expect(gameState.fishing?.pendingCatch).toBeNull();
    expect(gameState.fishing?.bucket.map(fish => fish.id)).toEqual([1, 2]);
  });

  it("鱼获整理页提供直接返回场景的结束入口，且不强迫玩家卖鱼或放生", () => {
    component = mount(FishingPanel, { target });
    flushSync();
    const finishCatch = [...document.body.querySelectorAll<HTMLButtonElement>(".catch-actions button")]
      .find(button => button.textContent?.trim() === "收竿")!;
    finishCatch.click();
    flushSync();
    expect(document.body.querySelector(".fishing-dialog")).toBeNull();
    target.querySelector<HTMLButtonElement>(".fishing-panel button")!.click();
    flushSync();
    expect(document.body.querySelector(".end-menu")).not.toBeNull();

    document.body.querySelector<HTMLButtonElement>(".finish-outing-button")!.click();
    flushSync();
    expect(document.body.querySelector(".fishing-dialog")).toBeNull();
    expect(gameState.fishing?.bucket.map(fish => fish.id)).toEqual([1, 2]);
  });
});
