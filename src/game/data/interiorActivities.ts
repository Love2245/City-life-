import type {ActionDef,ItemDef} from '../types';

/** Ordinary actions: the shared action pipeline owns costs, time, caps and closing time. */
export const SOFA_CHOICES = [
  {key:'relax',name:'休息放松',duration:1,stamina:8,mood:3,stress:-3,desc:'靠着沙发放松 1 小时，恢复少量体力。'},
  {key:'nap',name:'短暂小睡',duration:2,stamina:15,mood:2,stress:-4,desc:'在沙发上小睡 2 小时，稍微缓解疲惫。'},
] as const;
export const INTERIOR_ITEMS:ItemDef[] = [
  {id:'cafe_croissant',name:'黄油可颂',icon:'🥐',desc:'酥香的小可颂，适合垫垫肚子。',cost:12,shopPrice:12,startOffer:false,consumable:true,useEffects:{satiety:12,mood:2}},
  {id:'cafe_bagel',name:'原味贝果',icon:'🥯',desc:'有些嚼劲的小贝果，适合配一杯咖啡。',cost:15,shopPrice:15,startOffer:false,consumable:true,useEffects:{satiety:18,mood:1}},
];
export const INTERIOR_ACTIONS:ActionDef[] = [
  ...['home','cafe','boyue_cafe'].flatMap(locationId=>SOFA_CHOICES.map(choice=>({
    id:`${locationId}_sofa_${choice.key}`,locationId,name:choice.name,icon:'🛋️',desc:choice.desc,
    duration:choice.duration,...(locationId==='home'?{requiresFacility:'rest' as const}:{}),
    effects:{stamina:choice.stamina,mood:choice.mood,stress:choice.stress,log:`在沙发上${choice.name}了${choice.duration}小时`},
    verdicts:[choice.key==='nap'?'醒来伸了个懒腰，精神恢复了一些。':'把琐事暂时放下，身体和心情都松快了一些。'],sound:'nap' as const,
  }))),
  ...['cafe','boyue_cafe'].flatMap(locationId=>[
    ...INTERIOR_ITEMS.map(item=>({id:`${locationId}_buy_${item.id}`,locationId,name:`买${item.name}`,icon:item.icon,
      desc:`${item.desc} 饱腹 +${item.useEffects?.satiety}，可打包或店内用餐。`,duration:0,handler:'buy_food' as const,itemId:item.id,
      requirements:{money:item.shopPrice},effects:{money:-item.shopPrice!},sound:'coin' as const})),
    {id:`${locationId}_read_magazine`,locationId,name:'翻阅店内书刊',icon:'📖',
      desc:'在书架边挑一本店内杂志，读半小时，放松心情。',duration:.5,
      effects:{mood:3,stress:-2,log:'翻阅了咖啡厅的店内书刊'},verdicts:['读了几页城市里的小事，慢慢静下心来。'],sound:'read' as const},
  ]),
];
export const isSofaAction=(id:string)=>INTERIOR_ACTIONS.some(action=>action.id===id&&id.includes('_sofa_'));
