import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {signLease} from '../src/game/core/housing';
import {moveTo} from '../src/game/core/actions';
import {adoptCat} from '../src/game/core/cat';
import {addItem} from '../src/game/core/items';
import {HOME_PLANS} from '../src/game/core/homeInterior';
import {homeRoomState,homePreviewRoom} from '../src/lib/homeRoom3D';
import {homeCatNestPlacement,homePetSpots,homePetSpotSafe} from '../src/lib/homePetPlacement';
import {todoSummaryOf} from '../src/game/core/todoSummary';
import {generateDailyGoals} from '../src/game/core/quests';
import {advanceHours} from '../src/game/core/time';
describe('home pets and read-only todo projection',()=>{
  it('shows only unfostered cats and highest owned supply tiers without changing saves or RNG',()=>{
    const s=createInitialState(812);s.player.money=10000;signLease(s,'old_apartment');moveTo(s,'old_apartment');
    adoptCat(s,'orange');adoptCat(s,'mint');s.pets[1].fostered=true;
    for(const id of ['cat_bed_basic','cat_bed_lux','cat_toy_good','cat_auto_feeder'])addItem(s,id);
    const before=JSON.stringify(s),r=homeRoomState(s,HOME_PLANS.studio);
    expect(r.cats?.map(c=>c.uid)).toEqual([s.pets[0].uid]);expect(r.catItems).toEqual([{kind:'bed',item:'cat_bed_lux'},{kind:'toy',item:'cat_toy_good'},{kind:'device',item:'cat_auto_feeder'}]);
    for(let i=0;i<100;i++)homeRoomState(s,HOME_PLANS.studio);
    expect(JSON.stringify(s)).toBe(before);expect(homePreviewRoom(HOME_PLANS.studio,true,12).cats).toBeUndefined();
    const key=r.activityKey;advanceHours(s,.5);expect(homeRoomState(s,HOME_PLANS.studio).activityKey).not.toBe(key);
  });
  it('keeps the nest and its approach fixed and excludes edges, partitions, passages and furniture',()=>{
    for(const plan of Object.values(HOME_PLANS)){
      const blocked=[{min:[1,0,1],max:[2,2,2]}],points=homePetSpots(plan,.36,blocked);
      expect(points.length).toBeGreaterThan(2);for(const p of points)expect(homePetSpotSafe(plan,p,.36,blocked)).toBe(true);
      const first=homeCatNestPlacement(plan,.36,blocked)!;expect(first).toBeDefined();
      const approach:[number,number]=[first.position[0]-Math.sin(first.rotation)*.74,first.position[1]-Math.cos(first.rotation)*.74];
      expect(homePetSpotSafe(plan,approach,.22,blocked)).toBe(true);
      for(let i=0;i<50;i++)expect(homeCatNestPlacement(plan,.36,blocked)).toEqual(first);
    }
  });
  it('projects the same goal objects and live rent deadline while consuming no time, money or RNG',()=>{
    const s=createInitialState(823);s.player.money=5000;signLease(s,'old_apartment');generateDailyGoals(s);const before=JSON.stringify(s),todo=todoSummaryOf(s);
    expect(todo.goals).toEqual([]);expect(todo.commitments[0].title).toBe('房租缴纳');expect(todo.tasks).toEqual([]);
    for(let i=0;i<100;i++)todoSummaryOf(s);expect(JSON.stringify(s)).toBe(before);
    expect(s.dailyGoals).toBeUndefined();expect(todoSummaryOf(s).goals).toEqual([]);
  });
});
