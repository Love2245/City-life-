import type {WeatherId} from '../game/types';
import {homeLightScheme} from '../game/core/homeLighting';
import {stillWeatherFilter} from './stillWeather';

const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const round=(n:number)=>Math.round(n*1000)/1000;
const weatherIds:readonly string[]=['sunny','cloudy','rain','snow','heatwave','coldwave'];
function mix(a:string,b:string,t:number){
  const x=parseInt(a.slice(1),16),y=parseInt(b.slice(1),16),f=clamp(t);
  return '#'+[16,8,0].map(shift=>Math.round(((x>>shift)&255)*(1-f)+((y>>shift)&255)*f).toString(16).padStart(2,'0')).join('');
}

/** Same seasonal sunrise/sunset as the home's automatic lights. All inputs are game time. */
export function officeLightScheme(hour=12,month=9,weather:WeatherId|string='sunny'){
  hour=Number.isFinite(hour)?((hour%24)+24)%24:12;
  month=Number.isFinite(month)?Math.max(1,Math.min(12,Math.floor(month))):9;
  const condition=(weatherIds.includes(weather)?weather:'sunny') as WeatherId;
  const summer=month>=5&&month<=8,winter=month===12||month<=2;
  const sunrise=summer?5.5:winter?7:6,sunset=summer?19:winter?17.5:18;
  const source=homeLightScheme(hour,month,condition),daylight=source.daylight;
  const warmth=Math.max(clamp(1-Math.abs(hour-sunrise)/1.6),clamp(1-Math.abs(hour-sunset)/1.7));
  const lamps=source.lamps||daylight<.2;
  const frame=hour>=sunrise&&hour<sunset?'day':'night';
  const phase=hour>=sunrise-.6&&hour<9?'清晨':hour>=sunset-1.5&&hour<sunset+.6?'黄昏':frame==='night'?'夜晚':'日间';
  const travel=clamp((hour-sunrise)/(sunset-sunrise)),elevation=Math.sin(Math.PI*travel);
  return{
    hour,month,weather:condition,phase,daylight,lamps,frame,sunrise,sunset,
    background:mix('#122039',source.sky,clamp(daylight*1.35)),
    skyColor:mix('#708db4','#e6eee9',daylight),groundColor:mix('#76604c','#a19b83',daylight),
    sunColor:daylight<.04?'#8cabd6':mix('#fff7e8','#ffbb7d',warmth),
    sunIntensity:round(.06+daylight*3.04),ambientIntensity:round(.42+daylight*1.72+(lamps?.12:0)),
    sunOffset:[-Math.cos(Math.PI*travel)*.75,.5+elevation*.65,-.45] as const,
    windowColor:daylight<.06?'#739bce':mix('#e7f3ff','#ffcb99',warmth),
    windowEmission:round(daylight<.06?.16:.035+daylight*.06),
    lampColor:source.lampColor,lampEmission:lamps?.9:.025,fillIntensity:lamps?1.45:.04,
    // Day/night photographs remain at their original resolution; CSS changes are inexpensive.
    filter:[`brightness(${round((frame==='night'?.6:.73)+daylight*.27)})`,`saturate(${round(.84+daylight*.16)})`,warmth>.05?`sepia(${round(warmth*.2)}) hue-rotate(${-Math.round(warmth*9)}deg)`:'',stillWeatherFilter(condition)].filter(Boolean).join(' '),
    wash:lamps?`linear-gradient(150deg,rgba(77,112,177,.16),rgba(255,192,111,.1) 60%,rgba(255,207,141,.13))`:`linear-gradient(150deg,rgba(255,192,126,${round(warmth*.15)}),transparent 75%)`,
  };
}
export type OfficeLightScheme=ReturnType<typeof officeLightScheme>;
export function officeLightingMetadata(light:OfficeLightScheme){return JSON.stringify({phase:light.phase,hour:light.hour,month:light.month,weather:light.weather,lamps:light.lamps,daylight:round(light.daylight),frame:light.frame});}
