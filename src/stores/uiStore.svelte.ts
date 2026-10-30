import { pendingStreetPerformance } from '../game/core/streetPerformance';
import {defaultSceneMode,resolveSceneMode} from '../lib/sceneMode';
import {isRenderResolution,type RenderResolution} from '../lib/renderResolution';
import { HOME_LOW_WALL_HEIGHT, clampLowWallHeight, isHomeWallMode, type HomeWallMode } from '../lib/homeWallView';
/**
 * UI 状态 store（与游戏状态隔离，不入存档）。
 * Svelte 5 runes。
 */
import type { ActionResult, Period } from "../game/types";
import type { FamilyMessageScenario } from "../game/core/phone";
import type { WorkDialogue } from "../game/core/workDialogue";
import type { NpcTaskId } from '../game/npcTaskTypes';
import { workDialogue } from "../game/core/workDialogue";
import { gameState } from "./gameStore.svelte";
import { getMiniGameConfigFor } from "../game/core/minigame";
import { resolveVehicle } from "../game/core/jobs";
import {
  attrWidthRangeFor,
  clampAttrWidth,
  clampRenderScale,
  clampUiZoom,
  isMobileGameMode,
  mobileLayoutMode,
  type GameMode,
} from "../lib/mobileLayout";

export { MOBILE_COMPACT_WIDTH } from "../lib/mobileLayout";

/** 弹窗类型：null = 无弹窗 */
export type ModalType =
  | "city_tip"
  | "event"
  | "confirm"
  | "settings"
  | "lodging"
  | "sleep"
  | "result"
  | "phone"
  | "inventory"
  | "home_storage"
  | "bookshelf"
  /** 寺庙结缘院每周免费赠礼商店 */
  | "temple_gift_shop"
  | "reader"
  /** v1.45 玩家穿搭：住宅衣柜 / 商场服装店 */
  | "wardrobe"
  | "clothing_store"
  | "facility_shop"
  /** v0.92 便利店/水果摊：堂食还是打包 */
  | "dine"
  /** v0.95 工作小游戏（点击数字 / 流水线四步） */
  | "minigame"
  /** v1.0 剧情模式意外卡 */
  | "storyCard"
  /** v1.3 笔记本全屏桌面（Win11 风，含手机除电话外所有 App + 专属软件） */
  | "laptop"
  /** v1.4 P2 猫咪面板（照顾 / 商店 / 图鉴） */
  | "cat"
  /** v1.4 P3 耄耋对决战斗界面 */
  | "battle"
  | "cat_duel"
  /** v1.4 城际车站：购买/检票 */
  | "intercity"
  /** v1.42 自由烹饪工作台 */
  | "cooking"
  | "fridge"
  /** v1.33 宠物用品店领养猫咪弹窗 */
  | "pet_adopt"
  /** v1.34 公园自由锻炼遭遇敌人：选择决斗或逃跑 */
  | "cat_encounter"
  /** v1.37 卡包刷新：新卡牌入包抉择 */
  | "card_offer"
  /** v1.37 宠物医院卡牌训练：特殊训练（强化）/ 专注训练（删卡） */
  | "hospital_train"
  /** v1.44 行动日志弹窗：手游不常驻日志条，改为按需全屏查看（与端游内容完全一致） */
  | "log"
  | null;

/** v1.37 卡牌刷新载荷 */
export interface CardOfferPayload {
  defId: string;
  source: "train" | "duel" | "tournament";
  /** 目标猫咪 uid（卡包归属） */
  petUid: string;
}

/** 图书馆阅读行动在读者关闭后展示的结算信息。 */
export interface DeferredBookResult {
  payload: ActionResult;
  action: { id: string; name: string; icon: string };
}

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
  performanceId?: number;
  /** Persisted shift identity and deterministic challenge seed. */
  sessionId?: string;
  seed?: number;
}

/** v1.0 剧情模式意外卡载荷 */
export interface StoryCardPayload {
  cardId: string;
}

/** A modal's return target and the content needed to restore it intact. */
export interface ModalFrame {
  modal: Exclude<ModalType, null>;
  readerId: string | null;
  pendingBookResult: DeferredBookResult | null;
  eventPayload: unknown;
  resultPayload: unknown;
  dinePayload: DinePayload | null;
  minigamePayload: MiniGamePayload | null;
  workDialogue: WorkDialogue | null;
  encounterPayload: {
    opponentId: string;
    opponentName: string;
    opponentIcon: string;
    opponentLevel: number;
    tierLabel: string;
    tierRange?: string;
  } | null;
  cardOfferPayload: CardOfferPayload | null;
  storyCardPayload: StoryCardPayload | null;
  hospitalTrainMode: "special" | "focus";
}

/* ==================== v1.21-beta UI 皮肤 ==================== */

/** 可选 UI 皮肤 id。default = app.css 原生基色（都市夜色），其余见 styles/themes.css */
export type SkinId = "default" | "neon" | "porcelain" | "morandi" | "paper";

/** 动作/分组/设施卡底纹模式（只影响场景卡，不影响地点介绍卡和主背景）。 */
export type ActionCardBackground = "texture" | "glass";

/** 皮肤元信息（设置页选择器用）。swatch 仅用于绘制预览色卡。 */
export interface SkinMeta {
  id: SkinId;
  name: string;
  desc: string;
  /** 是否浅色底（用于给预览卡挑合适的示意文字色） */
  light: boolean;
  swatch: {
    /** 预览背景 */
    bg: string;
    /** 预览卡面 */
    card: string;
    /** 强调色 */
    accent: string;
    /** 次强调色 */
    accent2: string;
    /** 预览示意文字色 */
    text: string;
  };
}

