/** Read-only valuation and market initialization. No engine/UI imports: difficulty and save factories use this module. */
import type { GameState } from '../types';
import type { StockInterest, StockMarketState, StockPosition } from '../stockTypes';
import { STOCKS } from '../data/stocks';
import { gameDay, fromLinearDay, START_EPOCH } from './calendar';
import { createRng, nextRandom } from '../rng';

export const STOCK_INTERVAL = 360;
export const STOCK_DAY = 1440;
export const STOCK_GRACE = 14 * STOCK_DAY;
export const STOCK_TERM = 30 * STOCK_DAY;
export const INTEREST_DENOMINATOR = 10000 * 360 * STOCK_DAY;
export const MAX_STOCK_CENTS = 1_000_000_000_000;
export function stockMinute(state:Pick<GameState,'time'>):number { return gameDay(state.time)*STOCK_DAY+Math.round(state.time.hour*60+state.time.minute); }
export function stockTimeLabel(minute:number):string {
  const day=Math.floor(minute/STOCK_DAY),within=((minute%STOCK_DAY)+STOCK_DAY)%STOCK_DAY,date=fromLinearDay(START_EPOCH+day);
  return date.month+'/'+date.day+' '+String(Math.floor(within/60)).padStart(2,'0')+':'+String(within%60).padStart(2,'0');
}
export function cents(value:number):number { return Math.round(value*100); }
export function stockFee(notional:number):number { return Math.max(1,Math.round(notional*5/10000)); }
export function interestDue(value:StockInterest):number { return value.interestCents+(value.interestRemainder>0?1:0); }
export function accrueStockInterest(value:StockInterest,principal:number,minutes:number,rateBps:number):void {
  if(principal<=0||minutes<=0)return;
  const total=BigInt(value.interestRemainder)+BigInt(principal)*BigInt(minutes)*BigInt(rateBps);
  const denominator=BigInt(INTEREST_DENOMINATOR);
  value.interestCents+=Number(total/denominator);value.interestRemainder=Number(total%denominator);
}
export function createStockMarket(state:Pick<GameState,'time'|'rng'>):StockMarketState {
  const now=stockMinute(state),rng=createRng((state.rng.seed^0x53534831)>>>0),day=Math.floor(now/STOCK_DAY);
  const slots=[360,720,1080,1440].map(m=>day*STOCK_DAY+m).filter(m=>m>now);
  const eventMinute=slots[Math.floor(nextRandom(rng)*slots.length)];
  const quotes=Object.fromEntries(STOCKS.map(s=>[s.id,{priceCents:s.initialPriceCents,previousCents:s.initialPriceCents,dayOpenCents:s.initialPriceCents,change:0,event:null}]));
  return {schema:1,initializedMinute:now,lastProcessedMinute:now,lastQuoteMinute:now,nextQuoteMinute:(Math.floor(now/STOCK_INTERVAL)+1)*STOCK_INTERVAL,rng,
    dailyEvent:{day,minute:eventMinute,rolled:false},quotes,history:[{minute:now,prices:Object.fromEntries(STOCKS.map(s=>[s.id,s.initialPriceCents]))}],
    cashCents:0,positions:[],orders:[],trades:[],loan:null,gapDebts:[],nextId:1,favorites:[],notices:[],realizedPnlCents:0,feesPaidCents:0,interestPaidCents:0};
}
export function stockFreeCash(m:StockMarketState):number { return m.cashCents-m.orders.reduce((v,o)=>v+o.reservedCents,0); }
export function stockPositionPnl(m:StockMarketState,p:StockPosition):number {
  const current=(m.quotes[p.stockId]?.priceCents??0)*p.quantity;
  return p.kind==='short'?p.costCents-current:current-p.costCents;
}
export function stockPositionEquity(m:StockMarketState,p:StockPosition):number {
  return p.kind==='spot'?(m.quotes[p.stockId]?.priceCents??0)*p.quantity:p.marginCents+stockPositionPnl(m,p)-interestDue(p);
}
export function stockDebtTotal(m:StockMarketState):number {
  return (m.loan?m.loan.principalCents+interestDue(m.loan):0)+m.gapDebts.reduce((v,d)=>v+d.principalCents+interestDue(d),0);
}
export function stockAccountEquity(m:StockMarketState|undefined):number {
  return m?m.cashCents+m.positions.reduce((v,p)=>v+stockPositionEquity(m,p),0)-stockDebtTotal(m):0;
}
export function stockLiquidationPrice(p:StockPosition):number|null {
  if(p.kind==='spot')return null;
  const delta=.75*p.marginCents-interestDue(p);
  return Math.max(1,Math.round((p.costCents+(p.kind==='short'?delta:-delta))/p.quantity));
}
