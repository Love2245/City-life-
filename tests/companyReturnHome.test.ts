import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {registerCompany} from '../src/game/core/company';
import {companyStage} from '../src/game/core/companyConfig';
import {companyReturnHomeQuote,returnHomeFromCompany} from '../src/game/core/companyReturnHome';
import {exitLocation,moveTo,travelToRegion} from '../src/game/core/actions';
import {buyProperty,selectLodging,signLease} from '../src/game/core/housing';
import {residenceLocationId,residenceRegion} from '../src/game/core/residence';
import {gameDay} from '../src/game/core/calendar';
import type {GameState} from '../src/game/types';
import * as timeCore from '../src/game/core/time';

afterEach(()=>vi.restoreAllMocks());
const clone=(s:GameState)=>JSON.parse(JSON.stringify(s)) as GameState;
const minute=(s:GameState)=>gameDay(s.time)*1440+s.time.hour*60+s.time.minute;
function office(home='old_apartment',stage:1|2=2){
  const s=createInitialState(149724);s.mode='eternal';s.player.money=1e7;s.time.hour=10;s.locationId='municipal_hall';s.developmentHistory!.total = 1; Object.assign(s.developmentHistory!.byType, { indie_game: 5 });
  expect(registerCompany(s,'返家公司',stage).ok).toBe(true);
  if(['hotel','minsu'].includes(home))expect(selectLodging(s,home)).toBe(true);else if(home==='gov'){}else expect(signLease(s,home).ok).toBe(true);
  const company=companyStage(stage);s.locationId=company.location;s.region=company.region;s.area=company.region;s.navStack=['map',company.region];
  return s;
}
function normal(s:GameState){
  expect(exitLocation(s).ok).toBe(true);
  for(let leg=0;leg<4;leg++){
    const region=residenceRegion(s);
    if(s.region===region){expect(moveTo(s,residenceLocationId(s)).ok).toBe(true);return;}
    expect(travelToRegion(s,region).ok).toBe(true);
  }
  throw Error('ordinary journey did not arrive');
}
function comparable(s:GameState){const ids=new Map<string,string>();return JSON.stringify(s).replace(/(?:post|forum)_[a-z0-9]+_\d+/g,id=>{if(!ids.has(id))ids.set(id,`social-${ids.size}`);return ids.get(id)!;});}

describe('公司门口回家路线',()=>{
  it.each([
    ['old_apartment',2,10,'',2,30],['rental_apartment',2,10,'',0,0],['hotel',2,10,'',0,0],
    ['minsu',2,10,'',2,30],['old_apartment',2,2,'',0,60],
    ['old_apartment',2,10,'item_car',0,10],['old_apartment',2,10,'item_e_bike',0,20],
    ['old_apartment',1,10,'',5,60],['suburb_room',2,10,'item_car',0,60],['suburb_room',2,10,'item_e_bike',0,90],
  ])('%s / 阶段%i / %i点 / %s 与普通返家一致',(home,stage,hour,vehicle,fare,minutes)=>{
    const s=office(home as string,stage as 1|2);if((hour as number)<s.time.hour)s.time.day++;s.time.hour=hour as number;if(vehicle)s.flags[vehicle as string]=true;
    const ordinary=clone(s),before=JSON.stringify(s),quote=companyReturnHomeQuote(s);
    expect(quote).toMatchObject({ok:true,fare,hours:(minutes as number)/60,destinationId:residenceLocationId(s)});expect(JSON.stringify(s)).toBe(before);
    normal(ordinary);const started=minute(s),cash=s.player.money;
    expect(returnHomeFromCompany(s).ok).toBe(true);expect(minute(s)-started).toBe(minutes);expect(cash-s.player.money).toBe(fare);expect(comparable(s)).toBe(comparable(ordinary));
  });
  it('换房和产权自住后使用最新地址，不缓存旧租赁住所',()=>{
    const s=office();expect(companyReturnHomeQuote(s).destinationId).toBe('old_apartment');
    expect(signLease(s,'rental_apartment').ok).toBe(true);expect(companyReturnHomeQuote(s).destinationId).toBe('rental_apartment');
    expect(buyProperty(s,'own_apartment').ok).toBe(true);expect(companyReturnHomeQuote(s).destinationId).toBe(residenceLocationId(s));
    expect(returnHomeFromCompany(s).ok).toBe(true);expect(s.locationId).toBe(residenceLocationId(s));
  });
  it('政府剩余住宿有效才提供回家，没住所或不在公司时不会迁出扣款',()=>{
    const s=office('gov');expect(companyReturnHomeQuote(s).ok).toBe(true);s.living.govDaysLeft=0;const before=JSON.stringify(s);
    expect(companyReturnHomeQuote(s).ok).toBe(false);expect(returnHomeFromCompany(s).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
    s.living.govDaysLeft=7;s.locationId='municipal_hall';expect(returnHomeFromCompany(s).ok).toBe(false);
  });
  it('本地缺钱沿用步行；跨城必须购票、开发区车费不足都保持原状态',()=>{
    const local=office();local.player.money=0;expect(companyReturnHomeQuote(local)).toMatchObject({ok:true,fare:0,hours:1});expect(returnHomeFromCompany(local).ok).toBe(true);
    const campus=office('old_apartment',1);campus.player.money=4;const before=JSON.stringify(campus);expect(returnHomeFromCompany(campus).ok).toBe(false);expect(JSON.stringify(campus)).toBe(before);
    const suburb=office('suburb_room');const cross=JSON.stringify(suburb);expect(companyReturnHomeQuote(suburb).reason).toContain('购票');expect(returnHomeFromCompany(suburb).ok).toBe(false);expect(JSON.stringify(suburb)).toBe(cross);
  });
  it.each(['hospital','work','fishing','leisure','ending'])('%s 阻断不修改时钟、现金、公司或 RNG',kind=>{
    const s=office();if(kind==='hospital')s.flags.hospitalized=true;if(kind==='work')s.work.active={jobId:'job_cafe',status:'active'} as any;if(kind==='fishing')s.fishing={active:true} as any;if(kind==='leisure')s.districtLeisure={active:true} as any;if(kind==='ending')s.endingId='survival_bad';
    const before=JSON.stringify(s);expect(companyReturnHomeQuote(s).ok).toBe(false);expect(returnHomeFromCompany(s).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
  });
  it('跨午夜报价不推进日历、社交生成或随机数，真实回程与普通路线一致',()=>{
    const s=office('old_apartment',1);s.time.hour=23;s.time.minute=45;const before=JSON.stringify(s),ordinary=clone(s);
    const clock=vi.spyOn(Date,'now').mockReturnValue(1792812345000),advance=vi.spyOn(timeCore,'advanceHours');
    expect(companyReturnHomeQuote(s).ok).toBe(true);expect(advance).not.toHaveBeenCalled();expect(clock).not.toHaveBeenCalled();expect(JSON.stringify(s)).toBe(before);
    normal(ordinary);expect(returnHomeFromCompany(s).ok).toBe(true);expect(comparable(s)).toBe(comparable(ordinary));
  });
});
