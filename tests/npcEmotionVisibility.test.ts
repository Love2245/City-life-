import {describe,expect,it} from 'vitest';
import {writeFileSync} from 'node:fs';
import {allNpcs} from '../src/game/core/npcs';
import {dialogueLines,dialogueSourceLineAt,npcPortraitForDialogue,preloadUnmaskedPortraits} from '../src/game/core/npcPortraits';
import {npcDialogueMoodForText} from '../src/game/core/npcDialogueEmotion';

function actualLine(npcId:string,needle:string){
  const npc=allNpcs().find(n=>n.id===npcId)!;
  for(const stage of Object.values(npc.talk??{}))for(const node of Object.values(stage.nodes)){
    for(let index=0;index<dialogueLines(node.text).length;index++){
      const text=dialogueSourceLineAt(node.text,index);
      if(text.includes(needle))return text;
    }
  }
  throw Error('Missing current dialogue: '+npcId+' '+needle);
}

describe('实际 NPC 台词的立绘可见性',()=>{
  it('审计当前运行的全部段落，而非旧稿或只包含情绪词的样例',async()=>{
    await preloadUnmaskedPortraits();
    const rows=[];
    for(const npc of allNpcs())for(const [stageKey,stage] of Object.entries(npc.talk??{}))for(const node of Object.values(stage.nodes)){
      for(let index=0;index<dialogueLines(node.text).length;index++){
        const text=dialogueSourceLineAt(node.text,index);
        const mood=npcDialogueMoodForText(npc.id,text);
        const p=npcPortraitForDialogue(npc.id,text,stageKey as any,node.id,false,'casual','summer');
        const visible=!!p.atlas||p.assetVariant!=='default';
        rows.push({npc:npc.id,stage:stageKey,node:node.id,index,text,mood,visible});
        if(mood.intensity>0)expect(visible,npc.id+' '+text).toBe(true);
      }
    }
    if(process.env.NPC_EMOTION_AUDIT||process.env.NPC_PERFORMANCE_AUDIT){
      const folder=process.env.NPC_PERFORMANCE_AUDIT?'npc-dialogue-performance-20261014':'npc-emotion-visible-20261014';
      writeFileSync(`docs/${folder}/corpus-after.json`,JSON.stringify(rows,null,2));
      const {npcDialogueMoodForText:before}=process.env.NPC_PERFORMANCE_AUDIT
        ?await import('../docs/npc-dialogue-performance-20261014/before/src/game/core/npcDialogueEmotion')
        :await import('../docs/npc-emotion-visible-20261014/before/src/game/core/npcDialogueEmotion');
      writeFileSync(`docs/${folder}/corpus-before.json`,JSON.stringify(rows.map(row=>({...row,mood:before(row.npc,row.text),visible:undefined})),null,2));
    }
    expect(rows.length).toBeGreaterThan(500);
  });

  it.each([
    ['npc_lin_xiaoyu','这里能坐','happy',1],
    ['npc_lin_xiaoyu','适合印在饭盒','thoughtful',1],
    ['npc_lin_xiaoyu','我盯着它们两小时','thoughtful',1],
    ['npc_lin_xiaoyu','幸好今天还没给自己买绿裙子','happy',1],
    ['npc_zhao_gang','来看看活，还是找人','neutral',0],
    ['npc_chen_jie','想吃饭还是吃点心','thoughtful',1],
    ['npc_wang_lei','影子都没地方落','happy',1],
    ['npc_netbar_boss','上机，还是找人','thoughtful',1],
    ['npc_librarian','这两种找法不一样','thoughtful',1],
    ['npc_flower_market_owner','慢慢看。我在整理样品','neutral',0],
    ['npc_snack_street_vendor','不是你胆子多大','happy',1],
    ['npc_suburb_farmer','你想看也行','happy',1],
    ['npc_netbar_boss','这一项工作不接受催促','happy',1],
    // 当前收尾是对旧日生活的斟酌，不因提到想念就把旧情绪重演为悲伤。
    ['npc_netbar_boss','想念几个人','thoughtful',1],
    ['npc_netbar_boss','喜欢写自己想做的东西','happy',1],
    ['npc_netbar_boss','说完自己笑了','happy',1],
    ['npc_librarian','猜错有猜错的热闹','happy',1],
    ['npc_librarian','谁笑我，谁继续穿硌脚的','happy',1],
    ['npc_librarian','我最喜欢这种补充','happy',1],
    ['npc_librarian','她还是有点不服','angry',1],
    ['npc_librarian','读了一遍又笑','happy',1],
    ['npc_flower_market_owner','我最爱试这些','happy',1],
    ['npc_flower_market_owner','我舍不得归舍不得','sad',1],
    ['npc_lin_xiaoyu','现在有点不好意思','embarrassed',1],
    ['npc_chen_jie','行，酱料台成图书馆了','happy',1],
    ['npc_wang_lei','自己也笑了','happy',1],
    ['npc_zhao_gang','先别上！','worried',1],
    ['npc_snack_street_vendor','他拿着手机笑出了声','happy',1],
    ['npc_suburb_farmer','不大舍得','sad',1],
  ] as const)('当前稿：%s / %s',(id,needle,category,visualLevel)=>{
    expect(npcDialogueMoodForText(id,actualLine(id,needle))).toMatchObject({category,visualLevel});
  });

  it.each([
    ['npc_flower_market_owner','母亲放下盆'],
    ['npc_librarian','小林看过，批得挺准'],
    ['npc_wang_lei','孙子笑得直蹲下'],
  ])('群像段落不把旁人的笑容画到当前 NPC：%s / %s',(id,needle)=>{
    expect(npcDialogueMoodForText(id,actualLine(id,needle))).toMatchObject({category:'neutral',visualLevel:0});
  });

  it.each([
    ['“我有点难过。”她收好本子，“今天先聊到这儿。”','sad'],
    ['“我有点担心。”她翻开记录，“我再核对一下。”','worried'],
    ['“我有点生气。”她把纸放下，“这件事得说清楚。”','angry'],
    ['“我有点意外。”她抬起头，“再给我看一遍？”','surprised'],
    ['（微笑。）“我有点担心。”','worried'],
  ] as const)('本人引号对白中的明确状态：%s',(text,category)=>{
    expect(npcDialogueMoodForText('npc_librarian',text)).toMatchObject({category,visualLevel:1});
  });

  it('礼貌和工作说明继续保持克制，不为了变化硬套情绪',()=>{
    for(const text of['谢谢你。','价格写在这里。','“先翻几页。”她抽出两本书，“不合适再换。”']){
      expect(npcDialogueMoodForText('npc_librarian',text)).toMatchObject({category:'neutral',visualLevel:0});
    }
  });
});
