import type { CatCardDef } from '../types';
import type { DuelCardDef, DuelEffect, DuelFamily } from '../catDuelTypes';

export const DUEL_RULES_VERSION = 2 as const;
export const DUEL_HP = 80;
export const DUEL_MIN_DECK = 12;
export const DUEL_MAX_DECK = 20;
export const DUEL_COPY_LIMIT = 2;
export const STARTER_CARDS = ['scratch', 'pounce', 'guard', 'fortify', 'meow', 'catnap'];
const definitions: DuelCardDef[] = [];
function card(id: string, name: string, icon: string, type: CatCardDef['type'], family: DuelFamily,
  cost: number, effect: DuelEffect, plus: DuelEffect, plusCost = cost): void {
  for (const upgraded of [false, true]) {
    const e = { ...(upgraded ? plus : effect) };
    definitions.push({ id: id + (upgraded ? '_plus' : ''), baseId: id, name: name + (upgraded ? '＋' : ''), icon,
      type, family, element: 'normal', cost: upgraded ? plusCost : cost, effect: e, upgraded,
      quality: upgraded ? 1 : 0, desc: effectDescription(e) });
  }
}
export function effectDescription(e: DuelEffect): string {
  const parts: string[] = [];
  if (e.strength) parts.push(`本场力量 +${e.strength}（每段攻击伤害增加）`);
  if (e.power) parts.push(`造成 ${e.power}${(e.hits ?? 1) > 1 ? ` × ${e.hits}` : ''} 点伤害${e.pierce ? '，无视格挡' : ''}`);
  if (e.strengthMultiplier) parts.push(`力量对本牌的伤害加成变为 ${e.strengthMultiplier} 倍`);
  if (e.blockDamage) parts.push(`造成等同当前格挡的伤害`);
  if (e.combo) parts.push(`此前已出 ${e.combo} 张牌时，额外造成 ${e.comboBonus} 点伤害`);
  if (e.block) parts.push(`获得 ${e.block} 点格挡`);
  if (e.retainBlock) parts.push(`下回合保留至多 ${e.retainBlock} 点剩余格挡`);
  if (e.retaliate) parts.push(`至下回合开始前，每次受到攻击反击 ${e.retaliate} 点伤害`);
  if (e.heal) parts.push(`恢复 ${e.heal} 点生命`);
  if (e.draw) parts.push(`抽 ${e.draw} 张牌`);
  if (e.energy) parts.push(`获得 ${e.energy} 点能量`);

  if (e.poison) parts.push(`施加 ${e.poison} 层中毒`);
  if (e.poisonFactor) parts.push(`将敌方中毒层数变为 ${e.poisonFactor} 倍`);
  if (e.weak) parts.push(`施加 ${e.weak} 回合虚弱（攻击伤害降低25%）`);
  if (e.vulnerable) parts.push(`施加 ${e.vulnerable} 回合易伤（受到攻击伤害增加50%）`);
  if (e.cure) parts.push('清除自身中毒、虚弱和易伤');
  if (e.exhaust) parts.push('消耗：本场使用后移出牌堆，收藏不变');
  return parts.join('；') + '。';
}

