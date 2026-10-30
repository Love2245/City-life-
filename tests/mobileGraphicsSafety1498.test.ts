import {afterEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {isMobileGraphics,MOBILE_NATIVE_PIXEL_BUDGET} from '../src/lib/graphicsDevice';
import {sceneQuality} from '../src/lib/scenePipeline';
import {homeSceneQuality} from '../src/lib/homeQuality';
import {qualityForDevice} from '../src/lib/sceneMode';
import {renderPixelRatio} from '../src/lib/renderResolution';
import {createMobileContactShadows} from '../src/lib/mobileContactShadows';

afterEach(()=>vi.unstubAllGlobals());
function phone(){vi.stubGlobal('navigator',{userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile',platform:'Linux aarch64',maxTouchPoints:5});vi.stubGlobal('matchMedia',()=>({matches:true}));vi.stubGlobal('devicePixelRatio',3);}

describe('physical phone graphics safety',()=>{
  it('keeps PC-quality requests and PC layouts inside the mobile pipeline',()=>{
    phone();expect(isMobileGraphics()).toBe(true);
    for(const mode of ['auto','fine','light'] as const){
      expect(sceneQuality(mode).id).toBe('light');
      for(const layout of ['pc','mobile'] as const)expect(homeSceneQuality(mode,layout,3).id).toBe('light');
      for(const layout of ['pc','pe','tablet'] as const)expect(qualityForDevice(mode,layout)).toBe('light');
    }
  });
  it('bounds native and HD buffers on high-DPI phones without shrinking the auto clarity floor',()=>{
    phone();const q=homeSceneQuality('fine','pc',3);
    for(const zoom of [.5,.7,1,1.25])for(const resolution of ['75','100','125','150'] as const){
      const w=932/zoom,h=430/zoom,r=renderPixelRatio(q,w,h,1,resolution,zoom,16384,3);
      expect(w*h*r*r).toBeLessThanOrEqual(MOBILE_NATIVE_PIXEL_BUDGET+1);
      expect(w*r).toBeGreaterThan(932);
    }
    const r=renderPixelRatio(q,932/.7,430/.7,.5,'auto',.7);expect(932/.7*r).toBeGreaterThanOrEqual(932-1e-6);
  });
  it('recognizes iPad desktop UA without restricting a touch-enabled Windows computer',()=>{
    vi.stubGlobal('navigator',{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X)',platform:'MacIntel',maxTouchPoints:5});expect(isMobileGraphics()).toBe(true);
    vi.stubGlobal('navigator',{userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',platform:'Win32',maxTouchPoints:10});vi.stubGlobal('matchMedia',()=>({matches:true}));vi.stubGlobal('devicePixelRatio',2);
    expect(isMobileGraphics()).toBe(false);expect(sceneQuality('fine').id).toBe('fine');expect(homeSceneQuality('fine','pc',2).id).toBe('fine');
    expect(renderPixelRatio({pixelRatio:1.5,maxPixels:2_000_000},1920,1080,1,'100',1,8192,2)).toBe(2);
  });
});

describe('cached mobile floor shadows',()=>{
  it('renders the silhouette once, excludes transparent/hidden pieces and preserves scene and renderer state',()=>{
    const scene=new THREE.Scene(),owner=new THREE.Group(),box=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());box.position.set(2,.5,3);box.castShadow=true;owner.add(box);
    const glass=box.clone();glass.material=new THREE.MeshStandardMaterial({transparent:true,opacity:.2});owner.add(glass);const hidden=box.clone();hidden.visible=false;owner.add(hidden);scene.add(owner);
    scene.background=new THREE.Color('#123456');scene.fog=new THREE.Fog('#111111',1,10);
    let target:THREE.WebGLRenderTarget|null=null;const clear=new THREE.Color('#777777'),background=scene.background,fog=scene.fog;
    const renderer={getRenderTarget:()=>target,setRenderTarget:(value:THREE.WebGLRenderTarget|null)=>target=value,getClearColor:(value:THREE.Color)=>value.copy(clear),getClearAlpha:()=>1,setClearColor:vi.fn(),autoClear:false,clear:vi.fn(),render:vi.fn()}as unknown as THREE.WebGLRenderer;
    const shadows=createMobileContactShadows(renderer,scene);shadows.setObjects(()=>[owner]);shadows.update();
    const plane=scene.getObjectByName('mobile-cached-contact-shadows')!;expect(plane.visible).toBe(true);expect(plane.userData.mobileContactShadows.casters).toBe(1);expect(plane.userData.mobileContactShadows.updates).toBe(1);
    expect(Math.max(...plane.userData.mobileContactShadows.buffer)).toBeLessThanOrEqual(512);expect(renderer.render).toHaveBeenCalledTimes(3);
    for(let frame=0;frame<100;frame++)shadows.update();expect(renderer.render).toHaveBeenCalledTimes(3);
    shadows.invalidate();shadows.update();expect(renderer.render).toHaveBeenCalledTimes(6);expect(plane.userData.mobileContactShadows.updates).toBe(2);
    expect(scene.background).toBe(background);expect(scene.fog).toBe(fog);expect(scene.overrideMaterial).toBeNull();expect(renderer.autoClear).toBe(false);expect(target).toBeNull();expect(box.visible).toBe(true);expect(glass.visible).toBe(true);expect(hidden.visible).toBe(false);
    shadows.dispose();expect(scene.getObjectByName(plane.name)).toBeUndefined();box.geometry.dispose();box.material.dispose();glass.material.dispose();
  });
});
