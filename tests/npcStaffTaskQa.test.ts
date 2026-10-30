// @vitest-environment jsdom
import './helpers/instantDialogue';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import StaffTaskQa from '../docs/npc-tasks-1.492-zhao2-user-copy-20261017/qa/StaffTaskQa.svelte';
import { createStaffQaFixture, QA_SCENARIOS, staffQaTalkTarget } from '../docs/npc-tasks-1.492-zhao2-user-copy-20261017/qa/fixtures';
import { beginNpcConversation, beginNpcFormalConversation } from '../src/game/core/npcTalk';
import { getNpcTaskQuest } from '../src/game/core/npcTasks';
import { gameState } from '../src/stores/gameStore.svelte';
import { closeNpcTalk, closeNpcTaskPanel, dismissToast } from '../src/stores/uiStore.svelte';

let component: ReturnType<typeof mount> | undefined, target: HTMLDivElement;
beforeAll(() => { if (!Element.prototype.animate) Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any; });
afterEach(async () => { if (component) await unmount(component); component = undefined; target?.remove(); closeNpcTalk(); closeNpcTaskPanel(); dismissToast(); });
async function settle(): Promise<void> { for (let i = 0; i < 5; i++) { await tick(); flushSync(); } }
async function render(): Promise<void> { target = document.createElement('div'); document.body.append(target); component = mount(StaffTaskQa, { target }); flushSync(); await settle(); }
function read(): void { for (let i = 0; i < 90; i++) { const next = target.querySelector<HTMLButtonElement>('button[aria-label="点击任意处继续播放台词"]'); if (!next) break; next.click(); flushSync(); } }
function click(selector: string): void { const button = target.querySelector<HTMLButtonElement>(selector); expect(button, selector).not.toBeNull(); button!.click(); flushSync(); }

describe('赵刚任务2独立检测页', () => {
  it('所有检测入口均落在真实在场人物与合法任务话题，不预结算终局奖励', () => {
    for (const scenario of QA_SCENARIOS) {
      const { state, npcId } = createStaffQaFixture(scenario.id);
      const target = staffQaTalkTarget(state, npcId);
      if (target.entry !== 'chat-menu') {
        const opened = target.entry === 'formal' ? beginNpcFormalConversation(state, npcId, target.topicId!) : beginNpcConversation(state, npcId, 'chat', target.topicId);
        expect(opened.ok, `${scenario.id}: ${opened.reason}`).toBe(true);
      }
      expect(state.player.money, scenario.id).toBe(1000);
      expect(getNpcTaskQuest(state, 'zhao_staff')?.status, scenario.id).toBe(scenario.id === 'offer' ? undefined : scenario.id === 'expired' ? 'failed' : 'active');
    }
  });
  it('不读写正式存档；确认报人当天不发钱，到次日找赵刚明确收款后才有165元收入', async () => {
    const marker = JSON.stringify({ doNotChange: true });
    localStorage.setItem('urban_life_save_auto', marker); localStorage.setItem('urban_life_save_slot_1', marker);
    const profile = localStorage.getItem('urban_life_profile');
    await render();
    expect(target.querySelector('.speaker-name')?.textContent).toBe('旁白');
    expect(getNpcTaskQuest(gameState, 'zhao_staff')).toBeUndefined();
    click('[data-qa-scenario="single150"]'); await settle(); read();
    expect(gameState.player.money).toBe(1000); expect(target.querySelectorAll('.choice-btn')).toHaveLength(3);
    click('.choice-btn'); read(); click('.choice-btn');
    expect(gameState.player.money).toBe(1000); expect(getNpcTaskQuest(gameState, 'zhao_staff')!.npcTask!.stage).toBe('await_staff_result');
    click('[data-qa-next-day]'); await settle(); read();
    expect(gameState.player.money).toBe(1000); click('.choice-btn');
    expect(gameState.player.money).toBe(1165); expect(getNpcTaskQuest(gameState, 'zhao_staff')!.status).toBe('done');
    expect(target.querySelector('.qa-status')?.textContent).toContain('+165');
    expect(localStorage.getItem('urban_life_save_auto')).toBe(marker);
    expect(localStorage.getItem('urban_life_save_slot_1')).toBe(marker);
    expect(localStorage.getItem('urban_life_profile')).toBe(profile);
    localStorage.removeItem('urban_life_save_auto'); localStorage.removeItem('urban_life_save_slot_1');
  });
  it('0现金也能谈人手，回赵刚处介绍朋友；次日才结算120元', async () => {
    await render();
    const cash = target.querySelector<HTMLSelectElement>('[data-qa-money]')!;
    cash.value = '0'; cash.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
    click('[data-qa-scenario="kejie"]'); await settle(); read();
    expect(gameState.player.money).toBe(0);
    target.querySelectorAll<HTMLButtonElement>('.choice-btn')[3].click(); flushSync();
    expect(getNpcTaskQuest(gameState, 'zhao_staff')!.npcTask!.data.staff!.jackAgreed).toBe(true);
    click('[data-qa-visit="npc_zhao_gang"]'); await settle(); read();
    click('.choice-btn'); read(); click('.choice-btn');
    expect(gameState.player.money).toBe(0); expect(getNpcTaskQuest(gameState, 'zhao_staff')!.status).toBe('active');
    click('[data-qa-next-day]'); await settle(); read(); click('.choice-btn');
    expect(gameState.player.money).toBe(120); expect(target.querySelector('.qa-status')?.textContent).toContain('+120');
  });
  it('全文核对直接读取最新台词，切换和搜索不重置已经载入的检测进度', async () => {
    await render(); click('[data-qa-scenario="wang"]'); await settle();
    const before = JSON.stringify(gameState);
    expect(target.querySelector('.dialogue-box p')?.textContent).toContain('王磊');
    click('[data-qa-copy]');
    const search = target.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = '公假'; search.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    expect(target.querySelectorAll('.qa-copy-grid article')).toHaveLength(1);
    expect(target.querySelector('.qa-copy-grid')?.textContent).toContain('这个月多放两天假');
    expect(JSON.stringify(gameState)).toBe(before);
  });
});
