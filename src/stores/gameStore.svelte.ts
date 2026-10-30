import { cancelSceneLoading } from './sceneLoading.svelte';
/**
 * 游戏状态 store（Svelte 5 runes）。
 * 持有 GameState 并作为引擎与 UI 之间的唯一桥。
 * UI 只允许调用 dispatch 系列方法，不允许直接改 state。
 */
import type { GameState, Allocation, GameMode } from "../game/types";
import { createInitialState, applyEffects, advanceTime } from "../game/engine";
import {initializeFinancialRisk,recordFinancialEvent,applyFinancialSanctions} from '../game/core/financialRisk';
import {newFinancialLifeId} from '../lib/financialRiskStorage';
import type { Effects } from "../game/engine";
import { periodOfHour, periodLabel } from "../game/core/time";
import { refreshDailyQuests } from "../game/core/quests";
import {
  applyNewGameSetup,
  emptyProfile,
  settleProfile,
  syncProfileEndings,
  type ProfileState,
} from "../game/core/profile";
import { getEnding } from "../game/core/endings";
import { residenceLocationId, residenceRegion, currentResidence } from "../game/core/residence";
import { regionPathOf } from "../game/core/regions";
import { openDuelPractice } from "./catDuelStore.svelte";
import { loadProfile, saveProfile, saveProfileImmediately } from "../lib/profile";
import { ARCHIVE_ONLY_SAVE_FAILURE } from "../lib/saveStatus";

/** 当前视图路由 */
export type View = "menu" | "game" | "ending" | "saveLoad" | "settings" | "background" | "fate" | "memoir" | "weeklyReport" | "arcade";

/** 新游戏设置 */
export interface NewGameSetup {
  familyId: string;
  allocation: Allocation;
  ownedItems: string[];
  /** v0.991 模式：normal / eternal / story（后两者需解锁） */
  mode?: GameMode;
}

// ---- 游戏状态 ----
const reactiveGameState = $state<GameState>(createInitialState());
const checkpointRevision = $state({ value: 0 });
const observedObjects = new WeakMap<object, object>();

/** Track every nested state write in O(1), including writes from frame-based games. */
function observeGameState<T>(value: T): T {
  if (!value || typeof value !== "object" || value instanceof Date || value instanceof Map || value instanceof Set) return value;
  const source = value as object;
  const cached = observedObjects.get(source);
  if (cached) return cached as T;
  const proxy = new Proxy(source, {
    get(target, key, receiver) {
      return observeGameState(Reflect.get(target, key, receiver));
    },
    set(target, key, next) {
      const previous = Reflect.get(target, key, target);
      const ok = Reflect.set(target, key, next, target);
      if (ok && !Object.is(previous, next)) checkpointRevision.value++;
      return ok;
    },
    deleteProperty(target, key) {
      const existed = Reflect.has(target, key);
      const ok = Reflect.deleteProperty(target, key);
      if (ok && existed) checkpointRevision.value++;
      return ok;
    },
  });
  observedObjects.set(source, proxy);
  // Array operations such as slice/splice can write an observed entry back into
  // state. Reusing that proxy prevents an extra wrapper on every subsequent read.
  observedObjects.set(proxy, proxy);
  return proxy as T;
}

export const gameState: GameState = observeGameState(reactiveGameState);

/** Runtime-only identity for audio transitions; it never becomes part of a save. */
export const musicSession = $state({ value: 0 });

/** v0.991 多周目档案（命运点 / 永久加成 / 回忆录 / 模式解锁） */
export const profile = $state<ProfileState>(emptyProfile());

/** 当前视图 */
export const currentView = $state<{ name: View }>({ name: "menu" });

/** 页面入口来源：菜单页返回菜单，游戏内菜单返回游戏。 */
export const navigation = $state<{ returnView: View }>({ returnView: "menu" });
const pageViews = new Set<View>(["ending", "saveLoad", "settings", "fate", "memoir", "weeklyReport"]);

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
export async function persistProfile(): Promise<boolean> {
  return await saveProfile(profile);
}

let checkpointInFlight = false;
let checkpointPending = false;
let checkpointPromise: Promise<void> | null = null;
let sessionDirty = false;
export const autoSaveStatus = $state({ status: "idle" as "idle" | "saving" | "saved" | "failed", error: "" });
export function markSessionDirty(): void { sessionDirty = true; }
export function isSessionDirty(): boolean { return sessionDirty; }
export function markSessionClean(): void { sessionDirty = false; }

/** 将本局结局图鉴可靠并入跨周目档案；先写存储，再更新内存，失败时可重试。 */
export function persistUnlockedEndings(state: GameState = gameState): boolean {
  const nextProfile = JSON.parse(JSON.stringify(profile)) as ProfileState;
  if (!syncProfileEndings(nextProfile, state)) return true;
  if (!saveProfileImmediately(nextProfile)) return false;
  Object.assign(profile, nextProfile);
  return true;
}