/**
 * 五套皮肤。配色参考 Pixso 色板插件收录的大厂设计系统
 * （Material Design 3 / Arco Design）与莫兰迪低饱和色谱，
 * 正文对比度均通过 WCAG AA（tests/themes.test.ts 强制校验）。
 */
export const SKINS: SkinMeta[] = [
  {
    id: "default",
    name: "都市夜色",
    desc: "深蓝夜幕配暖金强调，游戏原生默认皮肤",
    light: false,
    swatch: { bg: "#10131f", card: "#222842", accent: "#ffd166", accent2: "#6cc6ff", text: "#eef1ff" },
  },
  {
    id: "neon",
    name: "霓虹赛博",
    desc: "深灰打底＋青洋红霓虹，锐利直角与发光描边",
    light: false,
    swatch: { bg: "#0e0e14", card: "#1c1c2b", accent: "#00e5ff", accent2: "#ff2fd0", text: "#e6f7ff" },
  },
  {
    id: "porcelain",
    name: "极简白瓷",
    desc: "纯白卡面＋克莱因蓝，大圆角轻投影，通透明亮",
    light: true,
    swatch: { bg: "#f5f7fa", card: "#ffffff", accent: "#2560e6", accent2: "#00a6a6", text: "#1b2330" },
  },
  {
    id: "morandi",
    name: "莫兰迪雾",
    desc: "低饱和灰调中间色＋鼠尾草绿，柔和高级",
    light: true,
    swatch: { bg: "#dcdad2", card: "#f0eee8", accent: "#7d9885", accent2: "#9a8c7a", text: "#33362f" },
  },
  {
    id: "paper",
    name: "暖阳纸墨",
    desc: "米黄纸感＋棕墨字与赭橙强调，复古印刷风",
    light: true,
    swatch: { bg: "#f4ead6", card: "#fffaf0", accent: "#c2591a", accent2: "#8c6a3f", text: "#3a2c1c" },
  },
];

const SKIN_IDS: SkinId[] = SKINS.map((s) => s.id);

/** 运行时校验：把任意输入收敛为合法 SkinId（旧值/脏数据回退 default） */
export function normalizeSkin(v: unknown): SkinId {
  return typeof v === "string" && (SKIN_IDS as string[]).includes(v) ? (v as SkinId) : "default";
}

export type NpcTaskPanel =
  | { kind: 'quest'; taskId: NpcTaskId }
  | { kind: 'item'; itemId: string }
  | { kind: 'art'; artId: string; title?: string }
  | { kind: 'counter'; topicId: string };

