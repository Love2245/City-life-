// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import MobileDisplayControls from '../src/components/MobileDisplayControls.svelte';
import PhoneGameApp from '../src/components/PhoneGameApp.svelte';
import {enterMobileFullscreen,initializeMobileDisplay,mobileDisplay,resetMobileInsets,setMobileBottom,setMobileEdge,toggleMobileFullscreen} from '../src/stores/mobileDisplay.svelte';
import {overlayPortal} from '../src/lib/overlayPortal';
import {uiState} from '../src/stores/uiStore.svelte';
vi.mock('../src/lib/audio',()=>({beginMinigameMusic:()=>()=>{}}));
const KEY='urban-life-mobile-insets-v1';
let cleanup: (()=>void)|undefined;
const mounted: ReturnType<typeof mount>[]=[];
const nodes: HTMLElement[]=[];
const fullscreenDescriptor=Object.getOwnPropertyDescriptor(document.documentElement,'requestFullscreen');
const fullscreenElementDescriptor=Object.getOwnPropertyDescriptor(document,'fullscreenElement');
const exitFullscreenDescriptor=Object.getOwnPropertyDescriptor(document,'exitFullscreen');
const webkitDescriptor=Object.getOwnPropertyDescriptor(document.documentElement,'webkitRequestFullscreen');
const webkitElementDescriptor=Object.getOwnPropertyDescriptor(document,'webkitFullscreenElement');
function target(){const node=document.createElement('div');document.body.append(node);nodes.push(node);return node;}
function activeFullscreen(active:Element|null=document.documentElement){Object.defineProperty(document,'fullscreenElement',{configurable:true,value:active});}
function requestSucceeds(){const request=vi.fn().mockImplementation(async()=>activeFullscreen());Object.defineProperty(document.documentElement,'requestFullscreen',{configurable:true,value:request});return request;}
function playListener(options:{shouldEnterFullscreen:()=>boolean}){const events=vi.spyOn(window,'addEventListener');cleanup=initializeMobileDisplay(options);return events.mock.calls.find(([name])=>name==='click')![1] as (event:Event)=>void;}
function trustedClick(){return {isTrusted:true,type:'click'} as Event;}
beforeEach(()=>{localStorage.clear();resetMobileInsets();mobileDisplay.fullscreen=false;mobileDisplay.nativeManaged=false;});
afterEach(async()=>{cleanup?.();cleanup=undefined;for(const item of mounted.splice(0))await unmount(item);for(const node of nodes.splice(0))node.remove();for(const [object,key,descriptor] of [[document.documentElement,'requestFullscreen',fullscreenDescriptor],[document,'fullscreenElement',fullscreenElementDescriptor],[document,'exitFullscreen',exitFullscreenDescriptor],[document.documentElement,'webkitRequestFullscreen',webkitDescriptor],[document,'webkitFullscreenElement',webkitElementDescriptor]] as const){if(descriptor)Object.defineProperty(object,key,descriptor);else delete (object as any)[key];}delete (window as any).__TAURI_INTERNALS__;vi.restoreAllMocks();vi.unstubAllGlobals();uiState.modal=null;});

