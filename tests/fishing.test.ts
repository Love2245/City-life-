import {storedItems} from "../src/game/core/storage";
import {describe,it,expect} from "vitest";
import {createInitialState} from "../src/game/core/state";
import {startFishing,continueFishing,canStartFishing,canContinueFishing,fishingInput,settleFishing,sellFish,releaseFish,mountFish,fishValue,normalizeFishing,FISH_SPECIES} from "../src/game/core/fishing";
import {moveTo,travelToRegion,waitHere} from "../src/game/core/actions";
import {enterRegion} from "../src/game/core/regions";
import {migrateSave} from "../src/game/core/migrate";
function ready(locationId="treasure_lake"){const s=createInitialState(148);s.locationId=locationId;s.region=s.area=locationId==="lake_park"?"suburban_edge":"development_reserve";Object.assign(s.player.attrs,{health:100,stamina:100,satiety:80,mood:40});s.inventory.fishing_rod=1;s.inventory.fishing_bait=5;s.inventory.fishing_bucket=1;return s;}
describe("珍宝湖钓鱼",()=>{
 it("旧档缺少历史字段时，界面可读校验不写回默认值",()=>{
  const s=ready();s.fishing={nextId:1,active:null,bucket:[],specimens:{}} as any;const before=structuredClone(s.fishing);
  expect(canStartFishing(s).ok).toBe(true);expect(canContinueFishing(s)).toEqual({ok:false,reason:"没有待确认的鱼获"});expect(s.fishing).toEqual(before);
 });
 it("活动鱼竿指向已移除地点或鱼种时会清理损坏会话并允许重开",()=>{
  const s=ready();expect(startFishing(s).ok).toBe(true);const id=s.fishing!.active!.id;
  s.fishing!.active!.locationId="removed_spot" as any;
  expect(()=>settleFishing(s,id)).not.toThrow();expect(s.fishing!.active).toBeNull();expect(canStartFishing(s).ok).toBe(true);
  expect(startFishing(s).ok).toBe(true);const nextId=s.fishing!.active!.id;
  s.fishing!.active!.fish.speciesId="removed_species";
  expect(()=>fishingInput(s,nextId,{type:"tick",dtMs:50,held:false})).not.toThrow();
  expect(s.fishing!.active).toBeNull();expect(canStartFishing(s).ok).toBe(true);expect(startFishing(s).ok).toBe(true);
 });
 it("缺少装备/地点/体力时不收费；每竿只扣一份鱼饵和5体力",()=>{
  const s=ready();delete s.inventory.fishing_bucket;expect(startFishing(s).ok).toBe(false);expect(s.inventory.fishing_bait).toBe(5);
  s.flags.fishing_bucket_owned=true;expect(startFishing(s).ok).toBe(true);expect(s.inventory.fishing_bait).toBe(4);expect(s.player.attrs.stamina).toBe(95);expect(startFishing(s).ok).toBe(false);expect(s.inventory.fishing_bait).toBe(4);
 });
 it("咬钩超时、取消都会结算半小时，重复结算不推进时间",()=>{
  const s=ready();startFishing(s);const id=s.fishing!.active!.id,time={...s.time};
  for(let i=0;i<210;i++)fishingInput(s,id,{type:"tick",dtMs:50,held:false});expect(s.fishing!.active!.phase).toBe("ready");
  expect(settleFishing(s,id).ok).toBe(true);expect(s.time.minute).toBe((time.minute+30)%60);const after=JSON.stringify(s.time);expect(settleFishing(s,id).ok).toBe(false);expect(JSON.stringify(s.time)).toBe(after);expect(s.fishing!.bucket).toHaveLength(0);
  startFishing(s);fishingInput(s,s.fishing!.active!.id,{type:"cancel"});expect(settleFishing(s,s.fishing!.active!.id).ok).toBe(true);expect(s.inventory.fishing_bait).toBe(3);
 });
 it("跟踪绿区的真实物理操作可钓获，重量范围合法，成长无自动卖鱼",()=>{
  const s=ready();startFishing(s);const id=s.fishing!.active!.id,money=s.player.money;
  while(s.fishing!.active!.phase==="waiting")fishingInput(s,id,{type:"tick",dtMs:50,held:false});fishingInput(s,id,{type:"hook"});
  for(let i=0;i<4000&&s.fishing!.active!.phase!=="ready";i++){const a=s.fishing!.active!;fishingInput(s,id,{type:"tick",dtMs:35,held:3*(a.fishPos-a.bar-.145)-a.velocity>0});}
  expect(s.fishing!.active!.won).toBe(true);const r=settleFishing(s,id);expect(r.ok).toBe(true);expect(s.fishing!.bucket).toHaveLength(1);expect(s.player.money).toBe(money);
  const fish=s.fishing!.bucket[0],spec=FISH_SPECIES.find(x=>x.id===fish.speciesId)!;expect(fish.grams).toBeGreaterThanOrEqual(spec.min);expect(fish.grams).toBeLessThanOrEqual(spec.max);
  expect(s.fishing!.active).toBeNull();expect(s.fishing!.pendingCatch).toMatchObject({fish,record:fish,newRecord:true});expect(s.fishing!.bestRecords[fish.speciesId]).toEqual(fish);expect(canStartFishing(s).ok).toBe(false);
  const savedOnce=migrateSave(JSON.parse(JSON.stringify(s))),saved=migrateSave(JSON.parse(JSON.stringify(savedOnce)));expect(saved.fishing!.bucket).toEqual([fish]);expect(saved.fishing!.bucket).toHaveLength(1);expect(saved.fishing!.pendingCatch).toEqual(s.fishing!.pendingCatch);expect(saved.inventory.fishing_bait).toBe(s.inventory.fishing_bait);expect(saved.fishing!.active).toBeNull();
  expect(continueFishing(saved).ok).toBe(true);expect(saved.fishing!.pendingCatch).toBeNull();expect(saved.fishing!.active).not.toBeNull();expect(saved.inventory.fishing_bait).toBe(s.inventory.fishing_bait-1);
 });
 it("环湖公园可钓鱼且每竿/待确认鱼获绑定地点，鱼桶与记录仍共用",()=>{
  const s=ready("lake_park");expect(canStartFishing(s).ok).toBe(true);expect(startFishing(s).ok).toBe(true);
  const a=s.fishing!.active!,cast=structuredClone(a);expect(a.locationId).toBe("lake_park");
  s.locationId="treasure_lake";
  expect(fishingInput(s,a.id,{type:"tick",dtMs:50,held:false})).toMatchObject({ok:false});
  expect(settleFishing(s,a.id)).toMatchObject({ok:false});
  normalizeFishing(s);expect(s.fishing!.active).toEqual(cast);
  s.locationId="lake_park";a.phase="ready";a.won=true;expect(settleFishing(s,a.id).ok).toBe(true);
  expect(s.fishing!.bucket).toHaveLength(1);expect(s.fishing!.pendingCatch?.locationId).toBe("lake_park");
  s.locationId="treasure_lake";expect(canContinueFishing(s)).toMatchObject({ok:false,reason:expect.stringContaining("环湖公园")});
  s.locationId="lake_park";expect(continueFishing(s).ok).toBe(true);expect(s.fishing!.active?.locationId).toBe("lake_park");
 });
 it("未收竿阻止出行和等候，存档恢复保留鱼、随机数及操作进度",()=>{
  const s=ready();startFishing(s);expect(moveTo(s,"camping_base").ok).toBe(false);expect(travelToRegion(s,"downtown").ok).toBe(false);expect(enterRegion(s,"boyue").ok).toBe(false);expect(waitHere(s,.5).ok).toBe(false);
  const cast=structuredClone(s.fishing!.active),calls=s.rng.calls;normalizeFishing(s);expect(s.fishing!.active).toEqual(cast);expect(s.rng.calls).toBe(calls);
  const migrated=migrateSave(JSON.parse(JSON.stringify(s)));expect(migrated.fishing!.active).toEqual(cast);expect(migrated.inventory.fishing_bait).toBe(4);
 });
 it("价格按鱼种每千克单价乘重量，售鱼移除实体，不可重复出售",()=>{
  const s=ready(),fish={id:1,speciesId:"crucian",grams:750};s.fishing!.bucket.push(fish);expect(fishValue(fish)).toBe(9);const before=s.player.money;expect(sellFish(s,1)).toEqual({ok:true,price:9});expect(s.player.money).toBe(before+9);expect(sellFish(s,1).ok).toBe(false);
 });
 it("每品类仅保留最大标本，制成标本的鱼不能出售；较小鱼仍可出售",()=>{
  const s=ready();s.fishing!.bucket=[{id:1,speciesId:"crucian",grams:500},{id:2,speciesId:"crucian",grams:400},{id:3,speciesId:"crucian",grams:800},{id:4,speciesId:"carp",grams:900}];
  expect(mountFish(s,1).ok).toBe(true);expect(sellFish(s,1).ok).toBe(false);expect(mountFish(s,2).ok).toBe(false);expect(sellFish(s,2).ok).toBe(true);expect(mountFish(s,3).ok).toBe(true);expect(mountFish(s,4).ok).toBe(true);expect(Object.keys(s.fishing!.specimens)).toHaveLength(2);expect(s.fishing!.specimens.crucian.grams).toBe(800);expect(s.fishing!.bucket).toHaveLength(0);expect(s.inventory.fish_specimen_crucian).toBe(1);expect(s.inventory.fish_specimen_carp).toBe(1);expect(storedItems(s,"backpack").filter(x=>x.item.id.startsWith("fish_specimen_")).map(x=>x.qty)).toEqual([1,1]);expect(storedItems(s,"home").some(x=>x.item.id.startsWith("fish_specimen_"))).toBe(false);
 });
 it("鱼种历史最佳独立于鱼桶和标本，出售、放生及标本替换都不清除纪录",()=>{
  const s=ready(),record={id:10,speciesId:"carp",grams:5000};
  s.fishing!.bestRecords={carp:record};
  s.fishing!.bucket=[{id:1,speciesId:"carp",grams:900},{id:2,speciesId:"carp",grams:1200},{id:3,speciesId:"carp",grams:1500},{id:4,speciesId:"carp",grams:1800}];
  expect(mountFish(s,1).ok).toBe(true);expect(mountFish(s,2).ok).toBe(true);expect(s.fishing!.specimens.carp.grams).toBe(1200);
  expect(releaseFish(s,3).ok).toBe(true);expect(sellFish(s,4).ok).toBe(true);expect(s.fishing!.bestRecords.carp).toEqual(record);
 });
 it("旧标本迁移到背包，重复迁移不复制物品，非法收藏不残留",()=>{
 const s=ready();s.fishing!.specimens={crucian:{id:6,speciesId:"crucian",grams:800}};s.inventory.fish_specimen_carp=3;normalizeFishing(s);normalizeFishing(s);expect(s.inventory.fish_specimen_crucian).toBe(1);expect(s.inventory.fish_specimen_carp).toBeUndefined();const migrated=migrateSave(JSON.parse(JSON.stringify(s)));expect(storedItems(migrated,"backpack").find(x=>x.item.id==="fish_specimen_crucian")?.qty).toBe(1);expect(migrated.fishing!.specimens.crucian.grams).toBe(800);
 });
 it("旧存档安全补默认，坏会话与重复实体不能变成多份收益",()=>{
  const s=ready();delete s.fishing;normalizeFishing(s);expect(s.fishing).toEqual({nextId:1,active:null,bucket:[],specimens:{},bestRecords:{},pendingCatch:null});
  s.fishing!.bucket=[{id:1,speciesId:"carp",grams:600},{id:1,speciesId:"carp",grams:600}];s.fishing!.specimens={carp:{id:1,speciesId:"carp",grams:600}};s.fishing!.active={} as any;normalizeFishing(s);expect(s.fishing!.active).toBeNull();expect(s.fishing!.bucket).toHaveLength(1);expect(s.fishing!.specimens).toEqual({});expect(s.fishing!.nextId).toBe(2);
 });
 it("没有地点字段的旧鱼竿与待确认鱼获仍归珍宝湖，环湖会话换地点时保留",()=>{
  const s=ready("lake_park");startFishing(s);delete s.fishing!.active!.locationId;normalizeFishing(s);expect(s.fishing!.active?.locationId).toBe("treasure_lake");
  const old=ready();startFishing(old);const a=old.fishing!.active!;a.phase="ready";a.won=true;settleFishing(old,a.id);delete old.fishing!.pendingCatch!.locationId;
  const migrated=migrateSave(JSON.parse(JSON.stringify(old)));expect(migrated.fishing!.pendingCatch?.locationId).toBe("treasure_lake");
 });
});
