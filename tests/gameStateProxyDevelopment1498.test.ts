// @vitest-environment jsdom
import {afterEach,describe,expect,it} from 'vitest';
import {gameState,replaceState,checkpointFingerprint} from '../src/stores/gameStore.svelte';
import {createInitialState} from '../src/game/core/state';
import {pushLog} from '../src/game/engine';
import {ensureStockMarket} from '../src/game/core/stockMarket';
import {workOnProject} from '../src/game/core/projects';
import {gameDay} from '../src/game/core/calendar';

afterEach(()=>replaceState(createInitialState(1)));
describe('长会话中的真实游戏状态代理',()=>{
  it('日志滚动和股市历史切片反复回写对象时不会叠加代理，嵌套修改仍触发存档指纹',()=>{
    const state=createInitialState(1498);
    state.log=Array.from({length:200},(_,i)=>({sequence:i+1,day:1,period:'morning',hour:8,icon:'',text:'test'}));
    const market=ensureStockMarket(state);market.history=Array.from({length:30},(_,i)=>({minute:i,prices:{test:1}}));
    replaceState(state);
    const entry=gameState.log[199], quote=gameState.economy.stockMarket!.history[0];
    for(let i=0;i<120;i++){
      pushLog(gameState,'📝','后续日志');
      const m=gameState.economy.stockMarket!;m.history=m.history.slice(-120);
      expect(gameState.log[198-i]).toBe(entry);
      expect(m.history[0]).toBe(quote);
    }
    const revision=checkpointFingerprint(gameState);quote.prices.test=2;
    expect(checkpointFingerprint(gameState)).not.toBe(revision);
    expect(JSON.parse(JSON.stringify(gameState)).economy.stockMarket.history[0].prices.test).toBe(2);
  });
  it.each(['indie_game','mobile_app','personal_programming_order'])('长会话后从真实状态执行 %s 8 小时仅推进一次',id=>{
    const state=createInitialState(1499);state.mode='eternal';state.time.day=3;state.time.hour=9;state.time.minute=0;state.flags.item_laptop_pro=true;state.player.skills.programming=10;Object.assign(state.player.attrs,{stamina:100,health:100,mood:100,satiety:100});state.player.stress=0;
    state.log=Array.from({length:200},(_,i)=>({sequence:i+1,day:1,period:'morning',hour:8,icon:'',text:'test'}));
    replaceState(state);for(let i=0;i<120;i++)pushLog(gameState,'📝','后续日志');
    const before=gameDay(gameState.time)*1440+gameState.time.hour*60+gameState.time.minute;
    const result=workOnProject(gameState,id,{hours:8});
    expect(result.ok,result.reason).toBe(true);expect(result.elapsedHours).toBe(8);
    expect(gameDay(gameState.time)*1440+gameState.time.hour*60+gameState.time.minute-before).toBe(480);
    expect(gameState.career.projects[id]).toBeCloseTo(15,6);expect(gameState.player.attrs.stamina).toBeCloseTo(72,6);
    expect(gameState.flags.development_work_v2_minutes).toBe(480);
  });
});
