/**
 * 背景选择系统：数据加载、应用所选经历到初始 GameState。
 * 纯逻辑层。v0.3 起退出新游戏流程（由家庭条件/属性分配取代），保留供未来"前 20 年经历"扩展。
 */
import type { GameState, BackgroundData } from "../types";
import { applyEffects } from "../engine";
import backgroundsData from "../data/backgrounds.json";

export const BACKGROUNDS: BackgroundData = backgroundsData as BackgroundData;

/**
 * 应用背景选择（在 createInitialState 之后调用）
 * - 空选择 / 未知维度 → 无副作用
 */
export function applyBackgrounds(state: GameState, selections: Record<string, string>): void {
  for (const dim of BACKGROUNDS.dimensions) {
    const optId = selections[dim.id];
    if (!optId) continue;
    const opt = dim.options.find((o) => o.id === optId);
    if (!opt) continue;
    applyEffects(state, opt.effects, opt.icon);
  }
}