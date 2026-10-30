import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import type {GameState} from '../src/game/types';
import {ensureRelationship,findRelationship} from '../src/game/core/relationships';
import {gameDay} from '../src/game/core/calendar';
import {markGreeted} from '../src/game/data/npcGreetings';
import {NPC_DIALOGUE_REMASTER} from '../src/game/data/npcDialogueRemaster';
import {npcChatBoundaryLine} from '../src/game/data/npcChatBoundaries';
import {npcPortraitForDialogue,npcPortraitForContext,preloadNpcPortraitArt} from '../src/game/core/npcPortraits';
import {outfitContextForNpc} from '../src/game/core/npcOutfits';
import {dialogueStageFor} from '../src/game/core/npcDialogueStaging';
import {weekdayOf} from '../src/game/core/calendar';
import {npcDialogueActivity} from '../src/game/data/npcContextDialogues';
import {beginNpcConversation,advanceNpcConversation,commitNpcConversation,npcConversationView,npcChatCountToday,beginNpcFormalConversation,type NpcConversationSession} from '../src/game/core/npcTalk';

const fixtures=[
  ['npc_fan_kejie',3,18,'boyue_lounge_bar','boyue_night_market','我们家小妹'],
  ['npc_fan_kexi',8,11,'western_restaurant','downtown_center','生气是什么样子'],
  ['npc_jack_fanma',3,15,'boyue_gym','boyue_mall','拿我打趣'],
]as const;
function known(fixture:typeof fixtures[number],affinity:number){
  const [id,day,hour,location,region]=fixture,s=createInitialState(931);
  s.time={year:2026,month:8,day,hour,minute:0};s.locationId=location;s.region=region;s.flags.npc_introduction_m02_complete=true;
  const r=ensureRelationship(s,id);r.affinity=affinity;r.state=affinity>=70?'close_friend':affinity>=40?'friend':'acquaintance';
  markGreeted(s,id,gameDay(s.time));return s;
}
function finish(s:GameState,session:NpcConversationSession){
  for(let step=0;session.status==='active'&&step<50;step++){
    const v=npcConversationView(s,session)!;
    const selected=v.options.findIndex(o=>!o.leave&&!o.commissionId);
    const next=advanceNpcConversation(s,session,selected>=0?selected:0);
    expect(next.ok,next.reason).toBe(true);session=next.session!;
  }
  expect(session.status).toBe('ended');return session;
}
function start(s:GameState,id:string){const r=beginNpcConversation(s,id,'chat');expect(r.ok,r.reason).toBe(true);return r.session!;}

