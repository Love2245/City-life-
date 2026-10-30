// @vitest-environment jsdom
import {describe,it,expect,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import {ambientDuelParticles,impactDuelParticles} from '../src/lib/duelParticles';
import type {DuelMotionBeat} from '../src/lib/catDuelMotion';
import DuelEnvironmentParticles from '../src/components/DuelEnvironmentParticles.svelte';
import DuelImpact from '../src/components/DuelImpact.svelte';

const hit:DuelMotionBeat={id:17,kind:'hurt',side:'opponent',source:'player',attack:true,amount:6,hpAfter:32,duration:180,text:'命中'};
describe('1.498 轻量战斗粒子',()=>{
  it('移动端降低密度，减少动态效果时不创建环境和命中粒子',()=>{
    for(const scene of ['alley','park','arena','boss'] as const){
      expect(ambientDuelParticles(scene,12)).toHaveLength(16);
      expect(ambientDuelParticles(scene,22,{mobile:true})).toHaveLength(7);
      expect(ambientDuelParticles(scene,18,{reducedMotion:true})).toEqual([]);
    }
    expect(impactDuelParticles(hit,true)).toEqual([]);
  });
  it('重绘不消耗随机数、不改变战斗事件；粒子始终局限在舞台附近',()=>{
    const random=vi.spyOn(Math,'random').mockImplementation(()=>{throw Error('presentation consumed RNG');});
    const before=JSON.stringify(hit);
    try{
      const a=ambientDuelParticles('park',18),b=ambientDuelParticles('park',18);
      expect(a).toEqual(b);expect(impactDuelParticles(hit)).toEqual(impactDuelParticles(hit));
      expect(a.every(p=>p.x>=7&&p.x<=94&&p.y>=23&&p.y<60&&p.size<=4.5)).toBe(true);
      expect(JSON.stringify(hit)).toBe(before);
    }finally{random.mockRestore();}
  });
  it('仅真实命中、格挡和恢复生成短粒子，结束时间落在当前演出内',()=>{
    expect(impactDuelParticles(null)).toEqual([]);
    expect(impactDuelParticles({...hit,amount:0,blocked:0})).toEqual([]);
    expect(impactDuelParticles({...hit,kind:'status'})).toEqual([]);
    for(const beat of [hit,{...hit,amount:0,blocked:6},{...hit,kind:'heal' as const,amount:2,duration:115},{...hit,kind:'block' as const,amount:5,duration:115}]){
      const particles=impactDuelParticles(beat);expect(particles.length).toBeGreaterThan(0);expect(particles.length).toBeLessThanOrEqual(8);
      expect(particles.every(p=>p.duration<beat.duration&&Math.hypot(p.dx,p.dy)<65)).toBe(true);
    }
  });
  it('环境粒子随页面隐藏暂停，卸载时移除监听',async()=>{
    const target=document.createElement('div');document.body.appendChild(target);
    let hidden=false;const visibility=vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden);
    const remove=vi.spyOn(document,'removeEventListener');
    const component=mount(DuelEnvironmentParticles,{target,props:{scene:'alley',hour:22,mobile:true}});flushSync();
    expect(target.querySelectorAll('i')).toHaveLength(7);
    hidden=true;document.dispatchEvent(new Event('visibilitychange'));flushSync();expect(target.querySelector('.duel-environment')?.classList.contains('suspended')).toBe(true);
    hidden=false;document.dispatchEvent(new Event('visibilitychange'));flushSync();expect(target.querySelector('.duel-environment')?.classList.contains('suspended')).toBe(false);
    await unmount(component);expect(remove).toHaveBeenCalledWith('visibilitychange',expect.any(Function));expect(target.querySelector('.duel-environment')).toBeNull();
    remove.mockRestore();visibility.mockRestore();target.remove();
  });
  it('命中粒子只出现在受击一方，减少动态效果保留伤害数字',async()=>{
    const target=document.createElement('div');document.body.appendChild(target);
    let component=mount(DuelImpact,{target,props:{beat:hit,side:'player'}});flushSync();expect(target.querySelector('.duel-impact')).toBeNull();await unmount(component);
    component=mount(DuelImpact,{target,props:{beat:hit,side:'opponent',reducedMotion:true}});flushSync();expect(target.querySelectorAll('.impact-particles i')).toHaveLength(0);expect(target.querySelector('.amount')?.textContent).toContain('−6');await unmount(component);target.remove();
  });
});
