import {describe,it,expect} from 'vitest';
import {compositeStillDepth,type DepthPart} from '../src/lib/stillDepth';
const rgba=(...pixels:number[][])=>new Uint8ClampedArray(pixels.flat());
const z=(...values:number[])=>rgba(...values.map(value=>[value>>8,value&255,0,255]));
describe('photographed room depth composition',()=>{
  it('picks only visible opaque facility pixels and clears a furniture hit behind a wall',()=>{
    const ids=new Uint8Array(3),floor:DepthPart={color:rgba([80,80,80,255],[80,80,80,255],[80,80,80,255]),depth:z(1000,1000,1000),width:3,height:1,x:0,y:0};
    const bed:DepthPart={color:rgba([1,1,1,255],[1,1,1,255],[1,1,1,0]),depth:z(400,400,400),width:3,height:1,x:0,y:0,hitId:1};
    const wall:DepthPart={color:rgba([1,1,1,255]),depth:z(100),width:1,height:1,x:0,y:0};
    compositeStillDepth(3,1,[floor,bed,wall],undefined,ids);expect([...ids]).toEqual([0,1,0]);
    compositeStillDepth(3,1,[floor,wall,bed],undefined,ids);expect([...ids]).toEqual([0,1,0]);
  });
  it('uses per-pixel depth where two objects cross, independently of their overall painter order',()=>{
    const floor:DepthPart={color:rgba([80,80,80,255],[80,80,80,255]),depth:z(1000,1000),width:2,height:1,x:0,y:0};
    const wall:DepthPart={color:rgba([220,20,20,255],[220,20,20,255]),depth:z(100,600),width:2,height:1,x:0,y:0};
    const furniture:DepthPart={color:rgba([20,20,220,255],[20,20,220,255]),depth:z(400,200),width:2,height:1,x:0,y:0};
    const expected=rgba([220,20,20,255],[20,20,220,255]);
    expect(compositeStillDepth(2,1,[floor,wall,furniture])).toEqual(expected);expect(compositeStillDepth(2,1,[floor,furniture,wall])).toEqual(expected);
  });
  it('moves depth with the purchased object and leaves transparent sprite margins empty',()=>{
    const floor:DepthPart={color:rgba([80,80,80,255],[80,80,80,255]),depth:z(200,200),width:2,height:1,x:0,y:0};
    const object:DepthPart={color:rgba([250,0,0,0],[0,250,0,255]),depth:z(10,100),width:2,height:1,x:0,y:0};
    expect(compositeStillDepth(2,1,[floor,object])).toEqual(rgba([80,80,80,255],[0,250,0,255]));
    expect(compositeStillDepth(2,1,[floor,{...object,depthShift:150}])).toEqual(floor.color);
    expect(compositeStillDepth(2,1,[floor,{...object,x:-1}])).toEqual(rgba([0,250,0,255],[80,80,80,255]));
  });
  it('optionally replaces only baked clear-background depth, preserving windows, buildings, computers, workers and hit targets',()=>{
    const backdrop=[120,134,129,255],building=[90,80,70,255],window=[100,120,140,255];
    const base:DepthPart={color:rgba(backdrop,building,window,backdrop,backdrop),depth:z(65535,200,300,65535,65535),width:5,height:1,x:0,y:0};
    const pc:DepthPart={color:rgba([20,80,120,255]),depth:z(100),width:1,height:1,x:3,y:0,hitId:7};
    const employee:DepthPart={color:rgba(backdrop),depth:z(90),width:1,height:1,x:4,y:0,hitId:8};
    const parts=[base,pc,employee],old=compositeStillDepth(5,1,parts),hits=new Uint8Array(5);let depths:Float32Array|undefined;
    const night=compositeStillDepth(5,1,parts,value=>depths=value,hits,[18,32,57]);
    expect([...old.slice(0,4)]).toEqual(backdrop);expect([...night.slice(0,4)]).toEqual([18,32,57,255]);
    expect([...night.slice(4)]).toEqual([...old.slice(4)]);expect([...hits]).toEqual([0,0,0,7,8]);expect([...depths!]).toEqual([65535,200,300,100,90]);
    expect(compositeStillDepth(5,1,parts)).toEqual(old);
  });
});
