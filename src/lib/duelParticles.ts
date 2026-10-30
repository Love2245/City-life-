import type {BattleBgKey} from './battleBg';
import type {DuelMotionBeat} from './catDuelMotion';

export interface AmbientDuelParticle {
  id:number;x:number;y:number;size:number;dx:number;dy:number;
  duration:number;delay:number;opacity:number;color:string;leaf:boolean;
}
/** Presentation-only layout. Never consumes the battle/save random generator. */
export function ambientDuelParticles(scene:BattleBgKey,hour:number,options:{mobile?:boolean;reducedMotion?:boolean}={}):AmbientDuelParticle[]{
  if(options.reducedMotion)return [];
  const count=options.mobile?7:16;
  const night=hour>=20||hour<6;
  const colors=scene==='park'?['#c9d5a2','#e0d7aa','#b9c8a5']:scene==='arena'?['#e4c48f','#b7d5d2','#e0d4b4']:scene==='boss'?['#b9ced7','#e7cf9e','#c2d8d4']:['#dfc9a5','#becbd0','#dbd4bb'];
  return Array.from({length:count},(_,id)=>({
    id,x:7+(id*37%87),y:23+(id*13%35),size:scene==='park'&&id%4===0?4.5:1.7+(id%3)*.6,
    dx:(id%2?-1:1)*(15+id%5*5),dy:-(24+id%6*6),duration:14+id%7*1.8,
    delay:-(id*3.7%23),opacity:(night?.28:hour>=17?.23:.18)*(id%3===0?.8:1),
    color:colors[id%colors.length],leaf:scene==='park'&&id%4===0,
  }));
}

export interface ImpactDuelParticle {id:number;dx:number;dy:number;size:number;rotate:number;color:string;duration:number;round:boolean}
/** Small local bursts share the explicit hit/block/heal beat and disappear with it. */
export function impactDuelParticles(beat:DuelMotionBeat|null,reducedMotion=false):ImpactDuelParticle[]{
  if(!beat||reducedMotion)return [];
  const healing=beat.kind==='heal'&&(beat.amount??0)>0;
  const defending=(beat.kind==='block'&&(beat.amount??0)>0)||(beat.kind==='hurt'&&(beat.blocked??0)>0);
  const damage=beat.kind==='hurt'&&(beat.amount??0)>0;
  if(!healing&&!defending&&!damage)return [];
  const count=damage?8:6;
  return Array.from({length:count},(_,id)=>{
    const angle=(id*137.508+beat.id*23)*Math.PI/180;
    const distance=19+id%4*10;
    return {id,dx:Math.cos(angle)*distance,dy:Math.sin(angle)*distance-(healing?12:0),
      size:healing?3:2+id%3,rotate:id*57,color:healing?'#d0e5ae':defending&&(!damage||id<3)?'#c3e4e2':'#ffe0ae',
      duration:Math.max(20,beat.duration-12),round:healing||id%3===0};
  });
}
