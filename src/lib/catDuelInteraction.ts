export interface DuelBounds {left:number;top:number;width:number;height:number}
export interface DuelPointer {x:number;y:number}
import type {CatBattleState,CatOpponentMechanic,EnemyIntent} from '../game/types';

/** The preview exposes attack damage, but never future block or skill values. */
export function duelIntentDisplay(intent:EnemyIntent|undefined,damage:number,current=false):{visual:string;label:string}{
  const when=current?'当前行动':'下次行动';
  if(!intent)return {visual:'·',label:`敌方${when}尚未确定`};
  if(intent.kind==='attack'){
    const hits=Math.max(1,Math.floor(intent.hits??1));
    return {visual:`${damage}${hits>1?`×${hits}`:''}🗡️`,label:`敌方${when}：攻击，每段 ${damage} 点${hits>1?`，共 ${hits} 段`:''}`};
  }
  if(intent.kind==='defend')return {visual:'🛡️',label:`敌方${when}：防御`};
  const icons=new Set(['🍬','🕸️','💗','◇']);
  return {visual:icons.has(intent.icon)?intent.icon:'✨',label:`敌方${when}：特殊行动`};
}

/** Show present stages and counters without revealing future special-effect values. */
export function duelMechanicIndicators(b:CatBattleState,mechanic:CatOpponentMechanic|undefined):string[]{
  const out:string[]=[];
  if(mechanic?.dodge)out.push(b.duel?.dodgeLayer?'闪电护层':'护层已破');
  if(mechanic?.ghostRounds)out.push(b.turn%2===0?'薄影阶段':'实体阶段');
  if(mechanic?.corpseRounds)out.push(b.duel?.revived?'复生已使用':'复生待触发');
  if(mechanic?.summonMinions)out.push(`护卫幼崽 ${b.mechanicState?.minions??0} 只`);
  if(mechanic?.bombTurns)out.push(`炸弹倒计时 ${b.mechanicState?.bombCountdown??4} 回合`);
  if(mechanic?.selfDestruct)out.push(`自爆倒计时 ${Math.max(0,6-b.turn)} 回合`);
  if(b.opponentId==='roundhead')out.push(b.duel?.enraged?'第二阶段':'第一阶段');
  return out;
}

/** A mouse release must leave the hand upwards and remain inside the playable stage. */
export function duelDropAllowed(start:DuelPointer,end:DuelPointer,bounds:DuelBounds,handTop:number,headerBottom:number):boolean{
  return start.y-end.y>=36&&Math.hypot(end.x-start.x,end.y-start.y)>=42
    &&end.x>=bounds.left+8&&end.x<=bounds.left+bounds.width-8
    &&end.y>=headerBottom+16&&end.y<=Math.min(handTop-20,bounds.top+bounds.height*.73);
}

/** Position relative to the root survives the game's CSS UI scaling. */
export function duelRelativePoint(point:DuelPointer,bounds:DuelBounds):DuelPointer{
  return {x:(point.x-bounds.left)/Math.max(1,bounds.width)*100,y:(point.y-bounds.top)/Math.max(1,bounds.height)*100};
}
