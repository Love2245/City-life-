// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import SceneDisplayControls from '../src/components/SceneDisplayControls.svelte';
import {uiState,initZoom,setRenderScale,setGameMode} from '../src/stores/uiStore.svelte';
import {gameState} from '../src/stores/gameStore.svelte';

describe('phone clarity preferences',()=>{
  it('migrates unreadable old phone scales and shows only supported clear presets',async()=>{
    localStorage.clear();const save=JSON.stringify(gameState);
    localStorage.setItem('urban-life-ui-gamemode','pe');localStorage.setItem('urban-life-ui-zoom','.7');localStorage.setItem('urban-life-pe-zoom-v3','1');localStorage.setItem('urban-life-render-scale','.5');initZoom();
    expect(uiState.renderScale).toBe(.85);expect(uiState.zoom).toBe(.7);expect(localStorage.getItem('urban-life-render-scale')).toBe('0.85');
    setRenderScale(.5);expect(uiState.renderScale).toBe(.85);
    const target=document.createElement('div');document.body.append(target);uiState.sceneMode='3d';uiState.renderResolution='auto';
    const component=mount(SceneDisplayControls,{target});flushSync();expect(target.querySelector<HTMLInputElement>('[aria-label="3D 渲染分辨率"]')!.min).toBe('0.85');
    expect([...target.querySelectorAll('.resolution-presets button')].map(b=>b.textContent)).toEqual(['85%','90%','100%']);expect(JSON.stringify(gameState)).toBe(save);
    await unmount(component);target.remove();setGameMode('pc');setRenderScale(.5);expect(uiState.renderScale).toBe(.5);localStorage.clear();setRenderScale(1);
  });
});
