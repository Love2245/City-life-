import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { ensureRelationship } from "../src/game/core/relationships";
import { beginNpcConversation, npcCasualTopics, npcFormalTopics } from "../src/game/core/npcTalk";
import { npcDialogueRemasterData, recordRemasterConversation, remasterDailyConversationStart, remasterEligibleTopics } from "../src/game/data/npcDialogueRemaster";
import { markGreeted } from "../src/game/data/npcGreetings";
import { gameDay, weekdayOf } from "../src/game/core/calendar";
import { npcDialogueBeats } from "../src/game/core/npcDialoguePlayback";
import { cleanDialogueText } from "../src/game/core/npcPortraits";
import { executeNpcTaskAction, getNpcTaskTopics, getNpcTaskCounterTopics, tickNpcTasks } from "../src/game/core/npcTasks";
import { migrateSave } from "../src/game/core/migrate";
import { refreshDailyQuests } from "../src/game/core/quests";
import { DEVELOPER_TASK_PRESETS } from "../src/game/core/developerTasks";
import { executeDeveloperAction } from "../src/game/core/developer";
import { ITEMS, getItem } from "../src/game/core/items";
import { developerItemCategory, developerItemMatchesCategory, DEVELOPER_ITEM_CATEGORIES } from "../src/game/core/developerInventory";
import { homeCameraPose, clampHomePoint, moveHomeCameraTarget, pointInsideHome, HOME_CAMERA_TARGET_INSET } from "../src/lib/homeRoom3D";
import { HOME_FLOOR_PLANS } from "../src/game/core/homeFloorPlans";
import { HOME_LOW_WALL_HEIGHT, homeWallHeight } from "../src/lib/homeWallView";
import { NPC_GROUP_SCENES, availableNpcGroupScenes, npcGroupDayFlag } from "../src/game/data/npcGroupScenes";
import { INTRO_FIRST_COMPLETE, INTRO_SECOND_COMPLETE } from "../src/game/data/npcIntroductionProgress";
import { allNpcs } from "../src/game/core/npcs";
import type { GameState, Quest } from "../src/game/types";

