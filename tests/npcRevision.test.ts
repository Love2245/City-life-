import {describe,it,expect} from "vitest";
import {allNpcs,npcPresenceAt,npcAtLocation} from "../src/game/core/npcs";
import {createInitialState} from "../src/game/core/state";
import {migrateSave} from "../src/game/core/migrate";
import {presentNpcs} from "../src/game/core/npcTalk";
import {weekdayOf,fromLinearDay,linearDay} from "../src/game/core/calendar";
const t=(weekday:number,hour:number,minute=0)=>({weekday,hour,minute});
describe("v1.48 NPC 作息修订",()=>{
 it("周六夜班只出现在周六21点到周日2点，凌晨不会被算到周五",()=>{
  const id="npc_netbar_boss";
  expect(npcAtLocation(id,"boyue_nightclub",t(5,20,59))).toBe(false);
  expect(npcAtLocation(id,"boyue_nightclub",t(5,21))).toBe(true);
  expect(npcAtLocation(id,"boyue_nightclub",t(6,1,59))).toBe(true);
  expect(npcAtLocation(id,"boyue_nightclub",t(6,2))).toBe(false);
  expect(npcAtLocation(id,"boyue_nightclub",t(5,1))).toBe(false);
  for(let day=0;day<7;day++)expect(npcAtLocation(id,"internet_cafe",t(day,3))).toBe(false);
 });
 it("马师傅下午开摊，依星期切换三处小吃街且午前与午夜不出勤",()=>{
  for(let day=0;day<7;day++){
   const loc=day<4?"snack_street":day===4?"boyue_snack_street":"dev_food_street";
   expect(npcPresenceAt("npc_snack_street_vendor",t(day,12,59))).toBeNull();
   expect(npcAtLocation("npc_snack_street_vendor",loc,t(day,13))).toBe(true);
   expect(npcAtLocation("npc_snack_street_vendor",loc,t(day,23,59))).toBe(true);
   expect(npcPresenceAt("npc_snack_street_vendor",t(day,0))).toBeNull();
  }
 });
 it("陈守田周日在营地休闲，林小雨周日只在图书馆",()=>{
  expect(npcAtLocation("npc_suburb_farmer","camping_base",t(6,9))).toBe(true);
  expect(npcPresenceAt("npc_suburb_farmer",t(6,17))).toBeNull();
  expect(npcAtLocation("npc_suburb_farmer","orchard",t(6,10))).toBe(false);
  expect(npcAtLocation("npc_lin_xiaoyu","library",t(6,12))).toBe(true);
  expect(npcAtLocation("npc_lin_xiaoyu","cafe",t(6,8))).toBe(false);
 });
 it("林小雨每天只随机选一个周六地点，刷新、往返与其他随机活动不能改变",()=>{
  const s=createInitialState(148),seen=new Set<string>(),base=linearDay({year:2026,month:9,day:6});
  for(let week=0;week<20;week++){
   Object.assign(s.time,fromLinearDay(base+week*7),{hour:13,minute:0});expect(weekdayOf(s.time)).toBe(5);
   const query={...s.time,weekday:weekdayOf(s.time),seed:s.rng.seed};const selected=npcPresenceAt("npc_lin_xiaoyu",query)!;seen.add(selected.locationId);
   expect(["dev_art_gallery","dev_university"]).toContain(selected.locationId);
   const calls=s.rng.calls;const restored=migrateSave(JSON.parse(JSON.stringify(s)));s.rng.calls+=100;
   expect(npcPresenceAt("npc_lin_xiaoyu",{...query,minute:59})).toEqual(selected);
   expect(npcPresenceAt("npc_lin_xiaoyu",{...restored.time,weekday:5,seed:restored.rng.seed})).toEqual(selected);
   let found=0;for(const [loc,region]of [["dev_art_gallery","development_culture"],["dev_university","development_university"],["cafe","downtown_residential"]]){s.locationId=loc;s.region=region;if(presentNpcs(s).some(n=>n.id==="npc_lin_xiaoyu"))found++;}
   expect(found).toBe(1);expect(restored.rng.calls).toBe(calls);
  }expect(seen.size).toBe(2);
 });
 it("删除的两位NPC及委托在旧存档中清理，其他关系和余额保留",()=>{
  const s=createInitialState(148),money=s.player.money;
  s.relationships=[{npcId:"npc_pharmacist",affinity:30,state:"acquaintance"},{npcId:"npc_suburb_station_staff",affinity:30,state:"acquaintance"},{npcId:"npc_lin_xiaoyu",affinity:40,state:"friend"}];
  for(const npcId of ["npc_pharmacist","npc_suburb_station_staff"]){s.contacts.push({id:`npc_${npcId}`,name:"旧NPC",avatar:"👤",relation:"friend",title:"",intro:"",canCall:true,canSms:true,addedDay:1,npcId});s.flags[`npc_contact_${npcId}`]=true;s.weekly.interactions[npcId]=2;}
  s.cityCommissions.offeredIds=["city_suburb_last_mile","city_market_weekend_stock"];s.cityCommissions.activeId="city_suburb_last_mile";
  const restored=migrateSave(JSON.parse(JSON.stringify(s)));
  expect(allNpcs()).toHaveLength(12);expect(restored.relationships.map(r=>r.npcId)).toEqual(["npc_lin_xiaoyu"]);
  expect(restored.contacts.some(c=>["npc_pharmacist","npc_suburb_station_staff"].includes(c.npcId??""))).toBe(false);
  expect(restored.weekly.interactions).toEqual({});expect(restored.flags.npc_contact_npc_pharmacist).toBeUndefined();expect(restored.flags.npc_contact_npc_suburb_station_staff).toBeUndefined();expect(restored.cityCommissions.activeId).toBeNull();expect(restored.cityCommissions.offeredIds).toEqual([]);expect(restored.player.money).toBe(money);
 });
});
