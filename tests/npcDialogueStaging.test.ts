import {describe,it,expect} from 'vitest';
import {dialogueStageFor} from '../src/game/core/npcDialogueStaging';
import {npcPortraitForDialogue,preloadUnmaskedPortraits} from '../src/game/core/npcPortraits';
import {allNpcs} from '../src/game/core/npcs';
import staging from '../src/game/data/npcDialogueStaging.json';
import sheets from '../src/game/data/npcDialogueArt.json';

describe('对话身高与统一半身取景',()=>{
  it('全员每套服装均有独立标尺，不能把新图静默当作旧默认图缩放',()=>{
    for(const [id,outfits] of Object.entries(sheets)){
      const actor=(staging as Record<string,any>)[id];
      expect(actor,`${id} staging`).toBeTruthy();
      for(const outfit of Object.keys(outfits)){
        expect(Object.hasOwn(actor.art,outfit),`${id}/${outfit} head calibration`).toBe(true);
        expect(Object.hasOwn(actor.faceSpan.art,outfit),`${id}/${outfit} face calibration`).toBe(true);
      }
    }
  });
  it('旧角色所有服装与九种表情共用玩家脸部尺度，换装不移动同框镜头',()=>{
    for(const [id,outfits] of Object.entries(sheets)){
      let cameraTop:number|undefined;
      for(const [outfit,sheet] of Object.entries(outfits)){
        const base=npcPortraitForDialogue(id,'你好。','friend','stage',true);
        for(const frame of sheet.frames){
          const portrait={...base,atlas:{...base.atlas!,outfitKey:outfit,viewBox:frame.viewBox as [number,number,number,number]}};
          const value=dialogueStageFor(id,portrait);
          expect(value.npc.faceSize,`${id}/${outfit}`).toBeCloseTo(value.player.faceSize!,8);
          if(cameraTop===undefined)cameraTop=value.player.headTop;
          expect(value.player.headTop).toBeCloseTo(cameraTop,8);
          for(const actor of [value.player,value.npc]){
            const height=Number(actor.css.match(/--dialogue-art-height:([^%]+)%/)![1]),top=Number(actor.css.match(/--dialogue-art-top:([^%]+)%/)![1]);
            expect(height+top,`${id}/${outfit} must reach dialogue edge`).toBeGreaterThanOrEqual(100);
          }
        }
      }
    }
  });
  it('王磊夏装与带帽陈叔缩放整张图；短半身不会悬空或挤乱身高关系',()=>{
    for(const id of ['npc_wang_lei','npc_suburb_farmer']){
      const value=dialogueStageFor(id,npcPortraitForDialogue(id,'你好。','friend','stage',true,'casual','summer'));
      expect(value.npc.faceSize).toBe(value.player.faceSize);
      expect(value.npc.headTop-value.player.headTop).toBeCloseTo((176-value.npc.heightCm)/24*.32,8);
    }
    const cast=['npc_wang_lei','npc_suburb_farmer'];
    const wang=dialogueStageFor(cast[0],npcPortraitForDialogue(cast[0],'你好。','friend','stage',true,'casual','summer'),cast);
    const farmer=dialogueStageFor(cast[1],npcPortraitForDialogue(cast[1],'你好。','friend','stage',true,'casual','rain'),[...cast].reverse());
    expect(wang.player).toEqual(farmer.player);
    expect(farmer.npc.headTop-wang.npc.headTop).toBeCloseTo(1/24*.32,8);
  });
  it('夏装兄妹的实际脸部跨度与玩家一致，换季不会改变头脸尺度或站位身高',()=>{
    const cast=['npc_fan_kejie','npc_fan_kexi'];
    for(const weather of ['summer','rain','winter','autumn'] as const){
      for(const id of cast){
        const portrait=npcPortraitForDialogue(id,'你好。','friend','stage',true,'casual',weather),value=dialogueStageFor(id,portrait,cast);
        expect(value.npc.faceSize).toBeCloseTo(value.player.faceSize!,6);
        expect(value.npc.headSize/value.player.headSize).toBeGreaterThan(.8);
        expect(value.npc.headSize/value.player.headSize).toBeLessThan(1.15);
      }
    }
    const summer=dialogueStageFor('npc_fan_kexi',npcPortraitForDialogue('npc_fan_kexi','你好。','friend','stage',true,'casual','summer'),cast);
    const defaultArt=dialogueStageFor('npc_fan_kexi',npcPortraitForDialogue('npc_fan_kexi','你好。','friend','stage',true),cast);
    expect(summer.npc.headSize).toBeGreaterThan(defaultArt.npc.headSize); // Long hair still exists; its canvas is scaled uniformly.
    expect(summer.npc.headSize).toBeLessThan(summer.player.headSize*1.1);
  });
  it('杰克只比范柯杰稍高，主角与杰克的差距小于一个头',async()=>{
    await preloadUnmaskedPortraits();
    const p=npcPortraitForDialogue('npc_jack_fanma','你好。','friend','stage',true);
    const stage=dialogueStageFor('npc_jack_fanma',p);
    expect(stage.npc.heightCm).toBe(190);expect(stage.player.heightCm).toBe(176);
    expect(stage.npc.headTop).toBe(0);
    expect(stage.player.headTop-stage.npc.headTop).toBeLessThan(stage.npc.headSize);
    expect(stage.player.faceSize).toBe(stage.npc.faceSize);
    const cast=['npc_jack_fanma','npc_fan_kejie'];
    const jack=dialogueStageFor(cast[0],p,cast).npc;
    const kejie=dialogueStageFor(cast[1],npcPortraitForDialogue(cast[1],'你好。','friend','stage',true),cast).npc;
    expect(kejie.headTop-jack.headTop).toBeCloseTo(.08,6);
    expect(kejie.faceSize).toBe(jack.faceSize);
  });
  it('矮于主角的角色略低，表情切换不改变取景和身高',async()=>{
    await preloadUnmaskedPortraits();
    for(const npc of allNpcs())for(const weather of[null,'summer','rain','winter']as const){
      const base=dialogueStageFor(npc.id,npcPortraitForDialogue(npc.id,'你好。','friend','stage',true,'casual',weather));
      if(base.npc.faceSize!==undefined)expect(base.player.faceSize).toBe(base.npc.faceSize);
      else expect(base.player.headSize).toBe(base.npc.headSize);
      // A short bust must reach the shared dialogue edge rather than float above it.
      for(const actor of[base.player,base.npc]){const height=Number(actor.css.match(/--dialogue-art-height:([^%]+)%/)![1]),top=Number(actor.css.match(/--dialogue-art-top:([^%]+)%/)![1]);expect(height+top,`${npc.id}/${weather} lower edge`).toBeGreaterThanOrEqual(100);}
      expect((base.npc.headTop-base.player.headTop)*(base.npc.heightCm-base.player.heightCm)).toBeLessThanOrEqual(0);
      for(const line of['（微笑。）','我有点难过。','我有点意外。','（脸红。）']){
        const stage=dialogueStageFor(npc.id,npcPortraitForDialogue(npc.id,line,'friend','stage',true,'casual',weather));
        expect(stage).toEqual(base);
        expect(stage.player.css+stage.npc.css).not.toMatch(/NaN|Infinity|scaleX\(|scaleY\(/);
      }
    }
  });
  it('旧档未揭示状态也使用清晰半身素材与统一标尺，无需改动存档',()=>{
    for(const npc of allNpcs()){
      const p=npcPortraitForDialogue(npc.id,'你好。','meet','stage',false);
      const stage=dialogueStageFor(npc.id,p);
      if(stage.npc.faceSize!==undefined)expect(stage.npc.faceSize).toBe(stage.player.faceSize);
      else expect(stage.npc.headSize).toBe(stage.player.headSize);
      expect(stage.npc.css).not.toMatch(/NaN|Infinity/);
      expect(p.atlas).toBeTruthy();expect(p.source).toContain('npc_dialogue');
    }
  });
});
