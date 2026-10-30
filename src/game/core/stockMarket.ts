/** 顺顺花：证券交易、独立保证金、抵押与金融结算。金额统一为分。 */
import type { GameState, HousingData } from '../types';
import {financialRiskAccess,recordFinancialEvent,applyFinancialSanctions,financialStorageProblem} from './financialRisk';
import type { StockMarketState, StockPosition, StockOrderRequest, StockResult, StockCollateral, StockInterest } from '../stockTypes';
import { STOCKS, STOCK_MAP } from '../data/stocks';
import { nextRandom } from '../rng';
import { pushLog } from '../engine';
import { recordMoney } from './weekly';
import { hasLaptop } from './projects';
import { activeOwnedProperty, bestOwnedProperty, ownedProperties, normalizeOwnedProperties } from './propertyPortfolio';
import { VEHICLE_BUY, VEHICLE_NAMES } from './vehicle';
import housingData from '../data/housing.json';
import { residenceLocationId } from './residence';
import { createStockMarket, stockMinute, stockFreeCash, stockFee, cents, interestDue, accrueStockInterest, stockPositionEquity, stockDebtTotal, STOCK_INTERVAL, STOCK_DAY, STOCK_TERM, STOCK_GRACE, MAX_STOCK_CENTS } from './stockMath';
export * from './stockMath';

