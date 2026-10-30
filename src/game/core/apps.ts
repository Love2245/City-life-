/**
 * 手机与电脑的独立 App 注册中心
 * ------------------------------------------------------------------
 * 手机主屏/市场读取 APPS；电脑桌面/任务栏/市场读取 LAPTOP_APPS。
 * 两端共享功能数据，但不共享软件目录或安装标记。
 *
 * 分类（kind）：
 *  - "builtin"  内置 App（出厂即装，不可卸载）
 *  - "market"   应用市场商品（需下载安装，flag 控制已安装态）
 *  - "social"   社交类 App（Moments 等，内置但属社交分支）
 */
import type { GameState } from "../types";

export type AppKind = "builtin" | "market" | "social";
export type AppPlatform = "phone" | "laptop";
/** 直播暂停开放，安装记录和历史数据继续保留。 */
export const LIVE_FEATURE_ENABLED = false;

export interface AppMeta {
  /** 唯一 id，需与 PhoneScreen 的 AppId 联合类型及 flags 前缀保持一致 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 图标（emoji） */
  icon: string;
  /** 一句话描述（市场卡片用） */
  desc: string;
  /** 分类 */
  kind: AppKind;
  /**
   * 该 App 安装态对应的 gameState.flags 键。
   * - builtin/social 通常无需（出厂即有），填空字符串。
   * - market 类必填，下载即置 true。
   */
  flag: string;
  /**
   * 是否出现在手机主屏网格（首页直达入口）。
   * 部分 App（如纯接单类）仅通过市场安装后间接可用，不单独占主屏格。
   */
  onHome: boolean;
  enabled?: boolean;
}

/** 外卖到家真实流程：付款即送达，随后从订单区领取入包。 */
export const TAKEOUT_APP_DESCRIPTION = "在线点餐，快餐轻食即时送达，付款后可立即领取。";

/** 既有内置 App（出厂即装） */
const BUILTIN_APPS: AppMeta[] = [
  { id: "todo", name: "待办", icon: "📋", desc: "日程与已接受事项提醒", kind: "builtin", flag: "", onHome: true },
  { id: "call", name: "通信", icon: "📱", desc: "电话、短信与联系人", kind: "builtin", flag: "", onHome: true },
  { id: "game", name: "游戏", icon: "🎮", desc: "休闲小游戏", kind: "builtin", flag: "", onHome: true },
  { id: "study", name: "学习", icon: "📖", desc: "在线课程与技能提升", kind: "builtin", flag: "", onHome: true },
  { id: "jobs", name: "招聘", icon: "💼", desc: "求职与兼职机会", kind: "builtin", flag: "", onHome: true },
  { id: "assets", name: "资产", icon: "📊", desc: "载具、房产与投资", kind: "builtin", flag: "", onHome: true },
  { id: "relation", name: "关系", icon: "💞", desc: "人际关系与好感", kind: "builtin", flag: "", onHome: true },
  { id: "goals", name: "目标", icon: "🎯", desc: "人生阶段目标", kind: "builtin", flag: "", onHome: true },
  { id: "tarot", name: "塔罗", icon: "🔮", desc: "22 张塔罗成就", kind: "builtin", flag: "", onHome: true },
  { id: "settings", name: "设置", icon: "⚙️", desc: "游戏与显示设置", kind: "builtin", flag: "", onHome: true },
];

/** 社交分支 App（内置，但归为社交体系） */
const SOCIAL_APPS: AppMeta[] = [
  { id: "moments", name: "Moments", icon: "🌈", desc: "记录与分享生活点滴，浏览亲友动态", kind: "social", flag: "", onHome: true },
];

/** 应用市场商品（下载后安装） */
const MARKET_APP_LIST: AppMeta[] = [
  // 小游戏（下载后可在「游戏」App 内游玩）
  { id: "app_game_minesweeper", name: "🎮 扫雷", icon: "💣", desc: "翻开所有非雷格即满分", kind: "market", flag: "app_game_minesweeper", onHome: false },
  { id: "app_game_sokoban", name: "🎮 推箱子", icon: "📦", desc: "通关全部关卡即满分", kind: "market", flag: "app_game_sokoban", onHome: false },
  { id: "app_game_snake", name: "🎮 贪吃蛇", icon: "🐍", desc: "吃到 20 个食物即满分", kind: "market", flag: "app_game_snake", onHome: false },
  { id: "app_game_2048", name: "🎮 2048", icon: "🎯", desc: "合成出 2048 即满分", kind: "market", flag: "app_game_2048", onHome: false },
  // 外卖接单（兼职赚钱）
  { id: "app_delivery", name: "🛵 外卖接单", icon: "🛵", desc: "自有或租用车辆后开启8小时配送班次，按小游戏实际送达收入结算", kind: "market", flag: "app_delivery", onHome: true },
  { id: "app_ride_hailing", name: "🚖 网约车接单", icon: "🚖", desc: "下载安装后接单，需驾驶证和汽车。每天一班 10 小时，每完成一单结算 25 元。", kind: "market", flag: "app_ride_hailing", onHome: true },
  // v1.3 新增：消费侧与内容侧 App
  { id: "app_live", name: "📡 自媒体直播", icon: "📡", desc: "后续开发中", kind: "market", flag: "app_live", onHome: true, enabled: LIVE_FEATURE_ENABLED },
];

