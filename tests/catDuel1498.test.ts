import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {adoptCat} from '../src/game/core/cat';
import {migrateSave,SAVE_VERSION} from '../src/game/core/migrate';
import {DUEL_CARDS,STARTER_CARDS,getDuelCard} from '../src/game/core/catDuelCards';
import {ensureCatDuel,collectionDefId,deckOf,deckCheck,saveDuelDeck,makeDuelOffer,chooseDuelOffer} from '../src/game/core/catDuelCollection';
import {startBattle,playCard,endPlayerTurn,settleBattle,previewDuelCard,enemyDamage,allOpponents,startFunMatch} from '../src/game/core/catBattle';
import {specialTrainCard,hospitalWeeklyUsed,focusTrainCard} from '../src/game/core/cardPack';
import {signupTournament,startTournament,startNextTournamentBattle} from '../src/game/core/tournament';
import type {GameState} from '../src/game/types';

export function fixture(seed=1498,cat='orange'):GameState{
  const s=createInitialState(seed);s.mode='eternal';adoptCat(s,cat);s.pets[0].level=100;s.player.money=10000;s.time.hour=12;
  s.locationId='pet_hospital';s.player.attrs.health=s.player.attrs.stamina=s.player.attrs.satiety=s.player.attrs.mood=100;return s;
}
export function build(s:GameState,ids:string[],plus=false):void{
  const d=ensureCatDuel(s);const uids:string[]=[];
  for(const id of ids){const uid=`dc_${++d.sequence}`;d.collection.push({uid,cardId:id,upgraded:plus});uids.push(uid);}
  expect(saveDuelDeck(s,s.activePet!,uids)).toEqual({ok:true});
}
function hand(s:GameState,ids:string[]):string[]{const b=s.catBattle!;b.playerHand=ids.map((id,i)=>{const uid=`test_${b.duel!.sequence}_${i}`;b.duel!.cards[uid]=id;return uid;});return [...b.playerHand];}