const success=(reason:string):StockResult=>({ok:true,reason});
const failure=(reason:string):StockResult=>({ok:false,reason});
const money=(n:number)=>(n/100).toFixed(2)+' 元';
export function ensureStockMarket(state:GameState):StockMarketState { return state.economy.stockMarket??=(createStockMarket(state)); }
function nextId(m:StockMarketState,prefix:string):string { return prefix+'_'+m.nextId++; }
function notice(state:GameState,text:string,kind:'info'|'risk'|'event'='info'):void {
  const m=ensureStockMarket(state);m.notices.push({id:nextId(m,'note'),minute:stockMinute(state),text,kind});m.notices=m.notices.slice(-60);
  pushLog(state,kind==='risk'?'⚠️':kind==='event'?'📊':'💹','顺顺花：'+text);
}
export function stockAccess(state:GameState,allowRiskReduction=false):StockResult {
  if(state.endingId)return failure('本局已经结束');
  if(!allowRiskReduction){const risk=financialRiskAccess(state,'stock');if(!risk.ok)return risk;}
  if(state.locationId==='commercial_exchange')return state.time.hour>=8&&state.time.hour<20?success('交易所公用电脑已连接'):failure('证券交易所已打烊，请在08:00—20:00使用公用电脑');
  if(!hasLaptop(state))return failure('请通过自有电脑或有效网咖机位操作');
  if(!state.flags.laptop_app_invest)return failure('请先在电脑软件商城安装顺顺花');
  return success('电脑已连接');
}
export function stockIsOverdue(m:StockMarketState,now:number):boolean { return m.gapDebts.length>0||!!m.loan&&now>=m.loan.dueMinute; }
export function toggleStockFavorite(state:GameState,id:string):StockResult {
  const access=stockAccess(state);if(!access.ok)return access;if(!STOCK_MAP[id])return failure('未知股票');
  const m=ensureStockMarket(state);m.favorites=m.favorites.includes(id)?m.favorites.filter(v=>v!==id):[...m.favorites,id];return success('自选已更新');
}
export function transferStockCash(state:GameState,amountCents:number,direction:'in'|'out'):StockResult {
  const access=stockAccess(state);if(!access.ok)return access;
  if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>MAX_STOCK_CENTS)return failure('请输入有效金额，精确到分');
  const m=ensureStockMarket(state);
  if(direction==='in'){
    if(cents(state.player.money)<amountCents)return failure('生活现金不足');
    if(m.cashCents+amountCents>MAX_STOCK_CENTS)return failure('账户金额超过上限');
    state.player.money=Math.round((state.player.money-amountCents/100)*100)/100;m.cashCents+=amountCents;
  }else{
    if(m.loan||m.gapDebts.length)return failure('金融欠款结清前暂停提现');
    if(stockFreeCash(m)<amountCents)return failure('可用证券资金不足，冻结资金不可转出');
    m.cashCents-=amountCents;state.player.money=Math.round((state.player.money+amountCents/100)*100)/100;
  }
  return success((direction==='in'?'转入证券账户 ':'转回生活现金 ')+money(amountCents));
}
function reservedQuantity(m:StockMarketState,id:string):number { return m.orders.filter(o=>o.positionId===id).reduce((n,o)=>n+o.quantity,0); }
function validPositionQuantity(n:number):boolean { return Number.isSafeInteger(n)&&n>=1; }
// A spot holding combines multiple buys. Only opening orders have the one-million-share cap;
// selling a complete holding and loading it must accept the same accumulated quantity.
function validOrderQuantity(n:number,side:StockOrderRequest['side']):boolean {
  return validPositionQuantity(n)&&(['sell','close'].includes(side)||n<=1_000_000);
}
function requiredCash(request:StockOrderRequest,price:number):number {
  const n=request.quantity*price;return request.side==='buy'?n+stockFee(n):request.side==='long'||request.side==='short'?Math.ceil(n/(request.leverage??1))+stockFee(n):0;
}
function validateOrder(state:GameState,r:StockOrderRequest,price:number,automatic=false):StockResult {
  const m=ensureStockMarket(state);
  if(state.endingId)return failure('本局已经结束');
  if(!STOCK_MAP[r.stockId])return failure('未知股票');
  if(!['buy','sell','long','short','close'].includes(r.side))return failure('未知交易方向');
  if(!validOrderQuantity(r.quantity,r.side)||!Number.isSafeInteger(price)||price<=0||!Number.isSafeInteger(r.quantity*price)||r.quantity*price>MAX_STOCK_CENTS)return failure('股数、价格或成交金额无效');
  if(r.side==='sell'||r.side==='close'){
    const p=m.positions.find(p=>p.id===r.positionId&&p.stockId===r.stockId);
    if(!p)return failure('没有这笔持仓');
    if(r.side==='sell'&&p.kind!=='spot')return failure('请使用平仓操作');
    if(p.quantity-(automatic?0:reservedQuantity(m,p.id))<r.quantity)return failure('可卖股数不足，部分持仓已被委托冻结');
  }else{
    if(stockIsOverdue(m,stockMinute(state)))return failure('逾期或穿仓欠款结清前暂停新增买入');
    if(r.side==='long'&&![2,3].includes(r.leverage??0)||r.side==='short'&&![1,2,3].includes(r.leverage??0))return failure('做多可选2或3倍，做空可选1、2或3倍');
    if((r.side==='long'||r.side==='short')&&m.loan)return failure('抵押贷款与保证金交易不能叠加');
    const existing=r.side==='buy'?m.positions.find(p=>p.stockId===r.stockId&&p.kind==='spot'):undefined;
    if(existing&&(!Number.isSafeInteger(existing.quantity+r.quantity)||!Number.isSafeInteger(existing.costCents+r.quantity*price)||!Number.isSafeInteger((existing.quantity+r.quantity)*price)))return failure('累计持仓超过可安全计算的范围');
    if(m.positions.length>=128)return failure('持仓数量已达上限，请先整理持仓');
    if(stockFreeCash(m)<requiredCash(r,price))return failure('可用证券资金不足');
  }
  return success('校验通过');
}
function chargeFee(state:GameState,fee:number):void { const m=ensureStockMarket(state);m.feesPaidCents+=fee;recordMoney(state,-fee/100); }
function addTrade(state:GameState,p:Pick<StockPosition,'stockId'>,label:string,quantity:number,price:number,fee:number,pnl:number,reason:string):void {
  const m=ensureStockMarket(state);m.trades.push({id:nextId(m,'trade'),minute:stockMinute(state),stockId:p.stockId,label,quantity,priceCents:price,feeCents:fee,pnlCents:pnl,reason});m.trades=m.trades.slice(-240);
}
function clearExits(m:StockMarketState,id:string):void { m.orders=m.orders.filter(o=>o.positionId!==id); }
function closePosition(state:GameState,p:StockPosition,quantity:number,reason:string):StockResult {
  const m=ensureStockMarket(state),price=m.quotes[p.stockId].priceCents,notional=quantity*price,fee=stockFee(notional),all=quantity===p.quantity;
  const cost=all?p.costCents:Math.round(p.costCents*quantity/p.quantity),margin=all?p.marginCents:Math.round(p.marginCents*quantity/p.quantity);
  const interest=all?interestDue(p):Math.ceil(interestDue(p)*quantity/p.quantity),financing=all?p.financingCents:Math.round(p.financingCents*quantity/p.quantity);
  const pnl=p.kind==='short'?cost-notional:notional-cost;
  const returned=p.kind==='spot'?notional-fee:margin+pnl-interest-fee;
  if(returned>=0)m.cashCents+=returned;
  else{
    m.gapDebts.push({id:nextId(m,'gap'),principalCents:-returned,interestCents:0,interestRemainder:0,openedMinute:stockMinute(state),deadlineMinute:stockMinute(state)+STOCK_GRACE});
    notice(state,'穿仓欠款 '+money(-returned)+'，请在14天内清偿。','risk');
  }
  chargeFee(state,fee);recordMoney(state,pnl/100);m.realizedPnlCents+=pnl;
  if(interest){m.interestPaidCents+=interest;recordMoney(state,-interest/100);}
  addTrade(state,p,p.kind==='spot'?'卖出':p.kind==='short'?'买回平空':'卖出平多',quantity,price,fee,pnl,reason);
  clearExits(m,p.id);
  if(all)m.positions=m.positions.filter(x=>x.id!==p.id);
  else{p.quantity-=quantity;p.costCents-=cost;p.marginCents-=margin;p.financingCents-=financing;p.interestCents=Math.max(0,interestDue(p)-interest);p.interestRemainder=0;}
  return success(reason+' '+STOCK_MAP[p.stockId].name+' '+quantity+' 股');
}
function executeOrder(state:GameState,r:StockOrderRequest,reason='市价成交'):StockResult {
  const m=ensureStockMarket(state),price=m.quotes[r.stockId]?.priceCents??0;
  const check=validateOrder(state,r,price);if(!check.ok)return check;
  if(!recordFinancialEvent(state,'stock'))return failure(financialStorageProblem());
  if(r.side==='sell'||r.side==='close')return closePosition(state,m.positions.find(p=>p.id===r.positionId)!,r.quantity,reason);
  const n=r.quantity*price,fee=stockFee(n),kind=r.side==='buy'?'spot':r.side;
  const margin=kind==='spot'?0:Math.ceil(n/(r.leverage??1));m.cashCents-=kind==='spot'?n+fee:margin+fee;chargeFee(state,fee);
  const existing=kind==='spot'?m.positions.find(p=>p.stockId===r.stockId&&p.kind==='spot'):undefined;
  if(existing){existing.quantity+=r.quantity;existing.costCents+=n;}
  else m.positions.push({id:nextId(m,'pos'),stockId:r.stockId,kind,quantity:r.quantity,costCents:n,marginCents:margin,financingCents:kind==='long'?n-margin:kind==='short'?n:0,leverage:kind==='spot'?1:r.leverage!,openedMinute:stockMinute(state),stopCents:null,interestCents:0,interestRemainder:0});
  addTrade(state,{stockId:r.stockId},kind==='spot'?'买入':kind==='long'?'保证金做多':'保证金做空',r.quantity,price,fee,0,reason);
  return success(reason+' '+STOCK_MAP[r.stockId].name+' '+r.quantity+' 股');
}
function orderTriggered(m:StockMarketState,r:StockOrderRequest,limit:number):boolean {
  const price=m.quotes[r.stockId].priceCents,p=m.positions.find(p=>p.id===r.positionId);
  const buy=r.side==='buy'||r.side==='long'||r.side==='close'&&p?.kind==='short';return buy?price<=limit:price>=limit;
}
export function placeStockOrder(state:GameState,r:StockOrderRequest):StockResult {
  const access=stockAccess(state);if(!access.ok)return access;
  const m=ensureStockMarket(state),price=r.limitCents??m.quotes[r.stockId]?.priceCents??0;
  const check=validateOrder(state,r,price);if(!check.ok)return check;
  if(r.limitCents===undefined)return executeOrder(state,r);
  if(orderTriggered(m,r,r.limitCents))return executeOrder(state,r,'限价即时成交');
  if(m.orders.length>=100)return failure('最多保留100笔未成交委托');
  if(!recordFinancialEvent(state,'stock'))return failure(financialStorageProblem());
  m.orders.push({id:nextId(m,'order'),stockId:r.stockId,side:r.side,positionId:r.positionId,quantity:r.quantity,leverage:r.leverage??1,limitCents:r.limitCents,reservedCents:requiredCash(r,r.limitCents),createdMinute:stockMinute(state)});
  return success('限价委托已提交，满足条件时自动成交');
}
export function cancelStockOrder(state:GameState,id:string):StockResult {
  const access=stockAccess(state,true);if(!access.ok)return access;
  const m=ensureStockMarket(state);if(!m.orders.some(o=>o.id===id))return failure('委托已成交或不存在');m.orders=m.orders.filter(o=>o.id!==id);return success('委托已撤销，冻结资金和股数已释放');
}
export function setStockStop(state:GameState,id:string,price:number|null):StockResult {
  const access=stockAccess(state,true);if(!access.ok)return access;
  const m=ensureStockMarket(state),p=m.positions.find(p=>p.id===id);if(!p)return failure('持仓不存在');
  if(price!==null&&(!Number.isSafeInteger(price)||price<1||price>MAX_STOCK_CENTS))return failure('止损价格无效');
  p.stopCents=price;
  if(price!==null&&((p.kind==='short'&&m.quotes[p.stockId].priceCents>=price)||(p.kind!=='short'&&m.quotes[p.stockId].priceCents<=price))){clearExits(m,id);return closePosition(state,p,p.quantity,'止损触发');}
  return success(price===null?'止损已取消':'止损已保存，软件关闭后也会执行');
}
export function stockCollateral(state:GameState):StockCollateral[] {
  const m=state.economy.stockMarket,pledged=new Set(m?.loan?.collateralIds??[]),active=activeOwnedProperty(state);
  const tiers=(housingData as HousingData).buy;
  const properties=ownedProperties(state).flatMap(p=>{const t=tiers.find(t=>t.id===p.housingId);return t?[{id:'property:'+p.id,name:t.name+' · '+p.id,kind:'property' as const,valueCents:Math.round(t.buyPrice!*100*.8),pledged:pledged.has('property:'+p.id),isHome:state.living.mode==='own'&&active?.id===p.id}]:[];});
  const vehicles=Object.entries(VEHICLE_BUY).flatMap(([type,price])=>{const v=state.vehicles[type];return v?.owned||!v&&state.flags['item_'+type]?[{id:'vehicle:'+type,name:VEHICLE_NAMES[type],kind:'vehicle' as const,valueCents:price*80,pledged:pledged.has('vehicle:'+type),isHome:false}]:[];});
  return [...properties,...vehicles];
}
export function takeStockLoan(state:GameState,amount:number,ids:string[]):StockResult {
  const access=stockAccess(state);if(!access.ok)return access;
  const m=ensureStockMarket(state);
  if(m.loan||m.gapDebts.length)return failure('请先结清现有金融欠款');
  if(m.positions.some(p=>p.kind!=='spot')||m.orders.some(o=>o.side==='long'||o.side==='short'))return failure('请先平掉保证金仓位并撤销开仓委托，贷款与杠杆不能叠加');
  if(!Number.isSafeInteger(amount)||amount<=0||amount>MAX_STOCK_CENTS)return failure('借款金额无效');
  const assets=stockCollateral(state),selected=ids.map(id=>assets.find(a=>a.id===id));
  if(!ids.length||new Set(ids).size!==ids.length||selected.some(a=>!a||a.pledged))return failure('抵押物无效或重复');
  const maximum=Math.floor(selected.reduce((n,a)=>n+a!.valueCents,0)*.6);
  if(amount>maximum)return failure('借款不能超过评估总额的60%（'+money(maximum)+'）');
  if(m.cashCents+amount>MAX_STOCK_CENTS)return failure('账户金额超过上限');
  normalizeOwnedProperties(state);
  const now=stockMinute(state);m.loan={id:nextId(m,'loan'),principalCents:amount,interestCents:0,interestRemainder:0,openedMinute:now,dueMinute:now+STOCK_TERM,deadlineMinute:now+STOCK_TERM+STOCK_GRACE,collateralIds:[...ids],maturityProcessed:false};m.cashCents+=amount;
  notice(state,'抵押借款到账 '+money(amount)+'，30天后到期，可提前还款。');return success('借款已转入证券账户');
}
function payDebt(value:StockInterest&{principalCents:number},budget:number):{paid:number;interest:number} {
  const interest=Math.min(budget,interestDue(value));budget-=interest;
  if(interest===interestDue(value)){value.interestCents=0;value.interestRemainder=0;}else value.interestCents-=interest;
  const principal=Math.min(budget,value.principalCents);value.principalCents-=principal;return {paid:interest+principal,interest};
}
function repayAvailable(state:GameState,requested:number):number {
  const m=ensureStockMarket(state),available=stockFreeCash(m)+Math.max(0,cents(state.player.money));
  let budget=Math.min(requested,available,stockDebtTotal(m)),paid=0,interest=0;
  const debts=[...m.gapDebts,...(m.loan?[m.loan]:[])].sort((a,b)=>a.deadlineMinute-b.deadlineMinute);
  for(const debt of debts){const result=payDebt(debt,budget);budget-=result.paid;paid+=result.paid;interest+=result.interest;if(budget<=0)break;}
  const fromAccount=Math.min(paid,stockFreeCash(m));m.cashCents-=fromAccount;state.player.money=Math.round((state.player.money-(paid-fromAccount)/100)*100)/100;
  m.gapDebts=m.gapDebts.filter(d=>d.principalCents+interestDue(d)>0);
  if(m.loan&&m.loan.principalCents+interestDue(m.loan)===0)m.loan=null;
  m.interestPaidCents+=interest;if(interest)recordMoney(state,-interest/100);
  return paid;
}
export function repayStockDebt(state:GameState,amount:number):StockResult {
  const access=stockAccess(state,true);if(!access.ok)return access;
  if(!Number.isSafeInteger(amount)||amount<=0)return failure('请输入有效还款金额');
  const m=ensureStockMarket(state);if(!stockDebtTotal(m))return failure('没有待还金融欠款');
  const paid=repayAvailable(state,amount);return paid?success('已还款 '+money(paid)):failure('没有可用于还款的现金');
}
function disposeCollateral(state:GameState,asset:StockCollateral):void {
  const m=ensureStockMarket(state),wasLocation=residenceLocationId(state);
  if(asset.kind==='vehicle'){const type=asset.id.slice(8);delete state.vehicles[type];delete state.flags['item_'+type];}
  else{
    const id=asset.id.slice(9);state.living.properties=ownedProperties(state).filter(p=>p.id!==id);
    const remaining=bestOwnedProperty(state.living.properties);
    if(remaining){if(state.living.activePropertyId===id||!state.living.activePropertyId){state.living.activePropertyId=remaining.id;state.living.ownedId=remaining.housingId;}}
    else{
      delete state.living.ownedId;delete state.living.activePropertyId;delete state.flags.owned_property;
      if(state.living.mode==='own'){state.living.mode=state.living.lease?'lease':'nightly';if(!state.living.lease)state.living.nightly={lodgingId:'atm'};}
    }
    if(state.locationId===wasLocation&&wasLocation!==residenceLocationId(state)){
      state.locationId='map';state.region='downtown_residential';state.area='downtown_residential';state.navStack=['map','downtown','downtown_residential'];
    }
  }
  m.cashCents+=asset.valueCents;notice(state,'已变卖 '+asset.name+'，所得 '+money(asset.valueCents)+' 用于偿债。','risk');
}
function deadlineOutstanding(m:StockMarketState,now:number):boolean { return !!m.loan&&m.loan.deadlineMinute<=now||m.gapDebts.some(d=>d.deadlineMinute<=now); }
function recoverDebt(state:GameState,now:number):void {
  const m=ensureStockMarket(state);m.orders=[];repayAvailable(state,MAX_STOCK_CENTS);
  if(!deadlineOutstanding(m,now))return;
  for(const p of [...m.positions]){closePosition(state,p,p.quantity,'逾期变现偿债');repayAvailable(state,MAX_STOCK_CENTS);if(!deadlineOutstanding(m,now))return;}
  for(const inv of [...state.economy.investments]){
    state.economy.investments=state.economy.investments.filter(i=>i.id!==inv.id);m.cashCents+=Math.max(0,cents(inv.value));
    recordMoney(state,(inv.value-inv.principal));notice(state,'已赎回历史理财 '+money(cents(inv.value))+' 用于偿债。');
    repayAvailable(state,MAX_STOCK_CENTS);if(!deadlineOutstanding(m,now))return;
  }
  const assets=stockCollateral(state).sort((a,b)=>Number(a.isHome)-Number(b.isHome)||Number(b.pledged)-Number(a.pledged)||a.valueCents-b.valueCents||a.id.localeCompare(b.id));
  for(const asset of assets){disposeCollateral(state,asset);repayAvailable(state,MAX_STOCK_CENTS);if(!deadlineOutstanding(m,now))return;}
  if(deadlineOutstanding(m,now)&&!state.endingId){
    state.flags.financial_default=true;state.endingId='ending_financial_default';if(!state.unlockedEndings.includes(state.endingId))state.unlockedEndings.push(state.endingId);
    notice(state,'宽限期结束，全部可偿债资产仍不足以清偿金融欠款。触发结局【杠杆尽头】。','risk');
  }
}
function accrueTo(m:StockMarketState,to:number):void {
  const from=m.lastProcessedMinute;if(to<=from)return;
  for(const p of m.positions)if(p.kind!=='spot')accrueStockInterest(p,p.financingCents,to-Math.max(from,p.openedMinute),600);
  if(m.loan){const d=m.loan,start=Math.max(from,d.openedMinute),normal=Math.max(0,Math.min(to,d.dueMinute)-start),late=Math.max(0,to-Math.max(start,d.dueMinute));accrueStockInterest(d,d.principalCents,normal,600);accrueStockInterest(d,d.principalCents,late,1200);}
  for(const d of m.gapDebts)accrueStockInterest(d,d.principalCents,to-Math.max(from,d.openedMinute),1200);
  m.lastProcessedMinute=to;
}
function updateQuotes(state:GameState,minute:number):void {
  const m=ensureStockMarket(state);let specialId:string|null=null,specialRate=0;
  if(m.dailyEvent.minute===minute&&!m.dailyEvent.rolled){
    m.dailyEvent.rolled=true;
    if(nextRandom(m.rng)<.05){const s=STOCKS[Math.floor(nextRandom(m.rng)*STOCKS.length)];specialId=s.id;specialRate=(nextRandom(m.rng)<.5?-1:1)*(s.limit+(s.eventLimit-s.limit)*nextRandom(m.rng));}
  }
  for(const s of STOCKS){
    const q=m.quotes[s.id],previous=q.priceCents;
    const u=Math.max(Number.EPSILON,nextRandom(m.rng)),v=nextRandom(m.rng);
    const normal=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*s.scale;
    const special=s.id===specialId,cap=special?s.eventLimit:s.limit,rate=special?specialRate:Math.max(-cap,Math.min(cap,normal));
    q.previousCents=previous;q.priceCents=Math.max(1,Math.max(Math.ceil(previous*(1-cap)-1e-8),Math.min(Math.floor(previous*(1+cap)+1e-8),Math.round(previous*(1+rate)))));
    q.change=q.priceCents/previous-1;q.event=special?(rate>=0?s.goodNews:s.badNews):null;
    if(q.event)notice(state,s.name+'：'+q.event,'event');
  }
  m.history.push({minute,prices:Object.fromEntries(STOCKS.map(s=>[s.id,m.quotes[s.id].priceCents]))});m.history=m.history.slice(-120);m.lastQuoteMinute=minute;m.nextQuoteMinute=minute+STOCK_INTERVAL;
  if(minute%STOCK_DAY===0){
    for(const q of Object.values(m.quotes))q.dayOpenCents=q.priceCents;
    const day=minute/STOCK_DAY;m.dailyEvent={day,minute:minute+([360,720,1080,1440][Math.floor(nextRandom(m.rng)*4)]),rolled:false};
  }
}
function executeProtection(state:GameState):void {
  const m=ensureStockMarket(state);
  for(const p of [...m.positions])if(p.kind!=='spot'&&stockPositionEquity(m,p)<=p.marginCents*.25){clearExits(m,p.id);closePosition(state,p,p.quantity,'保证金强制平仓');notice(state,STOCK_MAP[p.stockId].name+' 仓位达到强平线，已按最新报价平仓。','risk');}
  for(const p of [...m.positions])if(p.stopCents!==null&&(p.kind==='short'?m.quotes[p.stockId].priceCents>=p.stopCents:m.quotes[p.stockId].priceCents<=p.stopCents)){clearExits(m,p.id);closePosition(state,p,p.quantity,'止损触发');notice(state,STOCK_MAP[p.stockId].name+' 已按最新报价止损。');}
  const orders=[...m.orders].sort((a,b)=>Number(!(a.side==='sell'||a.side==='close'))-Number(!(b.side==='sell'||b.side==='close'))||a.createdMinute-b.createdMinute||Number(a.id.split('_').pop())-Number(b.id.split('_').pop()));
  for(const o of orders){if(!m.orders.some(v=>v.id===o.id)||!orderTriggered(m,o,o.limitCents))continue;m.orders=m.orders.filter(v=>v.id!==o.id);const result=executeOrder(state,o,'限价自动成交');notice(state,result.ok?result.reason:'委托已撤销：'+result.reason,result.ok?'info':'risk');}
}
export function nextStockBoundary(state:GameState,target:number):number {
  const m=ensureStockMarket(state),now=stockMinute(state);let next=Math.min(target,m.nextQuoteMinute);
  if(m.loan){if(!m.loan.maturityProcessed&&m.loan.dueMinute>now)next=Math.min(next,m.loan.dueMinute);if(m.loan.deadlineMinute>now)next=Math.min(next,m.loan.deadlineMinute);}
  for(const d of m.gapDebts)if(d.deadlineMinute>now)next=Math.min(next,d.deadlineMinute);
  return Math.max(now,next);
}
/** Called at each time boundary and final arrival. Repeated calls at the same minute are idempotent. */
export function processStockMarket(state:GameState):void {
  const m=ensureStockMarket(state),now=stockMinute(state);if(state.endingId==='ending_financial_default')return;
  accrueTo(m,now);
  if(m.nextQuoteMinute===now){
    updateQuotes(state,now);
    if(state.financialRisk?.stockObserved||m.positions.length||m.orders.length||m.trades.length)recordFinancialEvent(state,'stock');
  }
  applyFinancialSanctions(state);
  executeProtection(state);
  if(m.loan&&now>=m.loan.dueMinute&&!m.loan.maturityProcessed){m.loan.maturityProcessed=true;const paid=repayAvailable(state,MAX_STOCK_CENTS);if(m.loan)notice(state,'抵押贷款已到期，已自动还款 '+money(paid)+'。剩余欠款进入14天宽限期，年化12%。','risk');else notice(state,'抵押贷款已自动还清，抵押已解除。');}
  if(deadlineOutstanding(m,now))recoverDebt(state,now);
}
/** Reject damaged financial records instead of silently wiping positions/debt during import. */
export function normalizeStockMarket(state:GameState):void {
  let m=ensureStockMarket(state);
  if(m.cashCents===0&&!m.positions?.length&&!m.orders?.length&&!m.trades?.length&&!m.loan&&!m.gapDebts?.length&&(m.lastProcessedMinute>stockMinute(state)||m.nextQuoteMinute<stockMinute(state))){state.economy.stockMarket=createStockMarket(state);m=state.economy.stockMarket;}
  const minuteValid=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v);
  const integer=(v:unknown)=>minuteValid(v)&&(v as number)>=0;
  if(m.schema!==1||!integer(m.cashCents)||!integer(m.nextId)||m.nextId<1||!minuteValid(m.lastProcessedMinute)||!minuteValid(m.nextQuoteMinute)||m.nextQuoteMinute<=m.lastProcessedMinute||m.lastProcessedMinute>stockMinute(state))throw new Error('顺顺花账户或时间记录损坏');
  if(!Array.isArray(m.positions)||!Array.isArray(m.orders)||!Array.isArray(m.gapDebts)||!Array.isArray(m.history)||!Array.isArray(m.trades)||!Array.isArray(m.notices)||!Array.isArray(m.favorites))throw new Error('顺顺花持久记录损坏');
  if(!m.rng||!integer(m.rng.seed)||!integer(m.rng.calls)||!minuteValid(m.dailyEvent?.minute)||typeof m.dailyEvent.rolled!=='boolean')throw new Error('顺顺花行情游标损坏');
  for(const s of STOCKS){const q=m.quotes?.[s.id];if(!q||!integer(q.priceCents)||q.priceCents<1||!integer(q.previousCents)||q.previousCents<1||!integer(q.dayOpenCents)||q.dayOpenCents<1)throw new Error('顺顺花报价损坏');}
  const allIds=[...m.positions,...m.orders,...m.gapDebts,...(m.loan?[m.loan]:[])].map(v=>v.id);if(new Set(allIds).size!==allIds.length)throw new Error('顺顺花记录编号重复');
  const interestValid=(v:StockInterest)=>integer(v.interestCents)&&integer(v.interestRemainder)&&v.interestRemainder<5_184_000_000;
  for(const p of m.positions)if(!STOCK_MAP[p.stockId]||!['spot','long','short'].includes(p.kind)||!validPositionQuantity(p.quantity)||![p.costCents,p.marginCents,p.financingCents].every(integer)||!minuteValid(p.openedMinute)||!interestValid(p)||p.stopCents!==null&&(!integer(p.stopCents)||p.stopCents<1))throw new Error('顺顺花持仓记录损坏');
  for(const o of m.orders)if(!STOCK_MAP[o.stockId]||!validOrderQuantity(o.quantity,o.side)||!integer(o.reservedCents)||!integer(o.limitCents)||o.limitCents<1||!['buy','sell','long','short','close'].includes(o.side)||(o.side==='sell'||o.side==='close')&&!m.positions.some(p=>p.id===o.positionId&&p.stockId===o.stockId))throw new Error('顺顺花委托记录损坏');
  if(stockFreeCash(m)<0)throw new Error('顺顺花冻结资金超过账户余额');
  for(const d of [...m.gapDebts,...(m.loan?[m.loan]:[])])if(!integer(d.principalCents)||!minuteValid(d.openedMinute)||!minuteValid(d.deadlineMinute)||!interestValid(d))throw new Error('顺顺花债务记录损坏');
  if(m.loan&&(!minuteValid(m.loan.dueMinute)||!Array.isArray(m.loan.collateralIds)||new Set(m.loan.collateralIds).size!==m.loan.collateralIds.length||m.loan.deadlineMinute!==m.loan.dueMinute+STOCK_GRACE))throw new Error('顺顺花抵押记录损坏');
  m.history=m.history.slice(-120);m.trades=m.trades.slice(-240);m.notices=m.notices.slice(-60);
}
