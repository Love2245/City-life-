import {describe,expect,it} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {adoptCat} from '../src/game/core/cat';
import {specialTrainCard,focusTrainCard} from '../src/game/core/cardPack';
import {ensureCatDuel,deckOf} from '../src/game/core/catDuelCollection';
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function hospital(){const s=createInitialState(149728602);adoptCat(s,'orange');s.player.money=10000;s.locationId='pet_hospital';s.time.hour=19;s.time.minute=0;return s;}

describe('游戏性排查：医院连续强化的准入与免费组牌',()=>{
  it('强化跨过20点打烊后不能从旧弹窗继续扣款',()=>{
    const s=hospital(),pet=s.pets[0],cards=ensureCatDuel(s).collection;
    expect(specialTrainCard(s,pet.uid,cards[0].uid).ok).toBe(true);expect(s.time.hour).toBe(20);
    const before=copy(s);expect(specialTrainCard(s,pet.uid,cards[1].uid).ok).toBe(false);expect(s).toEqual(before);
  });
  it.each(['away','ending','hospitalized','work'] as const)('%s 状态不能通过遗留医院窗口强化或扣款',kind=>{
    const s=hospital(),pet=s.pets[0],uid=ensureCatDuel(s).collection[0].uid;if(kind==='away')s.locationId='map';if(kind==='ending')s.endingId='survival_bad';if(kind==='hospitalized')s.flags.hospitalized=true;if(kind==='work')s.work!.active={status:'paused'} as any;
    const before=copy(s);expect(specialTrainCard(s,pet.uid,uid).ok).toBe(false);expect(s).toEqual(before);
  });
  it('组牌免费且不销毁收藏，不受原付费删牌营业时间限制',()=>{
    const s=hospital(),pet=s.pets[0],d=ensureCatDuel(s);const card={uid:'dc_13',cardId:'steady',upgraded:false};d.collection.push(card);d.decks[pet.uid]=[...deckOf(s,pet.uid),card.uid];s.time.hour=22;s.locationId='home';
    const before=copy({money:s.player.money,time:s.time,collection:d.collection,flags:s.flags});
    expect(focusTrainCard(s,pet.uid,card.uid)).toEqual({ok:true,cost:0});expect(d.decks[pet.uid]).toHaveLength(12);
    expect({money:s.player.money,time:s.time,collection:d.collection,flags:s.flags}).toEqual(before);
  });
});
