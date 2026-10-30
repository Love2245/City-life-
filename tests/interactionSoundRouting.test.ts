import {describe,expect,it} from 'vitest';
import {homeObjectSound,itemUseSound,journeySound,recordedSoundForAction,recordedSoundForLegacy,sceneInteractionSound} from '../src/lib/interactionSoundRouting';

describe('行动与设施的录音选择',()=>{
  it('购买饮料保留交易声，实际喝水与烹饪才使用对应录音',()=>{
    expect(recordedSoundForAction('buy_drink_cafe','coin')).toBe('coins');
    expect(recordedSoundForAction('drink_cafe','success')).toBe('sip');
    expect(recordedSoundForAction('boyue_cook_rice','eat')).toBe('cook');
    expect(recordedSoundForAction('cook_salad','eat')).toBe('chop');
  });
  it('淋浴、洗漱、饮水和开瓶分别匹配实际动作',()=>{
    expect(recordedSoundForAction('shower_home','shower')).toBe('shower');
    expect(recordedSoundForAction('boyue_shower_quick','shower')).toBe('shower');
    expect(recordedSoundForAction('wash_basic','shower')).toBe('tap');
    expect(recordedSoundForAction('boyue_drink_cafe','coin')).toBe('sip');
    expect(recordedSoundForAction('boyue_buy_drink_convenience','coin')).toBe('coins');
    expect(itemUseSound('drink')).toBe('bottle_open');expect(itemUseSound('energy_drink')).toBe('bottle_open');expect(itemUseSound('bread')).toBe('cutlery');
  });
  it('猫粮、酒杯和宗教设施对应物件交互，抽象成功提示仍保留',()=>{
    expect(recordedSoundForAction('cat_feed','eat')).toBe('cat_food');expect(recordedSoundForAction('cat_clean','shower')).toBe('shower');expect(recordedSoundForAction('cat_play','success')).toBe('cat_play');
    expect(recordedSoundForAction('boyue_nightclub_alcohol_60','coin')).toBe('glass');expect(recordedSoundForAction('boyue_lounge_coupon_drink','coin')).toBe('glass');
    expect(recordedSoundForAction('temple_worship','success')).toBe('match');expect(recordedSoundForAction('temple_vegetarian','success')).toBe('cutlery');expect(recordedSoundForAction('church_gospel_box','success')).toBe('drawer');
    expect(recordedSoundForAction('church_mass','success')).toBeUndefined();
  });
  it('按实际交通方案选声，所有交通方式都覆盖',()=>{
    for(const mode of ['same','walk'] as const)expect(journeySound(mode)).toBe('steps');
    for(const mode of ['subway','development_subway','train'] as const)expect(journeySound(mode)).toBe('train');
    for(const mode of ['suburb_bus','bus'] as const)expect(journeySound(mode)).toBe('bus');
    expect(journeySound('car')).toBe('car');expect(journeySound('bike')).toBe('bike');
  });
  it('保留抽象提示和游戏音效，日常行动使用录音',()=>{
    expect(recordedSoundForLegacy('error')).toBeUndefined();expect(recordedSoundForLegacy('battle_win')).toBeUndefined();
    expect(recordedSoundForLegacy('computer')).toBe('keyboard');expect(recordedSoundForLegacy('shower')).toBe('tap');expect(recordedSoundForLegacy('walk')).toBe('steps');
    expect(homeObjectSound('fridge')).toBe('fridge_open');expect(homeObjectSound('storage')).toBe('drawer');expect(homeObjectSound('wardrobe')).toBe('cloth');
  });
  const map={inGame:true,hour:9,sessionKey:1,locationId:'map'};
  it('初次载入、同地时间变化、换档和退出游戏不播放进门声',()=>{
    expect(sceneInteractionSound(null,map)).toBeUndefined();
    expect(sceneInteractionSound(map,{...map,hour:10})).toBeUndefined();
    expect(sceneInteractionSound(map,{...map,sessionKey:2,locationId:'cafe'})).toBeUndefined();
    expect(sceneInteractionSound(map,{...map,inGame:false,locationId:'cafe'})).toBeUndefined();
  });
  it('真实进出住宅和设施使用开关门声，整层办公使用电梯声',()=>{
    expect(sceneInteractionSound(map,{...map,locationId:'old_apartment'})).toBe('door_open');
    expect(sceneInteractionSound({...map,locationId:'boyue_cafe'},map)).toBe('door_close');
    expect(sceneInteractionSound(map,{...map,locationId:'company_office_small'})).toBe('door_open');
    expect(sceneInteractionSound(map,{...map,locationId:'company_office_floor'})).toBe('elevator');
    expect(sceneInteractionSound({...map,locationId:'company_office_floor'},map)).toBe('elevator');
    expect(sceneInteractionSound(map,{...map,locationId:'park'})).toBeUndefined();
    const outside={...map,locationId:'church',admitted:false};
    expect(sceneInteractionSound(map,outside)).toBeUndefined();
    expect(sceneInteractionSound(outside,{...outside,hour:10})).toBeUndefined();
    expect(sceneInteractionSound(outside,{...outside,admitted:true})).toBe('door_open');
    expect(sceneInteractionSound({...outside,admitted:true},outside)).toBe('door_close');
  });
});