export const uiState = $state<{
  modal: ModalType;
  /** 从一个弹窗进入另一个弹窗时保存来路，关闭时返回上一层。 */
  modalStack: ModalFrame[];
  readerId: string | null;
  /** 图书馆阅读奖励待读者关闭后展示。 */
  pendingBookResult: DeferredBookResult | null;
  /** 当前事件弹窗内容 */
  eventPayload: unknown;
  /** 结算弹窗内容 */
  resultPayload: unknown;
  cityTip: string | null;
  /** 待展示的随机事件（结算弹窗关闭后弹出） */
  pendingEvent: unknown;
  /** v0.92 堂食/打包选择弹窗载荷 */
  dinePayload: DinePayload | null;
  /** v0.95 工作小游戏载荷 */
  minigamePayload: MiniGamePayload | null;
  /** 玩家从班次小游戏退出后，阻止场景 effect 立即重新打开同一班次。 */
  dismissedWorkSessionId: string | null;
  /** v0.965 工作负责人对话（结算窗顶部展示，关闭时清空） */
  workDialogue: WorkDialogue | null;
  /** v0.935 待回复的家人消息（打开手机时按概率收到，每天至多一条） */
  pendingFamilyMsg: FamilyMessageScenario | null;
  /** 属性面板是否展开 */
  /** 日志面板是否展开 */
  logPanelOpen: boolean;
  /** 右侧任务栏是否展开 */
  questPanelOpen: boolean;
  phoneStartApp: "home" | "todo" | "jobs";
  /** 轻提示（toast） */
  toast: string | null;
  /** v0.98 UI 缩放比例（0.5 ~ 1.5，步长 0.1，存入 localStorage） */
  zoom: number;
  /** 3D 渲染分辨率缩放（0.5 ~ 1，步长 0.05，存入 localStorage），独立于 UI 缩放。 */
  renderScale: number;
  renderResolution:RenderResolution;
  sceneMode: import('../lib/sceneMode').SceneMode;
  /** Local display preferences, independent of the gameplay save. */
  homeWallMode: HomeWallMode;
  homeLowWallHeight: number;
  /** v1.44.1 是否显示端游布局底部的常驻行动日志条（localStorage 持久化；手游日志走顶栏 📜 弹层不受影响） */
  showLog: boolean;
  /** 首次启动设备类型引导；选择结果只存 UI 偏好，不进入游戏存档。 */
  deviceSetupOpen: boolean;
  /** PC=桌面；PE=手机横屏；tablet=PC 布局但隐藏底部行动日志。旧 mobile 仅用于兼容迁移。 */
  gameMode: GameMode;
  /** v1.43.1 应用内确认弹窗请求（替代在 Tauri/WebView2 下静默失效的 window.confirm） */
  confirmRequest: ConfirmRequest | null;
  /** v1.12 左侧栏宽度（pc 默认 250 / mobile 默认 200，clamp 见 setAttrWidth，localStorage 持久化） */
  attrWidth: number;
  /** v0.981 移动端底部标签栏当前选中的面板 */
  /** v1.0 剧情模式：待展示的意外卡 / 已弹窗展示过的卡 id */
  storyCardPayload: StoryCardPayload | null;
  /** v1.21-beta UI 皮肤（localStorage 持久化，不入存档） */
  skin: SkinId;
  /** v1.21-beta3 手游模式：手机是否处于待机收起状态 */
  /** v1.3-beta2 独立小游戏模式开关：开启后主菜单出现「小游戏」入口（可脱离剧情直接游玩全部小游戏） */
  arcadeMode: boolean;
  /** v1.3b5 地图玻璃面板强度：low=最透（背景清晰）/ medium=轻玻璃 / high=平衡 / dark=深蓝近实色（文字最清晰） */
  mapGlass: "low" | "medium" | "high" | "dark";
  /** v1.4 场景操作卡底纹：texture=抽象艺术纹理 / glass=经典半透明底纹（localStorage 持久化，默认 glass） */
  actionCardBackground: ActionCardBackground;
  /** 猫咪面板本次打开时默认显示的页签；场景里的「携带」快捷入口会直接跳到此页。 */
  catPanelTab: "care" | "carry" | "cards" | "accessory" | "dex" | "foster";
  catPanelPetUid: string | null;
  /** v1.47 NPC 交互菜单与全屏会话入口。 */
  npcTalk: { npcId: string; entry: "choose" | "chat-menu" | "formal-menu" | "meet" | "chat" | "formal" | "introduction"; topicId?: string } | null;
  npcTaskPanel: NpcTaskPanel | null;
  /** v1.34 公园自由锻炼遭遇战：待玩家抉择的敌人信息（null = 无） */
  encounterPayload: {
    opponentId: string;
    opponentName: string;
    opponentIcon: string;
    opponentLevel: number;
    tierLabel: string;
    tierRange?: string;
  } | null;
  /** v1.37 卡包刷新：待玩家抉择的新卡（null = 无） */
  cardOfferPayload: CardOfferPayload | null;
  /** v1.37 宠物医院卡牌训练模式：special=特殊训练（强化）/ focus=专注训练（删卡） */
  hospitalTrainMode: "special" | "focus";
  /** v1.44 手游顶栏信息面板是否展开（暴露难度/物价/距午夜/闹钟/剧情/良心等次要信息，
   *  保证手游与端游信息量一致而不必把这些 chip 常驻在 750px 的顶栏上）。 */
  topbarInfoOpen: boolean;
}>({
  modal: null,
  modalStack: [],
  readerId: null,
  pendingBookResult: null,
  eventPayload: null,
  resultPayload: null,
  cityTip: null,
  pendingEvent: null,
  dinePayload: null,
  minigamePayload: null,
  dismissedWorkSessionId: null,
  workDialogue: null,
  pendingFamilyMsg: null,
  logPanelOpen: true,
  questPanelOpen: true,
  phoneStartApp: "home",
  toast: null,
  zoom: 1,
  renderScale: 1,
  renderResolution:'auto',
  sceneMode: '3d',
  homeWallMode: 'cutaway',
  homeLowWallHeight: HOME_LOW_WALL_HEIGHT,
  showLog: true,
  deviceSetupOpen: false,
  gameMode: "pc",
  confirmRequest: null,
  attrWidth: 0,
  storyCardPayload: null,
  skin: "default",
  arcadeMode: false,
  mapGlass: "low",
  actionCardBackground: "glass",
  catPanelTab: "care",
  catPanelPetUid: null,
  npcTalk: null,
  npcTaskPanel: null,
  encounterPayload: null,
  cardOfferPayload: null,
  hospitalTrainMode: "special",
  topbarInfoOpen: false,
});

export function openNpcTaskPanel(panel: NpcTaskPanel): void { uiState.npcTaskPanel = panel; }
export function closeNpcTaskPanel(): void { uiState.npcTaskPanel = null; }

/** v1.47 打开 NPC 交互选择；初见 NPC 仍直接进入认识流程。 */
export function openNpcTalk(npcId: string, entry: "choose" | "meet" | "chat" | "introduction" = "choose", topicId?: string): void {
  uiState.npcTalk = { npcId, entry, ...(topicId ? { topicId } : {}) };
}
export function closeNpcTalk(): void {
  uiState.npcTalk = null;
}

/** v1.43.1 应用内确认弹窗的请求描述 */
export interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
}

let confirmResolver: ((ok: boolean) => void) | null = null;

/**
 * v1.43.1：应用内确认弹窗（替代 `window.confirm`）。
 * 根因：Tauri/WebView2 不支持 JS 原生确认框——**不弹框、静默返回 false**，
 * 于是 `if (!confirm(...)) return;` 会无条件命中「取消」分支，导致覆盖存档、
 * 删除存档、返回主菜单等操作在打包版里「点了没反应」。
 * 这里改成 Promise 化的应用内弹层，浏览器与桌面端行为完全一致。
 */
