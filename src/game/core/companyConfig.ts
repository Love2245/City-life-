import type { CompanyComputerTier, CompanyLane, CompanyScale } from '../companyTypes';

/** 首版经营参数统一在此调整；所有金额为元，持久化账本使用分。 */
export const COMPANY_STAGES = [
  { stage: 1, name: '大学创业孵化室', capacity: 3, requiredPeople: 1, rent: 800, cap: 600, location: 'dev_incubator', region: 'campus_teacher' },
  { stage: 2, name: '写字楼单间', capacity: 6, requiredPeople: 3, rent: 2000, cap: 1000, location: 'company_office_single', region: 'downtown_commercial' },
  { stage: 3, name: '大办公室', capacity: 10, requiredPeople: 6, rent: 5000, cap: 2000, location: 'company_office_large', region: 'downtown_commercial' },
  { stage: 4, name: '写字楼整层', capacity: 16, requiredPeople: 10, rent: 10000, cap: 4000, location: 'company_office_floor', region: 'downtown_commercial' },
] as const;
export const COMPANY_SCALES: Record<CompanyScale, { name: string; stage: number; work: number; royalty: number; design: number }> = {
  short: { name: '短单', stage: 1, work: 40, royalty: 0, design: 850 },
  small: { name: '小型', stage: 1, work: 100, royalty: 60, design: 2200 },
  medium: { name: '中型', stage: 2, work: 400, royalty: 240, design: 9200 },
  large: { name: '大型', stage: 3, work: 1200, royalty: 720, design: 30000 },
};
export const COMPANY_COMPUTERS: Record<CompanyComputerTier, { name: string; price: number; efficiency: number }> = {
  low: { name: '老旧笔记本', price: 500, efficiency: 1 },
  mid: { name: '办公台式电脑', price: 1500, efficiency: 1.5 },
  high: { name: '高级游戏电脑', price: 6500, efficiency: 2 },
};
export const COMPANY_TOPICS: Record<CompanyLane, readonly string[]> = {
  programming: ['工具软件', '手机 App', '游戏'], design: ['平面设计', '品牌视觉', '界面设计'],
};
export const COMPANY_RULES = {
  salaries: [2500, 2750, 3000, 3250, 3500], salaryBase: 2500, salaryPerSkill: 125,
  maxEmployees: 15, deliveriesPerEmployee: 5, growthPerEmployee: 500,
  monthDays: 30, workStart: 9, workEnd: 17, standardHours: 8, baseDailyWork: 5,
  maintenanceDivisor: 100, decay: .1, xpBase: 120, xpPerLevel: 40,
  raiseCooldown: 14, underpaidRatio: .85, leaveMin: 20, leaveMax: 40,
  initialSatisfaction: 80, rejectRaise: 15, rejectLeave: 20, overduePenalty: 5,
  resignationSatisfaction: 30, remedyDays: 3, noticeDays: 3, overdueResignDays: 7, severanceDays: 7,
  /** 注册门槛：个人真实交付的设计、编程作品和现金委托合计至少 5 件。 */
  royaltyWorksRequired: 5,
} as const;
export const COMPANY_MONTH_MINUTES = COMPANY_RULES.monthDays * 1440;
export const DEV_WORK_DAY = 'dev_work_day';
export const COMPANY_WORK_SHIFTS = [
  {hours:4,name:'轻度工作',multiplier:.5,stamina:14,health:1,mood:2,stress:4},
  {hours:8,name:'正常工作',multiplier:1,stamina:28,health:2,mood:4,stress:8},
  {hours:12,name:'加班工作',multiplier:1.5,stamina:48,health:5,mood:10,stress:18},
] as const;
export type DevelopmentWorkShift = typeof COMPANY_WORK_SHIFTS[number];
export function developmentWorkEffects(shift: DevelopmentWorkShift) {
  return {stamina:-shift.stamina,health:-shift.health,mood:-shift.mood,stress:shift.stress,intelligence:1};
}
/** 缺少标记的旧公司使用 60/240/720 工作量，载入时按完成比例迁移一次。 */
export const COMPANY_WORK_BALANCE_VERSION = 1;
export const COMPANY_LEGACY_WORK = { short: 40, small: 60, medium: 240, large: 720 } as const;
export const COMPANY_MANAGEMENT_VERSION = 2;
export const DEVELOPMENT_ECONOMY_VERSION = 2;
export const PERSONAL_DEVELOPMENT_RULES = {passiveCap:200,royalties:[40,80,150],contractFee:850} as const;
/** 已签旧合同仅用于迁移兑现，不作为新项目报价。 */
export const COMPANY_LEGACY_ECONOMY = {
  caps:[4500,7500,15000,30000],
  scales:{short:{work:40,design:1000,royalty:0},small:{work:100,design:3000,royalty:300},medium:{work:400,design:14000,royalty:1320},large:{work:1200,design:48000,royalty:4320}},
} as const;
export function companyFairSalary(programming: number, design: number, quoteFactor = 1) {
  return Math.round((COMPANY_RULES.salaryBase + COMPANY_RULES.salaryPerSkill * (Math.max(programming, design) - 1)) * quoteFactor * 100);
}
export function companyStage(stage: number) { return COMPANY_STAGES[stage - 1]!; }
export function employeeStars(programming: number, design: number) { return Math.max(1, Math.min(5, Math.ceil(Math.max(programming, design) / 2))); }
/** 0/1级为普通人，2—10级线性提升，10级为1.5倍。主角与员工完全共用。 */
export function companySkillMultiplier(skill: number) { return 1 + (Math.max(1, Math.min(10, skill)) - 1) / 18; }
export function companyDailyWork(skill: number, tier: CompanyComputerTier) { return COMPANY_RULES.baseDailyWork * companySkillMultiplier(skill) * COMPANY_COMPUTERS[tier].efficiency; }
export function companyHourlyWork(skill: number, tier: CompanyComputerTier) { return companyDailyWork(skill, tier) / COMPANY_RULES.standardHours; }
export function companyRoyaltyAddition(currentCents: number, stage: number, scale: CompanyScale) {
  const cap = companyStage(stage).cap * 100;
  const factor = currentCents < cap / 3 ? 1 : currentCents < cap * 2 / 3 ? .7 : currentCents < cap ? .4 : 0;
  return Math.max(0, Math.min(cap - currentCents, Math.round(COMPANY_SCALES[scale].royalty * 100 * factor)));
}
