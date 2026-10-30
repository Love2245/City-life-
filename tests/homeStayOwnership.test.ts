import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {signLease,selectLodging} from '../src/game/core/housing';
import {moveTo,canPerform,getAction} from '../src/game/core/actions';
import {currentHomeSceneId,formalHomeId,canCustomizeCurrentHome,homePlanFor,homeObjectAvailable,homeSceneObjectItem,homeAnchor,rearrangeHomeObject,HOME_FIXED_IDS,fixedHomeObjectKinds,HOME_TOUR_RESIDENCES} from '../src/game/core/homeInterior';
import {addItem} from '../src/game/core/items';
import {homePurchaseQuote} from '../src/game/core/homePurchase';
import {facilityEfficiency} from '../src/game/core/facility';
import {NPC_CRASH_STAY_DAY} from '../src/game/core/residence';
import {gameDay} from '../src/game/core/calendar';
import {canUseCookingWorkbench} from '../src/game/core/cooking';
import {homeLightMode,setHomeLightMode,homeLightScheme,normalizeHomeLighting} from '../src/game/core/homeLighting';

function leased(){const s=createInitialState(123);s.player.money=100000;s.time.hour=10;expect(signLease(s,'old_apartment').ok).toBe(true);expect(moveTo(s,'old_apartment').ok).toBe(true);return s;}
function stay(id:string){const s=leased();expect(selectLodging(s,id)).toBe(true);const address=id==='hotel_budget'?'hotel':id;expect(moveTo(s,address).ok).toBe(true);return s;}

