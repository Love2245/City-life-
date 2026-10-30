// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PhoneWorkspace from '../src/components/PhoneScreenWorkspace.svelte';
import PhoneCalendar from '../src/components/PhoneCalendarApp.svelte';
import SurvivalBanner from '../src/components/layout/SurvivalBanner.svelte';
import StockApp from '../src/components/ShunshunhuaWorkspace.svelte';
import { createInitialState } from '../src/game/core/state';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { takeStockLoan, repayStockDebt, ensureStockMarket, stockMinute } from '../src/game/core/stockMarket';
import { loadGame, saveGameImmediately } from '../src/lib/save';

const mounted: ReturnType<typeof mount>[] = [];
beforeAll(() => {
  if (!Element.prototype.animate) Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
});
afterEach(async () => { for (const app of mounted.splice(0)) await unmount(app); document.body.replaceChildren(); localStorage.clear(); });
function show(component: any, props = {}) {
  const target = document.createElement('div'); document.body.append(target);
  mounted.push(mount(component, { target, props })); flushSync(); return target;
}
function borrowed() {
  const state = createInitialState(1497);
  state.player.money = 10_000;
  state.flags.item_laptop = state.flags.laptop_app_invest = state.flags.item_e_bike = true;
  takeStockLoan(state, 100_000, ['vehicle:e_bike']);
  replaceState(state);
}

describe('金融提醒的玩家界面', () => {
  it('手机待办显示还款金额与电脑入口，还款后自动移除', () => {
    borrowed(); const target = show(PhoneWorkspace, { initialApp: 'todo' });
    expect(target.querySelector('.todo-commitments')?.textContent).toContain('抵押借款还款');
    expect(target.querySelector('.todo-commitments')?.textContent).toContain('1000.00');
    expect(target.querySelector('.todo-commitments')?.textContent).toContain('电脑顺顺花还款');
    flushSync(() => { repayStockDebt(gameState, 100_000); });
    expect(target.querySelector('.todo-commitments')?.textContent ?? '').not.toContain('抵押借款');
  });

  it('日历实际显示金融标记、到期和宽限截止，选择日期不结算', () => {
    borrowed(); const before = JSON.stringify(gameState), target = show(PhoneCalendar);
    expect(target.querySelector('.legend')?.textContent).toContain('还款');
    expect(target.querySelector('.upcoming')?.textContent).toContain('抵押借款到期');
    expect(target.querySelector('.upcoming')?.textContent).toContain('抵押借款宽限截止');
    const due = Array.from(target.querySelectorAll<HTMLButtonElement>('.reminder')).find(b => b.textContent?.includes('抵押借款到期'))!;
    flushSync(() => due.click());
    expect(target.querySelector('.day-agenda [data-kind="finance"]')?.textContent).toContain('1000.00');
    expect(JSON.stringify(gameState)).toBe(before);
  });

  it('穿仓临近截止在电脑关闭后仍有全局告警', () => {
    borrowed();
    ensureStockMarket(gameState).gapDebts.push({ id: 'ui-gap', principalCents: 12345, interestCents: 0, interestRemainder: 0, openedMinute: stockMinute(gameState), deadlineMinute: stockMinute(gameState) + 60 });
    const target = show(SurvivalBanner);
    expect(target.textContent).toContain('穿仓欠款');
    expect(target.textContent).toContain('123.45');
    expect(target.textContent).toContain('电脑顺顺花还款');
  });

  it('超过百万股的进度真实保存与读取后，持仓按钮可填入全部数量并一次卖出', async () => {
    borrowed();
    flushSync(() => {
      const market = ensureStockMarket(gameState);
      market.loan = null;
      market.positions.push({ id: 'large-ui', stockId: 'SS001', kind: 'spot', quantity: 1_000_001, costCents: 1_200_001_200, marginCents: 0, financingCents: 0, leverage: 1, openedMinute: stockMinute(gameState), stopCents: null, interestCents: 0, interestRemainder: 0 });
    });
    saveGameImmediately('slot_1', gameState);
    replaceState(createInitialState(1498));
    const loaded = await loadGame('slot_1');
    expect(loaded?.economy.stockMarket?.positions[0].quantity).toBe(1_000_001);
    replaceState(loaded!);
    const target = show(StockApp);
    const sell = Array.from(target.querySelectorAll<HTMLButtonElement>('tbody td:last-child button')).find(b => b.textContent?.trim() === '卖出')!;
    flushSync(() => sell.click());
    expect(target.querySelector<HTMLInputElement>('[aria-label="交易股数"]')?.value).toBe('1000001');
    const submit = target.querySelector<HTMLButtonElement>('.submit-order')!;
    flushSync(() => submit.click());
    expect(ensureStockMarket(gameState).positions).toHaveLength(0);
  });

  it('资产页实际展示资金区分与还款预留，不提供手机交易操作', () => {
    borrowed(); const before = JSON.stringify(gameState.time), target = show(PhoneWorkspace);
    const assets = Array.from(target.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim() === '资产')!;
    expect(assets).toBeDefined();
    flushSync(() => assets.click());
    const budget = target.querySelector('[aria-label="证券资金与还款预留"]');
    expect(budget?.textContent).toContain('证券可用资金');
    expect(budget?.textContent).toContain('委托冻结资金');
    expect(budget?.textContent).toContain('预留还款后生活现金');
    expect(budget?.textContent).toContain('还款请使用电脑顺顺花');
    expect(budget?.querySelector('button')).toBeNull();
    expect(JSON.stringify(gameState.time)).toBe(before);
  });
});
