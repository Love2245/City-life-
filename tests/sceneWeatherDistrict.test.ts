import {describe,it,expect} from 'vitest';
import type {WeatherId} from '../src/game/types';
import {districtBlocks,exteriorWeather,outdoorPrecipitationSeed} from '../src/lib/sceneExterior/weather';

const ids:WeatherId[]=['sunny','cloudy','rain','snow','heatwave','coldwave'];
describe('scenery follows the existing six weather IDs',()=>{
  for(const weather of ids)it(weather,()=>{
    const day=exteriorWeather(weather,false),night=exteriorWeather(weather,true);
    expect(day.weather).toBe(weather);expect(night.weather).toBe(weather);
    expect(day.sky).not.toBe(night.sky);expect(day.fog).not.toBe(night.fog);
    for(const p of [day,night]){expect(p.sun).toBeGreaterThan(0);expect(p.sun).toBeLessThan(1.2);expect(p.fogSpan).toBeGreaterThan(30);expect(/^#[\da-f]{6}$/i.test(p.sky)).toBe(true);}
  });
  it('distinguishes wet rain, snow cover and clear cold weather',()=>{
    const rain=exteriorWeather('rain'),snow=exteriorWeather('snow'),cold=exteriorWeather('coldwave');
    expect(rain.precipitation).toBe('rain');expect(rain.wet).toBe(1);expect(rain.snow).toBe(0);
    expect(snow.precipitation).toBe('snow');expect(snow.snow).toBe(1);
    expect(cold.precipitation).toBe('none');expect(cold.snow).toBe(0);
    expect(exteriorWeather('cloudy').sun).toBeLessThan(exteriorWeather('sunny').sun);
    expect(rain.fogSpan).toBeLessThan(exteriorWeather('sunny').fogSpan);
  });
});

it('rain and snow seeds never originate inside the playable footprint',()=>{
  for(const [w,d]of [[12,11],[10.4,12.4],[6.4,5.3],[18,14.5]])for(let i=0;i<1000;i++){
    const [x,t,z]=outdoorPrecipitationSeed(i,w,d);
    expect(x>-.8&&x<w+.8&&z>-.8&&z<d+.8).toBe(false);
    expect(t).toBeGreaterThanOrEqual(0);expect(t).toBeLessThan(1);
    expect(outdoorPrecipitationSeed(i,w,d)).toEqual([x,t,z]);
  }
});

it('neighbor shells leave the room and its entrance scenery clear',()=>{
  for(const [w,d]of [[12,11],[10.4,12.4],[18,14.5]]){
    const blocks=districtBlocks(w,d,w===18);
    expect(blocks.filter(b=>!b.far)).toHaveLength(8);
    for(const b of blocks){const overlaps=b.x+b.width/2>-.9&&b.x-b.width/2<w+2.5&&b.z+b.depth/2>-.9&&b.z-b.depth/2<d+3.0;expect(overlaps,JSON.stringify(b)).toBe(false);}
    expect(districtBlocks(w,d,true).filter(b=>!b.far).every(b=>b.height<=4.7)).toBe(true);
  }
});
