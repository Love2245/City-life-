// @vitest-environment jsdom
import {beforeEach,describe,expect,it} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import SceneDisplayControls from '../src/components/SceneDisplayControls.svelte';
import {homePixelRatio,homeSceneQuality} from '../src/lib/homeQuality';
import {scenePixelRatio,type SceneQuality} from '../src/lib/scenePipeline';
import {HOME_LOW_WALL_HEIGHT,clampLowWallHeight,homeExteriorWallHeight} from '../src/lib/homeWallView';
import {effectiveMobileZoom,safeAreaTokens} from '../src/lib/mobileLayout';
import {uiState,setRenderScale,setRenderResolution,setHomeWallMode,setHomeLowWallHeight,setSceneMode,setGameMode,initZoom} from '../src/stores/uiStore.svelte';
import {renderPixelRatio} from '../src/lib/renderResolution';
import {gameState} from '../src/stores/gameStore.svelte';

beforeEach(()=>{localStorage.clear();uiState.gameMode='pc';uiState.sceneMode='3d';setRenderResolution('auto');setRenderScale(1);setHomeWallMode('cutaway');setHomeLowWallHeight(HOME_LOW_WALL_HEIGHT);});
describe('independent scene resolution and wall preferences',()=>{
  it('persists 2D/3D selection and keeps an explicit choice across device presets',async()=>{
    const save=JSON.stringify(gameState),target=document.createElement('div');document.body.append(target);const component=mount(SceneDisplayControls,{target,props:{home:true}});flushSync();
    const mode=target.querySelector<HTMLSelectElement>('[aria-label="场景显示"]')!;expect([...mode.options].map(option=>option.value)).toEqual(['3d','2d']);mode.value='2d';mode.dispatchEvent(new Event('change',{bubbles:true}));flushSync();
    expect(uiState.sceneMode).toBe('2d');expect(target.querySelector('[aria-label="3D 渲染分辨率"]')).toBeNull();
    uiState.sceneMode='3d';initZoom();expect(uiState.sceneMode).toBe('2d');setGameMode('pc');expect(uiState.sceneMode).toBe('2d');
    setSceneMode('3d');setGameMode('pe');expect(uiState.sceneMode).toBe('3d');expect(JSON.stringify(gameState)).toBe(save);await unmount(component);target.remove();setGameMode('pc');
  });
  it('defaults PE to photographs while preserving an explicit real-3D choice across layouts and reload',()=>{
    setGameMode('pe');expect(uiState.sceneMode).toBe('2d');setSceneMode('3d');uiState.sceneMode='2d';initZoom();expect(uiState.sceneMode).toBe('3d');setGameMode('pc');expect(uiState.sceneMode).toBe('3d');
  });
  it('migrates legacy pure-flat and former phone pseudo-3D settings to photographs once',()=>{
    localStorage.setItem('urban-life-scene-mode','flat');initZoom();expect(uiState.sceneMode).toBe('2d');expect(localStorage.getItem('urban-life-scene-mode')).toBe('2d');expect(localStorage.getItem('urban-life-scene-mode-v2')).toBe('1');
    localStorage.clear();localStorage.setItem('urban-life-ui-gamemode','pe');localStorage.setItem('urban-life-scene-mode','3d');initZoom();expect(uiState.sceneMode).toBe('2d');
    setSceneMode('3d');initZoom();expect(uiState.sceneMode).toBe('3d');
  });
  it('keeps a legacy desktop real-3D preference and does not alter gameplay state',()=>{
    const save=JSON.stringify(gameState);localStorage.setItem('urban-life-ui-gamemode','pc');localStorage.setItem('urban-life-scene-mode','3d');initZoom();expect(uiState.sceneMode).toBe('3d');expect(JSON.stringify(gameState)).toBe(save);
  });
  it('scales both renderer dimensions after the quality pixel budget, without altering quality',()=>{
    const venue:SceneQuality={id:'fine',pixelRatio:2,samples:4,shadowSize:4096,anisotropy:16,aoScale:.75,maxPixels:5_000_000};
    for(const [width,height] of [[1392,896],[3840,2160],[896,414]]){
      const home=homeSceneQuality('fine','pc',2), before=JSON.stringify([home,venue]);
      for(const scale of [.5,.7,.85,1]){
        expect(homePixelRatio(home,width,height,scale)/homePixelRatio(home,width,height)).toBeCloseTo(scale);
        expect(scenePixelRatio(venue,width,height,scale)/scenePixelRatio(venue,width,height)).toBeCloseTo(scale);
      }
      expect(JSON.stringify([home,venue])).toBe(before);
    }
    expect(scenePixelRatio(venue,100,100,NaN)).toBe(2);
  });
  it('keeps UI size, touch geometry and safe areas independent of render resolution',()=>{
    expect(effectiveMobileZoom(.7,.5)).toBe(effectiveMobileZoom(.7,1));
    const insets={top:20,right:62,bottom:20,left:62};
    expect(safeAreaTokens(insets,.7,.5)).toEqual(safeAreaTokens(insets,.7,1));
  });
  it('keeps auto framebuffer pixels independent of UI zoom',()=>{
    const q={pixelRatio:1,maxPixels:1_000_000};
    for(const zoom of [.5,.7,1,1.25]){
      const w=932/zoom,h=430/zoom,ratio=renderPixelRatio(q,w,h,1,'auto',zoom);
      expect(w*ratio).toBeCloseTo(932,5);expect(h*ratio).toBeCloseTo(430,5);
    }
  });
  it('renders native 4K and high-DPI pixels without the former 2MP budget, and bounds oversized buffers',()=>{
    const q={pixelRatio:1.5,maxPixels:2_000_000};
    expect(renderPixelRatio(q,3840,2160,1,'auto')).toBeLessThan(1);
    expect(renderPixelRatio(q,3840,2160,.5,'100',1,8192,1)).toBe(1);
    expect(renderPixelRatio(q,1920,1080,1,'100',1,8192,2)).toBe(2);
    expect(renderPixelRatio(q,1920,1080,1,'125',1,8192,1)).toBe(1.25);
    expect(renderPixelRatio(q,1920,1080,1,'150',1,8192,1)).toBe(1.5);
    expect(renderPixelRatio(q,2000,1000,1,'100',.7,8192,2)).toBe(1.4);
    expect(renderPixelRatio(q,7680,4320,1,'150',1,4096,2)*7680).toBeLessThanOrEqual(4096);
  });
  it('changes resolution in the real settings control and persists it without changing UI or game progress',async()=>{
    const save=JSON.stringify(gameState),zoom=uiState.zoom,mode=uiState.gameMode,css=document.documentElement.style.getPropertyValue('--ui-zoom');
    const target=document.createElement('div');document.body.append(target);const component=mount(SceneDisplayControls,{target});flushSync();
    const select=target.querySelector<HTMLSelectElement>('[aria-label="3D 渲染分辨率模式"]')!;select.value='125';select.dispatchEvent(new Event('change',{bubbles:true}));flushSync();
    expect(uiState.renderResolution).toBe('125');expect(target.querySelector('[aria-label="3D 渲染分辨率"]')).toBeNull();
    uiState.renderResolution='auto';initZoom();expect(uiState.renderResolution).toBe('125');expect(uiState.zoom).toBe(zoom);expect(uiState.gameMode).toBe(mode);expect(document.documentElement.style.getPropertyValue('--ui-zoom')).toBe(css);expect(JSON.stringify(gameState)).toBe(save);
    await unmount(component);target.remove();
  });
  it('retains a cabinet-height foreground wall and supports bounded heights, rear walls and zero-length views',()=>{
    const front=[0,6,8,6],target:[number,number]=[4,3],eye:[number,number]=[4,9];
    expect(homeExteriorWallHeight(front,target,eye,'cutaway')).toBe(.65);
    expect(homeExteriorWallHeight(front,target,eye,'cutaway',.65,1.05)).toBe(1.05);
    expect(homeExteriorWallHeight([0,0,8,0],target,eye,'cutaway',.65,1.05)).toBe(2.65);
    expect(homeExteriorWallHeight(front,target,eye,'full',.65,1.05)).toBe(2.65);
    expect(homeExteriorWallHeight(front,target,target,'cutaway')).toBe(2.65);
    expect(clampLowWallHeight(.1)).toBe(.45);expect(clampLowWallHeight(8)).toBe(1.2);expect(clampLowWallHeight(NaN)).toBe(.65);
  });
  it('persists display preferences separately and applies controls without changing the gameplay save',async()=>{
    const saved=JSON.stringify(gameState),target=document.createElement('div');document.body.append(target);
    const component=mount(SceneDisplayControls,{target,props:{home:true}});flushSync();
    const button=Array.from(target.querySelectorAll('button')).find(b=>b.textContent==='70%')!;button.click();flushSync();
    const height=target.querySelector<HTMLInputElement>('[aria-label="低墙保留高度"]')!;height.value='.9';height.dispatchEvent(new Event('input',{bubbles:true}));
    const mode=target.querySelector<HTMLSelectElement>('[aria-label="住宅墙体显示"]')!;mode.value='low';mode.dispatchEvent(new Event('change',{bubbles:true}));flushSync();
    expect(uiState.renderScale).toBe(.7);expect(uiState.homeLowWallHeight).toBe(.9);expect(uiState.homeWallMode).toBe('low');
    uiState.renderScale=1;uiState.homeWallMode='full';uiState.homeLowWallHeight=.45;initZoom();
    expect(uiState.renderScale).toBe(.7);expect(uiState.homeLowWallHeight).toBe(.9);expect(uiState.homeWallMode).toBe('low');
    expect(JSON.stringify(gameState)).toBe(saved);await unmount(component);target.remove();
  });
});
