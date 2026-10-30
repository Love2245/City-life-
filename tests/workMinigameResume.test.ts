// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import MiniGameModal from "../src/components/layout/MiniGameModal.svelte";
import GameView from "../src/views/GameView.svelte";
import { createInitialState } from "../src/game/core/state";
import { deliveryParttime, getJobDef, nowWorkMinute, takeJobOffer } from "../src/game/core/jobs";
import { getMiniGameConfig, getMiniGameConfigFor } from "../src/game/core/minigame";
import { currentView, gameState, replaceState } from "../src/stores/gameStore.svelte";
import { presentJobResult, presentWorkSession, uiState } from "../src/stores/uiStore.svelte";
import { seededMiniGameRandom } from "../src/lib/minigameRandom";
import * as saveModule from "../src/lib/save";
import MiniGameHost from "../src/components/layout/MiniGameHost.svelte";

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

beforeAll(() => {
  if (!Element.prototype.animate) {
    Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  }
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
  if (!globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16)) as any;
    globalThis.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as any;
  }
});

afterEach(() => {
  for (const { component, target } of mounted.splice(0)) {
    unmount(component);
    target.remove();
  }
  uiState.modal = null;
  uiState.minigamePayload = null;
  currentView.name = "menu";
  replaceState(createInitialState(1));
  vi.restoreAllMocks();
});

function render(): HTMLElement {
  const target = document.createElement("div");
  document.body.appendChild(target);
  mounted.push({ component: mount(MiniGameModal, { target }), target });
  flushSync();
  return target;
}

function startDeliveryWork(): void {
  const state = createInitialState(9041);
  state.flags.app_delivery = true;
  state.flags.item_bicycle = true;
  state.player.attrs.stamina = 100;
  state.player.attrs.satiety = 100;
  replaceState(state);
  const result = deliveryParttime(gameState);
  expect(result.ok).toBe(true);
  presentJobResult(result.result, getMiniGameConfigFor(gameState, "job_delivery"), {
    id: "job_delivery", name: "外卖骑手", icon: "🛵",
  });
}

