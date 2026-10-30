import { describe, expect, it } from 'vitest';
import type { CompanyEmployee, CompanyState } from '../src/game/companyTypes';
import { companyDailyWork, employeeStars } from '../src/game/core/companyConfig';
import { clearSatisfiedRaise, companyEmployeeRequests, companyFairSalary, normalizeEmployeeRequests, processEmployeeRequests, requestCompanyLeave, requestCompanyRaise, respondToEmployeeRequest } from '../src/game/core/companyPersonnel';
import { calendarEventsOf } from '../src/game/core/phoneCalendar';
import { createInitialState } from '../src/game/core/state';
import { gameDay } from '../src/game/core/calendar';
import { migrateSave } from '../src/game/core/migrate';

function employee(overrides: Partial<CompanyEmployee> = {}): CompanyEmployee {
  return { id: 'employee:1', name: '员工A', programming: 10, design: 2, stars: 5, quoteFactor: 1,
    salaryCents: 200000, hired: true, role: 'programming', secondaryRole: 'design', joinedMinute: 0, accruedUnits: 0,
    programmingXp: 0, designXp: 0, satisfaction: 80, underpaidDays: 0, lastRaiseDay: -14, nextLeaveDay: 30, leaveDays: [], ...overrides };
}
function company(employees: CompanyEmployee[] = []): CompanyState {
  return { name: '人员测试', stage: 1, rng: { seed: 1497, calls: 0, state: 1497 }, foundedMinute: 0, cursor: 0, sequence: 1,
    balanceCents: 100000, depositCents: 80000, nextRentDay: 30, nextPayDay: 30, royaltyCents: 0,
    lastRoyaltyWeek: 0, maintenance: 0, programming: null, design: null, pending: [], employees, computers: [],
    interviewDay: -1, candidates: [], liabilities: [], ledger: [], earnedCents: 0, spentCents: 0 };
}

describe('员工独立申请与响应期限', () => {
  it('涨薪和休假互不阻塞，处理一个申请保留另一个，合理调薪清掉离职意向', () => {
    const e = employee({ resignationDay: 3, satisfaction: 25 });
    expect(requestCompanyRaise(e, 0)).toBe(true);
    expect(requestCompanyLeave(e, 0, [5, 6])).toBe(true);
    expect(companyEmployeeRequests(e).map(r => r.kind)).toEqual(['raise', 'leave']);
    expect(respondToEmployeeRequest(e, true, 1, 'raise').ok).toBe(true);
    expect(e.salaryCents).toBe(362500);
    expect(e.satisfaction).toBe(40);
    expect(e.resignationDay).toBeUndefined();
    expect(companyEmployeeRequests(e).map(r => r.kind)).toEqual(['leave']);
    expect(respondToEmployeeRequest(e, false, 1, 'leave').ok).toBe(true);
    expect(e.satisfaction).toBe(20);
    expect(e.requests).toEqual({}); expect(e.request).toBeUndefined();
  });

  it('提前一天各提醒一次，到期按拒绝扣分，重复日结和重读镜像不重复扣分', () => {
    const e = employee(), notices: string[] = [];
    requestCompanyRaise(e, 0); requestCompanyLeave(e, 0, [4]); // 两者都在第3日00:00到期。
    processEmployeeRequests(e, 2, text => notices.push(text));
    processEmployeeRequests(e, 2, text => notices.push(text));
    expect(notices).toHaveLength(2); expect(e.satisfaction).toBe(80);
    const stale = structuredClone(e.request);
    processEmployeeRequests(e, 3, text => notices.push(text));
    expect(notices).toHaveLength(4); expect(e.satisfaction).toBe(45);
    e.request = stale;
    normalizeEmployeeRequests(e, 3); processEmployeeRequests(e, 3, text => notices.push(text));
    processEmployeeRequests(e, 90, text => notices.push(text));
    expect(notices).toHaveLength(4); expect(e.satisfaction).toBe(45);
    expect(e.request).toBeUndefined(); expect(companyEmployeeRequests(e)).toEqual([]);
  });

  it('长期不处理涨薪无法逃过扣分，明确拒绝与逾期拒绝结果相同', () => {
    const ignored = employee(), rejected = employee();
    for (const day of [0, 14, 28, 42]) {
      expect(requestCompanyRaise(ignored, day)).toBe(true);
      expect(requestCompanyRaise(rejected, day)).toBe(true);
      processEmployeeRequests(ignored, day + 3);
      respondToEmployeeRequest(rejected, false, day, 'raise');
    }
    expect(ignored.satisfaction).toBe(20); expect(ignored.satisfaction).toBe(rejected.satisfaction);
    expect(requestCompanyLeave(ignored, 45, [49])).toBe(true);
  });

  it('截止当天00:00不能补批，临界日期前仍可办理，休假只纳入有效日期', () => {
    const e = employee();
    requestCompanyLeave(e, 0, [1, 5, 5, 6]);
    expect(e.requests!.leave!.leaveDays).toEqual([5, 6]);
    expect(e.requests!.leave!.deadlineDay).toBe(4);
    expect(respondToEmployeeRequest(e, true, 3, 'leave').ok).toBe(true);
    expect(e.leaveDays).toEqual([5, 6]);
    requestCompanyRaise(e, 0);
    expect(respondToEmployeeRequest(e, true, 3, 'raise').ok).toBe(false);
    expect(e.salaryCents).toBe(200000); expect(e.satisfaction).toBe(80);
  });

  it('旧单申请只采纳一次，平面UI及日历投影不会改变请求或满意度', () => {
    const e = employee({ request: { kind: 'leave', day: 1, leaveDays: [5, 6] } });
    const before = structuredClone(e);
    expect(companyEmployeeRequests(e)[0]!.deadlineDay).toBe(4);
    expect(e).toEqual(before);
    normalizeEmployeeRequests(e, 2);
    expect(e.requests!.leave!.deadlineDay).toBe(4);
    const state = createInitialState(1497), day = gameDay(state.time);
    const staff = employee(); requestCompanyRaise(staff, day); requestCompanyLeave(staff, day, [day + 5]);
    staff.resignationDay = day + 3;
    state.company = company([staff]);
    const snapshot = structuredClone(state.company);
    const events = calendarEventsOf(state, day, day + 31);
    expect(events.filter(event => event.id.startsWith('company-request:'))).toHaveLength(2);
    expect(events.filter(event => event.id.startsWith('company-request-deadline:')).map(event => event.at / 1440)).toEqual([day + 3, day + 4]);
    expect(events.some(event => event.id.startsWith('company-resign:'))).toBe(true);
    expect(state.company).toEqual(snapshot);
    state.company.status = 'closed';
    expect(calendarEventsOf(state, day, day + 31).some(event => event.id.startsWith('company-rent:') || event.id.startsWith('company-pay:'))).toBe(false);
  });

  it('手动加薪消除已满足涨薪，但不会覆盖同时存在的休假', () => {
    const e = employee(); requestCompanyRaise(e, 0); requestCompanyLeave(e, 0, [5]);
    e.salaryCents = 370000; clearSatisfiedRaise(e);
    expect(companyEmployeeRequests(e).map(request => request.kind)).toEqual(['leave']);
  });
});

