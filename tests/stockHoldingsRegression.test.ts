import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { migrateSave } from '../src/game/core/migrate';
import { ensureStockMarket, placeStockOrder, transferStockCash, processStockMarket, setStockStop, stockFee } from '../src/game/core/stockMarket';

function funded() {
  const state = createInitialState(1497);
  state.player.money = 20_000_000;
  state.flags.item_laptop = true;
  state.flags.laptop_app_invest = true;
  expect(transferStockCash(state, 1_500_000_000, 'in').ok).toBe(true);
  expect(placeStockOrder(state, { stockId: 'SS001', side: 'buy', quantity: 1_000_000 }).ok).toBe(true);
  return state;
}

describe('累计现货的存读与退出', () => {
  it('连续加仓超过单笔上限后存读保留股数、成本、现金与随机状态', () => {
    const state = funded();
    expect(placeStockOrder(state, { stockId: 'SS001', side: 'buy', quantity: 1 }).ok).toBe(true);
    const before = JSON.stringify(state);
    const loaded = migrateSave(JSON.parse(before));
    expect(loaded.economy.stockMarket).toEqual(state.economy.stockMarket);
    expect(loaded.economy.stockMarket!.positions[0].quantity).toBe(1_000_001);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('大持仓可一次全部卖出，手续费与现金结算使用完整数量', () => {
    const state = funded();
    placeStockOrder(state, { stockId: 'SS001', side: 'buy', quantity: 1 });
    const market = ensureStockMarket(state), position = market.positions[0];
    const cash = market.cashCents, notional = position.quantity * market.quotes.SS001.priceCents;
    expect(placeStockOrder(state, { stockId: 'SS001', side: 'sell', quantity: position.quantity, positionId: position.id }).ok).toBe(true);
    expect(market.positions).toHaveLength(0);
    expect(market.cashCents).toBe(cash + notional - stockFee(notional));
  });

  it('限价自动加仓超过百万股后仍能读取，整仓卖单可冻结并存读', () => {
    let state = funded();
    expect(placeStockOrder(state, { stockId: 'SS001', side: 'buy', quantity: 1, limitCents: 1100 }).ok).toBe(true);
    ensureStockMarket(state).quotes.SS001.priceCents = 1100;
    processStockMarket(state);
    state = migrateSave(JSON.parse(JSON.stringify(state)));
    const market = ensureStockMarket(state), position = market.positions[0];
    expect(position.quantity).toBe(1_000_001);
    expect(placeStockOrder(state, { stockId: 'SS001', side: 'sell', quantity: position.quantity, positionId: position.id, limitCents: 1300 }).ok).toBe(true);
    state = migrateSave(JSON.parse(JSON.stringify(state)));
    ensureStockMarket(state).quotes.SS001.priceCents = 1300;
    processStockMarket(state);
    expect(ensureStockMarket(state).positions).toHaveLength(0);
    expect(ensureStockMarket(state).orders).toHaveLength(0);
  });

  it('大持仓止损完整退出，不残留挂单或反复结算', () => {
    const state = funded();
    placeStockOrder(state, { stockId: 'SS001', side: 'buy', quantity: 1 });
    const market = ensureStockMarket(state), position = market.positions[0];
    setStockStop(state, position.id, 1100);
    market.quotes.SS001.priceCents = 1000;
    processStockMarket(state);
    expect(market.positions).toHaveLength(0);
    expect(market.trades.at(-1)?.quantity).toBe(1_000_001);
    const after = JSON.stringify(market);
    processStockMarket(state);
    expect(JSON.stringify(market)).toBe(after);
  });

  it('单笔买入仍限百万股，非法或不安全数量不能扣款', () => {
    const state = funded(), before = JSON.stringify(state.economy.stockMarket);
    for (const quantity of [1_000_001, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(placeStockOrder(state, { stockId: 'SS001', side: 'buy', quantity }).ok).toBe(false);
    }
    expect(JSON.stringify(state.economy.stockMarket)).toBe(before);
    const invalid = JSON.parse(JSON.stringify(state));
    invalid.economy.stockMarket.positions[0].quantity = Number.MAX_SAFE_INTEGER + 1;
    expect(() => migrateSave(invalid)).toThrow('顺顺花持仓记录损坏');
  });
});
