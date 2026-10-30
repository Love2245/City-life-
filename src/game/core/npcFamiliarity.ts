import type { GameState } from "../types";
import { gameDay } from "./calendar";

/** Count completed conversations on distinct game days, independently of affinity. */
export function recordNpcDialogueDay(state: GameState, npcId: string): void {
  const day = gameDay(state.time);
  const lastKey = `npc_dialogue_last_day_${npcId}`;
  const countKey = `npc_dialogue_days_${npcId}`;
  if (state.flags[lastKey] === day) return;
  state.flags[lastKey] = day;
  const raw = state.flags[countKey];
  if (raw === undefined && state.contacts.some(contact => contact.id === `npc_${npcId}` || contact.npcId === npcId)) {
    state.flags[`npc_portrait_revealed_${npcId}`] = true;
  }
  const count = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  state.flags[countKey] = Math.min(3, count + 1);
  if (count + 1 >= 3) state.flags[`npc_portrait_revealed_${npcId}`] = true;
}

/** 兼容旧调用与旧存档；清晰立绘不再依赖关系、联系人或累计对话天数。 */
export function npcPortraitRevealed(_state: GameState, _npcId: string): boolean {
  return true;
}