describe('连续薪资与旧薪资迁移', () => {
  it('每级平滑加薪，办公电脑、最高报价与扣假后17有效工作日下，短单每升一级净贡献增加约0.520833元', () => {
    let previous = -Infinity;
    for (let level = 1; level <= 10; level++) {
      const e = employee({ programming: level, design: 1, stars: employeeStars(level, 1), quoteFactor: 1.2 });
      expect(companyFairSalary(e)).toBe(Math.round((2500 + (level - 1) * 125) * 1.2 * 100));
      const net = companyDailyWork(level, 'mid') * 17 * (85000 / 40) - companyFairSalary(e);
      expect(net).toBeGreaterThan(previous);
      if (Number.isFinite(previous)) expect(net - previous).toBeCloseTo(52.08333333, 5); // 分，约0.520833元。
      previous = net;
    }
    expect(companyFairSalary(employee({ programming: 1, design: 1, quoteFactor: 1 }))).toBe(250000);
    expect(companyFairSalary(employee({ programming: 5, quoteFactor: 1 }))).toBe(300000);
    expect(companyFairSalary(employee({ programming: 10, quoteFactor: 1 }))).toBe(362500);
  });

  it('真实旧档迁移保留已签工资、候选报价、加薪申请与既有工资欠款', () => {
    const e = employee({ salaryCents: 1000000, accruedUnits: 987654321, request: { kind: 'raise', day: 4, salaryCents: 1400000 } });
    const c = company([e]);
    c.liabilities = [{ id: 'salary-old', kind: 'salary', amountCents: 800000, dueDay: 3, employeeId: e.id, employeeName: e.name }];
    c.candidates = [{ ...e }, { ...employee({ id: 'new', programming: 3, design: 1, stars: 2, quoteFactor: .8, salaryCents: 240000 }), hired: false }];
    const debtBefore = structuredClone(c.liabilities), datesBefore = [c.nextPayDay, c.nextRentDay, e.joinedMinute];
    const state = createInitialState(1497); state.version = 36; state.company = c;
    const loaded = migrateSave(state), migrated = loaded.company!, staff = migrated.employees[0]!;
    expect(staff.salaryCents).toBe(1000000);
    expect(staff.requests!.raise!.salaryCents).toBe(1400000);
    expect(staff.accruedUnits).toBe(987654321); expect(migrated.liabilities).toEqual(debtBefore);
    expect([migrated.nextPayDay, migrated.nextRentDay, staff.joinedMinute]).toEqual(datesBefore);
    expect(migrated.candidates.map(candidate => candidate.salaryCents)).toEqual([1000000, 240000]);
    expect(migrateSave(loaded).company).toEqual(migrated);
  });

  it('合理参考变动不自动修改已签低薪或高薪，保留独立待回复申请', () => {
    const e = employee({ salaryCents: 600000, requests: { raise: { kind: 'raise', day: 0, deadlineDay: 3, salaryCents: 800000 }, leave: { kind: 'leave', day: 0, deadlineDay: 4, leaveDays: [5] } } });
    const low = employee({ id: 'employee:2', name: '员工B', salaryCents: 200000 });
    const state = createInitialState(1497); state.version = 36; state.company = company([e, low]);
    const loaded = migrateSave(state).company!;
    expect(loaded.employees.map(staff => staff.salaryCents)).toEqual([600000, 200000]);
    expect(companyEmployeeRequests(loaded.employees[0]!).map(request => request.kind)).toEqual(['raise', 'leave']);
    expect(loaded.employees[0]!.requests!.raise!.salaryCents).toBe(800000);
  });
});
