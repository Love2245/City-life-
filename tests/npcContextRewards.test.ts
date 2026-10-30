import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import type {GameState} from '../src/game/types';
import {ensureRelationship} from '../src/game/core/relationships';
import {gameDay,weekdayOf} from '../src/game/core/calendar';
import {getNpcDef,npcPresenceAt} from '../src/game/core/npcs';
import {markGreeted,npcGreetingNode} from '../src/game/data/npcGreetings';
import {NPC_DIALOGUE_REMASTER,remasterDailyConversationStart} from '../src/game/data/npcDialogueRemaster';
import {NPC_DIALOGUE_ACTIVITIES,NPC_CONTEXT_DIALOGUES,contextDialogueDayFlag,npcContextDialogueStart} from '../src/game/data/npcContextDialogues';
import {NPC_DIALOGUE_BENEFITS,npcDialogueBenefitClaimed} from '../src/game/data/npcDialogueBenefits';
import {useItem} from '../src/game/core/items';
import {beginNpcConversation,beginNpcFormalConversation,npcFormalTopics,advanceNpcConversation,commitNpcConversation,cancelNpcConversation,npcConversationView,npcChatCountToday,type NpcConversationSession} from '../src/game/core/npcTalk';

function scheduled(npcId:string,locations:readonly string[],affinity=10):GameState{
 const s=createInitialState(931);s.flags.npc_introduction_m02_complete=true;
 const r=ensureRelationship(s,npcId);r.affinity=affinity;r.state=affinity>=70?'close_friend':affinity>=40?'friend':'acquaintance';
 s.player.attrs.satiety=40;s.player.attrs.mood=40;s.player.stress=40;
 for(let day=3;day<=9;day++)for(let hour=7;hour<=21;hour++){
  s.time={year:2026,month:8,day,hour,minute:0};
  const p=npcPresenceAt(getNpcDef(npcId)!,{...s.time,weekday:weekdayOf(s.time),seed:s.rng.seed});
  if(p&&locations.includes(p.locationId)){s.locationId=p.locationId;s.region=p.regionId!;return s;}
 }
 throw new Error(`No scheduled fixture: ${npcId}/${locations}`);
}
function start(s:GameState,id:string){const r=beginNpcConversation(s,id,'chat');expect(r.ok,r.reason).toBe(true);return r.session!;}
function step(s:GameState,c:NpcConversationSession,index=0){const r=advanceNpcConversation(s,c,index);expect(r.ok,r.reason).toBe(true);return r.session!;}
function finish(s:GameState,c:NpcConversationSession,choose:(c:NpcConversationSession)=>number=()=>0){
 for(let i=0;c.status==='active'&&i<50;i++)c=step(s,c,choose(c));
 expect(c.status).toBe('ended');return c;
}
function settle(s:GameState,c:NpcConversationSession){const r=commitNpcConversation(s,c);expect(r.ok,r.reason).toBe(true);return r;}
function exhaustContexts(s:GameState){for(const c of Object.values(NPC_CONTEXT_DIALOGUES))s.flags[contextDialogueDayFlag(c.id)]=gameDay(s.time);}
function literary(npcId:string,affinity:number,id:string):GameState{
 const data=NPC_DIALOGUE_REMASTER[npcId],scene=data.scenes[id],s=scheduled(npcId,[scene.locationId!],affinity);
 markGreeted(s,npcId,gameDay(s.time));exhaustContexts(s);
 // 指定奖励稿件的夹具：其他生活片段已读，避免新的一次性随机池先选中别的故事。
 for(const other of Object.values(data.scenes)){
  if(other.kind==='event')s.flags[`npc_remaster_event_seen_${npcId}_${other.id}`]=true;
  if(other.kind==='topic')s.flags[`npc_remaster_topic_seen_${npcId}_${other.id}`]=true;
  if(other.kind==='daily'&&other.id!==id)s.flags[`npc_remaster_daily_seen_${npcId}_${other.id}`]=true;
 }
 for(let index=0;index<100;index++){
  s.flags[`npc_remaster_talks_${npcId}`]=index;
  if(remasterDailyConversationStart(s,npcId,scene.stageKey as 'acquaintance'|'friend'|'close_friend',affinity)?.sceneId===id)return s;
 }
 throw new Error(`Cannot select literary scene: ${npcId}/${id}`);
}

