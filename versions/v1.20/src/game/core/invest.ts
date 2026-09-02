/**
 * 投资理财子系统（v0.94 经济闭环）。
 * 纯逻辑层：买入 / 卖出 / 每月 rng 结算。
 * 产品数据 invest.json：定期存款（固定正息）/ 货币基金（小波动）/ 股票（大波动）。
 * 月结挂点：time.ts rollDay 跨月时调用 settleInvestments(state)。
 */
import type { GameState, Investment } from "../types";
import investData from "../data/invest.json";
import { pushLog } from "../engine";
import { nextRandom } from "../rng";
import { daysSurvived } from "./difficulty";

/** 投资产品定义 */
export interface InvestProduct {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 月期望收益率 */
  expectedRate: number;
  /** 月波动幅度（0 = 固定收益） */
  volatility: number;
  /** 最低投入（元） */
  minAmount: number;
}

export const INVEST_PRODUCTS: InvestProduct[] = (investData as { products: InvestProduct[] }).products;
const PROD_MAP = new Map(INVEST_PRODUCTS.map((p) => [p.id, p]));

export function investProductById(id: string): InvestProduct | undefined {
  return PROD_MAP.get(id);
}

/** 投资组合总市值 */
export function investmentTotal(state: GameState): number {
  return state.economy.investments.reduce((s, i) => s + i.value, 0);
}

/** 买入投资：扣现金 → 记入组合（按当前物价倍率对最低投入无影响，金额由玩家输入） */
export function buyInvestment(
  state: GameState,
  productId: string,
  amount: number,
): { ok: boolean; reason?: string } {
  const prod = PROD_MAP.get(productId);
  if (!prod) return { ok: false, reason: "未知理财产品" };
  if (!Number.isFinite(amount) || amount < prod.minAmount) {
    return { ok: false, reason: `最低投入 ${prod.minAmount} 元` };
  }
  const rounded = Math.round(amount);
  if (state.player.money < rounded) {
    return { ok: false, reason: `现金不足（需 ${rounded} 元）` };
  }
  state.player.money -= rounded;
  // v0.992 修复：id 用持久化的自增序号（economy.nextInvSeq），杜绝「组合长度派生」在同日卖出再买入时复用 id 卖错单
  const seq = state.economy.nextInvSeq ?? state.economy.investments.length + 1;
  const inv: Investment = {
    id: `inv_${state.time.year}-${state.time.month}-${state.time.day}_${seq}`,
    productId,
    principal: rounded,
    value: rounded,
    boughtDay: daysSurvived(state),
  };
  state.economy.investments.push(inv);
  state.economy.nextInvSeq = seq + 1;
  pushLog(state, prod.icon, `买入${prod.name} ${rounded} 元，静待月结`);
  return { ok: true };
}

/** 卖出投资：按当前市值变现（盈亏即时落袋） */
export function sellInvestment(state: GameState, id: string): { ok: boolean; reason?: string; gain?: number } {
  const idx = state.economy.investments.findIndex((i) => i.id === id);
  if (idx < 0) return { ok: false, reason: "未找到该投资" };
  const [inv] = state.economy.investments.splice(idx, 1);
  const prod = PROD_MAP.get(inv.productId);
  state.player.money += inv.value;
  const gain = inv.value - inv.principal;
  const pnl = gain >= 0 ? `赚了 +${gain} 元` : `亏了 ${gain} 元`;
  pushLog(state, "💰", `赎回${prod?.name ?? "投资"}，拿回 ${inv.value} 元（${pnl}）`);
  return { ok: true, gain };
}

/**
 * 每月结算：每笔投资按产品期望收益率 ± 波动（rng）调整市值。
 * 存款波动为 0 → 固定正息；基金/股票用两次 rng 近似正态扰动。
 * 市值保底 1 元，避免归零。
 */
export function settleInvestments(state: GameState): void {
  if (state.economy.investments.length === 0) return;
  let totalDelta = 0;
  for (const inv of state.economy.investments) {
    const prod = PROD_MAP.get(inv.productId);
    if (!prod) continue;
    let rate = prod.expectedRate;
    if (prod.volatility > 0) {
      const noise = (nextRandom(state.rng) + nextRandom(state.rng) - 1) * prod.volatility * 2;
      rate += noise;
    }
    const newVal = Math.max(1, Math.round(inv.value * (1 + rate)));
    totalDelta += newVal - inv.value;
    inv.value = newVal;
  }
  if (totalDelta !== 0) {
    const icon = totalDelta > 0 ? "📈" : "📉";
    pushLog(state, icon, `理财月结：本月盈亏 ${totalDelta > 0 ? "+" : ""}${totalDelta} 元`);
  }
}
