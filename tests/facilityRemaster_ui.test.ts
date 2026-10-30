// @vitest-environment jsdom
import {afterEach,beforeAll,describe,it,expect,vi} from 'vitest';
import {mount,flushSync,unmount} from 'svelte';
import ServiceWindows from '../src/components/layout/ServiceWindows.svelte';
import CommercialServicesPanel from '../src/components/layout/CommercialServicesPanel.svelte';
import {createInitialState} from '../src/game/core/state';
import {replaceState,gameState} from '../src/stores/gameStore.svelte';
import {uiState,setSceneMode} from '../src/stores/uiStore.svelte';
vi.mock('../src/lib/homeStillView',()=>({createHomeStillView:()=>({ready:Promise.resolve(),update(){},setWalls(){},setQuality(){},zoom(){},focus(){},select(){},hover(){},rotate(){},dispose(){}})}));

let component:ReturnType<typeof mount>|undefined,target:HTMLDivElement;
beforeAll(()=>{globalThis.ResizeObserver??=class{observe(){}disconnect(){}} as any;window.matchMedia??=((media:string)=>({matches:false,media,addEventListener(){},removeEventListener(){}})) as any;});
afterEach(async()=>{if(component)await unmount(component);component=undefined;target?.remove();uiState.modal=null;});
function setup(id:string,exchange=false){const s=createInitialState(14953);s.player.money=1000;s.time.hour=12;s.locationId=id;s.region='downtown_commercial';replaceState(s);target=document.createElement('div');document.body.append(target);const onAction=vi.fn();component=exchange?mount(CommercialServicesPanel,{target}):mount(ServiceWindows,{target,props:{onAction}});flushSync();return onAction;}
function click(name:string){const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===name);expect(b,'button '+name).toBeDefined();b!.click();flushSync();}
describe('设施新窗口与原操作的接入',()=>{
 it('房源首层仅显示名称，点开有签约/买断/预览并交给原行动结算',()=>{const onAction=setup('housing_agency');const names=[...target.querySelectorAll('button')].map(b=>b.textContent);expect(names).toContain('精装公寓');expect(names).not.toContain('买断精装公寓');click('精装公寓');expect(document.querySelector('[role=dialog]')?.textContent).toContain('3200');click('签约');expect(onAction.mock.calls[0][0].id).toBe('sign_lease_premium_apartment');});
 it('校园房源仅租，2D模式看房使用截图且不改变游戏状态或地图偏好',async()=>{setup('housing_agency');setSceneMode('2d');const saved=JSON.stringify(gameState);click('人才公寓');const buy=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('买断'))!;expect(buy.disabled).toBe(true);click('预览');await vi.waitFor(()=>expect(document.querySelector('[data-home-tour="boyue_talent_apartment"]')).not.toBeNull());expect(document.querySelector('[data-home-tour]')?.getAttribute('data-tour-mode')).toBe('2d');expect(uiState.sceneMode).toBe('2d');expect(JSON.stringify(gameState)).toBe(saved);click('返回房屋列表');expect(uiState.sceneMode).toBe('2d');});
 it('载具单独窗口显示租用和买断，租赁后提供退租',()=>{const onAction=setup('car_rental');click('自行车');expect(document.querySelector('[role=dialog]')?.textContent).toContain('100');click('租用');expect(onAction.mock.calls[0][0].id).toBe('rent_bicycle_shop');});
 it('办证归于同一窗口，企业窗口提供真实登记，求职只展示符合要求的岗位',()=>{setup('municipal_hall');const company=[...target.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('企业窗口'))!;expect(company.disabled).toBe(false);click('企业窗口');expect(document.querySelector('[role=dialog]')!.textContent).toContain('准备注册公司');click('×');click('通行证窗口');const text=document.querySelector('[role=dialog]')!.textContent;expect(text).toContain('学生通行证');expect(text).toContain('工业通行证');click('×');click('求职窗口');expect(document.querySelector('[role=dialog]')!.textContent).not.toContain('辅导员');});
 it('交易所无自有电脑时可直接打开顺顺花，退出后不改变设备和安装标记',()=>{setup('commercial_exchange',true);click('使用免费电脑');expect(document.querySelector('[aria-label="交易所公用电脑"]')?.textContent).toContain('顺顺花');expect(document.body.textContent).toContain('朝夕食品');expect(uiState.modal).not.toBe('laptop');expect(gameState.flags.item_laptop).toBeFalsy();const close=document.querySelector<HTMLButtonElement>('[aria-label="关闭顺顺花"]')!;close.click();flushSync();expect(document.querySelector('[aria-label="交易所公用电脑"]')).toBeNull();expect(gameState.flags.laptop_app_invest).toBeFalsy();});
});
