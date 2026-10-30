/**
 * 数值格式化工具（纯前端）。
 */

const numberFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, useGrouping: false });
const moneyFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

/** 玩家可见数值最多保留两位小数；不改动结算精度。 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return numberFormatter.format(Math.abs(n) < 0.005 ? 0 : n);
}

/** 金钱格式化：1234 → 1,234，金额最多显示到分。 */
export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return moneyFormatter.format(Math.abs(n) < 0.005 ? 0 : n);
}

/** 带符号的数值（用于行动卡收益标签） */
export function signed(n: number): string {
  const value = formatNumber(n);
  return n > 0 && value !== "0" && value !== "—" ? `+${value}` : value;
}

/** 日期格式化：year 年 month 月 day 日 */
export function formatDate(year: number, month: number, day: number): string {
  return `${year}年${month}月${day}日`;
}

/** 百分比（0-100 → 0%-100%） */
export function formatPercent(v: number): string {
  return `${Math.round(v)}%`;
}

/** 属性值着色（用于低值告警）：返回 CSS 类名 */
export function attrTone(v: number): string {
  if (v <= 20) return "tone-danger";
  if (v <= 40) return "tone-warn";
  return "tone-ok";
}

/** 压力值着色 */
export function stressTone(v: number): string {
  if (v >= 80) return "tone-danger";
  if (v >= 60) return "tone-warn";
  return "tone-ok";
}
