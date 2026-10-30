import { describe, expect, it } from "vitest";
import type { FactoryCfg } from "../src/game/core/minigame";
import { FACTORY_POINTS, FactoryShift, factoryBoardGeometry, factoryShipThreshold, factoryTheme } from "../src/components/layout/minigames/factoryShift";

const cfg: FactoryCfg = { type: "factory", title: "流水线装配", icon: "🏭", desc: "", productsToWin: 3, timeLimit: 30, parts: [{ id: "board", name: "电路板", icon: "▣" }, { id: "chip", name: "芯片", icon: "▦" }] };
function completeOne(game: FactoryShift) {
  expect(game.dock()).toBe(true); game.tick(.6);
  for (let i = 0; i < 4; i++) { expect(game.solder(i)).toBe(true); game.tick(.4); }
  expect(game.ship()).toBe(true); game.tick(.45);
}

describe("重置工位：样本流程、计分和真实续班", () => {
  it("五个工作入口共用电子装配或物流分拣主题", () => {
    for (const key of ["job_factory_line", "job_factory_qc", "job_factory_tech"]) expect(factoryTheme(key)).toBe("assembly");
    for (const key of ["job_sorting", "job_warehouse"]) expect(factoryTheme(key)).toBe("sorting");
  });
  it("点板自动对接、逐个处理四点、出货后才增加产量", () => {
    const game = new FactoryShift(cfg, 42);
    expect(game.solder(0)).toBe(false); expect(game.ship()).toBe(false);
    expect(game.dock()).toBe(true); expect(game.dock()).toBe(false);
    game.tick(.59); expect(game.snapshot().stage).toBe("docking");
    game.tick(.01); expect(game.snapshot().activePoint).toBe(0);
    expect(game.solder(1)).toBe(false);
    for (let i = 0; i < 4; i++) {
      expect(game.solder(i)).toBe(true);
      expect(game.solder(i)).toBe(false);
      game.tick(.4);
    }
    expect(game.snapshot().stage).toBe("ship");
    expect(game.snapshot().completed).toBe(0);
    game.ship(); game.tick(.449); expect(game.snapshot().completed).toBe(0);
    game.tick(.001); expect(game.snapshot().completed).toBe(1);
    expect(game.snapshot().welded).toEqual([false, false, false, false]);
  });
  it("一次大 tick 不会自动完成需要玩家点击的后续操作", () => {
    const game = new FactoryShift({ ...cfg, timeLimit: 0 }, 42);
    game.dock(); game.tick(100);
    expect(game.snapshot().stage).toBe("solder"); expect(game.snapshot().completed).toBe(0);
  });
  it("时间到只结算已出货件数，达标结束后操作和 tick 不再改变结果", () => {
    const game = new FactoryShift(cfg, 42);
    completeOne(game); game.dock(); game.tick(30);
    expect(game.snapshot().finished).toBe(true); expect(game.snapshot().ratio).toBeCloseTo(1 / 3);
    const stopped = game.progress(); expect(game.tick(30)).toBe(false); expect(game.dock()).toBe(false); expect(game.progress()).toEqual(stopped);
    const perfect = new FactoryShift({ ...cfg, productsToWin: 1 }, 42); completeOne(perfect);
    expect(perfect.snapshot().finished).toBe(true); expect(perfect.snapshot().ratio).toBe(1);
  });
  it("出货动画在截止时间前没完成的半件不会计产量", () => {
    const game = new FactoryShift({ ...cfg, timeLimit: 2.3 }, 42);
    game.dock(); game.tick(.6); for (let i = 0; i < 4; i++) { game.solder(i); game.tick(.4); }
    game.ship(); game.tick(.45);
    expect(game.snapshot().finished).toBe(true); expect(game.snapshot().completed).toBe(0);
    expect(game.snapshot().elapsed).toBeCloseTo(2.3);
  });
  it("暂停冻结计时和动画，也拒绝操作；恢复后只继续剩余动画", () => {
    const game = new FactoryShift(cfg, 42); game.dock(); game.tick(.2); game.setPaused(true);
    const before = game.progress(); expect(game.tick(99)).toBe(false); expect(game.solder(0)).toBe(false); expect(game.progress()).toEqual(before);
    game.setPaused(false); game.tick(.4); expect(game.snapshot().stage).toBe("solder"); expect(game.snapshot().elapsed).toBeCloseTo(.6);
  });
  it("半完成工单 JSON 存档能恢复焊点、半段动画、用时、产量和后续随机流", () => {
    const original = new FactoryShift(cfg, 8123); completeOne(original);
    original.dock(); original.tick(.6); original.solder(0); original.tick(.4); original.solder(1); original.tick(.2);
    original.dragRatio = .18;
    const saved = JSON.parse(JSON.stringify(original.progress()));
    const restored = new FactoryShift(cfg, 999, saved);
    expect(restored.snapshot()).toEqual(original.snapshot()); expect(restored.progress()).toEqual(original.progress());
    for (const game of [original, restored]) {
      game.tick(.2); game.solder(2); game.tick(.4); game.solder(3); game.tick(.4); game.ship(); game.tick(.45);
    }
    expect(restored.snapshot()).toEqual(original.snapshot()); expect(restored.progress().rng).toEqual(original.progress().rng);
    expect(restored.snapshot().completed).toBe(2);
  });
  it("同 seed 相同工单，独立局不污染对方；损坏快照回到新工位", () => {
    const a = new FactoryShift(cfg, 9), b = new FactoryShift(cfg, 9), other = new FactoryShift(cfg, 123);
    other.dock(); other.tick(1); completeOne(a); completeOne(b); expect(a.progress()).toEqual(b.progress());
    expect(new FactoryShift(cfg, 9, { ...a.progress(), welded: [false, true, false, false] }).snapshot().completed).toBe(0);
    expect(new FactoryShift(cfg, 9, { ...a.progress(), elapsed: Infinity }).snapshot().elapsed).toBe(0);
  });
  it("小屏与横屏工件及四个按钮中心仍在区域内，拖动阈值按工件缩放", () => {
    for (const [w, h] of [[280, 300], [390, 300], [620, 245], [900, 360]]) {
      const board = factoryBoardGeometry(w, h);
      expect(board.x).toBeGreaterThan(0); expect(board.x + board.w).toBeLessThan(w);
      expect(board.y + board.h).toBeLessThan(h);
      expect(factoryShipThreshold(board.w)).toBeGreaterThanOrEqual(24);
      expect(factoryShipThreshold(board.w)).toBeLessThanOrEqual(100);
    }
  });
  it("有限高 Canvas 中整块板件及完整 48 px 点击区域都可见", () => {
    // Host headers reduce a 430/394 px landscape viewport further. Check actual short floors too.
    for (const [w, h] of [[736, 299], [656, 263], [620, 180], [510, 160], [320, 140]]) {
      const board = factoryBoardGeometry(w, h);
      expect(board.y).toBeGreaterThanOrEqual(0);
      expect(board.y + board.h).toBeLessThanOrEqual(h);
      expect(board.x).toBeGreaterThanOrEqual(0);
      expect(board.x + board.w).toBeLessThanOrEqual(w);
      for (const point of FACTORY_POINTS) {
        const px = board.x + point.x * board.scale, py = board.y + point.y * board.scale;
        expect(px - 24).toBeGreaterThanOrEqual(0);
        expect(px + 24).toBeLessThanOrEqual(w);
        expect(py - 24).toBeGreaterThanOrEqual(0);
        expect(py + 24).toBeLessThanOrEqual(h);
      }
      if (h >= 180) {
        // Consecutive top/bottom targets remain separated enough for 48 px touch buttons.
        expect(80 * board.scale).toBeGreaterThanOrEqual(48);
        expect(71 * board.scale).toBeGreaterThanOrEqual(48);
      }
    }
  });
  it("画面高度改变只缩放工位，不重置半件工序或产量", () => {
    const game = new FactoryShift(cfg, 42); completeOne(game); game.dock(); game.tick(.6); game.solder(0); game.tick(.2);
    const progress = game.progress();
    const portrait = factoryBoardGeometry(320, 340), landscape = factoryBoardGeometry(656, 263);
    expect(landscape.w).toBeGreaterThan(portrait.w);
    expect(game.progress()).toEqual(progress);
    expect(game.snapshot().stage).toBe("welding");
    expect(game.snapshot().completed).toBe(1);
  });
});
