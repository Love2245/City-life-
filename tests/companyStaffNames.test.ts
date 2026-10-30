import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { registerCompany, buyCompanyComputers, interviewCompany, hireCompanyEmployee, dismissCompanyEmployee } from '../src/game/core/company';
import { companyStaffNamesInUse, nextCompanyStaffName, normalizeCompanyStaffNames } from '../src/game/core/companyStaffNames';
import { advanceHours } from '../src/game/core/time';
import { migrateSave } from '../src/game/core/migrate';
import { primeHiringGate } from './helpers/companyGate';

function prepared() {
  const s = createInitialState(1497); s.mode = 'eternal'; s.player.money = 100000;
  s.locationId = 'municipal_hall'; s.time.hour = 10; s.developmentHistory!.total = 75; Object.assign(s.developmentHistory!.byType, { indie_game: 5 });
  expect(registerCompany(s, '正式公司名称保留').ok).toBe(true); primeHiringGate(s);
  s.company!.growthPoints = 500; // 命名测试需要两名员工，累计75件已开放足够员工岗位。
  s.locationId = 'electronics_store'; expect(buyCompanyComputers(s, 'mid', 3).ok).toBe(true);
  s.locationId = 'dev_incubator'; expect(interviewCompany(s).ok).toBe(true);
  return s;
}

describe('公司员工待定名称', () => {
  it('候选人采用员工 A B C，录用保留同一编号和候选属性', () => {
    const s = prepared(), c = s.company!;
    expect(c.candidates.map(e => e.name)).toEqual(['员工A', '员工B', '员工C']);
    const candidate = structuredClone(c.candidates[1]!);
    expect(hireCompanyEmployee(s, candidate.id).ok).toBe(true);
    const employee = c.employees[0]!;
    expect(employee).toMatchObject({ ...candidate, hired: true });
    expect(c.candidates[1]!.name).toBe('员工B');
    const before = JSON.stringify(c.candidates);
    expect(interviewCompany(s).ok).toBe(true); expect(JSON.stringify(c.candidates)).toBe(before);
    expect(JSON.stringify(migrateSave(s).company)).toBe(JSON.stringify(c));
  });

  it('离职不重排其他员工编号，次日候选人与在职人员保持唯一', () => {
    const s = prepared(), c = s.company!;
    for (const candidate of c.candidates.slice(0, 2)) expect(hireCompanyEmployee(s, candidate.id).ok).toBe(true);
    const remainingId = c.employees[1]!.id;
    expect(dismissCompanyEmployee(s, c.employees[0]!.id).ok).toBe(true);
    expect(c.employees[0]!.name).toBe('员工B');
    advanceHours(s, 24, false, true); expect(interviewCompany(s).ok).toBe(true);
    expect(c.employees[0]!.id).toBe(remainingId); expect(c.employees[0]!.name).toBe('员工B');
    const names = [...c.employees, ...c.candidates].map(e => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('有未清欠薪的离职员工继续占用编号，并支持超过 Z 的候选编号', () => {
    const s = prepared(), c = s.company!;
    c.liabilities.push({ id: 'debt-departed', kind: 'salary', dueDay: 0, amountCents: 12345, employeeId: 'departed', employeeName: '员工A' });
    const used = companyStaffNamesInUse(c);
    expect(nextCompanyStaffName(used)).toBe('员工B');
    const all = new Set(Array.from({ length: 26 }, (_, index) => `员工${String.fromCharCode(65 + index)}`));
    expect(nextCompanyStaffName(all)).toBe('员工AA'); expect(nextCompanyStaffName(all)).toBe('员工AB');
  });

  it('同版本旧档替换人员、债务、台账和提醒姓名，财务与 ID 不变且重复载入幂等', () => {
    const s = prepared(), c = s.company!;
    delete c.economyVersion;
    expect(hireCompanyEmployee(s, c.candidates[0]!.id).ok).toBe(true);
    c.employees[0]!.name = c.candidates[0]!.name = '林知远';
    c.candidates[1]!.name = '周雨宁'; c.candidates[2]!.name = '许子衡';
    delete c.employees[0]!.requests; // 真实旧申请结构只有request，不能保留新档的权威空requests槽。
    c.employees[0]!.request = { kind: 'raise', day: 0, salaryCents: 550000 };
    c.liabilities.push({ id: 'debt-old-name', kind: 'salary', dueDay: 0, amountCents: 12345, employeeId: 'departed', employeeName: '陈安然' });
    c.ledger.push({ minute: c.cursor, kind: 'request', amountCents: 0, text: '林知远申请涨薪至 5500.00 元／月，请到人员面板处理' });
    c.ledger.push({ minute: c.cursor, kind: 'departure', amountCents: 0, text: '赵嘉树主动离职；未付工资仍保留在公司应付账' });
    s.log.push({ day: 1, period: 'morning', icon: '🏢', text: '批准林知远的涨薪申请' });
    s.log.push({ day: 1, period: 'morning', icon: '💬', text: '林知远的其他剧情记录' });
    const snapshot = structuredClone(c), playerName = s.player.name;
    normalizeCompanyStaffNames(s);
    expect(c.employees[0]!.name).toBe('员工A'); expect(c.candidates.map(e => e.name)).toEqual(['员工A', '员工B', '员工C']);
    expect(c.liabilities[0]!.employeeName).toBe('员工D'); expect(c.liabilities[0]!.amountCents).toBe(12345);
    expect(c.ledger.at(-2)!.text).toContain('员工A申请涨薪'); expect(c.ledger.at(-1)!.text).toContain('员工E主动离职');
    expect(s.log.at(-2)!.text).toBe('批准员工A的涨薪申请'); expect(s.log.at(-1)!.text).toBe('林知远的其他剧情记录');
    expect(c.name).toBe(snapshot.name); expect(s.player.name).toBe(playerName);
    expect(c.employees[0]!.id).toBe(snapshot.employees[0]!.id); expect(c.employees[0]!.salaryCents).toBe(snapshot.employees[0]!.salaryCents);
    expect(c.employees[0]!.request).toEqual(snapshot.employees[0]!.request); expect(c.balanceCents).toBe(snapshot.balanceCents); expect(c.rng).toEqual(snapshot.rng);
    const once = JSON.stringify(c); normalizeCompanyStaffNames(s); expect(JSON.stringify(c)).toBe(once);
    const expected = JSON.parse(once) as typeof c;
    expected.economyVersion = 2;
    const expectedRequest = { ...snapshot.employees[0]!.request!, deadlineDay: 3 };
    expected.employees[0]!.requests = { raise: expectedRequest };
    expected.employees[0]!.request = expectedRequest;
    const loaded = migrateSave(s);
    expect(loaded.company).toEqual(expected);
    expect(migrateSave(loaded).company).toEqual(loaded.company);
  });

  it('混合旧档保留既有编号，已录用候选人与员工使用同一个编号', () => {
    const s = prepared(), c = s.company!;
    expect(hireCompanyEmployee(s, c.candidates[0]!.id).ok).toBe(true);
    c.employees[0]!.name = '待改名'; c.candidates[0]!.name = '待改名';
    c.candidates[1]!.name = '员工A'; c.candidates[2]!.name = '员工C';
    normalizeCompanyStaffNames(s);
    expect(c.candidates.map(e => e.name)).toEqual(['员工B', '员工A', '员工C']);
    expect(c.employees[0]!.name).toBe('员工B');
  });
});
