import type {DuelCardDef} from '../game/catDuelTypes';
/** The real hand keeps its draw order. Only the inspected card changes display layer. */
export function fanLayout(count:number,index:number,width:number,cardWidth:number):{x:number;y:number;angle:number;z:number}{
  const middle=(count-1)/2,offset=index-middle;
  const gap=count<=1?0:Math.max(12,Math.min(cardWidth*.67,(Math.max(0,width-cardWidth-22))/(count-1)));
  const normalized=middle?offset/middle:0;
  return {x:offset*gap,y:Math.round(normalized*normalized*20),angle:normalized*Math.min(13,count*1.6),z:index+1};
}
/** Short, complete rules for a printed face. Explanations belong in the inspect tooltip. */
export function printedCardRules(card:DuelCardDef):string[]{
  const e=card.effect,lines:string[]=[];
  if(e.strength)lines.push(`获得 ${e.strength} 点力量。`);
  if(e.power)lines.push(`造成 ${e.power} 点伤害${(e.hits??1)>1?`，重复 ${e.hits} 次`:''}。`);
  if(e.strengthMultiplier)lines.push(`力量对本牌的伤害加成 ×${e.strengthMultiplier}。`);
  if(e.blockDamage)lines.push(`造成等同当前格挡的伤害。`);
  if(e.combo)lines.push(`本回合此前已出 ${e.combo} 张牌时，伤害 +${e.comboBonus}。`);
  if(e.block)lines.push(`获得 ${e.block} 点格挡。`);

  if(e.retaliate)lines.push(`本回合受到攻击时，反击 ${e.retaliate} 点伤害。`);
  if(e.retainBlock)lines.push(`下回合保留至多 ${e.retainBlock} 点剩余格挡。`);
  if(e.heal)lines.push(`恢复 ${e.heal} 点生命。`);
  if(e.draw)lines.push(`抽 ${e.draw} 张牌。`);
  if(e.energy)lines.push(`获得 ${e.energy} 点能量。`);
  if(e.poison)lines.push(`施加 ${e.poison} 层中毒。`);
  if(e.poisonFactor)lines.push(`敌方中毒层数变为 ${e.poisonFactor} 倍。`);
  if(e.weak)lines.push(`施加 ${e.weak} 回合虚弱。`);
  if(e.vulnerable)lines.push(`施加 ${e.vulnerable} 回合易伤。`);
  if(e.cure)lines.push('移除自身中毒、虚弱和易伤。');
  if(e.pierce)lines.push('无视敌方格挡。');
  return lines;
}