describe('新三人的连续闲聊与人物边界',()=>{
  for(const fixture of fixtures)for(const affinity of [5,25,45,80])it(`${fixture[0]} / 好感${affinity}当天三次轮换、第四五次专属提示且下个出场日恢复`,()=>{
    const [id,,,,,upset]=fixture;let s=known(fixture,affinity);
    const preferred=npcDialogueActivity(id,s.locationId)?2:0;
    const scenes=new Set<string>(),texts=new Set<string>();
    for(let chat=1;chat<=3;chat++){
      const session=start(s,id),view=npcConversationView(s,session)!;
      if(chat<=preferred)expect(view.conversationKind).toBe('context');else expect(['daily','topic','event']).toContain(view.conversationKind);
      const scene=session.sceneId?NPC_DIALOGUE_REMASTER[id].scenes[session.sceneId]:undefined;
      if(scene){
        expect(['daily','topic','event']).toContain(scene.kind);expect(session.entry).toBe('chat');
        expect(scene.minAffinity!).toBeLessThanOrEqual(findRelationship(s,id)!.affinity);
      }
      scenes.add(session.contextSceneId??scene!.id);texts.add(view.text);
      if(scene&&scene.locationId!==s.locationId){
        expect(view.text).toContain('说起那边的一件小事');
        expect(view.speeches?.[0].speakerId).toBeNull();
      }
      const before={location:s.locationId,region:s.region},ended=finish(s,session),result=commitNpcConversation(s,ended);
      expect(result.ok,result.reason).toBe(true);s=result.state!;
      expect({location:s.locationId,region:s.region}).toEqual(before);
      expect(npcChatCountToday(s,id)).toBe(chat);expect(result.summary?.timeCost).toBe(chat<=preferred?.1:.5);
      if(chat===3)expect(result.text).toContain(npcChatBoundaryLine(id,'reminder',findRelationship(s,id)!.affinity));
      expect(commitNpcConversation(s,ended).ok).toBe(false);
    }
    expect(scenes.size).toBe(3);expect(texts.size).toBe(3);
    for(const [count,kind]of [[4,'polite'],[5,'upset']]as const){
      const session=start(s,id),v=npcConversationView(s,session)!;
      expect(v.conversationKind).toBe('limit');expect(v.text).toBe(npcChatBoundaryLine(id,kind,findRelationship(s,id)!.affinity));
      if(count===5)expect(v.text).toContain(upset);
      const r=commitNpcConversation(s,finish(s,session));expect(r.ok,r.reason).toBe(true);s=r.state!;
      expect(npcChatCountToday(s,id)).toBe(count);expect(r.summary?.timeCost).toBe(0);
      if(count===5)expect(r.summary?.affinityDelta).toBe(-2);
    }
    expect(beginNpcConversation(s,id,'chat')).toEqual({ok:false,reason:npcChatBoundaryLine(id,'refusal',findRelationship(s,id)!.affinity)});
    // 同一周几的下一次出场，仍由真实排班验证，不把角色固定留在原地。
    s.time.day+=7;s.time.hour=fixture[2];s.time.minute=0;
    expect(npcChatCountToday(s,id)).toBe(0);expect(beginNpcConversation(s,id,'chat').ok).toBe(true);
  });
  it.each(fixtures)('%s取消、未结束提交和旧档缺少新标记都不消耗日常',(...fixture)=>{
    const s=known(fixture,10),id=fixture[0],before=JSON.stringify(s);
    const one=start(s,id),two=start(s,id);
    expect(one.contextSceneId??one.sceneId).toBeTruthy();expect(one.contextSceneId??one.sceneId).toBe(two.contextSceneId??two.sceneId);expect(commitNpcConversation(s,one).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);expect(npcChatCountToday(s,id)).toBe(0);
  });
  it('父母话题归入闲聊并计入次数，完整听过之后不重复',()=>{
    let s=known(fixtures[0],80);const id=fixtures[0][0];
    expect(beginNpcFormalConversation(s,id,'topic:reset_daily_close_friend_d24').ok).toBe(false);
    const formal=beginNpcConversation(s,id,'chat','reset_daily_close_friend_d24');expect(formal.ok,formal.reason).toBe(true);
    const r=commitNpcConversation(s,finish(s,formal.session!));expect(r.ok,r.reason).toBe(true);s=r.state!;
    expect(npcChatCountToday(s,id)).toBe(1);expect(beginNpcConversation(s,id,'chat','reset_daily_close_friend_d24').ok).toBe(false);const next=start(s,id);expect(next.sceneId).not.toBe('reset_daily_close_friend_d24');
  });
  it.each(fixtures)('%s的夏雨冬服装随场景和对话同步切换，九种情绪保持当前服装',async(...fixture)=>{
    const id=fixture[0];
    const lines=['你好。','（微笑。）','我有点难过。','我有点生气。','我有点意外。','（脸红。）','我有点担心。','我有把握。','（想了想。）'];
    const weathers=id!=='npc_fan_kexi'?['summer','rain','winter','autumn']as const:['summer','rain','winter']as const;
    for(const weather of weathers){
      await preloadNpcPortraitArt(id,'casual',weather);
      const preview=npcPortraitForContext(id,'casual','default',true,weather);
      expect(preview.atlas?.outfitKey).toBe(weather);expect(preview.source).toMatch(new RegExp(`${weather}_(?:(?:jstyle|layered)_)?20261016\\.png`));
      const staging=dialogueStageFor(id,preview,[id,'npc_fan_kejie']);
      for(const line of lines){
        const p=npcPortraitForDialogue(id,line,'friend','outfit',true,'casual',weather);
        expect(p.source).toBe(preview.source);expect(p.atlas?.outfitKey).toBe(weather);expect(p.faceOverlay).toBeUndefined();
        expect(dialogueStageFor(id,p,[id,'npc_fan_kejie'])).toEqual(staging);
      }
    }
    expect(npcPortraitForDialogue(id,npcChatBoundaryLine(id,'upset',80),'close_friend','limit',true).emotionCategory).toBe('angry');
  });
  it('珂汐兼职穿工作装，柯杰夜总会及跨午夜均穿当季便服',()=>{
    for(const [id,day,hour,location]of [['npc_fan_kexi',8,12,'western_restaurant'],['npc_fan_kexi',9,12,'boyue_western_restaurant']]as const){
      const s=known(fixtures[id==='npc_fan_kexi'?1:0],25);Object.assign(s.time,{day,hour});s.locationId=location;
      const context=outfitContextForNpc(id,location,{...s.time,seed:s.rng.seed,weekday:weekdayOf(s.time)});
      expect(context).toBe('service');
      const preview=npcPortraitForContext(id,context,'default',true,'rain');
      expect(preview.atlas?.outfitKey).toBe('service');
      expect(npcPortraitForDialogue(id,'你好。','friend','work',true,context,'rain').source).toBe(preview.source);
    }
    for(const [day,hour]of [[7,20],[8,2]]){
      const s=known(fixtures[0],25);Object.assign(s.time,{day,hour});
      const context=outfitContextForNpc('npc_fan_kejie','boyue_nightclub',{...s.time,seed:s.rng.seed,weekday:weekdayOf(s.time)});
      expect(context).toBe('casual');
      expect(npcPortraitForDialogue('npc_fan_kejie','你好。','friend','nightclub',true,context,'autumn').atlas?.outfitKey).toBe('autumn');
    }
    const s=known(fixtures[0],25),context=outfitContextForNpc(fixtures[0][0],'boyue_lounge_bar',{...s.time,seed:s.rng.seed,weekday:weekdayOf(s.time)});
    expect(context).toBe('casual');expect(npcPortraitForDialogue(fixtures[0][0],'你好。','friend','rest',true,context,null).atlas?.outfitKey).toBe('default');
    expect(npcPortraitForDialogue('npc_jack_fanma','你好。','friend','sports',true,'outdoor',null).atlas?.outfitKey).toBe('summer');
  });
});
