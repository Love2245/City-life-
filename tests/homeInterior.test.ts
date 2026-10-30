import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {signLease,selectLodging,buyProperty} from '../src/game/core/housing';
import {moveTo} from '../src/game/core/actions';
import {formalHomeId,homePlanFor,homeAnchor,rearrangeHomeObject} from '../src/game/core/homeInterior';
import {homePurchaseQuote,purchaseHomeFurniture} from '../src/game/core/homePurchase';
import {addItem} from '../src/game/core/items';
import {syncAutoHomeEquipment,equipBonus} from '../src/game/core/equipment';
import {facilityEfficiency} from '../src/game/core/facility';
import {migrateSave} from '../src/game/core/migrate';

function resident(id='old_apartment'){
  const s=createInitialState(123);s.player.money=100000;s.time.hour=10;
  expect(signLease(s,id).ok).toBe(true);expect(moveTo(s,id).ok).toBe(true);return s;
}
describe('1.49 formal home lifecycle',()=>{
  it('enters through a real lease and address; government beds and daily stays use the old scene',()=>{
    const s=createInitialState();expect(formalHomeId(s)).toBeUndefined();
    const home=resident();expect(formalHomeId(home)).toBe('old_apartment');
    expect(selectLodging(home,'minsu')).toBe(true);expect(moveTo(home,'minsu').ok).toBe(true);expect(formalHomeId(home)).toBeUndefined();
    expect(moveTo(home,'old_apartment').ok).toBe(true);expect(formalHomeId(home)).toBe('old_apartment');
  });
  it('owned housing enters only its actual address; apartments have a foyer and separate kitchen',()=>{
    const s=createInitialState();s.player.money=100000;s.time.hour=10;
    expect(buyProperty(s,'own_apartment').ok).toBe(true);expect(formalHomeId(s)).toBeUndefined();
    expect(moveTo(s,'own_apartment').ok).toBe(true);expect(formalHomeId(s)).toBe('own_apartment');
    expect(homePlanFor('own_apartment').rooms.map(r=>r.type)).toEqual(expect.arrayContaining(['entry','kitchen','bedroom','bath','living']));
    expect(homePlanFor('old_apartment').outline).toHaveLength(4);
  });
  it('delivery quotes preserve real price, purchasing deducts once, and duplicate/lower tiers cannot be bought',()=>{
    const s=resident();const before=s.player.money;const quote=homePurchaseQuote(s,'bed_standard');
    expect(quote.ok,quote.reason).toBe(true);const result=purchaseHomeFurniture(s,'bed_standard');expect(result.ok,result.reason).toBe(true);
    expect(s.player.money).toBe(before-quote.price);expect(s.inventory.bed_standard).toBe(1);
    const snapshot=JSON.stringify(s);expect(purchaseHomeFurniture(s,'bed_standard').ok).toBe(false);expect(purchaseHomeFurniture(s,'bed_basic').ok).toBe(false);expect(JSON.stringify(s)).toBe(snapshot);
  });
  it('failed delivery and foreign item IDs leave money, time, inventory and arrangement untouched',()=>{
    const s=resident();s.player.money=0;const snapshot=JSON.stringify(s);
    expect(purchaseHomeFurniture(s,'laptop_pro').ok).toBe(false);expect(purchaseHomeFurniture(s,'suit').ok).toBe(false);expect(JSON.stringify(s)).toBe(snapshot);
    s.locationId='map';expect(homePurchaseQuote(s,'plant').ok).toBe(false);
  });
  it('fridge upgrade only pays the difference and keeps all ingredients through save/load',()=>{
    const s=resident();expect(purchaseHomeFurniture(s,'fridge_small').ok).toBe(true);s.fridge!.items={carrot:5};
    const before=s.player.money;expect(homePurchaseQuote(s,'fridge_medium').price).toBe(400);expect(purchaseHomeFurniture(s,'fridge_medium').ok).toBe(true);
    expect(s.player.money).toBe(before-400);const loaded=migrateSave(JSON.parse(JSON.stringify(s)));expect(loaded.fridge).toMatchObject({tier:'medium',items:{carrot:5}});
  });
  it('bed, sofa, lighting, cooking tools and computer coexist; syncing and migration never multiply bonuses',()=>{
    const s=resident();for(const id of ['bed_standard','sofa','lamp','laptop_mid','cook_set_high'])addItem(s,id);
    syncAutoHomeEquipment(s);expect(s.equipped).toMatchObject({home_bed:'bed_standard',home_sofa:'sofa',home_lamp:'lamp',tool:'laptop_mid',home_kitchen:'cook_set_high'});
    expect(equipBonus(s).mood).toBe(8);expect(facilityEfficiency(s,'rest')).toBe(1.25);expect(facilityEfficiency(s,'cook')).toBe(1.3);
    const before=JSON.stringify({attrs:s.player.attrs,stats:s.player.stats});for(let i=0;i<100;i++)syncAutoHomeEquipment(s);
    expect(JSON.stringify({attrs:s.player.attrs,stats:s.player.stats})).toBe(before);
    const loaded=migrateSave(JSON.parse(JSON.stringify(s)));expect(loaded.player.attrs).toEqual(s.player.attrs);expect(loaded.player.stats).toEqual(s.player.stats);
  });
  it('old single furniture bonuses are converted once without double applying or losing inventory',()=>{
    const s=createInitialState();addItem(s,'sofa');addItem(s,'lamp');s.player.money=10000;s.time.hour=10;
    expect(signLease(s,'old_apartment').ok).toBe(true);syncAutoHomeEquipment(s);
    const first=s.player.attrs.mood;const loaded=migrateSave(JSON.parse(JSON.stringify(s)));expect(loaded.player.attrs.mood).toBe(first);expect(loaded.inventory).toMatchObject({sofa:1,lamp:1});expect(loaded.equipped.furniture).toBeUndefined();
  });
  it('preset positions persist per home, survive round-trip, and do not spend time or money',()=>{
    const s=resident();addItem(s,'plant');const before=homeAnchor(s,'plant')!.position;const money=s.player.money,time=JSON.stringify(s.time);
    expect(rearrangeHomeObject(s,'plant').ok).toBe(true);expect(homeAnchor(s,'plant')!.position).not.toEqual(before);
    expect(s.player.money).toBe(money);expect(JSON.stringify(s.time)).toBe(time);
    const loaded=migrateSave(JSON.parse(JSON.stringify(s)));expect(homeAnchor(loaded,'plant')!.position).toEqual(homeAnchor(s,'plant')!.position);
    expect(signLease(loaded,'rental_apartment').ok).toBe(true);expect(moveTo(loaded,'rental_apartment').ok).toBe(true);expect(loaded.homeLayouts?.old_apartment?.plant).toBe(1);expect(loaded.homeLayouts?.rental_apartment).toBeUndefined();
  });
  it('invalid saved arrangement entries are pruned; fixed fittings cannot be moved',()=>{
    const s=resident();s.homeLayouts={invalid:{plant:1},old_apartment:{plant:99,bed:1,lamp:1}};
    const loaded=migrateSave(JSON.parse(JSON.stringify(s)));expect(loaded.homeLayouts).toEqual({old_apartment:{lamp:1}});expect(rearrangeHomeObject(loaded,'bed').ok).toBe(false);
  });
});
