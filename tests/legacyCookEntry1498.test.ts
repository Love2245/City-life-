import {describe,expect,it} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {canPerform,getAction,performAction,visibleActionsAtLocation} from '../src/game/core/actions';
const ids=['eat_noodles_home','cook_practice_home','cook_dish_veg','cook_dish_salad','cook_dish_meat','cook_full_meal','cook_steak_home'];
describe('旧住宅烹饪行动不绕过正式工作台',()=>{
  it.each(ids)('%s 保留历史 ID，但查询和执行都指向工作台且不改变存档',id=>{
    const s=createInitialState(1498), action=getAction(id);expect(action).toBeDefined();
    const before=JSON.stringify(s),reason='请在厨房打开正式烹饪工作台';
    expect(canPerform(s,action!)).toEqual({ok:false,reason});expect(performAction(s,id)).toEqual({ok:false,reason});
    expect(JSON.stringify(s)).toBe(before);
  });
  it('住宅可见行动中没有旧的做菜或做饭练手按钮',()=>{
    const s=createInitialState(1498);expect(visibleActionsAtLocation(s,'home').filter(action=>ids.includes(action.id)||action.handler==='cook_item')).toEqual([]);
  });
});
