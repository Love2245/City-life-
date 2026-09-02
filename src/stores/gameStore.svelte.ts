/**
 * 游戏状态 store（Svelte 5 runes）。
 * 持有 GameState 并作为引擎与 UI 之间的唯一桥。
 * UI 只允许调用 dispatch 系列方法，不允许直接改 state。
 */
import type { GameState, Allocation, GameMode } from "../game/types";
import { createInitialState, applyEffects, advanceTime, pushLog } from "../game/engine";
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
import { adoptCat } from "../game/core/cat";
import { activePetOf } from "../game/core/catCare";
import { allOpponents, startBattle, startFunMatch } from "../game/core/catBattle";
import { loadProfile, saveProfile } from "../lib/profile";
import { startStory, STORY_DEFAULT_ALLOCATION, type StoryArcDef } from "../game/core/story";
import { ARC_MAP } from "../game/data/story";

/** 当前视图路由 */
export type View = "menu" | "game" | "ending" | "saveLoad" | "settings" | "background" | "fate" | "memoir" | "storyIntro" | "weeklyReport" | "arcade";

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
  // v1.38：开局即赠送初始猫咪（橘猫），作为玩家第一只伙伴
  adoptCat(s, "orange");
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
  // v1.38：开局即赠送初始猫咪（橘猫），作为玩家第一只伙伴
  adoptCat(s, "orange");
  const arc = startStory(s);
  replaceState(s);
  currentView.name = "storyIntro";
  return arc;
}

/** 故事简介页确认后进入游戏 */
export function confirmStoryStart(): void {
  gameState.story.introSeen = true;
  // v1.01：开局引导日志，明确「下一步做什么」
  const arc = storyArcDef(gameState.story.arc ?? "");
  pushLog(gameState, "📜", `剧情开始——「${arc?.title ?? "主线"}」。先在城里站稳脚跟：找份活干、攒钱/学技能，把目标一点一点往前推；每隔 5~9 天会有「人情债」找上门，打开手机【人情债】处理，别拖过期。`);
  pushLog(gameState, "💡", "手机任务栏可随时查看：阶段进度、目标进度、下次来事倒计时；给家里寄钱（寄钱回家）能直接推进金钱类目标");
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

/**
 * v1.36 首页「喵喵对决」：直接进入一场休闲对决，无需剧情 / 生活模拟前置。
 * - 若尚未携带猫咪，自动领养一只橘猫（取自 cats.json 数据，免费）；
 * - 优先开「喵喵娱乐赛」（casual），失败无惩罚、胜利随机加属性；
 * - 若猫咪等级过低没有合适的娱乐赛对手，兜底直接挑战一只 1 级对手；
 * - 置 cat_battle_pending 标记，由 GameView 捕获后弹出战斗界面。
 */
export function quickCatBattle(): void {
  if (!activePetOf(gameState)) {
    adoptCat(gameState, "orange");
  }
  let r = startFunMatch(gameState);
  if (!r.ok) {
    const opp = allOpponents().find((o) => (o.minLevel ?? 1) <= 1);
    if (opp) startBattle(gameState, opp.id, undefined, { casual: true });
    r = { ok: !!opp };
  }
  if (r.ok) {
    gameState.flags["cat_battle_pending"] = true;
  }
  goto("game");
}

/** 获取当前时段的中文名（由 hour 派生） */
export function currentPeriodLabel(): string {
  return periodLabel(periodOfHour(gameState.time.hour));
}

/** 当前时刻格式化（14:30） */
export function currentTimeLabel(): string {
  return `${String(gameState.time.hour).padStart(2, "0")}:${String(gameState.time.minute).padStart(2, "0")}`;
}
