import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {ensureRelationship,findRelationship} from '../src/game/core/relationships';
import {gameDay,weekdayOf} from '../src/game/core/calendar';
import {npcCasualTopics,beginNpcConversation,npcConversationView,advanceNpcConversation,commitNpcConversation,type NpcConversationSession} from '../src/game/core/npcTalk';
import {npcDialogueBeats} from '../src/game/core/npcDialoguePlayback';
import {NPC_GROUP_SCENES,npcGroupDayFlag} from '../src/game/data/npcGroupScenes';
import {dialogueStageFor} from '../src/game/core/npcDialogueStaging';
import {npcPortraitForDialogue,preloadUnmaskedPortraits} from '../src/game/core/npcPortraits';
const ids=['npc_fan_kexi','npc_fan_kejie'];
function sceneState(){const s=createInitialState(731);s.flags.npc_introduction_m02_complete=true;while(weekdayOf(s.time)!==2)s.time.day++;s.time.hour=17;s.time.minute=10;s.locationId='dev_food_street';s.region='development_university';for(const id of ids)ensureRelationship(s,id);return s;}
function begin(s=sceneState(),id=ids[0]){const topic=npcCasualTopics(s,id).find(t=>t.id.startsWith('group:'));expect(topic).toBeDefined();const result=beginNpcConversation(s,id,'chat',topic!.id);expect(result.ok,result.reason).toBe(true);return result.session!;}
function complete(s:ReturnType<typeof sceneState>,session=begin(s),branch=0){let result=session;for(const option of [branch,0,0]){const next=advanceNpcConversation(s,result,option);expect(next.ok,next.reason).toBe(true);result=next.session!;}expect(result.status).toBe('ended');return result;}

