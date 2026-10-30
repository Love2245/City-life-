// @vitest-environment jsdom
import {afterEach,describe,it,expect} from 'vitest';
import {initializeMobileDisplay,setMobileEdge,setMobileBottom} from '../src/stores/mobileDisplay.svelte';
let cleanup:(()=>void)|undefined;
const deviceWindow=window as Window & {UrbanLifeDisplay?:{getInsets:()=>string}};
afterEach(()=>{cleanup?.();cleanup=undefined;delete deviceWindow.UrbanLifeDisplay;localStorage.clear();});
function nativeInsets(value:unknown){window.dispatchEvent(new CustomEvent('urban-life-display-insets',{detail:value}));}
const token=(side:string)=>document.documentElement.style.getPropertyValue('--native-safe-'+side);
describe('native viewport safe areas',()=>{
  it('reads the initial cutout without changing the player margin or padding the viewport',()=>{
    setMobileEdge(12);setMobileBottom(8);
    deviceWindow.UrbanLifeDisplay={getInsets:()=>JSON.stringify({top:0,right:0,bottom:21,left:59})};
    cleanup=initializeMobileDisplay();
    expect(token('left')).toBe('59px');expect(token('bottom')).toBe('21px');
    expect(document.documentElement.style.getPropertyValue('--mobile-edge-padding')).toBe('12px');
    expect(document.documentElement.style.padding).toBe('');expect(document.body.style.padding).toBe('');
    expect(JSON.parse(localStorage.getItem('urban-life-mobile-insets-v1')!)).toEqual({edge:12,bottom:8});
  });
  it('replaces both sides after rotation, resets hidden bars to zero, and releases listeners',()=>{
    cleanup=initializeMobileDisplay();
    nativeInsets({top:0,right:0,bottom:21,left:59});
    nativeInsets({top:0,right:59,bottom:0,left:0});
    expect(token('left')).toBe('0px');expect(token('right')).toBe('59px');expect(token('bottom')).toBe('0px');
    cleanup();cleanup=undefined;
    nativeInsets({top:0,right:0,bottom:0,left:59});expect(token('left')).toBe('');
  });
  it('ignores an unavailable or malformed bridge and invalid event data',()=>{
    deviceWindow.UrbanLifeDisplay={getInsets:()=>'{bad json'};cleanup=initializeMobileDisplay();
    expect(token('left')).toBe('');
    nativeInsets({top:0,right:0,bottom:0,left:59});
    for(const value of [null,{left:999,top:0,right:0,bottom:0},{top:0,right:0,bottom:0,left:'59'},{top:NaN,right:0,bottom:0,left:0}])nativeInsets(value);
    expect(token('left')).toBe('59px');
  });
});
