import type { CompanyState } from '../companyTypes';
import type { GameState } from '../types';

const staffName = /^员工[A-Z]+$/;

function letterName(index: number): string {
  let letters = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) letters = String.fromCharCode(65 + (value - 1) % 26) + letters;
  return `员工${letters}`;
}

function nextName(used: Set<string>): string {
  let index = 0;
  while (used.has(letterName(index))) index++;
  const name = letterName(index);
  used.add(name);
  return name;
}

/** 编号随人员保存；离职后不重新给其他员工排序，未结清的离职人员也保留编号。 */
export function companyStaffNamesInUse(c: CompanyState): Set<string> {
  return new Set([...c.employees.map(e => e.name), ...c.liabilities.filter(d => d.kind !== 'rent').map(d => d.employeeName ?? '')]);
}

export const nextCompanyStaffName = (used: Set<string>): string => nextName(used);

/** 只识别公司自行产生的人员事件，不改公司名称、主角名或其他 NPC 日志。 */
function personInEvent(text: string): string | undefined {
  const patterns = [
    /^录用(.+?)，月薪 /,
    /^(.+?)(?:主动离职；|办理离职，|月薪调整为 |成长至 |有离职意向，)/,
    /^(?:批准|拒绝)(.+?)的(?:涨薪|带薪休假)申请$/,
    /^(.+?)申请(?:涨薪至 | \d+ 个工作日带薪假，)/,
    /^(.+?)(?:结清工资|支付离职补偿) [\d.]+ 元$/,
  ];
  for (const pattern of patterns) {
    const name = text.match(pattern)?.[1];
    if (name) return name;
  }
}

/** 同版本旧档也可载入；只替换展示姓名，ID、报价、请求、债务和随机数状态保持原值。 */
export function normalizeCompanyStaffNames(s: GameState): void {
  const c = s.company;
  if (!c) return;
  const people = new Map<string, { old: string; set: (name: string) => void }[]>();
  const add = (id: string, old: string, set: (name: string) => void) => {
    const entries = people.get(id) ?? [];
    entries.push({ old, set }); people.set(id, entries);
  };
  for (const e of [...c.employees, ...c.candidates]) add(e.id, e.name, name => { e.name = name; });
  for (const d of c.liabilities) if (d.kind !== 'rent' && d.employeeName) add(d.employeeId ?? `legacy-name:${d.employeeName}`, d.employeeName, name => { d.employeeName = name; });
  const used = new Set<string>(), labels = new Map<string, string>();
  // 先保留已经存在的编号，避免在混合的新旧存档里挤占后面人员的稳定编号。
  for (const [id, entries] of people) {
    const existing = entries.find(entry => staffName.test(entry.old) && !used.has(entry.old))?.old;
    if (existing) { used.add(existing); labels.set(id, existing); }
  }
  const replacements = new Map<string, string>();
  for (const [id, entries] of people) {
    const name = labels.get(id) ?? nextName(used);
    for (const entry of entries) { if (entry.old !== name) replacements.set(entry.old, name); entry.set(name); }
  }
  const events = [...c.ledger, ...s.log.filter(entry => entry.icon === '🏢')];
  for (const entry of events) {
    const old = personInEvent(entry.text);
    if (old && !staffName.test(old) && !replacements.has(old)) replacements.set(old, nextName(used));
  }
  for (const entry of events) {
    const old = personInEvent(entry.text), name = old && replacements.get(old);
    if (old && name) entry.text = entry.text.replace(old, name);
  }
}
