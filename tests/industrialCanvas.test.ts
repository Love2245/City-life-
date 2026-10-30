import { afterEach, describe, expect, it, vi } from "vitest";
import { drawIndustrialScene, type IndustrialTheme } from "../src/components/layout/minigames/industrialCanvas";
import { drawFactoryScene, type FactoryView } from "../src/components/layout/minigames/factoryCanvas";
import { factoryBoardGeometry, factoryPoints, type FactorySnapshot, type FactoryStage } from "../src/components/layout/minigames/factoryShift";

function recorder() {
  const calls: unknown[][] = [], properties = new Map<PropertyKey, unknown>();
  const ctx = new Proxy({}, {
    get(_, key) {
      if (properties.has(key)) return properties.get(key);
      if (key === "createLinearGradient") return (...args: unknown[]) => {
        const stops: unknown[][] = [];
        calls.push([key, ...args, stops]);
        return { addColorStop(offset: number, color: string) { expect(offset).toBeGreaterThanOrEqual(0); expect(offset).toBeLessThanOrEqual(1); stops.push([offset, color]); } };
      };
      return (...args: unknown[]) => { calls.push([key, ...args]); };
    },
    set(_, key, value) { properties.set(key, value); calls.push(["set", key, value]); return true; },
  }) as CanvasRenderingContext2D;
  return { ctx, calls };
}
function snapshot(stage: FactoryStage = "ready"): FactorySnapshot {
  return { stage, welded: stage === "ship" || stage === "shipping" ? [true, true, true, true] : [true, false, false, false], activePoint: 1, animationProgress: .5, completed: 2, boardId: 3, elapsed: 12, timeLeft: 18, target: 8, paused: false, finished: false, ratio: .25, material: { name: "材料", icon: "▣" }, destination: "东区 01" };
}
const baseView: FactoryView = { width: 656, height: 263, visualTime: 8.5, reducedMotion: false, arrival: 0, dragX: 0 };
afterEach(() => vi.restoreAllMocks());

