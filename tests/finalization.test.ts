import {afterEach,describe,it,expect,vi} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {migrateSave} from '../src/game/core/migrate';
import {buyProperty,switchOwnedResidence,canSleepHere} from '../src/game/core/housing';
import {ownedProperties,activeOwnedProperty,monthlyPropertyIncome,settlePropertyRent} from '../src/game/core/propertyPortfolio';
import {fromLinearDay,linearDay,gameDay} from '../src/game/core/calendar';
import {advanceHours,sleep,sleepSettlement} from '../src/game/core/time';
import {performAction} from '../src/game/core/actions';
import {useItem} from '../src/game/core/items';
import {hasStatus} from '../src/game/core/statuses';
import {enterCasinoRoom,startDistrictLeisure,stepDistrictLeisure,normalizeDistrictLeisure,type CasinoGameKind,type BlackjackSession,type PokerSession,type CasinoSession} from '../src/game/core/districtLeisure';
import {casinoRandomInt} from '../src/game/core/casinoRandom';
import type {GameState} from '../src/game/types';
import actionData from '../src/game/data/actions.json';

afterEach(()=>vi.restoreAllMocks());
function funded(){const s=createInitialState(123);s.player.money=1000000;s.player.attrs.health=80;return s;}
function day(s:GameState,days:number){Object.assign(s.time,fromLinearDay(linearDay(s.time)+days));}
function buy(s:GameState,id:string){const r=buyProperty(s,id);expect(r.ok,r.reason).toBe(true);return r;}
function atCasino(){const s=funded();s.time={year:2026,month:8,day:8,hour:20,minute:0};s.locationId='boyue_texas_shop';s.region='boyue_night_market';expect(enterCasinoRoom(s,'leisure').ok).toBe(true);s.districtLeisure!.casinoChips=10000;return s;}
function dealt(kind:CasinoGameKind){
 for(let i=0;i<30;i++){const s=atCasino();expect(startDistrictLeisure(s,kind,{currency:'chips',bet:50,choice:kind==='roulette_number'?1:kind==='roulette_redblack'?'red':'high'}).ok).toBe(true);if(s.districtLeisure!.active!.phase==='playing')return s;}
 throw Error('No live hand');
}

