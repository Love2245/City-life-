import {describe,expect,it} from 'vitest';
import {createWallTransition} from '../src/lib/wallTransition';

describe('办公室墙体过渡',()=>{
  it('墙体下降逐步发生，在240毫秒后准确停在目标高度',()=>{
    const wall=createWallTransition();const values=[wall.step(.2,.04),wall.step(.2,.04),wall.step(.2,.04)];
    expect(values[0]).toBeLessThan(1);expect(values[0]).toBeGreaterThan(values[1]);expect(values[1]).toBeGreaterThan(values[2]);expect(values[2]).toBeGreaterThan(.2);expect(wall.moving).toBe(true);
    expect(wall.step(.2,.12)).toBe(.2);expect(wall.moving).toBe(false);expect(wall.step(.2,1)).toBe(.2);
  });
  it('相同经过时间在不同帧率下得到相同高度',()=>{
    const fast=createWallTransition(),slow=createWallTransition();for(let i=0;i<12;i++)fast.step(.2,.01);for(let i=0;i<3;i++)slow.step(.2,.04);
    expect(fast.step(.2,0)).toBeCloseTo(slow.step(.2,0),9);
  });
  it('旋转方向反转时从当前高度返回，不跳回开始位置',()=>{
    const wall=createWallTransition(),lowered=wall.step(.2,.08);expect(wall.step(1,0)).toBe(lowered);expect(wall.step(1,.04)).toBeGreaterThan(lowered);expect(wall.step(1,.3)).toBe(1);
  });
  it('初次载入与减少动态效果设置立即应用高度，不产生入场滑动',()=>{
    const wall=createWallTransition();expect(wall.step(.2,0,true)).toBe(.2);expect(wall.moving).toBe(false);expect(wall.step(1,0,true)).toBe(1);expect(wall.moving).toBe(false);
  });
});
