// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import DeviceSetupModal from '../src/components/DeviceSetupModal.svelte';
import PhoneScreenWorkspace from '../src/components/PhoneScreenWorkspace.svelte';
import ConfirmDialog from '../src/components/layout/ConfirmDialog.svelte';
import LaptopDesktopView from '../src/components/layout/LaptopDesktopView.svelte';
import { createInitialState } from '../src/game/core/state';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { uiState, setSceneMode, resolveConfirm } from '../src/stores/uiStore.svelte';
import { applyForJob, getJobDef } from '../src/game/core/jobs';
import { developmentWorkBudget } from '../src/game/core/developmentWork';
import { checkJobRequirements } from '../src/game/core/jobRequirements';

const mounted: { target: HTMLDivElement; component: ReturnType<typeof mount> }[] = [];
function render(component: any, props: any = {}) {
  const target = document.createElement('div'); document.body.append(target);
  mounted.push({ target, component: mount(component, { target, props }) }); flushSync(); return target;
}
function clickText(target: HTMLElement, text: string) {
  const button = [...target.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes(text));
  expect(button, text).toBeDefined(); expect(button!.disabled, text).toBe(false); button!.click(); flushSync();
}
beforeAll(() => {
  Element.prototype.animate ??= (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  globalThis.ResizeObserver ??= class { observe() {} disconnect() {} } as any;
});
beforeEach(() => {
  localStorage.clear(); replaceState(createInitialState(791)); uiState.modal = null; uiState.gameMode = 'pc'; setSceneMode('3d');
});
afterEach(async () => {
  for (const item of mounted.splice(0)) { await unmount(item.component); item.target.remove(); }
  if (uiState.confirmRequest) resolveConfirm(false);
  uiState.deviceSetupOpen = false; uiState.modal = null; uiState.toast = null;
});

describe('首次布局与设备对应默认场景',()=>{
 it('选择手机布局直接进入默认2D截图，不强制再选一次场景且不修改存档',async()=>{uiState.deviceSetupOpen=true;localStorage.removeItem('urban-life-scene-mode');const before=JSON.stringify(gameState),target=render(DeviceSetupModal);expect(target.textContent).toContain('2D');clickText(target,'手机');await tick();expect(uiState.gameMode).toBe('pe');expect(uiState.sceneMode).toBe('2d');expect(uiState.deviceSetupOpen).toBe(false);expect(JSON.stringify(gameState)).toBe(before);});
 it('推荐布局保留玩家之前主动保存的2D设置',async()=>{setSceneMode('2d');uiState.deviceSetupOpen=true;const target=render(DeviceSetupModal);clickText(target,'使用推荐布局');await tick();expect(uiState.deviceSetupOpen).toBe(false);expect(uiState.sceneMode).toBe('2d');expect(localStorage.getItem('urban-life-scene-mode')).toBe('2d');});
});

describe('办公室换岗与编程续作', () => {
  for (const computer of ['item_laptop', 'item_laptop_mid', 'item_laptop_pro']) it(`${computer}满足办公室电脑要求，换入与换出均结清一次`, async () => {
    const state = createInitialState(800); state.time.day = 3; state.time.hour = 7;
    state.player.stats.intelligence = 100; state.flags[computer] = true;
    const office = getJobDef('job_office_assistant')!; expect(checkJobRequirements(state, office).ok).toBe(true);
    expect(applyForJob(state, getJobDef('job_factory_qc')!).ok).toBe(true);
    state.career.periodBaseWages = 95; state.career.accruedWages = 95; replaceState(state);
    const cash = gameState.player.money;
    const target = render(PhoneScreenWorkspace, { initialApp: 'jobs' }), confirmation = render(ConfirmDialog);
    clickText(target, '办公室文员'); expect(confirmation.textContent).toContain('结清并换岗');
    clickText(confirmation, '结清并换岗'); await tick(); flushSync();
    expect(gameState.career.jobId).toBe(office.id); expect(gameState.player.money).toBe(cash + 95);
    gameState.career.periodBaseWages = 130; gameState.career.accruedWages = 130;
    clickText(target, getJobDef('job_factory_qc')!.name); clickText(confirmation, '结清并换岗'); await tick(); flushSync();
    expect(gameState.career.jobId).toBe('job_factory_qc'); expect(gameState.player.money).toBe(cash + 225);
    expect(gameState.work!.wageRecords.filter(record => record.kind === 'resign')).toHaveLength(2);
  });
  it('旧档100%作品可在工作台开始下一部，保留原版税；8小时后可再工作4小时至当日上限', async () => {
    gameState.flags.item_laptop = true; gameState.flags.laptop_app_dev = true;
    gameState.player.skills.programming = 5; gameState.career.projects.indie_game = 100; gameState.career.passiveIncome = 180;
    Object.assign(gameState.player.attrs,{stamina:100,health:100,mood:100,satiety:100});
    uiState.modal = 'laptop'; const target = render(LaptopDesktopView);
    target.querySelector<HTMLButtonElement>('.desk-icon[data-app-id="dev"]')!.click(); flushSync();
    const card = [...target.querySelectorAll<HTMLElement>('.dev-card')].find(card => card.textContent?.includes('独立游戏'))!;
    expect(card).toBeDefined(); clickText(card, '开始下一部');
    expect(gameState.career.projects.indie_game).toBe(0); expect(gameState.career.passiveIncome).toBe(180);
    clickText(card, '开始开发 · 最多8小时');
    expect(gameState.career.projects.indie_game).toBeGreaterThan(0); expect(gameState.career.passiveIncome).toBe(180);
    expect(developmentWorkBudget(gameState)).toMatchObject({usedMinutes:480,remainingMinutes:240});
    expect(target.textContent).toContain('今日已工作 8.0 / 12小时');
    target.querySelector<HTMLButtonElement>('[aria-label="个人最多工作4小时"]')!.click();flushSync();
    const previous=gameState.career.projects.indie_game;
    clickText(card,'开始开发 · 最多4小时');
    expect(gameState.career.projects.indie_game).toBeGreaterThan(previous);
    expect(gameState.career.passiveIncome).toBe(180);
    expect(developmentWorkBudget(gameState)).toMatchObject({usedMinutes:720,remainingMinutes:0});
    expect(card.querySelector<HTMLButtonElement>('.dev-btn')!.disabled).toBe(true);
    expect(card.textContent).toContain('今天已累计工作12小时');
  });
});

it('手机桌面默认打开当前月历，跨月和今天操作只改变查看日期', () => {
  const state = createInitialState(803); state.time.day = 6;
  state.quests.push({ id: 'calendar-task', type: 'story', title: '小熊委托', icon: '📦', desc: '', day: 0, status: 'active', npcTask: { taskId: 'zhao_toy', stage: 'seeking', acceptedAt: 0, deadlineAt: 7 * 1440 + 16 * 60, revision: 1, data: {} } });
  replaceState(state); const target = render(PhoneScreenWorkspace), before = JSON.stringify(gameState);
  const app = target.querySelector<HTMLButtonElement>('button[aria-label="日历"]'); expect(app).not.toBeNull(); app!.click(); flushSync();
  expect(target.querySelector('[aria-label="2026年8月月历"]')).not.toBeNull(); expect(target.textContent).toContain('小熊委托');
  target.querySelector<HTMLButtonElement>('button[aria-label="下个月"]')!.click(); flushSync();
  expect(target.querySelector('[aria-label="2026年9月月历"]')).not.toBeNull();
  clickText(target, '今天'); expect(target.querySelector('[aria-label="2026年8月月历"]')).not.toBeNull();
  expect(JSON.stringify(gameState)).toBe(before);
});
