import { describe,it,expect } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { completeWork,takeJobOffer,applyForJob,getJobDef,performJob } from '../src/game/core/jobs';
import { getAction,performAction } from '../src/game/core/actions';
import { pendingStreetPerformance,settleStreetPerformance } from '../src/game/core/streetPerformance';
import { startFishing,fishingInput,fishingZoneWidth } from '../src/game/core/fishing';
import { startDistrictLeisure,stepDistrictLeisure,settleDistrictLeisure,type DanceSession } from '../src/game/core/districtLeisure';
import { livingBudgetOf } from '../src/game/core/livingBudget';
import { migrateSave } from '../src/game/core/migrate';
import { socialThreadsOf } from '../src/game/core/socialInbox';
import { playerPortraitForReply } from '../src/game/core/npcPortraits';
import { clothingCatalog } from '../src/game/core/clothing';

function healthy(seed=71){const s=createInitialState(seed);s.time.hour=8;s.time.minute=0;Object.assign(s.player.attrs,{stamina:100,satiety:100,health:100,hygiene:100});return s;}
describe('有效工作与生活预算',()=>{
 it.each(['internet_night_job','boyue_internet_night_job','market_help_stand','steel_shift','glass_quality_shift','aluminum_recycle_shift','bus_station_gig','development_bus_station_gig'])('%s 旧工资行动同样通过真实班次结算且存档保留',id=>{
   const s=healthy();s.time.month=12;s.time.day=1;const action=getAction(id)!;s.locationId=action.locationId;s.flags.route_heavy_industry=true;s.player.stats.intelligence=100;
   for(const key of Object.keys(s.player.skills) as Array<keyof typeof s.player.skills>)s.player.skills[key]=5;
   const money=s.player.money;const started=performAction(s,id);expect(started.ok,started.reason).toBe(true);expect(s.player.money).toBe(money);
   const loaded=migrateSave(JSON.parse(JSON.stringify(s)));expect(loaded.work?.active?.id).toBe(s.work?.active?.id);
   completeWork(loaded,loaded.work!.active!.id,0);expect(loaded.player.money).toBe(money);expect(loaded.weekly.jobsDone).toBe(0);expect(loaded.flags.industrial_dorm_qualified).not.toBe(true);
 });
 it('直接结束无工资、无职业和熟练度收益，不能重复结算',()=>{
   const s=healthy();s.locationId='labor_market';s.laborMarket.offers=[{uid:'clean',jobId:'job_market_cleaner',quota:1}];
   const start=takeJobOffer(s,'clean');expect(start.ok).toBe(true);const money=s.player.money,minute=s.time.hour*60+s.time.minute;
   expect(completeWork(s,start.session!.id,0).ok).toBe(true);expect(s.player.money).toBe(money);
   expect(s.time.hour*60+s.time.minute).toBeGreaterThan(minute);expect(s.player.attrs.stamina).toBeLessThan(100);
   expect(s.work?.masteryMinutes.job_market_cleaner??0).toBe(0);expect(s.flags.job_done_job_market_cleaner).not.toBe(true);
   expect(completeWork(s,start.session!.id,1).ok).toBe(false);expect(s.player.money).toBe(money);
 });
 it('正式工零分也不产生待发工资、满勤或完成任务奖励',()=>{
   const s=healthy();s.time.day=3;s.flags.item_certificate=true;s.player.skills.service=3;const job=getJobDef('job_convenience_clerk')!;
   const hire=applyForJob(s,job);expect(hire.ok,hire.reason).toBe(true);s.locationId=job.locationId!;const start=performJob(s,job.id);
   expect(start.ok,start.reason).toBe(true);completeWork(s,start.session!.id,0);expect(s.career.accruedWages).toBe(0);expect(s.career.periodAttended).toBe(0);expect(s.career.workedDays).toBe(0);
 });
 it('卖艺先消耗时间，失败无打赏，存档和重复回调不能刷钱，每天只两场',()=>{
   let s=healthy();s.locationId='street';s.region='downtown_residential';s.area='residential';const money=s.player.money;
   expect(performAction(s,'street_perform').ok).toBe(true);expect(s.player.money).toBe(money);const pending=pendingStreetPerformance(s)!;expect(pending).toBeTruthy();
   s=migrateSave(JSON.parse(JSON.stringify(s)));expect(pendingStreetPerformance(s)).toEqual(pending);
   expect(settleStreetPerformance(s,pending.id,0)?.money).toBe(0);expect(settleStreetPerformance(s,pending.id,1)).toBeUndefined();
   expect(performAction(s,'street_perform').ok).toBe(true);const second=pendingStreetPerformance(s)!;
   expect(second.quote).toBeLessThan(pending.quote);const pay=settleStreetPerformance(s,second.id,1)!.money;expect(pay).toBeLessThanOrEqual(36);
   expect(performAction(s,'street_perform').ok).toBe(false);expect(s.player.money).toBe(money+pay);
 });
 it('基础食品所有零售入口和目录同价，正常入门工作可覆盖独居支出',()=>{
   for(const [id,price]of Object.entries({buy_lunch_convenience:12,buy_sandwich_convenience:8,buy_salad_convenience:10,buy_noodles_convenience:4,boyue_buy_lunch_convenience:12}))expect(getAction(id)?.effects?.money).toBe(-price);
   const s=healthy();const before=JSON.stringify(s);const budget=livingBudgetOf(s);
   expect(budget.salary).toBe(0);expect(budget.income).toBe(0);expect(budget.rent).toBe(0);expect(JSON.stringify(s)).toBe(before);
 });
});
describe('穿搭与社交身份',()=>{
 it('每件服装在对话切换中都与衣柜同样显示，不借用整身图',()=>{
   const base={clothes:'cyan_jacket',pants:'black_pants',underlayer:'underlayer_white',hat:undefined};
   for(const item of clothingCatalog()){const outfit={...base,[item.slot]:item.id};const preview=playerPortraitForReply(undefined,outfit);
    for(const text of ['谢谢','为什么','不用','当然可以'])expect(playerPortraitForReply(text,outfit)).toEqual(preview);
   }
 });
 it('已知家人、系统通知和未知来信分别呈现，NPC旧会话合并且无消息丢失',()=>{
   const s=healthy();s.contacts.push({id:'npc_friend',npcId:'friend',name:'小河',avatar:'🌿',relation:'friend',title:'朋友',intro:'',canCall:true,canSms:true,addedDay:0});
   const msg=(id:string,sender:string,conversationId:string)=>({id,sender,senderIcon:'✉',conversationId,text:'你好',options:[],replied:false,day:0,dir:'in' as const});
   s.smsInbox=[msg('a','妈妈','contact:parent_mother'),msg('b','城市银行','sender:城市银行'),msg('c','老同学','sender:老同学'),msg('d','小河','npc:friend'),msg('e','小河','contact:npc_friend')];
   const before=JSON.stringify(s.smsInbox),threads=socialThreadsOf(s);expect(threads.find(t=>t.name==='妈妈')?.channel).toBe('chat');expect(threads.find(t=>t.name==='城市银行')?.channel).toBe('services');expect(threads.find(t=>t.name==='老同学')?.channel).toBe('requests');expect(threads.find(t=>t.name==='小河')?.msgs).toHaveLength(2);expect(JSON.stringify(s.smsInbox)).toBe(before);
 });
});
describe('技巧挑战可失败且可掌握',()=>{
 it('新浮标宽度允许靠近上沿，恢复存档不丢失这一竿',()=>{
   const s=healthy();s.locationId='lake_park';Object.assign(s.inventory,{fishing_rod:1,fishing_bait:1,fishing_bucket:1});startFishing(s);
   const a=s.fishing!.active!;a.phase='fighting';a.zoneWidth=.2;a.bar=.79;
   const loaded=migrateSave(JSON.parse(JSON.stringify(s)));expect(loaded.fishing?.active?.bar).toBe(.79);expect(loaded.fishing?.active?.zoneWidth).toBe(.2);
 });
 it('钓鱼盲目按住会失败，带反应延迟的跟随策略可以钓到鱼',()=>{
   function play(seed:number,track:boolean){const s=healthy(seed);s.locationId='lake_park';Object.assign(s.inventory,{fishing_rod:1,fishing_bait:1,fishing_bucket:1});expect(startFishing(s).ok).toBe(true);const a=s.fishing!.active!;
     expect(fishingZoneWidth(a)).toBeLessThan(.29);a.phase='fighting';let held=false;
     for(let i=0;i<3000&&a.phase==='fighting';i++){if(i%9===0)held=track?(a.fishPos>a.bar+fishingZoneWidth(a)/2+a.velocity*.2):true;fishingInput(s,a.id,{type:'tick',dtMs:16,held});}
     expect(a.phase).toBe('ready');return a.won;
   }
   const seeds=Array.from({length:40},(_,i)=>100+i);const idle=seeds.filter(n=>play(n,false)).length,tracked=seeds.filter(n=>play(n,true)).length;
   expect(idle).toBeLessThan(5);expect(tracked).toBeGreaterThan(20);
 });
 it('舞蹈瞎点会失败，精准命中曲目能通过；只有一拍的驻唱没有保底收入',()=>{
   function start(kind:'dance'|'singing'){const s=healthy();s.time.hour=20;s.locationId=kind==='dance'?'boyue_nightclub':'boyue_lounge_bar';s.player.stats.charm=80;s.player.stats.fame=50;expect(startDistrictLeisure(s,kind).ok).toBe(true);return s;}
   const s=start('dance'),a=s.districtLeisure!.active as DanceSession;for(const n of a.notes){while(a.elapsedMs<n.atMs)stepDistrictLeisure(s,a.id,{type:'dance_tick',dtMs:Math.min(100,n.atMs-a.elapsedMs)});stepDistrictLeisure(s,a.id,{type:'dance_hit',lane:n.lane});}a.phase='ready';expect(settleDistrictLeisure(s,a.id).result?.won).toBe(true);
   const bad=start('singing'),b=bad.districtLeisure!.active as DanceSession;b.elapsedMs=b.notes[0].atMs;stepDistrictLeisure(bad,b.id,{type:'dance_hit',lane:b.notes[0].lane});b.phase='ready';expect(settleDistrictLeisure(bad,b.id).result?.payout).toBe(0);
   const spam=start('dance'),c=spam.districtLeisure!.active as DanceSession;for(let i=0;i<500;i++)stepDistrictLeisure(spam,c.id,{type:'dance_hit',lane:(i%3) as 0|1|2});c.phase='ready';expect(settleDistrictLeisure(spam,c.id).result?.won).toBe(false);
 });
});