describe("班次小游戏的暂停、恢复与种子", () => {
  it("同一种子重开得到相同随机序列，并不动全局存档随机状态", () => {
    const first = seededMiniGameRandom(192837);
    const second = seededMiniGameRandom(192837);
    expect(Array.from({ length: 20 }, first)).toEqual(Array.from({ length: 20 }, second));
    expect(seededMiniGameRandom(192838)()).not.toBe(seededMiniGameRandom(192837)());
  });

  it("Esc 暂停，不发工资；继续后保持原班次和种子", () => {
    startDeliveryWork();
    const active = gameState.work!.active!;
    const cash = gameState.player.money;
    const seed = active.seed;
    const target = render();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    flushSync();
    expect(active.status).toBe("paused");
    expect(gameState.player.money).toBe(cash);
    expect(target.textContent).toContain("工作已暂停");
    expect(target.textContent).not.toContain("按 0 分结算");
    target.querySelector<HTMLButtonElement>(".mg-pause-primary")!.click();
    flushSync();
    expect(active.status).toBe("playing");
    expect(gameState.work?.active?.id).toBe(active.id);
    expect(uiState.minigamePayload?.seed).toBe(seed);
  });

  it("恢复入口重建 UI 载荷而非生成新的班次或种子", () => {
    startDeliveryWork();
    const active = gameState.work!.active!;
    uiState.modal = null;
    uiState.minigamePayload = null;
    active.status = "paused";
    presentWorkSession();
    expect(uiState.modal).toBe("minigame");
    expect(uiState.minigamePayload?.sessionId).toBe(active.id);
    expect(uiState.minigamePayload?.seed).toBe(active.seed);
  });

  it("切后台自动暂停且不结算，回到前台需主动继续", () => {
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    startDeliveryWork();
    const active = gameState.work!.active!;
    const cash = gameState.player.money;
    const target = render();
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    flushSync();
    expect(active.status).toBe("paused");
    expect(gameState.player.money).toBe(cash);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    flushSync();
    expect(active.status).toBe("paused");
    target.querySelector<HTMLButtonElement>(".mg-pause-primary")!.click();
    flushSync();
    expect(active.status).toBe("playing");
    expect(gameState.work?.active?.id).toBe(active.id);
  });

  it("暂停后保存退出，自动槽保留同一班次且清理旧弹窗", async () => {
    startDeliveryWork();
    currentView.name = "game";
    const { id, seed } = gameState.work!.active!;
    const target = render();
    target.querySelector<HTMLButtonElement>(".mg-close")!.click();
    flushSync();
    const save = Array.from(target.querySelectorAll<HTMLButtonElement>(".mg-pause-actions button"))
      .find(button => button.textContent?.includes("保存并返回菜单"));
    save!.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    flushSync();
    const saved = JSON.parse(localStorage.getItem("urban_life_save_auto")!);
    expect(saved.work.active).toMatchObject({ id, seed, status: "paused" });
    expect(currentView.name).toBe("menu");
    expect(uiState.modal).toBeNull();
    expect(uiState.minigamePayload).toBeNull();
  });

  it("主动熟练跳过只结算一次八折工资，重复点击无效", () => {
    const state = createInitialState(9041);
    state.locationId = "labor_market";
    state.player.attrs.stamina = 100;
    state.player.attrs.satiety = 100;
    const job = getJobDef("job_delivery")!;
    state.work!.masteryMinutes[job.id] = job.duration * 60 * 20;
    state.laborMarket.offers = [{ uid: "mastered_delivery", jobId: job.id, quota: 1 }];
    replaceState(state);
    const started = takeJobOffer(gameState, "mastered_delivery");
    expect(started.ok).toBe(true);
    presentJobResult(started.result, getMiniGameConfigFor(gameState, job.id), { id: job.id, name: job.name, icon: job.icon });
    const active = gameState.work!.active!;
    expect(active.canSkip).toBe(true);
    const cash = gameState.player.money;
    const base = active.skipBaseWage ?? active.baseWage;
    const startMinute = nowWorkMinute(gameState);
    const workedMinutes = active.workedMinutes;
    const target = render();
    const skip = target.querySelector<HTMLButtonElement>(".mg-mastery-skip")!;
    skip.click();
    flushSync();
    expect(gameState.player.money - cash).toBe(Math.round(base * 0.8));
    expect(nowWorkMinute(gameState) - startMinute).toBe(workedMinutes);
    expect(gameState.work?.active).toBeUndefined();
    const paid = gameState.player.money;
    skip.click();
    flushSync();
    expect(gameState.player.money).toBe(paid);
  });

  it("读档进入游戏时，待完成班次自动锁定在暂停遮罩", () => {
    startDeliveryWork();
    const id = gameState.work!.active!.id;
    uiState.modal = null;
    uiState.minigamePayload = null;
    currentView.name = "game";
    const target = document.createElement("div");
    document.body.appendChild(target);
    mounted.push({ component: mount(GameView, { target }), target });
    flushSync();
    expect(gameState.work?.active?.id).toBe(id);
    expect(gameState.work?.active?.status).toBe("paused");
    expect(uiState.modal).toBe("minigame");
    expect(target.textContent).toContain("工作已暂停");
  });

  it("存档失败后可明确放弃进度退出，旧自动存档保持不变", async () => {
    const key = "urban_life_save_auto";
    const previous = localStorage.getItem(key);
    const lastGoodSave = "last-good-save";
    localStorage.setItem(key, lastGoodSave);
    try {
      startDeliveryWork();
      currentView.name = "game";
      const saveSpy = vi.spyOn(saveModule, "saveGame").mockRejectedValue(new Error("quota"));
      const target = render();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await vi.waitFor(() => expect(target.querySelector(".mg-pause-error")).not.toBeNull());
      expect(target.querySelector<HTMLButtonElement>(".mg-pause-danger")?.textContent).toContain("放弃未保存进度并退出");

      const saveAndExit = Array.from(target.querySelectorAll<HTMLButtonElement>(".mg-pause-actions button"))
        .find((button) => button.textContent?.includes("保存并返回菜单"));
      saveAndExit!.click();
      await vi.waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(target.querySelector(".mg-pause-danger")).not.toBeNull());
      target.querySelector<HTMLButtonElement>(".mg-pause-danger")!.click();
      flushSync();

      expect(currentView.name).toBe("menu");
      expect(gameState.work?.active).toBeUndefined();
      expect(uiState.modal).toBeNull();
      expect(saveSpy).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem(key)).toBe(lastGoodSave);
    } finally {
      if (previous === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous);
    }
  });

  it("Host 下的随机工作小游戏使用班次种子，不调用全局随机源", async () => {
    vi.useFakeTimers();
    const globalRandom = vi.spyOn(Math, "random").mockReturnValue(0.5);
    for (const key of ["job_security", "job_market_cleaner", "amusement_ringtoss"]) {
      const cfg = getMiniGameConfig(key);
      expect(cfg, `${key} 配置应存在`).toBeDefined();
      const target = document.createElement("div");
      document.body.appendChild(target);
      const component = mount(MiniGameHost, {
        target,
        props: { cfg, seed: 192837, sceneKey: key, onFinish: vi.fn() },
      });
      mounted.push({ component, target });
      flushSync();
      if (key === "amusement_ringtoss") {
        target.querySelector<HTMLButtonElement>(".target")!.click();
        await vi.advanceTimersByTimeAsync(420);
        flushSync();
      }
    }
    expect(globalRandom).not.toHaveBeenCalled();
  });

  it("非工作顺序小游戏切后台冻结倒计时，回到前台继续", async () => {
    vi.useFakeTimers();
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const cfg = getMiniGameConfig("temple_volunteer");
    expect(cfg?.type).toBe("sequence");
    uiState.minigamePayload = {
      key: "temple_volunteer",
      title: cfg!.title,
      icon: cfg!.icon,
      config: cfg!,
      todayPay: 0,
    };
    uiState.modal = "minigame";
    const target = render();
    const timeLeft = () => Number(target.querySelector<HTMLElement>(".shift header strong")?.textContent?.match(/[\d.]+/)?.[0]);
    const initial = timeLeft();
    expect(initial).toBeGreaterThan(0);
    target.querySelector<HTMLButtonElement>(".shift .primary")!.click();
    flushSync();

    await vi.advanceTimersByTimeAsync(1200);
    flushSync();
    const beforeHide = timeLeft();
    expect(beforeHide).toBeLessThan(initial);

    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    flushSync();
    const atHide = timeLeft();
    await vi.advanceTimersByTimeAsync(5000);
    flushSync();
    expect(timeLeft()).toBe(atHide);

    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    flushSync();
    await vi.advanceTimersByTimeAsync(1200);
    flushSync();
    expect(timeLeft()).toBeLessThan(atHide);
  });
});
