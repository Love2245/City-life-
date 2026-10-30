// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import FactoryGame from "../src/components/layout/minigames/FactoryGame.svelte";
import { getMiniGameConfig, type FactoryCfg } from "../src/game/core/minigame";
import { factoryBoardGeometry, factoryPoints, type FactoryProgress, type FactoryTheme } from "../src/components/layout/minigames/factoryShift";

vi.mock("../src/lib/audio", () => ({ playInteractionSound:vi.fn(),playActionSound:vi.fn(),playSound:vi.fn() }));

const factories = [
  { key: "steel_shift", theme: "steel", dock: "点击钢坯开始轧制", points: ["切割第一段钢坯", "切割第二段钢坯", "切割第三段钢坯", "切割第四段钢坯"], docking: 1.05, processing: .45, object: "钢坯" },
  { key: "aluminum_recycle_shift", theme: "aluminum", dock: "点击铝料开始压制", points: ["修整左端铝材", "修整左中铝材", "修整右中铝材", "修整右端铝材"], docking: .9, processing: .45, object: "铝料" },
  { key: "glass_quality_shift", theme: "glass", dock: "点击玻璃开始灯检", points: ["检查玻璃气泡", "检查玻璃划痕", "检查玻璃裂纹", "检查玻璃厚度"], docking: .75, processing: .5, object: "玻璃" },
] as const;
type FactoryCase = (typeof factories)[number];
let component: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement;
let framesQueue = new Map<number, FrameRequestCallback>();
let frameSequence = 0, timestamp = 1000;
let disconnect: ReturnType<typeof vi.fn>;

beforeEach(() => {
  framesQueue = new Map(); frameSequence = 0; timestamp = 1000; disconnect = vi.fn();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++frameSequence; framesQueue.set(id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => framesQueue.delete(id));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() { disconnect(); } });
  target = document.createElement("div"); document.body.append(target);
});
afterEach(async () => { if (component) await unmount(component); component = undefined; target.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function frames(seconds: number) {
  for (let n = 0; n < Math.ceil(seconds * 20); n++) {
    timestamp += 50;
    const callbacks = [...framesQueue.values()]; framesQueue.clear();
    for (const callback of callbacks) callback(timestamp);
    flushSync();
  }
}
function config(key: string): FactoryCfg {
  const cfg = getMiniGameConfig(key);
  expect(cfg?.type).toBe("factory");
  return cfg as FactoryCfg;
}
function root() { return target.querySelector<HTMLDivElement>(".factory-shift")!; }
function board() { return target.querySelector<HTMLButtonElement>(".board-hit")!; }
function spots() { return [...target.querySelectorAll<HTMLButtonElement>(".spot")]; }
function click(button: HTMLButtonElement) { button.click(); flushSync(); }
function start(testCase: FactoryCase, extra: { initialProgress?: unknown; paused?: boolean } = {}) {
  const cfg = config(testCase.key), finish = vi.fn(), progress = vi.fn<(snapshot: unknown) => void>();
  component = mount(FactoryGame, { target, props: { cfg, sceneKey: testCase.key, seed: 89231, onFinish: finish, onProgress: progress, ...extra } });
  flushSync(); frames(.1);
  return { cfg, finish, progress, latest: () => progress.mock.calls.at(-1)![0] as FactoryProgress };
}
async function stop() { await unmount(component!); component = undefined; target.innerHTML = ""; expect(framesQueue.size).toBe(0); }
function processOne(testCase: FactoryCase) {
  click(board()); frames(testCase.docking + .05);
  expect(root().dataset.factoryStage).toBe("solder");
  for (let i = 0; i < 4; i++) { click(spots()[i]); frames(testCase.processing + .05); }
  expect(root().dataset.factoryStage).toBe("ship");
}
function pointer(type: string, clientX: number, pointerId = 17) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { button: 0, clientX, pointerId }); board().dispatchEvent(event); flushSync();
}
function drag(distance: number) { pointer("pointerdown", 120); pointer("pointermove", 120 + distance); pointer("pointerup", 120 + distance); }
function checkpoint(latest: () => FactoryProgress) {
  // Progress publishes on player actions, each whole second and pause; use the real pause checkpoint.
  click(target.querySelector<HTMLButtonElement>(".pause-btn")!);
  const saved = JSON.parse(JSON.stringify(latest())) as FactoryProgress;
  click(target.querySelector<HTMLButtonElement>(".pause-btn")!);
  return saved;
}

