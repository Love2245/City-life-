/**
 * emoji 图标映射表：不引入图片资源，全局可换肤。
 * 纯前端工具（可 import Svelte）。
 */

/** 属性 → emoji */
export const ATTR_ICONS: Record<string, string> = {
  stamina: "⚡",
  health: "❤️",
  mood: "😊",
  hygiene: "🫧",
  satiety: "🍚",
  intelligence: "🧠",
  charm: "💄",
  fitness: "💪",
  fame: "🌟",
  stress: "🔥",
};

/** 属性 → 中文名 */
export const ATTR_NAMES: Record<string, string> = {
  stamina: "体力",
  health: "健康",
  mood: "心情",
  hygiene: "干净度",
  satiety: "饱腹",
  intelligence: "智力",
  charm: "魅力",
  fitness: "体质",
  fame: "影响力",
  stress: "压力",
};

/** 技能 → emoji */
export const SKILL_ICONS: Record<string, string> = {
  programming: "💻",
  design: "🎨",
  writing: "✍️",
  operation: "📈",
  cooking: "🍳",
  service: "🛎️",
  driving: "🚗",
  management: "🗂️",
};

/** 技能 → 中文名 */
export const SKILL_NAMES: Record<string, string> = {
  programming: "编程",
  design: "设计",
  writing: "文案",
  operation: "运营",
  cooking: "厨艺",
  service: "服务",
  driving: "驾驶",
  management: "管理",
};

/** 地点 id → emoji */
export const LOCATION_ICONS: Record<string, string> = {
  home: "🏠",
  convenience_store: "🏪",
  library: "📚",
  park: "🌳",
  cafe: "☕",
  labor_market: "🧰",
  housing_agency: "🏢",
  market: "🥬",
  gym: "🏋️",
  internet_cafe: "🕹️",
  clinic: "🏥",
  street: "🛣️",
};

/** 地点 id → 中文名 */
export const LOCATION_NAMES: Record<string, string> = {
  home: "住处",
  convenience_store: "便利店",
  library: "图书馆",
  park: "公园",
  cafe: "咖啡厅",
  labor_market: "劳务市场",
  housing_agency: "房屋中介",
  market: "菜市场",
  gym: "健身房",
  internet_cafe: "网吧",
  clinic: "诊所",
  street: "街边",
};
