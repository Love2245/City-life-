import type { GameState } from '../types';
import { cents, interestDue, stockDebtTotal, stockFreeCash, stockMinute, stockTimeLabel, STOCK_DAY } from './stockMath';

export interface StockObligation {
  id: string;
  kind: 'loan' | 'gap';
  title: string;
  amountCents: number;
  dueMinute?: number;
  deadlineMinute: number;
  nextMinute: number;
  nextLabel: string;
  severity: 'ok' | 'warn' | 'danger' | 'critical';
  detail: string;
}

/** Read-only projections: opening reminders must never initialize an account or settle debt. */
export function stockObligationsOf(state: GameState): StockObligation[] {
  const market = state.economy.stockMarket;
  if (!market) return [];
  const now = stockMinute(state);
  const debts = [
    ...(market.loan ? [{ ...market.loan, kind: 'loan' as const }] : []),
    ...market.gapDebts.map(debt => ({ ...debt, kind: 'gap' as const })),
  ];
  return debts.flatMap(debt => {
    const amountCents = debt.principalCents + interestDue(debt);
    if (amountCents <= 0) return [];
    const dueMinute = debt.kind === 'loan' ? debt.dueMinute : undefined;
    const inGrace = dueMinute === undefined || now >= dueMinute;
    const nextMinute = !inGrace && dueMinute !== undefined ? dueMinute : debt.deadlineMinute;
    const remaining = nextMinute - now;
    const today = Math.floor(nextMinute / STOCK_DAY) === Math.floor(now / STOCK_DAY);
    const severity: StockObligation['severity'] = remaining <= 0 || today ? 'critical'
      : remaining <= STOCK_DAY ? 'danger' : remaining <= 3 * STOCK_DAY || inGrace ? 'warn' : 'ok';
    const countdown = remaining <= 0 ? '已到期' : today ? '今天到期'
      : remaining >= STOCK_DAY ? `剩 ${Math.ceil(remaining / STOCK_DAY)} 天`
      : `剩 ${Math.ceil(remaining / 60)} 小时`;
    const title = debt.kind === 'gap' ? '穿仓欠款' : inGrace ? '抵押借款宽限期' : '抵押借款还款';
    const nextLabel = inGrace ? '宽限截止' : '借款到期';
    const detail = `待还 ¥${(amountCents / 100).toFixed(2)} · ${nextLabel} ${stockTimeLabel(nextMinute)} · ${countdown} · 请到电脑顺顺花还款`;
    return [{ id: debt.id, kind: debt.kind, title, amountCents, dueMinute, deadlineMinute: debt.deadlineMinute,
      nextMinute, nextLabel, severity, detail }];
  }).sort((a, b) => a.nextMinute - b.nextMinute || a.id.localeCompare(b.id));
}

export function stockDebtBudgetOf(state: GameState) {
  const market = state.economy.stockMarket;
  const debtCents = market ? stockDebtTotal(market) : 0;
  const availableCents = market ? Math.max(0, stockFreeCash(market)) : 0;
  const frozenCents = market ? market.cashCents - availableCents : 0;
  const walletCents = Math.max(0, cents(state.player.money));
  return {
    financialDebt: debtCents / 100,
    securitiesAvailable: availableCents / 100,
    securitiesFrozen: frozenCents / 100,
    cashAfterDebtReserve: Math.max(0, walletCents - Math.max(0, debtCents - availableCents)) / 100,
  };
}