function state():GameState { const s=createInitialState(149217);Object.assign(s.time,{day:3,hour:9,minute:0});s.locationId="labor_market";s.region="downtown_industrial";ensureRelationship(s,"npc_zhao_gang").affinity=40;return s; }
function retired(id:"xiaoyu_print"|"farmer_delivery"):Quest { return {id:`q_npc_task_${id}`,type:"story",title:id,icon:"",desc:"",day:0,status:"active",npcTask:{taskId:id,stage:"await_loading",acceptedAt:0,deadlineAt:1,revision:1,data:{appointmentDay:0}}}; }
describe("用户反馈：对话分类与一次性生活片段",()=>{
  it("成功与失败的任务回顾都不会显示进行中",()=>{
    const s=state();s.quests.push({id:"toy",type:"story",title:"给孩子留一份",desc:"",icon:"",day:0,status:"done",npcTask:{taskId:"zhao_toy",stage:"done",acceptedAt:0,deadlineAt:99999,revision:2,data:{referencePrice:100},outcome:"free"}});
    expect(npcFormalTopics(s,"npc_zhao_gang").find(t=>t.npcTaskTopicId?.includes("zhao_toy"))?.category).toBe("done");
    s.quests[0].status="failed";expect(npcFormalTopics(s,"npc_zhao_gang").find(t=>t.npcTaskTopicId?.includes("zhao_toy"))?.category).toBe("failed");
  });
  it("正式菜单只有任务，日常小事没有单独按钮",()=>{
    const s=state();expect(npcFormalTopics(s,"npc_zhao_gang").every(t=>t.category!=="story"&&!t.sceneId&&!t.groupSceneId)).toBe(true);
    expect(npcCasualTopics(s,"npc_zhao_gang").every(t=>t.id.startsWith("task:")||t.id.startsWith("group:"))).toBe(true);
    expect(remasterEligibleTopics(s,"npc_zhao_gang","chat",40).length).toBeGreaterThan(0);
  });
  it("生活话题可由随机闲聊抽到，听过的日常与话题跨天读档后不重复",()=>{
    const s=state(),data=npcDialogueRemasterData().npc_zhao_gang;
    const formal=remasterEligibleTopics(s,"npc_zhao_gang","chat",40);expect(formal.length).toBeGreaterThan(0);
    for(const scene of Object.values(data.scenes)){
      if(scene.kind==="event")s.flags[`npc_remaster_event_seen_npc_zhao_gang_${scene.id}`]=true;
      if(scene.kind==="daily")s.flags[`npc_remaster_daily_seen_npc_zhao_gang_${scene.id}`]=true;
      if(scene.kind==="topic")s.flags[`npc_remaster_topic_seen_npc_zhao_gang_${scene.id}`]=true;
    }
    const only=formal.find(scene=>(scene.minAffinity??0)<=40&&(!scene.locationId||scene.locationId===s.locationId)&&!scene.conditions.length)!;expect(only).toBeTruthy();
    delete s.flags[`npc_remaster_topic_seen_npc_zhao_gang_${only.id}`];
    expect(remasterDailyConversationStart(s,"npc_zhao_gang","friend",40)?.sceneId).toBe(only.id);
    recordRemasterConversation(s,"npc_zhao_gang",only.id,[]);s.time.day++;
    const saved=migrateSave(JSON.parse(JSON.stringify(s)));expect(remasterDailyConversationStart(saved,"npc_zhao_gang","friend",40)).toBeUndefined();
    markGreeted(saved,"npc_zhao_gang",gameDay(saved.time));const start=beginNpcConversation(saved,"npc_zhao_gang","chat");expect(start.ok).toBe(true);expect(start.session?.greetingNode).toBeTruthy();
  });
  it("三人故事移入闲聊，已听过的共同故事不在第二天重播",()=>{
    const scene=NPC_GROUP_SCENES[0],s=state();s.flags[INTRO_FIRST_COMPLETE]=true;s.flags[INTRO_SECOND_COMPLETE]=true;s.locationId=scene.locationId;s.region=scene.regionId;
    for(const npc of allNpcs())ensureRelationship(s,npc.id).affinity=40;
    let found=false;for(let day=1;day<=7&&!found;day++)for(let hour=0;hour<24;hour++){Object.assign(s.time,{day,hour});if(availableNpcGroupScenes(s,scene.participants[0]).length){found=true;break;}}
    expect(found).toBe(true);expect(npcFormalTopics(s,scene.participants[0]).some(t=>t.groupSceneId)).toBe(false);
    const topic=npcCasualTopics(s,scene.participants[0]).find(t=>t.id===`group:${scene.id}`)!;expect(topic).toBeTruthy();
    const start=beginNpcConversation(s,scene.participants[0],"chat",topic.id);expect(start.ok,start.reason).toBe(true);expect(start.session?.groupSceneId).toBe(scene.id);
    s.flags[npcGroupDayFlag(scene.id)]=gameDay(s.time)-1;expect(availableNpcGroupScenes(s,scene.participants[0])).not.toContain(scene);
  });
});
describe("用户反馈：长对白按句分页",()=>{
  it("范柯杰长段落拆成多次点击，完整文字和发言人保留",()=>{
    const text="又绕她那边去了。行，说我。初中毕业，中专念了一个月，退了。那时有人偷我口琴，我把人打了。学校还没把开除通知发下来，我先说不念了。抢着喊结束，好像喊得早，就不算被赶走了一样。";
    const beats=npcDialogueBeats(text,"npc_fan_kejie");expect(beats.length).toBeGreaterThan(1);expect(beats.map(b=>b.text).join("")).toBe(text);expect(beats.every(b=>b.text.length<=80&&b.speakerId==="npc_fan_kejie")).toBe(true);
  });
  it("多人物、旁白与动作原文不会混到下一句的表情来源",()=>{
    const one="（微笑）『"+"先把这件事情说清楚，大家就都可以放心。".repeat(5)+"』";
    const two="（皱眉）『"+"这件事情我还得仔细想想，不能随便答应。".repeat(4)+"』";
    const beats=npcDialogueBeats("","npc_zhao_gang",[{speakerId:null,text:"这是旁白。".repeat(20)},{speakerId:"npc_zhao_gang",text:one},{speakerId:"player",text:two}]);
    expect(beats.filter(b=>b.speakerId===null).map(b=>b.text).join("")).toBe("这是旁白。".repeat(20));
    const first=beats.filter(b=>b.speakerId==="npc_zhao_gang");expect(first.map(b=>b.text).join("")).toBe(cleanDialogueText(one));expect(first.every(b=>b.portraitText===one&&!b.portraitText.includes("皱眉"))).toBe(true);
  });
  it("报价数字、小数和短句保持完整",()=>{const text="今天报价1,000元，折算12.50元一次。";expect(npcDialogueBeats(text,"npc_zhao_gang").map(b=>b.text)).toEqual([text]);});
  it("只有长动作或旁白的旧节点也保留可读内容，不产生空白页",()=>{const text="（"+"背景".repeat(100)+"）";expect(cleanDialogueText(text)).toBe('');const beats=npcDialogueBeats(text,"npc_zhao_gang");expect(beats.length).toBeGreaterThan(1);expect(beats.map(b=>b.text).join('')).toBe(text);expect(beats.every(b=>b.text.length>0&&b.text.length<=80)).toBe(true);});
});
describe("用户反馈：移除打印与送菜样板",()=>{
  it("所有任务入口、调试预设与道具目录不再提供两条旧稿",()=>{
    const s=state();expect(DEVELOPER_TASK_PRESETS.xiaoyu_print).toBeUndefined();expect(DEVELOPER_TASK_PRESETS.farmer_delivery).toBeUndefined();expect(getItem("task_print_good")).toBeUndefined();expect(getItem("task_vegetable_crate")).toBeUndefined();
    for(const id of ["xiaoyu_print","farmer_delivery"] as const){expect(executeNpcTaskAction(s,null,{taskId:id,action:"accept"}).ok).toBe(false);expect(executeDeveloperAction(s,{enabled:true,unlocked:true},{type:"task",id,preset:"start"}).ok).toBe(false);}
    s.locationId="internet_cafe";s.region="downtown_residential";s.quests.push(retired("xiaoyu_print"));s.inventory.task_print_original=1;ensureRelationship(s,"npc_netbar_boss");
    expect(getNpcTaskCounterTopics(s)).toEqual([]);expect(getNpcTaskTopics(s,"npc_netbar_boss","chat").every(t=>t.taskId!=="xiaoyu_print")).toBe(true);
  });
  it("旧存档和跨日清理中止样板，不扣好感或现金，赵刚道具保留且旧占位合同清理",()=>{
    const s=state();s.quests.push(retired("xiaoyu_print"),retired("farmer_delivery"));s.inventory.task_vegetable_crate=2;s.inventory.task_print_original=1;s.inventory.task_toy_bear=1;
    s.quests.push({id:"old",type:"story",title:"旧合同",icon:"",desc:"",status:"active",day:0,commission:{npcId:"npc_zhao_gang"} as any});const money=s.player.money,rel=JSON.stringify(s.relationships);
    const loaded=migrateSave(s);expect(loaded.quests.some(q=>q.npcTask)).toBe(false);expect(loaded.quests.some(q=>q.id==="old")).toBe(false);expect(loaded.inventory.task_vegetable_crate).toBeUndefined();expect(loaded.inventory.task_toy_bear).toBe(1);expect(loaded.player.money).toBe(money);expect(JSON.stringify(loaded.relationships)).toBe(rel);
    tickNpcTasks(s);expect(s.player.money).toBe(money);expect(JSON.stringify(s.relationships)).toBe(rel);refreshDailyQuests(s);const quests=s.quests;for(let i=0;i<100;i++)tickNpcTasks(s);expect(s.quests).toBe(quests);
  });
});
describe("用户反馈：开发物品仓库分类",()=>{
  it("每件物品只属于一个细分类，衣服和家具从大量装备中拆开",()=>{
    for(const item of ITEMS)expect(Object.keys(DEVELOPER_ITEM_CATEGORIES).filter(id=>id!=="all"&&developerItemMatchesCategory(item,id))).toEqual([developerItemCategory(item)]);
    expect(developerItemCategory(getItem("cyan_jacket")!)).toBe("clothing");expect(developerItemCategory(getItem("bed_basic")!)).toBe("furniture");expect(developerItemCategory(getItem("laptop")!)).toBe("electronics");expect(developerItemCategory(getItem("task_toy_bear")!)).toBe("quest_items");
  });
});
describe("用户反馈：住宅凹角相机稳定性",()=>{
  it("所有户型靠墙旋转保持固定俯角与距离，允许镜头穿出外墙",()=>{
    for(const plan of Object.values(HOME_FLOOR_PLANS))for(const anchor of Object.values(plan.anchors)){
      const target=clampHomePoint(plan,...anchor!.position,HOME_CAMERA_TARGET_INSET);
      let outside=false;for(let i=0;i<72;i++){const yaw=i*Math.PI/36,pose=homeCameraPose(plan,target,yaw,4.8);expect(pose.radius).toBe(4.8);expect(pose.pitch).toBeCloseTo(-Math.atan(.91),10);expect((pose.height-.62)/pose.radius).toBeCloseTo(.91,8);outside ||= !pointInsideHome(plan,...pose.eye);}expect(outside).toBe(true);
    }
  },15000);
  it("凹角掠过的连续转动不会突然跳出数米，目标平移也不受凹角碰撞干扰",()=>{
    const plan=HOME_FLOOR_PLANS.apartment,target=clampHomePoint(plan,5.6,4.8,HOME_CAMERA_TARGET_INSET);let previous=homeCameraPose(plan,target,0,4.8);
    for(let yaw=.005;yaw<=Math.PI*2;yaw+=.005){const pose=homeCameraPose(plan,target,yaw,4.8);expect(Math.hypot(pose.eye[0]-previous.eye[0],pose.eye[1]-previous.eye[1])).toBeLessThan(.12);previous=pose;}
    let position=clampHomePoint(plan,7,3,HOME_CAMERA_TARGET_INSET);const goal:[number,number]=[4.3,6.3];for(let i=0;i<500;i++){position=moveHomeCameraTarget(plan,position,[position[0]+(goal[0]-position[0])*.15,position[1]+(goal[1]-position[1])*.15]);expect(pointInsideHome(plan,...position)).toBe(true);}expect(Math.hypot(position[0]-goal[0],position[1]-goal[1])).toBeLessThan(.003);
  });
  it("剖切墙面的缓冲区避免微小视角扰动反复升降",()=>{const plan=HOME_FLOOR_PLANS.apartment,wall=[4.5,0,4.5,3.45],target:[number,number]=[2,3.6];for(const dz of [-.01,.01]){expect(homeWallHeight(plan,wall,target,[6,3.6+dz],"cutaway",HOME_LOW_WALL_HEIGHT)).toBe(HOME_LOW_WALL_HEIGHT);expect(homeWallHeight(plan,wall,target,[6,3.6+dz],"cutaway",2.65)).toBe(2.65);}expect(homeWallHeight(plan,wall,target,[6,3.6],"full")).toBe(2.65);});
});
