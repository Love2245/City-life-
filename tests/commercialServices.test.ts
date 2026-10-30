import {describe,expect,it} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {canPerform,getAction,getLocation,isLocationVisible,moveTo,performAction,performShoppingCart,visibleActionsAtLocation} from '../src/game/core/actions';
import {buyProperty,canSleepHere,selectLodging,signLease} from '../src/game/core/housing';
import {currentResidence,isResidenceLocation,residenceRegion} from '../src/game/core/residence';
import {currentHomeSceneId,formalHomeId,homeSceneObjectItem,canCustomizeCurrentHome} from '../src/game/core/homeInterior';
import {migrateSave} from '../src/game/core/migrate';
import {stockCollateral,stockAccess} from '../src/game/core/stockMarket';
import {localJobsOf} from '../src/game/core/jobs';
import {getMiniGameConfig} from '../src/game/core/minigame';
import {itemCount} from '../src/game/core/items';

function visitor(locationId='municipal_hall') {
  const s=createInitialState(14952);s.region='downtown_commercial';s.area='downtown_center';s.navStack=['map','downtown','downtown_center','downtown_commercial'];s.locationId=locationId;s.time.hour=12;s.time.minute=0;s.player.money=1000;return s;
}
describe('商业区实际服务',()=>{
  it('学生通行证免费、一次办理，持证后可进入两处校园，读档保留',()=>{
    const s=visitor(),money=s.player.money,a=getAction('municipal_apply_student_pass')!;
    expect(canPerform(s,a).ok).toBe(true);expect(performAction(s,a.id).ok).toBe(true);
    expect(s.player.money).toBe(money);expect(s.time.hour).toBe(12);expect(s.time.minute).toBe(30);expect(s.flags.item_student_pass).toBe(true);
    expect(canPerform(s,a).ok).toBe(false);const before=JSON.stringify(s);expect(performAction(s,a.id).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
    const loaded=migrateSave(JSON.parse(JSON.stringify(s)));expect(loaded.flags.item_student_pass).toBe(true);
    for(const id of ['dev_university','boyue_engineering_college']){const fresh=visitor();expect(moveTo(fresh,id).ok).toBe(false);expect(moveTo(loaded,id).ok).toBe(true);}
  });
  it('工业证沿用两次完班、80元和原路线，异地、钱不够或重复办理原子失败',()=>{
    const a=getAction('municipal_apply_industry_pass')!;expect(a.requirements?.money).toBe(80);expect(a.effects.flags?.route_heavy_industry).toBe(true);
    for(const setup of [(s:ReturnType<typeof visitor>)=>s.flags.jobs_done_count=1,(s:ReturnType<typeof visitor>)=>s.player.money=79,(s:ReturnType<typeof visitor>)=>s.locationId='commercial_office']){
      const s=visitor();s.flags.jobs_done_count=2;setup(s);const before=JSON.stringify(s);expect(performAction(s,a.id).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
    }
    const s=visitor();s.flags.jobs_done_count=2;const money=s.player.money;expect(performAction(s,a.id).ok).toBe(true);expect(s.player.money).toBe(money-80);expect(s.flags.route_heavy_industry).toBe(true);expect(s.time.hour).toBe(13);expect(canPerform(s,getAction('apply_industry_pass')!).ok).toBe(false);
  });
  it('市政下班不能办证，独立便利店可打包购物并拒绝其他门店商品',()=>{
    const closed=visitor();closed.time.hour=18;expect(performAction(closed,'municipal_apply_student_pass').ok).toBe(false);
    const s=visitor('commercial_convenience_store');expect(isLocationVisible(s,s.locationId)).toBe(true);const start=s.player.money;
    expect(performShoppingCart(s,[{actionId:'commercial_buy_lunch_convenience',quantity:2},{actionId:'commercial_buy_drink_convenience',quantity:1}]).ok).toBe(true);
    expect(itemCount(s,'bento')).toBe(2);expect(itemCount(s,'drink')).toBe(1);expect(s.player.money).toBe(start-27);expect(s.time.hour).toBe(12);
    const before=JSON.stringify(s);expect(performShoppingCart(s,[{actionId:'buy_lunch_convenience',quantity:1}]).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
  });
  it('月庭是独立酒店，登记后才有固定客房和淋浴，保留原租约和家具',()=>{
    const s=visitor('housing_agency');s.player.money=10000;expect(signLease(s,'old_apartment').ok).toBe(true);s.locationId='hotel_mooncourt';s.inventory.bed_premium=1;s.inventory.kitchen_set=1;
    expect(isResidenceLocation(s)).toBe(false);expect(canSleepHere(s)).toBe(false);expect(currentHomeSceneId(s)).toBeUndefined();const before=JSON.stringify(s.inventory),lease=JSON.stringify(s.living.lease);
    expect(performAction(s,'stay_hotel_mooncourt').ok).toBe(true);expect(s.locationId).toBe('hotel_mooncourt');expect(currentResidence(s).id).toBe('hotel_mooncourt');expect(canSleepHere(s)).toBe(true);expect(currentHomeSceneId(s)).toBe('hotel_mooncourt');expect(formalHomeId(s)).toBeUndefined();expect(canCustomizeCurrentHome(s)).toBe(false);expect(homeSceneObjectItem(s,'kitchen')).toBeUndefined();expect(canPerform(s,getAction('shower_home')!).ok).toBe(true);expect(JSON.stringify(s.inventory)).toBe(before);expect(JSON.stringify(s.living.lease)).toBe(lease);
    expect(selectLodging(s,'hotel')).toBe(true);expect(canSleepHere(s)).toBe(false);
  });
  it('城市别墅未购时隐藏，购房旧档迁址保留产权和抵押估值',()=>{
    const s=visitor('own_villa');expect(isLocationVisible(s,'own_villa')).toBe(false);expect(isResidenceLocation(s)).toBe(false);expect(currentHomeSceneId(s)).toBeUndefined();expect(visibleActionsAtLocation(s,'own_villa').some(a=>a.locationId==='home')).toBe(false);
    s.player.money=1e6;expect(buyProperty(s,'own_villa').ok).toBe(true);s.region=s.area='downtown_center';s.navStack=['map','downtown','downtown_center'];const collateral=stockCollateral(s),owned=structuredClone(s.living.properties),money=s.player.money;
    const loaded=migrateSave(JSON.parse(JSON.stringify(s)));expect(loaded.region).toBe('downtown_commercial');expect(residenceRegion(loaded)).toBe('downtown_commercial');expect(loaded.navStack).toEqual(['map','downtown','downtown_center','downtown_commercial']);expect(loaded.living.properties).toEqual(owned);expect(loaded.player.money).toBe(money);expect(stockCollateral(loaded)).toEqual(collateral);expect(currentHomeSceneId(loaded)).toBe('own_villa');
  });
  it('写字楼沿用工作小游戏，交易所免费电脑只在大厅提供交易权限',()=>{
    expect(localJobsOf('commercial_office').some(j=>j.id==='job_commercial_office_assistant')).toBe(true);expect(getMiniGameConfig('job_commercial_office_assistant')?.type).toBe('quiz');
    const s=visitor('commercial_exchange');expect(getLocation(s.locationId)?.regions).toEqual(['downtown_commercial']);expect(stockAccess(s).ok).toBe(true);expect(s.flags.item_laptop).toBeFalsy();expect(s.flags.laptop_app_invest).toBeFalsy();s.locationId='commercial_street';expect(stockAccess(s).ok).toBe(false);
  });
});