describe('1.498 共享收藏、牌组与迁移',()=>{
  it('36种牌各有一个实际改善的＋形态，基础收藏为6种×2张',()=>{
    const s=fixture();expect(DUEL_CARDS).toHaveLength(36);expect(new Set(DUEL_CARDS.map(c=>c.id)).size).toBe(36);
    for(const c of DUEL_CARDS){const plus=getDuelCard(c.id+'_plus')!;expect(plus.upgraded).toBe(true);expect(plus.cost!==c.cost||plus.desc!==c.desc).toBe(true);}
    expect(ensureCatDuel(s).collection).toHaveLength(12);expect(deckOf(s,s.activePet!)).toHaveLength(12);
  });
  it('共享收藏不随领养第二只猫重复赠送，猫咪可分别保存牌组',()=>{
    const s=fixture();const d=ensureCatDuel(s);const n=d.collection.length;const other=adoptCat(s,'mint')!;
    expect(d.collection.length).toBe(n);expect(deckCheck(s,deckOf(s,other.uid)).ok).toBe(true);
    expect(saveDuelDeck(s,other.uid,[...deckOf(s,other.uid)].reverse()).ok).toBe(true);
    expect(deckOf(s,s.activePet!)).not.toEqual(deckOf(s,other.uid));
  });
  it('12–20张、同一实体一次、同名普通与＋合计2张，且可实际伤害敌人',()=>{
    const s=fixture();const d=ensureCatDuel(s);const initial=deckOf(s,s.activePet!);
    expect(deckCheck(s,initial.slice(0,11)).ok).toBe(false);expect(deckCheck(s,[...initial,initial[0]]).ok).toBe(false);
    const extra={uid:'dc_90',cardId:'scratch',upgraded:true};d.collection.push(extra);
    expect(deckCheck(s,[...initial,extra.uid]).reason).toContain('合计最多');
    const names=DUEL_CARDS.filter(c=>!STARTER_CARDS.includes(c.id)).slice(0,9).map(c=>c.id);
    const added=names.map((cardId,i)=>({uid:`extra_${i}`,cardId,upgraded:false}));d.collection.push(...added);
    expect(deckCheck(s,[...initial,...added.slice(0,8).map(c=>c.uid)]).ok).toBe(true);
    expect(deckCheck(s,[...initial,...added.map(c=>c.uid)]).ok).toBe(false);
  });
  it('迁移37版卡包：品质/强化映射＋，副本与旧猫记录保留，重复读档不重复导入',()=>{
    const s=fixture();s.version=37;delete s.catDuel;s.pets[0].cardPack=[{uid:'cp_1',defId:'scratch_q2_b4'},{uid:'cp_2',defId:'guard'}];
    const pet=JSON.stringify(s.pets[0]);const migrated=migrateSave(JSON.parse(JSON.stringify(s)));
    expect(migrated.version).toBe(38);expect(SAVE_VERSION).toBe(38);expect(JSON.stringify(migrated.pets[0])).toBe(pet);
    const d=ensureCatDuel(migrated);const old=d.collection.find(c=>c.legacy?.entryUid==='cp_1')!;
    expect(old.upgraded).toBe(true);expect(old.legacy).toMatchObject({quality:2,bonus:4,defId:'scratch_q2_b4'});
    expect(deckCheck(migrated,deckOf(migrated,migrated.activePet!)).ok).toBe(true);
    const count=d.collection.length;expect(ensureCatDuel(migrateSave(JSON.parse(JSON.stringify(migrated)))).collection.length).toBe(count);
  });
  it('旧进行中战斗可恢复且不重复扣次数或时间',()=>{
    const s=fixture();expect(startBattle(s,'wild_stray',undefined,{casual:true}).ok).toBe(true);
    delete s.catBattle!.duel;s.version=37;const money=s.player.money,time=JSON.stringify(s.time);s.flags.cat_fun_match_count=2;
    const migrated=migrateSave(JSON.parse(JSON.stringify(s)));expect(migrated.catBattle).toBeUndefined();expect(migrated.catDuel?.recovery?.opponentId).toBe('wild_stray');
    expect(startFunMatch(migrated).ok).toBe(true);expect(migrated.player.money).toBe(money);expect(JSON.stringify(migrated.time)).toBe(time);expect(migrated.flags.cat_fun_match_count).toBe(2);
  });
  it('合法旧牌组映射后保留原构成与顺序，无效旧配置仍可追溯',()=>{
    const s=fixture();s.version=37;delete s.catDuel;const ids=['venom_bite','web_trap','drowsy_spores','guard','catnap','catalyst'].flatMap(id=>[id,id]);
    s.pets[0].cardPack=ids.map((defId,i)=>({uid:'old_'+i,defId}));const loaded=migrateSave(JSON.parse(JSON.stringify(s))),d=ensureCatDuel(loaded);
    expect(deckOf(loaded,s.activePet!).map(uid=>d.collection.find(c=>c.uid===uid)!.cardId)).toEqual(ids);expect(d.legacyDecks?.[s.activePet!]).toEqual(s.pets[0].cardPack);
  });
  it('三选一卡优先未收藏；选择仅收入收藏，不修改牌组，收据只能使用一次',()=>{
    const s=fixture();const before=[...deckOf(s,s.activePet!)];const offer=makeDuelOffer(s,'duel')!;
    expect(offer.choices).toHaveLength(3);expect(new Set(offer.choices).size).toBe(3);expect(offer.choices.every(id=>!STARTER_CARDS.includes(id))).toBe(true);
    expect(chooseDuelOffer(s,offer.id,offer.choices[1]).ok).toBe(true);expect(ensureCatDuel(s).collection).toHaveLength(13);expect(deckOf(s,s.activePet!)).toEqual(before);
    expect(chooseDuelOffer(s,offer.id,offer.choices[0]).ok).toBe(false);expect(ensureCatDuel(s).collection).toHaveLength(13);
  });
  it('收齐每种两张后仍有三选一奖励，优先补足的卡不足三种时以其它普通牌补齐',()=>{
    const s=fixture(),d=ensureCatDuel(s);for(const def of DUEL_CARDS)while(d.collection.filter(c=>c.cardId===def.id).length<2)d.collection.push({uid:'dc_'+(++d.sequence),cardId:def.id,upgraded:false});
    d.collection=d.collection.filter(c=>c.cardId!=='catalyst');const offer=makeDuelOffer(s,'duel')!;expect(offer.choices).toHaveLength(3);expect(offer.choices[0]).toBe('catalyst');expect(new Set(offer.choices).size).toBe(3);
    chooseDuelOffer(s,offer.id,'catalyst');const second=makeDuelOffer(s,'duel')!;expect(second.choices[0]).toBe('catalyst');chooseDuelOffer(s,second.id,'catalyst');expect(makeDuelOffer(s,'duel')!.choices).toHaveLength(3);
  });
});

