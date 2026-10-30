// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {createCompanyOffice} from '../src/lib/companyOffice3D';
import {officeLightScheme} from '../src/lib/officeLighting';
const fake=vi.hoisted(()=>({renderers:[] as any[],scenes:[] as any[],cameras:[] as any[],render:vi.fn(),pipelineDispose:vi.fn(),controlsDispose:vi.fn(),frames:new Map<number,FrameRequestCallback>(),sequence:0}));
vi.mock('three',async importOriginal=>{
  const actual=await importOriginal<typeof import('three')>();
  class Renderer {
    domElement=document.createElement('canvas');capabilities={maxTextureSize:8192};shadowMap={enabled:false,autoUpdate:true,type:0,needsUpdate:false};info={render:{calls:1,triangles:1}};
    outputColorSpace='';toneMapping=0;setPixelRatio=vi.fn();setSize=vi.fn();compileAsync=vi.fn(async()=>{});dispose=vi.fn();forceContextLoss=vi.fn();
    constructor(){fake.renderers.push(this);}
  }
  return{...actual,WebGLRenderer:Renderer};
});
vi.mock('three/addons/controls/OrbitControls.js',async()=>{
  const {Vector3}=await import('three');
  return{OrbitControls:class {target=new Vector3();mouseButtons={};touches={};update(){return false;}addEventListener(){}removeEventListener(){}dispose(){fake.controlsDispose();}}};
});
vi.mock('../src/lib/scenePipeline',async importOriginal=>{
  const actual=await importOriginal<typeof import('../src/lib/scenePipeline')>();
  return{...actual,createScenePipeline:(_renderer:any,scene:any,camera:any)=>{fake.scenes.push(scene);fake.cameras.push(camera);return{render:fake.render,warmup:async()=>{},resize(){},setContactObjects(){},invalidateContacts(){},dispose:fake.pipelineDispose};}};
});
vi.mock('../src/lib/sceneLoadWork',async importOriginal=>({...(await importOriginal<typeof import('../src/lib/sceneLoadWork')>()),createSceneWorkBudget:()=>async()=>{},sceneRenderIsCovered:()=>false}));
let frameTime=0;
function flushFrames(){frameTime+=1000/60;const current=[...fake.frames];fake.frames.clear();for(const[,callback]of current)callback(frameTime);}
afterEach(()=>{fake.renderers=[];fake.scenes=[];fake.cameras=[];fake.frames.clear();fake.sequence=0;fake.render.mockClear();fake.pipelineDispose.mockClear();fake.controlsDispose.mockClear();document.body.replaceChildren();vi.unstubAllGlobals();});
describe('办公室3D固定灯组和按需重绘',()=>{
  it('游戏时间更新实际灯光和背景，沿用相同灯、相机、模型，空闲不持续绘制并可完整释放',async()=>{
    vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{const id=++fake.sequence;fake.frames.set(id,callback);return id;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>fake.frames.delete(id));vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('matchMedia',()=>({matches:false}));vi.stubGlobal('devicePixelRatio',1);
    const host=document.createElement('div');Object.defineProperties(host,{clientWidth:{value:900},clientHeight:{value:600}});document.body.append(host);
    const view=createCompanyOffice(host,1,vi.fn(),vi.fn(),'light'),scene=fake.scenes[0] as THREE.Scene,camera=fake.cameras[0] as THREE.PerspectiveCamera;
    await vi.waitFor(()=>{flushFrames();expect(fake.render).toHaveBeenCalled();});await view.ready;
    const lights=scene.children.filter(item=>item instanceof THREE.Light) as THREE.Light[];
    const sun=lights.find(light=>light.castShadow)!,fill=lights.find(light=>light.type==='DirectionalLight'&&!light.castShadow)!,ambient=lights.find(light=>light.type==='HemisphereLight')!;
    const objects=scene.children.map(item=>item.uuid);view.rotate(Math.PI/2);flushFrames();const cameraPosition=camera.position.toArray(),dayIntensity=sun.intensity,dayBackground=(scene.background as THREE.Color).getHex();
    view.update([],20.5,'rain',12);flushFrames();const night=officeLightScheme(20.5,12,'rain');
    expect(sun.intensity).toBe(night.sunIntensity);expect(fill.intensity).toBe(night.fillIntensity);expect(ambient.intensity).toBe(night.ambientIntensity);expect(sun.intensity).toBeLessThan(dayIntensity);
    expect((scene.background as THREE.Color).getHex()).not.toBe(dayBackground);expect(camera.position.toArray()).toEqual(cameraPosition);expect(scene.children.map(item=>item.uuid)).toEqual(objects);
    expect(scene.children.filter(item=>item instanceof THREE.Light)).toEqual(lights);expect(lights.filter(light=>light.castShadow)).toHaveLength(1);
    expect(JSON.parse(host.dataset.officeLighting!)).toMatchObject({hour:20.5,month:12,weather:'rain',lamps:true,frame:'night'});
    expect(JSON.parse(host.dataset.officeWallAnimation!).moving).toBe(true);
    for(let i=0;i<20&&JSON.parse(host.dataset.officeWallAnimation!).moving;i++)flushFrames();
    expect(JSON.parse(host.dataset.officeWallAnimation!).moving).toBe(false);
    const count=fake.render.mock.calls.length;view.update([],20.5,'rain',12);flushFrames();expect(fake.render.mock.calls.length).toBe(count);expect(fake.frames.size).toBe(0);
    view.dispose();view.dispose();expect(fake.renderers[0].dispose).toHaveBeenCalledOnce();expect(fake.renderers[0].forceContextLoss).toHaveBeenCalledOnce();expect(fake.pipelineDispose).toHaveBeenCalledOnce();expect(fake.controlsDispose).toHaveBeenCalledOnce();expect(host.querySelector('canvas')).toBeNull();expect(host.dataset.officeLighting).toBeUndefined();
  });
});