export function uiConfirm(
  message: string,
  opts?: { confirmLabel?: string; cancelLabel?: string; danger?: boolean },
): Promise<boolean> {
  // 若已有未决确认，先按「取消」收束，避免旧 Promise 永久悬挂
  confirmResolver?.(false);
  uiState.confirmRequest = {
    message,
    confirmLabel: opts?.confirmLabel ?? "确认",
    cancelLabel: opts?.cancelLabel ?? "取消",
    danger: opts?.danger ?? false,
  };
  return new Promise<boolean>((resolve) => {
    confirmResolver = resolve;
  });
}

/** 由确认弹窗组件回调：关闭弹层并结算 Promise */
export function resolveConfirm(ok: boolean): void {
  uiState.confirmRequest = null;
  const resolve = confirmResolver;
  confirmResolver = null;
  resolve?.(ok);
}

/** 展示行动结算弹窗 */
export function showResult(payload: unknown): void {
  uiState.resultPayload = payload;
  if (uiState.modal && uiState.modal !== "minigame" && uiState.modal !== "result") pushModal("result");
  else uiState.modal = "result";
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
  const active = gameState.work?.active;
  if (active && (payload.actionId === active.jobId || meta?.id === active.jobId)) {
    presentWorkSession();
    return;
  }
  if (miniCfg) {
    const pay = payload.deltas?.find((d) => d.key === "money")?.value ?? 0;
    uiState.minigamePayload = {
      key: meta?.id ?? payload.actionId ?? "",
      title: miniCfg.title,
      icon: miniCfg.icon,
      config: miniCfg,
      todayPay: Math.max(0, pay),
      ...(payload.actionId === "street_perform" ? { performanceId: pendingStreetPerformance(gameState)?.id, seed: pendingStreetPerformance(gameState)?.id } : {}),
    };
    // 有小游戏 → 对话由小游戏完成时的得分决定（暂存结算质量作兜底）
    uiState.workDialogue = null;
    uiState.resultPayload = payload;
    if (uiState.modal) pushModal("minigame");
    else uiState.modal = "minigame";
  } else {
    // 无小游戏 → 用结算质量（迟到/正常）生成负责人对话
    if (payload.quality != null) {
      uiState.workDialogue = workDialogue(meta?.id ?? payload.actionId ?? "", payload.quality, gameState.rng);
    }
    showResult(payload);
  }
}

/** Resume from the saved shift, never from an unsaved UI payload. */
export function presentWorkSession(): void {
  const session = gameState.work?.active;
  if (!session) return;
  uiState.dismissedWorkSessionId = null;
  if (session.jobId === "job_delivery" && session.source === "delivery" && resolveVehicle(gameState) === "none") {
    session.status = "paused";
    showToast("外卖班次已暂停，请先购买或租用车辆，再从手机外卖 App 继续本班");
    return;
  }
  const cfg = getMiniGameConfigFor(gameState, session.jobId);
  if (!cfg) {
    showToast("该岗位缺少小游戏配置，请检查游戏文件");
    return;
  }
  uiState.minigamePayload = {
    key: session.jobId, title: cfg.title, icon: cfg.icon, config: cfg,
    todayPay: session.baseWage, sessionId: session.id, seed: session.seed,
  };
  uiState.resultPayload = null;
  uiState.workDialogue = null;
  if (uiState.modal) pushModal("minigame");
  else uiState.modal = "minigame";
}

/** Restore an unfinished set without granting a new admission or quote. */
export function presentStreetPerformance(): void {
  const pending = pendingStreetPerformance(gameState);
  const config = getMiniGameConfigFor(gameState, 'street_perform');
  if (!pending || !config) return;
  uiState.minigamePayload = { key:'street_perform', title:config.title, icon:config.icon,
    config, todayPay:0, performanceId:pending.id, seed:pending.id };
  uiState.resultPayload = { actionId:'street_perform', name:'街头卖艺', icon:'🎤', duration:2,
    deltas:[], verdict:'演出时间与体力已在开场时消耗。' };
  uiState.modal = 'minigame';
}

/** 展示事件弹窗 */
export function showEvent(payload: unknown): void {
  uiState.eventPayload = payload;
  uiState.modal = "event";
}

/** 串行展示轻提示，避免睡眠结算等一次产生多条消息时相互覆盖。 */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const toastQueue: string[] = [];
export function showToast(msg: string): void {
  toastQueue.push(msg);
  if (uiState.toast != null) return;
  showNextToast();
}
function showNextToast(): void {
  const next = toastQueue.shift();
  if (!next) { uiState.toast = null; toastTimer = undefined; return; }
  uiState.toast = next;
  toastTimer = setTimeout(() => { uiState.toast = null; toastTimer = undefined; showNextToast(); }, 1200);
}
export function dismissToast(): void {
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = undefined;
  uiState.toast = null;
  showNextToast();
}

export function openModal(type: Exclude<ModalType, null>, payload?: unknown): void {
  pushModal(type, payload);
}

