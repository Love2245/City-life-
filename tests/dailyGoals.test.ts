import {describe,it,expect,vi} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {generateDailyGoals,markGoalWorked,tickDailyGoals} from '../src/game/core/quests';
import {migrateSave} from '../src/game/core/migrate';
import {advanceHours,sleep} from '../src/game/core/time';
describe('retired daily goals',()=>{
 it('discards goals and exclusive flags without rewards or RNG consumption',()=>{
  const s=createInitialState(917);s.dailyGoals=[{id:'eat_hot',text:'旧目标',reward:{mood:999},done:false}];s.flags.ateToday=true;s.flags.goal_worked=true;
  const rng=JSON.stringify(s.rng),money=s.player.money,mood=s.player.attrs.mood,reward=vi.fn();
  expect(tickDailyGoals(s,reward)).toBe(0);expect(generateDailyGoals(s)).toEqual([]);markGoalWorked(s);
  expect(s.dailyGoals).toBeUndefined();expect(s.flags.goal_worked).toBeUndefined();expect(s.flags.ateToday).toBe(true);expect(reward).not.toHaveBeenCalled();
  expect(JSON.stringify(s.rng)).toBe(rng);expect(s.player.money).toBe(money);expect(s.player.attrs.mood).toBe(mood);
 });
 it('cleans current and older saves while retaining real work and unrelated state',()=>{
  for(const version of [29,30,31,32,33,34]){const s=createInitialState(918);s.version=version;s.dailyGoals=[{id:'work_once',text:'旧目标',reward:{mood:2},done:false}];s.flags.goal_day=3;
   const loaded=migrateSave(s);expect(loaded.dailyGoals).toBeUndefined();expect(loaded.flags.goal_day).toBeUndefined();expect(loaded.player.money).toBe(s.player.money);expect(loaded.time).toEqual(s.time);
  }
 });
 it('does not regenerate or pay goals during daytime, rollover or sleep',()=>{
  const s=createInitialState(919);s.player.money=10000;advanceHours(s,1);expect(s.dailyGoals).toBeUndefined();advanceHours(s,24);expect(s.dailyGoals).toBeUndefined();sleep(s,6);expect(s.dailyGoals).toBeUndefined();expect(s.flags.goal_day).toBeUndefined();
 });
});
