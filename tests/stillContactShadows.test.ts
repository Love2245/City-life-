import {describe,it,expect} from 'vitest';
import {photographContactShadows} from '../src/lib/stillContactShadows';
const settings={pixelsPerMeter:35,depthRange:20,strength:.34,radius:.34};
function plane(w=80,h=60){return Float32Array.from({length:w*h},(_,i)=>(5+(i%w)*.015+Math.floor(i/w)*.02)/20*65534);}
describe('cached photograph contact shadows',()=>{
  it('keeps a sloping receiving plane and empty background evenly lit',()=>{
    const depth=plane(),shade=photographContactShadows(depth,80,60,settings);
    expect(Math.min(...shade)).toBe(255);
    depth.fill(Infinity);expect(photographContactShadows(depth,80,60,settings).every(v=>v===255)).toBe(true);
  });
  it('adds restrained shade around raised objects without dimming distant floor',()=>{
    const depth=plane();for(let y=22;y<38;y++)for(let x=32;x<48;x++)depth[y*80+x]-=.25/20*65534;
    const shade=photographContactShadows(depth,80,60,settings),red=(x:number,y:number)=>shade[(y*80+x)*4];
    expect(red(30,28)).toBeLessThan(255);expect(red(5,5)).toBe(255);
    expect(Math.min(...shade)).toBeGreaterThan(190);expect(red(40,29)).toBe(255);
  });
});
