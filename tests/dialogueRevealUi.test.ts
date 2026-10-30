// @vitest-environment jsdom
import {beforeAll,afterEach,describe,it,expect,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import NpcTalkModal from '../src/components/layout/NpcTalkModal.svelte';
import PhoneScreenWorkspace from '../src/components/PhoneScreenWorkspace.svelte';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
import {uiState,closeNpcTalk} from '../src/stores/uiStore.svelte';
import {createInitialState} from '../src/game/core/state';
import {addContactFromNpc} from '../src/game/core/contacts';
import {createPost} from '../src/game/core/moments';

let component:ReturnType<typeof mount>|undefined,target:HTMLDivElement;
beforeAll(()=>{if(!Element.prototype.animate)Element.prototype.animate=(()=>({finished:Promise.resolve(),cancel(){},play(){},pause(){}})) as any;});
afterEach(()=>{if(component)unmount(component);component=undefined;target?.remove();closeNpcTalk();vi.useRealTimers();vi.unstubAllGlobals();replaceState(createInitialState(1));});
function openTalk(reduce=false){
  vi.useFakeTimers();vi.stubGlobal('matchMedia',(query:string)=>({matches:reduce&&query.includes('prefers-reduced-motion'),media:query,addEventListener(){},removeEventListener(){}}));
  const s=createInitialState(105);s.locationId='cafe';s.region='downtown_residential';Object.assign(s.time,{day:3,hour:8,minute:0});replaceState(s);uiState.npcTalk={npcId:'npc_lin_xiaoyu',entry:'meet'};
  target=document.createElement('div');document.body.append(target);component=mount(NpcTalkModal,{target});flushSync();
}
function click(selector='.dialogue-box'){const el=target.querySelector<HTMLElement>(selector);expect(el,selector).not.toBeNull();el!.click();flushSync();}
function line(){return target.querySelector<HTMLElement>('.dialogue-box p')!;}
function firstSpeech(){for(let i=0;i<12&&target.querySelector('.speaker-name')?.textContent==='旁白';i++)click();expect(target.querySelector('.speaker-name')?.textContent).not.toBe('旁白');}

describe('NPC逐字字幕实际组件行为',()=>{
  it('旁白立即出现；NPC按时间显示；点击舞台只补全，再点击才下一段',()=>{
    openTalk();expect(target.querySelector('.speaker-name')?.textContent).toBe('旁白');expect(line().textContent).toBe(line().getAttribute('aria-label'));expect(line().dataset.revealing).toBe('false');
    const before=JSON.stringify(gameState);firstSpeech();expect(line().dataset.revealing).toBe('true');const full=line().getAttribute('aria-label')!,counter=target.querySelector('.line-counter')?.textContent,portrait=target.querySelector('.npc-portrait-slot')?.getAttribute('data-portrait-category');
    // 只推进首字的32ms；5字短句在160ms已完整显示，无法验证中间态。
    vi.advanceTimersByTime(32);flushSync();expect(line().textContent!.length).toBeGreaterThan(0);expect(line().textContent!.length).toBeLessThan(full.length);
    click('.character-layout');expect(line().textContent).toBe(full);expect(line().dataset.revealing).toBe('false');expect(target.querySelector('.line-counter')?.textContent).toBe(counter);expect(target.querySelector('.npc-portrait-slot')?.getAttribute('data-portrait-category')).toBe(portrait);expect(target.querySelector('.choice-btn')).toBeNull();
    click();expect(target.querySelector('.line-counter')?.textContent!==counter||!!target.querySelector('.choice-btn')).toBe(true);expect(JSON.stringify(gameState)).toBe(before);
  });
  it('自然显示完也不自动跳页或出现选项，退出时清除字幕计时',()=>{
    openTalk();firstSpeech();const full=line().getAttribute('aria-label'),counter=target.querySelector('.line-counter')?.textContent;
    vi.advanceTimersByTime(12000);flushSync();expect(line().textContent).toBe(full);expect(target.querySelector('.line-counter')?.textContent).toBe(counter);expect(target.querySelector('.choice-btn')).toBeNull();
    click();closeNpcTalk();flushSync();unmount(component!);component=undefined;expect(vi.getTimerCount()).toBe(0);
  });
  it('开启减少动态效果时立即显示全文，一次点击仍可正常翻页',()=>{
    openTalk(true);firstSpeech();expect(line().dataset.revealing).toBe('false');expect(line().textContent).toBe(line().getAttribute('aria-label'));
    const counter=target.querySelector('.line-counter')?.textContent;click();expect(target.querySelector('.line-counter')?.textContent!==counter||!!target.querySelector('.choice-btn')).toBe(true);
  });
});
it('招聘占首页第二格，朋友圈从通讯分类进入，点赞/评论/返回保留且不花游戏时间',()=>{
  const s=createInitialState(1492);addContactFromNpc(s,'npc_zhao_gang');const contact=s.contacts.find(c=>c.npcId==='npc_zhao_gang')!;
  const post=createPost(s,{text:'原来的朋友圈内容',category:'daily'});Object.assign(post,{author:'contact',contactId:contact.id,npcId:contact.npcId,authorName:contact.name});s.social!.unreadMoments=1;replaceState(s);
  target=document.createElement('div');document.body.append(target);component=mount(PhoneScreenWorkspace,{target});flushSync();
  const apps=[...target.querySelectorAll<HTMLElement>('.phone-home .app')];expect(apps[1].getAttribute('aria-label')).toBe('招聘');expect(target.querySelector('.phone-home')?.textContent).not.toContain('Moments');
  apps[0].click();flushSync();expect(target.querySelector('.phone')?.getAttribute('data-phone-app')).toBe('call');
  const tab=[...target.querySelectorAll<HTMLButtonElement>('.wc-tab')].find(b=>b.textContent?.includes('朋友圈'))!;expect(tab).toBeDefined();tab.click();flushSync();
  expect(target.querySelector('.phone')?.getAttribute('data-phone-app')).toBe('call');expect(target.querySelector('.moments-page')?.textContent).toContain('原来的朋友圈内容');expect(gameState.social!.unreadMoments).toBe(0);
  const clock=JSON.stringify(gameState.time);click('.tl-like');expect(gameState.social!.posts[0].selfLiked).toBe(true);click('.tl-cmt');expect(target.querySelector('.tl-comment-input')).not.toBeNull();
  const input=target.querySelector<HTMLInputElement>('.tl-comment-input input')!;input.value='看到了';input.dispatchEvent(new Event('input',{bubbles:true}));click('.tl-comment-input button');expect(gameState.social!.posts[0].comments.some(c=>c.text==='看到了')).toBe(true);expect(JSON.stringify(gameState.time)).toBe(clock);
  [...target.querySelectorAll<HTMLButtonElement>('.wc-tab')].find(b=>b.textContent==='聊天')!.click();flushSync();expect(target.querySelector('.moments-page')).toBeNull();expect(target.querySelector('.sms-list')).not.toBeNull();
});