describe('十二人按当下活动优先闲聊',()=>{
 it('四种偶遇加校园与写字楼短稿均保留明确说话人与有效引用',()=>{
  expect(NPC_DIALOGUE_ACTIVITIES).toHaveLength(7);expect(Object.keys(NPC_CONTEXT_DIALOGUES)).toHaveLength(20);
  expect(new Set(NPC_DIALOGUE_ACTIVITIES.map(a=>a.id))).toEqual(new Set(['kexi_service','farmer_fishing','netbar_parts','wang_checkup','kexi_campus','jack_campus','lin_office']));
  for(const c of Object.values(NPC_CONTEXT_DIALOGUES))for(const n of Object.values(c.nodes)){
   expect(n.speeches?.every(s=>s.speakerId===c.activity.npcId)).toBe(true);
   for(const o of n.options)if(o.next)expect(c.nodes[o.next]).toBeDefined();
  }
 });
 for(const activity of NPC_DIALOGUE_ACTIVITIES.filter(a=>!a.introCount))it(`${activity.id}真实排班连续两段专属、第三次日常备选，不挪动NPC`,()=>{
  let s=scheduled(activity.npcId,activity.locations);const original={location:s.locationId,region:s.region};
  const seen=new Set<string>();
  for(let i=0;i<3;i++){
   const c=start(s,activity.npcId),v=npcConversationView(s,c)!;
   expect(v.conversationKind).toBe(i<2?'context':'daily');
   if(i<2){expect(c.sceneId).toBeUndefined();expect(c.greetingNode).toBeUndefined();seen.add(c.contextSceneId!);}
   // 普通备选的最后一句也要回到正在忙的事。
   const end=finish(s,c),last=npcConversationView(s,{...end,status:'active'});
   if(i===2)expect(last?.text).toContain(activity.closing);
   const r=settle(s,end);s=r.state!;
   expect(r.summary?.timeCost).toBe(i<2?.1:.5);expect(npcChatCountToday(s,activity.npcId)).toBe(i+1);
   expect({location:s.locationId,region:s.region}).toEqual(original);
   if(i<2){expect(s.flags[contextDialogueDayFlag(c.contextSceneId!)]).toBe(gameDay(s.time));expect(s.flags[`npc_remaster_talks_${activity.npcId}`]).toBeUndefined();}
  }
  expect(seen.size).toBe(2);
  expect(npcConversationView(s,start(s,activity.npcId))!.conversationKind).toBe('limit');
 });
 it('取消、提前提交不消耗稿件；下一个正常出场日再轮换，不覆盖旧故事进度',()=>{
  let s=scheduled('npc_wang_lei',['hospital']);s.flags.npc_remaster_event_seen_npc_wang_lei_reset_story_e01=true;
  const c=start(s,'npc_wang_lei'),before=JSON.stringify(s);
  expect(commitNpcConversation(s,c).ok).toBe(false);expect(commitNpcConversation(s,cancelNpcConversation(c)).ok).toBe(false);
  expect(start(s,'npc_wang_lei').contextSceneId).toBe(c.contextSceneId);expect(JSON.stringify(s)).toBe(before);
  const ended=finish(s,c);s=settle(s,ended).state!;expect(commitNpcConversation(s,ended).ok).toBe(false);
  s.time.day+=7;s.time.minute=0;expect(npcContextDialogueStart(s,'npc_wang_lei')).toBeDefined();
  expect(s.flags.npc_remaster_event_seen_npc_wang_lei_reset_story_e01).toBe(true);expect(npcChatCountToday(s,'npc_wang_lei')).toBe(0);
 });
 it('主动话题不被工作稿顶替，闲暇地点也不套上工作语气',()=>{
  const s=scheduled('npc_fan_kejie',['boyue_lounge_bar'],45);
  const r=beginNpcConversation(s,'npc_fan_kejie','chat','reset_topic_t03');expect(r.ok,r.reason).toBe(true);
  expect(r.session?.sceneId).toBe('reset_topic_t03');expect(r.session?.contextSceneId).toBeUndefined();
  const leisure=scheduled('npc_jack_fanma',['boyue_lounge_bar'],45);expect(start(leisure,'npc_jack_fanma').contextSceneId).toBeUndefined();
 });
 it('常驻工作、上课、锻炼地点不再使用特殊短稿',()=>{
  for(const [id,locations]of [
   ['npc_fan_kejie',['snack_street','boyue_lounge_bar','boyue_arcade']],
   ['npc_jack_fanma',['boyue_gym','boyue_ball_court','engineering_college']],
   ['npc_chen_jie',['fast_food']],['npc_ma_dafu',['chinese_restaurant']],
   ['npc_netbar_boss',['netbar']],['npc_suburb_farmer',['farm']],
   ['npc_fan_kexi',['normal_college']],
  ]as const){
   for(const locationId of locations){const s=createInitialState(931);s.locationId=locationId;
    expect(npcContextDialogueStart(s,id),`${id}/${locationId}`).toBeUndefined();}
  }
 });
 it('换地点、无效场景或修改选项不能结算',()=>{
  const s=scheduled('npc_wang_lei',['hospital']),c=finish(s,start(s,'npc_wang_lei')),before=JSON.stringify(s);
  expect(commitNpcConversation(s,{...c,contextSceneId:'context_missing'}).ok).toBe(false);
  const forged=structuredClone(c);forged.pending[0].option.effects={money:99999};expect(commitNpcConversation(s,forged).ok).toBe(false);
  const moved=structuredClone(s);moved.locationId='park';expect(commitNpcConversation(moved,c).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
 });
});

describe('实际接受才结算食物和物品',()=>{
 it('用户指出的赵刚分馒头原文：接受才吃、婉拒不领，结束写明馒头',()=>{
  const s=literary('npc_zhao_gang',5,'reset_daily_acquaintance_d01'),c=start(s,'npc_zhao_gang');
  expect(c.sceneId).toBe('reset_daily_acquaintance_d01');
  const yes=settle(s,finish(s,c)),no=settle(s,finish(s,start(s,'npc_zhao_gang'),c=>c.nodeId.endsWith('_intro')?1:0));
  expect(yes.state!.player.attrs.satiety-no.state!.player.attrs.satiety).toBe(8);expect(yes.text).toContain('吃了赵刚分给你的一个馒头');
  expect(no.text).not.toContain('馒头');expect(yes.state!.player.money).toBe(s.player.money);expect(yes.summary?.items).toEqual([]);
 });
 it('赵刚请吃热面：接受补少量饱腹、结束页写出热面，不扣款；婉拒没有食物效果',()=>{
  const s=scheduled('npc_zhao_gang',['snack_street']);
  const c=start(s,'npc_zhao_gang');expect(c.greetingNode?.options[0].dialogueBenefitId).toBe('zhao_noodles');
  const r=settle(s,finish(s,c));expect(r.state!.player.attrs.satiety).toBeGreaterThan(s.player.attrs.satiety+6);
  expect(r.state!.player.money).toBe(s.player.money);expect(r.text).toContain('一小碟热面');expect(r.summary!.items).toEqual([]);
  expect(npcDialogueBenefitClaimed(r.state!,'zhao_noodles')).toBe(true);expect(npcDialogueBenefitClaimed(s,'zhao_noodles')).toBe(false);
  const no=settle(s,finish(s,start(s,'npc_zhao_gang'),()=>1));expect(no.state!.player.attrs.satiety).toBe(s.player.attrs.satiety);expect(no.text).not.toContain('热面');
  expect(JSON.stringify(s)).not.toContain('npc_dialogue_benefit_zhao_noodles');
 });
 for(const [id,sceneId,benefitId,item,needle]of [
  ['npc_lin_xiaoyu','reset_daily_acquaintance_d03','lin_mint','mint_candy','薄荷糖'],
  ['npc_chen_jie','reset_daily_close_friend_d10','chen_apple','fruit','苹果'],
 ]as const)it(`${id}明确收下后进背包，没吃不加饱腹，可在背包使用`,()=>{
  const s=literary(id,id==='npc_lin_xiaoyu'?5:80,sceneId),before=JSON.stringify(s),c=start(s,id);
  expect(c.sceneId).toBe(sceneId);const r=settle(s,finish(s,c));
  expect(r.state!.inventory[item]).toBe((s.inventory[item]??0)+1);expect(r.text).toContain(needle);expect(r.text).toContain('背包');
  expect(r.state!.player.attrs.satiety).toBeLessThanOrEqual(s.player.attrs.satiety);expect(npcDialogueBenefitClaimed(r.state!,benefitId)).toBe(true);
  const after=r.state!.player.attrs.satiety;expect(useItem(r.state!,item).ok).toBe(true);expect(r.state!.player.attrs.satiety).toBeGreaterThan(after);
  const refused=settle(s,finish(s,start(s,id),c=>c.nodeId.endsWith('_intro')?1:0));expect(refused.state!.inventory[item]??0).toBe(s.inventory[item]??0);expect(refused.text).not.toContain('你收下');
  expect(JSON.stringify(s)).toBe(before);expect(commitNpcConversation(r.state!,finish(s,c)).ok).toBe(false);
 });
 it('王磊包子与网咖饼干有明确吃/不吃分支，实际差值与小份量一致',()=>{
  for(const [id,scene,benefit,needle]of [
   ['npc_wang_lei','reset_daily_close_friend_d10','wang_bun','萝卜包子'],
   ['npc_netbar_boss','reset_daily_close_friend_d10','netbar_cookie','饼干'],
  ]as const){
   const s=literary(id,80,scene),c=start(s,id),yes=settle(s,finish(s,c));
   const no=settle(s,finish(s,start(s,id),c=>id==='npc_netbar_boss'?(c.nodeId.endsWith('_choice_1')?1:0):(c.nodeId.endsWith('_intro')?1:0)));
   expect(yes.state!.player.attrs.satiety-no.state!.player.attrs.satiety).toBe(NPC_DIALOGUE_BENEFITS[benefit].effects.satiety);
   expect(yes.text).toContain(needle);expect(yes.summary?.items).toEqual([]);expect(no.text).not.toMatch(/你吃了/);
  }
 });
 it('马师傅试吃问候的接受和提前告辞分开，不会看见端盘就自动领取',()=>{
  const s=scheduled('npc_snack_street_vendor',['snack_street']);
  const canTaste=()=>npcPresenceAt(getNpcDef('npc_snack_street_vendor')!,{...s.time,weekday:weekdayOf(s.time),seed:s.rng.seed})?.locationId==='snack_street'&&npcGreetingNode('npc_snack_street_vendor','snack_street',15,gameDay(s.time))!.options[0].dialogueBenefitId==='ma_tasting';
  s.time.hour=15;for(let i=0;i<30&&!canTaste();i++)s.time.day++;
  const c=start(s,'npc_snack_street_vendor');expect(c.greetingNode?.options[0].dialogueBenefitId).toBe('ma_tasting');
  expect(commitNpcConversation(s,c).ok).toBe(false);expect(npcDialogueBenefitClaimed(s,'ma_tasting')).toBe(false);
  const yes=settle(s,finish(s,c));expect(yes.text).toContain('新出锅小吃');
  const no=settle(s,finish(s,c,()=>1));expect(no.text).not.toContain('你尝了');
  expect(yes.state!.player.attrs.satiety).toBeGreaterThan(no.state!.player.attrs.satiety);
 });
 it('当天已领取不可重领，次日恢复；错误NPC/无绑定的奖励不能伪造',()=>{
  const s=scheduled('npc_zhao_gang',['snack_street']),ended=finish(s,start(s,'npc_zhao_gang')),r=settle(s,ended),after=r.state!;
  delete after.flags.npc_greet_day_npc_zhao_gang;
  const repeated=start(after,'npc_zhao_gang');expect(npcConversationView(after,repeated)!.options.some(o=>o.dialogueBenefitId==='zhao_noodles')).toBe(false);
  after.time.day+=7;after.time.hour=s.time.hour;after.time.minute=0;expect(npcDialogueBenefitClaimed(after,'zhao_noodles')).toBe(false);
  const forged=structuredClone(ended);forged.pending[0].option.dialogueBenefitId='lin_mint';expect(commitNpcConversation(s,forged).ok).toBe(false);
 });
 it('纯回忆、看照片、NPC自己的食物没有自动发物品，正文赠物配置仍保留',()=>{
  const s=literary('npc_fan_kejie',45,'reset_daily_friend_d14');
  const r=settle(s,finish(s,start(s,'npc_fan_kejie')));expect(r.summary?.items).toEqual([]);
  for(const [id,b]of Object.entries(NPC_DIALOGUE_BENEFITS))expect(getNpcDef(b.npcId),id).toBeDefined();
  const greeting=npcGreetingNode('npc_netbar_boss','internet_cafe',12,12)!;expect(greeting.options.every(o=>!o.dialogueBenefitId)).toBe(true);
 });
 for(const id of ['npc_chen_jie','npc_netbar_boss','npc_librarian','npc_flower_market_owner','npc_snack_street_vendor','npc_suburb_farmer'])
 it(id+'不再从正式对话生成占位帮助奖励',()=>{
  const s=scheduled(id,[getNpcDef(id)!.meetLocation],75),before=JSON.stringify(s);
  expect(npcFormalTopics(s,id)).toEqual([]);
  expect(JSON.stringify(s)).toBe(before);
 });
});
