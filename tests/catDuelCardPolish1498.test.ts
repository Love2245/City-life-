import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {adoptCat} from '../src/game/core/cat';
import {startBattle,playCard,endPlayerTurn,previewDuelCard,enemyDamage} from '../src/game/core/catBattle';
import {DUEL_CARDS,getDuelCard} from '../src/game/core/catDuelCards';
import {resolveDuelCard} from '../src/game/core/catDuelCombat';
import {migrateSave} from '../src/game/core/migrate';
import {printedCardRules} from '../src/lib/catDuelPresentation';
import type {GameState} from '../src/game/types';

function fixture(){const s=createInitialState(149830);adoptCat(s,'orange');startBattle(s,'wild_stray');const b=s.catBattle!;b.opponent.hp=b.opponent.attrs.hp=300;return s;}
function hand(s:GameState,ids:string[]){const b=s.catBattle!;b.playerHand=ids.map((id,i)=>{const uid='polish_'+i;b.duel!.cards[uid]=id;return uid;});return [...b.playerHand];}

describe('1.498 战士卡牌微调',()=>{
  it('重击的力量倍率、虚弱、易伤及格挡与实际命中一致，预览不写回原状态',()=>{
    const s=fixture(),b=s.catBattle!;const [uid]=hand(s,['heavy_strike']);b.playerStrength=3;b.duel!.conditions.player.weak=1;b.duel!.conditions.opponent.vulnerable=2;b.opponentBlock=8;
    const before=JSON.stringify(b),p=previewDuelCard(b,uid);expect(JSON.stringify(b)).toBe(before);expect(p.damage).toBe(17);expect(p.absorbed).toBe(8);expect(p.detail.join(' ')).toContain('力量加成×3');
    expect(printedCardRules(getDuelCard('heavy_strike')!).join(' ')).toContain('×3');expect(getDuelCard('heavy_strike_plus')!.desc).toContain('4 倍');
    expect(playCard(s,uid).ok).toBe(true);expect(b.opponent.hp).toBe(283);expect(b.playerEnergy).toBe(1);
  });
  it('普通卡与缺少倍率字段的旧卡仍按一倍力量结算',()=>{
    const s=fixture(),b=s.catBattle!;b.playerStrength=3;const hp=b.opponent.hp;resolveDuelCard(b,{...getDuelCard('scratch')!,effect:{power:6}});expect(hp-b.opponent.hp).toBe(9);
    const loaded=migrateSave(JSON.parse(JSON.stringify(s)));expect(loaded.catBattle).toEqual(s.catBattle);const [uid]=hand(loaded,['heavy_strike_plus']);expect(previewDuelCard(loaded.catBattle!,uid).damage).toBe(30);
  });
  it('所有72种牌在多种当前战况下的伤害、格挡、恢复预览与实际出牌一致',()=>{
    for(const def of DUEL_CARDS.flatMap(c=>[c,getDuelCard(c.id+'_plus')!]))for(const mode of ['plain','strength','conditions','blocked']){
      const s=fixture(),b=s.catBattle!,[uid]=hand(s,[def.id]);b.playerEnergy=10;b.player.hp=40;
      if(mode==='strength')b.playerStrength=4;
      if(mode==='conditions'){b.playerStrength=2;b.duel!.conditions.player.weak=2;b.duel!.conditions.opponent.vulnerable=2;}
      if(mode==='blocked'){b.playerBlock=13;b.opponentBlock=11;}
      const p=previewDuelCard(b,uid),hp=b.opponent.hp,ownHp=b.player.hp,block=b.playerBlock;expect(playCard(s,uid).ok,def.id).toBe(true);
      expect(hp-b.opponent.hp,def.id+':'+mode).toBe(p.damage);expect(b.player.hp-ownHp,def.id).toBe(p.heal);expect(b.playerBlock-block,def.id).toBe(p.block);
    }
  });
  it('攻击抽牌的强化收益包含第二张牌，破绽准备也能补回一张手牌',()=>{
    const s=fixture(),b=s.catBattle!;let [uid]=hand(s,['atk_tech_plus']);const draw=b.playerDrawPile.length;expect(playCard(s,uid).ok).toBe(true);expect(b.playerHand).toHaveLength(2);expect(b.playerDrawPile).toHaveLength(draw-2);
    [uid]=hand(s,['drowsy_spores']);const n=b.playerDrawPile.length;expect(playCard(s,uid).ok).toBe(true);expect(b.duel!.conditions.opponent.vulnerable).toBe(2);expect(b.playerHand).toHaveLength(1);expect(b.playerDrawPile).toHaveLength(n-1);
  });
  it('零费突袭只消耗当前战斗实例，连点不会复制伤害',()=>{
    const s=fixture(),b=s.catBattle!,[uid]=hand(s,['black_exclusive']);b.playerEnergy=0;expect(playCard(s,uid).ok).toBe(true);expect(b.opponent.hp).toBe(294);expect(b.playerEnergy).toBe(0);expect(b.duel!.exhaustPile).toContain(uid);expect(playCard(s,uid).ok).toBe(false);expect(b.opponent.hp).toBe(294);
  });
  it('四种打法可在3点能量内形成直观组合',()=>{
    const power=fixture(),p=power.catBattle!;for(const uid of hand(power,['battle_yell','heavy_strike']))expect(playCard(power,uid).ok).toBe(true);expect(p.playerEnergy).toBe(0);expect(p.opponent.hp).toBe(280);
    const guard=fixture(),g=guard.catBattle!;for(const uid of hand(guard,['hold_line','shield_claw']))expect(playCard(guard,uid).ok).toBe(true);expect(g.playerBlock).toBe(20);expect(g.opponent.hp).toBe(280);expect(g.playerEnergy).toBe(0);
    const combo=fixture(),c=combo.catBattle!;for(const uid of hand(combo,['atk_tech_plus','flurry','black_exclusive']))expect(playCard(combo,uid).ok).toBe(true);expect(c.opponent.hp).toBe(276);expect(c.playerEnergy).toBe(1);
    const control=fixture(),a=control.catBattle!;for(const uid of hand(control,['web_trap','drowsy_spores','scratch']))expect(playCard(control,uid).ok).toBe(true);expect(a.opponent.hp).toBe(291);expect(enemyDamage(a)).toBe(3);endPlayerTurn(control);expect(a.player.hp).toBe(80);
  });
  it('反击逐段生效、格挡转伤无需额外条件，下一回合不保留反击',()=>{
    const s=fixture(),b=s.catBattle!;b.enemyIntent={kind:'attack',name:'双击',icon:'',value:4,hits:2};const [a,c]=hand(s,['counter_stance','shield_claw']);expect(playCard(s,a).ok).toBe(true);expect(playCard(s,c).ok).toBe(true);expect(b.opponent.hp).toBe(288);endPlayerTurn(s);expect(b.opponent.hp).toBe(280);expect(b.player.hp).toBe(80);expect(b.duel!.retaliate).toBe(0);expect(b.playerBlock).toBe(0);
  });
  it('净化牌面完整说明当前实际移除的三种异常',()=>{
    for(const id of ['refresh','steady']){const s=fixture(),b=s.catBattle!;Object.assign(b.duel!.conditions.player,{poison:2,weak:2,vulnerable:2});const [uid]=hand(s,[id]);expect(printedCardRules(getDuelCard(id)!).join(' ')).toContain('中毒、虚弱和易伤');expect(playCard(s,uid).ok).toBe(true);expect(b.duel!.conditions.player).toEqual({poison:0,weak:0,vulnerable:0});}
  });
});
