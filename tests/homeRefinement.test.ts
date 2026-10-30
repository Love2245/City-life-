import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {signLease} from '../src/game/core/housing';
import {moveTo} from '../src/game/core/actions';
import {HOME_PLANS,HOME_TOUR_RESIDENCES,HOME_FIXED_IDS,homePlanFor,homeAnchor,rearrangeHomeObject} from '../src/game/core/homeInterior';
import {homeLightScheme,homeLightMode,setHomeLightMode} from '../src/game/core/homeLighting';
import {homeRoomState,homePreviewRoom} from '../src/lib/homeRoom3D';
import {homeObjects} from '../src/lib/homeScene';
import {addItem} from '../src/game/core/items';
import {migrateSave} from '../src/game/core/migrate';
function home(){const s=createInitialState(301);s.player.money=10000;s.time.hour=10;signLease(s,'old_apartment');moveTo(s,'old_apartment');return s;}
describe('home layout, ownership and lighting',()=>{
  it('does not create models or hotspots for unpurchased optional furniture, but purchasing it reveals both',()=>{
    const s=home();const optional=['plant','fridge','sofa','lamp','gym'];
    for(const k of optional){expect(homeRoomState(s,HOME_PLANS.studio).objects.some(o=>o.kind===k)).toBe(false);expect(homeObjects(s,HOME_PLANS.studio).some(o=>o.kind===k)).toBe(false);}
    addItem(s,'plant');addItem(s,'fridge_small');
    for(const k of ['plant','fridge']){expect(homeRoomState(s,HOME_PLANS.studio).objects.some(o=>o.kind===k)).toBe(true);expect(homeObjects(s,HOME_PLANS.studio).some(o=>o.kind===k)).toBe(true);}
    expect(HOME_PLANS.studio.partitions).toEqual([]);
  });
  it('uses the game minute, changing daylight/weather while automatic lamps only turn on at night',()=>{
    const s=home();s.time.hour=7;s.time.minute=45;
    expect(homeRoomState(s,HOME_PLANS.studio).hour).toBe(7.75);
    const day=homeLightScheme(12,9,'sunny'),dawn=homeLightScheme(7,9,'sunny'),rain=homeLightScheme(12,9,'rain'),night=homeLightScheme(23,9,'sunny');
    expect(day.lamps).toBe(false);expect(dawn.lamps).toBe(false);expect(night.lamps).toBe(true);
    expect(day.daylight).toBeGreaterThan(dawn.daylight);expect(day.daylight).toBeGreaterThan(rain.daylight);expect(night.daylight).toBe(0);
    expect(day.sky).not.toBe(night.sky);expect(homeLightScheme(23,9,'sunny','off').lamps).toBe(false);expect(homeLightScheme(12,9,'sunny','on').lamps).toBe(true);
    expect(homeLightScheme(7,12,'sunny').daylight).toBeGreaterThan(0);
  });
  it('persists each home light switch without changing money or time, and cleans invalid switches on load',()=>{
    const s=home(),time={...s.time},money=s.player.money;expect(setHomeLightMode(s,'off')).toBe(true);
    expect(s.time).toEqual(time);expect(s.player.money).toBe(money);
    const loaded=migrateSave(JSON.parse(JSON.stringify(s)));expect(homeLightMode(loaded)).toBe('off');
    signLease(loaded,'rental_apartment');moveTo(loaded,'rental_apartment');expect(homeLightMode(loaded)).toBe('auto');
    loaded.homeLighting={old_apartment:'off',bad:'on',rental_apartment:'broken' as any};const clean=migrateSave(loaded);expect(clean.homeLighting).toEqual({old_apartment:'off'});
  });
  it('previews personal homes and fixed stays without a contract, reward, or save mutation',()=>{
    const s=home(),before=JSON.stringify(s);expect(HOME_TOUR_RESIDENCES).toHaveLength(19);
    expect(HOME_TOUR_RESIDENCES.filter(h=>!HOME_FIXED_IDS.has(h.id))).toHaveLength(13);
    for(const p of Object.values(HOME_PLANS)){const base=homePreviewRoom(p,false,12),full=homePreviewRoom(p,true,23);expect(base.objects.some(o=>o.kind==='plant')).toBe(false);expect(full.objects.some(o=>o.kind==='plant')).toBe(true);expect(full.hour).toBe(23);}
    for(const h of HOME_TOUR_RESIDENCES.filter(h=>HOME_FIXED_IDS.has(h.id))){const p=homePlanFor(h.id),base=homePreviewRoom(p,false,12),full=homePreviewRoom(p,true,23);expect(full.objects).toEqual(base.objects);expect(full.objects.some(o=>['gym','kitchen','fridge'].includes(o.kind))).toBe(false);expect(full.hour).toBe(23);}
    expect(JSON.stringify(s)).toBe(before);
  });
  it('preset sofa placement changes orientation with position while retaining the saved choice',()=>{
    const s=home();signLease(s,'rental_apartment');moveTo(s,'rental_apartment');addItem(s,'sofa');const before=homeAnchor(s,'sofa')!;
    expect(rearrangeHomeObject(s,'sofa').ok).toBe(true);const after=homeAnchor(s,'sofa')!;expect(after.rotation).not.toBe(before.rotation);expect(after.position).not.toEqual(before.position);
    const loaded=migrateSave(JSON.parse(JSON.stringify(s)));expect(homeAnchor(loaded,'sofa')).toEqual(after);
  });
});
