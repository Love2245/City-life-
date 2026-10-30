import { afterEach,beforeEach,describe, expect, it,vi } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { migrateSave } from '../src/game/core/migrate';
import { enterCasinoRoom, startDistrictLeisure, normalizeDistrictLeisure, stepDistrictLeisure, settleDistrictLeisure,
  type CasinoGameKind, type CasinoRoom, type CasinoSession, type BlackjackSession, type PokerSession } from '../src/game/core/districtLeisure';

// 固定外部熵流，只在本文件比较规则；读档重新随机由 finalization.test.ts 使用真实系统随机源验证。
let entropyWord=137;
beforeEach(()=>{entropyWord=137;vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation(array=>{const words=array as Uint32Array;for(let i=0;i<words.length;i++)words[i]=entropyWord=(Math.imul(1664525,entropyWord)+1013904223)>>>0;return array;});});
afterEach(()=>vi.restoreAllMocks());

function at(room:CasinoRoom='competition', seed=100){
  const s=createInitialState(seed);s.locationId='boyue_texas_shop';s.region='boyue_night_market';
  s.time={year:2026,month:8,day:8,hour:20,minute:0};s.player.money=100000;
  expect(enterCasinoRoom(s,room).ok).toBe(true);s.districtLeisure!.casinoChips=200000;
  return s;
}
const card=(rank:number,suit=0)=>suit*13+rank-2;
function blackjack(player:number[],dealer:number[],forfeited=false){
  const s=at();expect(startDistrictLeisure(s,'blackjack',{currency:'chips',bet:50000}).ok).toBe(true);
  const hand=s.districtLeisure!.active as BlackjackSession;
  Object.assign(hand,{player,dealer,phase:'ready',forfeited});
  return {s,hand};
}
describe('正常牌局与筹码存档',()=>{
  it.each(['blackjack','poker','high_low','slots','roulette_redblack','roulette_highlow','roulette_number'] as CasinoGameKind[])('%s 新旧端点能够保存、载入和完成结算',kind=>{
    for(const [room,bets] of [['leisure',[50,500]],['competition',[1000,50000]]] as const)for(const bet of bets){
      const s=at(room);const options={bet,currency:'chips' as const,choice:kind==='roulette_number'?0:kind==='roulette_redblack'?'red' as const:'high' as const};
      expect(startDistrictLeisure(s,kind,options).ok).toBe(true);
      const snapshot=JSON.stringify(s),loaded=migrateSave(JSON.parse(snapshot));
      const original=s.districtLeisure!.active!,restored=loaded.districtLeisure!.active!;
      expect(restored).toMatchObject({id:original.id,kind:original.kind,bet:'bet'in original?original.bet:bet,paid:original.paid,phase:original.phase});
      if(original.phase==='ready')expect(restored).toEqual(original);
      if('player'in restored&&'player'in original)expect(restored.player).toEqual(original.player);
      if('deck'in restored)expect(new Set(restored.deck).size).toBe(52);
      expect(loaded.districtLeisure!.casinoChips).toBe(s.districtLeisure!.casinoChips);
      expect(loaded.rng).toEqual(s.rng);
      const hand=loaded.districtLeisure!.active!;
      if(hand.phase==='playing')expect(stepDistrictLeisure(loaded,hand.id,{type:kind==='blackjack'?'stand':kind==='poker'?'continue':'reveal'}).ok).toBe(true);
      expect(settleDistrictLeisure(loaded,hand.id).ok).toBe(true);
      expect(Number.isSafeInteger(loaded.districtLeisure!.casinoChips)).toBe(true);
      const once=JSON.stringify(loaded);expect(settleDistrictLeisure(loaded,hand.id).ok).toBe(false);expect(JSON.stringify(loaded)).toBe(once);
    }
  });
  it('旧档20筹码和200筹码未结束的牌局不会因新最低注被删除',()=>{
    for(const [room,legacyBet] of [['leisure',20],['competition',200]] as const)for(const kind of ['blackjack','poker','high_low'] as const){
      const s=at(room);startDistrictLeisure(s,kind,{currency:'chips',bet:room==='leisure'?50:1000});
      const hand=s.districtLeisure!.active!;Object.assign(hand,{bet:legacyBet,paid:legacyBet});
      normalizeDistrictLeisure(s);expect(s.districtLeisure!.active).toEqual(hand);
    }
  });
  it.each([
    [[card(10),card(8)],[card(9,1),card(9,2)],50000],
    [[card(14),card(10)],[card(14,1),card(10,1)],50000],
    [[card(14),card(10)],[card(7,1),card(7,2),card(7,3)],125000],
    [[card(7),card(7,1),card(7,2)],[card(14,1),card(10,1)],0],
    [[card(10),card(9),card(3)],[card(10,1),card(9,1),card(3,1)],0],
  ])('21点保留天然优先级、平局退注和爆牌规则', (p,d,payout)=>{
    const {s,hand}=blackjack(p,d);const r=settleDistrictLeisure(s,hand.id);
    expect(r.result?.payout).toBe(payout);if(payout===50000)expect(r.result?.summary).toContain('平局');
  });
  it('提前弃局不会利用同点取回底注',()=>{
    const {s,hand}=blackjack([card(10),card(8)],[card(9,1),card(9,2)],true);
    expect(settleDistrictLeisure(s,hand.id).result?.payout).toBe(0);
  });
  it('对庄德州最佳五张相同则退回底注与追加注，踢脚牌仍分胜负',()=>{
    for(const tied of [true,false]){
      const s=at();startDistrictLeisure(s,'poker',{currency:'chips',bet:50000});
      const h=s.districtLeisure!.active as PokerSession;
      h.board=tied?[card(10),card(11),card(12),card(13),card(14)]:[card(2),card(5,1),card(8,2),card(9,3),card(13)];
      h.player=[card(14,1),card(3,2)];h.dealer=[card(12,1),card(3,3)];
      stepDistrictLeisure(s,h.id,{type:'continue'});const r=settleDistrictLeisure(s,h.id);
      expect(r.result).toMatchObject({payout:tied?100000:200000,chipDelta:tied?0:100000});
    }
  });
  it.each(['high','low'] as const)('比大小选%s遇到同点平局退注',choice=>{
    const s=at('leisure');startDistrictLeisure(s,'high_low',{currency:'chips',bet:500,choice});
    const h=s.districtLeisure!.active as CasinoSession;h.outcome=[8,8];
    stepDistrictLeisure(s,h.id,{type:'reveal'});const before=s.rng.calls;
    expect(settleDistrictLeisure(s,h.id).result).toMatchObject({payout:500,chipDelta:0,won:false});
    expect(s.rng.calls).toBe(before);
  });
  it('同一外部熵流下，财富、场次与底注不改变牌堆或结果',()=>{
    for(const kind of ['blackjack','poker','high_low','slots','roulette_number'] as const)for(let seed=1;seed<=12;seed++){
      const a=at('leisure',seed),b=at('competition',seed);b.player.money*=100;
      const choice=kind==='roulette_number'?0:'high' as const;
      entropyWord=seed;expect(startDistrictLeisure(a,kind,{currency:'chips',bet:50,choice}).ok).toBe(true);entropyWord=seed;expect(startDistrictLeisure(b,kind,{currency:'chips',bet:50000,choice}).ok).toBe(true);
      const x=a.districtLeisure!.active!,y=b.districtLeisure!.active!;
      if('deck'in x&&'deck'in y){expect(y.deck).toEqual(x.deck);expect(new Set(x.deck).size).toBe(52);}
      if('outcome'in x&&'outcome'in y)expect(y.outcome).toEqual(x.outcome);
    }
  });
});
