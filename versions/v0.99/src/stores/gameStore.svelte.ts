/**
 * 游戏状态 store（Svelte 5 runes）。
 * 持有 GameState 并作为引擎与 UI 之间的唯一桥。
 * UI 只允许调用 dispatch 系列方法，不允许直接改 state。
 */
import type { GameState, Allocation } from "../game/types";
import { createInitialState, applyEffects, advanceTime } from "../game/engine";
import type { Effects } from "../game/engine";
import { applyFamily, applyAllocation } from "../game/core/families";
import { applyItem } from "../game/core/items";
import { periodOfHour, periodLabel } from "../game/core/time";
import { refreshDailyQuests } from "../game/core/quests";

/** 当前视图路由 */
export type View = "menu" | "game" | "ending" | "saveLoad" | "settings" | "background";

/** 新游戏设置 */
export interface NewGameSetup {
  familyId: string;
  allocation: Allocation;
  ownedItems: string[];
}

// ---- 游戏状态 ----
export const gameState = $state<GameState>(createInitialState());

/** 当前视图 */
export const currentView = $state<{ name: View }>({ name: "menu" });

// ---- 动作 ----

/** 开始新游戏（家庭条件 → 属性分配 → 物品 → 开局） */
export function newGame(setup: NewGameSetup, seed?: number): void {
  const s = createInitialState(seed);
  applyFamily(s, setup.familyId);
  applyAllocation(s, setup.allocation);
  for (const itemId of setup.ownedItems) {
    applyItem(s, itemId);
  }
  replaceState(s);
  currentView.name = "game";
}

/** 替换整个状态（读档/新游戏） */
export function replaceState(state: GameState): void {
  Object.assign(gameState, state);
  // 读档可能跨了现实中的"新一天"，先把任务栏对齐到当前游戏日
  refreshDailyQuests(gameState);
}

/** 推进时间（hours 小时） */
export function passTime(hours = 1): void {
  advanceTime(gameState, hours);
}

/** 执行一个带效果的动作并推进时长 */
export function doAction(effects: Effects, icon = "📝", hours = 1): void {
  applyEffects(gameState, effects, icon);
  advanceTime(gameState, hours);
}

/** 切换视图 */
export function goto(view: View): void {
  currentView.name = view;
}

/** 重置为初始状态（回主菜单） */
export function backToMenu(): void {
  replaceState(createInitialState());
  currentView.name = "menu";
}

/** 获取当前时段的中文名（由 hour 派生） */
export function currentPeriodLabel(): string {
  return periodLabel(periodOfHour(gameState.time.hour));
}

/** 当前时刻格式化（14:30） */
export function currentTimeLabel(): string {
  return `${String(gameState.time.hour).padStart(2, "0")}:${String(gameState.time.minute).padStart(2, "0")}`;
}
