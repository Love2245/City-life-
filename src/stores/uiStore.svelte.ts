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
  /** v1.3 笔记本全屏桌面（Win11 风，含手机除电话外所有 App + 专属软件） */
  | "laptop"
  /** v1.4 P2 猫咪面板（照顾 / 商店 / 图鉴） */
  | "cat"
  /** v1.4 P3 耄耋对决战斗界面 */
  | "battle"
  /** v1.33 宠物用品店领养猫咪弹窗 */
  | "pet_adopt"
  /** v1.34 公园自由锻炼遭遇敌人：选择决斗或逃跑 */
  | "cat_encounter"
  /** v1.37 卡包刷新：新卡牌入包抉择 */
  | "card_offer"
  /** v1.37 宠物医院卡牌训练：特殊训练（强化）/ 专注训练（删卡） */
  | "hospital_train"
  | null;

/** v1.37 卡牌刷新载荷 */
export interface CardOfferPayload {
  defId: string;
  source: "train" | "duel" | "tournament";
  /** 目标猫咪 uid（卡包归属） */
  petUid: string;
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
}

/** v1.0 剧情模式意外卡载荷 */
export interface StoryCardPayload {
  cardId: string;
}

/* ==================== v1.21-beta UI 皮肤 ==================== */

/** 可选 UI 皮肤 id。default = app.css 原生基色（都市夜色），其余见 styles/themes.css */
export type SkinId = "default" | "neon" | "porcelain" | "morandi" | "paper";

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
  /** v1.11 游戏模式：pc=端游（现状自适应）/ mobile=手游（20:9 横版）/ tablet=平板（16:9 加宽手机，v1.3-beta2） */
  gameMode: "pc" | "mobile" | "tablet";
  /** v1.12 左侧栏宽度（pc 默认 250 / mobile 默认 200，clamp 见 setAttrWidth，localStorage 持久化） */
  attrWidth: number;
  /** v0.981 移动端底部标签栏当前选中的面板 */
  mobileTab: "scene" | "attrs" | "quest" | "log";
  /** v1.0 剧情模式：待展示的意外卡 / 已弹窗展示过的卡 id */
  storyCardPayload: StoryCardPayload | null;
  storyCardShownIds: string[];
  /** v1.21-beta UI 皮肤（localStorage 持久化，不入存档） */
  skin: SkinId;
  /** v1.21-beta3 手游模式：手机是否处于待机收起状态 */
  phoneStandby: boolean;
  /** v1.21-beta3 手游模式：待机时手机停靠角落（tl/tr/bl/br） */
  phoneDock: "tl" | "tr" | "bl" | "br";
  /** v1.21-beta4-hotfix 手游模式：状态栏是否处于待机收起状态（仅显示极简属性条） */
  attrStandby: boolean;
  /** v1.25 测试模式开关：开启后主菜单「剧情模式」才可用（剧情模式为开发中内容，默认锁定） */
  testMode: boolean;
  /** v1.3-beta2 独立小游戏模式开关：开启后主菜单出现「小游戏」入口（可脱离剧情直接游玩全部小游戏） */
  arcadeMode: boolean;
  /** v1.3b3 小游戏全屏：开启后小游戏占满视口（完成自动退出），增强沉浸感 */
  minigameFullscreen: boolean;
  /** v1.3b3 场景切换动画：跨区域移动时播放载入/移动动画（可在设置关闭） */
  sceneTransition: boolean;
  /** v1.3b3-fix5 二级区域过场动画开关（默认关，开启后二级区域也有带特色背景的过场） */
  sceneTransitionL2: boolean;
  /** v1.3b5 地图玻璃面板强度：low=最透（背景清晰）/ medium=轻玻璃 / high=平衡 / dark=深蓝近实色（文字最清晰） */
  mapGlass: "low" | "medium" | "high" | "dark";
  /** v1.3b3 场景切换动画当前状态（null = 无）；由 playSceneTransition 写入、自动清除 */
  transition: {
    kind: "walk" | "bike" | "ebike" | "car" | "metro" | "bus";
    label: string;
    durationMs: number;
    regionId?: string;
  } | null;
  /** v1.3b3 NPC 对话弹窗：当前正在对话的 NPC id（null = 关闭） */
  npcTalk: { npcId: string } | null;
  /** v1.34 公园自由锻炼遭遇战：待玩家抉择的敌人信息（null = 无） */
  encounterPayload: {
    opponentId: string;
    opponentName: string;
    opponentIcon: string;
    opponentLevel: number;
    tierLabel: string;
  } | null;
  /** v1.37 卡包刷新：待玩家抉择的新卡（null = 无） */
  cardOfferPayload: CardOfferPayload | null;
  /** v1.37 宠物医院卡牌训练模式：special=特殊训练（强化）/ focus=专注训练（删卡） */
  hospitalTrainMode: "special" | "focus";
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
  skin: "default",
  phoneStandby: false,
  phoneDock: "br",
  attrStandby: false,
  testMode: false,
  arcadeMode: false,
  minigameFullscreen: true,
  sceneTransition: true,
  sceneTransitionL2: false,
  mapGlass: "low",
  transition: null,
  npcTalk: null,
  encounterPayload: null,
  cardOfferPayload: null,
  hospitalTrainMode: "special",
});