describe('fixed accommodation ownership and access',()=>{
  it.each(['minsu','hotel','hotel_budget','hotel_boyu_nightmarket','hotel_mooncourt'])('uses the booked %s at its physical address without a furniture contract',id=>{
    const s=stay(id);expect(currentHomeSceneId(s)).toBe(id);expect(formalHomeId(s)).toBeUndefined();expect(canCustomizeCurrentHome(s)).toBe(false);
    expect(homePurchaseQuote(s,'plant').ok).toBe(false);expect(rearrangeHomeObject(s,'lamp').ok).toBe(false);
    expect(homePlanFor(id).id).toBe(`stay_${id}`);expect(homePlanFor(id).residenceId).toBe(id);
    expect(homeObjectAvailable(s,'bed')).toBe(true);expect(homeObjectAvailable(s,'shower')).toBe(true);
    expect(canPerform(s,getAction('shower_home')!).ok).toBe(true);
    expect(canUseCookingWorkbench(s).ok).toBe(false);
    expect(moveTo(s,'old_apartment').ok).toBe(true);expect(currentHomeSceneId(s)).toBe('old_apartment');
  });
  it('keeps fixed room objects and placements independent of bought furniture and saved layouts',()=>{
    const s=stay('minsu'),before=fixedHomeObjectKinds('minsu').map(kind=>({kind,item:homeSceneObjectItem(s,kind),anchor:homeAnchor(s,kind)}));
    const rest=facilityEfficiency(s,'rest');
    for(const id of ['bed_premium','sofa','lamp','plant','shower_premium','gym_high','gym_equipment','cook_set_high','fridge_large','laptop_pro'])addItem(s,id);
    s.homeLayouts={minsu:{lamp:1},old_apartment:{lamp:1}};s.flags.item_gym_equipment=true;s.flags.cook_utensil=true;
    expect(fixedHomeObjectKinds('minsu').map(kind=>({kind,item:homeSceneObjectItem(s,kind),anchor:homeAnchor(s,kind)}))).toEqual(before);
    expect(homeObjectAvailable(s,'gym')).toBe(false);expect(homeObjectAvailable(s,'sofa')).toBe(false);expect(homeObjectAvailable(s,'fridge')).toBe(false);expect(homeObjectAvailable(s,'kitchen')).toBe(false);
    expect(homeSceneObjectItem(s,'computer')).toBeUndefined();expect(facilityEfficiency(s,'rest')).toBe(rest);expect(facilityEfficiency(s,'cook')).toBe(1);
    const gym=canPerform(s,getAction('exercise_home_equip')!);expect(gym.ok).toBe(false);expect(gym.reason).toContain('客房没有健身器材');
    expect(canUseCookingWorkbench(s).ok).toBe(false);expect(s.inventory.gym_high).toBe(1);expect(s.inventory.bed_premium).toBe(1);
    s.living.awayNight=null;expect(moveTo(s,'old_apartment').ok).toBe(true);
    expect(canCustomizeCurrentHome(s)).toBe(true);expect(homeSceneObjectItem(s,'bed')).toBe('bed_premium');expect(homeObjectAvailable(s,'gym')).toBe(true);expect(facilityEfficiency(s,'rest')).toBe(1.4);
  });
  it('switches a fixed room light without changing the personal home or furniture permissions',()=>{
    const s=stay('minsu');s.homeLighting={old_apartment:'off'};
    expect(setHomeLightMode(s,'on')).toBe(true);expect(homeLightMode(s)).toBe('on');
    expect(homeLightScheme(12,9,'sunny',homeLightMode(s)).lamps).toBe(true);
    expect(setHomeLightMode(s,'off')).toBe(true);expect(homeLightScheme(23,9,'sunny',homeLightMode(s)).lamps).toBe(false);
    expect(s.homeLighting.old_apartment).toBe('off');expect(canCustomizeCurrentHome(s)).toBe(false);
    s.homeLighting.npc_guest_room='on';s.homeLighting.invalid='on';normalizeHomeLighting(s);
    expect(s.homeLighting).toEqual({old_apartment:'off',minsu:'off',npc_guest_room:'on'});
    s.locationId='map';expect(setHomeLightMode(s,'on')).toBe(false);expect(homeLightMode(s)).toBe('auto');
  });
  it('does not confuse the two room rates in the same city-center hotel',()=>{
    const budget=stay('hotel_budget'),luxury=stay('hotel');expect(budget.locationId).toBe(luxury.locationId);
    expect(homePlanFor(currentHomeSceneId(budget)!)).not.toEqual(homePlanFor(currentHomeSceneId(luxury)!));
    expect(homeSceneObjectItem(budget,'bed')).toBe('bed_basic');expect(homeSceneObjectItem(luxury,'bed')).toBe('bed_premium');
    expect(homeObjectAvailable(budget,'sofa')).toBe(false);expect(homeObjectAvailable(luxury,'sofa')).toBe(true);
  });
  it('offers a guest-room scene only during the dated crash stay and at its real address',()=>{
    const s=leased();s.romance={...s.romance,crashTonight:'xiaoyu'};s.flags[NPC_CRASH_STAY_DAY]=gameDay(s.time);s.locationId='npc_guest_room';
    expect(currentHomeSceneId(s)).toBe('npc_guest_room');expect(formalHomeId(s)).toBeUndefined();expect(canCustomizeCurrentHome(s)).toBe(false);
    s.locationId='old_apartment';expect(currentHomeSceneId(s)).toBeUndefined();s.locationId='npc_guest_room';s.flags[NPC_CRASH_STAY_DAY]=gameDay(s.time)-1;
    expect(currentHomeSceneId(s)).toBeUndefined();
  });
  it('keeps shared stays and the office-only incubator outside the residential tour',()=>{
    for(const id of ['gov','atm','hostel','temple','worker_dorm','camping_lodging'])expect(HOME_FIXED_IDS.has(id)).toBe(false);
    expect(HOME_TOUR_RESIDENCES.some(r=>r.id==='dev_incubator')).toBe(false);
    for(const id of ['minsu','hotel','hotel_budget','hotel_boyu_nightmarket'])expect(HOME_TOUR_RESIDENCES.some(r=>r.id===id)).toBe(true);
  });
  it('keeps each fixed plan and its fixture centers inside the architectural floor',()=>{
    const plans=[...HOME_FIXED_IDS].map(homePlanFor);expect(new Set(plans.map(p=>JSON.stringify([p.size,p.windows,p.anchors]))).size).toBe(6);
    for(const p of plans){
      expect(p.rooms.some(r=>r.type==='bath')).toBe(true);expect(p.anchors.door).toBeDefined();expect(p.anchors.kitchen).toBeUndefined();expect(p.anchors.gym).toBeUndefined();
      for(const a of [...Object.values(p.anchors),...(p.fixtures??[]).map(f=>({position:f.position}))]){expect(a!.position[0]).toBeGreaterThan(0);expect(a!.position[0]).toBeLessThan(p.size[0]);expect(a!.position[1]).toBeGreaterThan(0);expect(a!.position[1]).toBeLessThan(p.size[1]);}
    }
  });
});
