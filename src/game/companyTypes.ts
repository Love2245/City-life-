export type CompanyLane = 'programming' | 'design';
export type CompanyRole = CompanyLane | 'maintenance' | 'idle';
export type CompanyComputerTier = 'low' | 'mid' | 'high';
export type CompanyScale = 'short' | 'small' | 'medium' | 'large';
export type CompanyProjectMode = 'product' | 'contract';
export interface CompanyProjectQuote {
  work: number; priceCents: number; royaltyCents: number; growthPoints: number;
  minimumRoyaltyCapCents?: number;
  milestones: { progress: number; amountCents: number }[];
}
export interface DevelopmentHistory { total: number; byType: Record<string, number>; migrated: boolean }
export interface CompanyProjectPlan { topic: string; scale: CompanyScale; mode: CompanyProjectMode }
export interface CompanyProject {
  id: string; lane: CompanyLane; topic: string; scale: CompanyScale; progress: number;
  repeat: boolean; sourceId?: string; mode?: CompanyProjectMode;
  quote?: CompanyProjectQuote; paidMilestones?: number[]; paidCents?: number;
  next?: CompanyProjectPlan;
}
export interface CompanyCandidate {
  id: string; name: string; programming: number; design: number; stars: number;
  quoteFactor: number; salaryCents: number; hired: boolean;
}
export interface CompanyEmployee extends CompanyCandidate {
  seatIndex?: number;
  role: CompanyRole; secondaryRole?: CompanyRole; joinedMinute: number; accruedUnits: number;
  programmingXp: number; designXp: number; satisfaction: number; underpaidDays: number;
  lastRaiseDay: number; nextLeaveDay: number; leaveDays: number[];
  resignationDay?: number;
  resignationReason?: 'satisfaction' | 'unpaid';
  request?: Omit<CompanyEmployeeRequest, 'deadlineDay'> & { deadlineDay?: number };
  requests?: { raise?: CompanyEmployeeRequest; leave?: CompanyEmployeeRequest };
}
export interface CompanyEmployeeRequest {
  kind: 'raise' | 'leave'; day: number; deadlineDay: number;
  salaryCents?: number; leaveDays?: number[]; reminded?: boolean;
}
export interface CompanyFundingPolicy {
  reserveCents: number; monthlyLimitCents: number | null; usedCents: number; monthKey: number; enabled: boolean;
}
export interface CompanyComputer { id: string; tier: CompanyComputerTier; costCents: number; assignee: string | null; seatIndex?: number }
export interface CompanyLiability {
  id: string; kind: 'salary' | 'rent' | 'severance'; amountCents: number;
  dueDay: number; employeeId?: string; employeeName?: string;
}
export interface CompanyLedgerEntry { minute: number; kind: string; amountCents: number; text: string }
export interface CompanyState {
  workBalanceVersion?: number;
  managementVersion?: number; status?: 'active' | 'closed';
  economyVersion?: number;
  growthPoints?: number; recruitmentFloor?: number;
  fundingPolicy?: CompanyFundingPolicy;
  accounting?: import('./core/companyAccounting').CompanyAccounting;
  rng: import('./types').RngState;
  name: string; stage: number; foundedMinute: number; cursor: number; sequence: number;
  balanceCents: number; depositCents: number; nextRentDay: number; nextPayDay: number;
  royaltyCents: number; lastRoyaltyWeek: number; maintenance: number;
  programming: CompanyProject | null; design: CompanyProject | null; pending: CompanyProject[];
  employees: CompanyEmployee[]; computers: CompanyComputer[];
  interviewDay: number; candidates: CompanyCandidate[]; liabilities: CompanyLiability[];
  ledger: CompanyLedgerEntry[]; earnedCents: number; spentCents: number;
}
