import {describe,it,expect} from 'vitest';
import {playerArt,opponentArt,playerBattlePortrait,opponentBattlePortrait,playerBattleScaleX,opponentBattleScaleX} from '../src/lib/catArt';
describe('1.498 圆头猫参考形象接入',()=>{
  it('待机、攻击和受击均采用新的独立透明图，玩家与首领共用同一形象',()=>{
    const urls=[];
    for(const pose of ['idle','attack','hurt'] as const){const player=playerBattlePortrait('roundhead',pose)!,enemy=opponentBattlePortrait('roundhead',pose)!;expect(player.src).toContain(`/duel-roundhead-1498/roundhead_${pose}.png`);expect(enemy.src).toBe(player.src);expect(player.frame).toBeUndefined();expect(playerArt('roundhead',pose)).toBe(player.src);expect(opponentArt('roundhead',pose)).toBe(player.src);urls.push(player.src);}
    expect(new Set(urls).size).toBe(3);
  });
  it('正面圆头不镜像，入场沿用新待机形象',()=>{
    expect(playerBattleScaleX('roundhead')).toBe(1);expect(opponentBattleScaleX('roundhead')).toBe(1);
    expect(playerArt('roundhead','enter')).toBe(playerArt('roundhead','idle'));
  });
});
