import type { CityCommissionState, GameState, Quest } from "../types";

/** 正式制作中的任务。删除的样板不再从任何游戏或调试入口发放。 */
export const CURRENT_NPC_TASK_IDS = ["zhao_toy", "zhao_staff"] as const;
export type CurrentNpcTaskId = typeof CURRENT_NPC_TASK_IDS[number];
const retiredItems = ["task_print_original", "task_print_good", "task_print_wrong", "task_print_receipt", "task_vegetable_crate", "task_delivery_appointment", "task_delivery_receipt"];
export function isCurrentNpcTask(id: string): boolean { return (CURRENT_NPC_TASK_IDS as readonly string[]).includes(id); }

/** 所有旧占位委托已退役；工作、每日目标和普通剧情不在清理范围内。 */
export function isRetiredNpcQuest(quest: Quest): boolean {
  if (quest.npcTask) return !isCurrentNpcTask(quest.npcTask.taskId);
  return !!quest.commission || (typeof quest.id === "string"
    && (quest.id.startsWith("comm_") || quest.id.startsWith("city_comm_")));
}

/** 保留旧存档字段的空结构，停止轮换与冷却；不在读取派生状态时调用。 */
export function emptyCityCommissionState(): CityCommissionState {
  return { weekIndex: 0, offeredIds: [], activeId: null, cooldownUntilDay: {} };
}

/** 旧档中止已删除委托，清掉已撤下样板的专属道具；不扣好感、不发奖、不改变现金。 */
export function removeRetiredNpcTasks(state: GameState): void {
  if (Array.isArray(state.quests) && state.quests.some(isRetiredNpcQuest)) {
    state.quests = state.quests.filter(q => !isRetiredNpcQuest(q));
  }
  const old = state.cityCommissions;
  if (!old || old.weekIndex !== 0 || old.activeId !== null || !Array.isArray(old.offeredIds)
    || old.offeredIds.length > 0 || !old.cooldownUntilDay || Object.keys(old.cooldownUntilDay).length > 0) {
    state.cityCommissions = emptyCityCommissionState();
  }
  if (state.inventory) for (const id of retiredItems) if (id in state.inventory) delete state.inventory[id];
}
