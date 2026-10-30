import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {signLease,buyProperty,selectLodging,HOUSING} from '../src/game/core/housing';
import {currentResidence,isResidenceBuildingVisible} from '../src/game/core/residence';
import {getAction,performAction,moveTo,regionTravelPlan} from '../src/game/core/actions';
import {enterRegion,childrenOf,locationsOfRegion} from '../src/game/core/regions';
import {applyForJob,performJob,getJobDef,isRestDay} from '../src/game/core/jobs';
import {getWorkShift} from '../src/game/core/career';
import {homePlanFor,homeAreaSquareMetres,currentHomeSceneId} from '../src/game/core/homeInterior';
import {sleepSettlement} from '../src/game/core/time';
import {stockAccess,transferStockCash,stockCollateral} from '../src/game/core/stockMarket';
import {migrateSave} from '../src/game/core/migrate';
import {HOUSING_OFFERS} from '../src/game/data/housingOffers';
import {rentVehicle,buyVehicle,returnVehicle} from '../src/game/core/vehicle';
import {rollStreetBargain,streetBargain,buyStreetBargain} from '../src/game/core/streetBargains';
import {getMiniGameConfig} from '../src/game/core/minigame';
import {atlasVisualFor} from '../src/lib/mapVisuals';
const fresh=(locationId='housing_agency')=>{const s=createInitialState(14953);s.player.money=300000;s.time.hour=12;s.time.minute=0;s.locationId=locationId;s.region='downtown_commercial';s.area='downtown_center';return s;};

