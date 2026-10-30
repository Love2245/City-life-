// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import BackgroundView from '../src/views/BackgroundView.svelte';
import {uiState,setSceneMode} from '../src/stores/uiStore.svelte';
import {backToMenu,currentView,gameState} from '../src/stores/gameStore.svelte';

let component:ReturnType<typeof mount>|undefined,target:HTMLDivElement|undefined;
afterEach(async()=>{if(component)await unmount(component);component=undefined;target?.remove();target=undefined;backToMenu();vi.unstubAllGlobals();});
for(const mode of ['2d','3d'] as const)it(`previews ${mode}, preserves allocation on back navigation, and applies the choice only when starting`,async()=>{
  setSceneMode(mode==='2d'?'3d':'2d');const previous=uiState.sceneMode,save=JSON.stringify(gameState);
  target=document.createElement('div');document.body.append(target);component=mount(BackgroundView,{target});flushSync();
  const images=target.querySelectorAll('fieldset img');expect(images).toHaveLength(2);expect(images[0].getAttribute('src')).not.toBe(images[1].getAttribute('src'));
  const radio=target.querySelector<HTMLInputElement>(`input[value="${mode}"]`)!;radio.click();flushSync();expect(radio.checked).toBe(true);expect(uiState.sceneMode).toBe(previous);expect(JSON.stringify(gameState)).toBe(save);
  const click=(text:string)=>{const button=[...target!.querySelectorAll('button')].find(b=>b.textContent?.includes(text));expect(button).toBeDefined();button!.click();flushSync();};
  click('下一步：分配属性');const plus=target.querySelector<HTMLButtonElement>('.ctrl button:last-child')!;plus.click();flushSync();expect(target.querySelector('.count')?.textContent).toBe('1');
  click('上一步：选择画面');expect(target.querySelector<HTMLInputElement>(`input[value="${mode}"]`)!.checked).toBe(true);click('下一步：分配属性');expect(target.querySelector('.count')?.textContent).toBe('1');
  click('下一步：确认');expect(target.textContent).toContain(mode==='3d'?'3D · 自由视角':'2D · 固定方向');expect(uiState.sceneMode).toBe(previous);
  click('开始生活');expect(uiState.sceneMode).toBe(mode);expect(localStorage.getItem('urban-life-scene-mode')).toBe(mode);expect(currentView.name).toBe('game');
});
