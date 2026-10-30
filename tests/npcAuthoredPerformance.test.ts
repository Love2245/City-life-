import { describe, expect, it } from 'vitest';
import data from '../src/game/data/npcDialoguePerformance.json';
import { allNpcs } from '../src/game/core/npcs';
import { npcDialogueBeats } from '../src/game/core/npcDialoguePlayback';
import { npcIntroduction } from '../src/game/data/npcSharedIntroductions';
import { npcDialogueMoodForText } from '../src/game/core/npcDialogueEmotion';
import {npcGreetingNode} from '../src/game/data/npcGreetings';
import locations from '../src/game/data/locations.json';

describe('正式稿逐段表现的覆盖与隔离', () => {
  it('当前本人发言都有唯一标注，旁白和玩家发言不进入NPC表现判定', () => {
    const reviewed = new Map(data.rows.map(row => [row.npcId + '\0' + row.text, row]));
    expect(reviewed.size).toBe(data.rows.length);
    const used = new Set<string>(); let paragraphs = 0;
    function check(beats:ReturnType<typeof npcDialogueBeats>){
      for(const beat of beats){
        if(beat.speakerId===null){expect(beat.portraitText).toBe('');continue;}
        if(beat.speakerId==='player')continue;
        const key=beat.speakerId+'\0'+beat.portraitText.trim();
        expect(reviewed.has(key),key).toBe(true);used.add(key);paragraphs++;
        const row=reviewed.get(key)!;
        expect(npcDialogueMoodForText(beat.speakerId,beat.portraitText),key).toMatchObject({category:row.category,intensity:row.intensity});
      }
    }
    for (const npc of allNpcs()) for (const stage of Object.values(npc.talk ?? {})) for (const node of Object.values(stage.nodes)) check(npcDialogueBeats(node.text,npc.id,node.speeches));
    for(const id of ['M01','M02'])for(const node of Object.values(npcIntroduction(id)!.nodes))check(npcDialogueBeats('',npcIntroduction(id)!.participants[0],node.speeches));
    expect(paragraphs).toBeGreaterThan(900);expect(used.size).toBe(data.integration.currentSpokenParagraphs);
    const greetings=new Set<string>();
    for (const npc of allNpcs()) {
      for (const location of new Set(['hospital','bar',npc.meetLocation!, ...locations.map(location=>location.id), ...(npc.weeklySchedule??[]).map(slot=>slot.locationId)])) {
        for (const hour of [6,12,23]) for (let day=1;day<=31;day++) {
          const node=npcGreetingNode(npc.id,location,hour,day);
          if (!node) continue;
          const key=npc.id+'\0'+node.text;
          const row=reviewed.get(key);
          expect(row,key).toBeDefined(); greetings.add(key);
          expect(npcDialogueMoodForText(npc.id,node.text),key).toMatchObject({category:row!.category,intensity:row!.intensity});
        }
      }
    }
    expect(greetings.size).toBe(91);
  });

  it('本人原段落、换行兼容、外人引用和改写稿分别处理，不能借用旧标注', () => {
    const line = '幸好今天还没给自己买绿裙子。';
    expect(npcDialogueMoodForText('npc_lin_xiaoyu', '\r\n  ' + line + '\r\n')).toMatchObject({category:'happy', visualLevel:1});
    expect(npcDialogueMoodForText('npc_zhao_gang', line)).toMatchObject({category:'neutral'});
    expect(npcDialogueMoodForText('npc_lin_xiaoyu', '玩家：' + line)).toMatchObject({category:'neutral'});
    expect(npcDialogueMoodForText('npc_lin_xiaoyu', '朋友说：“' + line + '”')).toMatchObject({category:'neutral'});
    expect(npcDialogueMoodForText('npc_lin_xiaoyu', '幸好今天还没给自己买绿裙子。我现在有点担心。')).toMatchObject({category:'worried'});
  });

  it('标注新的自然语气也保持逐段重置；工作说明与他人的笑不被强制套表情', () => {
    expect(npcDialogueMoodForText('npc_lin_xiaoyu', '选一个，你觉得适合印在饭盒上的。我先不说我的答案，省得你客气。')).toMatchObject({category:'thoughtful',visualLevel:1});
    expect(npcDialogueMoodForText('npc_lin_xiaoyu', '价格写在这里。')).toMatchObject({category:'neutral',visualLevel:0});
    expect(npcDialogueMoodForText('npc_lin_xiaoyu', '（母亲笑出了声。）')).toMatchObject({category:'neutral',visualLevel:0});
    expect(npcDialogueMoodForText('npc_lin_xiaoyu', '（她用指甲刮掉纸袋上的一小点胶。）')).toMatchObject({category:'neutral',visualLevel:0});
  });
});
