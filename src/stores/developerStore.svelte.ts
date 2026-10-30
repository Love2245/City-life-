import {cancelSceneLoading} from './sceneLoading.svelte';
import { createTitleTapCounter, readDeveloperAccess, writeDeveloperAccess } from "../lib/developerAccess";
import { executeDeveloperAction, cloneDeveloperState, type DeveloperAction } from "../game/core/developer";
import type { GameState } from "../game/types";
import { currentView, navigation, gameState, replaceState, musicSession, goto } from "./gameStore.svelte";
import { uiState, showToast } from "./uiStore.svelte";

function storage(): Storage | undefined { try { return globalThis.localStorage; } catch { return undefined; } }
const initial = readDeveloperAccess(storage());
export const developerState = $state({ ...initial, open: false, message: "", error: false, snapshotAvailable: false, history: [] as string[] });
const taps = createTitleTapCounter();
let before: GameState | null = null, beforeSession = -1;
export function titleDeveloperTap(now = performance.now()): void {
  if (!taps.tap(now)) return;
  if (!developerState.unlocked) {
    developerState.unlocked = true; developerState.enabled = false; persist();
    showToast("超级开发者设置已解锁，请到设置中手动开启。");
  } else showToast(developerState.enabled ? "超级开发者模式已开启，可从游戏顶栏进入。" : "超级开发者设置已解锁，请到设置中手动开启。");
}
export function resetDeveloperTitleTaps(): void { taps.reset(); }
function persist(): void { writeDeveloperAccess(developerState, storage()); }
export function setDeveloperEnabled(enabled: boolean): void {
  developerState.enabled = developerState.unlocked && enabled;
  if (!developerState.enabled) developerState.open = false;
  persist();
}
export function developerSessionAvailable(): boolean {
  return currentView.name === "game" || (currentView.name === "ending" && !!gameState.endingId)
    || (["settings", "saveLoad", "weeklyReport"].includes(currentView.name) && navigation.returnView === "game");
}
export function openDeveloperPanel(): void {
  if (!developerState.unlocked || !developerState.enabled) return;
  if (!developerSessionAvailable()) { showToast("请先开始新生活或读取存档，再打开调试面板。"); return; }
  developerState.open = true;
}
export function closeDeveloperPanel(): void { developerState.open = false; }
function clearPendingUi(): void {
  // 正在显示的会话持有状态副本；调试后必须丢弃，避免旧副本覆盖刚改的状态。
  uiState.npcTalk = null; uiState.npcTaskPanel = null; uiState.modal = null; uiState.modalStack = [];
  uiState.storyCardPayload = null; uiState.minigamePayload = null; uiState.eventPayload = null; uiState.resultPayload = null;
  uiState.pendingEvent = null; uiState.encounterPayload = null; uiState.cardOfferPayload = null;
  uiState.workDialogue = null; uiState.dinePayload = null; cancelSceneLoading();
}
function report(message: string, ok: boolean): void {
  developerState.message = message; developerState.error = !ok;
  developerState.history = [`${new Date().toLocaleTimeString("zh-CN")} ${ok ? "✓" : "×"} ${message}`, ...developerState.history].slice(0, 30);
}
export function runDeveloperAction(action: DeveloperAction): boolean {
  if (!developerSessionAvailable()) { report("请先进入一局游戏", false); return false; }
  const result = executeDeveloperAction(gameState, developerState, action);
  if (!result.ok) { report(result.message, false); return false; }
  before = cloneDeveloperState(gameState); beforeSession = musicSession.value;
  clearPendingUi(); replaceState(result.state, { sameSession: true }); developerState.snapshotAvailable = true;
  if (action.type === "revive" && currentView.name === "ending") goto("game");
  report(result.message, true); return true;
}
export function canRestoreDeveloperSnapshot(): boolean { return developerState.snapshotAvailable && before !== null && beforeSession === musicSession.value; }
export function restoreDeveloperSnapshot(): boolean {
  if (!developerState.unlocked || !developerState.enabled || !developerSessionAvailable() || !canRestoreDeveloperSnapshot()) {
    report("没有属于本局的调试快照，或开发者模式未开启", false); return false;
  }
  const snapshot = before!; before = null; developerState.snapshotAvailable = false;
  clearPendingUi(); replaceState(cloneDeveloperState(snapshot), { sameSession: true });
  if (!gameState.endingId && currentView.name === "ending") goto("game");
  report("已恢复最近一次成功调试操作前的完整游戏状态；个人档案记录不回退", true); return true;
}
