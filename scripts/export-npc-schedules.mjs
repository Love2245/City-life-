import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
const out = "artifacts/v1.48/npc-schedules";
mkdirSync(out,{recursive:true});
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:"custom",optimizeDeps:{noDiscovery:true}});
try {
  const { allNpcs, npcKnownName, npcDescriptor }=await server.ssrLoadModule("/src/game/core/npcs.ts");
  const { getLocation }=await server.ssrLoadModule("/src/game/core/actions.ts");
  const { getRegion, topRegionOf }=await server.ssrLoadModule("/src/game/core/regions.ts");
  const dayNames=["周一","周二","周三","周四","周五","周六","周日"];
  const hm=h=>`${String(Math.floor(h)).padStart(2,"0")}:${String(Math.round(h%1*60)).padStart(2,"0")}`;
  const rows=[], registry=[];
  for(const npc of allNpcs()) {
    const schedule=npc.weeklySchedule?.length ? npc.weeklySchedule : [{weekdays:[0,1,2,3,4,5,6],locationId:npc.meetLocation,hourRange:npc.meetConditions?.hourRange}];
    const entries=schedule.map((s,index)=>{
      const location=getLocation(s.locationId);
      const range=s.allDay ? location?.openHours ? [location.openHours.start,location.openHours.end] : [0,24] : s.hourRange ?? [0,24];
      const days=s.weekdays.length===7 ? "每天" : s.weekdays.map(d=>dayNames[d]).join("、");
      const time=range[0]===range[1] || range[0]===0&&range[1]===24 ? "全天" : `${hm(range[0])}—${range[0]>range[1]?"次日":""}${hm(range[1])}`;
      const region=s.regionId ?? location?.regions?.[0];
      const entry={npcId:npc.id,name:npcKnownName(npc.id),identity:npcDescriptor(npc.id),priority:index+1,weekdays:days,time:time+(s.randomGroup?"（当天随机地点之一）":""),location:location?.name ?? s.locationId,locationId:s.locationId,region:[getRegion(topRegionOf(region))?.name,getRegion(region)?.name].filter((v,i,a)=>v&&a.indexOf(v)===i).join(" / ") || region || "未限定",regionId:region,raw:s};
      rows.push(entry);return entry;
    });
    registry.push({id:npc.id,name:npcKnownName(npc.id),identity:npcDescriptor(npc.id),meetChance:npc.meetChance,meetConditions:npc.meetConditions,entries});
  }
  let md=`# 都市生活 v1.48 NPC 出勤表\n\n导出日期：2026-10-06。共 ${registry.length} 位 NPC、${rows.length} 条排班。以游戏实际 NPC 注册表、地点营业时间和区域定义为准，已应用本轮NPC删除与作息调整。\n\n时间段含起点、不含终点；“每天”含周末。标记overnight的跨午夜班次按开始日匹配星期；林小雨周六两个候选当天随机固定一处，刷新和进出不会改变。同一时刻多个排班重叠时，前一条优先。allDay 条目沿用地点营业时间；出勤不代表必定相识，偶遇仍受概率、魅力、资金或在职条件影响。\n\n| NPC | 身份 | 星期 | 出勤时间 | 地点 | 具体区域 |\n|---|---|---|---|---|---|\n`;
  for(const r of rows) md+=`| ${r.name} | ${r.identity} | ${r.weekdays} | ${r.time} | ${r.location} | ${r.region} |\n`;
  md+="\n## 相识限制与内部 ID\n\n";
  for(const n of registry) md+=`- ${n.name}（${n.id}）：偶遇概率 ${n.meetChance===undefined?"未单独配置":`${Math.round(n.meetChance*100)}%`}；额外条件 ${JSON.stringify(n.meetConditions??{})}。\n`;
  md+="\n两个新区目前没有专属 NPC 排班；表内为当前全部 NPC。你可以直接按 NPC ID、星期、时段、地点 ID、区域 ID 提供修订。原始条目和优先级见 JSON。\n";
  writeFileSync(`${out}/npc-schedules.md`,md);
  writeFileSync(`${out}/npc-schedules.json`,JSON.stringify(registry,null,2));
  const cols=["npcId","name","identity","weekdays","time","location","locationId","region","regionId","priority"];
  writeFileSync(`${out}/npc-schedules.csv`,"\uFEFF"+cols.join(",")+"\r\n"+rows.map(r=>cols.map(c=>`"${String(r[c]??"").replaceAll('"','""')}"`).join(",")).join("\r\n"));
  console.log(md);
} finally {await server.close();}
