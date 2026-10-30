import type { GameState } from "../types";

/** Shared by log producers without importing the game engine or UI. */
export function nextLogSequence(state: GameState): number {
  const sequence = Math.max(Number(state.flags.log_sequence) || 0, ...state.log.map(entry => entry.sequence ?? 0)) + 1;
  state.flags.log_sequence = sequence;
  return sequence;
}