describe('设施重制的入住、交易与校园规则',()=>{
 it.each(['dev_incubator','boyue_talent_apartment'])('校园 %s 按纯办公或住宅用途开放，住房原子签约与补证幂等',id=>{
  if(id==='dev_incubator'){const office=fresh(id),before=JSON.stringify(office.living);expect(signLease(office,id).ok).toBe(false);expect(currentHomeSceneId(office)).toBeUndefined();expect(JSON.stringify(office.living)).toBe(before);return;}
  const denied=fresh();denied.player.money=0;const before=JSON.stringify(denied);expect(signLease(denied,id).ok).toBe(false);expect(JSON.stringify(denied)).toBe(before);
  const s=fresh();expect(signLease(s,id).ok).toBe(true);expect(s.flags.item_student_pass).toBe(true);
  expect(moveTo(s,id).ok).toBe(true);const campus=id==='dev_incubator'?'campus_teacher':'campus_engineering';expect(s.region).toBe(campus);expect(currentHomeSceneId(s)).toBe(id);
  delete s.flags.item_student_pass;const loaded=migrateSave(s);expect(loaded.flags.item_student_pass).toBe(true);expect(loaded.region).toBe(campus);expect(migrateSave(loaded)).toEqual(loaded);
 });
 it('校园入口需要证件，教学/食堂分开，校园内外不重复扣交通时间和费用',()=>{
  const s=fresh();s.locationId='map';s.region='development_university';expect(enterRegion(s,'campus_teacher').ok).toBe(false);s.flags.item_student_pass=true;
  expect(childrenOf('development_university').map(r=>r.id)).toContain('campus_teacher');expect(regionTravelPlan(s,'campus_teacher')).toMatchObject({hours:0,fare:0});expect(moveTo(s,'campus_teacher').ok).toBe(true);
  expect(locationsOfRegion('campus_teacher').map(l=>l.id)).toEqual(expect.arrayContaining(['dev_university','campus_teacher_canteen','campus_teacher_library','campus_teacher_sports','campus_teacher_affairs','dev_incubator']));
  expect(getAction('dev_university_canteen_6')!.locationId).toBe('campus_teacher_canteen');expect(regionTravelPlan(s,'development_university')).toMatchObject({hours:0,fare:0});
 });
 it.each(['campus_teacher','campus_engineering'])('%s 辅导员只要求智力和通行证，无小游戏，完整班次计入160元待发工资并双休',campus=>{
  const s=fresh(campus+'_affairs'),job=getJobDef(campus+'_counselor')!;s.player.money=1000;s.time={...s.time,year:2026,month:8,day:3,hour:8,minute:0};s.player.attrs.intelligence=49;s.player.attrs.stamina=100;s.player.attrs.satiety=100;s.flags.item_student_pass=true;
  expect(applyForJob(s,job).ok).toBe(false);s.player.attrs.intelligence=50;delete s.flags.item_student_pass;expect(applyForJob(s,job).ok).toBe(false);s.flags.item_student_pass=true;expect(applyForJob(s,job).ok).toBe(true);
  expect(getMiniGameConfig(job.id)).toBeUndefined();const r=performJob(s,job.id);expect(r.ok).toBe(true);expect(s.work?.active).toBeUndefined();expect(s.time.hour).toBe(17);expect(s.career.accruedWages).toBe(160);
  const count=s.work!.wageRecords.length;expect(performJob(s,job.id).ok).toBe(false);expect(s.work!.wageRecords.length).toBe(count);
  for(const day of [8,9]){const off=fresh(campus+'_affairs');off.player.money=1000;off.flags.item_student_pass=true;off.player.attrs.intelligence=100;off.time={...off.time,year:2026,month:8,day,hour:9};expect(applyForJob(off,job).ok).toBe(true);expect(isRestDay(off,job)).toBe(true);expect(getWorkShift(off,job).phase).toBe('rest');expect(performJob(off,job.id).ok).toBe(false);}
 });
 it.each(['hotel','hotel_budget','hotel_mooncourt','hotel_mooncourt_budget'])('%s 入住预付首晚，重复登记及首晚不重扣，访客不能免费吃饭，存读不重发预付额度',id=>{
  const room=HOUSING.nightly.find(h=>h.id===id)!,s=fresh(room.locationId!);s.player.money=1000;
  const meal=room.locationId==='hotel'?'hotel_resident_dining':'mooncourt_dining';expect(performAction(s,meal).ok).toBe(false);
  expect(selectLodging(s,id)).toBe(true);expect(s.player.money).toBe(1000-room.price);expect(selectLodging(s,id)).toBe(true);expect(s.player.money).toBe(1000-room.price);
  expect(performAction(s,meal).ok).toBe(true);expect(s.player.money).toBe(1000-room.price);sleepSettlement(s);expect(s.player.money).toBe(1000-room.price);expect(s.flags.hotel_prepaid_credit).toBe(false);
  expect(migrateSave(s).flags.hotel_prepaid_credit).toBe(false);s.time.day++;sleepSettlement(s);expect(s.player.money).toBe(1000-2*room.price);
 });
 it('两家豪华间面积不小于精装公寓，特惠间与普通出租屋面积相当',()=>{
  const premium=homeAreaSquareMetres(homePlanFor('own_apartment')),normal=homeAreaSquareMetres(homePlanFor('old_apartment'));
  for(const id of ['hotel','hotel_mooncourt'])expect(homeAreaSquareMetres(homePlanFor(id))).toBeGreaterThanOrEqual(premium);
  for(const id of ['hotel_budget','hotel_mooncourt_budget'])expect(Math.abs(homeAreaSquareMetres(homePlanFor(id))-normal)).toBeLessThanOrEqual(1);
  for(const id of ['hotel','hotel_mooncourt','hotel_budget','hotel_mooncourt_budget']){
   const plan=homePlanFor(id);
   for(const win of plan.windows)expect(plan.rooms.some(room=>room.name===win.room),id+' window room '+win.room).toBe(true);
  }
 });
 it('每种普通房源均可租可买，产权与真实地址、抵押和看房模型一致；校园住房仅租',()=>{
  for(const offer of HOUSING_OFFERS){expect(getAction(offer.sign)).toBeDefined();if(!offer.buy){expect(offer.purchase).toBe('');continue;}
   const tenant=fresh();expect(signLease(tenant,offer.lease).ok).toBe(true);tenant.region=currentResidence(tenant).region;tenant.area=tenant.region;const entered=moveTo(tenant,'home');expect(entered.ok,entered.reason).toBe(true);expect(currentHomeSceneId(tenant)).toBe(offer.lease);
   const owner=fresh();owner.player.money=1e6;expect(buyProperty(owner,offer.buy).ok).toBe(true);expect(currentResidence(owner).locationId).toBe(currentResidence(tenant).locationId);expect(homeAreaSquareMetres(homePlanFor(offer.buy))).toBe(homeAreaSquareMetres(homePlanFor(offer.lease)));
   expect(stockCollateral(owner).some(a=>a.kind==='property')).toBe(true);
  }
  const s=fresh();s.player.money=1e6;expect(isResidenceBuildingVisible(s,'own_villa')).toBe(false);expect(isResidenceBuildingVisible(s,'own_apartment')).toBe(false);s.flags.residence_unlocked_own_villa=true;expect(isResidenceBuildingVisible(s,'own_villa')).toBe(false);expect(buyProperty(s,'own_villa').ok).toBe(true);expect(isResidenceBuildingVisible(s,'own_villa')).toBe(true);
 });
 it('交易所免费终端不授予私有电脑或安装记录，离开后重新校验权限',()=>{
  const s=fresh('commercial_exchange');expect(stockAccess(s).ok).toBe(true);expect(transferStockCash(s,10000,'in').ok).toBe(true);expect(s.flags.item_laptop).toBeFalsy();expect(s.flags.laptop_app_invest).toBeFalsy();s.locationId='commercial_street';expect(stockAccess(s).ok).toBe(false);
 });
 it('自行车押金租赁、补差价买断和退租沿用统一车辆记录',()=>{
  const s=fresh('car_rental'),before=s.player.money;expect(rentVehicle(s,'bicycle').ok).toBe(true);expect(s.player.money).toBe(before-100);expect(buyVehicle(s,'bicycle').ok).toBe(true);expect(s.player.money).toBe(before-300);expect(s.vehicles.bicycle.owned).toBe(true);expect(returnVehicle(s,'bicycle').ok).toBe(false);
 });
 it('逛街特价保存固定报价，仅购买一次且资金不足原子失败，商业街摆摊有原小游戏',()=>{
  const s=fresh('commercial_street');for(let i=0;i<100&&!streetBargain(s);i++)rollStreetBargain(s);const offer=streetBargain(s)!;expect(offer).toBeDefined();expect(offer.price).toBeLessThan(offer.original);const saved=JSON.stringify(s);expect(streetBargain(JSON.parse(saved))).toEqual(offer);
  s.player.money=0;const snapshot=JSON.stringify(s);expect(buyStreetBargain(s).ok).toBe(false);expect(JSON.stringify(s)).toBe(snapshot);s.player.money=100;expect(buyStreetBargain(s).ok).toBe(true);expect(s.inventory[offer.item]).toBe(1);expect(buyStreetBargain(s).ok).toBe(false);expect(getMiniGameConfig('commercial_street_stall')).toBeDefined();
 });
 it('两所校园全部天气时段使用独立实图',()=>{for(const id of ['campus_teacher','campus_engineering'])for(const weather of ['sunny','cloudy','rain'] as const)for(const [hour,time] of [[12,'day'],[18,'dusk'],[21,'night'],[23,'late-night']] as const)expect(atlasVisualFor(id,weather,hour).url).toContain(id+'/'+weather+'-'+time+'.webp');});
});
