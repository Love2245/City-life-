import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {getAction,canPerform,performAction,actionTagsOf,moveTo} from '../src/game/core/actions';
import {signLease} from '../src/game/core/housing';
describe('5元简餐',()=>{
  function fixture(){const s=createInitialState(149832);s.player.money=5000;signLease(s,'old_apartment');moveTo(s,'old_apartment');s.player.money=5;s.inventory={};s.player.attrs.satiety=5;s.flags.cook_utensil=false;s.player.skills.cooking=0;s.economy.priceIndex=2;return s;}
  it('不用餐具食材，固定扣5元并恢复30饱食，预览与实际一致',()=>{
    const s=fixture(),action=getAction('eat_simple_meal_home')!,before=JSON.stringify(s.time),health=s.player.attrs.health;
    expect(canPerform(s,action)).toEqual({ok:true});expect(actionTagsOf(action,s).find(t=>t.cls==='cost')?.text).toContain('5');
    expect(performAction(s,action.id).ok).toBe(true);expect(s.player.money).toBe(0);expect(s.player.attrs.satiety).toBe(35);expect(s.player.attrs.health).toBe(health);expect(JSON.stringify(s.time)).toBe(before);expect(s.inventory).toEqual({});expect(s.player.skills.cooking).toBe(0);
  });
  it('不足5元不执行，不会负余额或重复恢复',()=>{const s=fixture(),a=getAction('eat_simple_meal_home')!;s.player.money=4.99;const before=JSON.stringify(s);expect(performAction(s,a.id).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);});
  it('饱食度按现有上限截断',()=>{const s=fixture();s.player.attrs.satiety=90;performAction(s,'eat_simple_meal_home');expect(s.player.attrs.satiety).toBe(100);});
  it('政府住宿没有厨房设施也可以吃简餐',()=>{const s=fixture();s.living.mode='gov';s.living.govDaysLeft=3;s.locationId='old_apartment';expect(performAction(s,'eat_simple_meal_home').ok).toBe(true);expect(s.player.money).toBe(0);expect(s.player.attrs.satiety).toBe(35);});
});
