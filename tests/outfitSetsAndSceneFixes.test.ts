import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { migrateSave } from '../src/game/core/migrate';
import { checkoutClothing, ensureWardrobeDefaults, outfitPrice } from '../src/game/core/clothing';
import { equipItem, unequipItem } from '../src/game/core/equipment';
import { PLAYER_OUTFIT_SETS } from '../src/game/core/playerOutfitSets';
import { playerPortraitForReply } from '../src/game/core/npcPortraits';
import { livingBudgetOf } from '../src/game/core/livingBudget';
import { signLease } from '../src/game/core/housing';
import { getJobDef, fullShiftWage } from '../src/game/core/jobs';
import { isWorkRestDay } from '../src/game/core/workSchedule';
import { gameDay } from '../src/game/core/calendar';
import { propertyMonthlyRent } from '../src/game/core/propertyPortfolio';
import * as THREE from 'three';
import { constrainVenuePan, venueMinimumZoom } from '../src/lib/venueFraming';

describe('complete outfits, conversion and atomic purchase', () => {
  it('converts old separately bought trousers once without charging or cascading unlocks', () => {
    const old = createInitialState(902); delete old.flags.outfit_sets_v1;
    old.inventory.sage_wide_trousers=1; old.inventory.jeans=1;
    const money=old.player.money, time={...old.time};
    const loaded=migrateSave(old);
    expect(loaded.inventory.cream_relaxed_shirt).toBe(1); expect(loaded.inventory.navy_hoodie).toBe(1);
    expect(loaded.inventory.plain_white_tee).toBeUndefined(); expect(loaded.inventory.shirt).toBeUndefined();
    const before=JSON.stringify(loaded); ensureWardrobeDefaults(loaded); ensureWardrobeDefaults(loaded);
    expect(JSON.stringify(loaded)).toBe(before); expect(loaded.player.money).toBe(money); expect(loaded.time).toEqual(time);
  });
  it('switches clothes and matching trousers together, keeps hats and never stacks bonuses', () => {
    const s=createInitialState(903);s.inventory.taupe_double_suit=1;s.inventory.baseball_cap=1;
    const charm=s.player.stats.charm; equipItem(s,'baseball_cap');equipItem(s,'taupe_double_suit');
    expect(s.equipped.pants).toBe('taupe_suit_trousers');expect(s.equipped.hat).toBe('baseball_cap');
    const dressed=s.player.stats.charm; for(let i=0;i<10;i++)equipItem(s,'taupe_double_suit');expect(s.player.stats.charm).toBe(dressed);
    expect(equipItem(s,'jeans').ok).toBe(false);expect(s.equipped.pants).toBe('taupe_suit_trousers');
    unequipItem(s,'clothes');expect(s.equipped.pants).toBe('black_pants');expect(s.player.stats.charm).toBe(charm);
  });
  it('quotes all missing pieces, rejects cross-store or unaffordable orders without any writes', () => {
    const s=createInitialState(904);s.locationId='budget_clothing_store';s.player.money=0;
    const before=JSON.stringify(s);expect(checkoutClothing(s,['plain_black_tee']).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
    s.player.money=5000;const total=outfitPrice(s,'plain_black_tee');const cash=s.player.money;
    expect(checkoutClothing(s,['plain_black_tee']).total).toBe(total);expect(s.player.money).toBe(cash-total);
    expect(s.equipped).toMatchObject({clothes:'plain_black_tee',pants:'charcoal_relaxed_jeans'});
    expect(checkoutClothing(s,['plain_black_tee']).total).toBe(0);
    const purchased=JSON.stringify(s);expect(checkoutClothing(s,['suit']).ok).toBe(false);expect(JSON.stringify(s)).toBe(purchased);
  });
  it.each(PLAYER_OUTFIT_SETS)('$id uses one complete painted body, plus at most its hat, through all dialogue moods', set => {
    const outfit={clothes:set.id,pants:set.pants,underlayer:'underlayer_white',hat:undefined};
    for(const text of [undefined,'谢谢','为什么','（抱臂。）']) {
      const p=playerPortraitForReply(text,outfit);expect(p.source).toBeNull();expect(p.layers).toHaveLength(1);
      expect(p.layers![0]).toContain(`/outfit-sets-v1/${set.id}.png`);expect(p.variant).toBe('default');
      const hat=playerPortraitForReply(text,{...outfit,hat:'baseball_cap'});expect(hat.layers).toHaveLength(2);expect(hat.layers![0]).toBe(p.layers![0]);
    }
  });
});
describe('actual fixed commitments', () => {
  it('counts the rented property while excluding the home occupied by its owner, without paying rent from the UI', () => {
    const s=createInitialState(907);s.living.mode='own';s.living.ownedId='own_villa';s.living.activePropertyId='home';
    s.living.properties=[{id:'rental',housingId:'own_apartment',acquiredDay:1,rentalDays:2,lastAccountedDay:3},{id:'home',housingId:'own_villa',acquiredDay:1,rentalDays:0,lastAccountedDay:3}];
    const before=JSON.stringify(s),b=livingBudgetOf(s);
    expect(b.propertyIncome).toBe(propertyMonthlyRent('own_apartment'));expect(b.propertyIncome).toBeGreaterThan(0);expect(b.rent).toBe(0);
    expect(b.income).toBe(b.propertyIncome);expect(JSON.stringify(s)).toBe(before);
  });
  it('does not invent a salary or rent for an unemployed free-lodging player; reads actual weekly money', () => {
    const s=createInitialState(905);s.weekly.earned=654;s.weekly.spent=32;const before=JSON.stringify(s),b=livingBudgetOf(s);
    expect(b.salary).toBe(0);expect(b.rent).toBe(0);expect(b.weeklyEarned).toBe(654);expect(b.weeklySpent).toBe(32);expect(JSON.stringify(s)).toBe(before);
  });
  it('uses the actual contract schedule and active lease', () => {
    const s=createInitialState(906);s.player.money=10000;signLease(s,'old_apartment');s.career.jobId='job_convenience_clerk';
    const job=getJobDef(s.career.jobId)!;const shifts=Array.from({length:30},(_,i)=>gameDay(s.time)+i).filter(day=>!isWorkRestDay(job,day)).length;
    const b=livingBudgetOf(s);expect(b.shifts).toBe(shifts);expect(b.salary).toBe(fullShiftWage(s,job)*shifts);expect(b.rent).toBe(s.living.lease!.rent);
  });
});
describe('bounded venue pan', () => {
  it.each([[1432,956],[896,414],[390,844]])('keeps the room reachable at %s x %s while preserving viewing direction', (w,h) => {
    const c=new THREE.OrthographicCamera(-8*w/h,8*w/h,8,-8,.1,200);c.position.set(-14,18,25);const target=new THREE.Vector3(6,0,6);
    c.lookAt(target);c.zoom=venueMinimumZoom(w,h);c.updateProjectionMatrix();const direction=c.position.clone().sub(target);
    const shift=new THREE.Vector3(80,0,90);c.position.add(shift);target.add(shift);
    const bounds=new THREE.Box3(new THREE.Vector3(0,0,0),new THREE.Vector3(12,3.2,12));
    expect(constrainVenuePan(c,target,bounds)).toBe(true);expect(c.position.clone().sub(target).distanceTo(direction)).toBeLessThan(1e-10);
    expect(constrainVenuePan(c,target,bounds)).toBe(false);expect(target.length()).toBeLessThan(25);
  });
});
