import type {GameState} from '../types';
import {gameDay} from './calendar';
import {pushLog} from '../engine';
import {recordMoney} from './weekly';

export type FinancialChannel='casino'|'stock';
interface Stamp {cursor:number;banUntilDay:number;caseId:number}
interface CasinoClaim {caseId:number;baseNetCents:number;amountCents:number;bannedHead:number}
export interface FinancialRiskState {
  schema:1;lifeId:string;casino:Stamp;stock:Stamp;clockDay:number;
  casinoNetCents:number;casinoDay:number;casinoDayNetCents:number;casinoSeizedCents:number;
  claimCents:number;claimBaseNetCents:number;stockObserved:boolean;
  notifiedCasino:number;notifiedStock:number;storageBlocked?:boolean;
  casinoClaims?:CasinoClaim[];casinoSeizedByCase?:Record<string,number>;
}
interface ChannelJournal {
  head:number;lastRollbackHead:number;rollbacks:number[];reviewBaseNetCents?:number;
  banUntilDay:number;caseId:number;bannedHead:number;
}
export interface FinancialRiskJournal {
  schema:1;lifeId:string;clockDay:number;nextCase:number;casino:ChannelJournal;stock:ChannelJournal;
  dailyPeaks:Record<string,number>;stockObserved:boolean;claimCents:number;claimBaseNetCents?:number;
  casinoClaims?:CasinoClaim[];
}
/** Runtime persistence is injected by the browser shell; game rules never access storage. */
export interface FinancialRiskStorage {read:(lifeId:string)=>FinancialRiskJournal|null;write:(journal:FinancialRiskJournal)=>boolean;accepts?:(state:GameState)=>boolean}
let storage:FinancialRiskStorage|undefined;
export function configureFinancialRiskStorage(next:FinancialRiskStorage|undefined){const old=storage;storage=next;return()=>{storage=old;};}
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
function claims(value:{casinoClaims?:CasinoClaim[];claimCents:number;claimBaseNetCents?:number;casino:Stamp|ChannelJournal}):CasinoClaim[]{
  const list=value.casinoClaims??(value.casino.caseId?[{caseId:value.casino.caseId,baseNetCents:value.claimBaseNetCents??0,amountCents:value.claimCents,bannedHead:'head'in value.casino?value.casino.bannedHead:value.casino.cursor}]:[]);
  if(!Array.isArray(list)||!list.every(c=>c&&['caseId','baseNetCents','amountCents','bannedHead'].every(k=>Number.isSafeInteger(c[k as keyof CasinoClaim]))&&c.caseId>0&&c.amountCents>=0&&c.bannedHead>=0)||new Set(list.map(c=>c.caseId)).size!==list.length)throw Error('金融追缴记录损坏');
  return clone(list);
}
const audited=(state:GameState)=>!storage?.accepts||storage.accepts(state);
const stamp=():Stamp=>({cursor:0,banUntilDay:0,caseId:0});
const channel=():ChannelJournal=>({...stamp(),head:0,lastRollbackHead:0,rollbacks:[],bannedHead:0});
const unavailable='金融风控记录暂时无法可靠保存，赌场下注与证券交易已暂停。其他生活操作和还款不受影响，请检查本地存储后重试。';
export const FINANCIAL_ROLLBACK_LIMIT=3;
export const FINANCIAL_BAN_DAYS=30;
export const CASINO_REVIEW_CENTS=1_000_000;

