import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {signLease,selectLodging} from '../src/game/core/housing';
import {moveTo} from '../src/game/core/actions';
import {adoptCat} from '../src/game/core/cat';
import {addItem} from '../src/game/core/items';
import {homePlanFor,HOME_FIXED_IDS} from '../src/game/core/homeInterior';
import {homeRoomState,homePreviewRoom} from '../src/lib/homeRoom3D';
import {createHomeReferenceVisuals} from '../src/lib/homeReferenceVisuals';
import {homeObjects} from '../src/lib/homeScene';
import {NPC_CRASH_STAY_DAY} from '../src/game/core/residence';
import {gameDay} from '../src/game/core/calendar';

function player(){const s=createInitialState(123);s.player.money=100000;signLease(s,'old_apartment');moveTo(s,'old_apartment');adoptCat(s,'orange');return s;}
function enter(s:ReturnType<typeof player>,id:string){
  if(id==='npc_guest_room'){s.romance.crashTonight='xiaoyu';s.flags[NPC_CRASH_STAY_DAY]=gameDay(s.time);s.locationId=id;}
  else {expect(selectLodging(s,id)).toBe(true);expect(moveTo(s,id==='hotel_budget'?'hotel':id==='hotel_mooncourt_budget'?'hotel_mooncourt':id).ok).toBe(true);}
}
describe('fixed room scene isolation',()=>{
  it.each([...HOME_FIXED_IDS])('%s keeps the same host furniture with an upgraded permanent home and cats',id=>{
    const s=player();enter(s,id);const plan=homePlanFor(id),before=homeRoomState(s,plan);
    for(const item of ['bed_premium','gym_high','cook_set_high','fridge_large','laptop_pro','sofa','plant','cat_bed_lux','cat_auto_feeder','home_wall_blue'])addItem(s,item);
    s.homeDecor={[id]:{wall:'home_wall_blue'}};s.homeLayouts={[id]:{lamp:1}};
    const saved=JSON.stringify(s),after=homeRoomState(s,plan);
    expect(after.objects).toEqual(before.objects);expect(after.decor).toEqual(before.decor);
    expect(after.cats).toEqual([]);expect(after.catItems).toEqual([]);
    expect(after.objects.some(o=>['gym','kitchen','fridge'].includes(o.kind))).toBe(false);
    expect(homeObjects(s,plan).every(o=>!o.owned&&!o.adjustable)).toBe(true);
    expect(homePreviewRoom(plan,true,12).objects).toEqual(homePreviewRoom(plan,false,12).objects);
    expect(JSON.stringify(s)).toBe(saved);
  });
  it.each([...HOME_FIXED_IDS])('%s uses bathroom and decor positions from its own plan',id=>{
    const plan=homePlanFor(id),visuals=createHomeReferenceVisuals(plan),snapshot=homePreviewRoom(plan,false,12);
    const added=typeof visuals.additions==='function'?visuals.additions(snapshot.objects,'fine'):visuals.additions??[];
    expect(added.some(a=>a.model.id==='washing-machine')).toBe(false);
    for(const a of added){expect(a.position[0]).toBeGreaterThan(0);expect(a.position[0]).toBeLessThan(plan.size[0]);expect(a.position[1]).toBeGreaterThan(0);expect(a.position[1]).toBeLessThan(plan.size[1]);}
    visuals.environment?.dispose();
  });
});
