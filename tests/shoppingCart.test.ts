import { describe, expect, it } from 'vitest';
import { performShoppingCart, purchasePriceOf, getAction } from '../src/game/core/actions';
import { createInitialState } from '../src/game/core/state';
import { itemCount } from '../src/game/core/items';

function shopper(money = 500) {
  const state = createInitialState(7201);
  state.locationId = 'market';
  state.time.hour = 9;
  state.player.money = money;
  return state;
}

describe('菜市场集中采购', () => {
  it('一两件只推进半小时，三件及以上合并为一小时', () => {
    const small = shopper();
    const start = small.time.hour * 60 + small.time.minute;
    const one = performShoppingCart(small, ['buy_cabbage_market']);
    expect(one.ok, one.reason).toBe(true);
    expect(one.result?.duration).toBe(0.5);
    expect(small.time.hour * 60 + small.time.minute - start).toBe(30);
    expect(itemCount(small, 'cabbage')).toBe(1);

    const large = shopper();
    const largeStart = large.time.hour * 60 + large.time.minute;
    const three = performShoppingCart(large, ['buy_cabbage_market', 'buy_fruit_market', 'buy_pork_market']);
    expect(three.ok, three.reason).toBe(true);
    expect(three.result?.duration).toBe(1);
    expect(large.time.hour * 60 + large.time.minute - largeStart).toBe(60);
    expect(itemCount(large, 'cabbage')).toBe(1);
    expect(itemCount(large, 'fruit')).toBe(1);
    expect(itemCount(large, 'pork')).toBe(1);
  });

  it('按当前折扣计算总价，重复勾选同一件不会重复扣款', () => {
    const state = shopper();
    const vegetable = getAction('buy_cabbage_market')!;
    expect(purchasePriceOf(state, vegetable)).toBe(5);
    const before = state.player.money;
    const result = performShoppingCart(state, ['buy_cabbage_market', 'buy_cabbage_market']);
    expect(result.ok, result.reason).toBe(true);
    expect(state.player.money).toBe(before - 5);
    expect(itemCount(state, 'cabbage')).toBe(1);
  });

  it('任一商品买不起时整体回滚，不扣钱、不同时间也不获得前面选中的商品', () => {
    const state = shopper(15);
    const before = JSON.stringify(state);
    const result = performShoppingCart(state, ['buy_cabbage_market', 'buy_pork_market']);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('金钱不足');
    expect(JSON.stringify(state)).toBe(before);
  });
});
