// @vitest-environment jsdom
import {it,expect} from 'vitest';import {createSceneTapGuard} from '../src/lib/sceneTapGuard';
it('blocks a touch compatibility click on a newly opened control while allowing the next real pointer or keyboard click',()=>{
  const canvas=document.createElement('canvas'),button=document.createElement('button');document.body.append(canvas,button);let clicks=0;button.onclick=()=>clicks++;const guard=createSceneTapGuard(canvas),touch={pointerType:'touch',clientX:100,clientY:80} as PointerEvent;
  guard.arm(touch);button.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1,clientX:100,clientY:80}));expect(clicks).toBe(0);
  guard.arm(touch);button.dispatchEvent(new Event('pointerdown',{bubbles:true}));button.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1,clientX:100,clientY:80}));expect(clicks).toBe(1);
  guard.arm(touch);button.click();expect(clicks).toBe(2);guard.dispose();button.click();expect(clicks).toBe(3);canvas.remove();button.remove();
});
