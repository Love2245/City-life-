import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {getAction,performAction,canPerform,moveTo,visibleActionsAtLocation,purchasePriceOf} from '../src/game/core/actions';
import {addItem,getItem,useItem,itemCount} from '../src/game/core/items';
import {signLease,selectLodging} from '../src/game/core/housing';
import {getMaxStamina} from '../src/game/core/stats';
import {homeObjectAvailable} from '../src/game/core/homeInterior';
import {INTERIOR_ACTIONS} from '../src/game/data/interiorActivities';
import {setActionLocation} from './helpers/actionLocation';

describe('interior activities use the ordinary action settlement',()=>{
  it.each(['cafe','boyue_cafe'])('%s sofa activities settle time, small recovery and no purchase',location=>{
    for(const [key,hours,recovery] of [['relax',1,8],['nap',2,15]] as const){
      const s=createInitialState(),id=`${location}_sofa_${key}`;setActionLocation(s,id);s.time.hour=10;s.time.minute=0;
      s.player.attrs.stamina=30;s.player.attrs.satiety=60;const money=s.player.money;
      expect(visibleActionsAtLocation(s,location).some(a=>a.id===id)).toBe(true);
      expect(performAction(s,id).ok).toBe(true);expect(s.time.hour).toBe(10+hours);expect(s.time.minute).toBe(0);
      expect(s.player.attrs.stamina).toBe(30+recovery);expect(s.player.money).toBe(money);expect(s.player.attrs.satiety).toBe(60-hours*3);
      expect(s.flags.settledToday).toBeUndefined();
    }
  });
  it('caps stamina and rejects a closed cafe or a remote sofa without spending time',()=>{
    const s=createInitialState(),a=getAction('cafe_sofa_nap')!;setActionLocation(s,a.id);s.time.hour=10;s.player.attrs.stamina=getMaxStamina(s)-1;
    expect(performAction(s,a.id).ok).toBe(true);expect(s.player.attrs.stamina).toBe(getMaxStamina(s));
    s.time.hour=23;const before=JSON.stringify(s);expect(canPerform(s,a).ok).toBe(false);expect(performAction(s,a.id).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
    s.time.hour=10;s.locationId='convenience_store';expect(performAction(s,a.id).ok).toBe(false);
  });
  it('home sofa requires a real sofa at the current residence, including fixed guest rooms',()=>{
    const s=createInitialState();s.player.money=10000;s.time.hour=10;
    expect(signLease(s,'old_apartment').ok).toBe(true);expect(moveTo(s,'old_apartment').ok).toBe(true);
    expect(visibleActionsAtLocation(s,s.locationId).some(a=>a.id==='home_sofa_relax')).toBe(false);
    expect(performAction(s,'home_sofa_relax').ok).toBe(false);addItem(s,'sofa');s.player.attrs.stamina=30;
    expect(visibleActionsAtLocation(s,s.locationId).some(a=>a.id==='home_sofa_relax')).toBe(true);
    const start=s.time.hour;expect(performAction(s,'home_sofa_relax').ok).toBe(true);expect(s.time.hour).toBe(start+1);expect(s.player.attrs.stamina).toBe(38);
    expect(selectLodging(s,'minsu')).toBe(true);expect(moveTo(s,'minsu').ok).toBe(true);
    expect(homeObjectAvailable(s,'sofa')).toBe(false);expect(performAction(s,'home_sofa_nap').ok).toBe(false);
    expect(selectLodging(s,'hotel')).toBe(true);expect(moveTo(s,'hotel').ok).toBe(true);s.player.attrs.stamina=30;
    expect(homeObjectAvailable(s,'sofa')).toBe(true);expect(performAction(s,'home_sofa_nap').ok).toBe(true);expect(s.player.attrs.stamina).toBe(45);
    s.locationId='map';expect(performAction(s,'home_sofa_relax').ok).toBe(false);
  });
  it.each(['cafe','boyue_cafe'])('%s snacks support takeaway, inventory use and dine in without double charging',location=>{
    for(const [itemId,price,satiety] of [['cafe_croissant',12,12],['cafe_bagel',15,18]] as const){
      const s=createInitialState(),id=`${location}_buy_${itemId}`;setActionLocation(s,id);s.time.hour=10;s.time.minute=0;s.player.money=100;s.player.attrs.satiety=30;
      expect(getItem(itemId)?.consumable).toBe(true);expect(performAction(s,id,{dine:'pack'}).ok).toBe(true);
      expect(s.player.money).toBe(100-price);expect(s.time.hour).toBe(10);expect(s.time.minute).toBe(0);expect(s.player.attrs.satiety).toBe(30);expect(itemCount(s,itemId)).toBe(1);
      expect(useItem(s,itemId).ok).toBe(true);expect(s.player.attrs.satiety).toBe(30+satiety);expect(itemCount(s,itemId)).toBe(0);
      expect(performAction(s,id,{dine:'eat'}).ok).toBe(true);expect(s.player.money).toBe(100-price*2);expect(itemCount(s,itemId)).toBe(0);expect(s.time.minute).toBe(30);expect(s.player.attrs.satiety).toBe(30+satiety*2-2);
      s.player.money=0;const before=JSON.stringify(s);expect(performAction(s,id).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
    }
  });
  it('bookcase reading has its own half hour activity and registered action IDs are unique',()=>{
    const s=createInitialState();setActionLocation(s,'cafe_read_magazine');s.time.hour=10;s.time.minute=0;s.player.attrs.mood=40;
    expect(performAction(s,'cafe_read_magazine').ok).toBe(true);expect(s.player.attrs.mood).toBe(43);expect(s.time.minute).toBe(30);
    expect(new Set(INTERIOR_ACTIONS.map(a=>a.id)).size).toBe(INTERIOR_ACTIONS.length);
  });
  it('the snack quote and actual charge follow the same current price index',()=>{
    const s=createInitialState(),a=getAction('cafe_buy_cafe_croissant')!;setActionLocation(s,a.id);s.time.hour=10;s.economy.priceIndex=1.5;s.player.money=100;
    expect(purchasePriceOf(s,a)).toBe(18);expect(performAction(s,a.id,{dine:'pack'}).ok).toBe(true);expect(s.player.money).toBe(82);
  });
});
