import type {DuelEvent} from '../game/catDuelTypes';
export type MotionKind='cast'|'attack'|'collect'|'hurt'|'block'|'heal'|'status'|'draw'|'turn'|'finish'|'mechanic';
export interface DuelMotionBeat {id:number;kind:MotionKind;side:'player'|'opponent';source?:'player'|'opponent';duration:number;amount?:number;blocked?:number;hpAfter?:number;cardId?:string;hitIndex?:number;hits?:number;attack?:boolean;text:string;handAfter?:string[];energyAfter?:number;turnAfter?:number;pilesAfter?:{draw:number;discard:number;exhaust:number}}
/** Presentation consumes explicit events; translated battle logs are never parsed. */
export function duelMotionBeats(events:readonly DuelEvent[],reduced=false):DuelMotionBeat[]{
  const beats:DuelMotionBeat[]=[];
  for(const event of events){
    const kind:MotionKind=event.type==='card'?'cast':event.type==='damage'?'hurt':event.type;
    const duration=kind==='cast'?75:kind==='attack'?135:kind==='hurt'?180:kind==='turn'?270:kind==='finish'?300:kind==='draw'?250:kind==='collect'?80:kind==='mechanic'?120:115;
    const beat={...event,kind,duration:reduced?Math.min(30,duration):duration};
    const previous=beats[beats.length-1];
    if(kind==='status'&&previous?.kind==='status'&&previous.side===event.side){previous.text+=' · '+event.text;previous.id=event.id;continue;}
    beats.push(beat);
  }
  return beats;
}
export function poseForBeat(beat:DuelMotionBeat|null,side:'player'|'opponent'):'idle'|'attack'|'hurt'{
  if(beat?.kind==='attack'&&beat.side===side||beat?.kind==='hurt'&&beat.attack&&beat.source===side)return 'attack';
  if(beat?.kind==='hurt'&&beat.side===side&&(beat.amount??0)>0)return 'hurt';
  return 'idle';
}