describe('shared NPC conversation scenes',()=>{
  it('offers the same scene from either sibling only at their real shared time and place',()=>{
    const s=sceneState(),before=JSON.stringify(s);for(const id of ids)expect(npcCasualTopics(s,id).some(t=>t.id.startsWith('group:'))).toBe(true);expect(JSON.stringify(s)).toBe(before);
    s.time.hour=16;expect(npcCasualTopics(s,ids[0]).some(t=>t.id.startsWith('group:'))).toBe(false);s.time.hour=18;expect(npcCasualTopics(s,ids[1]).some(t=>t.id.startsWith('group:'))).toBe(false);s.time.hour=17;s.region='downtown_center';expect(npcCasualTopics(s,ids[0]).some(t=>t.id.startsWith('group:'))).toBe(false);
  });
  it('requires knowing both participants and keeps blocked or absent participants out of the scene',()=>{
    const s=sceneState();findRelationship(s,ids[1])!.state='blocked';expect(npcCasualTopics(s,ids[0]).some(t=>t.id.startsWith('group:'))).toBe(false);s.relationships=s.relationships.filter(r=>r.npcId!==ids[1]);expect(findRelationship(s,ids[1])).toBeUndefined();expect(npcCasualTopics(s,ids[0]).some(t=>t.id.startsWith('group:'))).toBe(false);
  });
  it('carries explicit speakers and raw actions without assigning quoted names to a speaker',()=>{
    const s=sceneState(),session=begin(s,ids[1]),view=npcConversationView(s,session)!;
    const beats=npcDialogueBeats(view.text,session.npcId,view.speeches);expect(view.participants).toEqual(ids);expect(beats.map(b=>b.speakerId)).toEqual([null,ids[0],ids[1],ids[0]]);expect(beats[1].portraitText).toContain('微笑');expect(beats[1].text).not.toContain('帆布包');
    expect(npcDialogueBeats('',ids[0],[{speakerId:ids[0],text:'柯杰说过：“我很生气。”我倒觉得还好。'}])[0].speakerId).toBe(ids[0]);
  });
  it('keeps both branches temporary, then settles both participants and one time cost atomically',()=>{
    for(const branch of [0,1]){const s=sceneState(),before=JSON.stringify(s),ended=complete(s,begin(s),branch);expect(JSON.stringify(s)).toBe(before);const committed=commitNpcConversation(s,ended);expect(committed.ok,committed.reason).toBe(true);expect(JSON.stringify(s)).toBe(before);const d=committed.state!;for(const id of ids){expect(findRelationship(d,id)!.affinity-findRelationship(s,id)!.affinity).toBe(1);expect(d.flags[`npc_dialogue_days_${id}`]).toBe(1);expect(d.flags[`npc_chat_count_${id}`]).toBe(id===ended.npcId?1:undefined);}expect(committed.summary!.timeCost).toBe(.1);expect(d.time.minute-s.time.minute).toBe(6);expect(d.player.money).toBe(s.player.money);expect(d.flags[npcGroupDayFlag(ended.groupSceneId!)]).toBe(gameDay(s.time));expect(committed.summary!.deltas.filter(d=>d.key.startsWith('affinity:'))).toHaveLength(2);expect(npcCasualTopics(d,ids[1]).some(t=>t.id.startsWith('group:'))).toBe(false);}
  });
  it('rejects duplicate settlement from the same or the other sibling',()=>{
    const s=sceneState(),a=complete(s,begin(s,ids[0])),b=complete(s,begin(s,ids[1]));const committed=commitNpcConversation(s,a);expect(committed.ok).toBe(true);expect(commitNpcConversation(committed.state!,a).ok).toBe(false);expect(commitNpcConversation(committed.state!,b).ok).toBe(false);
  });
  it('lets a pure departure leave time, relationships and scene availability untouched',()=>{
    const s=sceneState(),before=JSON.stringify(s),started=begin(s),ended=advanceNpcConversation(s,started,2).session!;const result=commitNpcConversation(s,ended);expect(result.ok).toBe(true);expect(result.state).toBeUndefined();expect(result.summary!.timeCost).toBe(0);expect(JSON.stringify(s)).toBe(before);expect(npcCasualTopics(s,ids[0]).some(t=>t.id.startsWith('group:'))).toBe(true);
  });
  it('rejects stale participant relationships, changes of place or day, and forged choice paths',()=>{
    for(const change of ['relationship','place','day','path']){const s=sceneState(),ended=complete(s);if(change==='relationship')findRelationship(s,ids[1])!.affinity++;if(change==='place')s.locationId='dev_university';if(change==='day')s.time.day+=7;if(change==='path')ended.pending=[];const before=JSON.stringify(s);expect(commitNpcConversation(s,ended).ok,change).toBe(false);expect(JSON.stringify(s)).toBe(before);}
  });
  it('uses one height reference for all three portraits',()=>{
    const a=dialogueStageFor(ids[0],null,ids),b=dialogueStageFor(ids[1],null,ids);expect(a.player.css).toBe(b.player.css);expect(a.npc.faceSize).toBeCloseTo(a.player.faceSize!);expect(b.npc.faceSize).toBeCloseTo(a.player.faceSize!);expect(a.npc.headTop).toBeGreaterThan(a.player.headTop);expect(a.player.headTop).toBeGreaterThan(b.npc.headTop);
  });
  it('keeps facial size stable across clear and concealed art and every speaking expression',async()=>{
    await preloadUnmaskedPortraits();
    for(const id of ids)for(const clear of [false,true])for(const line of ['你好。','（微笑。）','（有些为难。）']){
      const portrait=npcPortraitForDialogue(id,line,'friend','group',clear),stage=dialogueStageFor(id,portrait,ids);
      expect(stage.npc.faceSize).toBeCloseTo(.14);expect(stage.player.faceSize).toBeCloseTo(.14);
      expect(stage.npc.css+stage.player.css).not.toMatch(/NaN|Infinity|scaleX\(|scaleY\(/);
    }
  });
  it('has reachable endings for every authored branch and only uses its declared cast',()=>{
    for(const scene of NPC_GROUP_SCENES){for(const node of Object.values(scene.nodes)){for(const speech of node.speeches)expect(speech.speakerId===null||scene.participants.includes(speech.speakerId)).toBe(true);for(const option of node.options)if(option.next)expect(scene.nodes[option.next]).toBeDefined();}}
  });
});
