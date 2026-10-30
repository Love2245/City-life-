import {describe,expect,it} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {weekdayOf} from '../src/game/core/calendar';
import {performAction} from '../src/game/core/actions';
import {cafeSceneState} from '../src/lib/cafeScene';

function morning(){
  const state=createInitialState();
  while(weekdayOf(state.time)!==0)state.time.day++;
  state.time.hour=8;state.time.minute=0;state.locationId='cafe';state.region='downtown_residential';state.player.money=1000;
  return state;
}
describe('cafe scene uses the real game contract',()=>{
  it('reads Lin from the actual location, region and schedule without modifying the save',()=>{
    const state=morning(),before=JSON.stringify(state);
    expect(cafeSceneState(state).linPresent).toBe(true);expect(JSON.stringify(state)).toBe(before);
    state.region='downtown_center';expect(cafeSceneState(state).linPresent).toBe(false);
    state.region='downtown_residential';state.time.hour=9;expect(cafeSceneState(state).linPresent).toBe(false);
    state.time.hour=8;state.locationId='boyue_cafe';state.region='boyue_mall';
    expect(cafeSceneState(state)).toMatchObject({enabled:true,linPresent:false,drinkActionId:'boyue_drink_cafe'});
  });
  it('does not reveal the name or bypass the first encounter',()=>{
    const state=morning(),scene=cafeSceneState(state);
    expect(scene.guest).toMatchObject({id:'npc_lin_xiaoyu',displayName:'？？？',known:false});
    expect(state.relationships).toHaveLength(0);
  });
  it('lets the existing drink action settle price, time, quota and the resulting departure',()=>{
    const state=morning();
    expect(performAction(state,cafeSceneState(state).drinkActionId).ok).toBe(true);
    expect(state.player.money).toBe(975);expect(state.time.hour).toBe(8);expect(state.time.minute).toBe(30);
    expect(cafeSceneState(state).linPresent).toBe(true);
    expect(performAction(state,cafeSceneState(state).drinkActionId).ok).toBe(true);
    expect(state.player.money).toBe(950);expect(state.time.hour).toBe(9);expect(state.time.minute).toBe(0);
    expect(cafeSceneState(state).linPresent).toBe(false);
    expect(performAction(state,cafeSceneState(state).drinkActionId).ok).toBe(false);
    expect(state.player.money).toBe(950);
  });
  it('follows the game clock and excludes unrelated locations',()=>{
    const state=morning();expect(cafeSceneState(state).night).toBe(false);
    state.time.hour=18;expect(cafeSceneState(state).night).toBe(true);
    state.locationId='home';expect(cafeSceneState(state)).toMatchObject({enabled:false,linPresent:false});
  });
});
