// @vitest-environment jsdom
import './helpers/instantDialogue';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import NpcTalkModal from '../src/components/layout/NpcTalkModal.svelte';
import { createInitialState } from '../src/game/core/state';
import { ensureRelationship } from '../src/game/core/relationships';
import { executeNpcTaskAction, getNpcTaskQuest, npcTaskNow } from '../src/game/core/npcTasks';
import { npcCasualTopics, npcFormalTopics } from '../src/game/core/npcTalk';
import { INTRO_FIRST_COMPLETE, INTRO_SECOND_COMPLETE } from '../src/game/data/npcIntroductionProgress';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { closeNpcTalk, dismissToast, uiState } from '../src/stores/uiStore.svelte';
import { START_EPOCH, fromLinearDay, gameDay } from '../src/game/core/calendar';

let component: ReturnType<typeof mount> | undefined, target: HTMLDivElement;
beforeAll(() => {
  if (!Element.prototype.animate) Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
});
afterEach(() => { if (component) unmount(component); component = undefined; target?.remove(); closeNpcTalk(); dismissToast(); });
function accepted() {
  const s = createInitialState(149202);
  Object.assign(s.time, { day: 3, hour: 9, minute: 0 }); s.locationId = 'labor_market'; s.region = 'downtown_industrial'; s.player.money = 1000;
  ensureRelationship(s, 'npc_zhao_gang').affinity = 40;
  s.flags[INTRO_FIRST_COMPLETE] = true; s.flags[INTRO_SECOND_COMPLETE] = true;
  return executeNpcTaskAction(s, 'npc_zhao_gang', { taskId: 'zhao_staff', action: 'accept' }).state!;
}
function render(): void { target = document.createElement('div'); document.body.append(target); component = mount(NpcTalkModal, { target }); flushSync(); }
function readLines(): void {
  for (let i = 0; i < 80; i++) {
    const next = target.querySelector<HTMLButtonElement>('button[aria-label="点击任意处继续播放台词"]');
    if (!next) break; next.click(); flushSync();
  }
}
function openReady() {
  let s = accepted(); Object.assign(s.time, { hour: 18, minute: 0 }); s.locationId = 'boyue_lounge_bar'; s.region = 'boyue_night_market';
  ensureRelationship(s, 'npc_fan_kejie'); ensureRelationship(s, 'npc_jack_fanma');
  s = executeNpcTaskAction(s, 'npc_fan_kejie', { taskId: 'zhao_staff', action: 'staff_offer_300' }).state!;
  Object.assign(s.time, { day: 4, hour: 9, minute: 0 }); s.locationId = 'labor_market'; s.region = 'downtown_industrial'; replaceState(s);
  const topic = npcFormalTopics(gameState, 'npc_zhao_gang').find(t => t.npcTaskTopicId?.includes('zhao_staff'))!;
  uiState.npcTalk = { npcId: 'npc_zhao_gang', entry: 'formal', topicId: topic.id }; render(); readLines();
}
function openNextDayOwner(): void {
  closeNpcTalk(); flushSync();
  const next = JSON.parse(JSON.stringify(gameState));
  Object.assign(next.time, fromLinearDay(START_EPOCH + gameDay(next.time) + 1), { hour: 9, minute: 0 });
  next.locationId = 'labor_market'; next.region = 'downtown_industrial'; replaceState(next);
  const topic = npcFormalTopics(gameState, 'npc_zhao_gang').find(t => t.npcTaskTopicId?.includes('zhao_staff'))!;
  uiState.npcTalk = { npcId: 'npc_zhao_gang', entry: 'formal', topicId: topic.id }; flushSync(); readLines();
}

