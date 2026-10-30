export interface RhythmNote { track:number; hitAt:number }
/** Phrases alternate runs, rests and two-key chords, with at most two simultaneous notes. */
export function buildFiveLaneChart(count:number,beatMs:number,leadMs:number,random:()=>number):RhythmNote[]{
 const chart:RhythmNote[]=[];let at=leadMs,previous=-1;
 const beats=[1,1,.5,.5,1,1,1.5,.5,1,.5,.5,1,1,1,1,2];
 while(chart.length<count){const i=chart.length;at+=Math.round(Math.max(280,beatMs)*beats[i%16]);let track=Math.floor(random()*5)%5;if(track===previous)track=(track+1+Math.floor(random()*4))%5;chart.push({track,hitAt:at});previous=track;if(i>=6&&i%8===6&&chart.length<count)chart.push({track:(track+2+Math.floor(random()*2))%5,hitAt:at});}
 return chart;
}
export const RHYTHM_KEYS=['D','F','空格','J','K'] as const;
export function rhythmLaneForKey(code:string):number|undefined{const i=['KeyD','KeyF','Space','KeyJ','KeyK'].indexOf(code);if(i>=0)return i;const digit=/^(?:Digit|Numpad)([1-5])$/.exec(code);return digit?Number(digit[1])-1:undefined;}
