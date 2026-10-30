import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {developmentWorkBudget,previewDevelopmentWork} from '../src/game/core/developmentWork';
import {gameDay} from '../src/game/core/calendar';

const round=(n:number)=>Math.round(n*1e10)/1e10;
const cumulative=(minutes:number)=>{const normal=Math.min(480,minutes),overtime=Math.max(0,minutes-480);return {stamina:round(normal*28/480+overtime*20/240),health:round(normal*2/480+overtime*3/240),mood:round(normal*4/480+overtime*6/240),stress:round(normal*8/480+overtime*10/240)};};
function originalMinutePreview(state:ReturnType<typeof createInitialState>,hours:number,ratePerHour:number,remainingPoints:number){
  const budget=developmentWorkBudget(state),costs={stamina:0,health:0,mood:0,stress:0};let used=budget.usedMinutes,clock=state.time.hour*60+state.time.minute,minutes=0;
  const rate=ratePerHour/60,requested=Math.min(hours*60,Math.ceil((remainingPoints-1e-8)/rate));
  for(let i=0;i<requested&&used<720;i++){const before=cumulative(used),after=cumulative(used+1);for(const key of ['stamina','health','mood','stress'] as const)costs[key]=round(costs[key]+round(after[key]-before[key]));minutes++;used++;clock++;if(clock===1440){clock=0;used=0;}}
  return {minutes,points:round(Math.min(remainingPoints,minutes*rate)),costs};
}
describe('开发预览的分钟和身体消耗',()=>{
  it('整段计算与逐分钟基线在正常、加班、跨夜和项目尾量时一致',()=>{
    for(const clock of [0,719,1330,1430,1439])for(const used of [0,1,479,480,700,719])for(const hours of [4,8,12])for(const remainingPoints of [0.7,100,Infinity]){
      const state=createInitialState(42);state.time.hour=Math.floor(clock/60);state.time.minute=clock%60;state.flags.development_work_v2_migrated=true;state.flags.development_work_v2_day=gameDay(state.time);state.flags.development_work_v2_minutes=used;
      const expected=originalMinutePreview(state,hours,1.875,remainingPoints),actual=previewDevelopmentWork(state,{hours,pointsPerHour:1.875,remainingPoints});
      expect(actual.minutes).toBe(expected.minutes);expect(actual.points).toBe(expected.points);for(const key of ['stamina','health','mood','stress'] as const)expect(actual.costs[key]).toBeCloseTo(expected.costs[key],9);
    }
  });
});
