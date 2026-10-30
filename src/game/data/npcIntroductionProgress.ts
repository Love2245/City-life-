import type { GameState } from '../types';

export const SHARED_INTRO_NPCS = ['npc_fan_kejie', 'npc_fan_kexi', 'npc_jack_fanma'] as const;
export const INTRO_FIRST_COMPLETE = 'npc_introduction_m01_complete';
export const INTRO_SECOND_COMPLETE = 'npc_introduction_m02_complete';
export const LOUNGE_BEER_COUPON = 'boyue_lounge_beer_coupon';

/** Missing flags deliberately mean the new opening is still pending in old saves. */
export function npcOrdinaryAppearanceUnlocked(state: Pick<GameState, 'flags'>, npcId: string): boolean {
  return !SHARED_INTRO_NPCS.some(id => id === npcId) || state.flags[INTRO_SECOND_COMPLETE] === true;
}
