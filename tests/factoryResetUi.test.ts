// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import FactoryGame from "../src/components/layout/minigames/FactoryGame.svelte";
import type { FactoryCfg } from "../src/game/core/minigame";
import { FactoryShift } from "../src/components/layout/minigames/factoryShift";
vi.mock("../src/lib/audio", () => ({ playInteractionSound:vi.fn(),playActionSound:vi.fn(),playSound:vi.fn() }));
const cfg: FactoryCfg = { type: "factory", title: "工厂装配", icon: "🏭", desc: "", timeLimit: 20, productsToWin: 2, parts: [{ id: "pcb", name: "电路板", icon: "▣" }] };
let component: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement;
let pending = new Map<number, FrameRequestCallback>();
let sequence = 0, timestamp = 1000;
let disconnect = vi.fn();
beforeEach(() => {
  pending = new Map(); sequence = 0; timestamp = 1000; disconnect = vi.fn();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { const id = ++sequence; pending.set(id, cb); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() { disconnect(); } });
  target = document.createElement("div"); document.body.append(target);
});
afterEach(async () => { if (component) await unmount(component); component = undefined; target.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function frames(seconds: number) {
  for (let n = 0; n < Math.ceil(seconds * 10); n++) {
    timestamp += 100; const callbacks = [...pending.values()]; pending.clear();
    for (const callback of callbacks) callback(timestamp); flushSync();
  }
}
function click(selector: string) { target.querySelector<HTMLButtonElement>(selector)!.click(); flushSync(); }
function start(extra: Record<string, unknown> = {}) {
  const finish = vi.fn(), progress = vi.fn();
  component = mount(FactoryGame, { target, props: { cfg, seed: 42, onFinish: finish, onProgress: progress, ...extra } });
  flushSync(); frames(.1); return { finish, progress };
}
function processPoints() {
  click(".board-hit"); frames(.7);
  for (let i = 0; i < 4; i++) { click(`.spot[aria-label="焊接第 ${i + 1} 个焊点"]`); frames(.5); }
}
describe("工位组件生命周期与输入", () => {
  it.each(["job_factory_line", "job_factory_qc", "job_factory_tech", "job_sorting", "job_warehouse"])("%s 按真实宿主余高进入紧凑布局，旋转后四点保持完整可见", sceneKey => {
    let host = { width: 932, height: 430 }, floor = { width: 736, height: 299 };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const size = this.classList.contains("factory-shift") ? host : this.classList.contains("canvas-wrap") ? floor : { width: 0, height: 0 };
      return { ...size, x: 0, y: 0, left: 0, top: 0, right: size.width, bottom: size.height, toJSON() {} };
    });
    start({ sceneKey });
    expect(target.querySelector(".factory-shift")?.getAttribute("data-factory-layout")).toBe("compact");
    click(".board-hit"); frames(.7);
    function checkBounds() {
      const board = target.querySelector<HTMLButtonElement>(".board-hit")!;
      expect(parseFloat(board.style.top) + parseFloat(board.style.height)).toBeLessThanOrEqual(floor.height);
      for (const button of target.querySelectorAll<HTMLButtonElement>(".spot")) {
        const x = parseFloat(button.style.left), y = parseFloat(button.style.top);
        expect(x - 24).toBeGreaterThanOrEqual(0); expect(x + 24).toBeLessThanOrEqual(floor.width);
        expect(y - 24).toBeGreaterThanOrEqual(0); expect(y + 24).toBeLessThanOrEqual(floor.height);
      }
    }
    checkBounds();
    host = { width: 852, height: 394 }; floor = { width: 656, height: 263 };
    window.dispatchEvent(new Event("resize")); flushSync(); frames(.1); checkBounds();
    expect(target.querySelector(".factory-shift")?.getAttribute("data-factory-stage")).toBe("solder");
    host = { width: 852, height: 300 }; floor = { width: 660, height: 183 };
    window.dispatchEvent(new Event("resize")); flushSync(); frames(.1); checkBounds();
    expect(target.querySelector(".factory-shift")?.classList.contains("tight")).toBe(true);
  });
  it("切入后台或手动暂停冻结时间和自动对接，继续后才能操作", () => {
    const { finish, progress } = start(); click(".board-hit"); frames(.2); click(".pause-btn");
    const paused = progress.mock.calls.at(-1)![0]; frames(30);
    expect(target.querySelector(".factory-shift")?.getAttribute("data-factory-stage")).toBe("docking"); expect(finish).not.toHaveBeenCalled();
    expect(progress.mock.calls.at(-1)![0].elapsed).toBe(paused.elapsed);
    click(".pause-card button"); frames(.6); expect(target.querySelector(".factory-shift")?.getAttribute("data-factory-stage")).toBe("solder");
    vi.spyOn(document, "hidden", "get").mockReturnValue(true); frames(30); expect(finish).not.toHaveBeenCalled();
  });
  it("鼠标/触屏共用指针拖动，过短右拖拒绝计件，足够距离出货", () => {
    const { finish } = start(); processPoints();
    const board = target.querySelector<HTMLButtonElement>(".board-hit")!;
    function pointer(name: string, x: number) { const e = new Event(name, { bubbles: true, cancelable: true }); Object.assign(e, { button: 0, clientX: x, pointerId: 7 }); board.dispatchEvent(e); flushSync(); }
    pointer("pointerdown", 200); pointer("pointermove", 215); pointer("pointerup", 215); frames(.5);
    expect(target.querySelector(".factory-shift")?.getAttribute("data-completed")).toBe("0");
    pointer("pointerdown", 200); pointer("pointermove", 330); pointer("pointerup", 330); frames(.6);
    expect(target.querySelector(".factory-shift")?.getAttribute("data-completed")).toBe("1"); expect(finish).not.toHaveBeenCalled();
  });
  it("祖先 app-zoom 缩放时画面与按钮同用布局坐标，拖动按视觉缩放换算", () => {
    const game = new FactoryShift(cfg, 42); game.dock(); game.tick(.6);
    for (let i = 0; i < 4; i++) { game.solder(i); game.tick(.4); }
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("factory-shift") ? 852 : this.classList.contains("canvas-wrap") ? 656 : 0; });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("factory-shift") ? 394 : this.classList.contains("canvas-wrap") ? 263 : 0; });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const size = this.classList.contains("factory-shift") ? { width: 426, height: 197 } : this.classList.contains("canvas-wrap") ? { width: 328, height: 131.5 } : { width: 0, height: 0 };
      return { ...size, x: 0, y: 0, left: 0, top: 0, right: size.width, bottom: size.height, toJSON() {} };
    });
    start({ initialProgress: game.progress() });
    expect(target.querySelector(".factory-shift")?.getAttribute("data-factory-layout")).toBe("compact");
    const board = target.querySelector<HTMLButtonElement>(".board-hit")!;
    expect(parseFloat(board.style.width)).toBeGreaterThan(330);
    function pointer(name: string, x: number) { const e = new Event(name, { bubbles: true, cancelable: true }); Object.assign(e, { button: 0, clientX: x, pointerId: 8 }); board.dispatchEvent(e); flushSync(); }
    pointer("pointerdown", 100); pointer("pointermove", 160); pointer("pointerup", 160); frames(.6);
    expect(target.querySelector(".factory-shift")?.getAttribute("data-completed")).toBe("1");
  });
  it("外部暂停不能由内部继续按钮解除，物流两入口使用包裹和标签", () => {
    start({ sceneKey: "job_warehouse", paused: true });
    expect(target.querySelector(".factory-shift")?.getAttribute("data-factory-theme")).toBe("sorting");
    expect(target.textContent).toContain("扫码入位"); expect(target.textContent).toContain("核对标签");
    expect(target.querySelector<HTMLButtonElement>(".board-hit")!.disabled).toBe(true);
    expect(target.querySelector(".pause-card button")).toBeNull();
  });
  it("恢复半工单、右键辅助出货；结束结果单次提交，卸载清理帧与观察器", async () => {
    const game = new FactoryShift({ ...cfg, productsToWin: 1 }, 42); game.dock(); game.tick(.6); game.solder(0); game.tick(.4); game.solder(1); game.tick(.2);
    const { finish } = start({ cfg: { ...cfg, productsToWin: 1 }, initialProgress: game.progress() });
    expect(target.querySelector(".factory-shift")?.getAttribute("data-factory-stage")).toBe("welding"); frames(.3);
    for (const i of [3, 4]) { click(`.spot[aria-label="焊接第 ${i} 个焊点"]`); frames(.5); }
    target.querySelector(".board-hit")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); flushSync(); frames(.6);
    expect(finish).toHaveBeenCalledExactlyOnceWith(1); frames(30); expect(finish).toHaveBeenCalledTimes(1);
    await unmount(component!); component = undefined; expect(pending.size).toBe(0); expect(disconnect).toHaveBeenCalledTimes(1);
  });
  it("提前卸载未完成工位只清理，不会额外发工资结果", async () => {
    const { finish } = start(); click(".board-hit"); frames(.3);
    await unmount(component!); component = undefined; frames(30);
    expect(pending.size).toBe(0); expect(finish).not.toHaveBeenCalled();
  });
});
