import type { LogEntry } from "../game/types";
import { showToast } from "../stores/uiStore.svelte";

/**
 * v1.463：迟到 / 发薪 等「重要事件」的 toast 反馈。
 *
 * 设计：不改逻辑层（src/game/core/*）任何函数签名，只在 UI 层对「本轮新增的日志条目」
 * 做扫描，挑出值得弹窗的事件。逻辑层照旧 pushLog，UI 层负责把其中重要的几条弹成 toast，
 * 覆盖迟到罚款、工资到账、自动离职结清工资等所有该类事件。
 *
 * 分层约束：本文件位于 src/lib/，允许 import UI 层工具（uiStore）；
 * 但禁止被 src/game/core/ 下任何文件 import（纯逻辑层不得依赖 Svelte）。
 */

/** 只挑这两类，其余一律不弹（避免刷屏） */
const IMPORTANT_ICONS = new Set(["⏰", "💰"]);

/** v1.463：从「本轮新增的日志条目」中挑出值得弹 toast 的重要事件文本（迟到 / 工资到账） */
export function pickImportantNotices(entries: LogEntry[]): string[] {
  const picked = entries.filter((e) => IMPORTANT_ICONS.has(e.icon)).map((e) => e.text);
  return picked;
}

/** 把新增日志里的重要事件交给通知队列，依次展示。 */
export function toastNewNotices(entries: LogEntry[]): void {
  for (const text of pickImportantNotices(entries)) {
    showToast(text);
  }
}