describe('手机屏幕适配与全屏回退',()=>{
 it('边缘设置通过真实控件修改，重新初始化后仍保留，且不进入角色存档',()=>{
  cleanup=initializeMobileDisplay();const root=target();mounted.push(mount(MobileDisplayControls,{target:root}));flushSync();
  const slider=root.querySelector<HTMLInputElement>('[aria-label="左右边缘留白"]')!;slider.value='48';slider.dispatchEvent(new Event('input',{bubbles:true}));flushSync();
  setMobileBottom(24);expect(document.documentElement.style.getPropertyValue('--mobile-edge-padding')).toBe('48px');
  cleanup();cleanup=undefined;mobileDisplay.edge=0;mobileDisplay.bottom=0;cleanup=initializeMobileDisplay();
  expect(mobileDisplay.edge).toBe(48);expect(mobileDisplay.bottom).toBe(24);
  [...root.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='恢复默认留白')!.click();flushSync();expect(mobileDisplay.edge).toBe(8);expect(mobileDisplay.bottom).toBe(8);
 });
 it('损坏或越界的设备配置可恢复，不会把全部游戏画面挤掉',()=>{
  localStorage.setItem(KEY,'{"edge":900,"bottom":"bad"}');cleanup=initializeMobileDisplay();expect(mobileDisplay.edge).toBe(80);expect(mobileDisplay.bottom).toBe(8);
  setMobileEdge(NaN);setMobileBottom(-8);expect(mobileDisplay.edge).toBe(8);expect(mobileDisplay.bottom).toBe(0);
  cleanup();localStorage.setItem(KEY,'broken');cleanup=initializeMobileDisplay();expect(mobileDisplay.edge).toBe(8);
 });
 it('玩家申请全屏时隐藏浏览器导航，并请求两个横屏方向',async()=>{
  const request=requestSucceeds(),lock=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('screen',{orientation:{lock}});
  expect(await toggleMobileFullscreen()).toBe(true);expect(request).toHaveBeenCalledWith({navigationUI:'hide'});expect(lock).toHaveBeenCalledWith('landscape');
 });
 it('容器拒绝全屏时显示回退说明，保留可操作的留白控件',async()=>{
  Object.defineProperty(document.documentElement,'requestFullscreen',{configurable:true,value:vi.fn().mockRejectedValue(new Error('host denied'))});cleanup=initializeMobileDisplay();
  const root=target();mounted.push(mount(MobileDisplayControls,{target:root}));flushSync();
  [...root.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='全屏游玩')!.click();
  await vi.waitFor(()=>{flushSync();expect(root.querySelector('[role="status"]')?.textContent).toContain('当前容器未允许全屏');});expect(root.querySelector('input')).not.toBeNull();expect(mobileDisplay.fullscreen).toBe(false);
 });
 it('没有全屏API的容器可正常游玩，旋转请求被拒绝也不阻断已成功的全屏',async()=>{
  Object.defineProperty(document.documentElement,'requestFullscreen',{configurable:true,value:undefined});expect(await toggleMobileFullscreen()).toBe(false);
  requestSucceeds();vi.stubGlobal('screen',{orientation:{lock:vi.fn().mockRejectedValue(new Error('unsupported'))}});
  expect(await toggleMobileFullscreen()).toBe(true);
 });
 it('浏览器退出全屏后按钮状态随真实全屏事件恢复',()=>{
  let active: Element|null=document.documentElement;Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>active});cleanup=initializeMobileDisplay();expect(mobileDisplay.fullscreen).toBe(true);
  active=null;document.dispatchEvent(new Event('fullscreenchange'));expect(mobileDisplay.fullscreen).toBe(false);
 });
});