export function pushModal(type: Exclude<ModalType, null>, payload?: unknown): void {
  if (uiState.modal && uiState.modal !== type) {
    const modal = uiState.modal;
    uiState.modalStack.push({
      modal,
      readerId: modal === "reader" ? uiState.readerId : null,
      pendingBookResult: modal === "reader" ? uiState.pendingBookResult : null,
      eventPayload: modal === "event" ? uiState.eventPayload : null,
      resultPayload: modal === "result" ? uiState.resultPayload : null,
      dinePayload: modal === "dine" ? uiState.dinePayload : null,
      minigamePayload: modal === "minigame" ? uiState.minigamePayload : null,
      workDialogue: modal === "result" ? uiState.workDialogue : null,
      encounterPayload: modal === "cat_encounter" ? uiState.encounterPayload : null,
      cardOfferPayload: modal === "card_offer" ? uiState.cardOfferPayload : null,
      storyCardPayload: modal === "storyCard" ? uiState.storyCardPayload : null,
      hospitalTrainMode: modal === "hospital_train" ? uiState.hospitalTrainMode : "special",
    });
  }
  if (payload !== undefined) {
    if (type === "event") uiState.eventPayload = payload;
    else if (type === "result") uiState.resultPayload = payload;
    else if (type === "dine") uiState.dinePayload = payload as DinePayload;
    else if (type === "storyCard") uiState.storyCardPayload = payload as StoryCardPayload;
  }
  uiState.modal = type;
}

/** Restore the saved modal frame after its top-level child has closed. */
export function restorePreviousModal(): void {
  const previous = uiState.modalStack.pop();
  uiState.eventPayload = null;
  uiState.resultPayload = null;
  uiState.minigamePayload = null;
  uiState.dinePayload = null;
  uiState.readerId = null;
  uiState.pendingBookResult = null;
  uiState.workDialogue = null;
  uiState.encounterPayload = null;
  uiState.cardOfferPayload = null;
  uiState.storyCardPayload = null;
  if (!previous) {
    uiState.modal = null;
    return;
  }
  uiState.modal = previous.modal;
  uiState.readerId = previous.readerId;
  uiState.pendingBookResult = previous.pendingBookResult;
  uiState.eventPayload = previous.eventPayload;
  uiState.resultPayload = previous.resultPayload;
  uiState.dinePayload = previous.dinePayload;
  uiState.minigamePayload = previous.minigamePayload;
  uiState.workDialogue = previous.workDialogue;
  uiState.encounterPayload = previous.encounterPayload;
  uiState.cardOfferPayload = previous.cardOfferPayload;
  uiState.storyCardPayload = previous.storyCardPayload;
  uiState.hospitalTrainMode = previous.hospitalTrainMode;
}

export function closeModal(): void {
  if(uiState.modal==='city_tip')uiState.cityTip=null;
  if (uiState.modal === "reader") {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("urban-life-reader-back"));
    return;
  }
  if (uiState.modal === "minigame" && gameState.work?.active && uiState.minigamePayload?.sessionId === gameState.work.active.id) {
    const active = gameState.work.active;
    if (active.status === "playing") active.status = "paused";
    uiState.dismissedWorkSessionId = active.id;
  }
  restorePreviousModal();
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
const PE_ZOOM_PRESET_KEY = "urban-life-pe-zoom-v3";
const RENDER_SCALE_STORAGE_KEY = "urban-life-render-scale";
const RENDER_RESOLUTION_STORAGE_KEY='urban-life-render-resolution';
const HOME_WALL_MODE_KEY = "urban-life-home-wall-mode";
const HOME_LOW_WALL_KEY = "urban-life-home-low-wall-height";
const SHOWLOG_STORAGE_KEY = "urban-life-show-log";
const GAMEMODE_STORAGE_KEY = "urban-life-ui-gamemode";
const DEVICE_SETUP_STORAGE_KEY = "urban-life-device-setup-v1";
const ATTRWIDTH_STORAGE_KEY = "urban-life-ui-attrwidth";
const SKIN_STORAGE_KEY = "urban-life-ui-skin";
const ARCADEMODE_STORAGE_KEY = "urban-life-arcade-mode";
const SCENE_MODE_KEY = "urban-life-scene-mode";
const SCENE_MODE_V2_KEY = "urban-life-scene-mode-v2";

/**
 * v1.44 已移除的孤儿 localStorage 键（v1.21-beta3「手机待机」/ v0.98「布局模式」/
 * v1.3b3「小游戏全屏」功能下线后遗留）。启动时清理，避免长期占用配额并留下误导性配置。
 */
const DEPRECATED_STORAGE_KEYS = [
  "urban-life-ui-layout",
  "urban-life-phone-standby",
  "urban-life-phone-dock",
  "urban-life-attr-standby",
  "urban-life-minigame-fullscreen",
];
const MAP_GLASS_KEY = "urban-life-map-glass";
const ACTION_CARD_BACKGROUND_KEY = "urban-life-action-card-background-v2";

/* ==================== v1.21-beta 皮肤读写 ==================== */

/** 把当前皮肤写到 <html data-skin>（default 移除属性，让 app.css 基色生效） */
function applySkin(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (uiState.skin === "default") {
    delete root.dataset.skin;
  } else {
    root.dataset.skin = uiState.skin;
  }
}

/**
 * 从 localStorage 恢复皮肤并立即应用。
 * 注意：必须在 main.ts 挂载前调用，否则主菜单会先闪一帧默认配色。
 */
export function initSkin(): void {
  try {
    uiState.skin = normalizeSkin(localStorage.getItem(SKIN_STORAGE_KEY));
  } catch {
    uiState.skin = "default";
  }
  applySkin();
}

/** 切换皮肤并持久化 */
export function setSkin(id: SkinId): void {
  uiState.skin = normalizeSkin(id);
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, uiState.skin);
  } catch {
    /* ignore */
  }
  applySkin();
}

