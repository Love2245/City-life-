import {describe,it,expect} from 'vitest';
import {MathUtils} from 'three';
import {sceneFrameSeconds,sceneFollowBlend} from '../src/lib/sceneAnimation';
import {createWallTransition} from '../src/lib/wallTransition';

describe('slow-device scene animation timing',()=>{
  it('starts an idle animation with one frame, then counts the full slow-frame interval',()=>{
    expect(sceneFrameSeconds(20000,0)).toBeCloseTo(1/60);
    expect(sceneFrameSeconds(20500,20000)).toBe(.5);
    expect(sceneFrameSeconds(20000,20500)).toBe(0);
  });
  it('reaches the same camera follow position at 60 FPS and 4 FPS',()=>{
    const follow=(frames:number,dt:number)=>{let value=0;for(let i=0;i<frames;i++)value+=(1-value)*sceneFollowBlend(dt);return value;};
    expect(follow(30,1/60)).toBeCloseTo(follow(2,.25),12);
    expect(follow(2,.25)).toBeGreaterThan(.999);
  });
  it('finishes the existing wall transition after a late frame, including resuming an obscured room',()=>{
    const wall=createWallTransition(2.65);wall.step(.4,1/60);
    expect(wall.step(.4,sceneFrameSeconds(20500,20000))).toBe(.4);
    expect(wall.moving).toBe(false);
    expect(sceneFollowBlend(30)).toBe(1);
  });
  it('keeps exterior occluder fading independent of frame rate without overshoot',()=>{
    const fade=(frames:number,dt:number)=>{let opacity=1;for(let i=0;i<frames;i++)opacity=MathUtils.damp(opacity,.055,14,dt);return opacity;};
    expect(fade(30,1/60)).toBeCloseTo(fade(2,.25),12);
    expect(fade(1,sceneFrameSeconds(40000,10000))).toBeGreaterThanOrEqual(.055);
  });
});
