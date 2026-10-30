/**
 * 投资理财子系统（v0.94 经济闭环）。
 * 纯逻辑层：买入 / 卖出 / 每月 rng 结算。
 * 产品数据 invest.json：定期存款（固定正息）/ 货币基金（小波动）/ 股票（大波动）。
 * 月结挂点：time.ts rollDay 跨月时调用 settleInvestments(state)。
 */
import type { GameState, Investment } from "../types";
import investData from "../data/invest.json";
import { pushLog } from "../engine";
import { recordMoney } from "./weekly";
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
  recordMoney(state, -rounded); // 周记：投资买入计入支出
  // v0.992 修复：id 用持久化的自增序号（economy.nextInvSeq），杜绝「组合长度派生」在同日卖出再买入时复用 id 卖错单。
  // 兜底同样扫描现有持仓 id 取最大序号：length+1 在有过卖出记录的档里会撞号。
  const maxSeq = state.economy.investments.reduce((m, i) => Math.max(m, Number(String(i.id).split("_").pop()) || 0), 0);
  const seq = state.economy.nextInvSeq ?? maxSeq + 1;
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
  recordMoney(state, inv.value); // 周记：赎回变现计入收入
  const gain = inv.value - inv.principal;
  const pnl = gain >= 0 ? `赚了 +${gain} 元` : `亏了 ${gain} 元`;
  pushLog(state, "💰", `赎回${prod?.name ?? "投资"}，拿回 ${inv.value} 元（${pnl}）`);
  return { ok: true, gain };
}

/**
 * 每月结算：每笔投资按产品期望收益率 ± 波动（rng）调整市值。
 * 存款波动为 0 → 固定正息；基金/股票引入真实风险：
 *  - 月度收益围绕 expectedRate 对称波动（用现有 rng，读档可复现）；
 *  - 允许负收益（本金可缩水），不再 Math.max(1,...) 保底成「永不亏」；
 *  - 单月最大涨幅上限 +15%、单月最大跌幅下限 -12%，防止极端值把本金一次打穿；
 *  - 仍保底市值 ≥1 元（本金不为负，避免归零后无法继续结算）。
 */
export function settleInvestments(state: GameState): void {
  if (state.economy.investments.length === 0) return;
  let totalDelta = 0;
  // 上限略高于股票当前声明的最大原始收益（2% + 12% = 14%），
  // 这样安全阀仍在，但不会把产品期望收益的上尾系统性截掉。
  const CAP_UP = 0.15; // 单月最大涨幅 +15%
  const CAP_DOWN = -0.12; // 单月最大跌幅 -12%
  for (const inv of state.economy.investments) {
    const prod = PROD_MAP.get(inv.productId);
    if (!prod) continue;
    const heldFraction = Math.max(0, Math.min(1, (daysSurvived(state) - (inv.boughtDay ?? daysSurvived(state))) / 30));
    let rate: number;
    if (prod.volatility === 0) {
      rate = prod.expectedRate; // 存款固定正息
    } else {
      const u = nextRandom(state.rng); // [0,1) 均匀，读档可复现
      rate = prod.expectedRate + prod.volatility * (2 * u - 1);
      if (rate > CAP_UP) rate = CAP_UP;
      if (rate < CAP_DOWN) rate = CAP_DOWN;
    }
    rate *= heldFraction;
    const newVal = Math.max(1, Math.round(inv.value * (1 + rate)));
    totalDelta += newVal - inv.value;
    inv.value = newVal;
  }
  if (totalDelta !== 0) {
    const icon = totalDelta > 0 ? "📈" : "📉";
    pushLog(state, icon, `理财月结：本月盈亏 ${totalDelta > 0 ? "+" : ""}${totalDelta} 元`);
  }
}
