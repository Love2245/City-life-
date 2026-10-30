import type {WeatherId} from '../../game/types';
import type {HomeDistrictKind} from './housingProfiles';

/** Shared with the game's existing weather IDs; scenery never rolls weather or advances time. */
export function exteriorWeather(weather:WeatherId='sunny',night=false){
  const palettes={
    sunny:{sky:'#8faeb9',horizon:'#c9d1c2',fog:'#c7cec1',ground:'#a4af9a',key:'#fff0d3',sun:1,ambient:1,window:1,wet:0,snow:0},
    cloudy:{sky:'#8c9ca3',horizon:'#b3bdb5',fog:'#adb9b2',ground:'#94a18f',key:'#dae5e6',sun:.42,ambient:1.06,window:.72,wet:0,snow:0},
    rain:{sky:'#607782',horizon:'#8eaaa9',fog:'#8ca4a3',ground:'#718780',key:'#b9ced8',sun:.20,ambient:.90,window:.55,wet:1,snow:0},
    snow:{sky:'#9aafb7',horizon:'#d8e1dc',fog:'#c3d2d1',ground:'#d7e0d9',key:'#d6e8ec',sun:.35,ambient:1.06,window:.75,wet:.15,snow:1},
    heatwave:{sky:'#a8b2a9',horizon:'#d9cbb1',fog:'#d1c6ad',ground:'#b4ae8c',key:'#ffe3aa',sun:1.08,ambient:1,window:1.04,wet:0,snow:0},
    coldwave:{sky:'#809da9',horizon:'#b2c7c5',fog:'#a8bfbd',ground:'#9eafa3',key:'#d3e8ee',sun:.75,ambient:.95,window:.85,wet:0,snow:0},
  } satisfies Record<WeatherId,{sky:string;horizon:string;fog:string;ground:string;key:string;sun:number;ambient:number;window:number;wet:number;snow:number}>;
  const p=palettes[weather]??palettes.sunny;
  return {...p,weather,night,sky:night?'#101f2c':p.sky,horizon:night?(weather==='snow'?'#354d56':'#233c43'):p.horizon,fog:night?(weather==='rain'?'#29414b':'#263d43'):p.fog,
    key:night?'#a1bacd':p.key,sun:night?.8:p.sun,precipitation:weather==='rain'?'rain':weather==='snow'?'snow':'none',fogSpan:weather==='rain'?48:weather==='snow'?62:weather==='heatwave'?90:125} as const;
}
export type ExteriorWeather=ReturnType<typeof exteriorWeather>;

export type DistrictBlock={x:number;z:number;width:number;depth:number;height:number;variant:number;far:boolean};
/** The near row gives the room a neighborhood; distant shells are only a skyline. */
export function districtBlocks(width:number,depth:number,villa=false,district?:HomeDistrictKind):DistrictBlock[]{
  const specs=[[-10,-8,7,6,6], [width/2,-9,9,7,8], [width+10,-8,7,6,7],
    [-10,depth*.52,7,7,5], [width+10,depth*.48,7,7,6],
    [-11,depth+11,8,7,4], [width/2,depth+11,9,6,3.6], [width+11,depth+11,8,7,4.5]];
  const blocks=specs.map(([x,z,w,d,h],i)=>({x,z,width:w,depth:d,height:villa?Math.min(h,4.7):h,variant:i%4,far:false}));
  for(let i=0;i<12;i++){const angle=i*Math.PI/6,r=40+(i%3)*8;blocks.push({x:width/2+Math.cos(angle)*r,z:depth/2+Math.sin(angle)*r,width:8+i%3*2,depth:7+i%2*3,height:villa?4+i%3:8+i%4*2,variant:i%4,far:true});}
  if(!district)return blocks;
  return blocks.map(block=>{
    const height=district==='city-center'?(block.far?block.height*2.1+9:block.height*1.65+6)
      :district==='suburban-edge'?Math.min(block.height,block.far?5.4:4.1)
      :district==='garden-neighborhood'?Math.min(block.height,block.far?6:4.7)
      :district==='campus-courtyard'?(block.far?block.height*.8+3:block.height*.8+2.8)
      :district==='night-market'?(block.far?block.height*.7+2:block.height*.55+2.1)
      :block.far?block.height*.8+1:block.height*.9+2;
    return {...block,height};
  });
}

/** Drops fall outside the footprint, including when a foreground wall has faded. */
export function outdoorPrecipitationSeed(i:number,width:number,depth:number):[number,number,number]{
  let x=((i*137+19)%997)/997*(width+40)-20,z=((i*251+73)%991)/991*(depth+40)-20;
  if(x>-.8&&x<width+.8&&z>-.8&&z<depth+.8){if(i%4===0)x=-1.2;else if(i%4===1)x=width+1.2;else if(i%4===2)z=-1.2;else z=depth+1.2;}
  return [x,((i*71+13)%199)/199,z];
}
