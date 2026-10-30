import type {WeatherId} from '../game/types';

export const NIGHTLIFE_MOODS=['clear','cloudy','rain','weekend','weekend-rain'] as const;
export type NightlifeMood=typeof NIGHTLIFE_MOODS[number];
export type NightlifeVenue='nightclub'|'lounge';
export type NightlifeMusicId=`${NightlifeVenue}-${NightlifeMood}`;
export const NIGHTLIFE_MOOD_LABEL:Record<NightlifeMood,string>={clear:'晴日夜色',cloudy:'微暗城市',rain:'雨夜慢拍',weekend:'周末相聚','weekend-rain':'雨夜周末'};
/** Presentation reads the current weather/weekend only; no RNG, save flags or clock changes. */
export function nightlifeMood(weather:WeatherId='sunny',weekend=false):NightlifeMood{
  const wet=weather==='rain'||weather==='snow'||weather==='coldwave';
  if(weekend)return wet?'weekend-rain':'weekend';
  return wet?'rain':weather==='cloudy'?'cloudy':'clear';
}
export function nightlifeMusic(venue:NightlifeVenue,weather:WeatherId,weekend:boolean,_hour?:number):NightlifeMusicId{
  return `${venue}-${nightlifeMood(weather,weekend)}`;
}
export function nightlifeVenue(locationId:string|null|undefined):NightlifeVenue|undefined{return locationId==='boyue_nightclub'?'nightclub':locationId==='boyue_lounge_bar'?'lounge':undefined;}