/** v1.3b3 打开/关闭 NPC 对话弹窗 */
export function openNpcTalk(npcId: string): void {
  uiState.npcTalk = { npcId };
}
export function closeNpcTalk(): void {
  uiState.npcTalk = null;
}

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
const SKIN_STORAGE_KEY = "urban-life-ui-skin";
const PHONE_STANDBY_KEY = "urban-life-phone-standby";
const PHONE_DOCK_KEY = "urban-life-phone-dock";
const ATTR_STANDBY_KEY = "urban-life-attr-standby";
const TESTMODE_STORAGE_KEY = "urban-life-testmode";
const ARCADEMODE_STORAGE_KEY = "urban-life-arcade-mode";
const FULLSCREEN_MG_KEY = "urban-life-minigame-fullscreen";
const SCENE_TRANSITION_KEY = "urban-life-scene-transition";
const SCENE_TRANSITION_L2_KEY = "urban-life-scene-transition-l2";
const MAP_GLASS_KEY = "urban-life-map-glass";

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

/** v1.21-beta4-hotfix：手游模式左栏宽度 clamp 30-80，默认 44px（半宽），让中央游玩画面占比 ≈ 80%；
 *  v1.3-beta2 新增 tablet：介于手机与端游之间，clamp 60-140，默认 96px（平板加宽布局） */
