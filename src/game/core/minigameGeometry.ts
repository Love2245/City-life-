/** v1.42 三款游乐场小游戏的纯几何/计分函数。 */

export interface NormalizedPoint { x: number; y: number }

/** 将 pointer 坐标转换为实际游戏画布内的 0–100 百分比。 */
export function normalizedPoint(clientX: number, clientY: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">): NormalizedPoint {
  return {
    x: rect.width > 0 ? Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)) : 50,
    y: rect.height > 0 ? Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)) : 50,
  };
}

/** 生成任意数量球瓶的归一化三角阵列，数量超过 10 时仍保持在球道内。 */
export function bowlingPinPositions(count: number): Array<{ x: number; y: number }> {
  const n = Math.max(0, Math.floor(count));
  const rows: Array<{ x: number; y: number }> = [];
  let row = 1;
  while (rows.length < n) {
    const y = 24 + (row - 1) * 9;
    const width = Math.min(46, 10 + (row - 1) * 7);
    for (let i = 0; i < row && rows.length < n; i++) rows.push({ x: 50 - width / 2 + (row === 1 ? 0 : (width * i) / (row - 1)), y });
    row += 1;
  }
  return rows;
}

export function bowlingHitCount(standingXs: number[], aimX: number, power: number): number {
  if (standingXs.length === 0) return 0;
  const accuracy = 1 - Math.min(1, Math.abs(aimX - 50) / 24);
  const requested = Math.max(1, Math.round((1.5 + Math.max(0, Math.min(1, power)) * 4) * (0.55 + accuracy * 0.45)));
  return Math.min(standingXs.length, requested);
}

export function bowlingScoreRatio(knocked: number, pinCount: number): number {
  return Math.max(0, Math.min(1, pinCount > 0 ? knocked / pinCount : 0));
}

/** 用黄金角分布生成气球，数量变化时仍铺满墙面且不越界。 */
export function dartBalloonPositions(count: number): Array<{ x: number; y: number }> {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const out: Array<{ x: number; y: number }> = [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.35)));
  const rows = Math.ceil(n / cols);
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const stagger = row % 2 ? 0.5 : 0;
    out.push({ x: 10 + ((col + stagger) / Math.max(1, cols - 0.5)) * 80, y: 16 + (row / Math.max(1, rows - 1)) * 62 });
  }
  return out;
}

export function dartsScoreRatio(goodHits: number, heartHits: number, goodBalloonCount: number): number {
  const denominator = Math.max(1, goodBalloonCount);
  return Math.max(0, Math.min(1, (goodHits - heartHits * 2) / denominator));
}

export interface RingTargetPoint { x: number; y: number; value: number; label: string; hitRate: number }

/** 目标数量来自 cfg.targetCount，目标值和命中率随距离递进。 */
export function ringTossTargets(count: number): RingTargetPoint[] {
  const labels = ["布偶", "小摆件", "茶具", "收音机", "大玩偶", "远处奖品", "限量模型", "巨型玩偶"];
  const n = Math.max(1, Math.floor(count));
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const col = i % 4;
    const row = Math.floor(i / 4);
    return {
      x: 12 + col * (76 / Math.max(1, Math.min(3, n - 1))),
      y: 25 + ((row * 27 + (i % 2) * 9) % 52),
      // 近处 1 分、远处最高 3 分；与界面提示及奖品配置保持一致。
      value: 1 + Math.min(2, Math.floor(t * 3)),
      label: labels[i % labels.length],
      hitRate: Math.max(0.25, 0.78 - t * 0.45),
    };
  });
}

export function ringTossScoreRatio(points: number, rings: number, targets: Array<{ value: number }>): number {
  const maxValue = Math.max(1, ...targets.map((t) => t.value));
  return Math.max(0, Math.min(1, points / Math.max(1, rings * maxValue)));
}
