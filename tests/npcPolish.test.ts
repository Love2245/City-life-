import {describe,it,expect} from 'vitest';
import {allNpcs,getNpcDef} from '../src/game/core/npcs';
import {npcDialogueBeats} from '../src/game/core/npcDialoguePlayback';
import {npcDialogueMoodForText} from '../src/game/core/npcDialogueEmotion';
import {npcPortraitForContext,npcPortraitForDialogue} from '../src/game/core/npcPortraits';
import {npcIntroduction} from '../src/game/data/npcSharedIntroductions';
import {createInitialState} from '../src/game/core/state';
import {enterRegion} from '../src/game/core/regions';
import {getLocation,isLocationUnlocked,moveTo} from '../src/game/core/actions';

const ids=['npc_fan_kejie','npc_fan_kexi','npc_jack_fanma'];
function speech(npcId:string){
  const own=Object.values(getNpcDef(npcId)!.talk!).flatMap(stage=>Object.values(stage.nodes).flatMap(node=>npcDialogueBeats(node.text,npcId,node.speeches)));
  const group=['M01','M02'].flatMap(id=>Object.values(npcIntroduction(id)!.nodes).flatMap(node=>npcDialogueBeats('',npcId,node.speeches)));
  return [...own,...group].filter(beat=>beat.speakerId===npcId);
}
describe('新三人实际文案的表情与清晰立绘',()=>{
  it.each([
    ['npc_fan_kejie','新买的。攒了好久','happy'],
    ['npc_fan_kejie','嗓子就开始不配合','embarrassed'],
    ['npc_fan_kejie','都死了。','angry'],
    ['npc_fan_kejie','问题是我只有一个','thoughtful'],
    ['npc_jack_fanma','这家的汉堡不行','angry'],
    ['npc_jack_fanma','刚才丢脸的人已经够多','embarrassed'],
    ['npc_jack_fanma','我练过，今天能一口气说完','confident'],
    ['npc_jack_fanma','别笑。我不是以为它能把我怎么样','worried'],
    ['npc_fan_kexi','偏偏就是我看中的那个','sad'],
    ['npc_fan_kexi','我自己也挺满意','happy'],
    ['npc_fan_kexi','我反而更不好意思','embarrassed'],
    ['npc_fan_kexi','给我气的','angry'],
    ['npc_fan_kexi','我打扫、做饭多一点','thoughtful'],
  ])('%s 本人发言 %s 在初见也实际显示 %s 完整人物格',(id,cue,category)=>{
    const beat=speech(id).find(beat=>beat.portraitText.includes(cue));expect(beat).toBeDefined();
    expect(npcDialogueMoodForText(id,beat!.portraitText).category).toBe(category);
    const p=npcPortraitForDialogue(id,beat!.portraitText,'meet','test',false);
    const neutral=npcPortraitForDialogue(id,'你好。','meet','test',false);
    expect(p.kind).toBe('dialogue-bust');expect(p.source).toBe(neutral.source);
    expect(p.atlas!.key).not.toBe(neutral.atlas!.key);expect(p.atlas!.viewBox).not.toEqual(neutral.atlas!.viewBox);
    expect(p).not.toHaveProperty('faceOverlay');
  });
  it('清晰素材在预加载和认识之前就可用，包含全部角色、服务场景和缺失天气差分的回退',()=>{
    for(const npc of allNpcs())for(const context of ['casual','service','outdoor','market'] as const)for(const weather of [null,'summer','rain','winter'] as const){
      const p=npcPortraitForContext(npc.id,context,'default',false,weather);
      expect(p.source,npc.id+'/'+context+'/'+weather).toMatch(/\/(?:unmasked-clean|npc_dialogue)\//);
      expect(npcPortraitForDialogue(npc.id,'（微笑。）','meet','test',false,context,weather).atlas).toBeTruthy();
    }
  });
  it('共同初见与资料页都明确柯杰为哥哥、珂汐为妹妹',()=>{
    expect(getNpcDef('npc_fan_kejie')!.desc).toContain('妹妹');
    expect(getNpcDef('npc_fan_kexi')!.desc).toContain('双胞胎妹妹');
    const text=Object.values(npcIntroduction('M01')!.nodes).flatMap(n=>n.speeches.map(s=>s.text)).join('\n');
    expect(text).toContain('我是他妹妹');expect(text).toContain('我比她早一点');expect(text).not.toMatch(/我是姐姐|纠正一遍/);
  });
  it.each(['development_university','boyue_university'])('%s 八月即可进入公共街区，校园仍受门禁限制',region=>{
    const s=createInitialState(8);s.time={year:2026,month:8,day:3,hour:10,minute:0};
    expect(enterRegion(s,region).ok).toBe(true);
    const food=region==='development_university'?'dev_food_street':'boyue_food_street';
    expect(moveTo(s,food).ok).toBe(true);
    for(const campus of ['dev_university','boyue_engineering_college'])expect(isLocationUnlocked(s,getLocation(campus))).toBe(false);
  });
});
