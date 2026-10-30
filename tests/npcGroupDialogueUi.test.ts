// @vitest-environment jsdom
import './helpers/instantDialogue';
import {afterEach,beforeAll,describe,it,expect} from 'vitest';
import {mount,flushSync,unmount,tick} from 'svelte';
import NpcTalkModal from '../src/components/layout/NpcTalkModal.svelte';
import {createInitialState} from '../src/game/core/state';
import {ensureRelationship} from '../src/game/core/relationships';
import {weekdayOf} from '../src/game/core/calendar';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
import {uiState,closeNpcTalk} from '../src/stores/uiStore.svelte';

const sister='npc_fan_kexi',brother='npc_fan_kejie';
let target:HTMLDivElement,component:ReturnType<typeof mount>|undefined;
beforeAll(()=>{if(!Element.prototype.animate)Element.prototype.animate=(()=>({finished:Promise.resolve(),cancel(){},play(){},pause(){}})) as any;});
afterEach(async()=>{if(component)await unmount(component);component=undefined;target?.remove();closeNpcTalk();replaceState(createInitialState());});
function open(id=sister){const s=createInitialState(18);s.flags.npc_introduction_m02_complete=true;while(weekdayOf(s.time)!==2)s.time.day++;s.time.hour=17;s.time.minute=10;s.locationId='dev_food_street';s.region='development_university';for(const npcId of [sister,brother])ensureRelationship(s,npcId);replaceState(s);uiState.npcTalk={npcId:id,entry:'chat-menu'};target=document.createElement('div');document.body.append(target);component=mount(NpcTalkModal,{target});flushSync();}
function click(selector:string){const element=target.querySelector<HTMLElement>(selector);expect(element,selector).not.toBeNull();element!.click();flushSync();}
function next(){click('.dialogue-box');}
function actor(id:string){return target.querySelector<HTMLElement>(`.npc-side[data-npc-id="${id}"]`)!;}
function start(){click('[data-casual-topic^="group:"]');}
function choices(){for(let i=0;i<20&&!target.querySelector('.choice-btn');i++)next();expect(target.querySelector('.choice-btn')).not.toBeNull();}

describe('three-person NPC dialogue stage',()=>{
  it.each([sister,brother])('opens from %s with three stable actors and an explicit narrator',id=>{
    open(id);expect(target.querySelector('[data-casual-topic^="group:"]')).not.toBeNull();start();expect(target.querySelector('.group-conversation')).not.toBeNull();expect(target.querySelectorAll('.player-side')).toHaveLength(1);expect(target.querySelectorAll('.npc-side')).toHaveLength(2);expect(target.querySelector('.speaker-name')?.textContent).toBe('旁白');expect(target.querySelectorAll('[data-speaking="true"]')).toHaveLength(0);expect([...target.querySelectorAll<HTMLElement>('.npc-side')].map(e=>e.dataset.npcId)).toEqual([sister,brother]);
  });
  it('changes speaker, text, focus and only that actor’s emotion on each advance',()=>{
    open();start();next();expect(target.querySelector('.speaker-name')?.textContent).toBe('珂汐');expect(actor(sister).dataset.speaking).toBe('true');expect(actor(sister).dataset.inFront).toBe('true');expect(target.querySelector('.dialogue-box p')?.textContent).toContain('这边还有位置');
    const sisterActor=actor(sister),brotherActor=actor(brother),mood=actor(sister).querySelector('.npc-portrait-slot')!.getAttribute('data-portrait-category');
    next();expect(target.querySelector('.speaker-name')?.textContent).toBe('柯杰');expect(actor(brother).dataset.speaking).toBe('true');expect(actor(brother).dataset.inFront).toBe('true');expect(actor(sister).dataset.inFront).toBe('false');expect(actor(sister)).toBe(sisterActor);expect(actor(brother)).toBe(brotherActor);expect(actor(sister).querySelector('.npc-portrait-slot')!.getAttribute('data-portrait-category')).toBe(mood);
    next();expect(target.querySelector('.speaker-name')?.textContent).toBe('珂汐');expect(actor(sister).dataset.inFront).toBe('true');
  });
  it('plays the player reply on the left without losing either listening NPC or applying effects early',()=>{
    open();const before=JSON.stringify(gameState);start();choices();click('.choice-btn');expect(target.querySelector('.speaker-name')?.textContent).toBe(gameState.player.name);expect(target.querySelector('.player-side')?.classList.contains('speaking')).toBe(true);expect(target.querySelectorAll('.npc-side')).toHaveLength(2);expect(target.querySelectorAll('[data-speaking="true"]')).toHaveLength(0);expect(JSON.stringify(gameState)).toBe(before);next();expect(target.querySelector('.character-layout')?.getAttribute('data-node-id')).toBe('today');expect(target.querySelector('.speaker-name')?.textContent).toBe('珂汐');
    choices();expect(actor(brother).dataset.inFront).toBe('true');click('.choice-btn');expect(actor(brother).dataset.inFront).toBe('true');expect(target.querySelectorAll('[data-speaking="true"]')).toHaveLength(0);expect(JSON.stringify(gameState)).toBe(before);
  });
  it('uses clear portraits immediately and exits without writing a partial conversation',()=>{
    open();const before=JSON.stringify(gameState);start();next();for(const id of [sister,brother])expect(actor(id).querySelector('.npc-portrait-slot')?.getAttribute('data-portrait-mask')).toBe('none');expect(target.querySelector('.portrait-face-overlay')).toBeNull();click('.end-dialogue-btn');expect(uiState.npcTalk).toBeNull();expect(JSON.stringify(gameState)).toBe(before);
  });
  it('completes a full branch through the real UI and shows both affinity changes',async()=>{
    open(brother);start();for(let node=0;node<3;node++){choices();click('.choice-btn');for(let i=0;i<20&&target.querySelector('.player-side.speaking');i++)next();}await tick();flushSync();expect(target.querySelector('.result-panel')).not.toBeNull();expect(target.textContent).toContain('范珂汐好感');expect(target.textContent).toContain('范柯杰好感');expect(gameState.time.minute).toBe(16);expect(gameState.relationships.find(r=>r.npcId===sister)!.affinity).toBe(1);expect(gameState.relationships.find(r=>r.npcId===brother)!.affinity).toBe(1);
  });
});
