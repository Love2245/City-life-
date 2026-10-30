import {describe,expect,it} from 'vitest';
import {readFileSync,statSync} from 'node:fs';
import {atlasVisualFor,atlasBackgroundCandidatesFor} from '../src/lib/mapVisuals';
const periods=[[12,'day'],[18,'dusk'],[21,'night'],[23,'late-night']] as const;
describe('市中心与商业区使用一致的天气和灯光图组',()=>{
 it('两区晴、阴、雨各有昼暮夜和深夜图，全部有效且按同时段取图',()=>{
   const seen=new Set<string>();
   for(const region of ['downtown_center','downtown_commercial'])for(const weather of ['sunny','cloudy','rain'] as const)for(const [hour,period] of periods){
     const file=new URL('../src/assets/bg/v1.495/atlas/'+region+'/'+weather+'-'+period+'.webp',import.meta.url),bytes=readFileSync(file);
     expect(bytes.subarray(8,12).toString()).toBe('WEBP');expect(statSync(file).size).toBeGreaterThan(10000);
     const visual=atlasVisualFor(region,weather,hour);expect(visual.url).toContain('v1.495/atlas/'+region+'/'+weather+'-'+period+'.webp');expect(visual.indoor).toBe(false);expect(visual.nativeLighting).toBe(true);expect(visual.assetSource).toBe('revised');expect(visual.time).toBe(period);seen.add(visual.url!);
   }
   expect(seen.size).toBe(24);
 });
 it('极端天气同档归并，损坏资源优先回退本区同一时段',()=>{
   for(const region of ['downtown_center','downtown_commercial']){
     for(const [weather,base] of [['snow','rain'],['coldwave','cloudy'],['heatwave','sunny']] as const)expect(atlasVisualFor(region,weather,23).url).toContain(base+'-late-night.webp');
     const candidates=atlasBackgroundCandidatesFor(region,'rain',21);expect(candidates[0]).toContain('rain-night.webp');expect(candidates.slice(1).some(url=>url.includes('sunny-night.webp'))).toBe(true);expect(candidates.every(url=>url.includes(region))).toBe(true);
   }
 });
});