describe('多套产权、自住与月租',()=>{
 it('可以连续购买及重复购买，默认住最好的一套，其余逐套计租',()=>{
  const s=funded();buy(s,'own_old_unit');const original=activeOwnedProperty(s)!.id;
  expect(monthlyPropertyIncome(s)).toBe(0);buy(s,'own_old_unit');expect(ownedProperties(s)).toHaveLength(2);expect(activeOwnedProperty(s)!.id).toBe(original);expect(monthlyPropertyIncome(s)).toBe(800);
  buy(s,'own_apartment');expect(s.living.ownedId).toBe('own_apartment');expect(monthlyPropertyIncome(s)).toBe(1600);
  buy(s,'own_villa');buy(s,'own_apartment');expect(s.living.ownedId).toBe('own_villa');expect(ownedProperties(s)).toHaveLength(5);expect(monthlyPropertyIncome(s)).toBe(3600);
  expect(new Set(ownedProperties(s).map(p=>p.id)).size).toBe(5);
 });
 it('出租满30天才收租，同日不重复、跨月及跳过多期不丢租金',()=>{
  const s=funded();buy(s,'own_old_unit');buy(s,'own_apartment');const money=s.player.money,earned=s.weekly.earned;
  day(s,29);expect(settlePropertyRent(s)).toBe(0);expect(s.player.money).toBe(money);
  day(s,1);expect(settlePropertyRent(s)).toBe(800);expect(s.player.money).toBe(money+800);expect(s.weekly.earned).toBe(earned+800);expect(settlePropertyRent(s)).toBe(0);
  day(s,65);expect(settlePropertyRent(s)).toBe(1600);expect(ownedProperties(s).find(p=>p.housingId==='own_old_unit')!.rentalDays).toBe(5);
 });
 it('新买的房子不倒领先前月份的租金',()=>{
  const s=funded();buy(s,'own_villa');day(s,90);buy(s,'own_old_unit');expect(settlePropertyRent(s)).toBe(0);day(s,29);expect(settlePropertyRent(s)).toBe(0);day(s,1);expect(settlePropertyRent(s)).toBe(800);
 });
 it('手动换住后别的房子出租，自住暂停计租、保留已出租日数，不瞬移地图',()=>{
  const s=funded();buy(s,'own_old_unit');const old=activeOwnedProperty(s)!.id;buy(s,'own_villa');const villa=activeOwnedProperty(s)!.id;
  day(s,15);settlePropertyRent(s);s.locationId='own_villa';s.region='downtown_center';expect(switchOwnedResidence(s,old).ok).toBe(true);
  expect(s.living.ownedId).toBe('own_old_unit');expect(s.locationId).toBe('own_villa');expect(canSleepHere(s)).toBe(false);expect(monthlyPropertyIncome(s)).toBe(2000);
  day(s,30);expect(settlePropertyRent(s)).toBe(2000);expect(ownedProperties(s).find(p=>p.id===old)!.rentalDays).toBe(15);
  expect(switchOwnedResidence(s,villa).ok).toBe(true);day(s,15);expect(settlePropertyRent(s)).toBe(800);
 });
 it('旧档单套产权迁为一套；重复读档不增房、不扣钱、不提前发租金',()=>{
  const s=funded();s.living.mode='own';s.living.ownedId='own_apartment';s.flags.owned_property=true;
  const raw=JSON.stringify(s),a=migrateSave(JSON.parse(raw)),b=migrateSave(a);
  expect(ownedProperties(a)).toHaveLength(1);expect(b.living).toEqual(a.living);expect(b.player.money).toBe(s.player.money);expect(JSON.stringify(s)).toBe(raw);
  buy(a,'own_villa');day(a,29);settlePropertyRent(a);const restored=migrateSave(a);expect(restored.living.properties).toEqual(a.living.properties);day(restored,1);expect(settlePropertyRent(restored)).toBe(1000);expect(settlePropertyRent(restored)).toBe(0);
 });
 it('无效的新增产权字段不会盖掉旧档有效产权，混合无效条目可安全修复',()=>{
  const s=funded();s.living.mode='own';s.living.ownedId='own_apartment';s.flags.owned_property=true;
  s.living.properties=[null,{id:'bad',housingId:'missing'}] as any;
  const a=migrateSave(s);expect(ownedProperties(a)).toHaveLength(1);expect(activeOwnedProperty(a)?.housingId).toBe('own_apartment');
  a.living.properties!.push(null as any);const b=migrateSave(a);expect(ownedProperties(b)).toHaveLength(1);expect(b.player.money).toBe(s.player.money);
 });
 it('失败购买和无效换住没有扣款、产权或地图副作用',()=>{
  const s=funded();buy(s,'own_old_unit');s.player.money=10;const before=JSON.stringify(s);
  expect(buyProperty(s,'own_villa').ok).toBe(false);expect(switchOwnedResidence(s,'missing').ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
 });
 it('通过实际中介行动能买第二套，同型房再次购买不再被拒绝',()=>{
  const s=funded();s.time.hour=9;s.locationId='real_estate';s.region='downtown_center';
  // 房源行动的实际地点由数据读取，避免用核心购买绕过入口限制。
  const actions=['own_old_unit','own_apartment','own_apartment'].map(id=>actionData.find(a=>a.handler==='buy_property'&&a.housingId===id)!);
  s.locationId=actions[0].locationId!;
  for(const action of actions){const r=performAction(s,action.id);expect(r.ok,r.reason).toBe(true);}
  expect(ownedProperties(s).filter(p=>p.housingId==='own_apartment')).toHaveLength(2);expect(s.living.ownedId).toBe('own_apartment');
 });
 it('自然跨午夜自动收租；睡眠与同日再次结算不会重复领取',()=>{
  const s=funded();buy(s,'own_old_unit');buy(s,'own_villa');day(s,29);s.time.hour=23;s.time.minute=0;const before=s.player.money;
  advanceHours(s,1,false,true);expect(s.player.money).toBe(before+800);expect(settlePropertyRent(s)).toBe(0);sleepSettlement(s);expect(s.log.filter(l=>l.text?.includes('房屋出租租金到账'))).toHaveLength(1);
 });
});

describe('感冒及就医结算',()=>{
 for(const action of ['see_doctor_hospital','treat_hospital'])it(`${action}确实清掉感冒与生病，不顺带清掉其他状态`,()=>{
  const s=funded();s.locationId='hospital';s.region='downtown_center';s.time.hour=10;s.player.attrs.health=action==='treat_hospital'?10:65;
  s.statuses=[{id:'cold',severity:2,count:4},{id:'sick',severity:2,count:2},{id:'insomnia',severity:1,count:1}];
  const r=performAction(s,action);expect(r.ok,r.reason).toBe(true);expect(hasStatus(s,'cold')).toBe(false);expect(hasStatus(s,'sick')).toBe(false);expect(hasStatus(s,'insomnia')).toBe(true);
 });
 it('感冒药在健康很高时也能治感冒，一次消耗一份',()=>{
  const s=funded();s.player.attrs.health=100;s.statuses=[{id:'cold',severity:3,count:8}];s.inventory.medicine=1;
  expect(useItem(s,'medicine').ok).toBe(true);expect(hasStatus(s,'cold')).toBe(false);expect(s.inventory.medicine??0).toBe(0);
 });
 it('正在住院多晚的旧档也会治好感冒；同一笔结算不会马上重新感染',()=>{
  const s=funded();s.locationId='hospital';s.time.hour=22;s.flags.hospitalized=true;s.flags.hospitalNights=2;s.player.attrs.health=55;
  s.statuses=[{id:'cold',severity:2,count:9},{id:'insomnia',severity:3,count:3}];
  sleepSettlement(s,{hours:3});expect(hasStatus(s,'cold')).toBe(false);
 });
 it('完整住院睡眠可以清除感冒，出院和读档不再复活旧状态',()=>{
  const s=funded();s.locationId='hospital';s.time.hour=22;s.flags.hospitalized=true;s.flags.hospitalNights=0;s.player.attrs.health=75;s.statuses=[{id:'cold',severity:1,count:1}];
  sleep(s,8);expect(hasStatus(s,'cold')).toBe(false);expect(hasStatus(migrateSave(s),'cold')).toBe(false);
 });
});

describe('赌场存读档不能重放已记住的随机序列',()=>{
 it('同一份开局前存档反复开始会产生不同牌序，且不消耗人生事件的随机序列',()=>{
  const raw=JSON.stringify(atCasino()),decks=new Set<string>();
  for(let i=0;i<16;i++){const s=JSON.parse(raw) as GameState,before={...s.rng};expect(startDistrictLeisure(s,'poker',{currency:'chips',bet:50}).ok).toBe(true);decks.add((s.districtLeisure!.active as PokerSession).deck.join(','));expect(s.rng).toEqual(before);}
  expect(decks.size).toBeGreaterThan(1);
 });
 for(const kind of ['high_low','slots','roulette_redblack','roulette_highlow','roulette_number'] as const)it(`${kind}已下注的未揭晓牌局读档保持结果，筹码和下注不变化`,()=>{
  const raw=JSON.stringify(dealt(kind)),outcomes=new Set<string>();
  for(let i=0;i<16;i++){const saved=JSON.parse(raw) as GameState,s=migrateSave(saved),a=s.districtLeisure!.active as CasinoSession;outcomes.add(a.outcome.join(','));expect(a.bet).toBe(50);expect(a.phase).toBe('playing');expect(s.districtLeisure!.casinoChips).toBe(saved.districtLeisure!.casinoChips);expect(s.rng).toEqual(saved.rng);}
  expect(outcomes.size).toBe(1);expect([...outcomes][0]).toBe((JSON.parse(raw).districtLeisure.active as CasinoSession).outcome.join(','));
 });
 for(const kind of ['blackjack','poker'] as const)it(`${kind}已支付牌局的明牌、暗牌和后续牌全部保持`,()=>{
  const saved=dealt(kind),original=saved.districtLeisure!.active as BlackjackSession|PokerSession,hidden=new Set<string>();
  for(let i=0;i<12;i++){const s=migrateSave(saved),a=s.districtLeisure!.active as BlackjackSession|PokerSession;
   expect(a.player).toEqual(original.player);expect(new Set(a.deck).size).toBe(52);expect(a.deck).toEqual(original.deck);expect(a.dealer).toEqual(original.dealer);
   if(a.kind==='blackjack'){expect(a.dealer[0]).toBe(original.dealer[0]);hidden.add(a.deck.join(','));}
   else{expect(a.board.slice(0,3)).toEqual((original as PokerSession).board.slice(0,3));hidden.add([...a.dealer,...a.board.slice(3)].join(','));}
   normalizeDistrictLeisure(s);expect(s.districtLeisure!.active).toBeTruthy();expect(s.player.money).toBe(saved.player.money);expect(s.districtLeisure!.casinoChips).toBe(saved.districtLeisure!.casinoChips);
  }expect(hidden.size).toBe(1);
 });
 it('已揭晓的牌局读档保持结果，不二次抽奖或重复扣注',()=>{
  const s=dealt('roulette_number'),a=s.districtLeisure!.active!;stepDistrictLeisure(s,a.id,{type:'reveal'});const restored=migrateSave(s);
  expect(restored.districtLeisure).toEqual(s.districtLeisure);expect(restored.player.money).toBe(s.player.money);
 });
 it('拒绝采样去除取模偏差；没有系统随机源时开局失败且不扣筹码',()=>{
  let call=0;vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation(array=>{(array as Uint32Array)[0]=call++===0?0xffffffff:38;return array;});
  expect(casinoRandomInt(0,36)).toBe(1);expect(call).toBe(2);vi.restoreAllMocks();
  const s=atCasino(),before=JSON.stringify(s);vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation(()=>{throw Error('unavailable');});
  expect(startDistrictLeisure(s,'poker',{currency:'chips',bet:50}).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
 });
});
