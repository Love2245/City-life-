import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {rollBlindBox} from '../src/game/core/actions';

describe('便利店与员工福利共用盲盒',()=>{
  it('仍抽取两个不同物品，并用可烹饪白菜和猪肉替代旧食材',()=>{
    const state=createInitialState(20261030), found=new Set<string>();
    for(let i=0;i<300;i++){
      const {a,b}=rollBlindBox(state);
      expect(a).not.toBe(b);
      found.add(a);found.add(b);
    }
    expect(found.has('cabbage')).toBe(true);expect(found.has('pork')).toBe(true);
    expect(found.has('vegetable')).toBe(false);expect(found.has('meat')).toBe(false);
    expect(found.size).toBe(10);
  });
});