function attrWidthRange(): { min: number; max: number } {
  if (uiState.gameMode === "mobile") return { min: 30, max: 80 };
  if (uiState.gameMode === "tablet") return { min: 60, max: 140 };
  return { min: 140, max: 260 };
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
    if (raw === "pc" || raw === "mobile" || raw === "tablet") uiState.gameMode = raw;
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
  // 无存储记录时按模式给默认宽（pc 250 / mobile 44px / tablet 96px；beta4-hotfix 让中央画面约 80%）
  if (uiState.attrWidth === 0) {
    if (uiState.gameMode === "mobile") uiState.attrWidth = 44;
    else if (uiState.gameMode === "tablet") uiState.attrWidth = 96;
    else uiState.attrWidth = 250;
  }
  try {
    const standbyRaw = localStorage.getItem(PHONE_STANDBY_KEY);
    if (standbyRaw === "true") uiState.phoneStandby = true;
  } catch { /* ignore */ }
  try {
    const attrStandbyRaw = localStorage.getItem(ATTR_STANDBY_KEY);
    if (attrStandbyRaw === "true") uiState.attrStandby = true;
  } catch { /* ignore */ }
  try {
    const testRaw = localStorage.getItem(TESTMODE_STORAGE_KEY);
    if (testRaw === "true") uiState.testMode = true;
  } catch { /* ignore */ }
  try {
    const arcadeRaw = localStorage.getItem(ARCADEMODE_STORAGE_KEY);
    if (arcadeRaw === "true") uiState.arcadeMode = true;
  } catch { /* ignore */ }
  try {
    const fsRaw = localStorage.getItem(FULLSCREEN_MG_KEY);
    if (fsRaw === "false") uiState.minigameFullscreen = false;
  } catch { /* ignore */ }
  try {
    const trRaw = localStorage.getItem(SCENE_TRANSITION_KEY);
    if (trRaw === "false") uiState.sceneTransition = false;
  } catch { /* ignore */ }
  try {
    const trL2Raw = localStorage.getItem(SCENE_TRANSITION_L2_KEY);
    if (trL2Raw === "true") uiState.sceneTransitionL2 = true;
  } catch { /* ignore */ }
  try {
    const glassRaw = localStorage.getItem(MAP_GLASS_KEY);
    if (glassRaw === "low" || glassRaw === "medium" || glassRaw === "high") {
      uiState.mapGlass = glassRaw;
    }
  } catch { /* ignore */ }
  try {
    const dockRaw = localStorage.getItem(PHONE_DOCK_KEY);
    if (dockRaw === "tl" || dockRaw === "tr" || dockRaw === "bl" || dockRaw === "br") {
      uiState.phoneDock = dockRaw;
    }
  } catch { /* ignore */ }
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

/** v1.11 设置游戏模式（pc 端游 / mobile 手游横版 / tablet 平板加宽）并持久化；v1.12 联动 attrWidth clamp */
export function setGameMode(m: "pc" | "mobile" | "tablet"): void {
  uiState.gameMode = m;
  try { localStorage.setItem(GAMEMODE_STORAGE_KEY, m); } catch { /* ignore */ }
  // 热修：手游/平板横版无底部标签，切模式时重置 mobileTab，避免 data-tab="log" 触发 820px 规则隐藏 .main
  if (m === "mobile" || m === "tablet") uiState.mobileTab = "scene";
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

/** v1.21-beta3 切换手机待机收起状态并持久化 */
export function togglePhoneStandby(): void {
  uiState.phoneStandby = !uiState.phoneStandby;
  try { localStorage.setItem(PHONE_STANDBY_KEY, String(uiState.phoneStandby)); } catch { /* ignore */ }
}

/** v1.21-beta4-hotfix 切换状态栏待机收起状态并持久化（仿手机 ⏻） */
export function toggleAttrStandby(): void {
  uiState.attrStandby = !uiState.attrStandby;
  try { localStorage.setItem(ATTR_STANDBY_KEY, String(uiState.attrStandby)); } catch { /* ignore */ }
}

/** v1.21-beta3 设置待机停靠角落并持久化 */
export function setPhoneDock(dock: "tl" | "tr" | "bl" | "br"): void {
  uiState.phoneDock = dock;
  try { localStorage.setItem(PHONE_DOCK_KEY, dock); } catch { /* ignore */ }
}

/** v1.25 设置测试模式开关并持久化（剧情模式门禁） */
export function setTestMode(v: boolean): void {
  uiState.testMode = v;
  try { localStorage.setItem(TESTMODE_STORAGE_KEY, String(v)); } catch { /* ignore */ }
}

/** v1.3-beta2 设置独立小游戏模式开关并持久化（主菜单「小游戏」入口门禁） */
export function setArcadeMode(v: boolean): void {
  uiState.arcadeMode = v;
  try { localStorage.setItem(ARCADEMODE_STORAGE_KEY, String(v)); } catch { /* ignore */ }
}

/** v1.3b3 设置小游戏全屏开关并持久化（默认开） */
export function setMinigameFullscreen(v: boolean): void {
  uiState.minigameFullscreen = v;
  try { localStorage.setItem(FULLSCREEN_MG_KEY, String(v)); } catch { /* ignore */ }
}

/** v1.3b3 设置场景切换动画开关并持久化（默认开） */
export function setSceneTransition(v: boolean): void {
  uiState.sceneTransition = v;
  try { localStorage.setItem(SCENE_TRANSITION_KEY, String(v)); } catch { /* ignore */ }
}

/** v1.3b3-fix5 设置二级区域过场动画开关并持久化（默认关） */
export function setSceneTransitionL2(v: boolean): void {
  uiState.sceneTransitionL2 = v;
  try { localStorage.setItem(SCENE_TRANSITION_L2_KEY, String(v)); } catch { /* ignore */ }
}

/** 设置地图玻璃强度并持久化。 */
export function setMapGlass(v: "low" | "medium" | "high" | "dark"): void {
  uiState.mapGlass = v;
  try { localStorage.setItem(MAP_GLASS_KEY, v); } catch { /* ignore */ }
}

/**
 * v1.3b3 触发场景切换动画（仅在 sceneTransition 开启时）。
 * kind 由调用方根据当前载具推导（walk/bike/ebike/car/metro/bus），label 为目标地点名。
 * durationMs 为动画时长（一级地图完整过场可到 3000ms，二级区域简短 ~1200ms），
 * 时长结束后自动清除，期间覆盖全屏、不阻塞交互（pointer-events: none）。
 * regionId 为目标区域 id（v1.3b3-fix5 二级地图特色背景主题）。
 */
/**
 * v1.3b3-fix4：避免 Svelte 5 $state 深代理把 transition 包装成 Proxy，
 * 导致 setTimeout 内 `uiState.transition === t` 引用比较恒为 false（实测：动画
 * overlay 永远不消失 = 「卡死」）。改为用模块级普通变量持有原对象引用。
 */
let activeTransition: {
  kind: "walk" | "bike" | "ebike" | "car" | "metro" | "bus";
  label: string;
  durationMs: number;
  regionId?: string;
} | null = null;

export function playSceneTransition(
  kind: "walk" | "bike" | "ebike" | "car" | "metro" | "bus",
  label: string,
  durationMs = 1150,
  regionId?: string,
): void {
  if (!uiState.sceneTransition) return;
  const t = { kind, label, durationMs, regionId };
  activeTransition = t;
  uiState.transition = t;
  // 引用比较：用模块级变量 activeTransition，绕过 $state 代理包装
  window.setTimeout(() => {
    if (activeTransition === t) {
      activeTransition = null;
      uiState.transition = null;
    }
  }, durationMs);
  // 绝对兜底
  window.setTimeout(() => {
    if (activeTransition === t) {
      activeTransition = null;
      uiState.transition = null;
    }
  }, durationMs + 600);
}

/** 将 zoom 写入 CSS 变量 + data-layout + data-game-mode 属性 */
function applyZoom(): void {
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--ui-zoom", String(uiState.zoom));
    document.documentElement.dataset.layout = uiState.layoutMode;
    document.documentElement.dataset.gameMode = uiState.gameMode;
  }
}
