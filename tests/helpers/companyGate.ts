import type { GameState } from '../../src/game/types';
import { COMPANY_MONTH_MINUTES, COMPANY_RULES, companyStage } from '../../src/game/core/companyConfig';
import { createCompanyAccounting } from '../../src/game/core/companyAccounting';

/**
 * 测试夹具：写入一个"已结账且盈利"的 30 天周期，保留财务测试需要的历史账单（已不作为招聘门槛）。
 * 默认按最贵候选（10 级能力、报价上浮 20%）估算，避免夹具结果依赖随机星级。
 */
export function primeHiringGate(state: GameState, salaryCents?: number) {
  const company = state.company!;
  const rentCents = companyStage(company.stage).rent * 100;
  const salary = salaryCents ?? Math.round((COMPANY_RULES.salaryBase + COMPANY_RULES.salaryPerSkill * 9) * 1.2 * 100);
  const start = company.accounting?.periodStartMinute ?? company.cursor;
  company.accounting ??= createCompanyAccounting(start);
  const requiredProfit = Math.round(salary * 1.2);
  // 新公司的时间线还不够 30 天，周期起点按 0 截断，保证通过存档校验（不允许负数分钟）。
  company.accounting.periods.push({
    periodStartMinute: Math.max(0, start - COMPANY_MONTH_MINUTES), endMinute: start,
    incomeCents: requiredProfit + rentCents, wageUnits: 0, rentUnits: rentCents * COMPANY_MONTH_MINUTES,
    otherCostCents: 0, assetInCents: 0, assetOutCents: 0, ownerInCents: 0, ownerOutCents: 0,
  });
  company.accounting.periods = company.accounting.periods.slice(-12);
}