/** 全部 App 注册表 */
export const APPS: AppMeta[] = [...BUILTIN_APPS, ...SOCIAL_APPS, ...MARKET_APP_LIST];

/** 应用市场商品（仅 kind === "market"） */
export const MARKET_APPS: AppMeta[] = MARKET_APP_LIST.filter((app) => app.enabled !== false);

/** 按 id 查询 App 元数据 */
export function getApp(id: string): AppMeta | undefined {
  return APPS.find((a) => a.id === id);
}

/** 主屏网格应展示的 App（onHome === true 且非纯子页） */
export const HOME_APPS: AppMeta[] = APPS.filter((a) => a.enabled !== false && a.onHome && a.id !== "settings");

/** 校验：所有 market App 必须有非空 flag */
export const APP_REGISTRY_OK = MARKET_APPS.every((a) => a.flag.length > 0);

export type LaptopAppId = "settings" | "store" | "wechat" | "moments"
  | "dev" | "forum" | "shop" | "takeout" | "live" | "invest";

export interface LaptopAppMeta extends Omit<AppMeta, "id" | "kind" | "onHome"> {
  id: LaptopAppId;
  kind: "builtin" | "market";
}

/** 这里只注册实际有电脑窗口的应用。flag 沿用旧版 laptop_app_*，不读写手机 app_*。 */
export const LAPTOP_APPS: readonly LaptopAppMeta[] = [
  { id: "settings", name: "设置", icon: "⚙️", desc: "电脑与游戏设置", kind: "builtin", flag: "" },
  { id: "store", name: "软件商城", icon: "🛍️", desc: "安装电脑软件", kind: "builtin", flag: "" },
  { id: "wechat", name: "微信", icon: "💬", desc: "与手机同步联系人和消息", kind: "builtin", flag: "" },
  { id: "moments", name: "朋友圈", icon: "🌈", desc: "浏览亲友动态", kind: "builtin", flag: "" },
  { id: "dev", name: "编程/设计", icon: "💻", desc: "推进编程与设计项目", kind: "market", flag: "laptop_app_dev" },
  { id: "forum", name: "城市论坛", icon: "📢", desc: "城市资讯、发帖与比赛报名", kind: "market", flag: "laptop_app_forum" },
  { id: "shop", name: "网购商城", icon: "🛒", desc: "分类选购、查看订单，三天配送", kind: "market", flag: "laptop_app_shop" },
  { id: "takeout", name: "外卖到家", icon: "🍔", desc: TAKEOUT_APP_DESCRIPTION, kind: "market", flag: "laptop_app_takeout" },
  { id: "live", name: "自媒体直播", icon: "📡", desc: "后续开发中", kind: "market", flag: "laptop_app_live", enabled: LIVE_FEATURE_ENABLED },
  { id: "invest", name: "顺顺花", icon: "📊", desc: "股票行情、买卖委托、保证金与抵押贷款", kind: "market", flag: "laptop_app_invest" },
];

export const LAPTOP_MARKET_APPS = LAPTOP_APPS.filter((app) => app.enabled !== false && app.kind === "market");

export function getLaptopApp(id: string): LaptopAppMeta | undefined {
  return LAPTOP_APPS.find((app) => app.id === id);
}

export function isLaptopAppInstalled(state: Pick<GameState, "flags">, id: string): boolean {
  const app = getLaptopApp(id);
  return !!app && app.enabled !== false && (app.kind === "builtin" || !!state.flags[app.flag]);
}

/** 桌面和任务栏从同一份、按 ID 唯一的安装清单生成。 */
export function installedLaptopApps(state: Pick<GameState, "flags">): LaptopAppMeta[] {
  return LAPTOP_APPS.filter((app) => isLaptopAppInstalled(state, app.id));
}

export function installLaptopApp(
  state: Pick<GameState, "flags">,
  id: string,
): { ok: boolean; text: string; alreadyInstalled: boolean } {
  const app = getLaptopApp(id);
  if (!app) return { ok: false, text: "电脑商城没有这个软件", alreadyInstalled: false };
  if (app.enabled === false) return { ok: false, text: "自媒体直播暂未开放，等待后续开发", alreadyInstalled: false };
  if (isLaptopAppInstalled(state, id)) {
    return { ok: true, text: `打开 ${app.name}`, alreadyInstalled: true };
  }
  state.flags[app.flag] = true;
  return { ok: true, text: `已安装 ${app.name}，可从电脑桌面打开`, alreadyInstalled: false };
}

/** 仅在旧档 31→32 迁移时调用；旧版的六个固定入口全部保留为电脑已安装软件。 */
export function migrateLegacyLaptopApps(state: Pick<GameState, "flags">): void {
  if (state.flags.laptop_registry_migrated_v32) return;
  for (const app of LAPTOP_APPS.filter((app) => app.kind === "market")) state.flags[app.flag] = true;
  state.flags.laptop_registry_migrated_v32 = true;
}
