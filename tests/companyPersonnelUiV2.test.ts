// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CompanyWorkstation from '../src/components/layout/CompanyWorkstation.svelte';
import CompanyPanel from '../src/components/layout/CompanyPanel.svelte';
import { createInitialState } from '../src/game/core/state';
import { registerCompany, startCompanyProject } from '../src/game/core/company';
import { gameDay } from '../src/game/core/calendar';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import type { CompanyEmployee } from '../src/game/companyTypes';
import { primeHiringGate } from './helpers/companyGate';

const apps: ReturnType<typeof mount>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await unmount(app); document.body.replaceChildren(); });
function prepared() {
  const s = createInitialState(1497); s.mode = 'eternal'; s.player.money = 100000;
  s.developmentHistory!.total = 5; Object.assign(s.developmentHistory!.byType, { indie_game: 5 }); s.time.hour = 10; s.locationId = 'municipal_hall';
  expect(registerCompany(s, '工位交互').ok).toBe(true); s.locationId = 'dev_incubator';
  s.company!.computers.push({ id: 'pc:1', tier: 'mid', costCents: 150000, assignee: null, seatIndex: 1 });
  primeHiringGate(s);
  replaceState(s); return gameDay(s.time);
}
function show() {
  const target = document.createElement('div'); document.body.append(target);
  apps.push(mount(CompanyWorkstation, { target, props: { index: 1 } })); flushSync(); return target;
}
function click(target: HTMLElement, text: string) {
  const button = [...target.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === text);
  expect(button, text).toBeDefined(); flushSync(() => button!.click());
}

describe('员工工位简化操作', () => {
  it('双申请展示各自期限，批准涨薪保留休假，主次任务用实际控件提交', () => {
    const day = prepared();
    const staff: CompanyEmployee = { id: 'employee:1', name: '员工A', programming: 3, design: 2, stars: 2, quoteFactor: 1,
      salaryCents: 274000, hired: true, role: 'programming', secondaryRole: 'idle', joinedMinute: gameState.company!.cursor, // 旧已签工资保留。
      accruedUnits: 0, programmingXp: 0, designXp: 0, satisfaction: 25, underpaidDays: 0, lastRaiseDay: day,
      nextLeaveDay: day + 30, leaveDays: [], resignationDay: day + 3, seatIndex: 1,
      requests: { raise: { kind: 'raise', day, deadlineDay: day + 3, salaryCents: 300000 }, leave: { kind: 'leave', day, deadlineDay: day + 4, leaveDays: [day + 5] } } };
    gameState.company!.employees.push(staff); gameState.company!.computers[0]!.assignee = staff.id;
    const root = show();
    expect(root.querySelectorAll('[data-request-kind]')).toHaveLength(2);
    expect(root.textContent).toContain('剩余3天'); expect(root.textContent).toContain('剩余4天');
    expect(root.textContent).toContain('有离职意向');
    click(root, '批准涨薪');
    expect(gameState.company!.employees[0]!.salaryCents).toBe(300000);
    expect(root.querySelector('[data-request-kind="raise"]')).toBeNull();
    expect(root.querySelector('[data-request-kind="leave"]')).not.toBeNull();
    expect(root.textContent).not.toContain('有离职意向');
    click(root, '作品维护');
    const select = root.querySelector<HTMLSelectElement>('[aria-label="员工次要任务"]')!;
    flushSync(() => { select.value = 'design'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(gameState.company!.employees[0]).toMatchObject({ role: 'maintenance', secondaryRole: 'design' });
    click(root, '批准休假');
    expect(gameState.company!.employees[0]!.leaveDays).toEqual([day + 5]);
  });

  it('每五件解锁岗位，面试卡显示工资且可直接录用', () => {
    const day = prepared(); gameState.company!.interviewDay = day;
    gameState.company!.candidates = [{ id: 'candidate:A', name: '员工A', programming: 3, design: 2, stars: 2, quoteFactor: 1, salaryCents: 275000, hired: false }];
    const root = show();
    expect(root.textContent).toContain('每完成5个项目解锁1个岗位');
    expect(root.textContent).toContain('预期月薪');expect(root.textContent).toContain('2,750');
    click(root, '录用到此工位');
    expect(gameState.company!.employees).toHaveLength(1);
    expect(gameState.company!.employees[0]!.seatIndex).toBe(1);
    expect(root.textContent).toContain('安排员工A的工作');
  });

  it('面试卡只保留等级星级和预期月薪，不显示收益或现金预测',()=>{
    const day=prepared();gameState.company!.interviewDay=day;
    gameState.company!.candidates=[{id:'candidate:simple',name:'员工A',programming:9,design:6,stars:5,quoteFactor:1.2,salaryCents:395500,hired:false}];
    const before=JSON.stringify(gameState.company),root=show(),card=root.querySelector('[data-company-candidate]')!;
    expect(card.textContent).toContain('编程 9级 · 设计 6级');expect(card.textContent).toContain('★★★★★');expect(card.textContent).toContain('预期月薪');expect(card.textContent).toContain('3,955');
    expect(card.querySelector('[data-candidate-return]')).toBeNull();expect(card.textContent).not.toMatch(/标准日|预计|毛产出|缺口|边际/);
    expect(JSON.stringify(gameState.company)).toBe(before);click(root,'录用到此工位');expect(gameState.company!.employees).toHaveLength(1);
  });
  it('团队只用交付件数说明岗位，不展示盈利或经验门槛',()=>{
    prepared();const target=document.createElement('div');document.body.append(target);apps.push(mount(CompanyPanel,{target}));flushSync();click(target,'团队');
    expect(target.textContent).toContain('每完成5个项目解锁1个岗位');expect(target.textContent).not.toMatch(/经营经验|1.2|上一结账周期|毛产出/);
  });

});
