/** 金额统一保留到分，界面预估与正式工资使用同一组纯函数。 */
export function dispatchMoney(value){return Math.round((Number.isFinite(value)?Math.max(0,value):0)*100)/100;}
/** @returns {import('../../game/types').DeliveryPayTerms} */
export function dispatchPayTerms(referenceIncome,referenceOrders){
 const reference=dispatchMoney(referenceIncome),orders=Math.max(1,Math.floor(referenceOrders));
 const base=Math.min(reference,Math.min(50,Math.round(reference*.2)));
 return{version:1,base,unitRate:dispatchMoney((reference-base)/orders),referenceOrders:orders,referenceIncome:reference};
}
/** @param {unknown} value @returns {value is import('../../game/types').DeliveryPayTerms} */
export function validDispatchPay(value){return !!value&&typeof value==='object'&&value.version===1&&[value.base,value.unitRate,value.referenceOrders,value.referenceIncome].every(v=>Number.isFinite(v)&&v>=0)&&value.referenceOrders>=1;}
/** @param {import('../../game/types').DeliveryPayTerms} terms */
export function dispatchQuote(terms,distance){return dispatchMoney(terms.unitRate*Math.min(1.55,.7+Math.max(0,distance)/3000));}
/** @param {import('../../game/types').DeliveryPayTerms} terms */
export function dispatchWage(terms,delivered,earnedFare,completedShift=true){
 const valid=Number.isFinite(earnedFare)&&earnedFare>=0,commission=dispatchMoney(earnedFare);
 const base=valid&&delivered>0&&completedShift?terms.base:0;
 return{base,commission,total:dispatchMoney(base+commission)};
}
