import type { RestaurantCfg } from '../game/core/minigame';
export type CraftKind = 'coffee'|'bar'|'western'|'grill'|'cocktail';
export interface FoodPlacement { id:string; x:number; y:number }
export interface CraftState {
  phase:'prep'|'cook'|'finish'|'done'; running:boolean; progress:number;
  flipped:boolean; strokes:number; quality:number; placed:FoodPlacement[];
  animation:string; sequence:number;
  motionLeft:number; motionTotal:number; nextPhase:CraftState['phase']|null;
  iceAdded?:boolean;
  measured?:boolean;
}
export function createCraftState():CraftState { return {phase:'prep',running:false,progress:0,flipped:false,strokes:0,quality:1,placed:[],animation:'',sequence:0,motionLeft:0,motionTotal:0,nextPhase:null}; }
export function motionProgress(s:CraftState) {return s.motionTotal?1-s.motionLeft/s.motionTotal:1;}
export function craftBusy(s:CraftState) {return s.motionLeft>0;}
function motion(s:CraftState,name:string,ms:number,next:CraftState['phase']|null=null){s.animation=name;s.motionLeft=ms;s.motionTotal=ms;s.nextPhase=next;s.sequence++;}
export function craftKind(cfg:RestaurantCfg):CraftKind {
  if(cfg.craftMode==='cocktail')return 'cocktail';
  return cfg.ingredients.some(i=>i.id==='skewer')?'grill':cfg.mode!=='cup'?'western':cfg.ingredients.some(i=>i.id==='cup')?'bar':'coffee';
}
export function plateIngredients(recipe:string[]) {return recipe.filter(id=>!['plate','wine'].includes(id));}
export function cookingMethod(recipe:string[]) {return recipe.includes('steak')||recipe.includes('fish')?'sear':recipe.includes('pasta')?'boil':'toss';}
export function craftLabel(kind:CraftKind,s:CraftState,recipe:string[]):string {
  if(s.phase==='done')return '制作完成';
  if(kind==='cocktail')return s.phase==='prep'?s.measured?'加入冰块':'量取配料并入调酒器':s.phase==='cook'?recipe.includes('gin')?`摇匀酒液 ${s.strokes}/3`:'轻搅酒液并倒入酒杯':recipe.includes('lime')?'放上青柠装饰':'整理杯口与酒签';
  if(kind==='coffee')return s.phase==='finish'?recipe.includes('foam')?'拉花收尾':'完成出杯':s.running?recipe.includes('espresso')?'停止萃取':'停止泡茶':s.phase==='cook'?recipe.includes('espresso')?'重新萃取':'重新泡茶':recipe.includes('espresso')?'开始萃取':'开始泡茶';
  if(kind==='bar')return s.phase==='prep'?`${recipe.includes('coffee')&&!recipe.includes('ice')?'搅拌热饮':'摇匀饮品'} ${s.strokes}/3`:s.running?'压下封口':'启动封口机';
  if(kind==='western')return s.phase==='finish'?'摆放菜品':cookingMethod(recipe)==='toss'?`拌匀沙拉 ${s.strokes}/3`:s.running?recipe.includes('pasta')?'沥水装盘':'起锅装盘':s.phase==='cook'?'重新烹调':recipe.includes('pasta')?'下锅煮面':'开始煎制';
  return s.phase==='finish'?recipe.includes('wrap')?'抹酱卷饼':recipe.includes('box')?'拌酱打包':'刷酱打包':recipe.includes('wrap')?'离火卷饼':recipe.includes('box')?'离火装盒':'离火收串';
}
export function craftHint(kind:CraftKind,s:CraftState,recipe:string[],heat:number):string {
  if(s.phase==='done')return `制作完成 · 手法 ${Math.round(s.quality*100)} 分，配齐小食后出餐`;
  if(kind==='cocktail')return s.phase==='prep'?recipe.includes('ice')&&!s.iceAdded?'原料放齐后加冰，再量取酒液；冰块数量按酒单执行':'量取酒单配料，倒入调酒器或酒杯':s.phase==='cook'?recipe.includes('gin')?'每次摇匀动作完成后再操作，摇匀三次后装饰':'本酒单不需要摇酒；轻搅并沿杯壁倒酒':recipe.includes('lime')?'把青柠放在杯沿，完成酒单装饰后交付':'本酒单不加青柠；整理杯口与酒签后交付';
  if(kind==='grill')return s.phase==='finish'?recipe.includes('wrap')?'饼皮已离锅，抹酱卷好再装入纸袋':recipe.includes('box')?'食材已离锅，拌入辣酱再装盒':'食物已离火，刷酱后装入纸托':heat>90?'已经烤焦，请清空重做':!s.flipped?recipe.includes('box')?'35% 后翻炒，65–90% 离锅装盒':'35% 后翻面，两面烤熟再离火':'65–90% 离火，之后不会继续烤焦';
  if(kind==='western'&&s.phase==='finish')return '移动到餐盘上点击放菜，也可用「摆放菜品」自动对准餐位';
  if(kind==='western'&&cookingMethod(recipe)==='sear'&&!s.flipped&&s.running)return '35% 后翻面，65–90% 起锅';
  if(kind==='bar'&&s.phase==='prep')return recipe.includes('coffee')&&!recipe.includes('ice')?'热饮搅拌三次，之后封杯交付':'原料放齐后摇匀三次，再对准金色区间封杯';
  if(s.phase==='cook'&&!s.running)return '本次制作已停止，请重新开始并对准金色区间';
  if(s.running)return s.phase==='finish'&&kind!=='bar'?'正在完成最后一道工序…':'在金色区间按下停止按钮，过早或过晚需要重做';
  return s.phase==='finish'?'按下收尾按钮，完成本杯装饰':'放齐订单原料，开始本单制作';
}
export function primaryCraft(s:CraftState,kind:CraftKind,recipe:string[],heat:number):string {
  if(s.phase==='done'||craftBusy(s)||s.running&&s.phase==='finish'&&kind!=='bar')return '';
  if(kind==='cocktail'){
    if(s.phase==='prep'){
      if(!s.measured){s.measured=true;motion(s,'measure',900,recipe.includes('ice')?null:'cook');}
      else {s.iceAdded=true;motion(s,'ice',700,'cook');}
    }else if(s.phase==='cook'){
      s.strokes++;motion(s,recipe.includes('gin')?'shake':'stir',700,s.strokes>=(recipe.includes('gin')?3:1)?'finish':null);
    }else motion(s,'garnish',900,'done');
    return '';
  }
  if(kind==='grill') {
    if(s.phase==='finish'){s.running=true;s.progress=0;s.animation='brush';return '';}
    if(heat<65)return '火候还不够，请在 65–90% 时离火';
    if(heat>90)return '烤焦了，请清空后重新制作';
    if(!s.flipped)return '还没有翻面，请把另一面烤熟';
    s.phase='finish';s.running=false;s.quality=Math.max(.8,1-Math.abs(heat-77)/100);motion(s,'lift',900);return '';
  }
  if(kind==='bar'&&s.phase==='prep'||kind==='western'&&cookingMethod(recipe)==='toss'&&s.phase==='prep') {
    s.strokes++;motion(s,kind==='bar'?'shake':'toss',700,s.strokes>=3?'finish':null);
    return '';
  }
  if(kind==='coffee'&&s.phase==='finish'){s.running=true;s.progress=0;s.animation=recipe.includes('foam')?'latte':'pour';return '';}
  if(kind==='western'&&s.phase==='finish')return '';
  if(!s.running){s.phase=kind==='bar'?'finish':'cook';s.running=true;s.progress=0;s.flipped=false;s.animation=kind==='bar'?'seal':kind==='coffee'?'brew':cookingMethod(recipe);return '';}
  if(s.progress<55||s.progress>90){s.running=false;return s.progress<55?'时间太短，请重新制作并等到金色区间':'制作过头了，请重新开始';}
  if(kind==='western'&&cookingMethod(recipe)==='sear'&&!s.flipped)return '还没有翻面，请煎好另一面再起锅';
  s.quality=Math.max(.8,1-Math.abs(s.progress-74)/100);
  s.running=false;s.phase='finish';s.progress=0;motion(s,kind==='bar'?'sealPress':'lift',900,kind==='bar'?'done':null);
  return '';
}
export function flipCraft(s:CraftState,progress:number):string {
  if(craftBusy(s))return '';
  if(s.flipped)return '这一单已经翻过面';
  if(progress<35)return '这一面还没烤好，35% 后再翻面';
  if(progress>90)return '已经焦了，请重新制作';
  s.flipped=true;motion(s,'flip',700);return '';
}
export function advanceCraft(s:CraftState,kind:CraftKind,tickScale:number) {
  if(s.motionLeft>0){s.motionLeft=Math.max(0,s.motionLeft-100*tickScale);if(s.motionLeft===0){if(s.nextPhase)s.phase=s.nextPhase;s.nextPhase=null;} }
  if(!s.running)return;
  s.progress=Math.min(100,s.progress+(s.phase==='finish'&&kind!=='bar'?5.5:kind==='bar'?2.2:kind==='coffee'?1.3:1.1)*tickScale);
  if(s.progress>=100){s.running=false;if(s.phase==='finish'&&kind!=='bar'){s.phase='done';s.animation='ready';s.sequence++;}}
}
export function placeCraft(s:CraftState,recipe:string[],x?:number,y?:number) {
  if(s.phase!=='finish'||s.running||craftBusy(s))return;
  const ids=plateIngredients(recipe),index=s.placed.length,id=ids[index];if(!id)return;
  const targets=ids.length===1?[[50,50]]:ids.length===2?[[35,45],[66,53]]:[[36,36],[66,36],[36,70],[66,70]];
  const ideal=targets[index%targets.length];
  const px=Math.max(18,Math.min(82,x??ideal[0])),py=Math.max(20,Math.min(80,y??ideal[1]));
  const distance=Math.hypot(px-ideal[0],py-ideal[1]);
  s.quality=Math.max(.75,s.quality-distance/500);s.placed.push({id,x:px,y:py});motion(s,'plate',700,s.placed.length===ids.length?'done':null);
}
