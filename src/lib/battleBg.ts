/**
 * v1.37 对决背景：按「场地 × 时间段」选择背景图（资源来自 docs/battle-bg-prompts.md 的 AI 成品图）。
 *
 * 场地映射（由 locationId 决定）：
 * - park / lake_park      → 公园草地
 * - amusement_park / market_fair → 游乐场擂台
 * - street（及其他未知）  → 街角巷口
 * - Boss（roundhead）     → 耄耋之王王座（不分时段）
 * 时间段：6:00-17:00 白天 / 17:00-20:00 黄昏 / 20:00-6:00 夜晚。
 */

export type BattleBgKey = "alley" | "park" | "arena" | "boss";

const BG_MODULES = import.meta.glob<string>("../assets/bg/battle/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

function indexBg(mods: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(mods)) {
    const file = path.split("/").pop() ?? "";
    out[file.replace(/\.png$/, "")] = url;
  }
  return out;
}

const BG_ART = indexBg(BG_MODULES);

/** 场地 → 背景 key（Boss 优先） */
export function battleBgKeyFor(locationId: string, isBoss: boolean): BattleBgKey {
  if (isBoss) return "boss";
  if (locationId === "park" || locationId === "lake_park") return "park";
  if (locationId === "amusement_park" || locationId === "market_fair") return "arena";
  return "alley";
}

/** 时间段 → 时段 key */
export function battleBgPeriod(hour: number): "day" | "dusk" | "night" {
  if (hour >= 20 || hour < 6) return "night";
  if (hour >= 17) return "dusk";
  return "day";
}

/** 取背景图 URL（缺图时回退到相邻时段，最终回退 undefined 由 UI 显示纯渐变） */
export function battleBgArt(key: BattleBgKey, hour: number): string | undefined {
  if (key === "boss") return BG_ART["boss"] ?? undefined;
  const period = battleBgPeriod(hour);
  let candidates: string[];
  if (period === "day") candidates = ["_day", "_dusk", "_night"];
  else if (period === "dusk") candidates = ["_dusk", "_day", "_night"];
  else candidates = ["_night", "_dusk", "_day"];
  for (const c of candidates) {
    const url = BG_ART[`${key}${c}`];
    if (url) return url;
  }
  return undefined;
}