describe('赵刚任务2的界面动作，使用挂载组件而非操控浏览器', () => {
  it('赵刚介绍中主角说“然后呢”时切换到玩家，随后回到赵刚，阅读不创建任务', () => {
    const s = createInitialState(149202);
    Object.assign(s.time, { day: 3, hour: 9, minute: 0 }); s.locationId = 'labor_market'; s.region = 'downtown_industrial';
    ensureRelationship(s, 'npc_zhao_gang').affinity = 40; replaceState(s);
    const topic = npcFormalTopics(gameState, 'npc_zhao_gang').find(t => t.npcTaskTopicId?.includes('zhao_staff'))!;
    uiState.npcTalk = { npcId: 'npc_zhao_gang', entry: 'formal', topicId: topic.id }; render();
    const before = JSON.stringify(gameState);
    expect(target.querySelector('.speaker-name')?.textContent).toBe('旁白');
    for (let i = 0; i < 20 && target.querySelector('.character-layout')?.getAttribute('data-speaker-id') !== 'player'; i++) {
      target.querySelector<HTMLButtonElement>('button[aria-label="点击任意处继续播放台词"]')!.click(); flushSync();
    }
    expect(target.querySelector('.dialogue-box p')?.textContent).toBe('『然后呢』');
    expect(target.querySelector('.speaker-name')?.textContent).toBe(gameState.player.name);
    expect(target.querySelector('.player-side.speaking')).not.toBeNull();
    expect(target.querySelector('.npc-side.speaking')).toBeNull();
    expect(target.querySelector('.choice-btn')).toBeNull();
    target.querySelector<HTMLButtonElement>('button[aria-label="点击任意处继续播放台词"]')!.click(); flushSync();
    expect(target.querySelector('.character-layout')?.getAttribute('data-speaker-id')).toBe('npc_zhao_gang');
    expect(target.querySelector('.dialogue-box p')?.textContent).toContain('然后我还不赶紧答应');
    readLines(); expect(target.querySelectorAll('.choice-btn')).toHaveLength(2);
    expect(JSON.stringify(gameState)).toBe(before);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); flushSync();
    expect(JSON.stringify(gameState)).toBe(before);
  });
  it('同一次对话依次从100到妹妹饭约、继续请求和车费，最后确认才登记170元约定', () => {
    const s = accepted(); Object.assign(s.time, { hour: 18, minute: 0 }); s.locationId = 'boyue_lounge_bar'; s.region = 'boyue_night_market';
    ensureRelationship(s, 'npc_fan_kejie').affinity = 20; replaceState(s);
    const topic = npcCasualTopics(gameState, 'npc_fan_kejie').find(t => t.id.includes('zhao_staff'))!;
    uiState.npcTalk = { npcId: 'npc_fan_kejie', entry: 'chat', topicId: topic.id }; render(); readLines();
    const before = npcTaskNow(gameState), money = gameState.player.money;
    for (let step = 0; step < 3; step++) {
      target.querySelector<HTMLButtonElement>('.choice-btn')!.click(); flushSync(); readLines();
      expect(getNpcTaskQuest(gameState, 'zhao_staff')!.npcTask!.data.staff!.kejieAgreed).toBeUndefined();
      expect(npcTaskNow(gameState)).toBe(before); expect(gameState.player.money).toBe(money);
      if (step === 1) expect(target.textContent).toContain('小姑娘');
    }
    expect(target.querySelector<HTMLButtonElement>('.choice-btn')!.textContent).toContain('20元车费');
    target.querySelector<HTMLButtonElement>('.choice-btn')!.click(); flushSync();
    const staff = getNpcTaskQuest(gameState, 'zhao_staff')!.npcTask!.data.staff!;
    expect(staff.kejieAgreed).toBe(true); expect(staff.kejieDailyWage).toBe(150); expect(staff.kejieTravelCost).toBe(20);
    expect(gameState.player.money).toBe(money); expect(npcTaskNow(gameState)).toBe(before + 30);
  });
  it('点击女性NPC的询问只显示心想，仍留在菜单，游戏状态完全不变', () => {
    const s = accepted(); Object.assign(s.time, { day: 4, hour: 8, minute: 0 }); s.locationId = 'cafe'; s.region = 'downtown_residential';
    ensureRelationship(s, 'npc_lin_xiaoyu').affinity = 20; replaceState(s);
    uiState.npcTalk = { npcId: 'npc_lin_xiaoyu', entry: 'chat-menu' }; render();
    const before = JSON.stringify(gameState);
    target.querySelector<HTMLButtonElement>('button[data-casual-topic*="zhao_staff"]')!.click(); flushSync();
    expect(uiState.toast).toContain('你心想：找个女生过来太不像话了。');
    expect(uiState.npcTalk?.entry).toBe('chat-menu'); expect(JSON.stringify(gameState)).toBe(before);
    expect(target.querySelector('.result-panel')).toBeNull();
  });
  it('先介绍自己的两位朋友，当天只报人；次日再谈才发120元和三人结局好感', () => {
    openReady(); const before = npcTaskNow(gameState), money = gameState.player.money;
    expect(target.querySelectorAll('.choice-btn')).toHaveLength(3);
    target.querySelectorAll<HTMLButtonElement>('.choice-btn')[0].click(); flushSync(); readLines();
    expect(target.querySelectorAll('.choice-btn')).toHaveLength(2);
    expect(target.querySelector<HTMLButtonElement>('.choice-btn')!.textContent).toContain('我认识的两个朋友，都已经准备好了');
    expect(gameState.player.money).toBe(money); expect(npcTaskNow(gameState)).toBe(before);
    const confirm = target.querySelector<HTMLButtonElement>('.choice-btn')!; confirm.click(); flushSync();
    expect(getNpcTaskQuest(gameState, 'zhao_staff')!.status).toBe('active');
    expect(getNpcTaskQuest(gameState, 'zhao_staff')!.npcTask!.stage).toBe('await_staff_result');
    expect(gameState.player.money).toBe(money); expect(npcTaskNow(gameState)).toBe(before + 5);
    expect(target.querySelector('.result-panel')!.textContent).toContain('一会儿联系他们');
    expect(target.querySelector('.result-panel')!.textContent).not.toContain('零食');
    expect(target.querySelector('.result-deltas')?.textContent ?? '').not.toContain('范柯杰好感');
    openNextDayOwner();
    expect(target.querySelectorAll('.choice-btn')).toHaveLength(1);
    expect(gameState.player.money).toBe(money);
    const collect = target.querySelector<HTMLButtonElement>('.choice-btn')!; collect.click(); flushSync();
    expect(getNpcTaskQuest(gameState, 'zhao_staff')!.status).toBe('done');
    expect(gameState.player.money).toBe(money + 120);
    expect(target.querySelector('.result-deltas')!.textContent).toContain('范柯杰好感');
    expect(target.querySelector('.result-deltas')!.textContent).toContain('杰克·范马好感');
    collect.click(); flushSync(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); flushSync();
    expect(gameState.player.money).toBe(money + 120);
  });
  it('从人员名单返回三选项，再退出，不提交人手、不花时间、不发钱', () => {
    openReady(); const before = JSON.stringify(gameState);
    target.querySelectorAll<HTMLButtonElement>('.choice-btn')[0].click(); flushSync(); readLines();
    target.querySelectorAll<HTMLButtonElement>('.choice-btn')[1].click(); flushSync(); readLines();
    expect(target.querySelectorAll('.choice-btn')).toHaveLength(3);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); flushSync();
    expect(JSON.stringify(gameState)).toBe(before);
  });
});
