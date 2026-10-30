// @vitest-environment jsdom
import {afterEach,beforeAll,describe,expect,it} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import NpcTalkModal from '../src/components/layout/NpcTalkModal.svelte';
import DeveloperPanel from '../src/components/DeveloperPanel.svelte';
import {createInitialState} from '../src/game/core/state';
import {ensureRelationship} from '../src/game/core/relationships';
import {gameState,replaceState,currentView} from '../src/stores/gameStore.svelte';
import {developerState,setDeveloperEnabled} from '../src/stores/developerStore.svelte';
import {uiState,closeNpcTalk,dismissToast} from '../src/stores/uiStore.svelte';
import {getItem} from '../src/game/core/items';
import {developerItemCategory} from '../src/game/core/developerInventory';
let component:ReturnType<typeof mount>|undefined,target:HTMLDivElement;
beforeAll(()=>{if(!Element.prototype.animate)Element.prototype.animate=(()=>({finished:Promise.resolve(),cancel(){},play(){},pause(){}})) as any;});
afterEach(async()=>{if(component)await unmount(component);component=undefined;target?.remove();closeNpcTalk();dismissToast();setDeveloperEnabled(false);currentView.name='menu';});
function render(view:any){target=document.createElement('div');document.body.append(target);component=mount(view,{target});flushSync();}
function base(){const s=createInitialState(149217);Object.assign(s.time,{day:3,hour:9,minute:0});s.locationId='labor_market';s.region='downtown_industrial';ensureRelationship(s,'npc_zhao_gang').affinity=40;return s;}
describe('用户反馈的实际界面回归',()=>{
  it.each(['done','failed'] as const)('任务%s在正式菜单显示正确结果，人物故事不再混入',status=>{
    const s=base();s.quests.push({id:'toy',type:'story',title:'给孩子留一份',desc:'',icon:'',day:0,status,npcTask:{taskId:'zhao_toy',stage:status,acceptedAt:0,deadlineAt:99999,revision:2,data:{referencePrice:100},outcome:'free'}});replaceState(s);
    uiState.npcTalk={npcId:'npc_zhao_gang',entry:'formal-menu'};render(NpcTalkModal);
    const topic=[...target.querySelectorAll<HTMLButtonElement>('.formal-topic')].find(b=>b.textContent?.includes('给孩子留一份'))!;expect(topic.querySelector('.topic-category')?.textContent).toBe(status==='done'?'已完成':'未完成');expect(topic.textContent).not.toContain('进行中');expect(target.textContent).not.toContain('两辆白车');
  });
  it('普通闲聊只有随机入口和任务相关话题，没有列出日常小事',()=>{
    replaceState(base());uiState.npcTalk={npcId:'npc_zhao_gang',entry:'chat-menu'};render(NpcTalkModal);
    expect(target.querySelector('.formal-topic')?.textContent).toContain('随便聊聊');expect(target.querySelectorAll('[data-casual-topic]')).toHaveLength(0);expect(target.textContent).not.toContain('黄金右脚');expect(target.textContent).not.toContain('两辆白车');
  });
  it('仓库细分类明确可切换，选分类回到列表开头，删除任务不在调试列表',()=>{
    replaceState(base());currentView.name='game';developerState.unlocked=true;setDeveloperEnabled(true);render(DeveloperPanel);
    target.querySelector<HTMLButtonElement>('nav button:nth-child(2)')!.click();flushSync();
    expect(target.querySelectorAll('[data-item-category]').length).toBeGreaterThan(10);
    const content=target.querySelector<HTMLElement>('.developer-content')!;content.scrollTop=1500;
    target.querySelector<HTMLButtonElement>('[data-item-category="clothing"]')!.click();flushSync();expect(content.scrollTop).toBe(0);
    expect(target.querySelector('[data-item-category="clothing"]')?.getAttribute('aria-pressed')).toBe('true');
    const records=[...target.querySelectorAll('.record small')];expect(records.length).toBeGreaterThan(0);for(const record of records){const id=record.textContent!.split(' · ')[0];expect(developerItemCategory(getItem(id)!)).toBe('clothing');}
    target.querySelector<HTMLButtonElement>('[data-item-category="quest_items"]')!.click();flushSync();expect(target.querySelectorAll('.record')).toHaveLength(2);
    target.querySelector<HTMLButtonElement>('nav button:nth-child(5)')!.click();flushSync();const select=target.querySelector<HTMLSelectElement>('[aria-label="选择调试任务"]')!;expect([...select.options].map(o=>o.value)).toEqual(['zhao_toy','zhao_staff']);
    expect(gameState.quests).toEqual([]);
  });
});