describe('手游优先隐藏系统栏',()=>{
 it('仅在可游玩的移动端收到真实手势时自动申请一次，手动退出后不再强制进入',async()=>{
  const request=requestSucceeds();let eligible=false;const click=playListener({shouldEnterFullscreen:()=>eligible});
  click(trustedClick());expect(request).not.toHaveBeenCalled();eligible=true;
  click(new MouseEvent('click'));expect(request).not.toHaveBeenCalled();
  click(trustedClick());await vi.waitFor(()=>expect(mobileDisplay.fullscreen).toBe(true));expect(request).toHaveBeenCalledTimes(1);
  activeFullscreen(null);document.dispatchEvent(new Event('fullscreenchange'));click(trustedClick());expect(request).toHaveBeenCalledTimes(1);expect(mobileDisplay.fullscreen).toBe(false);
 });
 it('容器拒绝自动全屏后不逐次点击骚扰，玩家仍能从设置手动重试',async()=>{
  const request=vi.fn().mockRejectedValue(new Error('host denied'));Object.defineProperty(document.documentElement,'requestFullscreen',{configurable:true,value:request});
  const click=playListener({shouldEnterFullscreen:()=>true});click(trustedClick());await request.mock.results[0].value.catch(()=>undefined);expect(request).toHaveBeenCalledTimes(1);
  click(trustedClick());expect(request).toHaveBeenCalledTimes(1);expect(mobileDisplay.fullscreen).toBe(false);
  request.mockImplementation(async()=>activeFullscreen());expect(await toggleMobileFullscreen()).toBe(true);expect(request).toHaveBeenCalledTimes(2);
 });
 it('API空返回不当作已全屏，也不尝试锁定方向',async()=>{
  const lock=vi.fn();Object.defineProperty(document.documentElement,'requestFullscreen',{configurable:true,value:vi.fn().mockResolvedValue(undefined)});vi.stubGlobal('screen',{orientation:{lock}});
  expect(await enterMobileFullscreen()).toBe(false);expect(mobileDisplay.fullscreen).toBe(false);expect(lock).not.toHaveBeenCalled();
 });
 it('支持WebKit全屏状态，实际退出后状态恢复',async()=>{
  Object.defineProperty(document.documentElement,'requestFullscreen',{configurable:true,value:undefined});
  Object.defineProperty(document.documentElement,'webkitRequestFullscreen',{configurable:true,value:vi.fn(async()=>{Object.defineProperty(document,'webkitFullscreenElement',{configurable:true,value:document.documentElement});})});
  cleanup=initializeMobileDisplay();expect(mobileDisplay.fullscreenSupported).toBe(true);expect(await enterMobileFullscreen()).toBe(true);
  Object.defineProperty(document,'webkitFullscreenElement',{configurable:true,value:null});document.dispatchEvent(new Event('webkitfullscreenchange'));expect(mobileDisplay.fullscreen).toBe(false);
 });
 it('Android原生容器交给Activity管理系统栏，不重复申请WebView全屏',()=>{
  const request=requestSucceeds();(window as any).__TAURI_INTERNALS__={};vi.stubGlobal('navigator',{userAgent:'Android'});
  const click=playListener({shouldEnterFullscreen:()=>true});click(trustedClick());expect(mobileDisplay.nativeManaged).toBe(true);expect(request).not.toHaveBeenCalled();
 });
 it('手动全屏退出优先于之后的自动请求，卸载时移除手势监听',async()=>{
  const request=requestSucceeds(),remove=vi.spyOn(window,'removeEventListener');const click=playListener({shouldEnterFullscreen:()=>true});
  expect(await toggleMobileFullscreen()).toBe(true);Object.defineProperty(document,'exitFullscreen',{configurable:true,value:vi.fn(async()=>activeFullscreen(null))});
  expect(await toggleMobileFullscreen()).toBe(true);click(trustedClick());expect(request).toHaveBeenCalledTimes(1);expect(mobileDisplay.fullscreen).toBe(false);
  cleanup!();cleanup=undefined;expect(remove).toHaveBeenCalledWith('click',click);expect(remove).toHaveBeenCalledWith('keydown',click);
 });
});

describe('全屏弹窗保留应用缩放与安全区',()=>{
 it('弹窗移出场景裁切层，但留在app-zoom内，卸载清理不删除应用宿主',()=>{
  const app=target();app.className='app-zoom';const scene=document.createElement('section'),overlay=document.createElement('dialog');app.append(scene);scene.append(overlay);
  const handle=overlayPortal(overlay);expect(overlay.parentElement).toBe(app);handle.destroy();expect(overlay.isConnected).toBe(false);expect(app.isConnected).toBe(true);
 });
 it('实际手机小游戏走同一缩放宿主，退出后不留下全屏遮罩',()=>{
  const app=target();app.className='app-zoom';const root=document.createElement('main');app.append(root);uiState.modal='phone';
  mounted.push(mount(PhoneGameApp,{target:root,props:{installedGames:[{id:'snake',name:'贪吃蛇',icon:'🐍',desc:'测试'}]}}));flushSync();
  root.querySelector<HTMLButtonElement>('.job-item')!.click();flushSync();expect(app.querySelector(':scope > .phone-game-full')).not.toBeNull();expect(document.body.querySelector(':scope > .phone-game-full')).toBeNull();
  app.querySelector<HTMLButtonElement>('[aria-label="返回手机游戏列表"]')!.click();flushSync();expect(app.querySelector('.phone-game-full')).toBeNull();
 });
});
