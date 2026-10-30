import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { fromLinearDay, START_EPOCH } from '../src/game/core/calendar';
import { stockObligationsOf, stockDebtBudgetOf } from '../src/game/core/stockObligations';
import { calendarEventsOf } from '../src/game/core/phoneCalendar';
import { todoCommitmentsOf } from '../src/game/core/todoSummary';
import { survivalWarnings } from '../src/game/core/survival';
import { livingBudgetOf } from '../src/game/core/livingBudget';
import { takeStockLoan, repayStockDebt, stockMinute, ensureStockMarket, placeStockOrder } from '../src/game/core/stockMarket';
import type { GameState } from '../src/game/types';

function borrowed() {
  const state = createInitialState(1497);
  state.player.money = 10_000;
  state.flags.item_laptop = state.flags.laptop_app_invest = state.flags.item_e_bike = true;
  expect(takeStockLoan(state, 100_000, ['vehicle:e_bike']).ok).toBe(true);
  return state;
}
function clock(state: GameState, minute: number) {
  state.time = { ...state.time, ...fromLinearDay(START_EPOCH + Math.floor(minute / 1440)), hour: Math.floor(minute % 1440 / 60), minute: minute % 60 };
}

describe('金融期限与现金预留', () => {
  it('借款到期与宽限截止进入日历，未租房的玩家也可在待办查看', () => {
    const state = borrowed(), loan = ensureStockMarket(state).loan!;
    const events = calendarEventsOf(state, 0, 60).filter(e => e.kind === 'finance');
    expect(events.map(e => e.at)).toEqual([loan.dueMinute, loan.deadlineMinute]);
    expect(events.every(e => e.deadline && e.detail.includes('电脑顺顺花'))).toBe(true);
    expect(todoCommitmentsOf(state).find(e => e.title.includes('抵押借款'))?.detail).toContain('1000.00');
  });

  it('到期前三天、一天、当天使用逐级告警，查看不会提前还款', () => {
    const state = borrowed(), loan = ensureStockMarket(state).loan!;
    for (const [remaining, severity] of [[3 * 1440, 'warn'], [1440, 'danger'], [60, 'critical']] as const) {
      clock(state, loan.dueMinute - remaining);
      const before = JSON.stringify(state);
      const warning = survivalWarnings(state, 30).find(e => e.key === `finance:${loan.id}`);
      expect(warning?.severity).toBe(severity);
      expect(warning?.text).toContain('电脑顺顺花还款');
      expect(JSON.stringify(state)).toBe(before);
    }
    clock(state, loan.dueMinute - 4 * 1440);
    expect(survivalWarnings(state, 30).some(e => e.key.startsWith('finance:'))).toBe(false);
  });

  it('贷款逾期改为宽限截止，穿仓欠款分别保留各自期限', () => {
    const state = borrowed(), market = ensureStockMarket(state), loan = market.loan!;
    clock(state, loan.dueMinute + 1);
    market.gapDebts.push({ id: 'gap-test', principalCents: 2500, interestCents: 3, interestRemainder: 1, openedMinute: stockMinute(state), deadlineMinute: stockMinute(state) + 1440 });
    const debts = stockObligationsOf(state);
    expect(debts[0]).toMatchObject({ id: 'gap-test', amountCents: 2504, severity: 'danger' });
    expect(debts.find(e => e.id === loan.id)).toMatchObject({ nextMinute: loan.deadlineMinute, nextLabel: '宽限截止' });
    expect(todoCommitmentsOf(state).filter(e => /借款|穿仓/.test(e.title))).toHaveLength(2);
    expect(calendarEventsOf(state, 0, 60).filter(e => e.kind === 'finance')).toHaveLength(3);
  });

  it('资金预算排除冻结委托，按证券可用资金计算生活现金预留', () => {
    const state = borrowed(), market = ensureStockMarket(state);
    expect(placeStockOrder(state, { stockId: 'SS001', side: 'buy', quantity: 50, limitCents: 1000 }).ok).toBe(true);
    const budget = stockDebtBudgetOf(state);
    expect(budget).toMatchObject({ financialDebt: 1000, securitiesAvailable: 499.75, securitiesFrozen: 500.25, cashAfterDebtReserve: 9499.75 });
    expect(livingBudgetOf(state)).toMatchObject(budget);
    expect(state.player.money).toBe(10_000);
  });

  it('还款后日历、待办与全局告警立即消失，不留幽灵提醒', () => {
    const state = borrowed();
    expect(repayStockDebt(state, 100_000).ok).toBe(true);
    expect(stockObligationsOf(state)).toEqual([]);
    expect(todoCommitmentsOf(state)).toEqual([]);
    expect(calendarEventsOf(state, 0, 60).some(e => e.kind === 'finance')).toBe(false);
    expect(survivalWarnings(state, 30).some(e => e.key.startsWith('finance:'))).toBe(false);
  });

  it('无证券账户或重复查看均不修改存档、时钟、随机数及资产', () => {
    for (const state of [borrowed(), createInitialState(71)]) {
      if (!ensureStockMarket(state).loan) delete state.economy.stockMarket;
      const before = JSON.stringify(state);
      for (let i = 0; i < 3; i++) {
        stockObligationsOf(state); stockDebtBudgetOf(state); todoCommitmentsOf(state); calendarEventsOf(state, 0, 60); survivalWarnings(state, 30); livingBudgetOf(state);
      }
      expect(JSON.stringify(state)).toBe(before);
    }
  });
});
