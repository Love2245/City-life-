// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CompanyServices from '../src/components/layout/CompanyServices.svelte';
import { createInitialState } from '../src/game/core/state';
import { gameDay } from '../src/game/core/calendar';
import { advanceHours } from '../src/game/core/time';
import { companyStage } from '../src/game/core/companyConfig';
import { companyOverview } from '../src/game/core/companyOverview';
import { buyCompanyComputers, companyExpansionQuote, expandCompany, hireCompanyEmployee, interviewCompany, registerCompany, startCompanyProject } from '../src/game/core/company';
import { gameState, replaceState } from '../src/stores/gameStore.svelte';
import { primeHiringGate } from './helpers/companyGate';

function applicant(money = 100000) {
  const state = createInitialState(1497);
  state.mode = 'eternal'; state.locationId = 'municipal_hall'; state.time.hour = 10;
  state.player.money = money; state.developmentHistory!.total = 25; Object.assign(state.developmentHistory!.byType, { indie_game: 5 });
  return state;
}

describe('公司初始场地选择', () => {
  it('旧调用默认孵化室并沿用1600元费用、3人工位和校园通行', () => {
    const state = applicant(2100);
    expect(registerCompany(state, '默认场地').ok).toBe(true);
    expect(state.company!.stage).toBe(1);
    expect(state.player.money).toBe(500);
    expect(state.company!.depositCents).toBe(80000);
    expect(companyStage(state.company!.stage).capacity).toBe(3);
    expect(state.flags.item_student_pass).toBe(true);
    expect(state.locationId).toBe('municipal_hall');
  });

  it('一人即可直接以4500元入驻单间，保留日期与位置并开放中型项目', () => {
    const state = applicant(4500), day = gameDay(state.time), time = { ...state.time }, campusPass = state.flags.item_student_pass;
    state.developmentHistory!.total = 1; Object.assign(state.developmentHistory!.byType, { indie_game: 5 });
    expect(registerCompany(state, '独立办公室', 2).ok).toBe(true);
    expect(state.company!.stage).toBe(2);
    expect(state.company!.employees).toHaveLength(0);
    expect(state.player.money).toBe(500);
    expect(state.company!.depositCents).toBe(200000);
    expect(state.company!.nextRentDay).toBe(day + 30);
    expect(state.company!.nextPayDay).toBe(day + 30);
    expect(state.time).toEqual(time);
    expect(state.locationId).toBe('municipal_hall');
    expect(state.flags.item_student_pass).toBe(campusPass);
    expect(companyStage(2)).toMatchObject({ capacity: 6, rent: 2000, cap: 1000, location: 'company_office_single' });
    state.locationId = companyStage(2).location;
    expect(companyOverview(state)!.stage.capacity).toBe(6);
    expect(startCompanyProject(state, 'programming', '工具软件', 'medium').ok).toBe(true);
    expect(startCompanyProject(state, 'design', '平面设计', 'large').ok).toBe(false);
  });

  it.each([0, 3, 4, NaN, Infinity, '2', null])('核心拒绝初始场地 %s，状态完全不变', startingStage => {
    const state = applicant(), before = JSON.stringify(state);
    expect(registerCompany(state, '非法场地', startingStage as any)).toMatchObject({ ok: false });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('不足4500元不能注册单间，作品、权益、随机数和现金均不变', () => {
    const state = applicant(4499.99);
    state.career.passiveIncome = 1200;
    state.career.projects = { mobile_app: 70, indie_game: 30, home_design: 40 };
    const before = JSON.stringify(state);
    expect(registerCompany(state, '资金不足', 2).reason).toContain('4500');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('选择单间仍需先交付 5 件设计或编程项目，不能用资金绕过作品资格', () => {
    const state = applicant(); state.developmentHistory!.total = 0; state.developmentHistory!.byType = {};
    const before = JSON.stringify(state);
    expect(registerCompany(state, '没有作品', 2).reason).toContain('设计或编程项目');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('注册单间只合并一次权益，不可再次注册改变场地或重复付款', () => {
    const state = applicant(); state.career.passiveIncome = 1250;
    delete state.flags.development_economy_v2; // 旧个人在途报价不受新公司默认值覆盖。
    state.career.projects = { mobile_app: 70, indie_game: 30, home_design: 40 };
    expect(registerCompany(state, '承接作品', 2).ok).toBe(true);
    expect(state.company!.royaltyCents).toBe(125000);
    expect(state.company!.programming!.sourceId).toBe('mobile_app');
    expect(state.company!.programming!.progress).toBe(70);
    expect(state.company!.design!.progress).toBe(40);
    expect(state.company!.pending[0]!.sourceId).toBe('indie_game');
    expect(state.career.passiveIncome).toBe(0);
    const before = JSON.stringify(state);
    expect(registerCompany(state, '重复注册', 1).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('直接单间后仍需6人才能扩张大办公室，保留员工、电脑和发薪日', () => {
    const state = applicant(); registerCompany(state, '从单间起步', 2); state.company!.growthPoints=2000;
    expect(companyExpansionQuote(state)!.next).toMatchObject({ stage: 3, requiredPeople: 6 });
    expect(expandCompany(state).reason).toContain('6 人');
    state.locationId = 'electronics_store'; expect(buyCompanyComputers(state, 'mid', 5).ok).toBe(true);
    state.locationId = companyStage(2).location;
    primeHiringGate(state);
    for (let batch = 0; batch < 2; batch++) {
      expect(interviewCompany(state).ok).toBe(true);
      for (const candidate of state.company!.candidates) {
        if (state.company!.employees.length >= 5) break;
        expect(hireCompanyEmployee(state, candidate.id).ok).toBe(true);
      }
      if (!batch) advanceHours(state, 24, false, true);
    }
    const staff = state.company!.employees.map(employee => employee.id), computers = state.company!.computers.map(computer => computer.id), payDay = state.company!.nextPayDay;
    state.locationId = 'municipal_hall'; expect(expandCompany(state).ok).toBe(true);
    expect(state.company!.stage).toBe(3);
    expect(state.company!.employees.map(employee => employee.id)).toEqual(staff);
    expect(state.company!.computers.map(computer => computer.id)).toEqual(computers);
    expect(state.company!.nextPayDay).toBe(payDay);
    const incubator = applicant(); registerCompany(incubator, '从孵化室起步');
    expect(companyExpansionQuote(incubator)!.next).toMatchObject({ stage: 2, requiredPeople: 3 });
    expect(expandCompany(incubator).reason).toContain('3 人');
  });
});

const apps: ReturnType<typeof mount>[] = [];
beforeAll(() => { if (!Element.prototype.animate) Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any; });
afterEach(async () => { for (const app of apps.splice(0)) await unmount(app); document.body.replaceChildren(); });
function showWindow() {
  replaceState(applicant());
  const target = document.createElement('div'); document.body.append(target);
  apps.push(mount(CompanyServices, { target, props: { municipal: true } })); flushSync();
  const name = target.querySelector<HTMLInputElement>('input[placeholder="填写公司名称"]')!;
  flushSync(() => { name.value = '选址测试公司'; name.dispatchEvent(new Event('input', { bubbles: true })); });
  return target;
}
function clickButton(target: ParentNode, text: string) {
  const button = [...target.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === text);
  expect(button).toBeDefined(); flushSync(() => button!.click());
}

describe('市政注册场地实际操作', () => {
  it('展示两种场地差异，选择单间后按4000元登记并显示大办公室扩张条件', () => {
    const target = showWindow();
    expect(target.textContent).toContain('含主角共 3 人');
    expect(target.textContent).toContain('含主角共 6 人');
    expect(target.textContent).toContain('小型与中型项目');
    const single = target.querySelector<HTMLInputElement>('input[type="radio"][value="2"]')!;
    flushSync(() => single.click()); clickButton(target, '准备注册公司');
    expect(target.querySelector('.confirm')!.textContent).toContain('入驻写字楼单间，支付 4000 元');
    clickButton(target, '确认登记并付款');
    expect(gameState.company!.stage).toBe(2);
    expect(gameState.player.money).toBe(96000);
    expect(gameState.locationId).toBe('municipal_hall');
    expect(target.textContent).toContain('需要总人数达到 6 人');
  });

  it('打开确认后更换场地会取消旧报价，再次确认使用当前场地和金额', () => {
    const target = showWindow(); clickButton(target, '准备注册公司');
    expect(target.querySelector('.confirm')!.textContent).toContain('支付 1600 元');
    flushSync(() => target.querySelector<HTMLInputElement>('input[type="radio"][value="2"]')!.click());
    expect(target.querySelector('.confirm')).toBeNull();
    clickButton(target, '准备注册公司');
    expect(target.querySelector('.confirm')!.textContent).toContain('支付 4000 元');
    flushSync(() => target.querySelector<HTMLInputElement>('input[type="radio"][value="1"]')!.click());
    expect(target.querySelector('.confirm')).toBeNull();
    clickButton(target, '准备注册公司'); clickButton(target, '确认登记并付款');
    expect(gameState.company!.stage).toBe(1);
    expect(gameState.player.money).toBe(98400);
  });
});
