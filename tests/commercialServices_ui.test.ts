// @vitest-environment jsdom
import {afterEach,describe,expect,it} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import CommercialServicesPanel from '../src/components/layout/CommercialServicesPanel.svelte';
import {createInitialState} from '../src/game/core/state';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
let component:ReturnType<typeof mount>|undefined;let target:HTMLDivElement;
afterEach(async()=>{if(component)await unmount(component);component=undefined;target?.remove();});
describe('交易所行情公告屏',()=>{
 it('显示真实的12只股票报价，免费电脑入口不要求私有电脑',()=>{const s=createInitialState(1495);s.locationId='commercial_exchange';replaceState(s);target=document.createElement('div');document.body.append(target);component=mount(CommercialServicesPanel,{target});flushSync();const show=[...target.querySelectorAll('button')].find(b=>b.textContent?.includes('行情公告屏'))!;show.click();flushSync();expect(target.querySelectorAll('.quotes>div')).toHaveLength(12);expect(target.textContent).toContain('朝夕食品');expect(target.textContent).toContain('使用免费电脑');expect(gameState.flags.item_laptop).toBeFalsy();});
});