import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {signLease} from '../src/game/core/housing';
import {ACTIONS,moveTo,performAction,canPerform} from '../src/game/core/actions';
import {HOME_DECOR_CATALOG,setHomeDecor,homeDecorFor} from '../src/game/core/homeDecor';
import {homePlanFor,HOME_TOUR_RESIDENCES,homeAreaSquareMetres} from '../src/game/core/homeInterior';
import {getItem} from '../src/game/core/items';
import {migrateSave,SAVE_VERSION} from '../src/game/core/migrate';
import {homePreviewRoom} from '../src/lib/homeRoom3D';

function resident(){const s=createInitialState();s.player.money=10000;s.time.hour=10;expect(signLease(s,'old_apartment').ok).toBe(true);expect(moveTo(s,'old_apartment').ok).toBe(true);return s;}
function shop(s:ReturnType<typeof createInitialState>,id:string){const a=ACTIONS.find(a=>a.id===`buy_${id}`)!;expect(a).toBeDefined();expect(moveTo(s,'furniture_store').ok).toBe(true);const result=performAction(s,a.id);expect(result.ok,result.reason).toBe(true);return a;}
describe('home finish purchase, application and save migration',()=>{
  it('has real furniture-store items and prevents duplicate purchases without another charge',()=>{
    for(const finish of HOME_DECOR_CATALOG){expect(getItem(finish.id)).toMatchObject({name:finish.name,homeSurface:finish.surface});expect(ACTIONS.find(a=>a.itemId===finish.id)).toMatchObject({locationId:'furniture_store',handler:'buy_item'});}
    const s=resident(),before=s.player.money,a=shop(s,'home_wall_sage');expect(s.player.money).toBeLessThan(before);expect(s.inventory.home_wall_sage).toBe(1);
    const after=JSON.stringify(s);expect(canPerform(s,a).ok).toBe(false);expect(performAction(s,a.id).ok).toBe(false);expect(JSON.stringify(s)).toBe(after);
  });
  it('buys materials, returns home, changes both surfaces freely and restores the original finish',()=>{
    const s=resident();expect(setHomeDecor(s,'wall','home_wall_blue').ok).toBe(false);shop(s,'home_wall_blue');shop(s,'home_floor_stone');expect(moveTo(s,'old_apartment').ok).toBe(true);
    const time={...s.time},money=s.player.money;expect(setHomeDecor(s,'wall','home_wall_blue').ok).toBe(true);expect(setHomeDecor(s,'floor','home_floor_stone').ok).toBe(true);expect(homeDecorFor(s).wall.id).toBe('home_wall_blue');expect(homeDecorFor(s).floor.id).toBe('home_floor_stone');
    expect(s.time).toEqual(time);expect(s.player.money).toBe(money);expect(s.inventory.home_wall_blue).toBe(1);expect(setHomeDecor(s,'wall','home_floor_stone').ok).toBe(false);
    expect(setHomeDecor(s,'wall').ok).toBe(true);expect(homeDecorFor(s).wall.id).toContain('base-wall-');
  });
  it('preserves each address and restores the selection on a v32 save without losing money or ownership',()=>{
    const s=resident();shop(s,'home_wall_ivory');expect(moveTo(s,'old_apartment').ok).toBe(true);setHomeDecor(s,'wall','home_wall_ivory');const cash=s.player.money;
    const legacy={...JSON.parse(JSON.stringify(s)),version:32},loaded=migrateSave(legacy);expect(loaded.version).toBe(SAVE_VERSION);expect(loaded.player.money).toBe(cash);expect(loaded.homeDecor).toEqual({old_apartment:{wall:'home_wall_ivory'}});expect(loaded.inventory.home_wall_ivory).toBe(1);
    expect(signLease(loaded,'rental_apartment').ok).toBe(true);expect(moveTo(loaded,'rental_apartment').ok).toBe(true);expect(homeDecorFor(loaded).wall.id).toContain('base-wall-');expect(loaded.homeDecor?.old_apartment?.wall).toBe('home_wall_ivory');
  });
  it('drops malformed, unknown and unowned selections while keeping legal wall and floor choices',()=>{
    const s=resident();s.inventory.home_wall_ivory=1;s.inventory.home_floor_oak=1;s.homeDecor={bad:{wall:'home_wall_ivory'},old_apartment:{wall:'home_wall_ivory',floor:'home_floor_oak'},own_villa:{wall:'home_floor_oak',floor:'home_floor_walnut'}};
    expect(migrateSave(JSON.parse(JSON.stringify(s))).homeDecor).toEqual({old_apartment:{wall:'home_wall_ivory',floor:'home_floor_oak'}});
    s.locationId='map';expect(setHomeDecor(s,'floor','home_floor_oak').ok).toBe(false);
  });
});
describe('residence layouts and furniture previews',()=>{
  it('separates compact homes from large residences with dedicated studies and open kitchens',()=>{
    expect(homeAreaSquareMetres(homePlanFor('old_apartment'))).toBe(19);
    expect(homeAreaSquareMetres(homePlanFor('rental_apartment'))).toBe(33);
    for(const [id,minimum]of [['own_apartment',80],['own_villa',120]] as const){const p=homePlanFor(id);expect(homeAreaSquareMetres(p)).toBeGreaterThanOrEqual(minimum);expect(p.outline.length).toBeGreaterThan(6);expect(p.openKitchen).toBe(true);expect(p.rooms.some(r=>r.type==='study')).toBe(true);expect(p.fixtures?.some(f=>f.kind==='island')).toBe(true);}
  });
  it('gives personal residences and all current hotel stays different layout/finish combinations',()=>{
    const expected=['old_apartment','rental_apartment','suburb_room','boyue_talent_apartment','own_old_unit','own_apartment','own_villa','minsu','hotel_budget','hotel','hotel_boyu_nightmarket','hotel_mooncourt','hotel_mooncourt_budget','own_rental_studio','own_rental_apartment','own_suburb_room','lease_old_unit','lease_premium_apartment','lease_villa'];
    expect(HOME_TOUR_RESIDENCES.map(h=>h.id).sort()).toEqual(expected.sort());
    // Six rent/buy aliases share their physical home, as do the two central hotel budget rooms.
    const signatures=HOME_TOUR_RESIDENCES.map(h=>{const p=homePlanFor(h.id);return JSON.stringify({outline:p.outline,anchors:p.anchors,decor:homePreviewRoom(p,false,12).decor});});expect(new Set(signatures).size).toBe(12);
    const normal=homePlanFor('rental_apartment'),mirror=homePlanFor('boyue_talent_apartment');expect(mirror.anchors.shower?.mirrorX).toBe(true);expect(mirror.anchors.bed?.position).not.toEqual(normal.anchors.bed?.position);
  });
  it('shows owned-item identifiers for each preview tier without changing the game state',()=>{
    const p=homePlanFor('own_apartment'),s=resident(),before=JSON.stringify(s);
    for(const [tier,bed,pc,fridge,kitchen]of [['basic','bed_basic','laptop','fridge_small','kitchen_set'],['standard','bed_standard','laptop_mid','fridge_medium','cook_set_mid'],['premium','bed_premium','laptop_pro','fridge_large','cook_set_high']] as const){const objects=homePreviewRoom(p,true,12,'auto','sunny',tier).objects;for(const [kind,id]of [['bed',bed],['computer',pc],['fridge',fridge],['kitchen',kitchen]])expect(objects.find(o=>o.kind===kind)?.item).toBe(id);}
    expect(JSON.stringify(s)).toBe(before);
  });
});
