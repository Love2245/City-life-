// @vitest-environment jsdom
import './helpers/instantDialogue';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import NpcTalkModal from '../src/components/layout/NpcTalkModal.svelte';
import { createInitialState } from '../src/game/core/state';
import { ensureRelationship } from '../src/game/core/relationships';
import { npcFormalTopics } from '../src/game/core/npcTalk';
import { getNpcTaskQuest, npcTaskNow } from '../src/game/core/npcTasks';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { closeNpcTalk, uiState } from '../src/stores/uiStore.svelte';

let component: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement;
beforeAll(() => {
  if (!Element.prototype.animate) Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
});
afterEach(() => { if(component) unmount(component); component = undefined; target?.remove(); closeNpcTalk(); uiState.npcTaskPanel = null; });
function openOffer(): void {
  const state = createInitialState(1492);
  Object.assign(state.time, { day: 3, hour: 9, minute: 0 });
  state.locationId = 'labor_market'; state.region = 'downtown_industrial';
  ensureRelationship(state, 'npc_zhao_gang').affinity = 20;
  replaceState(state);
  const topic = npcFormalTopics(gameState, 'npc_zhao_gang').find(topic => topic.npcTaskTopicId)!;
  uiState.npcTalk = { npcId: 'npc_zhao_gang', entry: 'formal', topicId: topic.id };
  target = document.createElement('div'); document.body.append(target);
  component = mount(NpcTalkModal, { target }); flushSync();
  for(let step=0;step<40;step++) {
    const next = target.querySelector<HTMLButtonElement>('button[aria-label="点击任意处继续播放台词"]');
    if (!next) break;
    next.click(); flushSync();
  }
  expect(target.querySelectorAll('.choice-btn')).toHaveLength(2);
}

describe('实体委托的真实会话按钮', () => {
  it('第二个拒绝按钮只拒绝，不会误接第一个接受动作', () => {
    openOffer(); const now = npcTaskNow(gameState), money = gameState.player.money;
    target.querySelectorAll<HTMLButtonElement>('.choice-btn')[1].click(); flushSync();
    expect(getNpcTaskQuest(gameState, 'zhao_toy')).toBeUndefined();
    expect(npcTaskNow(gameState)).toBe(now); expect(gameState.player.money).toBe(money);
    expect(target.textContent).toContain('没空就不勉强');
    expect(target.textContent).not.toContain('委托已加入待办');
  });
  it('点击接受立即提交，Escape和重复点击不能撤销或重发', () => {
    openOffer(); const now = npcTaskNow(gameState);
    const accept = target.querySelector<HTMLButtonElement>('.choice-btn')!;
    accept.click(); flushSync();
    expect(getNpcTaskQuest(gameState, 'zhao_toy')?.status).toBe('active');
    expect(npcTaskNow(gameState)).toBe(now+30);
    accept.click(); flushSync();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); flushSync();
    expect(gameState.quests.filter(q => q.npcTask?.taskId === 'zhao_toy')).toHaveLength(1);
    expect(npcTaskNow(gameState)).toBe(now+30);
    expect(gameState.relationships.find(r => r.npcId === 'npc_zhao_gang')?.affinity).toBe(20);
  });
});
