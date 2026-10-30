import {describe,expect,it} from 'vitest';
import {npcDialogueMoodForText} from '../src/game/core/npcDialogueEmotion';
import {dialoguePortraitSourceLineAt,npcPortraitForContext,npcPortraitForDialogue,preloadUnmaskedPortraits} from '../src/game/core/npcPortraits';
import {allNpcs} from '../src/game/core/npcs';

describe('逐段对白的情绪等级',()=>{
  it.each([
    ['谢谢你。','neutral',0,'default'],
    ['不错。','neutral',0,'default'],
    ['（微笑。）我挺开心的。','happy',1,'expression_smile'],
    ['“我有点担心。”','worried',1,'expression_worried'],
    ['我有点难过。','sad',1,'expression_sad'],
    ['我有点生气。','angry',1,'expression_angry'],
    ['我有点意外。','surprised',1,'expression_surprised'],
    ['（脸红。）','embarrassed',1,'expression_embarrassed'],
    ['我有点担心这件事。','worried',1,'expression_worried'],
    ['我有把握。','confident',1,'expression_confident'],
    ['（想了想。）','thoughtful',1,'expression_thinking'],
    ['我现在真的很难过。','sad',1,'expression_sad'],
    ['我很担心这件事。','worried',1,'expression_worried'],
    ['我非常有把握，这次能做好。','confident',1,'expression_confident'],
    ['（笑出了声。）','happy',1,'expression_smile'],
    ['（抱臂。）我有点不满。','angry',2,'action_arms_crossed'],
    ['（手一摊。）','neutral',2,'action_shrug'],
    ['（捧腹大笑。）','happy',1,'expression_smile'],
    ['我不高兴。','angry',1,'expression_angry'],
    ['我不开心。','sad',1,'expression_sad'],
    ['我没把握。','worried',1,'expression_worried'],
  ] as const)('%s', (text,category,visualLevel,variant)=>{
    expect(npcDialogueMoodForText('npc_unknown',text)).toMatchObject({category,visualLevel,variant});
  });
  it.each([
    '朋友说他很生气。','以前我很难过。','当年我很担心，今天只核对一下资料。',
    '我不是不高兴。','我不担心。','以前我不开心。','朋友说他没把握。',
    '如果我很生气，我会走开。','她说：“我特别开心。”','玩家：我特别开心。',
    '范珂汐：我很难过。','（林小雨笑出了声。）','（主角抱臂。）','（回忆起以前抱臂的样子。）',
    '（没有抱臂。）','（母亲笑出了声。）','（没有哭出声。）','她说：“（笑出了声。）”','昨天我很难过。',
  ])('不把转述、否定、假设或别人的情绪演到当前人身上：%s',text=>{
    expect(npcDialogueMoodForText('npc_zhao_gang',text)).toMatchObject({category:'neutral',visualLevel:0,variant:'default'});
  });
  it('新角色与主角的署名台词只驱动本人的情绪',()=>{
    const text='范珂汐：我有点担心。\n玩家：（抱臂。）我有点不满。';
    expect(npcDialogueMoodForText('npc_fan_kexi',text)).toMatchObject({category:'worried',visualLevel:1});
    expect(npcDialogueMoodForText('player',text)).toMatchObject({category:'angry',visualLevel:2});
    expect(npcDialogueMoodForText('npc_fan_kejie',text)).toMatchObject({category:'neutral'});
  });
  it('换到下一段时独立判断，不继承上一段的生气',()=>{
    const text='我有点生气。\n（把杯子挪开。）\n价格写在这里。';
    expect(npcDialogueMoodForText('npc_chen_jie',dialoguePortraitSourceLineAt(text,0,'npc_chen_jie')).category).toBe('angry');
    for(const index of [1,2])expect(npcDialogueMoodForText('npc_chen_jie',dialoguePortraitSourceLineAt(text,index,'npc_chen_jie')).category).toBe('neutral');
  });
  it('12位角色的八种情绪使用同一服装图集中的完整立绘',async()=>{
    await preloadUnmaskedPortraits();
    const cases=['（微笑。）','我有点难过。','我有点生气。','我有点意外。','（脸红。）','我有点担心。','我有把握。','（想了想。）'];
    for(const npc of allNpcs())for(const weather of [null,'winter'] as const){
      const base=npcPortraitForDialogue(npc.id,'你好。','friend','test',true,'casual',weather);
      for(const text of cases){
        const p=npcPortraitForDialogue(npc.id,text,'friend','test',true,'casual',weather);
        expect(p.source,npc.id+' '+text).toBe(base.source);
        expect(p.assetVariant).toBe('default');expect(p.visualLevel).toBe(1);
        expect(p.atlas,npc.id+' '+text).toBeTruthy();expect(p.faceOverlay).toBeUndefined();
        const hidden=npcPortraitForDialogue(npc.id,text,'meet','test',false,'casual',weather);
        expect(hidden.atlas).toEqual(p.atlas);expect(hidden.source).toBe(p.source);
        expect(hidden).not.toHaveProperty('faceOverlay');expect(hidden.assetVariant).toBe('default');
      }
    }
  });
  it('天气服装保留原衣服，使用同类完整表情立绘',async()=>{
    await preloadUnmaskedPortraits();
    const base=npcPortraitForDialogue('npc_lin_xiaoyu','你好。','friend','test',true,'casual','winter');
    const expressive=npcPortraitForDialogue('npc_lin_xiaoyu','我现在真的很难过。','friend','test',true,'casual','winter');
    expect(expressive.source).toBe(base.source);expect(expressive.visualLevel).toBe(1);
    expect(expressive.emotionCategory).toBe('sad');expect(expressive.atlas).toBeTruthy();
  });
  it('强烈担心也保持当前身体，不发明托腮动作或替换成悲伤整图',()=>{
    const p=npcPortraitForDialogue('npc_jack_fanma','我很担心。','friend','test',false);
    expect(p.emotionCategory).toBe('worried');expect(p.assetVariant).toBe('default');
    expect(p.moodIntensity).toBe(2);expect(p.visualLevel).toBe(1);
  });
  it("当前12位NPC的69张情绪图均可从遮挡和清晰资源路由加载", async () => {
    await preloadUnmaskedPortraits();
    const npcIds = allNpcs().map(({ id }) => id);
    expect(npcIds).toHaveLength(12);
    const sharedVariants = [
      "emotion_happy",
      "emotion_disappointed",
      "emotion_angry",
      "emotion_surprised",
      "emotion_sad",
    ] as const;
    const familyVariants = ["emotion_worried", "emotion_embarrassed", "emotion_confident"] as const;
    const familyNpcIds = ["npc_fan_kejie", "npc_jack_fanma", "npc_fan_kexi"] as const;

    for (const unmasked of [false, true]) {
      for (const npcId of npcIds) {
        for (const variant of sharedVariants) {
          const portrait = npcPortraitForContext(npcId, "casual", variant, unmasked);
          expect(portrait.variant).toBe(variant);
          expect(portrait.source).toContain(
            `/portraits/unmasked-clean/${npcId}/${variant}.png`,
          );
        }
      }
      for (const npcId of familyNpcIds) {
        for (const variant of familyVariants) {
          const portrait = npcPortraitForContext(npcId, "casual", variant, unmasked);
          expect(portrait.variant).toBe(variant);
          expect(portrait.source).toContain(
            `/portraits/unmasked-clean/${npcId}/${variant}.png`,
          );
        }
      }
    }
  });
});