describe.each(factories)("工业真实组件 $theme", testCase => {
  it("真实配置显示本厂无障碍文案，四点必须按序点击且每点只完成一次", () => {
    const { latest, finish } = start(testCase);
    expect(root().dataset.factoryTheme).toBe(testCase.theme);
    expect(board().getAttribute("aria-label")).toBe(testCase.dock);
    expect(spots().map(button => button.getAttribute("aria-label"))).toEqual([...testCase.points]);
    expect(target.querySelector(".workstation")?.getAttribute("aria-label")).toBe(`${testCase.object}加工工位`);
    click(board()); frames(.65);
    expect(root().dataset.factoryStage).toBe("docking");
    frames(testCase.docking - .65 + .05);
    for (let i = 0; i < 4; i++) {
      expect(spots().filter(button => !button.disabled)).toEqual([spots()[i]]);
      const previous = JSON.stringify(latest());
      click(spots()[(i + 1) % 4]);
      expect(JSON.stringify(latest())).toBe(previous);
      click(spots()[i]); expect(root().dataset.factoryStage).toBe("welding");
      click(spots()[i]); frames(testCase.processing + .05);
      expect(spots().map(button => button.classList.contains("done"))).toEqual(Array.from({ length: 4 }, (_, point) => point <= i));
    }
    expect(root().dataset.factoryStage).toBe("ship"); expect(root().dataset.completed).toBe("0");
    expect(board().getAttribute("aria-label")).toBe(`按住${testCase.object}向右拖动，或按右方向键出货`);
    expect(finish).not.toHaveBeenCalled();
  });

  it("短拖不出货，足够右拖完成动画后只计一件，超时只提交一次结果", () => {
    const { cfg, latest, finish } = start(testCase); processOne(testCase);
    drag(15); frames(.6);
    expect(root().dataset.factoryStage).toBe("ship"); expect(latest().completed).toBe(0);
    expect(target.textContent).toContain("再往右拖一点");
    drag(130); pointer("pointerup", 250); frames(.3);
    expect(root().dataset.factoryStage).toBe("shipping"); expect(latest().completed).toBe(0);
    pointer("pointerdown", 120); pointer("pointermove", 260); pointer("pointerup", 260); frames(.3);
    expect(root().dataset.completed).toBe("1"); expect(checkpoint(latest).completed).toBe(1);
    pointer("pointerup", 260); frames(.5); expect(root().dataset.completed).toBe("1");
    frames((cfg.timeLimit ?? 30) + 2);
    expect(finish).toHaveBeenCalledExactlyOnceWith(1 / (cfg.productsToWin ?? 15));
    frames(5); expect(finish).toHaveBeenCalledTimes(1);
  });

  it("超过0.6秒的工业准备动画可以JSON保存恢复，外部暂停保留工序和剩余时间", async () => {
    const first = start(testCase); click(board()); frames(.65);
    click(target.querySelector<HTMLButtonElement>(".pause-btn")!);
    const saved = JSON.parse(JSON.stringify(first.latest())) as FactoryProgress;
    expect(saved.stage).toBe("docking"); expect(saved.animationTime).toBeGreaterThan(.6); expect(saved.animationTime).toBeLessThan(testCase.docking);
    await stop();
    const paused = start(testCase, { initialProgress: saved, paused: true });
    expect(root().dataset.factoryStage).toBe("docking"); expect(root().dataset.paused).toBe("true");
    expect(paused.latest()).toEqual(saved); frames(35); expect(paused.latest()).toEqual(saved);
    expect(board().disabled).toBe(true); expect(target.querySelector<HTMLButtonElement>(".pause-btn")!.disabled).toBe(true);
    expect(target.querySelector(".pause-card button")).toBeNull(); expect(paused.finish).not.toHaveBeenCalled();
    await stop();
    const resumed = start(testCase, { initialProgress: saved });
    frames(testCase.docking - saved.animationTime + .05);
    expect(root().dataset.factoryStage).toBe("solder"); expect(resumed.latest().completed).toBe(0);
    expect(resumed.latest().elapsed).toBeLessThan(saved.elapsed + .6);
    expect(resumed.latest().welded).toEqual([false, false, false, false]);
    click(spots()[0]); frames(testCase.processing + .05); expect(checkpoint(resumed.latest).welded).toEqual([true, false, false, false]);
  });
});

