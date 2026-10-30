import type {GameState} from '../game/types';
import {presentNpcs} from '../game/core/npcTalk';

export const isCafeLocation=(id:string)=>id==='cafe'||id==='boyue_cafe';

/** Presentation follows existing presence and clock rules; it never changes
 * schedules, relationship discovery, prices, time or the save schema. */
export function cafeSceneState(state:GameState,people=presentNpcs(state)){
  const enabled=isCafeLocation(state.locationId);
  const guest=enabled?people.find(n=>n.id==='npc_lin_xiaoyu'):undefined;
  return {
    enabled,
    night:state.time.hour>=18||state.time.hour<6,
    linPresent:!!guest,
    guest,
    drinkActionId:state.locationId==='boyue_cafe'?'boyue_drink_cafe':'drink_cafe',
  };
}
