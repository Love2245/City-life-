import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { completeWork, rideHailingParttime, takeJobOffer } from '../src/game/core/jobs';
import { applyDeliveryTrafficIncident } from '../src/game/core/deliveryTraffic';
import { migrateSave } from '../src/game/core/migrate';

function start(key='job_ride_hailing'){
  const state=createInitialState(901);state.time.hour=5;state.time.minute=0;
  Object.assign(state.player.attrs,{stamina:100,satiety:100,hygiene:100});
  Object.assign(state.flags,{app_ride_hailing:true,item_car:true,item_driving_license:true});
  state.player.skills.driving=1;
  if(key==='job_taxi'){state.locationId='labor_market';state.laborMarket.offers=[{uid:'taxi',jobId:key,quota:1}];}
  const result=key==='job_taxi'?takeJobOffer(state,'taxi'):rideHailingParttime(state);
  expect(result.ok,result.reason).toBe(true);return {state,session:result.session!};
}
describe('新驾驶工位的实际工资结算',()=>{
  it.each(['job_taxi','job_ride_hailing'])('%s 按已下客满意度车费发放，评级不重复加奖金',key=>{
    const {state,session}=start(key);session.completedOrders=2;session.deliveryEarnedFare=38.75;
    const cash=state.player.money;expect(completeWork(state,session.id,1).ok).toBe(true);
    expect(state.player.money).toBe(cash+38.75);expect(state.work!.wageRecords.at(-1)).toMatchObject({base:38.75,gameBonus:0,total:38.75});
    expect(completeWork(state,session.id,1).ok).toBe(false);expect(state.player.money).toBe(cash+38.75);
  });
  it('未下客不领车费，完成七趟也不会被旧五单目标截断',()=>{
    const empty=start();empty.session.completedOrders=0;empty.session.deliveryEarnedFare=0;
    const cash=empty.state.player.money;completeWork(empty.state,empty.session.id,1);expect(empty.state.player.money).toBe(cash);
    const full=start();full.session.completedOrders=7;full.session.deliveryEarnedFare=156.5;
    const before=full.state.player.money;completeWork(full.state,full.session.id,1);expect(full.state.player.money).toBe(before+156.5);
  });
  it('车费不会超过已送达人次的基础总价；交通罚款只即时扣一次',()=>{
    const {state,session}=start();session.completedOrders=2;session.deliveryEarnedFare=10000;
    const cash=state.player.money;applyDeliveryTrafficIncident(state,{kind:'collision',fine:3,message:'车辆碰撞'});
    completeWork(state,session.id,1);expect(state.player.money).toBe(cash-3+50);
  });
  it('存档迁移保留完整工位快照和累计车费，恢复后只结算一次',()=>{
    const {state,session}=start();session.completedOrders=3;session.deliveryEarnedFare=55;
    session.minigameProgress={schema:'urban-life-street-dispatch',version:1,kind:'rideshare',sceneKey:session.jobId,player:{x:420,y:540},orders:[{id:107,status:'delivery',quality:85}],remaining:80,delivered:3,earnedFare:55};
    session.status='paused';const loaded=migrateSave(JSON.parse(JSON.stringify(state)));
    expect(loaded.work?.active?.minigameProgress).toEqual(session.minigameProgress);expect(loaded.work?.active?.deliveryEarnedFare).toBe(55);
    const before=loaded.player.money;completeWork(loaded,session.id,1);expect(loaded.player.money).toBe(before+55);
  });
});
