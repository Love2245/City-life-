import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {deliveryParttime,takeJobOffer,getJobDef,applyForJob,performJob,completeWork,pauseWork,resumeWork,nowWorkMinute} from '../src/game/core/jobs';
import {getMiniGameConfigFor} from '../src/game/core/minigame';
import {migrateSave} from '../src/game/core/migrate';
import {resignJob,processWorkCalendar} from '../src/game/core/career';
import {gameDay,fromLinearDay,START_EPOCH} from '../src/game/core/calendar';
import {dispatchPayTerms,dispatchQuote,dispatchWage,dispatchMoney} from '../src/lib/streetDispatch/pay.js';
function ready(){const s=createInitialState(1708);s.time.day=3;s.time.hour=8;s.time.minute=0;s.player.money=10000;Object.assign(s.player.attrs,{health:100,stamina:100,satiety:100,hygiene:100});Object.assign(s.flags,{app_delivery:true,item_e_bike:true});return s;}
function market(key='job_express'){const s=ready();s.locationId='labor_market';s.laborMarket.offers=[{uid:'piece',jobId:key,quota:1}];const r=takeJobOffer(s,'piece');expect(r.ok,r.reason).toBe(true);return{s,session:r.session!};}
function formal(){const s=ready(),job=getJobDef('job_delivery_fulltime')!;s.locationId=job.locationId!;expect(applyForJob(s,job).ok).toBe(true);const r=performJob(s,job.id);expect(r.ok,r.reason).toBe(true);return{s,session:r.session!};}
describe('配送底薪与逐单提成',()=>{
 it('参考十单外卖的正常工资为180元，底薪36元，单价按距离变化且不随总收入降低',()=>{
  const t=dispatchPayTerms(180,10);expect(t).toMatchObject({base:36,unitRate:14.4});
  expect(dispatchQuote(t,900)).toBe(14.4);expect(dispatchQuote(t,300)).toBeLessThan(14.4);expect(dispatchQuote(t,1800)).toBeGreaterThan(14.4);
  expect(dispatchWage(t,10,10*dispatchQuote(t,900)).total).toBe(180);
  for(const n of [12,20,50,100])expect(dispatchWage(t,n,n*14.4).total-dispatchWage(t,n-1,(n-1)*14.4).total).toBeCloseTo(14.4,8);
 });
 it.each([0,3,20])('提前结束送达 %s 单只领取实际提成，完班至少送达一单才领底薪',n=>{
  const t=dispatchPayTerms(180,10),fare=n*12.31;
  expect(dispatchWage(t,n,fare,false)).toEqual({base:0,commission:dispatchMoney(fare),total:dispatchMoney(fare)});
  expect(dispatchWage(t,n,fare,true).base).toBe(n>0?36:0);
 });
 it('新班次冻结报价，暂停、JSON保存与迁移后不按当前名气、物价或属性重算',()=>{
  const s=ready(),r=deliveryParttime(s),t=structuredClone(r.session!.deliveryPay);expect(t).toMatchObject({base:36,referenceOrders:10});
  s.economy.priceIndex=5;s.player.stats.fame=100;pauseWork(s);
  const loaded=migrateSave(JSON.parse(JSON.stringify(s)));expect(resumeWork(loaded)?.deliveryPay).toEqual(t);
  expect(getMiniGameConfigFor(loaded,'job_delivery')).toMatchObject({actualIncome:true,deliveryPay:t});
  loaded.work!.active!.completedOrders=10;loaded.work!.active!.deliveryEarnedFare=144;
  const cash=loaded.player.money;expect(completeWork(loaded,r.session!.id,.1).ok).toBe(true);expect(loaded.player.money-cash).toBe(180);
 });
 it.each(['job_delivery','job_express'])('%s 日结岗位采用同一公式，超过原工资上限仍逐单到账',key=>{
  const{s,session}=market(key),t=session.deliveryPay!;expect(t.referenceOrders).toBe(key==='job_express'?6:10);expect(t.base).toBeGreaterThan(20);expect(t.base).toBeLessThanOrEqual(50);
  session.completedOrders=24;session.deliveryEarnedFare=412.37;const cash=s.player.money,start=nowWorkMinute(s);
  const result=completeWork(s,session.id,.3);expect(result.ok).toBe(true);expect(s.player.money-cash).toBeCloseTo(t.base+412.37,8);expect(nowWorkMinute(s)-start).toBe(600);
  expect(result.result?.verdict).toContain('订单提成 ¥412.37');expect(s.work!.wageRecords.at(-1)?.gameBonus).toBe(0);
  expect(completeWork(s,session.id,1).ok).toBe(false);
 });
 it('提前结束在核心结算也不领完班底薪',()=>{
  const{s,session}=market();session.completedOrders=4;session.deliveryEarnedFare=73.45;const cash=s.player.money;
  expect(completeWork(s,session.id,0,false,true).ok).toBe(true);expect(s.player.money-cash).toBeCloseTo(73.45,8);expect(s.work!.wageRecords.at(-1)?.note).toContain('未领取完班底薪');
 });
 it('未送达任何订单没有底薪，已完成但提成为零仍有完班底薪',()=>{
  for(const n of [0,1]){const s=ready(),r=deliveryParttime(s);r.session!.completedOrders=n;r.session!.deliveryEarnedFare=0;const cash=s.player.money;expect(completeWork(s,r.session!.id,0).ok).toBe(true);expect(s.player.money-cash).toBe(n?36:0);}
 });
 it('正式配送的小数提成计入待发，离职结清时不取整或重复发放',()=>{
  const{s,session}=formal(),cash=s.player.money,t=session.deliveryPay!;session.completedOrders=10;session.deliveryEarnedFare=119.43;
  const total=dispatchMoney(t.base+119.43),result=completeWork(s,session.id,1);
  expect(result.result?.verdict).toContain('已记入待发工资');expect(s.player.money).toBe(cash);expect(s.career.accruedWages).toBe(total);
  expect(resignJob(s).ok).toBe(true);expect(s.player.money-cash).toBeCloseTo(total,8);expect(resignJob(s).ok).toBe(false);
 });
 it('正式岗位仍按七日周期发薪，分币保留且本班提成不重复加表现奖金',()=>{
  const{s,session}=formal();session.completedOrders=10;session.deliveryEarnedFare=119.43;let total=dispatchMoney(session.deliveryPay!.base+119.43);
  expect(completeWork(s,session.id,1).ok).toBe(true);const due=s.career.nextPayDay!;
  while(s.career.nextShiftDay!<due){
    Object.assign(s.time,fromLinearDay(START_EPOCH+s.career.nextShiftDay!),{hour:8,minute:0});Object.assign(s.player.attrs,{stamina:100,health:100,satiety:100,hygiene:100});
    const r=performJob(s,'job_delivery_fulltime');expect(r.ok,r.reason).toBe(true);r.session!.completedOrders=10;r.session!.deliveryEarnedFare=119.43;
    total=dispatchMoney(total+r.session!.deliveryPay!.base+119.43);expect(completeWork(s,r.session!.id,1).ok).toBe(true);
  }
  expect(s.career.periodGameBonus).toBe(0);expect(s.career.accruedWages).toBe(total);
  Object.assign(s.time,fromLinearDay(START_EPOCH+due),{hour:0,minute:0});processWorkCalendar(s);
  const payroll=s.work!.wageRecords.find(r=>r.id.startsWith('pay_'));expect(payroll).toBeDefined();expect(payroll!.base).toBe(total);
  const paid=s.player.money;processWorkCalendar(s);expect(s.player.money).toBe(paid);expect(s.career.accruedWages).toBe(0);
 });
 it('主动熟练跳过使用八折参考工资，不再追加逐单底薪或未跑订单的提成',()=>{
  const s=ready(),job=getJobDef('job_delivery_fulltime')!;s.locationId=job.locationId!;s.work!.masteryMinutes[job.id]=100000;expect(applyForJob(s,job).ok).toBe(true);
  const r=performJob(s,job.id);expect(r.session!.canSkip).toBe(true);r.session!.completedOrders=3;r.session!.deliveryEarnedFare=91.2;
  expect(completeWork(s,r.session!.id,0,true).ok).toBe(true);expect(s.career.accruedWages).toBe(Math.round(r.session!.skipBaseWage!*.8));
 });
});
