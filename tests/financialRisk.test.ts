import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {configureFinancialRiskStorage,initializeFinancialRisk,recordFinancialEvent,reconcileFinancialLoad,financialRiskAccess,financialBanReason,financialAlertActive,applyFinancialSanctions,observeStockMarket,type FinancialRiskJournal} from '../src/game/core/financialRisk';
import {fromLinearDay,linearDay} from '../src/game/core/calendar';
import {drawContextualLoadingTips} from '../src/lib/loadingTips';
import {FINANCIAL_ALERT_TIPS,LOADING_TIPS} from '../src/game/data/loadingTips';
import {placeStockOrder,transferStockCash,repayStockDebt,processStockMarket} from '../src/game/core/stockMarket';
import {canUseDistrictLeisure,startDistrictLeisure,stepDistrictLeisure,settleDistrictLeisure,buyCasinoChips,enterCasinoRoom} from '../src/game/core/districtLeisure';
import {moveTo} from '../src/game/core/actions';
import {START_EPOCH} from '../src/game/core/calendar';
import {migrateSave} from '../src/game/core/migrate';
const copy=<T>(s:T):T=>JSON.parse(JSON.stringify(s));
let journals:Map<string,FinancialRiskJournal>,restore:()=>void,writeFails=false;
const make=(id='test-life')=>{const s=createInitialState(149728);s.mode='eternal';s.player.money=50000;s.locationId='commercial_exchange';s.time.hour=12;initializeFinancialRisk(s,id);return s;};
function rollbackThree(key:'casino'|'stock',start=make()){
  const saved=copy(start);let s=start;
  for(let i=0;i<3;i++){expect(recordFinancialEvent(s,key,-1000)).toBe(true);s=copy(saved);reconcileFinancialLoad(s);}
  return s;
}
beforeEach(()=>{journals=new Map();writeFails=false;restore=configureFinancialRiskStorage({read:id=>journals.get(id)??null,write:j=>{if(writeFails)return false;journals.set(j.lifeId,copy(j));return true;}});});
afterEach(()=>restore());
describe('本机金融回退记录与误报边界',()=>{
  it('赌场可用性查询为只读，实际开局仍刷新独立黑名单并拒绝旧状态下注',()=>{
    const s=make();Object.assign(s.time,{year:2026,month:8,day:1,hour:20,minute:0});s.locationId='boyue_texas_shop';
    const legacy=copy(s);delete legacy.financialRisk;const legacyBefore=copy(legacy);
    expect(canUseDistrictLeisure(legacy,'blackjack').ok).toBe(true);expect(legacy).toEqual(legacyBefore);expect(journals.size).toBe(0);
    expect(enterCasinoRoom(s,'leisure').ok).toBe(true);s.districtLeisure!.casinoChips=10000;
    const before=copy(s),journal=copy(journals.get('test-life'));
    for(let i=0;i<10;i++)expect(canUseDistrictLeisure(s,'blackjack').ok).toBe(true);
    expect(s).toEqual(before);expect(journals.get('test-life')).toEqual(journal);
    const banned=rollbackThree('casino',s);recordFinancialEvent(banned,'casino',1_100_000);applyFinancialSanctions(banned);
    const stale=copy(before);expect(canUseDistrictLeisure(stale,'blackjack').ok).toBe(true);
    expect(startDistrictLeisure(stale,'blackjack',{currency:'chips',bet:50}).ok).toBe(false);
    expect(stale.districtLeisure!.active).toBeNull();expect(stale.districtLeisure!.casinoChips).toBe(10000);expect(financialBanReason(stale,'casino')).not.toBeNull();
  });
  it('载入最新进度与反复查看同一旧档不累积成多次回退',()=>{
    const s=make(),old=copy(s);recordFinancialEvent(s,'stock');
    for(let i=0;i<10;i++)reconcileFinancialLoad(copy(s));
    expect(journals.get('test-life')!.stock.rollbacks).toHaveLength(0);
    for(let i=0;i<10;i++)reconcileFinancialLoad(copy(old));
    expect(journals.get('test-life')!.stock.rollbacks).toHaveLength(1);
    expect(financialBanReason(old,'stock')).toBeNull();
  });
  it('仅观察软件而未看到新行情或交易，不记金融回退',()=>{const s=make(),old=copy(s);observeStockMarket(s);reconcileFinancialLoad(old);expect(journals.get('test-life')!.stock.rollbacks).toHaveLength(0);});
  it('只有读档发生后的新金融活动才允许累计下一次证据',()=>{const s=rollbackThree('stock');expect(financialBanReason(s,'stock')).toContain('30');expect(journals.get('test-life')!.stock.caseId).toBeGreaterThan(0);});
  it('普通大额中奖不封禁；三次回退但未达到赌场收入门槛也不封禁',()=>{
    const fair=make('fair');recordFinancialEvent(fair,'casino',5_000_000);applyFinancialSanctions(fair);expect(financialAlertActive(fair)).toBe(false);
    const s=rollbackThree('casino');recordFinancialEvent(s,'casino',1_000_000);applyFinancialSanctions(s);expect(financialBanReason(s,'casino')).toBeNull();
    recordFinancialEvent(s,'casino',1);applyFinancialSanctions(s);expect(financialBanReason(s,'casino')).not.toBeNull();
  });
  it('赌场门槛只统计单日净收益，不将本金、流水或跨日收入拼成一万元',()=>{
    const s=rollbackThree('casino');recordFinancialEvent(s,'casino',600000);
    Object.assign(s.time,fromLinearDay(linearDay(s.time)+1));recordFinancialEvent(s,'casino',600000);
    expect(financialBanReason(s,'casino')).toBeNull();recordFinancialEvent(s,'casino',-500000);recordFinancialEvent(s,'casino',500001);expect(financialBanReason(s,'casino')).toBeNull();
  });
  it('追缴当前分支的赌场收益，工资不计入；反复应用不重复扣钱',()=>{
    const s=rollbackThree('casino');s.player.money+=7000;recordFinancialEvent(s,'casino',1_100_000);s.player.money+=11000;
    applyFinancialSanctions(s);expect(s.player.money).toBe(57000);expect(s.financialRisk!.casinoSeizedCents).toBe(1_100_000);
    applyFinancialSanctions(s);reconcileFinancialLoad(s);expect(s.player.money).toBe(57000);
  });
  it('先收筹码，再追缴已兑换或转移的所得，资金不足保留负余额',()=>{
    const s=rollbackThree('casino');s.player.money=100;s.districtLeisure!.casinoChips=10000;recordFinancialEvent(s,'casino',1_100_000);applyFinancialSanctions(s);
    expect(s.districtLeisure!.casinoChips).toBe(0);expect(s.player.money).toBe(-8900);
    expect(migrateSave(s).player.money).toBe(-8900);
  });
  it('回退到中奖前的旧档不扣合法现金；再读中奖档仍会追缴',()=>{
    let s=make();const old=copy(s);recordFinancialEvent(s,'casino',1_100_000);s.player.money+=11000;const winning=copy(s);
    for(let i=0;i<3;i++){if(i)recordFinancialEvent(s,'casino');s=copy(old);reconcileFinancialLoad(s);}
    expect(financialBanReason(s,'casino')).not.toBeNull();expect(s.player.money).toBe(50000);
    reconcileFinancialLoad(winning);expect(winning.player.money).toBe(50000);expect(winning.financialRisk!.casinoSeizedCents).toBe(1_100_000);
    reconcileFinancialLoad(winning);expect(winning.player.money).toBe(50000);
  });
  it('封禁独立于普通存档与内存，旧日期无法缩短30天期限，新人生不受影响',()=>{
    const s=rollbackThree('stock'),bannedDay=s.financialRisk!.stock.banUntilDay;
    restore();restore=configureFinancialRiskStorage({read:id=>journals.get(id)??null,write:j=>{journals.set(j.lifeId,copy(j));return true;}});
    const old=make();reconcileFinancialLoad(old);expect(old.financialRisk!.stock.banUntilDay).toBe(bannedDay);
    expect(financialAlertActive(make('new-life'))).toBe(false);
    Object.assign(old.time,fromLinearDay(linearDay(old.time)+30));expect(financialRiskAccess(old,'stock').ok).toBe(true);expect(financialAlertActive(old)).toBe(false);
    const back=make();reconcileFinancialLoad(back);expect(financialAlertActive(back)).toBe(false);
  });
  it('再次违规按新案件追缴，不将解禁后的正常收入当成上次作弊所得',()=>{
    let s=rollbackThree('casino');recordFinancialEvent(s,'casino',1_100_000);s.player.money+=11000;applyFinancialSanctions(s);expect(s.player.money).toBe(50000);
    Object.assign(s.time,fromLinearDay(linearDay(s.time)+30));expect(financialRiskAccess(s,'casino').ok).toBe(true);
    recordFinancialEvent(s,'casino',500000);s.player.money+=5000;applyFinancialSanctions(s);expect(s.player.money).toBe(55000);
    s=rollbackThree('casino',s);recordFinancialEvent(s,'casino',1_200_000);s.player.money+=12000;applyFinancialSanctions(s);
    expect(s.player.money).toBe(55000);expect(s.financialRisk!.casinoClaims).toHaveLength(2);expect(s.financialRisk!.casinoSeizedCents).toBe(2_300_000);
    applyFinancialSanctions(s);expect(s.player.money).toBe(55000);
  });
  it('30天之前的回退不与新证据叠加',()=>{
    let s=make(),old=copy(s);for(let i=0;i<2;i++){recordFinancialEvent(s,'stock');s=copy(old);reconcileFinancialLoad(s);}
    Object.assign(s.time,fromLinearDay(linearDay(s.time)+31));old=copy(s);recordFinancialEvent(s,'stock');s=copy(old);reconcileFinancialLoad(s);expect(financialBanReason(s,'stock')).toBeNull();
  });
  it('导入较新的合法金融游标后继续单调递增，不回退审计进度',()=>{
    const s=make();recordFinancialEvent(s,'stock');s.financialRisk!.stock.cursor=100;reconcileFinancialLoad(s);recordFinancialEvent(s,'stock');expect(s.financialRisk!.stock.cursor).toBe(101);
  });
  it('存储不可用时不下注、不交易、不扣款；恢复存储后可以继续',()=>{
    const s=make();writeFails=true;const cash=s.player.money,market=copy(s.economy.stockMarket);
    expect(transferStockCash(s,10000,'in').ok).toBe(false);expect(placeStockOrder(s,{stockId:'SS001',side:'buy',quantity:1}).ok).toBe(false);
    expect(s.player.money).toBe(cash);expect(s.economy.stockMarket).toEqual(market);
    s.locationId='boyue_texas_shop';expect(buyCasinoChips(s,100).ok).toBe(false);expect(s.player.money).toBe(cash);
    writeFails=false;s.locationId='commercial_exchange';expect(transferStockCash(s,10000,'in').ok).toBe(true);
  });
});
describe('风控在真实游戏入口生效',()=>{
  it('路线和收入试算的副本不写审计，只有真实状态能够提交金融事件',()=>{
    const s=make();restore();restore=configureFinancialRiskStorage({accepts:value=>value===s,read:id=>journals.get(id)??null,write:j=>{journals.set(j.lifeId,copy(j));return true;}});
    observeStockMarket(s);const before=JSON.stringify([...journals]);const preview=copy(s);recordFinancialEvent(preview,'stock');expect(JSON.stringify([...journals])).toBe(before);expect(preview.financialRisk!.stock.cursor).toBe(0);
    recordFinancialEvent(s,'stock');expect(s.financialRisk!.stock.cursor).toBe(1);
  });
  it('赌场黑名单阻止地图进入、换筹码与新下注',()=>{
    const s=rollbackThree('casino');recordFinancialEvent(s,'casino',1_100_000);applyFinancialSanctions(s);
    s.locationId='map';expect(moveTo(s,'boyue_texas_shop').ok).toBe(false);
    s.locationId='boyue_texas_shop';expect(buyCasinoChips(s,100).ok).toBe(false);expect(startDistrictLeisure(s,'blackjack').ok).toBe(false);
  });
  it('证券封禁冻结下单和转账，保留持仓负债、还款与保护性结算',()=>{
    const s=rollbackThree('stock'),m=s.economy.stockMarket!;
    m.cashCents=100000;m.gapDebts=[{id:'gap',principalCents:5000,interestCents:0,interestRemainder:0,openedMinute:m.lastProcessedMinute,deadlineMinute:m.lastProcessedMinute+20000}];
    expect(placeStockOrder(s,{stockId:'SS001',side:'buy',quantity:1}).ok).toBe(false);expect(transferStockCash(s,100,'out').ok).toBe(false);
    expect(repayStockDebt(s,5000).ok).toBe(true);expect(m.gapDebts).toHaveLength(0);expect(m.cashCents).toBe(95000);
  });
  it('观察后看到新行情会记录金融进度，重复结算同一分钟不新增记录',()=>{
    const s=make();observeStockMarket(s);const next=s.economy.stockMarket!.nextQuoteMinute;
    Object.assign(s.time,fromLinearDay(START_EPOCH+Math.floor(next/1440)),{hour:Math.floor(next%1440/60),minute:next%60});processStockMarket(s);
    const cursor=s.financialRisk!.stock.cursor;expect(cursor).toBeGreaterThan(0);processStockMarket(s);expect(s.financialRisk!.stock.cursor).toBe(cursor);
  });
  it('实际下注、揭牌和结算都有独立进度，重复结算不给钱也不添证据',()=>{
    const s=make();Object.assign(s.time,{year:2026,month:8,day:1,hour:20,minute:0});s.locationId='boyue_texas_shop';s.districtLeisure!.casinoChips=10000;s.districtLeisure!.casinoRoom='leisure';
    expect(startDistrictLeisure(s,'roulette_number',{currency:'chips',room:'leisure',bet:50,choice:0}).ok).toBe(true);
    const id=s.districtLeisure!.active!.id;expect(stepDistrictLeisure(s,id,{type:'reveal'}).ok).toBe(true);expect(settleDistrictLeisure(s,id).ok).toBe(true);
    const cursor=s.financialRisk!.casino.cursor,after=copy(s.districtLeisure);expect(cursor).toBe(3);expect(settleDistrictLeisure(s,id).ok).toBe(false);expect(s.financialRisk!.casino.cursor).toBe(cursor);expect(s.districtLeisure).toEqual(after);
  });
  it('封禁期间加载与纸条共用警示池，到期恢复普通提示',()=>{
    const s=rollbackThree('stock');for(let i=0;i<10;i++)expect(drawContextualLoadingTips(s).every(t=>(FINANCIAL_ALERT_TIPS as readonly string[]).includes(t))).toBe(true);
    Object.assign(s.time,fromLinearDay(linearDay(s.time)+30));expect(drawContextualLoadingTips(s).every(t=>(LOADING_TIPS as readonly string[]).includes(t))).toBe(true);
  });
});