describe('1.498 医院与赛事事务',()=>{
  it('单张永久＋，只扣一次款/时间/次数，引用该实例的牌组自动更新',()=>{
    const s=fixture();const d=ensureCatDuel(s);const selected=d.collection[0],other=d.collection[1];const oldDeck=[...deckOf(s,s.activePet!)];
    expect(specialTrainCard(s,s.activePet!,selected.uid)).toMatchObject({ok:true,cost:200,newDefId:'scratch_plus'});
    expect(selected.upgraded).toBe(true);expect(other.upgraded).toBe(false);expect(deckOf(s,s.activePet!)).toEqual(oldDeck);
    expect(specialTrainCard(s,s.activePet!,selected.uid).ok).toBe(false);expect(s.player.money).toBe(9800);expect(s.time.hour).toBe(13);expect(hospitalWeeklyUsed(s,'special')).toBe(1);
  });
  it('每周200/400/600，3次后拒绝且不扣款',()=>{
    const s=fixture();const d=ensureCatDuel(s);expect(d.collection.slice(0,3).map(c=>specialTrainCard(s,s.activePet!,c.uid).cost)).toEqual([200,400,600]);
    const money=s.player.money;expect(specialTrainCard(s,s.activePet!,d.collection[3].uid).ok).toBe(false);expect(s.player.money).toBe(money);expect(hospitalWeeklyUsed(s,'special')).toBe(3);
  });
  it('余额不足、打烊、工作、已强化、无效卡均不会扣款或次数',()=>{
    for(const type of ['poor','closed','working','unknown']){
      const s=fixture();if(type==='poor')s.player.money=0;if(type==='closed')s.time.hour=22;if(type==='working')s.flags.hospitalized=true;
      const money=s.player.money;expect(specialTrainCard(s,s.activePet!,type==='unknown'?'missing':ensureCatDuel(s).collection[0].uid).ok).toBe(false);expect(s.player.money).toBe(money);expect(hospitalWeeklyUsed(s,'special')).toBe(0);
    }
  });
  it('开赛冻结牌组和强化，换猫不能绕过锁定，每场重置80生命',()=>{
    const s=fixture();s.time.day=2;s.time.hour=14;expect(signupTournament(s,'tournament_primary').ok).toBe(true);expect(startTournament(s).ok).toBe(true);expect(s.catTournament!.entry!.lockedDeck?.cards).toHaveLength(12);expect(startNextTournamentBattle(s).ok).toBe(true);
    const first=s.catBattle!;expect(first.player.hp).toBe(80);expect(saveDuelDeck(s,s.activePet!,deckOf(s,s.activePet!)).ok).toBe(false);expect(specialTrainCard(s,s.activePet!,ensureCatDuel(s).collection[0].uid).ok).toBe(false);
    first.player.hp=7;first.finished=true;first.won=true;first.phase='over';settleBattle(s);
    expect(s.catDuel?.offer).toBeUndefined();expect(startNextTournamentBattle(s).ok).toBe(true);expect(s.catBattle!.player.hp).toBe(80);
  });
  it('免费移出牌组不销毁收藏，也不会付费删除卡牌',()=>{
    const s=fixture();const n=ensureCatDuel(s).collection.length,money=s.player.money;
    const r=focusTrainCard(s,s.activePet!,deckOf(s,s.activePet!)[0]);expect(r.ok).toBe(false);expect(ensureCatDuel(s).collection.length).toBe(n);expect(s.player.money).toBe(money);
  });
});

