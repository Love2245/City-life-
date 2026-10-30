import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {npcPortraitForDialogue,preloadUnmaskedPortraits} from '../src/game/core/npcPortraits';
import {allNpcs} from '../src/game/core/npcs';
import definitions from '../src/game/data/npcDialogueArt.json';

const lines=['你好。','（微笑。）','我有点难过。','我有点生气。','我有点意外。','（脸红。）','我有点担心。','我有把握。','（想了想。）'];
const categories=['neutral','happy','sad','angry','surprised','embarrassed','worried','confident','thoughtful'];

describe('NPC完整半身对话立绘',()=>{
 it('现役角色和已有天气衣服全部覆盖九种完整表情，源PNG与生成图逐字节一致',()=>{
  expect(Object.keys(definitions).sort()).toEqual(allNpcs().map(n=>n.id).sort());
  let count=0;
  for(const npc of allNpcs()){
   const sheets=definitions[npc.id as keyof typeof definitions];
   for(const weather of ['default','summer','rain','winter','autumn','service']){
    const newNpc=['npc_fan_kejie','npc_fan_kexi','npc_jack_fanma'].includes(npc.id);
    const expected=weather==='default'||(newNpc&&['summer','rain','winter'].includes(weather))||(weather==='autumn'&&['npc_fan_kejie','npc_jack_fanma'].includes(npc.id))||(weather==='service'&&npc.id==='npc_fan_kexi')||existsSync(resolve('src/assets/portraits/unmasked-clean/npc_weather/'+npc.id+'/'+weather+'/default.png'));
    const sheet=sheets[weather as keyof typeof sheets];
    expect(!!sheet,npc.id+'/'+weather).toBe(expected);
    if(!sheet)continue;count++;
    const png=readFileSync(resolve('src/assets/portraits/npc_dialogue/'+npc.id+'/'+sheet.file));
    expect(createHash('sha256').update(png).digest('hex').toUpperCase()).toBe(sheet.sha256);
    expect([png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual([sheet.width,sheet.height]);
    const imported=JSON.parse(readFileSync(resolve('importReport'in sheet?String(sheet.importReport):'docs/npc-dialogue-repair-20261015/ai-art/'+npc.id+'/'+weather+'-import.json'),'utf8'));
    expect(createHash('sha256').update(readFileSync(imported.source)).digest('hex').toUpperCase()).toBe(sheet.sha256);
    expect(sheet.frames).toHaveLength(9);
    for(const frame of sheet.frames){
     expect(frame.viewBox.every(Number.isFinite)).toBe(true);
     expect(frame.viewBox[2]/frame.viewBox[3]).toBeCloseTo(2/3,8);
     expect(frame.clipPath).toMatch(/^M[\d. ]+L/);expect(frame.clipPath.endsWith('Z')).toBe(true);
    }
   }
  }
  expect(count).toBe(43);
 });
 it('九种表情只切换同一图集的完整人物格，不拼接或拉伸五官',async()=>{
  await preloadUnmaskedPortraits();
  for(const npc of allNpcs())for(const weather of[null,'summer','rain','winter']as const){
   const baseline=npcPortraitForDialogue(npc.id,lines[0],'friend','identity',true,'casual',weather);
   const boxes=new Set<string>();
   for(const [index,text]of lines.entries()){
    const p=npcPortraitForDialogue(npc.id,text,'friend','identity',true,'casual',weather);
    expect(p.kind).toBe('dialogue-bust');expect(p.source).toBe(baseline.source);
    expect(p.emotionCategory).toBe(categories[index]);expect(p.faceOverlay).toBeUndefined();
    expect(p.atlas?.viewBox[2]).toBe(baseline.atlas!.viewBox[2]);
    expect(p.atlas?.viewBox[3]).toBe(baseline.atlas!.viewBox[3]);
    boxes.add(p.atlas!.viewBox.join(','));
   }
   expect(boxes.size).toBe(9);
  }
 });
 it('首次见面与旧档未解锁标记都使用完整清晰立绘，不生成马赛克或五官叠层',async()=>{
  await preloadUnmaskedPortraits();
  for(const npc of allNpcs())for(const text of lines){
   const p=npcPortraitForDialogue(npc.id,text,'meet','privacy',false,'casual','summer');
   expect(p.atlas).toBeTruthy();expect(p.source).toContain('npc_dialogue/');
   expect(p).not.toHaveProperty('faceOverlay');
   expect(p).toEqual(npcPortraitForDialogue(npc.id,text,'meet','privacy',true,'casual','summer'));
  }
 });
 it('动作标记可保留在解析结果中，清晰对话仍显示一张完整人物图',async()=>{
  await preloadUnmaskedPortraits();
  const p=npcPortraitForDialogue('npc_lin_xiaoyu','（双手叉腰。）我有把握。','friend','pose',true,'casual',null);
  expect(p.variant).toBe('action_hands_on_hips');expect(p.emotionCategory).toBe('confident');
  expect(p.kind).toBe('dialogue-bust');expect(p.faceOverlay).toBeUndefined();expect(p.assetVariant).toBe('default');
 });
 it('强烈情绪保持同一服装，不因情绪强度自动添加身体动作',async()=>{
  await preloadUnmaskedPortraits();
  for(const npc of allNpcs())for(const weather of[null,'summer','rain','winter']as const){
   const base=npcPortraitForDialogue(npc.id,'你好。','friend','base',true,'casual',weather);
   for(const text of['我很担心。','我现在真的很难过。','（笑出了声。）','我非常有把握。']){
    const p=npcPortraitForDialogue(npc.id,text,'friend','emotion',true,'casual',weather);
    expect(p.source).toBe(base.source);expect(p.assetVariant).toBe('default');
    expect(p.moodIntensity).toBe(2);expect(p.visualLevel).toBe(1);
   }
  }
 });
});