/**
 * 手游横屏「放得下三栏」的最小视口宽度（CSS px）。
 *
 * 旧实现两侧栏都用 1000px 作为「自动收起」阈值，但没有任何手机横屏能超过
 * 1000px——iPhone 17 横屏仅 874px、iPhone 17 Pro Max 也只有 956px。结果是
 * 三栏设计在真机上永远不会出现，左右栏一律收起，中央画布被闲置。
 *
 * 新阈值按「左栏下限 104 + 中央可用 300 + 手机面板 146 + 间距」反推：
 * 720px 以下才收起。iPhone 17 横屏（874px）因此保持完整三栏。
 */
/**
 * 是否运行在安卓 App（APK 内嵌 WebView）中。
 *
 * 判据：UA 含 Android。APK 外壳就是普通 WebView，UA 必然带 "Android"；
 * 安卓手机浏览器同样命中——对一款横屏手游而言这也是合理默认。
 * 只在「没有用户偏好记录」时决定初始模式，用户手动选择后一律以存储为准。
 */
export function isAndroidApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

/**
 * 布局判据：PE 预设与旧「手游模式」共用同一套移动端布局。
 *
 * v1.44.3 修复：`data-game-mode` 此前直接写成 uiState.gameMode（取值只有 "pc" / "pe"），
 * 而 mobile.css 的 15 个章节、约 400 条规则全部以 [data-game-mode="mobile"] 为前缀，
 * 因此这些移动端规则**从未生效**——包括第 14 节「小游戏：近全屏舞台 + 控件等比例缩小」、
 * 「喵喵对决安全区」、三栏网格、触控目标兜底等，全是死代码。
 * 手机端只能靠 --ui-zoom 的整体缩放硬撑，于是打工小游戏与喵喵对决在横屏下
 * 按钮放不下、布局拥挤（mobile.css 原文注释亦印证：原 48px 按钮地板在 300px 高的舞台里放不下）。
 *
 * 统一到这一个判据：PC 走端游布局，PE / 旧手游模式走移动端布局。
 * 用户可见的 gameMode 取值仍为 "pc" / "pe"，不改变设置页语义与存储格式。
 */
export function isMobileLayout(): boolean {
  return isMobileGameMode(uiState.gameMode);
}

/**
 * 手游模式左栏宽度 clamp 104-260；桌面端 clamp 140-260。
 * v1.44 手游重做：旧区间 180-420 是「中央区被压缩」时期的遗留值——180px 已是
 * 可用宽度（iPhone 17 横屏扣除安全区后 750px）的 24%，420px 更会直接吃掉玩法区。
 * 新区间与 mobile.css 的 --m-left-min / 26% 视觉上限对齐，让拖拽真正可用。
 * v1.44.3：判据统一到 isMobileLayout()，PE 预设从此真正套用移动端左栏宽度。
 */
function attrWidthRange(): { min: number; max: number } {
  return attrWidthRangeFor(uiState.gameMode);
}

