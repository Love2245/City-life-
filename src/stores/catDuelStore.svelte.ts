import type { GameState } from '../game/types';
import { createInitialState } from '../game/core/state';
import { adoptCat } from '../game/core/cat';
import { DUEL_CARDS } from '../game/core/catDuelCards';
import { duelStateOf } from '../game/core/catDuelCollection';

export const duelLobby=$state<{source:'fun'|'tournament'}>({source:'fun'});
export const duelPractice=$state<{game:GameState|null}>({game:null});
/** An isolated state, not a flag on live progress. Even deck edits never touch a real save. */
export function openDuelPractice(live:GameState):void{
  const s=createInitialState();
  const pet=live.pets.find(p=>p.uid===live.activePet);
  if(pet){s.pets=[JSON.parse(JSON.stringify(pet))];s.activePet=pet.uid;s.pets[0].fostered=false;delete s.pets[0].injured;delete s.pets[0].sick;}
  else adoptCat(s,'orange');
  s.catDuel=JSON.parse(JSON.stringify(duelStateOf(live)));
  delete s.catDuel!.offer;delete s.catDuel!.recovery;
  // Standalone practice exposes all ordinary cards without granting them to the player.
  for(const def of DUEL_CARDS){const n=s.catDuel!.collection.filter(c=>c.cardId===def.id).length;for(let i=n;i<2;i++)s.catDuel!.collection.push({uid:`dc_${++s.catDuel!.sequence}`,cardId:def.id,upgraded:false});}
  s.flags.cat_duel_practice=true;duelPractice.game=s;
}