/** True while a living session is visible, including game-owned reports and settings pages. */
export function shouldCheckpointGameSession(): boolean {
  if (gameState.flags["cat_battle_sandbox"] === true) return false;
  if (currentView.name === "game") return true;
  return pageViews.has(currentView.name) && navigation.returnView === "game";
}

/** Lightweight mutation fingerprint; full serialization happens only when a save is written. */
export function checkpointFingerprint(state: GameState): string {
  // Callers that pass an ordinary detached state still need a useful fingerprint.
  // The live store uses mutation tracking so frame-based games stay O(1).
  if (state !== gameState) return JSON.stringify(state);
  return String(checkpointRevision.value);
}
/** 防抖后的自动存档入口：由 App 在游戏状态发生稳定变化时调用。 */
async function runCheckpointAutoSave(): Promise<void> {
  checkpointInFlight = true;
  autoSaveStatus.status = "saving";
  autoSaveStatus.error = "";
  try {
    const { saveGame } = await import("../lib/save");
    const archived = persistUnlockedEndings(gameState);
    // saveGame 会写入 saved_once；先显式置位，便于用快照比较判断写入期间是否又有动作。
    gameState.flags["saved_once"] = true;
    const fingerprint = checkpointFingerprint(gameState);
    await saveGame("auto", gameState);
    if (archived) {
      autoSaveStatus.status = "saved";
    } else {
      autoSaveStatus.status = "failed";
      autoSaveStatus.error = ARCHIVE_ONLY_SAVE_FAILURE;
    }
    if (checkpointFingerprint(gameState) === fingerprint) sessionDirty = false;
    else checkpointPending = true;
  } catch (error) {
    sessionDirty = true;
    autoSaveStatus.status = "failed";
    autoSaveStatus.error = error instanceof Error ? error.message : "存储不可用，请释放空间或导出存档";
    checkpointPending = false;
  } finally {
    checkpointInFlight = false;
    if (checkpointPending) {
      checkpointPending = false;
      if (shouldCheckpointGameSession()) await runCheckpointAutoSave();
    }
  }
}

export async function checkpointAutoSave(): Promise<void> {
  if (!shouldCheckpointGameSession()) return;
  if (checkpointInFlight) {
    // Storage is busy; the active write chains one more snapshot before settling.
    checkpointPending = true;
    return;
  }
  const task = runCheckpointAutoSave();
  checkpointPromise = task;
  try {
    await task;
  } finally {
    if (checkpointPromise === task) checkpointPromise = null;
  }
}

/** Wait until the active and any queued checkpoint writes have settled. */
export async function waitForCheckpointAutoSave(): Promise<void> {
  while (checkpointPromise) {
    const task = checkpointPromise;
    await task;
    if (checkpointPromise === task) return;
  }
}

/** 开始新游戏（家庭条件 → 属性分配 → 物品 → 永久加成 → 模式，顺序铁律见 applyNewGameSetup） */
export function newGame(setup: NewGameSetup, seed?: number): void {
  const previousEndings = [...gameState.unlockedEndings];
  // 好结局仅解锁图鉴、不结束当前生活；即使玩家立刻开启新生活，也先保存当前里程碑。
  persistUnlockedEndings(gameState);
  const s = createInitialState(seed);
  initializeFinancialRisk(s,newFinancialLifeId());
  // v0.992：完整开局流程收敛到纯逻辑函数，顺序 bug 可被集成测试锁定
  applyNewGameSetup(s, setup.familyId, setup.allocation, setup.ownedItems, profile, setup.mode ?? "normal");
  s.locationId = residenceLocationId(s);
  s.region = residenceRegion(s);
  s.area = currentResidence(s).area;
  s.navStack = ["map", ...regionPathOf(s.region)];
  // Carry the archive's retryable payload across lives even if profile storage failed.
  s.unlockedEndings = Array.from(new Set([...profile.unlockedEndings, ...previousEndings]));
  // v1.395：橘猫是有成本的开局装备，不再无条件赠送，避免选择「橘猫」时浪费 3 点。
  replaceState(s);
  currentView.name = "game";
  sessionDirty = true;
}

/**
 * v0.991 结局结算：发放命运点 + 写回忆录 + 解锁永恒模式。
 * 幂等：同一结局只结算一次（防睡眠结算重复触发）。
 */
export function settleEndingProfile(): void {
  if (!gameState.endingId || gameState.flags["fate_settled"]) return;
  const ending = getEnding(gameState.endingId);
  if (!ending) return;
  // Calculate on a detached snapshot. If the authoritative profile write fails,
  // keep both the visible archive and per-save idempotency flag untouched so a
  // later load can retry the same ending settlement.
  const nextProfile = JSON.parse(JSON.stringify(profile)) as ProfileState;
  settleProfile(nextProfile, gameState, ending);
  if (!saveProfileImmediately(nextProfile)) return;
  Object.assign(profile, nextProfile);
  gameState.flags["fate_settled"] = true;
}