/** 从 localStorage 恢复缩放，写入 uiState + CSS 变量 */
export function initZoom(): void {
  // v1.44：顺手清理已下线功能遗留的存储键（待机停靠 / 布局模式 / 小游戏全屏）
  try {
    for (const k of DEPRECATED_STORAGE_KEYS) localStorage.removeItem(k);
  } catch { /* ignore */ }
  let hasPeZoomPresetV3 = false;
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (raw != null) {
      const v = parseFloat(raw);
      if (v >= 0.5 && v <= 1.5) uiState.zoom = v;
    }
    hasPeZoomPresetV3 = localStorage.getItem(PE_ZOOM_PRESET_KEY) === "1";
  } catch { /* ignore */ }
  try {
    const wallMode = localStorage.getItem(HOME_WALL_MODE_KEY);
    if (isHomeWallMode(wallMode)) uiState.homeWallMode = wallMode;
    const wallHeight = localStorage.getItem(HOME_LOW_WALL_KEY);
    if (wallHeight != null) uiState.homeLowWallHeight = clampLowWallHeight(Number(wallHeight));
    const raw = localStorage.getItem(RENDER_SCALE_STORAGE_KEY);
    const resolution=localStorage.getItem(RENDER_RESOLUTION_STORAGE_KEY);
    uiState.renderResolution=isRenderResolution(resolution)?resolution:'auto';
    if (raw != null) {
      const v = parseFloat(raw);
      if (v >= 0.5 && v <= 1) uiState.renderScale = v;
    }
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(GAMEMODE_STORAGE_KEY);
    if (raw === "pc" || raw === "pe" || raw === "tablet") uiState.gameMode = raw;
    else if (raw === "mobile") {
      // 旧「手游模式」迁移为 PE 预设（100% 缩放 + 隐藏日志）
      uiState.gameMode = "pe";
      uiState.zoom = 1;
      uiState.showLog = false;
      try { localStorage.setItem(GAMEMODE_STORAGE_KEY, "pe"); } catch { /* ignore */ }
    } else if (isAndroidApp()) {
      // APK / 安卓端首次启动默认 PE 预设（移动端布局 + 100% 缩放 + 收起日志）。
      // 仅在没有任何用户偏好记录时生效；用户手动切到 PC 会写入存储，之后不再覆盖。
      uiState.gameMode = "pe";
      uiState.zoom = 1;
      uiState.showLog = false;
      try { localStorage.setItem(GAMEMODE_STORAGE_KEY, "pe"); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  // v1.48.2：手游默认 UI 缩放改为 70%；首次升级套用一次，之后保留玩家手动设置。
  if (isMobileLayout()) {
    if(uiState.renderScale<.85)setRenderScale(.85);
    if (!hasPeZoomPresetV3) {
      uiState.zoom = 0.7;
      try { localStorage.setItem(ZOOM_STORAGE_KEY, "0.7"); } catch { /* ignore */ }
    }
    try { localStorage.setItem(PE_ZOOM_PRESET_KEY, "1"); } catch { /* ignore */ }
  }
  try {
    const raw = localStorage.getItem(ATTRWIDTH_STORAGE_KEY);
    if (raw != null) {
      const v = parseFloat(raw);
      if (!Number.isNaN(v)) {
        uiState.attrWidth = clampAttrWidth(v, uiState.gameMode);
      }
    }
  } catch { /* ignore */ }
  // 无存储记录时按模式给默认宽（pc 250 / mobile 144）。
  // v1.464：手游状态栏小幅加宽，减少属性名和数值在窄屏横屏时被挤压。
  // v1.44.3：判据统一到 isMobileLayout()，PE 预设与旧手游模式同待遇。
  if (uiState.attrWidth === 0) {
    if (isMobileLayout()) uiState.attrWidth = 144;
    else uiState.attrWidth = 250;
  }
  try {
    const arcadeRaw = localStorage.getItem(ARCADEMODE_STORAGE_KEY);
    if (arcadeRaw === "true") uiState.arcadeMode = true;
  } catch { /* ignore */ }
  try {
    const logRaw = localStorage.getItem(SHOWLOG_STORAGE_KEY);
    if (logRaw === "false") uiState.showLog = false;
  } catch { /* ignore */ }
  // PE 与平板都不保留底部常驻日志；设置页和渲染层共用此不变量。
  if (uiState.gameMode !== "pc") {
    uiState.showLog = false;
    try { localStorage.setItem(SHOWLOG_STORAGE_KEY, "false"); } catch { /* ignore */ }
  }
  try {
    uiState.deviceSetupOpen = localStorage.getItem(DEVICE_SETUP_STORAGE_KEY) !== "1";
  } catch {
    // 存储不可用时采用平台推荐布局，不把玩家锁在每次重启都会出现的引导中。
    uiState.gameMode = isAndroidApp() ? "pe" : "pc";
    uiState.deviceSetupOpen = false;
  }
  try {
    const glassRaw = localStorage.getItem(MAP_GLASS_KEY);
    if (glassRaw === "low" || glassRaw === "medium" || glassRaw === "high") {
      uiState.mapGlass = glassRaw;
    }
  } catch { /* ignore */ }
  try {
    const cardBackgroundRaw = localStorage.getItem(ACTION_CARD_BACKGROUND_KEY);
    if (cardBackgroundRaw === "texture" || cardBackgroundRaw === "glass") {
      uiState.actionCardBackground = cardBackgroundRaw;
    }
  } catch { /* ignore */ }
  try {
    const stored=localStorage.getItem(SCENE_MODE_KEY);
    uiState.sceneMode=resolveSceneMode(stored,uiState.gameMode,localStorage.getItem(SCENE_MODE_V2_KEY)==='1');
    if(stored==='flat'||stored==='3d'||stored==='2d')localStorage.setItem(SCENE_MODE_KEY,uiState.sceneMode);
    localStorage.setItem(SCENE_MODE_V2_KEY,'1');
  } catch { uiState.sceneMode=defaultSceneMode(uiState.gameMode); }
  applyZoom();
}

/** 设置缩放并持久化（v1.11 补 clamp 0.5-1.5，与滑条范围一致） */
export function setZoom(v: number): void {
  uiState.zoom = clampUiZoom(v);
  try { localStorage.setItem(ZOOM_STORAGE_KEY, String(uiState.zoom)); } catch { /* ignore */ }
  applyZoom();
}

/** 设置 3D 渲染分辨率缩放（0.5~1，步长 0.05）并持久化。 */
export function setRenderScale(v: number): void {
  uiState.renderScale = Math.max(isMobileLayout() ? .85 : .5,clampRenderScale(v));
  try { localStorage.setItem(RENDER_SCALE_STORAGE_KEY, String(uiState.renderScale)); } catch { /* ignore */ }
  applyZoom();
}

/** Rendering preference only: never changes layout, UI zoom, game progress or saves. */
export function setRenderResolution(value:RenderResolution):void{
  if(!isRenderResolution(value))return;
  uiState.renderResolution=value;
  try{localStorage.setItem(RENDER_RESOLUTION_STORAGE_KEY,value);}catch{/* keep the current session preference */}
}

/** Device preference only: switching scenes never modifies the gameplay save. */
export function setSceneMode(mode: import('../lib/sceneMode').SceneMode|'flat'): void {
  if (mode !== '3d' && mode !== '2d' && mode !== 'flat') return;
  uiState.sceneMode = mode==='flat'?'2d':mode;
  try { localStorage.setItem(SCENE_MODE_KEY, uiState.sceneMode);localStorage.setItem(SCENE_MODE_V2_KEY,'1'); } catch { /* ignore */ }
}

export function setHomeWallMode(mode: HomeWallMode): void {
  if (!isHomeWallMode(mode)) return;
  uiState.homeWallMode = mode;
  try { localStorage.setItem(HOME_WALL_MODE_KEY, mode); } catch { /* ignore */ }
}

export function setHomeLowWallHeight(height: number): void {
  uiState.homeLowWallHeight = clampLowWallHeight(height);
  try { localStorage.setItem(HOME_LOW_WALL_KEY, String(uiState.homeLowWallHeight)); } catch { /* ignore */ }
}

/** v1.44.1 设置是否显示端游底部常驻行动日志条并持久化（默认开） */
export function setShowLog(v: boolean): void {
  uiState.showLog = uiState.gameMode === "pc" && v;
  try { localStorage.setItem(SHOWLOG_STORAGE_KEY, String(uiState.showLog)); } catch { /* ignore */ }
}

/** v1.44.2 模式预设（PC / PE）。切换即套用整套显示预设：
 *  PC = 全部默认（100% 缩放 + 显示行动日志）。
 *  PE = 移动端布局 + 70% UI 缩放 + 隐藏行动日志。
 *  v1.44.3 修正：早期注释写的是「两种模式都用端游布局，旧手游布局暂时下线」，但移动端规则
 *  （mobile.css 全量 15 节）实际从未被下线也未生效——它们依赖 data-game-mode="mobile"，
 *  而属性当时写的是 "pe"，于是小游戏/喵喵对决的等比缩小规则全部落空。
 *  现在 PE 正确套用移动端布局；PC 仍是端游布局不受影响。 */
export function setGameMode(m: Exclude<GameMode, "mobile">): void {
  uiState.gameMode = m;
  if(isMobileLayout()&&uiState.renderScale<.85)setRenderScale(.85);
  try { if (!localStorage.getItem(SCENE_MODE_KEY)) uiState.sceneMode=defaultSceneMode(m); } catch { uiState.sceneMode=defaultSceneMode(m); }
  try { localStorage.setItem(GAMEMODE_STORAGE_KEY, m); } catch { /* ignore */ }
  setZoom(m === "pe" ? 0.7 : 1);
  if (m === "pe") {
    try { localStorage.setItem(PE_ZOOM_PRESET_KEY, "1"); } catch { /* ignore */ }
  }
  setShowLog(m === "pc");
  const r = attrWidthRange();
  if (uiState.attrWidth < r.min || uiState.attrWidth > r.max) {
    uiState.attrWidth = clampAttrWidth(uiState.attrWidth, uiState.gameMode);
    try { localStorage.setItem(ATTRWIDTH_STORAGE_KEY, String(uiState.attrWidth)); } catch { /* ignore */ }
  }
  applyZoom();
}

/** Save the first-run device choice and apply its matching display preset. */
export function completeDeviceSetup(mode: Exclude<GameMode, "mobile">, sceneMode?: import('../lib/sceneMode').SceneMode): void {
  setGameMode(mode);
  if (sceneMode) setSceneMode(sceneMode);
  uiState.deviceSetupOpen = false;
  try { localStorage.setItem(DEVICE_SETUP_STORAGE_KEY, "1"); } catch { /* ignore */ }
}

export function skipDeviceSetup(): void {
  completeDeviceSetup(isAndroidApp() ? "pe" : "pc");
}

/** v1.12 设置左侧栏宽度（clamp 按当前模式范围）并持久化 */
export function setAttrWidth(v: number): void {
  uiState.attrWidth = clampAttrWidth(v, uiState.gameMode);
  try { localStorage.setItem(ATTRWIDTH_STORAGE_KEY, String(uiState.attrWidth)); } catch { /* ignore */ }
  applyZoom();
}

/** v1.44 切换手游顶栏信息面板（暴露难度/物价/距午夜/闹钟/剧情等次要信息） */
export function toggleTopbarInfo(): void {
  uiState.topbarInfoOpen = !uiState.topbarInfoOpen;
}

/** v1.3-beta2 设置独立小游戏模式开关并持久化（主菜单「小游戏」入口门禁） */
export function setArcadeMode(v: boolean): void {
  uiState.arcadeMode = v;
  try { localStorage.setItem(ARCADEMODE_STORAGE_KEY, String(v)); } catch { /* ignore */ }
}

/** 设置地图玻璃强度并持久化。 */
export function setMapGlass(v: "low" | "medium" | "high" | "dark"): void {
  uiState.mapGlass = v;
  try { localStorage.setItem(MAP_GLASS_KEY, v); } catch { /* ignore */ }
}

/** 设置场景操作卡底纹并持久化；地点介绍卡与主场景背景不受影响。 */
export function setActionCardBackground(v: ActionCardBackground): void {
  uiState.actionCardBackground = v;
  try { localStorage.setItem(ACTION_CARD_BACKGROUND_KEY, v); } catch { /* ignore */ }
}

/** 将 zoom / 布局 / 游戏模式 / 左栏宽度写入 CSS 变量与 data 属性 */
function applyZoom(): void {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.style.setProperty("--ui-zoom", String(uiState.zoom));
    // 3D renderers consume renderScale directly. CSS UI zoom stays independent.
    root.style.setProperty("--render-scale", String(uiState.renderScale));
    // v1.44：左栏宽度提到 :root —— mobile.css 的三栏网格与拖拽条位置都读它，
    // 原先 --attr-w 只写在 .sidebar 内联样式上，.main 读不到，导致手游下拖拽完全无效。
  root.style.setProperty("--ui-attr-w", `${uiState.attrWidth || 144}px`);
    // v1.44.3：写入「布局判据」而非原始 gameMode —— mobile.css 全量规则以
    // [data-game-mode="mobile"] 为前缀，此处必须归一化成 mobile / pc 两个值，
    // 否则 PE 预设拿不到移动端布局（详见 isMobileLayout 注释）。
    root.dataset.gameMode = mobileLayoutMode(uiState.gameMode);
  }
}
