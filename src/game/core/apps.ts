/**
 * v1.3 App 注册中心
 * ------------------------------------------------------------------
 * 单一真相源：集中声明手机（及笔记本桌面）所有 App 的元数据。
 * 应用市场、笔记本桌面、主屏扩展均从此处读取，避免多处硬编码。
 *
 * 分类（kind）：
 *  - "builtin"  内置 App（出厂即装，不可卸载）
 *  - "market"   应用市场商品（需下载安装，flag 控制已安装态）
 *  - "social"   社交类 App（Moments 等，内置但属社交分支）
 */

export type AppKind = "builtin" | "market" | "social";

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
}

/** 既有内置 App（出厂即装） */
const BUILTIN_APPS: AppMeta[] = [
  { id: "todo", name: "待办", icon: "📋", desc: "每日目标与日程提醒", kind: "builtin", flag: "", onHome: true },
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
  { id: "app_delivery", name: "🛵 外卖接单", icon: "🛵", desc: "下载后可直接开始兼职送外卖，按交通工具计酬", kind: "market", flag: "app_delivery", onHome: true },
  // v1.3 新增：消费侧与内容侧 App
  { id: "app_takeout", name: "🍔 外卖到家", icon: "🍔", desc: "在线点餐，快餐轻食送上门（约 1 小时送达）", kind: "market", flag: "app_takeout", onHome: true },
  { id: "app_shop", name: "🛒 网购商城", icon: "🛒", desc: "线上购买商场同款，价格更低但需 3 天快递", kind: "market", flag: "app_shop", onHome: true },
  { id: "app_live", name: "📡 自媒体直播", icon: "📡", desc: "直播才艺赚影响力，需直播设备与电脑", kind: "market", flag: "app_live", onHome: true },
  { id: "app_forum", name: "💬 城市论坛", icon: "💬", desc: "市民发帖分享日常与城市资讯（笔记本专属）", kind: "market", flag: "app_forum", onHome: false },
];

/** 全部 App 注册表 */
export const APPS: AppMeta[] = [...BUILTIN_APPS, ...SOCIAL_APPS, ...MARKET_APP_LIST];

/** 应用市场商品（仅 kind === "market"） */
export const MARKET_APPS: AppMeta[] = MARKET_APP_LIST;

/** 按 id 查询 App 元数据 */
export function getApp(id: string): AppMeta | undefined {
  return APPS.find((a) => a.id === id);
}

/** 主屏网格应展示的 App（onHome === true 且非纯子页） */
export const HOME_APPS: AppMeta[] = APPS.filter((a) => a.onHome && a.id !== "settings");

/** 校验：所有 market App 必须有非空 flag */
export const APP_REGISTRY_OK = MARKET_APPS.every((a) => a.flag.length > 0);