/** 替换整个状态；同会话的事务提交保留音乐会话，读档/新游戏默认开启新会话。 */
export function replaceState(state: GameState, options?: { sameSession?: boolean }): void {
  const previousQuote=gameState.economy.stockMarket?.lastQuoteMinute??0;
  const previousRiskCursor=gameState.financialRisk?.stock.cursor??0;
  const transaction=!!options?.sameSession&&state!==gameState;
  if (!options?.sameSession) cancelSceneLoading();
  persistUnlockedEndings(state);
  state.unlockedEndings = Array.from(new Set([
    ...(state.unlockedEndings ?? []),
    ...profile.unlockedEndings,
  ]));
  if (state !== gameState) {
    const merged = { ...createInitialState(), ...state };
    for (const key of Object.keys(gameState)) {
      if (!(key in merged)) delete (gameState as unknown as Record<string, unknown>)[key];
    }
    Object.assign(gameState, merged);
  }
  // Forecasts and transaction drafts are not audited. Commit their market progress once here.
  if(transaction&&(gameState.economy.stockMarket?.lastQuoteMinute??0)>previousQuote&&(gameState.financialRisk?.stock.cursor??0)===previousRiskCursor&&(gameState.financialRisk?.stockObserved||gameState.economy.stockMarket?.trades.length||gameState.economy.stockMarket?.positions.length)){
    recordFinancialEvent(gameState,'stock');applyFinancialSanctions(gameState);
  }
  // 读档可能跨了现实中的"新一天"，先把任务栏对齐到当前游戏日
  refreshDailyQuests(gameState);
  if (!options?.sameSession) musicSession.value++;
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
  if (view !== currentView.name) cancelSceneLoading();
  if (pageViews.has(view)) {
    navigation.returnView = currentView.name === "game" ? "game" : "menu";
  }
  currentView.name = view;
}

/** 从设置/存档/图鉴等页面返回进入来源。 */
export function backFromPage(): void {
  const target = navigation.returnView;
  navigation.returnView = "menu";
  currentView.name = target === "game" ? "game" : "menu";
}

/** 清空内存中的当前游戏并回到主菜单，不触发存档写入。 */
export function resetGameToMenuWithoutSaving(): void {
  replaceState(createInitialState());
  sessionDirty = false;
  navigation.returnView = "menu";
  currentView.name = "menu";
}

/** 重置为初始状态（回主菜单） */
export function backToMenu(): void {
  const shouldCheckpoint = shouldCheckpointGameSession();
  // v1.43.1：脏进度时改用应用内确认弹层。根本原因：Tauri/WebView2 不支持 window.confirm
  // （不弹框、静默返回 false），旧代码的 `!window.confirm(...)` 会无条件 return，
  // 导致打包版「返回主菜单」点了没反应。确认是异步的，通过后再执行真正的跳转。
  if (shouldCheckpoint && sessionDirty) {
    void import("../stores/uiStore.svelte")
      .then(({ uiConfirm }) => uiConfirm("当前进度尚未自动保存，确定返回主菜单吗？", { confirmLabel: "返回主菜单" }))
      .then((ok) => {
        if (ok) performBackToMenu();
      })
      .catch(() => performBackToMenu());
    return;
  }
  performBackToMenu();
}

/** backToMenu 的实际执行体：存档快照 + 重置视图 */
function performBackToMenu(): void {
  cancelSceneLoading();
  const shouldCheckpoint = shouldCheckpointGameSession();
  if (shouldCheckpoint) {
    persistUnlockedEndings(gameState);
    const snapshot = JSON.parse(JSON.stringify(gameState)) as GameState;
    void import("../lib/save")
      .then(({ saveGame }) => saveGame("auto", snapshot))
      .catch((error: unknown) => {
        // 离开流程不能被存储故障卡死；自动槽仍保留上一次成功检查点，但必须告诉玩家本次进度未保存。
        autoSaveStatus.status = "failed";
        autoSaveStatus.error = error instanceof Error ? error.message : "本地存储不可用";
        console.error("返回主菜单时自动存档失败，仍保留上一次成功检查点", error);
        void import("../stores/uiStore.svelte")
          .then(({ showToast }) => showToast("本次进度未保存，仍保留上次成功存档"))
          .catch((toastError: unknown) => console.error("无法显示存档失败提示", toastError));
      });
  }
  replaceState(createInitialState());
  sessionDirty = false;
  navigation.returnView = "menu";
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
  openDuelPractice(gameState);
}

/** 获取当前时段的中文名（由 hour 派生） */
export function currentPeriodLabel(): string {
  return periodLabel(periodOfHour(gameState.time.hour));
}

/** 当前时刻格式化（14:30） */
export function currentTimeLabel(): string {
  return `${String(gameState.time.hour).padStart(2, "0")}:${String(gameState.time.minute).padStart(2, "0")}`;
}
