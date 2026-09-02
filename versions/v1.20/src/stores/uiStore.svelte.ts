/**
 * UI 状态 store（与游戏状态隔离，不入存档）。
 * Svelte 5 runes。
 */
import type { Period } from "../game/types";
import type { FamilyMessageScenario } from "../game/core/phone";
import type { WorkDialogue } from "../game/core/workDialogue";
import { workDialogue } from "../game/core/workDialogue";
import { gameState } from "./gameStore.svelte";

/** 弹窗类型：null = 无弹窗 */
export type ModalType =
  | "event"
  | "confirm"
  | "settings"
  | "lodging"
  | "sleep"
  | "result"
  | "phone"
  | "inventory"
  /** v0.92 便利店/水果摊：堂食还是打包 */
  | "dine"
  /** v0.95 工作小游戏（点击数字 / 流水线四步） */
  | "minigame"
  /** v1.0 剧情模式意外卡 */
  | "storyCard"
  | null;

/** v0.92 堂食弹窗载荷 */
export interface DinePayload {
  actionId: string;
  actionName: string;
  actionIcon: string;
  itemName: string;
  itemIcon: string;
  /** 当场吃掉的效果摘要，如 "饱腹 +30 心情 +4" */
  effectText: string;
  price: number;
}

/** v0.96 工作/行动小游戏载荷 */
export interface MiniGamePayload {
  /** 工作/行动 id（如 job_factory_line / exercise_gym / street_perform / street_stall） */
  key: string;
  title: string;
  icon: string;
  /** 小游戏配置（minigames.json 按 key 查得） */
  config: import("../game/core/minigame").MiniGameConfig;
  /** 本次工资基数（按表现加成） */
  todayPay: number;
}

/** v1.0 剧情模式意外卡载荷 */
export interface StoryCardPayload {
  cardId: string;
}

export const uiState = $state<{
  modal: ModalType;
  /** 当前事件弹窗内容 */
  eventPayload: unknown;
  /** 结算弹窗内容 */
  resultPayload: unknown;
  /** 待展示的随机事件（结算弹窗关闭后弹出） */
  pendingEvent: unknown;
  /** v0.92 堂食/打包选择弹窗载荷 */
  dinePayload: DinePayload | null;
  /** v0.95 工作小游戏载荷 */
  minigamePayload: MiniGamePayload | null;
  /** v0.965 工作负责人对话（结算窗顶部展示，关闭时清空） */
  workDialogue: WorkDialogue | null;
  /** v0.935 待回复的家人消息（打开手机时按概率收到，每天至多一条） */
  pendingFamilyMsg: FamilyMessageScenario | null;
  /** 属性面板是否展开 */
  attrPanelOpen: boolean;
  /** 日志面板是否展开 */
  logPanelOpen: boolean;
  /** 右侧任务栏是否展开 */
  questPanelOpen: boolean;
  /** 轻提示（toast） */
  toast: string | null;
  /** v0.98 UI 缩放比例（0.5 ~ 1.5，步长 0.1，存入 localStorage） */
  zoom: number;
  /** v0.98 布局模式：auto（自适应）/ pc / mobile */
  layoutMode: "auto" | "pc" | "mobile";
  /** v1.11 游戏模式：pc=端游（现状自适应）/ mobile=手游（20:9 横版） */
  gameMode: "pc" | "mobile";
  /** v1.12 左侧栏宽度（pc 默认 250 / mobile 默认 200，clamp 见 setAttrWidth，localStorage 持久化） */
  attrWidth: number;
  /** v0.981 移动端底部标签栏当前选中的面板 */
  mobileTab: "scene" | "attrs" | "quest" | "log";
  /** v1.0 剧情模式：待展示的意外卡 / 已弹窗展示过的卡 id */
  storyCardPayload: StoryCardPayload | null;
  storyCardShownIds: string[];
}>({
  modal: null,
  eventPayload: null,
  resultPayload: null,
  pendingEvent: null,
  dinePayload: null,
  minigamePayload: null,
  workDialogue: null,
  pendingFamilyMsg: null,
  attrPanelOpen: false,
  logPanelOpen: true,
  questPanelOpen: true,
  toast: null,
  zoom: 1,
  layoutMode: "auto",
  gameMode: "pc",
  attrWidth: 0,
  mobileTab: "scene",
  storyCardPayload: null,
  storyCardShownIds: [],
});

/** 展示行动结算弹窗 */
export function showResult(payload: unknown): void {
  uiState.resultPayload = payload;
  uiState.modal = "result";
}

/**
 * v0.95+ 工作/行动结算后的统一呈现：配置了小游戏（minigames.json）的先弹小游戏（完成后再回结算窗），
 * 否则直接弹结算窗。调用前请先 rollEvent 并写 pendingEvent（保持 小游戏→结算→事件 顺序）。
 */
export function presentJobResult(
  payload: { actionId?: string; deltas?: Array<{ key: string; value: number }>; quality?: number } | null | undefined,
  miniCfg?: import("../game/core/minigame").MiniGameConfig,
  meta?: { id: string; name: string; icon: string },
): void {
  if (!payload) return;
  if (miniCfg) {
    const pay = payload.deltas?.find((d) => d.key === "money")?.value ?? 0;
    uiState.minigamePayload = {
      key: meta?.id ?? payload.actionId ?? "",
      title: miniCfg.title,
      icon: miniCfg.icon,
      config: miniCfg,
      todayPay: Math.max(0, pay),
    };
    // 有小游戏 → 对话由小游戏完成时的得分决定（暂存结算质量作兜底）
    uiState.workDialogue = null;
    uiState.resultPayload = payload;
    uiState.modal = "minigame";
  } else {
    // 无小游戏 → 用结算质量（迟到/正常）生成负责人对话
    if (payload.quality != null) {
      uiState.workDialogue = workDialogue(meta?.id ?? payload.actionId ?? "", payload.quality, gameState.rng);
    }
    showResult(payload);
  }
}

