import {afterEach,describe,expect,it,vi} from 'vitest';
import {CanvasTexture} from 'three';
import {sceneTextureCanvas} from '../src/lib/sceneTextureCanvas';

afterEach(()=>vi.unstubAllGlobals());

describe('procedural scene surface cache',()=>{
  function canvasDocument(){
    const createElement=vi.fn(()=>({width:0,height:0,getContext:()=>({})}));
    vi.stubGlobal('document',{createElement});return createElement;
  }
  it('reuses unchanged pixels on revisits while GPU textures remain independent',()=>{
    const createElement=canvasDocument(),draw=vi.fn();
    const first=sceneTextureCanvas('test-repeat',512,512,draw),second=sceneTextureCanvas('test-repeat',512,512,draw);
    expect(first).toBe(second);expect(draw).toHaveBeenCalledOnce();expect(createElement).toHaveBeenCalledOnce();
    const textureA=new CanvasTexture(first),textureB=new CanvasTexture(second),disposed=vi.fn();
    textureB.addEventListener('dispose',disposed);textureA.repeat.set(3,3);textureA.dispose();
    expect(textureB.repeat.toArray()).toEqual([1,1]);expect(disposed).not.toHaveBeenCalled();textureB.dispose();
  });
  it('keeps different resolutions separate and evicts old canvases instead of growing without limit',()=>{
    canvasDocument();const draw=vi.fn();
    const small=sceneTextureCanvas('test-resolutions',64,64,draw),large=sceneTextureCanvas('test-resolutions',128,128,draw);
    expect(small).not.toBe(large);
    for(let i=0;i<25;i++)sceneTextureCanvas(`test-eviction-${i}`,8,8,draw);
    expect(sceneTextureCanvas('test-resolutions',64,64,draw)).not.toBe(small);
  });
});
