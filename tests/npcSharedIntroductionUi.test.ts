// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import NpcTalkModal from '../src/components/layout/NpcTalkModal.svelte';
import { createInitialState } from '../src/game/core/state';
import { ensureRelationship } from '../src/game/core/relationships';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { closeNpcTalk, uiState } from '../src/stores/uiStore.svelte';
import { moveTo } from '../src/game/core/actions';

let target: HTMLDivElement, component: ReturnType<typeof mount> | undefined;
beforeAll(() => { if (!Element.prototype.animate) Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any; });
afterEach(async () => { if (component) await unmount(component); component = undefined; target?.remove(); closeNpcTalk(); replaceState(createInitialState()); });
function open(entry: 'introduction' | 'choose', topicId?: string) {
  uiState.npcTalk = { npcId: 'npc_fan_kejie', entry, topicId };
  target = document.createElement('div'); document.body.append(target); component = mount(NpcTalkModal, { target }); flushSync();
}
function click(selector: string) { const el = target.querySelector<HTMLElement>(selector); expect(el, selector).not.toBeNull(); el!.click(); flushSync(); }
function showChoices() { for (let i = 0; i < 40 && !target.querySelector('.choice-btn'); i++) click('.dialogue-box'); expect(target.querySelector('.choice-btn')).not.toBeNull(); }
function finishDialogue(check?: () => void) {
  for (let i = 0; i < 250 && !target.querySelector('.result-panel'); i++) {
    check?.();
    if (target.querySelector('.choice-btn')) click('.choice-btn'); else click('.dialogue-box');
  }
  expect(target.querySelector('.result-panel')).not.toBeNull();
}
function stateAtOpening() {
  const s = createInitialState(93); Object.assign(s.time, { year: 2026, month: 8, day: 3, hour: 18, minute: 0 });
  s.locationId = 'boyue_snack_street'; s.region = 'boyue_night_market'; s.player.money = 100;
  return s;
}

describe('shared opening UI and selectable casual topics', () => {
  it('plays M01, hides the departing sister with stable staging, enters the bar that day, then plays only Kejie and Jack', () => {
    replaceState(stateAtOpening()); open('introduction', 'M01');
    expect(target.querySelectorAll('.npc-side')).toHaveLength(2);
    const playerStyle = target.querySelector('.player-side')!.getAttribute('style'); let checkedDeparture = false;
    finishDialogue(() => {
      const layout = target.querySelector<HTMLElement>('.character-layout');
      if (layout?.dataset.nodeId.startsWith('m1_invite')) {
        checkedDeparture = true;
        expect(target.querySelector('[data-npc-id="npc_fan_kexi"]')?.classList.contains('actor-departed')).toBe(true);
        expect(target.querySelector('.player-side')!.getAttribute('style')).toBe(playerStyle);
      }
    });
    expect(checkedDeparture).toBe(true); expect(gameState.flags.npc_introduction_m01_complete).toBe(true);
    expect(gameState.inventory.boyue_lounge_beer_coupon).toBe(1); expect(gameState.time.hour).toBe(18); expect(gameState.time.minute).toBe(30);
    click('.continue-btn'); expect(uiState.npcTalk).toBeNull();
    expect(moveTo(gameState, 'boyue_lounge_bar').ok).toBe(true);
    uiState.npcTalk = { npcId: 'npc_fan_kejie', entry: 'introduction', topicId: 'M02' }; flushSync();
    expect([...target.querySelectorAll<HTMLElement>('.npc-side')].map(el => el.dataset.npcId)).toEqual(['npc_fan_kejie', 'npc_jack_fanma']);
    expect(target.querySelector('[data-npc-id="npc_fan_kexi"]')).toBeNull();
    const before = gameState.time.day; finishDialogue(); expect(gameState.flags.npc_introduction_m02_complete).toBe(true); expect(gameState.time.day).toBe(before);
  });
  it('puts life stories in random casual chat and leaves formal dialogue for tasks', () => {
    const s = stateAtOpening(); s.locationId = 'boyue_lounge_bar'; s.time.hour = 19; s.flags.npc_introduction_m02_complete = true;
    Object.assign(ensureRelationship(s, 'npc_fan_kejie'), { affinity: 80, state: 'close_friend' }); replaceState(s); open('choose');
    const buttons = [...target.querySelectorAll<HTMLButtonElement>('.interaction-option')]; buttons.find(b => b.textContent?.includes('闲聊'))!.click(); flushSync();
    expect(target.querySelector('[aria-label="闲聊话题"]')).not.toBeNull();
    expect(target.querySelector('[data-casual-topic="reset_topic_t03"]')).toBeNull();
    expect(target.querySelector('[data-casual-topic="reset_topic_t01"]')).toBeNull();
    click('.formal-topic'); expect(target.querySelector('.character-layout')).not.toBeNull(); showChoices();
    click('.end-dialogue-btn');
    uiState.npcTalk = { npcId: 'npc_fan_kejie', entry: 'formal-menu' }; flushSync();
    expect(target.textContent).not.toContain('退学通知没等到'); expect(target.textContent).not.toContain('钱不能留过夜');
    expect(gameState.flags.npc_chat_count_npc_fan_kejie).toBeUndefined();
  });
});
