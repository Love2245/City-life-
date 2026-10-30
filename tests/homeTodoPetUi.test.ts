// @vitest-environment jsdom
import {describe,it,expect,beforeAll,afterEach,vi} from 'vitest';
import {mount,flushSync,unmount} from 'svelte';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
import {uiState} from '../src/stores/uiStore.svelte';
import {createInitialState} from '../src/game/core/state';
import {signLease} from '../src/game/core/housing';
import {moveTo} from '../src/game/core/actions';
import {adoptCat} from '../src/game/core/cat';
import CatPanel from '../src/components/CatPanel.svelte';
import QuestSidebar from '../src/components/layout/QuestSidebar.svelte';
import DailyGoalsSync from '../src/components/layout/DailyGoalsSync.svelte';
vi.mock('../src/lib/audio',()=>({playInteractionSound:vi.fn(),playActionSound:vi.fn(),playSound:vi.fn()}));
const mounted:{component:ReturnType<typeof mount>;target:HTMLElement}[]=[];
beforeAll(()=>{if(!Element.prototype.animate)Element.prototype.animate=(()=>({finished:Promise.resolve(),cancel(){},play(){},pause(){}})) as any;});
function show(component:any){const target=document.createElement('div');document.body.append(target);const instance=mount(component,{target});mounted.push({component:instance,target});flushSync();return target;}
afterEach(async()=>{for(const item of mounted.splice(0)){await unmount(item.component);item.target.remove();}uiState.modal=null;uiState.catPanelPetUid=null;uiState.catPanelTab='care';uiState.phoneStartApp='home';});
describe('home todo and pet entry UI',()=>{
  it('shows the clicked cat for care without changing the carried cat or consuming game time',()=>{
    const s=createInitialState(745);s.player.money=5000;signLease(s,'old_apartment');moveTo(s,'old_apartment');const first=adoptCat(s,'orange')!,second=adoptCat(s,'mint')!;replaceState(s);uiState.catPanelPetUid=second.uid;const before=JSON.stringify(gameState.time),target=show(CatPanel);
    expect(target.querySelector('.cat-card .cat-name')?.textContent).toContain(second.name);expect(target.querySelector('.cat-card .pet-tag')?.textContent).toContain('未携带');expect(gameState.activePet).toBe(first.uid);expect(JSON.stringify(gameState.time)).toBe(before);expect(uiState.catPanelPetUid).toBeNull();
  });
  it('keeps outside phone content hidden until the edge is clicked and opens the full phone modal',()=>{
    replaceState(createInitialState(746));const before=JSON.stringify(gameState.time),target=show(QuestSidebar);expect(target.querySelector('.phone.panel')).toBeNull();expect(target.querySelector('.pocket-surface')?.getAttribute('aria-hidden')).toBe('true');target.querySelector<HTMLButtonElement>('[aria-label="打开手机"]')!.click();flushSync();expect(uiState.modal).toBe('phone');expect(uiState.phoneStartApp).toBe('home');expect(JSON.stringify(gameState.time)).toBe(before);
  });
  it('keeps the retired sync component inert without goals or extra RNG',()=>{
    replaceState(createInitialState(747));show(DailyGoalsSync);const before=JSON.stringify(gameState);show(DailyGoalsSync);expect(JSON.stringify(gameState)).toBe(before);expect(gameState.dailyGoals).toBeUndefined();
  });
});