describe('1.498 战斗结算与预览',()=>{
  it('不同猫种、等级、训练与饰品统一80生命/3能量/5手牌',()=>{
    for(const cat of ['orange','mint','golden']){const s=fixture(7,cat);s.pets[0].attrs={hp:9999,atk:999,def:999,spd:999};s.pets[0].accessory='ac_crown';s.ownedAccessories.ac_crown=1;
      expect(startBattle(s,'wild_stray').ok).toBe(true);const b=s.catBattle!;expect(b.player.hp).toBe(80);expect(b.player.attrs).toEqual({hp:80,atk:10,def:10,spd:0});expect(b.playerEnergy).toBe(3);expect(b.playerHand).toHaveLength(5);expect(b.playerStrength).toBe(0);}
  });
  it('预览与力量/虚弱/易伤/格挡/多段实际一致，并且预览不修改原战斗',()=>{
    const s=fixture();startBattle(s,'wild_stray');const b=s.catBattle!;b.opponent.hp=b.opponent.attrs.hp=200;b.opponentBlock=5;b.playerStrength=2;b.duel!.conditions.player.weak=1;b.duel!.conditions.opponent.vulnerable=2;
    const [uid]=hand(s,['flurry_plus']);const before=JSON.stringify(b);const preview=previewDuelCard(b,uid);expect(JSON.stringify(b)).toBe(before);
    const hp=b.opponent.hp;expect(playCard(s,uid).ok).toBe(true);expect(hp-b.opponent.hp).toBe(preview.damage);expect(preview.absorbed).toBe(5);expect(b.playerEnergy).toBe(2);
    expect(b.duel!.events.some(e=>e.type==='damage'&&e.side==='opponent')).toBe(true);
  });
  it('已公布的敌方招式不重掷，虚弱只改变真实伤害',()=>{
    const s=fixture();startBattle(s,'wild_stray');const b=s.catBattle!;const intent=JSON.stringify(b.enemyIntent),raw=enemyDamage(b);
    const [uid]=hand(s,['web_trap']);playCard(s,uid);expect(JSON.stringify(b.enemyIntent)).toBe(intent);expect(enemyDamage(b)).toBeLessThan(raw);
  });
  it('我方易伤按敌方行动衰减，意图伤害与实际扣血一致',()=>{
    const s=fixture();startBattle(s,'wild_stray');const b=s.catBattle!;b.duel!.conditions.player.vulnerable=1;
    const predicted=enemyDamage(b),before=b.player.hp;endPlayerTurn(s);expect(before-b.player.hp).toBe(predicted);expect(b.duel!.conditions.player.vulnerable).toBe(0);
  });
  it('回合弃牌、重洗、消耗实例分离，重复牌可分别打出，收藏完整',()=>{
    const s=fixture();startBattle(s,'wild_stray');const b=s.catBattle!;b.opponent.hp=999;const n=ensureCatDuel(s).collection.length;
    const [a,c]=hand(s,['scratch','scratch','catnap']);playCard(s,a);expect(b.playerHand).toContain(c);expect(playCard(s,c).ok).toBe(true);
    const nap=b.playerHand[0];playCard(s,nap);expect(b.duel!.exhaustPile).toContain(nap);expect(ensureCatDuel(s).collection).toHaveLength(n);
    b.playerDrawPile=[];endPlayerTurn(s);expect(b.turn).toBe(2);expect(b.playerHand.length).toBeGreaterThan(0);expect(b.playerHand).not.toContain(nap);
  });
  it('睡眠/麻痹旧牌转为易伤/虚弱，不随机跳过玩家整回合',()=>{
    const s=fixture();startBattle(s,'opp_web');const b=s.catBattle!;b.player.hp=999;
    for(let i=0;i<6&&!b.finished;i++){endPlayerTurn(s);expect(b.playerEnergy).toBe(3);expect(b.phase).toBe('player');}
    expect(getDuelCard('web_trap')!.effect.weak).toBeGreaterThan(0);expect(getDuelCard('drowsy_spores')!.effect.vulnerable).toBeGreaterThan(0);
  });
  it('胜负结算一次，竞技HP不回写生活猫咪，选牌与钱不会重复发放',()=>{
    const s=fixture();s.pets[0].curHp=37;startBattle(s,'wild_stray',undefined,{casual:true});const b=s.catBattle!;b.finished=true;b.won=true;b.phase='over';b.player.hp=3;
    expect(settleBattle(s)?.won).toBe(true);const snap=JSON.stringify(s);expect(settleBattle(s)).toBeNull();expect(JSON.stringify(s)).toBe(snap);expect(s.pets[0].curHp).toBe(37);expect(s.catDuel?.offer?.choices.length).toBe(3);
  });
  it('保存并读取后，手牌/意图/随机游标及下一回合完全一致',()=>{
    const s=fixture();startBattle(s,'wild_stray');const reloaded=migrateSave(JSON.parse(JSON.stringify(s)));endPlayerTurn(s);endPlayerTurn(reloaded);expect(reloaded.catBattle).toEqual(s.catBattle);
  });
  it('防反按攻击段数生效，新卡不再保留格挡到下一回合',()=>{
    const s=fixture();startBattle(s,'wild_stray');const b=s.catBattle!;b.opponent.hp=b.opponent.attrs.hp=200;
    b.enemyIntent={kind:'attack',name:'双击',icon:'',value:3,hits:2};const [a,c]=hand(s,['guard_plus','counter_stance']);playCard(s,a);playCard(s,c);
    const hp=b.opponent.hp;endPlayerTurn(s);expect(hp-b.opponent.hp).toBe(8);expect(b.player.hp).toBe(80);expect(b.playerBlock).toBe(0);expect(b.duel!.retaliate).toBe(0);
  });
  it('闪电护层只吃一段、幽灵薄影限制每段，旧档中毒状态继续结算',()=>{
    const s=fixture();startBattle(s,'opp_lightning');const b=s.catBattle!;b.opponent.hp=b.opponent.attrs.hp=200;
    const [uid]=hand(s,['flurry_plus']);expect(previewDuelCard(b,uid).damage).toBe(5);playCard(s,uid);expect(b.duel!.dodgeLayer).toBe(false);
    const g=fixture();startBattle(g,'opp_ghost');const ghost=g.catBattle!;ghost.turn=2;ghost.opponent.hp=ghost.opponent.attrs.hp=200;const [v]=hand(g,['venom_bite']);playCard(g,v);expect(ghost.opponent.hp).toBe(199);expect(ghost.duel!.conditions.opponent.poison).toBe(0);ghost.duel!.conditions.opponent.poison=3;endPlayerTurn(g);expect(ghost.opponent.hp).toBe(196);
  });
  it('护卫受伤预览准确，消灭最后护卫后本体接收溢出伤害',()=>{
    const s=fixture();startBattle(s,'opp_necro');const b=s.catBattle!;b.opponent.hp=b.opponent.attrs.hp=200;const [uid]=hand(s,['golden_exclusive']);
    const p=previewDuelCard(b,uid);expect(p.minionDamage).toBe(24);expect(p.damage).toBe(12);playCard(s,uid);expect(b.mechanicState!.minions).toBe(0);expect(b.opponent.hp).toBe(188);
  });
  it('战士式卡池没有中毒翻倍、条件连击、保留格挡、穿透或能量退款',()=>{
    for(const def of DUEL_CARDS.flatMap(c=>[c,getDuelCard(c.id+'_plus')!])){for(const key of ['poison','poisonFactor','combo','comboBonus','retainBlock','pierce','energy'])expect((def.effect as any)[key],def.id+':'+key).toBeUndefined();}
  });
  it('盾爪按当前格挡出伤，不额外记上限；强化只把费用降到0',()=>{
    const s=fixture();startBattle(s,'wild_stray');const b=s.catBattle!;b.playerBlock=41;b.opponent.hp=b.opponent.attrs.hp=200;const [uid]=hand(s,['shield_claw_plus']);expect(previewDuelCard(b,uid).damage).toBe(41);expect(playCard(s,uid).ok).toBe(true);expect(b.playerEnergy).toBe(3);expect(b.playerBlock).toBe(41);expect(b.opponent.hp).toBe(159);
  });
  it('新施加的易伤不在同一次敌方行动结束时立即损失一回合',()=>{
    const s=fixture();startBattle(s,'wild_stray');const b=s.catBattle!;b.enemyIntent={kind:'skill',name:'看破弱点',icon:'',value:0,status:'sleep'};endPlayerTurn(s);expect(b.duel!.conditions.player.vulnerable).toBe(2);
  });
  it('结构化事件不依赖名字；喵/喵喵与空名字仍能区分伤害方向',()=>{
    const s=fixture();s.pets[0].name='喵';startBattle(s,'wild_stray');s.catBattle!.opponent.name='喵喵';const [uid]=hand(s,['scratch']);playCard(s,uid);
    expect(s.catBattle!.duel!.events.filter(e=>e.type==='damage').at(-1)?.side).toBe('opponent');
  });
  it('全部对手可按新规则开战，特殊机制有状态而非随机整回合禁用',()=>{
    for(const o of allOpponents()){const s=fixture();expect(startBattle(s,o.id).ok,o.id).toBe(true);expect(s.catBattle!.duel?.rulesVersion).toBe(2);}
  });
  it('试玩结算不发钱/经验/卡牌，不改变猫咪状态',()=>{
    const s=fixture();s.flags.cat_duel_practice=true;const pet=JSON.stringify(s.pets[0]),money=s.player.money;startBattle(s,'wild_stray');s.catBattle!.finished=true;s.catBattle!.won=true;settleBattle(s);
    expect(s.player.money).toBe(money);expect(JSON.stringify(s.pets[0])).toBe(pet);expect(s.catDuel?.offer).toBeUndefined();
  });
});