// 36种基础牌：战士式简化效果，每张至多两种直观收益。0费过牌只使用一次。
card('scratch','抓挠','🐾','attack','通用',1,{power:6},{power:9});
card('pounce','重扑破绽','🐈','attack','力量',2,{power:8,vulnerable:2},{power:11,vulnerable:3});
card('heavy_strike','全力重击','💥','attack','力量',2,{power:14,strengthMultiplier:3},{power:18,strengthMultiplier:4});
card('flurry','双爪连击','💨','attack','连击',1,{power:4,hits:2},{power:5,hits:2});
card('guard','缩身防守','🛡️','defend','通用',1,{block:5},{block:8});
card('fortify','从容招架','🧱','defend','防反',1,{block:8,draw:1},{block:11,draw:1});
card('meow','喵喵鼓劲','🗨️','skill','通用',0,{draw:2,exhaust:true},{draw:3,exhaust:true});
card('catnap','打个盹','😴','skill','通用',1,{heal:5,exhaust:true},{heal:8,exhaust:true});
card('cleanfur','迅捷护身','✨','defend','防反',0,{block:3,exhaust:true},{block:5,exhaust:true});
card('battle_yell','战吼壮胆','📢','skill','力量',1,{strength:2,exhaust:true},{strength:3,exhaust:true});
card('refresh','舔毛净化','🧼','skill','通用',0,{cure:true,exhaust:true},{cure:true,block:3,exhaust:true});
card('atk_nature','压制爪击','🍃','attack','异常',2,{power:12,weak:2},{power:16,weak:2});
card('atk_tech','连打找机会','🔫','attack','连击',1,{power:9,draw:1},{power:10,draw:2});
card('atk_mystic','试探破绽','🔮','attack','异常',1,{power:4,vulnerable:1},{power:7,vulnerable:1});
card('atk_cosmic','星光重锤','🌠','attack','力量',3,{power:30},{power:38});
card('heal_small','小憩回气','💗','skill','通用',1,{heal:7,exhaust:true},{heal:10,exhaust:true});
card('heal_medium','安心休整','🥫','skill','通用',2,{heal:13,exhaust:true},{heal:17,exhaust:true});
card('venom_bite','压制咬击','☠️','attack','异常',1,{power:7,weak:1},{power:10,weak:1});
card('web_trap','牵制防守','🕸️','defend','异常',1,{block:4,weak:2},{block:6,weak:3});
card('ember_touch','炽热爪击','🔥','attack','力量',1,{power:10},{power:14});
card('drowsy_spores','看破弱点','🍄','skill','异常',1,{vulnerable:2,draw:1},{vulnerable:3,draw:1});
card('orange_exclusive','太阳斗志','☀️','attack','力量',2,{power:16,strength:1},{power:20,strength:1});
card('cow_exclusive','铁壁反打','🦬','attack','防反',1,{power:5,block:5},{power:7,block:7});
card('black_exclusive','迅爪突袭','🌘','attack','连击',0,{power:6,exhaust:true},{power:9,exhaust:true});
card('mint_exclusive','安心壁垒','🌿','defend','防反',1,{block:12,exhaust:true},{block:16,exhaust:true});
card('glass_exclusive','碎镜双刃','💠','attack','连击',2,{power:7,hits:2},{power:9,hits:2});
card('android_exclusive','系统压制','🤖','attack','异常',2,{power:14,weak:1},{power:18,weak:2});
card('spider_exclusive','三连爪击','🕷️','attack','连击',1,{power:2,hits:3},{power:3,hits:3});
card('golden_exclusive','超新星重击','🌟','attack','力量',3,{power:36,exhaust:true},{power:45,exhaust:true});
card('counter_stance','反击姿态','↩️','defend','防反',2,{block:12,retaliate:4},{block:16,retaliate:6});
card('shield_claw','盾爪回击','🦾','attack','防反',1,{blockDamage:1},{blockDamage:1},0);
card('hold_line','严阵以待','🏰','defend','防反',2,{block:20},{block:26});
card('follow_up','乘胜追击','⚡','attack','连击',1,{power:9,block:3},{power:12,block:4});
card('shadow_step','爪影掠过','👣','attack','连击',0,{power:3,draw:1,exhaust:true},{power:5,draw:1,exhaust:true});
card('catalyst','战意迸发','🧪','skill','力量',1,{strength:1,draw:1,exhaust:true},{strength:2,draw:1,exhaust:true});
card('steady','稳住阵脚','🪷','defend','通用',1,{block:6,cure:true},{block:9,cure:true});

export const DUEL_CARDS = definitions.filter(c => !c.upgraded);
const map = new Map(definitions.map(c => [c.id,c]));
export function legacyCardId(id: string): {baseId:string; upgraded:boolean; q:number; b:number} {
  const plus = id.endsWith('_plus');
  const m = (plus ? id.slice(0,-5) : id).match(/^(.*?)(?:_q(\d+))?(?:_b(\d+))?$/)!;
  return {baseId:m[1],upgraded:plus||Number(m[2]??0)>0||Number(m[3]??0)>0,q:Number(m[2]??0),b:Number(m[3]??0)};
}
export function getDuelCard(id: string): DuelCardDef | undefined {
  const exact=map.get(id);if(exact)return exact;
  const legacy=legacyCardId(id);return map.get(legacy.baseId+(legacy.upgraded?'_plus':''));
}
