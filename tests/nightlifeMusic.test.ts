import {describe,expect,it} from 'vitest';
import {nightlifeMood,nightlifeMusic,nightlifeVenue,NIGHTLIFE_MOODS} from '../src/lib/nightlifeMusic';
import {musicForScene} from '../src/lib/musicRouting';
import type {WeatherId} from '../src/game/types';
const weather:WeatherId[]=['sunny','cloudy','rain','snow','heatwave','coldwave'];
describe('夜总会与清吧的五套天气配乐',()=>{
  it('六种天气与工作日周末覆盖五种氛围',()=>{const selected=new Set();for(const w of weather)for(const weekend of [false,true])selected.add(nightlifeMood(w,weekend));expect([...selected].sort()).toEqual([...NIGHTLIFE_MOODS].sort());});
  it.each([['sunny',false,'clear'],['cloudy',false,'cloudy'],['rain',false,'rain'],['snow',false,'rain'],['coldwave',false,'rain'],['heatwave',true,'weekend'],['sunny',true,'weekend'],['rain',true,'weekend-rain'],['cloudy',true,'weekend']] as const)('%s 周末=%s 使用 %s',(w,weekend,expected)=>expect(nightlifeMood(w,weekend)).toBe(expected));
  it('同一天反复进入不抽随机曲，两个场所使用各自的文件ID',()=>{for(const w of weather)for(const weekend of [false,true]){const id=nightlifeMusic('nightclub',w,weekend);expect(nightlifeMusic('nightclub',w,weekend)).toBe(id);expect(nightlifeMusic('lounge',w,weekend)).not.toBe(id);}});
  it('全天按天气和周末选择现有曲目',()=>{for(const venue of ['nightclub','lounge'] as const){expect(nightlifeMusic(venue,'sunny',false,0)).toBe(`${venue}-clear`);expect(nightlifeMusic(venue,'rain',true,5)).toBe(`${venue}-weekend-rain`);expect(nightlifeMusic(venue,'sunny',false,6)).toBe(`${venue}-clear`);expect(nightlifeMusic(venue,'rain',true,23)).toBe(`${venue}-weekend-rain`);}});
  it('场所内选择天气曲，未入场时仍走地图音乐',()=>{const scene={inGame:true,hour:1,locationId:'boyue_lounge_bar',weather:'rain' as const,weekend:false};expect(musicForScene(scene,'auto')).toBe('lounge-rain');expect(musicForScene({...scene,locationId:'boyue_nightclub'},'auto')).toBe('nightclub-rain');expect(musicForScene({...scene,admitted:false},'auto')).toBe('dawn');});
  it('实际场景上下文覆盖地图手动选曲，未入场时仍播放地图曲',()=>{const scene={inGame:true,hour:20,locationId:'boyue_nightclub',weather:'rain' as const,weekend:true};expect(musicForScene(scene,'morning')).toBe('nightclub-weekend-rain');expect(musicForScene({...scene,admitted:false},'morning')).toBe('morning');expect(musicForScene({...scene,inGame:false},'morning')).toBe('morning');expect(musicForScene({...scene,locationId:'boyue_lounge_bar'},'auto')).toBe('lounge-weekend-rain');});
  it('普通地图与寺庙教堂仍使用各自原有音乐路由',()=>{expect(nightlifeVenue('temple')).toBeUndefined();for(const locationId of ['temple','church'])expect(musicForScene({inGame:true,hour:20,locationId,weather:'snow',weekend:true},'auto')).toBe(locationId);expect(musicForScene({inGame:true,hour:20,locationId:'map',weather:'rain',weekend:true},'auto')).toBe('night');});
});