// Captured from the root agent's real Arcade browser QA, rather than treating the viewport as the floor.
const measuredLayouts = [
  { viewport: "932×430", host: { width: 916, height: 384 }, canvas: { width: 720, height: 254 }, mode: "compact" },
  { viewport: "852×394", host: { width: 836, height: 348 }, canvas: { width: 640, height: 218 }, mode: "compact" },
  { viewport: "390×844", host: { width: 374, height: 791 }, canvas: { width: 353, height: 213 }, mode: "regular" },
] as const;
const measuredCases = factories.flatMap(factory => measuredLayouts.map(layout => ({ factory, layout, label: `${factory.theme} / ${layout.viewport}` })));

describe("实际 Arcade 余量的工业工位输入", () => {
  it.each(measuredCases)("$label 板件和完整四点不越界，点击四道工序后可正常出货", ({ factory, layout }) => {
    function dimensions(element: HTMLElement) {
      return element.classList.contains("factory-shift") ? layout.host : element.classList.contains("canvas-wrap") ? layout.canvas : { width: 0, height: 0 };
    }
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return dimensions(this).width; });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) { return dimensions(this).height; });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const size = dimensions(this);
      return { ...size, x: 0, y: 0, left: 0, top: 0, right: size.width, bottom: size.height, toJSON() {} };
    });
    const { latest, finish } = start(factory);
    expect(root().dataset.factoryLayout).toBe(layout.mode);
    const geometry = factoryBoardGeometry(layout.canvas.width, layout.canvas.height, factory.theme as FactoryTheme);
    function verifyBounds() {
      const material = board(), left = parseFloat(material.style.left), top = parseFloat(material.style.top), width = parseFloat(material.style.width), height = parseFloat(material.style.height);
      expect(left).toBeGreaterThanOrEqual(0); expect(left + width).toBeLessThanOrEqual(layout.canvas.width);
      expect(top).toBeGreaterThanOrEqual(0); expect(top + height).toBeLessThanOrEqual(layout.canvas.height);
      expect(width).toBeCloseTo(geometry.w); expect(height).toBeCloseTo(geometry.h);
      const points = factoryPoints(factory.theme);
      spots().forEach((button, i) => {
        const px = parseFloat(button.style.left), py = parseFloat(button.style.top);
        expect(px).toBeCloseTo(left + points[i].x * geometry.scale); expect(py).toBeCloseTo(top + points[i].y * geometry.scale);
        expect(px - 24).toBeGreaterThanOrEqual(0); expect(px + 24).toBeLessThanOrEqual(layout.canvas.width);
        expect(py - 24).toBeGreaterThanOrEqual(0); expect(py + 24).toBeLessThanOrEqual(layout.canvas.height);
      });
    }
    verifyBounds();
    click(board()); frames(factory.docking + .05); verifyBounds();
    for (let i = 0; i < 4; i++) {
      expect(spots()[i].disabled).toBe(false); click(spots()[i]); frames(factory.processing + .05);
      verifyBounds(); expect(spots()[i].classList.contains("done")).toBe(true);
    }
    expect(root().dataset.factoryStage).toBe("ship"); drag(130); frames(.6);
    expect(root().dataset.completed).toBe("1"); expect(checkpoint(latest).completed).toBe(1); expect(finish).not.toHaveBeenCalled();
  });
});
