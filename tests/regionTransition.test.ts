import {describe,expect,it,vi} from 'vitest';
import {createRegionTransition} from '../src/lib/regionTransition';
const pending=()=>{let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
describe('区域短转场',()=>{
  it('支持原生转场时先请求快照，导航只执行一次，绘制后完成',async()=>{
    const done=pending(),settle=vi.fn(async()=>{}),change=vi.fn(),dataset:Record<string,string|undefined>={};let update!:(()=>Promise<void>);
    const document={documentElement:{dataset},startViewTransition:vi.fn((callback:()=>Promise<void>)=>{update=callback;return{finished:done.promise,updateCallbackDone:Promise.resolve(),skipTransition:vi.fn()};})};
    const transition=createRegionTransition({document,reduced:()=>false,settle});expect(transition.run(change)).toBe(true);expect(change).not.toHaveBeenCalled();expect(dataset.regionTransition).toBe('active');
    await update();expect(change).toHaveBeenCalledOnce();expect(settle).toHaveBeenCalledOnce();expect(transition.run(change)).toBe(false);expect(change).toHaveBeenCalledOnce();done.resolve();await flush();expect(transition.active).toBe(false);expect(dataset.regionTransition).toBeUndefined();
  });
  it.each([true,false])('减少动态效果=%s 且无原生支持时立即执行，不延迟游戏状态',(reduced)=>{
    const document={documentElement:{dataset:{}},startViewTransition:reduced?vi.fn():undefined},change=vi.fn();createRegionTransition({document,reduced:()=>reduced}).run(change);expect(change).toHaveBeenCalledOnce();if(document.startViewTransition)expect(document.startViewTransition).not.toHaveBeenCalled();
  });
  it('浏览器拒绝开始快照时执行正常导航，不丢失点击',()=>{const change=vi.fn(),document={documentElement:{dataset:{}},startViewTransition:()=>{throw Error('unavailable');}};createRegionTransition({document,reduced:()=>false}).run(change);expect(change).toHaveBeenCalledOnce();expect(document.documentElement.dataset).toEqual({});});
  it('动画失败只清理状态，不能再次收费或推进时间',async()=>{const done=pending(),change=vi.fn(),document={documentElement:{dataset:{}},startViewTransition:(callback:()=>Promise<void>)=>{void callback();return{finished:done.promise,updateCallbackDone:Promise.resolve(),skipTransition:vi.fn()};}};const transition=createRegionTransition({document,reduced:()=>false});transition.run(change);done.reject(Error('animation cancelled'));await flush();expect(change).toHaveBeenCalledOnce();expect(transition.active).toBe(false);});
});
