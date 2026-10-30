// @vitest-environment jsdom
import {afterEach,beforeAll,describe,expect,it} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import Phone from '../src/components/PhoneScreenWorkspace.svelte';
import Laptop from '../src/components/layout/LaptopDesktopView.svelte';
import {createInitialState} from '../src/game/core/state';
import {sendSms} from '../src/game/core/phone';
import {contactSmsTopics} from '../src/game/core/contacts';
import {groupSmsThreads} from '../src/game/core/sms';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
import {uiState} from '../src/stores/uiStore.svelte';
const mounted:Array<{instance:ReturnType<typeof mount>;target:HTMLElement}>=[];
beforeAll(()=>{Element.prototype.animate??=(()=>({finished:Promise.resolve(),cancel(){},play(){},pause(){}})) as any;});
afterEach(()=>{for(const m of mounted.splice(0)){unmount(m.instance);m.target.remove();}replaceState(createInitialState(1));uiState.modal=null;uiState.toast=null;});
function phone(){const target=document.createElement('div');document.body.append(target);mounted.push({instance:mount(Phone,{target}),target});flushSync();return target;}
function laptop(){const target=document.createElement('div');document.body.append(target);mounted.push({instance:mount(Laptop,{target}),target});flushSync();click(target,'.desk-icon[data-app-id="wechat"]');return target;}
function click(target:HTMLElement,selector:string,text?:string){const b=[...target.querySelectorAll<HTMLButtonElement>(selector)].find(b=>!text||b.textContent?.includes(text));expect(b,selector+' '+text).toBeDefined();b!.click();flushSync();}
function incoming(){const s=createInitialState(841);s.player.money=10000;s.smsInbox=[];sendSms(s,'妈妈','👩','早点吃饭，别饿着自己。');sendSms(s,'城市银行','🏦','本月账单。');sendSms(s,'老同学','👤','好久不见。');replaceState(s);}
async function settled(){await new Promise(r=>setTimeout(r,0));flushSync();}
describe('手机应用空间与双端通信',()=>{
  it('打开应用收起桌面 dock，手势条返回桌面后恢复四个入口',async()=>{
    incoming();const p=phone();expect(p.querySelectorAll('.p-dock button')).toHaveLength(4);
    for(const app of ['待办','通信','设置']){
      click(p,'.p-dock button',app);await settled();expect(p.querySelector('.p-dock')).toBeNull();
      expect(p.querySelector('.phone.app-active')).not.toBeNull();
      click(p,'button[aria-label="返回手机桌面"]');await settled();expect(p.querySelectorAll('.p-dock button')).toHaveLength(4);
    }
  });
  it('手机发出的话题、电脑回复和已读在同一会话内同步，通知与陌生来信分开',async()=>{
    incoming();const p=phone(),l=laptop();click(p,'.p-dock button','通信');await settled();
    expect(l.querySelector('.wechat-list')?.textContent).toContain('妈妈');
    expect([...l.querySelectorAll('.wc-item')].map(b=>b.textContent)).not.toEqual(expect.arrayContaining([expect.stringContaining('城市银行')]));
    expect(l.querySelector('.request-inbox')?.textContent).toContain('消息请求');
    click(p,'.sms-item','妈妈');await settled();
    expect(gameState.smsInbox.find(m=>m.sender==='妈妈')?.read).toBe(true);
    expect(l.querySelector('.wc-item .wc-badge')).toBeNull();
    click(p,'.composer-toggle');click(p,'.wc-topic');await settled();
    const firstTopic=contactSmsTopics(gameState,gameState.contacts.find(c=>c.name==='妈妈')!)[0];
    expect(l.querySelector('.wc-item')?.textContent).toContain('妈妈');
    click(l,'.wc-item','妈妈');await settled();
    expect(l.querySelector('.wc-msgs')?.textContent).toContain(firstTopic.outgoing);
    expect(l.querySelector('.wc-msgs')?.textContent).toContain(firstTopic.reply);
    click(l,'.composer-toggle');const topics=l.querySelectorAll<HTMLButtonElement>('.wc-topic');expect(topics.length).toBeGreaterThan(1);topics[1].click();flushSync();await settled();
    const secondTopic=contactSmsTopics(gameState,gameState.contacts.find(c=>c.name==='妈妈')!)[1];
    expect(p.querySelector('.wc-msgs')?.textContent).toContain(secondTopic.outgoing);
    expect(p.querySelector('.wc-msgs')?.textContent).toContain(secondTopic.reply);
    expect(groupSmsThreads(gameState).filter(t=>t.name==='妈妈')).toHaveLength(1);
    expect(gameState.smsInbox.filter(m=>m.sender==='妈妈'&&m.dir==='in').every(m=>m.read||m.replied)).toBe(true);
    click(l,'.social-tabs button','通知');expect(l.querySelector('.wc-item')?.textContent).toContain('城市银行');
    click(l,'.social-tabs button','聊天');click(l,'.request-inbox');expect(l.querySelector('.wc-item')?.textContent).toContain('老同学');
  });
  it('电脑可以从通讯录发起没有历史消息的会话，手机马上显示',async()=>{
    const s=createInitialState(843);s.smsInbox=[];replaceState(s);const p=phone(),l=laptop();
    click(p,'.p-dock button','通信');click(l,'.social-tabs button','通讯录');click(l,'.wc-item','妈妈');
    expect(l.querySelector('.wc-chat-head')?.textContent).toContain('妈妈');
    click(l,'.composer-toggle');click(l,'.wc-topic');await settled();
    expect(p.querySelector('.social-list')?.textContent).toContain('妈妈');
    expect(groupSmsThreads(gameState).filter(t=>t.name==='妈妈')).toHaveLength(1);
  });
});