/** 展示事件弹窗 */
export function showEvent(payload: unknown): void {
  uiState.eventPayload = payload;
  uiState.modal = "event";
}

/** 显示轻提示，2.5 秒后自动消失 */
export function showToast(msg: string): void {
  uiState.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    uiState.toast = null;
  }, 2500);
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function openModal(type: Exclude<ModalType, null>, payload?: unknown): void {
  uiState.modal = type;
  uiState.eventPayload = payload ?? null;
}

export function closeModal(): void {
  uiState.modal = null;
  uiState.eventPayload = null;
}

export function toggleAttrPanel(): void {
  uiState.attrPanelOpen = !uiState.attrPanelOpen;
}

export function toggleLogPanel(): void {
  uiState.logPanelOpen = !uiState.logPanelOpen;
}

export function toggleQuestPanel(): void {
  uiState.questPanelOpen = !uiState.questPanelOpen;
}

/** 时段对应的情绪色（供 TopBar 使用） */
export function periodTheme(period: Period): string {
  switch (period) {
    case "morning":
      return "orange";
    case "afternoon":
      return "sky";
    case "evening":
      return "purple";
    case "night":
      return "indigo";
  }
}

/* ==================== v0.98 UI 缩放 ==================== */

const ZOOM_STORAGE_KEY = "urban-life-ui-zoom";
const LAYOUT_STORAGE_KEY = "urban-life-ui-layout";
const GAMEMODE_STORAGE_KEY = "urban-life-ui-gamemode";
const ATTRWIDTH_STORAGE_KEY = "urban-life-ui-attrwidth";

/** v1.12 左侧栏宽度 clamp（pc 140-260 / mobile 120-220） */
function attrWidthRange(): { min: number; max: number } {
  return uiState.gameMode === "mobile" ? { min: 120, max: 220 } : { min: 140, max: 260 };
}

/** 从 localStorage 恢复缩放，写入 uiState + CSS 变量 */
export function initZoom(): void {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (raw != null) {
      const v = parseFloat(raw);
      if (v >= 0.5 && v <= 1.5) uiState.zoom = v;
    }
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw === "pc" || raw === "mobile" || raw === "auto") uiState.layoutMode = raw;
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(GAMEMODE_STORAGE_KEY);
    if (raw === "pc" || raw === "mobile") uiState.gameMode = raw;
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(ATTRWIDTH_STORAGE_KEY);
    if (raw != null) {
      const v = parseFloat(raw);
      if (!Number.isNaN(v)) {
        const r = attrWidthRange();
        uiState.attrWidth = Math.min(r.max, Math.max(r.min, v));
      }
    }
  } catch { /* ignore */ }
  // 无存储记录时按模式给默认宽（pc 250 / mobile 200）
  if (uiState.attrWidth === 0) {
    uiState.attrWidth = uiState.gameMode === "mobile" ? 200 : 250;
  }
  applyZoom();
}

/** 设置缩放并持久化（v1.11 补 clamp 0.5-1.5，与滑条范围一致） */
export function setZoom(v: number): void {
  uiState.zoom = Math.min(1.5, Math.max(0.5, Math.round(v * 10) / 10));
  try { localStorage.setItem(ZOOM_STORAGE_KEY, String(uiState.zoom)); } catch { /* ignore */ }
  applyZoom();
}

/** 设置布局模式并持久化 */
export function setLayoutMode(m: typeof uiState.layoutMode): void {
  uiState.layoutMode = m;
  try { localStorage.setItem(LAYOUT_STORAGE_KEY, m); } catch { /* ignore */ }
  applyZoom();
}

/** v1.11 设置游戏模式（pc 端游 / mobile 手游横版）并持久化；v1.12 联动 attrWidth clamp */
export function setGameMode(m: "pc" | "mobile"): void {
  uiState.gameMode = m;
  try { localStorage.setItem(GAMEMODE_STORAGE_KEY, m); } catch { /* ignore */ }
  // 热修：手游横版无底部标签，切模式时重置 mobileTab，避免 data-tab="log" 触发 820px 规则隐藏 .main
  if (m === "mobile") uiState.mobileTab = "scene";
  const r = attrWidthRange();
  if (uiState.attrWidth > r.max) {
    uiState.attrWidth = r.max;
    try { localStorage.setItem(ATTRWIDTH_STORAGE_KEY, String(uiState.attrWidth)); } catch { /* ignore */ }
  }
  applyZoom();
}

/** v1.12 设置左侧栏宽度（clamp 按当前模式范围）并持久化 */
export function setAttrWidth(v: number): void {
  const r = attrWidthRange();
  uiState.attrWidth = Math.round(Math.min(r.max, Math.max(r.min, v)));
  try { localStorage.setItem(ATTRWIDTH_STORAGE_KEY, String(uiState.attrWidth)); } catch { /* ignore */ }
  applyZoom();
}

/** 将 zoom 写入 CSS 变量 + data-layout + data-game-mode 属性 */
function applyZoom(): void {
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--ui-zoom", String(uiState.zoom));
    document.documentElement.dataset.layout = uiState.layoutMode;
    document.documentElement.dataset.gameMode = uiState.gameMode;
  }
}
