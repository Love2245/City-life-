import type {GameState} from '../types';
import {recordCompanyAccounting} from './companyAccounting';
import {pushLog} from '../engine';

export const COMPANY_WITHDRAWAL_TAX_PERCENT=20;
export function companyPayoutQuote(grossCents:number){
  const taxCents=Math.ceil(grossCents*COMPANY_WITHDRAWAL_TAX_PERCENT/100);
  return{grossCents,taxCents,netCents:grossCents-taxCents};
}
/** All company-to-person distributions share this withholding path, including closure refunds. */
export function payCompanyOwner(s:GameState,grossCents:number,label='个人提现'){
  const c=s.company!;
  if(!Number.isSafeInteger(grossCents)||grossCents<0||grossCents>c.balanceCents)throw new Error('公司转出金额无效');
  const q=companyPayoutQuote(grossCents);if(!grossCents)return q;
  c.balanceCents-=q.grossCents;
  s.player.money=(Math.round(s.player.money*100)+q.netCents)/100;
  c.spentCents+=q.taxCents;recordCompanyAccounting(c,'other_cost',q.taxCents);recordCompanyAccounting(c,'owner_out',q.netCents);
  const text=`${label}：公司转出 ${(q.grossCents/100).toFixed(2)} 元，先扣20%税款 ${(q.taxCents/100).toFixed(2)} 元，个人到账 ${(q.netCents/100).toFixed(2)} 元`;
  c.ledger.push({minute:c.cursor,kind:'withdrawal_tax',amountCents:-q.taxCents,text:`提现税款 ${(q.taxCents/100).toFixed(2)} 元（20%）`},{minute:c.cursor,kind:'owner_withdraw',amountCents:-q.netCents,text});
  if(c.ledger.length>200)c.ledger.splice(0,c.ledger.length-200);pushLog(s,'🏢',text);return q;
}
