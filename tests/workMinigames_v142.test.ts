import {describe,it,expect} from 'vitest';
import {launch,rack,stepWorld} from '../src/game/core/bowlingPhysics';
import {deliveryDistrict} from '../src/game/core/deliveryDistrict';

describe('工作小游戏重做',()=>{
 const simulate=(aim:number,power:number,dt=1/60)=>{const w=launch(rack(),aim,power);for(let t=0;t<2.4;t+=dt)stepWorld(w,dt);return w;};
 it('球先滚动再碰撞，空场不会产生击倒分',()=>{const w=launch(rack(),50,.7);stepWorld(w,.016);expect(w.ball.y).toBeLessThan(91);expect(w.pins.some(p=>p.fallen)).toBe(false);const empty=launch([],50,1);stepWorld(empty,.04);expect(empty.pins).toHaveLength(0);});
 it('偏离球道落沟，不会远程击倒球瓶',()=>{const w=simulate(92,.7);expect(w.gutter).toBe(true);expect(w.pins.filter(p=>p.fallen)).toHaveLength(0);expect(simulate(50,.7).pins.some(p=>p.fallen)).toBe(true);});
 it('稳定时间步下碰撞结果一致且坐标有效',()=>{const a=simulate(50,.7,1/60),b=simulate(50,.7,1/120);expect(a.pins.filter(p=>p.fallen).length).toBe(b.pins.filter(p=>p.fallen).length);expect(a.pins.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);});
 it('补球只使用剩余球瓶',()=>{const first=simulate(40,.45);const remaining=first.pins.filter(p=>!p.fallen);expect(launch(remaining,50,.7).pins).toHaveLength(remaining.length);});
 it('五种职业路网不同、所有路口相通，不能跨越断路',()=>{
  const keys=[['job_delivery','food'],['job_express','parcel'],['job_ride_hailing','rideshare'],['job_taxi','rideshare'],['job_delivery_fulltime','food']];
  const signatures=new Set();
  for(const [key,mode]of keys){const d=deliveryDistrict(key,mode);signatures.add(JSON.stringify(d.edges));const visited=new Set([0]);for(let i=0;i<12;i++)for(let a=0;a<12;a++)for(let b=0;b<12;b++)if(visited.has(a)&&d.linked(d.nodes[a],d.nodes[b]))visited.add(b);expect(visited.size).toBe(12);expect(d.linked({x:0,y:0},d.nodes[0])).toBe(false);if(mode==='rideshare')expect(d.capacity).toBe(1);}
  expect(signatures.size).toBe(5);
 });
});