export function initializeFinancialRisk(state:GameState,lifeId=`legacy-${state.rng.seed}`):FinancialRiskState {
  return state.financialRisk??= {schema:1,lifeId,casino:stamp(),stock:stamp(),clockDay:gameDay(state.time),casinoNetCents:0,casinoDay:gameDay(state.time),casinoDayNetCents:0,casinoSeizedCents:0,claimCents:0,claimBaseNetCents:0,stockObserved:false,notifiedCasino:0,notifiedStock:0};
}
export function normalizeFinancialRisk(state:GameState):void {
  const r=state.financialRisk;if(!r)return;
  if(r.schema!==1||typeof r.lifeId!=='string'||!r.lifeId||r.lifeId.length>120)throw Error('金融风控身份记录损坏');
  for(const name of ['casino','stock'] as const)if(!r[name]||!['cursor','banUntilDay','caseId'].every(key=>Number.isSafeInteger(r[name][key as keyof Stamp])&&r[name][key as keyof Stamp]>=0))throw Error('金融风控进度损坏');
  for(const name of ['clockDay','casinoNetCents','casinoDay','casinoDayNetCents','casinoSeizedCents','claimCents','claimBaseNetCents','notifiedCasino','notifiedStock'] as const)if(!Number.isSafeInteger(r[name]))throw Error('金融风控账目损坏');
  if(r.casinoSeizedCents<0||r.claimCents<0||typeof r.stockObserved!=='boolean')throw Error('金融风控账目损坏');
  r.casinoClaims=claims(r);r.casinoSeizedByCase??=r.casinoSeizedCents&&r.casino.caseId?{[r.casino.caseId]:r.casinoSeizedCents}:{};
  if(!Object.values(r.casinoSeizedByCase).every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('金融追缴记录损坏');
}
function readJournal(r:FinancialRiskState):FinancialRiskJournal {
  const loaded=storage?.read(r.lifeId);
  if(loaded){
    if(loaded.schema!==1||loaded.lifeId!==r.lifeId||!loaded.casino||!loaded.stock||!loaded.dailyPeaks||!['clockDay','nextCase','claimCents'].every(key=>Number.isSafeInteger(loaded[key as keyof FinancialRiskJournal]))||!Object.values(loaded.dailyPeaks).every(value=>Number.isSafeInteger(value)&&value>=0))throw Error('Invalid financial journal');
    const result=clone(loaded);
    for(const name of ['casino','stock'] as const){const c=result[name];if(!Array.isArray(c.rollbacks)||!c.rollbacks.every(Number.isSafeInteger)||!['head','lastRollbackHead','banUntilDay','caseId','bannedHead'].every(key=>Number.isSafeInteger(c[key as keyof ChannelJournal])&&(c[key as keyof ChannelJournal] as number)>=0))throw Error('Invalid financial cursor');
      c.head=Math.max(c.head,r[name].cursor);c.banUntilDay=Math.max(c.banUntilDay,r[name].banUntilDay);c.caseId=Math.max(c.caseId,r[name].caseId);
    }
    result.clockDay=Math.max(result.clockDay,r.clockDay);result.nextCase=Math.max(result.nextCase,result.casino.caseId+1,result.stock.caseId+1);
    if(r.claimCents>result.claimCents){result.claimCents=r.claimCents;result.claimBaseNetCents=r.claimBaseNetCents;}
    result.casinoClaims=claims(result);for(const claim of claims(r)){const previous=result.casinoClaims.find(c=>c.caseId===claim.caseId);if(previous)previous.amountCents=Math.max(previous.amountCents,claim.amountCents);else result.casinoClaims.push(claim);}
    return result;
  }
  return {schema:1,lifeId:r.lifeId,clockDay:r.clockDay,nextCase:Math.max(r.casino.caseId,r.stock.caseId)+1,casino:{...channel(),...r.casino,head:r.casino.cursor},stock:{...channel(),...r.stock,head:r.stock.cursor},dailyPeaks:{},stockObserved:r.stockObserved,claimCents:r.claimCents,claimBaseNetCents:r.claimCents?r.claimBaseNetCents:undefined,casinoClaims:claims(r)};
}
function clock(j:FinancialRiskJournal,state:GameState){
  j.clockDay=Math.max(j.clockDay,gameDay(state.time));
  for(const key of ['casino','stock'] as const)j[key].rollbacks=j[key].rollbacks.filter(day=>day>=j.clockDay-29);
  for(const day of Object.keys(j.dailyPeaks))if(Number(day)<j.clockDay-29)delete j.dailyPeaks[day];
}
function review(j:FinancialRiskJournal,r:FinancialRiskState){
  for(const key of ['casino','stock'] as const){
    const c=j[key];if(c.banUntilDay>j.clockDay||c.rollbacks.length<FINANCIAL_ROLLBACK_LIMIT)continue;
    if(key==='casino'&&!Object.values(j.dailyPeaks).some(value=>value>CASINO_REVIEW_CENTS))continue;
    c.banUntilDay=j.clockDay+FINANCIAL_BAN_DAYS;c.caseId=j.nextCase++;c.bannedHead=c.head;c.rollbacks=[];
    if(key==='casino'){
      const base=c.reviewBaseNetCents??r.casinoNetCents;
      (j.casinoClaims??=[]).push({caseId:c.caseId,baseNetCents:base,amountCents:Math.max(0,r.casinoNetCents-base),bannedHead:c.head});
    }
    delete c.reviewBaseNetCents;
  }
  // A profitable pre-sanction slot must not restore confiscated winnings later.
  for(const claim of j.casinoClaims??[])if(r.casino.cursor<=claim.bannedHead)claim.amountCents=Math.max(claim.amountCents,Math.max(0,r.casinoNetCents-claim.baseNetCents));
  j.claimCents=(j.casinoClaims??[]).reduce((total,c)=>total+c.amountCents,0);j.claimBaseNetCents=j.casinoClaims?.[0]?.baseNetCents;
}
function merge(r:FinancialRiskState,j:FinancialRiskJournal){
  r.clockDay=j.clockDay;r.stockObserved||=j.stockObserved;
  for(const key of ['casino','stock'] as const){r[key].banUntilDay=j[key].banUntilDay;r[key].caseId=j[key].caseId;}
  r.claimCents=j.claimCents;r.claimBaseNetCents=j.claimBaseNetCents??0;r.storageBlocked=false;
  r.casinoClaims=clone(j.casinoClaims??[]);
}
export function financialBanReason(state:GameState,key:FinancialChannel):string|null {
  const r=state.financialRisk;if(!r)return null;
  const remaining=r[key].banUntilDay-Math.max(gameDay(state.time),r.clockDay);
  return remaining>0?(key==='casino'?`赌场风控黑名单：因多次回退金融进度，禁止进入赌场，还剩 ${remaining} 个游戏日。`:`顺顺花账户风控封禁：因多次回退金融进度，交易与资金转移冻结，还剩 ${remaining} 个游戏日；仍可查看账户、撤单、设置止损和偿还欠款。`):null;
}
export function financialAlertActive(state:GameState):boolean {return !!financialBanReason(state,'casino')||!!financialBanReason(state,'stock');}
/** Apply a persistent claim only to casino net gains present in this particular branch. */
export function applyFinancialSanctions(state:GameState,force=false):void {
  if(!force&&!audited(state))return;
  const r=state.financialRisk;if(!r)return;
  const seized=r.casinoSeizedByCase??={};let owing=0;
  for(const claim of claims(r)){const target=Math.min(claim.amountCents,Math.max(0,r.casinoNetCents-claim.baseNetCents)),due=Math.max(0,target-(seized[claim.caseId]??0));owing+=due;if(due)seized[claim.caseId]=(seized[claim.caseId]??0)+due;}
  if(owing){
    const chips=state.districtLeisure?.casinoChips??0,take=Math.min(chips,Math.floor(owing/20));
    if(state.districtLeisure)state.districtLeisure.casinoChips=chips-take;
    const cash=owing-take*20;state.player.money=Math.round(state.player.money*100-cash)/100;r.casinoSeizedCents+=owing;
    recordMoney(state,-owing/100);pushLog(state,'⚖️',`赌场风控追缴读档获利 ¥${(owing/100).toFixed(2)}，先收回筹码，再扣个人现金；现金不足的部分保留为负余额。`);
  }
  if(financialBanReason(state,'casino')){
    const active=state.districtLeisure?.active;
    if(active?.locationId==='boyue_texas_shop'){
      if(active.currency==='chips')state.districtLeisure!.casinoChips=(state.districtLeisure!.casinoChips??0)+active.paid;
      else state.player.money+=active.paid;
      state.districtLeisure!.active=null;
    }
    if(state.districtLeisure)delete state.districtLeisure.casinoRoom;
    if(state.locationId==='boyue_texas_shop')state.locationId='map';
    if(r.notifiedCasino!==r.casino.caseId){pushLog(state,'⚖️',financialBanReason(state,'casino')!);r.notifiedCasino=r.casino.caseId;}
  }
  if(financialBanReason(state,'stock')){
    if(state.economy.stockMarket)state.economy.stockMarket.orders=[];
    if(r.notifiedStock!==r.stock.caseId){pushLog(state,'⚖️',financialBanReason(state,'stock')!);r.notifiedStock=r.stock.caseId;}
  }
}
/** Called only when entering a save, never by save lists, previews, export or validation. */
export function reconcileFinancialLoad(state:GameState):void {
  if(!storage)return;const r=initializeFinancialRisk(state);
  try{
    const j=readJournal(r);clock(j,state);
    for(const key of ['casino','stock'] as const){const c=j[key];
      if(c.banUntilDay>j.clockDay||r[key].cursor>=c.head||c.lastRollbackHead===c.head)continue;
      c.rollbacks.push(j.clockDay);c.lastRollbackHead=c.head;
      if(key==='casino')c.reviewBaseNetCents??=r.casinoNetCents;
    }
    review(j,r);if(!storage.write(j))throw Error('Financial journal write failed');merge(r,j);applyFinancialSanctions(state,true);
  }catch{r.storageBlocked=true;pushLog(state,'⚠️',unavailable);}
}
export function financialRiskAccess(state:GameState,key:FinancialChannel):{ok:boolean;reason:string} {
  if(storage&&audited(state)){const r=initializeFinancialRisk(state);try{const j=readJournal(r);clock(j,state);review(j,r);if(!storage.write(j))throw Error('Financial journal write failed');merge(r,j);applyFinancialSanctions(state);}catch{r.storageBlocked=true;return{ok:false,reason:unavailable};}}
  const reason=financialBanReason(state,key);return reason?{ok:false,reason}:{ok:true,reason:''};
}
/** Durable cursor is reserved before a bet or trade can mutate balances. */
export function recordFinancialEvent(state:GameState,key:FinancialChannel,netCents=0):boolean {
  if(!storage||!audited(state))return true;const r=initializeFinancialRisk(state);
  try{
    const next=clone(r),j=readJournal(r);clock(j,state);next[key].cursor=++j[key].head;
    if(key==='stock'){j.stockObserved=true;next.stockObserved=true;}
    if(key==='casino'){
      if(next.casinoDay!==gameDay(state.time)){next.casinoDay=gameDay(state.time);next.casinoDayNetCents=0;}
      next.casinoNetCents+=netCents;next.casinoDayNetCents+=netCents;
      j.dailyPeaks[String(next.casinoDay)]=Math.max(j.dailyPeaks[String(next.casinoDay)]??0,next.casinoDayNetCents);
    }
    review(j,next);if(!storage.write(j))throw Error('Financial journal write failed');merge(next,j);state.financialRisk=next;return true;
  }catch{r.storageBlocked=true;return false;}
}
export function observeStockMarket(state:GameState):void {
  if(!storage||!audited(state))return;const r=initializeFinancialRisk(state);try{const j=readJournal(r);clock(j,state);j.stockObserved=true;if(!storage.write(j))throw Error('Financial journal write failed');merge(r,j);}catch{r.storageBlocked=true;}
}
export function financialStorageProblem(){return unavailable;}
