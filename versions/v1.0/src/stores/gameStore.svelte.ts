/**
 * 游戏状态 store（Svelte 5 runes）。
 * 持有 GameState 并作为引擎与 UI 之间的唯一桥。
 * UI 只允许调用 dispatch 系列方法，不允许直接改 state。
 */
import type { GameState, Allocation, GameMode } from "../game/types";
import { createInitialState, applyEffects, advanceTime } from "../game/engine";
import type { Effects } from "../game/engine";
import { periodOfHour, periodLabel } from "../game/core/time";
import { refreshDailyQuests } from "../game/core/quests";
import {
  applyNewGameSetup,
  emptyProfile,
  settleProfile,
  type ProfileState,
} from "../game/core/profile";
import { getEnding } from "../game/core/endings";
import { loadProfile, saveProfile } from "../lib/profile";
import { startStory, STORY_DEFAULT_ALLOCATION, type StoryArcDef } from "../game/core/story";
import { ARC_MAP } from "../game/data/story";

/** 当前视图路由 */
export type View = "menu" | "game" | "ending" | "saveLoad" | "settings" | "background" | "fate" | "memoir" | "storyIntro";

/** 新游戏设置 */
export interface NewGameSetup {
  familyId: string;
  allocation: Allocation;
  ownedItems: string[];
  /** v0.991 模式：normal / eternal / story（后两者需解锁） */
  mode?: GameMode;
}

// ---- 游戏状态 ----
export const gameState = $state<GameState>(createInitialState());

/** v0.991 多周目档案（命运点 / 永久加成 / 回忆录 / 模式解锁） */
export const profile = $state<ProfileState>(emptyProfile());

/** 当前视图 */
export const currentView = $state<{ name: View }>({ name: "menu" });

/** v0.991 即将开始的新局模式（主菜单入口预选，开局界面确认） */
export const pendingState = $state<{ mode: GameMode }>({ mode: "normal" });

/** 预选新局模式（主菜单「永恒模式」入口调用） */
export function setPendingMode(m: GameMode): void {
  pendingState.mode = m;
}

// ---- 动作 ----

/** 载入多周目档案（应用启动 / 主菜单挂载时调用一次） */
let profileLoading = false;
export async function loadProfileIntoStore(): Promise<void> {
  // v0.992 防抖：与 FateView 异步写盘并存时避免极小竞态
  if (profileLoading) return;
  profileLoading = true;
  try {
    const p = await loadProfile();
    Object.assign(profile, p);
  } finally {
    profileLoading = false;
  }
}

/** 持久化当前档案 */
export async function persistProfile(): Promise<void> {
  await saveProfile(profile);
}

/** 开始新游戏（家庭条件 → 属性分配 → 物品 → 永久加成 → 模式，顺序铁律见 applyNewGameSetup） */
export function newGame(setup: NewGameSetup, seed?: number): void {
  const s = createInitialState(seed);
  // v0.992：完整开局流程收敛到纯逻辑函数，顺序 bug 可被集成测试锁定
  applyNewGameSetup(s, setup.familyId, setup.allocation, setup.ownedItems, profile, setup.mode ?? "normal");
  replaceState(s);
  currentView.name = "game";
}

/**
 * v1.0 剧情模式开局：固定赤贫出身（唯一劳动力 + 爱赌的家人 + 托关系进城），
 * 随机抽一条主线，先进故事简介页，玩家确认后再进入游戏。
 */
export function startStoryGame(seed?: number): StoryArcDef {
  const s = createInitialState(seed);
  applyNewGameSetup(s, "destitute", STORY_DEFAULT_ALLOCATION, [], profile, "story");
  const arc = startStory(s);
  replaceState(s);
  currentView.name = "storyIntro";
  return arc;
}

/** 故事简介页确认后进入游戏 */
export function confirmStoryStart(): void {
  gameState.story.introSeen = true;
  currentView.name = "game";
}

/** 主线定义查询（简介页/结局页用） */
export function storyArcDef(id: string): StoryArcDef | undefined {
  return ARC_MAP[id as keyof typeof ARC_MAP];
}

/**
 * v0.991 结局结算：发放命运点 + 写回忆录 + 解锁永恒/剧情模式。
 * 幂等：同一结局只结算一次（防睡眠结算重复触发）。
 */
export function settleEndingProfile(): void {
  if (!gameState.endingId || gameState.flags["fate_settled"]) return;
  const ending = getEnding(gameState.endingId);
  if (!ending) return;
  const points = settleProfile(profile, gameState, ending);
  gameState.flags["fate_settled"] = true;
  void saveProfile(profile);
  void points;
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
