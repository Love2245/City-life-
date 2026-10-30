import type { CatBattleState, CatBattleUnit, CatOpponentDef, EnemyIntent, GameState } from '../types';
import type { DuelConditions, DuelCardDef, DuelEvent } from '../catDuelTypes';
import { createRng, randomInt } from '../rng';
import { DUEL_HP, getDuelCard } from './catDuelCards';
import { collectionDefId, deckCheck, deckOf, ensureCatDuel } from './catDuelCollection';
import { activePetOf, isCatFostered } from './catCare';
import { getCatDef } from './cat';
import { getOpponentDef } from './catBattle';

const emptyConditions=():DuelConditions=>({poison:0,weak:0,vulnerable:0});
type DuelEventDetails=Omit<Partial<DuelEvent>,'id'|'type'|'side'|'text'|'amount'>;
export function emitDuelEvent(b:CatBattleState,type:DuelEvent['type'],side:DuelEvent['side'],text:string,amount?:number,details:DuelEventDetails={}):void {
  const d=b.duel!;d.events.push({id:++d.sequence,type,side,text,...(amount!==undefined?{amount}:{}),...details});
  if(d.events.length>160)d.events.splice(0,d.events.length-160);
  b.log.push(text);if(b.log.length>160)b.log.splice(0,b.log.length-160);
}
function conditions(b:CatBattleState,side:'player'|'opponent'):DuelConditions{return b.duel!.conditions[side];}
function visualSnapshot(b:CatBattleState):DuelEventDetails{return {handAfter:[...b.playerHand],energyAfter:b.playerEnergy,turnAfter:b.turn,pilesAfter:{draw:b.playerDrawPile.length,discard:b.playerDiscardPile.length,exhaust:b.duel?.exhaustPile.length??0}};}
function shuffle<T>(input:T[],rng:CatBattleState['rng']):T[]{const a=[...input];for(let i=a.length-1;i>0;i--){const j=randomInt(rng,0,i);[a[i],a[j]]=[a[j],a[i]];}return a;}
export function duelOpponentProfile(opp:CatOpponentDef):{hp:number;damage:number}{
  const lv=opp.level;
  if(opp.id==='roundhead')return {hp:160,damage:13};
  if(opp.tier==='boss'||lv>=16)return {hp:100+Math.max(0,lv-16)*7,damage:10+Math.floor(Math.max(0,lv-16)/2)};
  if(opp.tier==='intermediate'||lv>=8)return {hp:62+Math.max(0,lv-8)*5,damage:8+Math.floor(Math.max(0,lv-8)/3)};
  return {hp:32+lv*3,damage:5+Math.floor(lv/3)};
}
export function normalizedOpponent(opp:CatOpponentDef):CatBattleUnit{
  const {hp}=duelOpponentProfile(opp);return {name:opp.name,icon:opp.icon,desc:opp.desc,element:opp.element,level:opp.level,attrs:{hp,atk:10,def:10,spd:0},hp,skills:opp.skills};
}
export function normalizedPlayer(state:GameState,petUid:string):CatBattleUnit|null{
  const pet=state.pets.find(p=>p.uid===petUid);if(!pet||isCatFostered(pet))return null;
  const def=getCatDef(pet.catId);return {name:pet.name,icon:pet.icon,desc:def?.desc,element:def?.element??'normal',level:pet.level,attrs:{hp:DUEL_HP,atk:10,def:10,spd:0},hp:DUEL_HP,skills:def?.skills??[]};
}
export function startDuelBattle(state:GameState,opponentId:string,tournamentId?:string,opts?:{casual?:boolean}):{ok:boolean;reason?:string}{
  if(state.catBattle)return {ok:false,reason:'请先完成或结算当前对决'};
  const pet=activePetOf(state);if(!pet)return {ok:false,reason:'先携带一只猫咪才能对决'};
  const practice=!!state.flags.cat_duel_practice;
  if(!practice&&(pet.injured||pet.sick))return {ok:false,reason:pet.injured?'猫咪还受着伤，请先到宠物医院治疗':'猫咪生病了，请先好好照顾它'};
  const opp=getOpponentDef(opponentId);if(!opp)return {ok:false,reason:'未知对手'};
  if(!practice&&pet.level<(opp.minLevel??1))return {ok:false,reason:`需要猫咪等级 ≥ ${opp.minLevel} 才能挑战${opp.name}`};
  const d=ensureCatDuel(state);if(d.offer&&!practice)return {ok:false,reason:'请先领取或跳过上次的选牌奖励'};
  const entry=state.catTournament?.entry;
  if(tournamentId&&entry?.lockedDeck&&entry.lockedDeck.petUid!==pet.uid)return {ok:false,reason:'赛事已经锁定参赛猫咪，请携带原参赛猫咪继续'};
  const selected=deckOf(state,pet.uid);const valid=deckCheck(state,selected);if(!valid.ok)return valid;
  let cards=selected.map(uid=>{const c=d.collection.find(c=>c.uid===uid)!;return {uid,defId:collectionDefId(c)};});
  if(tournamentId&&entry){
    if(entry.lockedDeck)cards=entry.lockedDeck.cards.map(c=>({...c}));
    else entry.lockedDeck={petUid:pet.uid,cards:cards.map(c=>({...c}))};
  }
  const id=`duel_${++d.sequence}`;const instances=Object.fromEntries(cards.map((c,i)=>[`${id}_${i}`,c.defId]));
  const rng=createRng(randomInt(state.rng,1,2147483646));
  state.catBattle={opponentId,playerUid:pet.uid,tournamentId,casual:opts?.casual,
    player:normalizedPlayer(state,pet.uid)!,opponent:normalizedOpponent(opp),turn:0,log:[],finished:false,rng,phase:'player',
    playerEnergy:0,playerMaxEnergy:3,playerBlock:0,playerStrength:0,opponentBlock:0,opponentStrength:0,
    playerHand:[],playerDrawPile:shuffle(Object.keys(instances),rng),playerDiscardPile:[],
    mechanicState:{bombCountdown:opp.mechanic?.bombTurns?4:undefined,minions:opp.mechanic?.summonMinions??0,minionHp:8},
    duel:{rulesVersion:2,id,practice,sequence:0,cards:instances,exhaustPile:[],events:[],conditions:{player:emptyConditions(),opponent:emptyConditions()},
      retaliate:0,retainBlock:0,plays:0,attacks:0,roundDamage:0,dodgeLayer:false,revived:false,enraged:false}};
  delete d.recovery;
  emitDuelEvent(state.catBattle,'mechanic','player',`对决开始：${pet.name} 对阵 ${opp.name}。统一80生命，3能量，5张手牌。`);
  beginDuelTurn(state.catBattle);return {ok:true};
}
export function cardInBattle(b:CatBattleState,instance:string):DuelCardDef|undefined{return getDuelCard(b.duel?.cards[instance]??instance);}
function draw(b:CatBattleState,n:number):void{
  let drawn=0;
  for(let i=0;i<n&&b.playerHand.length<10;i++){
    if(!b.playerDrawPile.length){if(!b.playerDiscardPile.length)break;b.playerDrawPile=shuffle(b.playerDiscardPile,b.rng);b.playerDiscardPile=[];}
    const c=b.playerDrawPile.pop();if(c){b.playerHand.push(c);drawn++;}
  }
  if(drawn)emitDuelEvent(b,'draw','player',`抽取 ${drawn} 张牌。`,drawn,visualSnapshot(b));
}
export function attackDamage(base:number,strength:number,attacker:DuelConditions,defender:DuelConditions,strengthMultiplier=1):number{
  let n=Math.max(0,base+strength*strengthMultiplier);if(attacker.weak>0)n*=.75;if(defender.vulnerable>0)n*=1.5;
  return Math.max(0,Math.floor(n));
}
function hit(b:CatBattleState,side:'player'|'opponent',amount:number,pierce=false,attack=true,details:DuelEventDetails={}):number{
  const unit=side==='player'?b.player:b.opponent;let value=Math.max(0,Math.floor(amount));
  if(side==='opponent'&&attack){
    const mech=getOpponentDef(b.opponentId)?.mechanic;
    if(b.duel!.dodgeLayer){b.duel!.dodgeLayer=false;emitDuelEvent(b,'mechanic','opponent','闪电护层挡下这一段攻击，护层已经消失。');value=0;}
    if(mech?.ghostRounds&&b.turn%2===0)value=Math.min(1,value);
    if(mech?.summonMinions){while(value>0&&(b.mechanicState?.minions??0)>0){const absorb=Math.min(value,b.mechanicState!.minionHp??8);value-=absorb;b.mechanicState!.minionHp=(b.mechanicState!.minionHp??8)-absorb;if(b.mechanicState!.minionHp<=0){b.mechanicState!.minions!--;b.mechanicState!.minionHp=8;emitDuelEvent(b,'mechanic','opponent','一只护卫幼崽退场。');}}}
  }
  const key=side==='player'?'playerBlock':'opponentBlock';
  let blocked=0;
  if(!pierce){blocked=Math.min(value,b[key]);b[key]-=blocked;value-=blocked;}
  const actual=Math.min(unit.hp,value);unit.hp=Math.max(0,unit.hp-actual);
  emitDuelEvent(b,'damage',side,`${unit.name} 受到 ${actual} 点${attack?'攻击':'状态'}伤害。`,actual,{source:attack?(side==='player'?'opponent':'player'):undefined,attack,blocked,hpAfter:unit.hp,...details});
  if(side==='opponent')b.duel!.roundDamage+=actual;
  return actual;
}
function heal(b:CatBattleState,side:'player'|'opponent',n:number):void{
  const unit=side==='player'?b.player:b.opponent;const actual=Math.max(0,Math.min(n,unit.attrs.hp-unit.hp));unit.hp+=actual;
  emitDuelEvent(b,'heal',side,`${unit.name} 恢复 ${actual} 点生命。`,actual,{hpAfter:unit.hp});
}
function finishCheck(b:CatBattleState):void{
  if(b.finished)return;
  const mech=getOpponentDef(b.opponentId)?.mechanic;
  if(b.player.hp<=0){b.finished=true;b.won=false;}
  else if(b.opponent.hp<=0){
    if(mech?.corpseRounds&&!b.duel!.revived){b.duel!.revived=true;b.opponent.hp=Math.ceil(b.opponent.attrs.hp*.4);emitDuelEvent(b,'mechanic','opponent',`骷髅猫复生一次，恢复 ${b.opponent.hp} 生命。此次对决不会再次复生。`);}
    else {b.finished=true;b.won=true;}
  }
  if(!b.finished&&b.opponentId==='roundhead'&&!b.duel!.enraged&&b.opponent.hp<=b.opponent.attrs.hp/2){
    b.duel!.enraged=true;b.opponentStrength+=2;emitDuelEvent(b,'mechanic','opponent','圆头猫咪进入第二阶段：力量＋2，下次强招已在意图栏预告。');
  }
  if(b.finished){b.phase='over';emitDuelEvent(b,'finish',b.won?'opponent':'player',b.won?'本场对决胜利！':'本场对决结束，调整牌组后再来。');}
}
function poisonTick(b:CatBattleState,side:'player'|'opponent'):void{
  const c=conditions(b,side);if(c.poison>0){emitDuelEvent(b,'status',side,`中毒结算：${c.poison}层。`);hit(b,side,c.poison,true,false);c.poison--;finishCheck(b);}
}
function statusDecay(c:DuelConditions):void{c.weak=Math.max(0,c.weak-1);c.vulnerable=Math.max(0,c.vulnerable-1);}
function chooseIntent(b:CatBattleState):EnemyIntent{
  const opp=getOpponentDef(b.opponentId)!;const mech=opp.mechanic;const base=duelOpponentProfile(opp).damage;
  if(mech?.marshmallow)return {kind:'skill',name:'棉花糖的善意',icon:'🍬',value:80};
  if(mech?.bindEvery&&b.turn%3===0)return {kind:'skill',name:'蛛网：虚弱2回合',icon:'🕸️',value:0,status:'paralysis'};
  if(b.turn%4===0)return {kind:'attack',name:'蓄势重击',icon:'💥',value:Math.ceil(base*1.8)};
  if(b.turn%4===3)return {kind:'defend',name:'防御并准备重击',icon:'🛡️',value:base+3};
  const healer=opp.skills.some(id=>/heal|blessing|fragrance|rest/.test(id));
  if(healer&&b.opponent.hp<b.opponent.attrs.hp*.45&&b.turn%3===2)return {kind:'skill',name:'恢复体力',icon:'💗',value:Math.ceil(b.opponent.attrs.hp*.12)};
  if(opp.skills.some(id=>/venom|poison|spore|hiss/.test(id))&&b.turn%3===2)return {kind:'skill',name:'看破弱点：易伤2回合',icon:'◇',value:0,status:'sleep'};
  if(opp.tier==='boss'&&b.turn%3===2)return {kind:'attack',name:'连续扑击',icon:'🐾',value:Math.max(4,base-4),hits:2};
  return {kind:'attack',name:mech?.summonMinions?'幼崽协同扑击':'利爪扑击',icon:'🐾',value:base};
}
export function enemyDamage(b:CatBattleState):number{
  const i=b.enemyIntent;if(!i||i.kind!=='attack')return 0;
  const minionBonus=getOpponentDef(b.opponentId)?.mechanic?.summonMinions?(b.mechanicState?.minions??0):0;
  return attackDamage(i.value,b.opponentStrength+minionBonus,conditions(b,'opponent'),conditions(b,'player'));
}
export function duelMechanicText(b:CatBattleState):string[]{
  const mech=getOpponentDef(b.opponentId)?.mechanic;const out:string[]=[];
  if(mech?.dodge)out.push(b.duel?.dodgeLayer?'闪电护层：抵消下一段攻击；多段攻击可以击破':'护层已破；每3回合重新生成');
  if(mech?.ghostRounds)out.push(b.turn%2===0?'薄影回合：每段攻击至多造成1伤害；可先格挡或提升力量，等待实体回合':'实体回合：可正常攻击；下回合转为薄影');
  if(mech?.corpseRounds)out.push(b.duel?.revived?'复生已使用，不会再次复生':'首次倒地会复生至40%生命，仅一次');
  if(mech?.summonMinions)out.push(`护卫幼崽 ${b.mechanicState?.minions??0} 只，每只抵挡8攻击伤害；攻击先击破护卫，多段攻击可连续击破`);
  if(mech?.bombTurns)out.push(`炸弹剩 ${b.mechanicState?.bombCountdown??4} 回合，爆炸造成24伤害；单回合造成12实际伤害可拆除并重置`);
  if(mech?.selfDestruct)out.push(`第5回合自爆造成26伤害，可用格挡抵御；剩余 ${Math.max(0,6-b.turn)} 回合`);
  if(mech?.regen)out.push('每次行动后恢复3生命，先提升力量或施加易伤，再集中进攻');
  if(mech?.snowball)out.push('每2回合力量＋1，避免长时间拖延');
  if(mech?.bindEvery)out.push('每3回合施加虚弱，不会让玩家跳过整回合');
  if(b.opponentId==='roundhead')out.push(b.duel?.enraged?'第二阶段：力量＋2':'生命降至一半时进入第二阶段，力量＋2');
  return out;
}
function beginDuelTurn(b:CatBattleState):void{
  b.phase='player';b.turn++;b.playerEnergy=3;b.playerMaxEnergy=3;
  b.playerBlock=Math.min(b.playerBlock,b.duel!.retainBlock);b.duel!.retainBlock=0;b.duel!.retaliate=0;
  b.duel!.plays=0;b.duel!.attacks=0;b.duel!.roundDamage=0;
  poisonTick(b,'player');if(b.finished)return;
  b.duel!.dodgeLayer=!!getOpponentDef(b.opponentId)?.mechanic?.dodge&&b.turn%3===1;
  draw(b,5);b.enemyIntent=chooseIntent(b);emitDuelEvent(b,'turn','player',`第 ${b.turn} 回合：3点能量。`,undefined,visualSnapshot(b));
}
/** Shared resolver drives both actual play and previews on an isolated clone. */
export function resolveDuelCard(b:CatBattleState,card:DuelCardDef):void{
  const e=card.effect;const d=b.duel!;
  emitDuelEvent(b,'card','player',`使用「${card.name}」。`,undefined,{cardId:card.id,handAfter:[...b.playerHand],energyAfter:b.playerEnergy});
  if(e.cure){d.conditions.player=emptyConditions();emitDuelEvent(b,'status','player','清除了中毒、虚弱和易伤。');}
  if(e.block){b.playerBlock+=e.block;emitDuelEvent(b,'block','player',`获得 ${e.block} 点格挡。`,e.block);}
  if(e.strength){b.playerStrength+=e.strength;emitDuelEvent(b,'status','player',`力量＋${e.strength}。`,e.strength);}
  if(e.retaliate){d.retaliate+=e.retaliate;emitDuelEvent(b,'status','player',`本回合反击伤害＋${e.retaliate}。`);}
  if(e.retainBlock)d.retainBlock=Math.max(d.retainBlock,e.retainBlock);
  if(e.heal)heal(b,'player',e.heal);
  if(e.energy)b.playerEnergy+=e.energy;
  const base=e.blockDamage?b.playerBlock:e.power??0;
  if(base>0){
    const combo=e.combo&&d.plays>=e.combo?(e.comboBonus??0):0;
    emitDuelEvent(b,'attack','player',`准备发动${e.hits??1}段攻击。`,undefined,{source:'player',cardId:card.id,hits:e.hits??1});
    for(let n=0;n<(e.hits??1);n++){
      hit(b,'opponent',attackDamage(base+combo,b.playerStrength,conditions(b,'player'),conditions(b,'opponent'),e.strengthMultiplier??1),!!e.pierce,true,{hitIndex:n+1,hits:e.hits??1,cardId:card.id});
      if(b.opponent.hp<=0)break;
    }
    d.attacks++;
  }
  if(b.opponent.hp>0){
    for(const key of ['poison','weak','vulnerable'] as const){if(e[key]){conditions(b,'opponent')[key]+=e[key]!;emitDuelEvent(b,'status','opponent',`${key==='poison'?'中毒':key==='weak'?'虚弱':'易伤'}＋${e[key]}。`);}}
    if(e.poisonFactor){conditions(b,'opponent').poison*=e.poisonFactor;emitDuelEvent(b,'status','opponent',`中毒变为 ${conditions(b,'opponent').poison} 层。`);}
  }
  d.plays++;
  if(getOpponentDef(b.opponentId)?.mechanic?.bombTurns&&d.roundDamage>=12){b.mechanicState!.bombCountdown=4;emitDuelEvent(b,'mechanic','opponent','本回合伤害达到12，炸弹已拆除并重置为4回合。');}
  finishCheck(b);
}
export interface DuelCardPreview { damage:number; absorbed:number; minionDamage:number; block:number; heal:number; detail:string[] }
export function previewDuelCard(b:CatBattleState,instance:string):DuelCardPreview{
  const card=cardInBattle(b,instance);if(!card||!b.duel)return {damage:0,absorbed:0,minionDamage:0,block:0,heal:0,detail:[]};
  const copy:CatBattleState=JSON.parse(JSON.stringify(b));const before=copy.duel!.sequence;
  resolveDuelCard(copy,card);
  const damage=copy.duel!.events.filter(e=>e.id>before&&e.type==='damage'&&e.side==='opponent').reduce((n,e)=>n+(e.amount??0),0);
  const minionHp=(battle:CatBattleState)=>Math.max(0,((battle.mechanicState?.minions??0)-1)*8+(battle.mechanicState?.minions?(battle.mechanicState.minionHp??8):8));
  const absorbed=Math.max(0,b.opponentBlock-copy.opponentBlock),minionDamage=Math.max(0,minionHp(b)-minionHp(copy));
  const e=card.effect,base=e.blockDamage?b.playerBlock+(e.block??0):e.power??0;
  const combo=e.combo&&b.duel.plays>=e.combo?(e.comboBonus??0):0;
  const strength=b.playerStrength+(e.strength??0),attacker=e.cure?emptyConditions():b.duel.conditions.player;
  const perHit=attackDamage(base+combo,strength,attacker,b.duel.conditions.opponent,e.strengthMultiplier??1);
  const strengthDetail=e.strengthMultiplier?`（力量加成×${e.strengthMultiplier}）`:'';
  const detail=base>0?`基础 ${base}${combo?`＋连击 ${combo}`:''}＋力量 ${b.playerStrength}${e.strength?`＋本牌力量 ${e.strength}`:''}${strengthDetail}，虚弱×${attacker.weak?'.75':'1'}，易伤×${b.duel.conditions.opponent.vulnerable?'1.5':'1'}，每段取整为 ${perHit}，共 ${e.hits??1} 段。敌方格挡 ${b.opponentBlock}${e.pierce?'（无视）':`，吸收 ${absorbed}`}；护卫吸收 ${minionDamage}。`:`基础格挡 ${e.block??0}；基础恢复 ${e.heal??0}。力量、虚弱和易伤只影响攻击伤害。`;
  return {damage,absorbed,minionDamage,block:Math.max(0,copy.playerBlock-b.playerBlock),heal:Math.max(0,copy.player.hp-b.player.hp),detail:[card.desc,detail]};
}
export function playDuelCard(state:GameState,instance:string):{ok:boolean;reason?:string}{
  const b=state.catBattle;if(!b||!b.duel||b.finished)return {ok:false,reason:'没有进行中的新版对决'};
  if(b.phase!=='player')return {ok:false,reason:'现在不能出牌'};
  if(state.pets.some(p=>p.uid===b.playerUid&&isCatFostered(p)))return {ok:false,reason:'参战猫咪正在寄养'};
  const uid=b.playerHand.includes(instance)?instance:b.playerHand.find(uid=>b.duel!.cards[uid]===instance);
  const card=uid&&cardInBattle(b,uid);if(!uid||!card)return {ok:false,reason:'这张牌不在手牌中'};
  if(b.playerEnergy<card.cost)return {ok:false,reason:`能量不足，需要 ${card.cost} 点`};
  b.playerHand.splice(b.playerHand.indexOf(uid),1);b.playerEnergy-=card.cost;
  resolveDuelCard(b,card);
  if(card.effect.exhaust)b.duel.exhaustPile.push(uid);else b.playerDiscardPile.push(uid);
  if(card.effect.draw&&!b.finished)draw(b,card.effect.draw);
  emitDuelEvent(b,'collect','player','本次出牌完成。',undefined,{cardId:card.id,...visualSnapshot(b)});
  return {ok:true};
}
export function runDuelEnemyTurn(b:CatBattleState):void{
  if(!b.duel||b.finished||b.phase!=='player')return;
  const playerVulnerableBefore=conditions(b,'player').vulnerable;
  b.phase='enemy';b.playerDiscardPile.push(...b.playerHand);b.playerHand=[];
  // 我方虚弱在我方行动后衰减；我方易伤须在挨完敌方攻击后衰减。
  // 提前清除易伤会让意图预览与真正挨打的伤害不一致。
  conditions(b,'player').weak=Math.max(0,conditions(b,'player').weak-1);b.opponentBlock=0;
  poisonTick(b,'opponent');if(b.finished)return;
  const i=b.enemyIntent;const mech=getOpponentDef(b.opponentId)?.mechanic;
  if(i?.kind==='attack'){
    emitDuelEvent(b,'attack','opponent',`敌方准备发动${i.hits??1}段攻击。`,undefined,{source:'opponent',hits:i.hits??1});
    for(let n=0;n<(i.hits??1);n++){
      hit(b,'player',enemyDamage(b),!!i.pierce,true,{hitIndex:n+1,hits:i.hits??1});
      if(b.duel.retaliate>0&&b.opponent.hp>0)hit(b,'opponent',b.duel.retaliate,false,false);
      finishCheck(b);if(b.finished)break;
    }
  } else if(i?.kind==='defend') {b.opponentBlock=i.value;emitDuelEvent(b,'block','opponent',`敌方获得 ${i.value} 点格挡。`,i.value);}
  else if(mech?.marshmallow){heal(b,'player',80);b.opponent.hp=0;finishCheck(b);}
  else if(i?.status){const key=i.status==='poison'?'poison':i.status==='sleep'?'vulnerable':'weak';conditions(b,'player')[key]+=key==='poison'?3:2;emitDuelEvent(b,'status','player',key==='poison'?'中毒＋3层。':key==='vulnerable'?'易伤＋2回合。':'虚弱＋2回合。');}
  else if(i&&i.value>0)heal(b,'opponent',i.value);
  if(b.finished)return;
  if(playerVulnerableBefore>0)conditions(b,'player').vulnerable=Math.max(0,conditions(b,'player').vulnerable-1);
  statusDecay(conditions(b,'opponent'));
  if(mech?.regen)heal(b,'opponent',3);
  if(mech?.snowball&&b.turn%2===0){b.opponentStrength++;emitDuelEvent(b,'status','opponent','雪球增长，敌方力量＋1。');}
  if(mech?.bombTurns){
    b.mechanicState!.bombCountdown=Math.max(0,(b.mechanicState!.bombCountdown??4)-1);
    if(b.mechanicState!.bombCountdown===0){hit(b,'player',24);b.mechanicState!.bombCountdown=4;emitDuelEvent(b,'mechanic','player','炸弹爆炸，基础24伤害，可由格挡吸收。');finishCheck(b);}
  }
  if(mech?.selfDestruct&&b.turn>=5){hit(b,'player',26);b.opponent.hp=0;emitDuelEvent(b,'mechanic','opponent','机器猫自爆，基础26伤害，可由格挡吸收。');finishCheck(b);}
  if(!b.finished)beginDuelTurn(b);
}
export function endDuelPlayerTurn(state:GameState):{ok:boolean;reason?:string}{
  const b=state.catBattle;if(!b||!b.duel||b.finished)return {ok:false,reason:'没有进行中的新版对决'};
  if(state.pets.some(p=>p.uid===b.playerUid&&isCatFostered(p)))return {ok:false,reason:'参战猫咪正在寄养，领回后再继续'};
  if(b.phase!=='player')return {ok:false,reason:'现在不能结束回合'};
  runDuelEnemyTurn(b);return {ok:true};
}
export function resumeDuelRecovery(state:GameState):{ok:boolean;reason?:string}{
  const d=ensureCatDuel(state);const r=d.recovery;if(!r)return {ok:false,reason:'没有待恢复的对决'};
  const oldActive=state.activePet;state.activePet=r.playerUid;
  const result=startDuelBattle(state,r.opponentId,r.tournamentId,{casual:r.casual});
  if(!result.ok)state.activePet=oldActive;
  return result;
}