describe("三种工业 Canvas：状态确定、工位尺寸和样本画面", () => {
  it.each(["steel", "aluminum", "glass"] as IndustrialTheme[])("%s 六工序在横屏及竖屏余高均能返回与点击区相同的几何", theme => {
    const stages: FactoryStage[] = ["ready", "docking", "solder", "welding", "ship", "shipping"];
    for (const [width, height] of [[736, 299], [656, 263], [340, 420], [620, 180], [320, 140]]) {
      for (const stage of stages) {
        const recording = recorder(), state = snapshot(stage), view = { ...baseView, width, height };
        const result = drawIndustrialScene(recording.ctx, state, view, theme), expected = factoryBoardGeometry(width, height, theme);
        expect({ x: result.x, y: result.y, w: result.w, h: result.h, scale: result.scale }).toEqual(expected);
        expect(result.y).toBeGreaterThanOrEqual(0); expect(result.y + result.h).toBeLessThanOrEqual(height);
        expect(result.x).toBeGreaterThanOrEqual(0); expect(result.x + result.w).toBeLessThanOrEqual(width);
        for (const point of factoryPoints(theme)) {
          const px = result.x + point.x * result.scale, py = result.y + point.y * result.scale;
          expect(px - 24).toBeGreaterThanOrEqual(0); expect(px + 24).toBeLessThanOrEqual(width);
          expect(py - 24).toBeGreaterThanOrEqual(0); expect(py + 24).toBeLessThanOrEqual(height);
        }
        for (const call of recording.calls) for (const value of call.slice(1)) if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
        const saves = recording.calls.filter(call => call[0] === "save").length, restores = recording.calls.filter(call => call[0] === "restore").length;
        expect(restores).toBe(saves);
      }
    }
  });
  it.each(["steel", "aluminum", "glass"] as IndustrialTheme[])("%s 绘图不读DOM/随机数、不改快照，相同输入得到相同画面指令", theme => {
    vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("绘图不能消耗 RNG"); });
    const state = snapshot("welding"), before = JSON.stringify(state), a = recorder(), b = recorder();
    Object.freeze(state.welded); Object.freeze(state.material); Object.freeze(state);
    drawIndustrialScene(a.ctx, state, baseView, theme); drawIndustrialScene(b.ctx, state, baseView, theme);
    expect(JSON.stringify(a.calls)).toBe(JSON.stringify(b.calls)); expect(JSON.stringify(state)).toBe(before);
  });
  it.each(["steel", "aluminum", "glass"] as IndustrialTheme[])("%s 工业分派、拖动和出货动画沿用同一板件位移", theme => {
    const state = snapshot("shipping"), view = { ...baseView, dragX: 35 }, direct = recorder(), routed = recorder();
    const a = drawIndustrialScene(direct.ctx, state, view, theme), b = drawFactoryScene(routed.ctx, state, view, theme);
    expect(b).toEqual(a); expect(JSON.stringify(routed.calls)).toBe(JSON.stringify(direct.calls));
    const geometry = factoryBoardGeometry(view.width, view.height, theme), t = 1 - Math.pow(1 - state.animationProgress, 3);
    expect(a.dx).toBeCloseTo(35 + (view.width - geometry.x - 35 + 25) * t);
  });
  it("钢铁高温与冷却渐变不同，已切割缝和设计四点坐标一致", () => {
    const hot = recorder(), cooled = recorder(), state = snapshot("solder");
    state.welded = [true, true, false, false];
    const g = drawIndustrialScene(hot.ctx, state, baseView, "steel");
    drawIndustrialScene(cooled.ctx, snapshot("ship"), baseView, "steel");
    expect(JSON.stringify(hot.calls)).toContain("#ff813b"); expect(JSON.stringify(cooled.calls)).toContain("#758e9f");
    const gap = Math.max(2, 3.5 * g.scale);
    for (const point of [72, 144]) expect(hot.calls.some(call => call[0] === "fillRect" && Math.abs(Number(call[1]) - (g.x + point * g.scale - gap / 2)) < 1e-6)).toBe(true);
  });
  it("铝材压制前有边角料，成品有回收铝标识；玻璃四区通过后清除待检纹理", () => {
    const aluminumRaw = recorder(), aluminumDone = recorder(), glassBefore = recorder(), glassDone = recorder();
    drawIndustrialScene(aluminumRaw.ctx, snapshot("ready"), baseView, "aluminum");
    drawIndustrialScene(aluminumDone.ctx, snapshot("ship"), baseView, "aluminum");
    expect(aluminumRaw.calls.filter(call => call[0] === "rotate").length).toBe(13);
    expect(JSON.stringify(aluminumDone.calls)).toContain("AL / RECYCLED");
    const unchecked = snapshot("solder"); unchecked.welded = [false, false, false, false];
    drawIndustrialScene(glassBefore.ctx, unchecked, baseView, "glass"); drawIndustrialScene(glassDone.ctx, snapshot("ship"), baseView, "glass");
    expect(JSON.stringify(glassBefore.calls)).toContain("气泡"); expect(JSON.stringify(glassBefore.calls)).toContain("划痕");
    expect(JSON.stringify(glassBefore.calls)).toContain("裂纹"); expect(JSON.stringify(glassBefore.calls)).toContain("厚度");
    expect(JSON.stringify(glassDone.calls)).toContain("OPTICAL QA / PASS");
    expect(JSON.stringify(glassDone.calls)).not.toContain("#68968d70");
  });
  it("减少动态时保留加工状态效果，但不旋转锯盘或生成运动火花", () => {
    const reduced = recorder(), moving = recorder(), state = snapshot("welding");
    drawIndustrialScene(reduced.ctx, state, { ...baseView, reducedMotion: true }, "steel"); drawIndustrialScene(moving.ctx, state, baseView, "steel");
    expect(reduced.calls.filter(call => call[0] === "rotate").every(call => call[1] === 0)).toBe(true);
    expect(moving.calls.filter(call => call[0] === "rotate").some(call => call[1] !== 0)).toBe(true);
    expect(moving.calls.length).toBeGreaterThan(reduced.calls.length);
  });
});
