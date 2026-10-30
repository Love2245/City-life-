import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { configuredMiniGameKeys } from "../src/game/core/minigame";
import {
  bowlingHitCount,
  bowlingPinPositions,
  bowlingScoreRatio,
  dartBalloonPositions,
  dartsScoreRatio,
  normalizedPoint,
  ringTossScoreRatio,
  ringTossTargets,
} from "../src/game/core/minigameGeometry";

describe("v1.42 游乐场小游戏几何与计分", () => {
  it("保龄球按配置数量生成球瓶，命中数和比例始终有界", () => {
    expect(bowlingPinPositions(10)).toHaveLength(10);
    expect(bowlingPinPositions(6)).toHaveLength(6);
    expect(bowlingHitCount([30, 40, 50, 60], 50, 1)).toBeGreaterThan(0);
    expect(bowlingHitCount([30, 40], 50, 1)).toBeLessThanOrEqual(2);
    expect(bowlingScoreRatio(8, 10)).toBeCloseTo(0.8);
    expect(bowlingScoreRatio(99, 10)).toBe(1);
  });

  it("飞镖气球随数量动态铺开，红心扣分不会超过 0", () => {
    expect(dartBalloonPositions(3)).toHaveLength(3);
    expect(dartBalloonPositions(17)).toHaveLength(17);
    expect(dartsScoreRatio(5, 0, 8)).toBeCloseTo(0.625);
    expect(dartsScoreRatio(2, 2, 8)).toBe(0);
  });

  it("套圈使用 targetCount，并按实际最高奖品分数计算比例", () => {
    const targets = ringTossTargets(9);
    expect(targets).toHaveLength(9);
    expect(new Set(targets.map((target) => target.value)).size).toBeGreaterThan(1);
    expect(Math.max(...targets.map((target) => target.value))).toBe(3);
    expect(ringTossScoreRatio(9, 3, targets)).toBeLessThanOrEqual(1);
    const maxValue = Math.max(...targets.map((target) => target.value));
    expect(ringTossScoreRatio(maxValue, 1, targets)).toBeCloseTo(1);
  });

  it("缩放后 pointer 坐标仍以实际游戏区域归一化", () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };
    expect(normalizedPoint(300, 150, rect)).toEqual({ x: 50, y: 50 });
    expect(normalizedPoint(0, 0, rect)).toEqual({ x: 0, y: 0 });
    expect(normalizedPoint(999, 999, rect)).toEqual({ x: 100, y: 100 });
  });

  it("小游戏入口含重工业三厂与新增摊位票务，原有 42 张场景贴图保持资源预算", () => {
    // 三厂由 Canvas 绘制，不新增静态背景贴图；手机端再加 4 款。
    expect(configuredMiniGameKeys()).toHaveLength(53);
    expect(configuredMiniGameKeys().length + 4).toBe(57);

    const sceneDir = resolve(process.cwd(), "src/assets/ui/v1.42/minigame-scenes");
    const scenes = readdirSync(sceneDir).filter((name) => name.endsWith(".webp"));
    expect(scenes).toHaveLength(42);
    const totalBytes = scenes.reduce((sum, name) => sum + statSync(resolve(sceneDir, name)).size, 0);
    expect(totalBytes).toBeLessThan(2_000_000);
  });
});
