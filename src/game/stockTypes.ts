import type { RngState } from './types';

export type StockRisk = 'stable' | 'medium' | 'high';
export interface StockDefinition { id:string; name:string; sector:string; risk:StockRisk; initialPriceCents:number; scale:number; limit:number; eventLimit:number; goodNews:string; badNews:string }
export interface StockQuote { priceCents:number; previousCents:number; dayOpenCents:number; change:number; event:string|null }
export interface StockSnapshot { minute:number; prices:Record<string,number> }
export interface StockInterest { interestCents:number; interestRemainder:number }
export interface StockPosition extends StockInterest {
  id:string; stockId:string; kind:'spot'|'long'|'short'; quantity:number; costCents:number;
  marginCents:number; financingCents:number; leverage:number; openedMinute:number; stopCents:number|null;
}
export type StockSide = 'buy'|'sell'|'long'|'short'|'close';
export interface StockOrder { id:string; stockId:string; side:StockSide; positionId?:string; quantity:number; leverage:number; limitCents:number; reservedCents:number; createdMinute:number }
export interface StockTrade { id:string; minute:number; stockId:string; label:string; quantity:number; priceCents:number; feeCents:number; pnlCents:number; reason:string }
export interface StockLoan extends StockInterest { id:string; principalCents:number; openedMinute:number; dueMinute:number; deadlineMinute:number; collateralIds:string[]; maturityProcessed:boolean }
export interface StockGapDebt extends StockInterest { id:string; principalCents:number; openedMinute:number; deadlineMinute:number }
export interface StockNotice { id:string; minute:number; text:string; kind:'info'|'risk'|'event' }
export interface StockMarketState {
  schema:1; initializedMinute:number; lastProcessedMinute:number; lastQuoteMinute:number; nextQuoteMinute:number;
  rng:RngState; dailyEvent:{day:number;minute:number;rolled:boolean}; quotes:Record<string,StockQuote>; history:StockSnapshot[];
  cashCents:number; positions:StockPosition[]; orders:StockOrder[]; trades:StockTrade[];
  loan:StockLoan|null; gapDebts:StockGapDebt[]; nextId:number; favorites:string[]; notices:StockNotice[];
  realizedPnlCents:number; feesPaidCents:number; interestPaidCents:number;
}
export interface StockOrderRequest { stockId:string; side:StockSide; quantity:number; leverage?:number; positionId?:string; limitCents?:number }
export interface StockResult { ok:boolean; reason:string }
export interface StockCollateral { id:string; name:string; kind:'vehicle'|'property'; valueCents:number; pledged:boolean; isHome:boolean }
