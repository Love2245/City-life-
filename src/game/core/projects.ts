/**
 * 创业项目系统（v0.9）：推进 career.projects 进度，完成自动发奖励。
 * 纯逻辑层：JSON 数据 + 引擎结算。
 * 由 actions.json 的 work_project handler 调用。
 */
import type { GameState, Effects, ResultDelta } from "../types";
import { ensureDevelopmentHistory, recordDevelopmentDelivery } from './developmentHistory';
import { facilityEfficiency } from './facility';
import { applyEffects, collectDeltas, pushLog } from "../engine";
import { itemCount, getItem, removeItem } from "./items";
import { cookingCategoryOf, cookingItemCount, fridgeList, removeCookingItem } from "./fridge";
import { fameIncomeMult } from "./stats";
import { gameDay } from "./calendar";
import projectsData from "../data/projects.json";
import { getRegion, isRegionUnlocked, regionLockReason } from "./regions";
import {COMPANY_WORK_SHIFTS,PERSONAL_DEVELOPMENT_RULES,companyDailyWork,companySkillMultiplier,type DevelopmentWorkShift} from './companyConfig';
import { normalizeDevelopmentWork, performDevelopmentWork, previewDevelopmentWork, type DevelopmentWorkPreview } from './developmentWork';

/** 创业项目定义（projects.json 数据） */
export interface ProjectDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** v1.20 项目类别：programming=编程（完成→每周版税）/ design=设计（完成→一次性奖金）/ business=创业（一次性奖金） */
  category?: "programming" | "design" | "business";
  /** v1.20 可重复推进：完成后自动清零从头再来（编程/设计类） */
  repeatable?: boolean;
  /** 现金委托只在交付时收款，不增加编程版税。 */
  contractFee?: number;
  /** 所需技能（如编程 3 级） */
  skill?: Partial<Record<string, number>>;
  /** 所需物品 flag（如 item_laptop 笔记本） */
  flag?: string;
  /** 每次行动推进的进度 */
  progressPerAction: number;
  /** 进度上限（100） */
  maxProgress?: number;
  /** 推进时的即时消耗/收益 */
  effects: Effects;
  /** 完成时的奖励 */
  reward: Effects;
  /** v1.25 摆摊：每次出摊消耗的食材（itemId → 数量） */
  needs?: Record<string, number>;
  /** v1.25 摆摊：每次出摊的固定营收基数（叠加影响力/摆摊技巧加成） */
  perActionIncome?: number;
  /** 结算随机评价 */
  verdicts?: string[];
}

export const PROJECTS: ProjectDef[] = projectsData as ProjectDef[];

const projectMap = new Map(PROJECTS.map((p) => [p.id, p]));

export function getProject(id: string): ProjectDef | undefined {
  return projectMap.get(id);
}

/** 当前项目进度 0-100 */
export function projectProgress(state: GameState, id: string): number {
  return state.career.projects[id] ?? 0;
}

/** 项目是否已完成 */
export function isProjectDone(state: GameState, id: string): boolean {
  const p = getProject(id);
  if (p?.repeatable) return false; // v1.20 可重复项目永远可继续做
  return p ? projectProgress(state, id) >= (p.maxProgress ?? 100) : false;
}

/** Plan a new work only after the previous work shipped; royalties require fresh progress. */
export function startNextProgrammingProject(state: GameState, id: string): { ok: boolean; reason?: string } {
  if (state.company && state.company.status !== 'closed') return { ok: false, reason: '作品已并入公司，请到公司立项' };
  const project = getProject(id);
  if (project?.category !== 'programming') return { ok: false, reason: '这不是编程项目' };
  if (!(projectProgress(state, id) >= (project.maxProgress ?? 100))) return { ok: false, reason: '请先完成当前作品' };
  state.flags[`project_completed_${id}`] = true;
  // Historical completion belongs to the released work, not the work now in progress.
  state.flags[`project_continuation_${id}`] = true;
  state.career.projects[id] = 0;
  clearPersonalDevelopmentQuote(state,id);
  pushLog(state, project.icon, `【${project.name}】开始筹备下一部作品`);
  return { ok: true };
}

/** 已完成的创业项目数（结局判定用） */
export function projectsDoneCount(state: GameState): number {
  // v1.20 可重复项目（编程/设计）以"完成过至少一次"计数（flag 记录），避免周入流永不入账结局判定
  return PROJECTS.filter(
    (p) => p.contractFee == null && (isProjectDone(state, p.id) || state.flags[`project_completed_${p.id}`] === true),
  ).length;
}

/** 已上线的编程自研作品件数（只算会产生每周版税的作品，不含现金委托与公司作品）。 */
export function personalRoyaltyWorks(state: GameState): number {
  const byType = state.developmentHistory?.byType ?? {};
  return PROJECTS.filter(p => p.category === 'programming' && p.contractFee == null)
    .reduce((total, p) => total + (Number.isFinite(byType[p.id]) ? byType[p.id]! : 0), 0);
}

/** Registration counts completed programming/design projects, including their cash commissions. */
export function personalDevelopmentWorks(state: GameState): number {
  const byType = state.developmentHistory?.byType ?? {};
  return PROJECTS.filter(p => p.category === 'programming' || p.category === 'design')
    .reduce((total, p) => total + (Number.isFinite(byType[p.id]) ? Math.max(0, byType[p.id]!) : 0), 0);
}

const SKILL_NAMES: Record<string, string> = {
  programming: "编程", design: "设计", writing: "文案", operation: "运营",
  cooking: "厨艺", service: "服务", driving: "驾驶", management: "管理",
};

/* ==================== v1.20 电脑档次 / 收入档位 ==================== */

export type LaptopTier = "none" | "low" | "mid" | "high";

/** v1.43 网吧上机：每小时 8 元，起步 3 小时（按次付费，离开网吧即失效）。 */
export const NETBAR_HOURLY_FEE = 8;
export const NETBAR_MIN_HOURS = 3;
const NETBAR_SESSION_UNTIL_FLAG = "netbar_session_until_minute";
/** 网吧机固定按办公电脑档位：比老旧笔记本好，比高级游戏电脑低。 */
export const NETBAR_TIER: LaptopTier = "mid";

/** 玩家自己拥有的最高电脑档次（不含网吧机位）。 */
export function ownedLaptopTier(state: GameState): LaptopTier {
  if (state.flags["item_laptop_pro"]) return "high";
  if (state.flags["item_laptop_mid"]) return "mid";
  if (state.flags["item_laptop"]) return "low";
  return "none";
}

/**
 * v1.43：是否正在网吧上机。
 *
 * 有效性**由所在地点推导**，而不是只靠"离开时清理"——晕倒强制回家（`engine.triggerCollapse`）、
 * 读档恢复等路径会直接改 `locationId` 而不经过 `enterLocation`，只靠清理标记会漏成
 * 「付 24 元白拿一台办公本」。因此这里必须校验 `locationId === "internet_cafe"`。
 */
export function onNetbarMachine(state: GameState): boolean {
  return netbarSessionRemainingMinutes(state) > 0;
}

/** 当前网吧机时剩余分钟。读取不修改存档，旧记录由载入/命令路径统一迁移。 */
export function netbarSessionRemainingMinutes(state: GameState): number {
  if (!state.flags["netbar_session"] || !["internet_cafe", "boyue_internet_cafe"].includes(state.locationId)) return 0;
  const now = gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
  const stored = state.flags[NETBAR_SESSION_UNTIL_FLAG];
  const until = typeof stored === 'number' && Number.isFinite(stored) ? stored : now + NETBAR_MIN_HOURS * 60;
  return Math.max(0, until - now);
}

/**
 * 当前可用电脑档次 = 自己拥有的最高档 ∪ 网吧机位（办公本）。
 * 这样没有电脑的玩家也能在网吧用论坛 / 直播 / 创业项目 / 设计工作台。
 */
export function laptopTier(state: GameState): LaptopTier {
  const owned = ownedLaptopTier(state);
  if (owned === "high") return "high";
  if (onNetbarMachine(state)) return NETBAR_TIER;
  return owned;
}

export function hasLaptop(state: GameState): boolean {
  return laptopTier(state) !== "none";
}

/**
 * 网吧上机：按小时计费开启本次机位权限，并给一点放松感（每天一次）。
 * 机位不是物品，离开网吧（进入其他地点）即失效，避免「付一次费永久拥有电脑」。
 */
export function startNetbarSession(state: GameState, hours = NETBAR_MIN_HOURS): { ok: boolean; reason?: string } {
  // 机位只在网吧有意义：不在网吧时直接拒绝，避免"扣了钱却拿不到机位"。
  if (state.districtLeisure?.active) return { ok: false, reason: "请先完成当前娱乐活动" };
  if (!["internet_cafe", "boyue_internet_cafe"].includes(state.locationId)) {
    return { ok: false, reason: "只有在网吧才能上机" };
  }
  if (state.locationId === "boyue_internet_cafe" && !isRegionUnlocked(state, getRegion("boyue_university"))) {
    return { ok: false, reason: regionLockReason(state, getRegion("boyue_university")) };
  }
  const today = gameDay(state.time);
  if (state.flags["netbar_session_day"] === today) {
    return { ok: false, reason: "今天已经在网吧上过机了，明天再来" };
  }
  const cost = NETBAR_HOURLY_FEE * hours;
  if (state.player.money < cost) {
    return { ok: false, reason: `上网吧上机需要 ${cost} 元（${NETBAR_HOURLY_FEE} 元/小时 × ${hours} 小时）` };
  }
  applyEffects(state, { money: -cost, mood: 4, stress: -5 }, "🖥️");
  state.flags["netbar_session"] = 1;
  state.flags["netbar_session_day"] = today;
  state.flags[NETBAR_SESSION_UNTIL_FLAG] = gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute + hours * 60;
  pushLog(state, "🖥️", `在网吧充了 ${hours} 小时机时（${cost} 元），机器按办公电脑档位算`);
  return { ok: true };
}

/** 离开网吧时机位失效。 */
export function endNetbarSession(state: GameState): void {
  delete state.flags["netbar_session"];
  delete state.flags[NETBAR_SESSION_UNTIL_FLAG];
}

/** 新工时可按剩余机时补足，只购买差额；补时不重复发放上机放松奖励。 */
export function netbarDevelopmentTopUpCost(state:GameState,hours:number):number {
  return Math.ceil(Math.max(0,hours*60-netbarSessionRemainingMinutes(state))*NETBAR_HOURLY_FEE/60*100)/100;
}
export function topUpNetbarForDevelopment(state:GameState,hours:number):{ok:boolean;reason?:string} {
  if(!Number.isFinite(hours)||hours<=0||hours>12)return{ok:false,reason:'请选择有效的开发机时'};
  if(!['internet_cafe','boyue_internet_cafe'].includes(state.locationId))return{ok:false,reason:'请在网吧办理机时'};
  if(state.locationId==='boyue_internet_cafe'&&!isRegionUnlocked(state,getRegion('boyue_university')))return{ok:false,reason:regionLockReason(state,getRegion('boyue_university'))};
  if(state.work?.active||state.districtLeisure?.active)return{ok:false,reason:'请先完成当前活动'};
  if(!state.flags.netbar_session)return startNetbarSession(state,hours);
  const cost=netbarDevelopmentTopUpCost(state,hours);
  if(cost<=0)return{ok:false,reason:'当前剩余机时已足够'};
  if(state.player.money<cost)return{ok:false,reason:`补足机时需要${cost}元`};
  applyEffects(state,{money:-cost},'🖥️');
  state.flags[NETBAR_SESSION_UNTIL_FLAG]=gameDay(state.time)*1440+state.time.hour*60+state.time.minute+hours*60;
  state.flags.netbar_session_day=gameDay(state.time);
  pushLog(state,'🖥️',`补足网吧机时至${hours}小时，支付差额${cost}元`);return{ok:true};
}

/** 居家设计正常8小时的工作量，与公司和员工共用技能、设备公式。 */
export function designProgressOf(state: GameState): number {
  const tier = laptopTier(state);
  return tier === 'none' ? 0 : companyDailyWork(state.player.skills.design,tier);
}

/** New self-developed works use the current economy; signed work keeps its saved quote. */
export function programmingWeeklyTier(skill: number): number {
  return PERSONAL_DEVELOPMENT_RULES.royalties[skill >= 7 ? 2 : skill >= 4 ? 1 : 0];
}
const LEGACY_PERSONAL_CAP = 1500;
const legacyWeeklyTier = (skill:number) => skill >= 7 ? 450 : skill >= 4 ? 180 : 90;
const contractQuoteFlag = (id:string) => `personal_development_contract_quote_${id}`;
const royaltyQuoteFlag = (id:string) => `personal_development_royalty_quote_${id}`;
const royaltyCapFlag = (id:string) => `personal_development_royalty_cap_${id}`;
const positiveFlag = (state:GameState,key:string):number|undefined => {
  const value=state.flags[key];return typeof value==='number'&&Number.isFinite(value)&&value>0?value:undefined;
};
export interface PersonalDevelopmentRewardQuote { contractFee?:number; royalty?:number; royaltyCap?:number; legacy:boolean }
/** Read-only quote used by both the workbench and the final payment. */
export function personalDevelopmentRewardQuote(state:GameState,projectId:string):PersonalDevelopmentRewardQuote {
  const project=getProject(projectId);
  if(!project)return{legacy:false};
  const progress=projectProgress(state,projectId),legacyPending=state.flags.development_economy_v2!==true&&progress>0&&progress<(project.maxProgress??100);
  if(project.contractFee!=null){
    const contractFee=positiveFlag(state,contractQuoteFlag(projectId))??(legacyPending?1000:PERSONAL_DEVELOPMENT_RULES.contractFee);
    return{contractFee,legacy:contractFee!==PERSONAL_DEVELOPMENT_RULES.contractFee};
  }
  if(project.category==='design')return{contractFee:designBonusTier(state.player.skills.design),legacy:false};
  if(project.category!=='programming')return{legacy:false};
  const royalty=positiveFlag(state,royaltyQuoteFlag(projectId))??(legacyPending?legacyWeeklyTier(state.player.skills.programming):programmingWeeklyTier(state.player.skills.programming));
  const royaltyCap=positiveFlag(state,royaltyCapFlag(projectId))??(legacyPending?LEGACY_PERSONAL_CAP:PERSONAL_DEVELOPMENT_RULES.passiveCap);
  return{royalty,royaltyCap,legacy:royaltyCap>PERSONAL_DEVELOPMENT_RULES.passiveCap};
}
function freezePersonalDevelopmentQuote(state:GameState,project:ProjectDef):void {
  const quote=personalDevelopmentRewardQuote(state,project.id);
  if(project.contractFee!=null)state.flags[contractQuoteFlag(project.id)]=quote.contractFee!;
  else if(project.category==='programming'){
    state.flags[royaltyQuoteFlag(project.id)]=quote.royalty!;
    state.flags[royaltyCapFlag(project.id)]=quote.royaltyCap!;
  }
}
export function clearPersonalDevelopmentQuote(state:GameState,projectId:string):void {
  delete state.flags[contractQuoteFlag(projectId)];delete state.flags[royaltyQuoteFlag(projectId)];delete state.flags[royaltyCapFlag(projectId)];
}

/** 个人与公司共用的技能倍率，0/1级1倍，满级1.5倍。 */
export function developmentProductivity(skill: number): number {
  return companySkillMultiplier(Number.isFinite(skill)?skill:0);
}

/** 只在载入或执行命令时迁移，预览不会改动进度、机时或账目。 */
export function normalizePersonalDevelopment(state: GameState): void {
  normalizeDevelopmentWork(state);
  if(state.flags.development_economy_v2!==true){
    for(const project of PROJECTS){
      const progress=projectProgress(state,project.id);
      if(progress>0&&progress<(project.maxProgress??100)&&(project.category==='programming'))freezePersonalDevelopmentQuote(state,project);
    }
    state.flags.development_economy_legacy_royalty_recovery=true;
    state.flags.development_economy_v2=true;
  }
  if (state.flags.personal_development_work_v2_migrated !== true) {
    for (const p of PROJECTS) if (p.category === 'design') {
      const stored = state.career.projects[p.id];
      if (typeof stored === 'number' && Number.isFinite(stored)) state.career.projects[p.id] = Math.max(0, Math.min(100, stored)) / 100 * (p.maxProgress ?? 20);
    }
    state.flags.personal_development_work_v2_migrated = true;
  }
  if (state.flags.netbar_session && !Number.isFinite(state.flags[NETBAR_SESSION_UNTIL_FLAG]) && ['internet_cafe','boyue_internet_cafe'].includes(state.locationId)) {
    state.flags[NETBAR_SESSION_UNTIL_FLAG] = gameDay(state.time)*1440 + state.time.hour*60 + state.time.minute + NETBAR_MIN_HOURS*60;
  }
}

export type PersonalDevelopmentPreview = Partial<DevelopmentWorkPreview> & {ok:boolean;reason?:string;shift?:DevelopmentWorkShift;tier?:LaptopTier;needsNetbarMinutes?:number};
/** Shared daily hours, real task duration and device checks are identical in preview and command. */
export function personalDevelopmentPreview(state:GameState,projectId:string,hours=8,continuous=false):PersonalDevelopmentPreview {
  const p=getProject(projectId),shift=COMPANY_WORK_SHIFTS.find(s=>s.hours===hours);
  if(!p||!['programming','design'].includes(p.category??''))return{ok:false,reason:'请选择编程或设计作品'};
  if(!shift)return{ok:false,reason:'请选择4、8或12小时开发'};
  if(state.company&&state.company.status!=='closed')return{ok:false,reason:'作品及权益已并入公司，请到公司开发'};
  const check=checkProjectRequirements(state,p);if(!check.ok)return check;
  if(state.work?.active||state.districtLeisure?.active)return{ok:false,reason:'请先完成当前活动'};
  const tier=laptopTier(state);
  if(tier==='none')return{ok:false,reason:'缺少电脑'};
  const skill=p.category==='design'?state.player.skills.design:state.player.skills.programming;
  let progress=projectProgress(state,p.id);
  if(p.category==='design'&&state.flags.personal_development_work_v2_migrated!==true)progress=Math.max(0,Math.min(100,progress))/100*(p.maxProgress??20);
  const preview=previewDevelopmentWork(state,{hours,pointsPerHour:companyDailyWork(skill,tier)/8,remainingPoints:continuous&&p.repeatable?Infinity:(p.maxProgress??100)-progress});
  const owned=ownedLaptopTier(state),usesNetbar=tier==='mid'&&owned!=='mid'&&owned!=='high'&&onNetbarMachine(state);
  const needsNetbarMinutes=usesNetbar?preview.minutes:0;
  if(preview.ok&&needsNetbarMinutes>netbarSessionRemainingMinutes(state))return{...preview,ok:false,shift,tier,needsNetbarMinutes,reason:`网吧需补足本次实际工作${preview.minutes}分钟的机时`};
  return{...preview,shift,tier,needsNetbarMinutes};
}

/** 编程作品当前每周版税上限。 */
export const PROGRAMMING_PASSIVE_CAP = PERSONAL_DEVELOPMENT_RULES.passiveCap;
/** 每周发薪后，作品版税按 10% 逐步衰减，直到停止产生收入。 */
export const PROGRAMMING_ROYALTY_DECAY_RATE = 0.1;

/**
 * 新增权益按签约上限的三分之一递减：100%／70%／40%，满额停止新增。
 */
export function programmingPassiveMultiplier(current: number,cap:number=PROGRAMMING_PASSIVE_CAP): number {
  if (current < cap/3) return 1;
  if (current < cap*2/3) return 0.7;
  if (current < cap) return 0.4;
  return 0;
}

/** 旧版发薪曾清空收益；按保留的上线记录恢复一次，避免老玩家仍没有下周版税。 */
export function migrateProgrammingRoyalties(state: GameState): void {
  if (state.flags.programming_royalty_persistent_v1 === true) {delete state.flags.development_economy_legacy_royalty_recovery;return;}
  const legacy=state.flags.development_economy_v2!==true||state.flags.development_economy_legacy_royalty_recovery===true;
  const recoveryCap=legacy?LEGACY_PERSONAL_CAP:PROGRAMMING_PASSIVE_CAP;
  const stored = state.career.passiveIncome;
  let income = typeof stored === "number" && Number.isFinite(stored)
    ? Math.max(0, stored) : 0;
  const additions = (state.log ?? []).flatMap((entry) => {
    const match = /本周版税池 \+(\d+) 元/.exec(entry.text);
    return match ? [Number(match[1])] : [];
  });
  if (additions.length > 0) {
    // 老代码每周清空：当前余额可能只含最近作品，历史上线记录才包含已付过款的作品。
    income = Math.max(income,Math.min(LEGACY_PERSONAL_CAP,additions.reduce((total, amount) => total + amount, 0)));
  } else if (income === 0) {
    for (const project of PROJECTS) {
      if (project.category !== "programming" || project.contractFee != null || state.flags[`project_completed_${project.id}`] !== true) continue;
      income = Math.min(recoveryCap,
        income + Math.round((legacy?legacyWeeklyTier(state.player.skills.programming):programmingWeeklyTier(state.player.skills.programming)) * programmingPassiveMultiplier(income,recoveryCap)));
    }
  }
  state.career.passiveIncome = income;
  state.flags.programming_royalty_persistent_v1 = true;
  delete state.flags.development_economy_legacy_royalty_recovery;
}

/** 20 点个人设计短单：设计 <4 → 300 / 4-6 → 450 / ≥7 → 600。 */
export function designBonusTier(skill: number): number {
  if (skill >= 7) return 600;
  if (skill >= 4) return 450;
  return 300;
}

/** 摆摊小技巧等级（读书积累，每级 +10% 摆摊收入，封顶 5 级） */
export function stallTipLevel(state: GameState): number {
  const v = state.flags["stall_tip_level"];
  return Math.max(0, Math.min(5, typeof v === "number" ? v : 0));
}

/** 每周日发放当前版税并衰减余额（由 weekly.ts 调用），返回本周发放金额。 */
export function settlePassiveIncome(state: GameState): number {
  if (state.company && state.company.status !== 'closed') return 0;
  const stored=state.career.passiveIncome;
  const inc = typeof stored==='number'&&Number.isFinite(stored)?Math.max(0,stored):0;
  if (inc <= 0) return 0;
  state.player.money += inc;
  const decay = Math.max(1, Math.ceil(inc * PROGRAMMING_ROYALTY_DECAY_RATE));
  state.career.passiveIncome = Math.max(0, inc - decay);
  pushLog(state, "💻", `本周编程版税到账 +${inc} 元，作品热度回落后版税减少 10%（下周约 ${state.career.passiveIncome} 元）`);
  return inc;
}

/* ==================== v1.45 摆摊食材与临时料理包 ==================== */

export const STALL_PROJECT_IDS = ["street_stall", "market_stall", "snack_stall"] as const;
export const STALL_PREP_KIT_COST = 20;

type StallIngredientCategory = "vegetable" | "meat" | "egg";
type StallNeed = {
  itemId: string;
  count: number;
  category?: StallIngredientCategory;
};

const STALL_CATEGORY_LABEL: Record<StallIngredientCategory, string> = {
  vegetable: "蔬菜",
  meat: "肉类",
  egg: "鸡蛋",
};

const VEGETABLE_CATEGORIES = new Set([
  "vegetable", "tomato", "cabbage", "potato", "carrot", "onion", "mushroom",
]);
const MEAT_CATEGORIES = new Set(["meat", "pork", "chicken", "beef"]);

export function isStallProject(projectOrId: ProjectDef | string): boolean {
  const id = typeof projectOrId === "string" ? projectOrId : projectOrId.id;
  return (STALL_PROJECT_IDS as readonly string[]).includes(id);
}

function stallCategoryOf(itemId: string): StallIngredientCategory | undefined {
  const category = cookingCategoryOf(itemId) ?? itemId;
  if (VEGETABLE_CATEGORIES.has(category)) return "vegetable";
  if (MEAT_CATEGORIES.has(category)) return "meat";
  if (category === "egg") return "egg";
  return undefined;
}

function stallNeedsOf(p: ProjectDef): StallNeed[] {
  if (!p.needs) return [];
  const categoryCounts = new Map<StallIngredientCategory, StallNeed>();
  const exact: StallNeed[] = [];
  for (const [itemId, rawCount] of Object.entries(p.needs)) {
    const count = rawCount ?? 1;
    const category = stallCategoryOf(itemId);
    if (!category) {
      exact.push({ itemId, count });
      continue;
    }
    const current = categoryCounts.get(category);
    if (current) current.count += count;
    else categoryCounts.set(category, { itemId, count, category });
  }
  return [...categoryCounts.values(), ...exact];
}

function stallIngredientIds(state: GameState): string[] {
  const ids = new Set(Object.keys(state.inventory ?? {}));
  for (const item of fridgeList(state)) ids.add(item.id);
  return [...ids];
}

function stallAvailableByCategory(state: GameState): Map<StallIngredientCategory, number> {
  const available = new Map<StallIngredientCategory, number>();
  for (const itemId of stallIngredientIds(state)) {
    const category = stallCategoryOf(itemId);
    if (!category) continue;
    const count = cookingItemCount(state, itemId);
    if (count > 0) available.set(category, (available.get(category) ?? 0) + count);
  }
  return available;
}

export interface StallIngredientCheck {
  ok: boolean;
  /** 缺少的类别摘要，用于弹窗与行动卡提示。 */
  missing: string[];
}

/** 摆摊允许同类食材互相替代：任意蔬菜算蔬菜，任意肉类算肉类。 */
export function stallIngredientCheck(state: GameState, projectOrId: ProjectDef | string): StallIngredientCheck {
  const p = typeof projectOrId === "string" ? getProject(projectOrId) : projectOrId;
  if (!p || !isStallProject(p)) return { ok: true, missing: [] };

  const available = stallAvailableByCategory(state);
  const missing: string[] = [];
  for (const need of stallNeedsOf(p)) {
    if (need.category) {
      const current = available.get(need.category) ?? 0;
      if (current < need.count) {
        missing.push(`${STALL_CATEGORY_LABEL[need.category]} ×${need.count}`);
      } else {
        available.set(need.category, current - need.count);
      }
    } else if (itemCount(state, need.itemId) < need.count) {
      missing.push(`${getItem(need.itemId)?.name ?? need.itemId} ×${need.count}`);
    }
  }
  return { ok: missing.length === 0, missing };
}

function stallKitFlag(projectId: string): string {
  return `stall_prep_kit_${projectId}`;
}

export function stallPrepKitCount(state: GameState, projectId: string): number {
  const value = state.flags[stallKitFlag(projectId)];
  return typeof value === "number" ? Math.max(0, Math.floor(value)) : value ? 1 : 0;
}

/** 购买一份只服务于下一次出摊的预制料理包。 */
export function buyStallPrepKit(
  state: GameState,
  projectId: string,
): { ok: boolean; reason?: string } {
  const p = getProject(projectId);
  if (!p || !isStallProject(p)) return { ok: false, reason: "未知摆摊项目" };
  if (stallPrepKitCount(state, projectId) > 0) return { ok: false, reason: "已经备好一份预制料理包" };
  if (state.player.money < STALL_PREP_KIT_COST) {
    return { ok: false, reason: `金钱不足（需要 ${STALL_PREP_KIT_COST} 元）` };
  }
  state.player.money -= STALL_PREP_KIT_COST;
  state.weekly.spent += STALL_PREP_KIT_COST;
  state.flags[stallKitFlag(projectId)] = 1;
  pushLog(state, "🍱", `买了一份临时预制料理包（-${STALL_PREP_KIT_COST} 元），食材已备齐`);
  return { ok: true };
}

function consumeStallInputs(state: GameState, p: ProjectDef): boolean {
  const kit = stallPrepKitCount(state, p.id);
  if (kit > 0) {
    state.flags[stallKitFlag(p.id)] = kit - 1;
    return true;
  }

  const check = stallIngredientCheck(state, p);
  if (!check.ok) return false;

  const reservedByItem = new Map<string, number>();
  const removals: Array<{ itemId: string; count: number }> = [];
  const ids = stallIngredientIds(state);
  for (const need of stallNeedsOf(p)) {
    if (!need.category) {
      if (!removeItem(state, need.itemId, need.count)) return false;
      continue;
    }
    let left = need.count;
    for (const itemId of ids) {
      if (left <= 0) break;
      if (stallCategoryOf(itemId) !== need.category) continue;
      const alreadyReserved = reservedByItem.get(itemId) ?? 0;
      const available = Math.max(0, cookingItemCount(state, itemId) - alreadyReserved);
      if (available <= 0) continue;
      const take = Math.min(left, available);
      removals.push({ itemId, count: take });
      reservedByItem.set(itemId, alreadyReserved + take);
      left -= take;
    }
    if (left > 0) return false;
  }
  for (const removal of removals) {
    if (!removeCookingItem(state, removal.itemId, removal.count)) return false;
  }
  return true;
}

/** 需求校验（技能/物品/未完成） */
export function checkProjectRequirements(
  state: GameState,
  p: ProjectDef,
): { ok: boolean; reason?: string } {
  if (p.skill) {
    for (const [k, need] of Object.entries(p.skill)) {
      const key = k as keyof typeof p.skill;
      // v1.20：拥有摆摊小车可免除摆摊类项目的厨艺门槛
      if ((p.id === "street_stall" || p.id === "market_stall" || p.id === "snack_stall") && key === "cooking" && state.flags["item_stall_cart"]) {
        continue;
      }
      if (state.player.skills[key as keyof typeof state.player.skills] < (need ?? 0)) {
        return { ok: false, reason: `需要${SKILL_NAMES[k] ?? k} ${need} 级` };
      }
    }
  }
  // 编程/设计项目需要任意一台电脑（三档均可）。
  if ((p.category === "programming" || p.category === "design") && !hasLaptop(state)) {
    return { ok: false, reason: "缺少电脑" };
  }
  if (p.flag && !state.flags[p.flag]) {
    return { ok: false, reason: "缺少必要物品" };
  }
  // v1.45 摆摊食材：按烹饪类别匹配，允许新版具体食材替代旧的通用食材 id。
  if (p.needs) {
    if (isStallProject(p)) {
      if (stallPrepKitCount(state, p.id) <= 0) {
        const ingredients = stallIngredientCheck(state, p);
        if (!ingredients.ok) {
          return { ok: false, reason: `摆摊需要：${ingredients.missing.join("、")}（缺少食材）；也可以临时购买预制料理包（20 元）` };
        }
      }
    } else {
      const missing: string[] = [];
      for (const [itemId, need] of Object.entries(p.needs)) {
        if (itemCount(state, itemId) < (need ?? 1)) {
          missing.push(`${getItem(itemId)?.name ?? itemId} ×${need ?? 1}`);
        }
      }
      if (missing.length > 0) {
        return { ok: false, reason: `背包里缺少食材：${missing.join("、")}（可去菜市场或紫羊区农村购买）` };
      }
    }
  }
  if (isProjectDone(state, p.id)) {
    return { ok: false, reason: "这个项目已经完成了" };
  }
  return { ok: true };
}

/** 合并基础 effects 与完成奖励（奖励字段覆盖/累加数值） */
function mergeEffects(base: Effects, reward: Effects): Effects {
  const out: Effects = { ...base };
  for (const [k, v] of Object.entries(reward)) {
    const key = k as keyof Effects;
    const val = v as number | undefined;
    if (val === undefined) continue;
    const cur = out[key] as number | undefined;
    if (typeof val === "number" && typeof cur === "number") {
      (out as Record<string, unknown>)[key] = (cur ?? 0) + val;
    } else {
      (out as Record<string, unknown>)[key] = val;
    }
  }
  return out;
}

/**
 * 推进一次项目进度：
 * - 校验需求 → 累计进度（progressPerAction）→ 即时结算 effects
 * - 进度满 → 追加 reward 并推送完成日志
 * 返回 deltas 供结算弹窗展示。
 */
export function workOnProject(
  state: GameState,
  projectId: string,
  options: { deferStallSettlement?: boolean; hours?:number; continuous?:boolean } = {},
): { ok: boolean; reason?: string; completed?: boolean; deltas?: ResultDelta[];elapsedHours?:number;crossedDay?:boolean } {
  const p = getProject(projectId);
  if (!p) return { ok: false, reason: '未知项目' };
  const development = p.category === 'programming' || p.category === 'design';
  if (development) return workOnPersonalDevelopment(state, p, options.hours ?? 8, options.continuous ?? false);
  const check = checkProjectRequirements(state, p);
  if (!check.ok) return { ok: false, reason: check.reason };

  // 摆摊保留原行动与收益规则，不使用研发工时预算。
  if (p.needs) {
    if (isStallProject(p)) consumeStallInputs(state, p);
    else for (const [itemId, count] of Object.entries(p.needs)) removeItem(state, itemId, count ?? 1);
  }
  const max = p.maxProgress ?? 100;
  const next = Math.min(max, projectProgress(state, p.id) + p.progressPerAction * facilityEfficiency(state, 'dev'));
  const completed = next >= max - 1e-7;
  state.career.projects[p.id] = completed ? max : Math.round(next * 1e8) / 1e8;
  let effects: Effects = p.effects;
  if (completed) {
    state.flags[`project_completed_${p.id}`] = true;
    const tip = stallTipLevel(state);
    const reward = tip > 0 && p.reward.money ? { ...p.reward, money: Math.round(p.reward.money * (1 + .1 * tip)) } : p.reward;
    effects = mergeEffects(effects, reward);
    pushLog(state, '🎉', `【${p.name}】大功告成！${tip > 0 ? `（摆摊小技巧加成 ${tip * 10}%）` : ''}`);
  }
  if (p.perActionIncome != null && !options.deferStallSettlement) {
    const income = Math.round(p.perActionIncome * fameIncomeMult(state) * (1 + .1 * stallTipLevel(state)));
    effects = mergeEffects(effects, { money: income });
  }
  if (options.deferStallSettlement && isStallProject(p)) { effects = { ...effects }; delete effects.money; delete effects.stamina; }
  applyEffects(state, effects, p.icon);
  if (completed && p.repeatable) state.career.projects[p.id] = 0;
  return { ok: true, completed, deltas: collectDeltas(effects) };
}

function workOnPersonalDevelopment(state: GameState, project: ProjectDef, hours: number, continuous: boolean) {
  const preview = personalDevelopmentPreview(state, project.id, hours, continuous);
  if (!preview.ok) return { ok: false, reason: preview.reason };
  // Failed commands and previews leave the save intact; a successful command can migrate it.
  normalizePersonalDevelopment(state);
  ensureDevelopmentHistory(state);
  const max = project.maxProgress ?? 100;
  const tier = preview.tier! as Exclude<LaptopTier, 'none'>;
  const skill = project.category === 'design' ? state.player.skills.design : state.player.skills.programming;
  let deliveries = 0, stop = false, rewards: Effects = {};
  const result = performDevelopmentWork(state, {
    hours,
    pointsPerHour: companyDailyWork(skill, tier) / 8,
    remaining: () => stop ? 0 : continuous && project.repeatable ? Infinity : Math.max(0, max - projectProgress(state, project.id)),
    canContinue: () => !(state.company && state.company.status !== 'closed') && (!preview.needsNetbarMinutes || netbarSessionRemainingMinutes(state) > 0),
    contribute: (offered) => {
      let accepted = 0;
      while (offered - accepted > 1e-9 && !stop) {
        freezePersonalDevelopmentQuote(state,project);
        const part = Math.min(offered - accepted, Math.max(0, max - projectProgress(state, project.id)));
        const next = projectProgress(state, project.id) + part;
        accepted += part;
        // Retain sub-minute precision; continuous jobs carry the remainder into the next order.
        state.career.projects[project.id] = next >= max - 1e-8 ? max : next;
        if (next >= max - 1e-8) {
          recordDevelopmentDelivery(state, project.id);
          state.flags[`project_completed_${project.id}`] = true;
          deliveries++;
          const reward = personalDeliveryReward(state, project);
          clearPersonalDevelopmentQuote(state,project.id);
          applyEffects(state, reward, project.icon);
          rewards = mergeEffects(rewards, reward);
          if (project.repeatable) state.career.projects[project.id] = 0;
          if (!continuous || !project.repeatable) stop = true;
        }
        if (part <= 0) break;
      }
      return accepted;
    },
  });
  if (result.ok) pushLog(state, project.icon, `【${project.name}】实际工作${result.minutes}分钟，推进${result.points.toFixed(2)}点${deliveries ? `，交付${deliveries}件` : ''}`);
  const effects: Effects = { ...rewards, stamina: -result.costs.stamina, health: -result.costs.health, mood: (rewards.mood ?? 0) - result.costs.mood, stress: (rewards.stress ?? 0) + result.costs.stress };
  return { ok: result.ok, reason: result.reason, completed: deliveries > 0, deltas: collectDeltas(effects), elapsedHours: result.elapsedHours, crossedDay: result.crossedDay };
}

function personalDeliveryReward(state: GameState, project: ProjectDef): Effects {
  const quote=personalDevelopmentRewardQuote(state,project.id);
  if (project.contractFee != null) {
    pushLog(state, project.icon, `【${project.name}】交付一单！委托款 +${quote.contractFee} 元${quote.legacy?'（原签约价）':''}，不计入版税`);
    return { ...project.reward, money: quote.contractFee };
  }
  if (project.category === 'design') {
    const bonus = designBonusTier(state.player.skills.design);
    pushLog(state, project.icon, `【${project.name}】交付一单！设计费 +${bonus} 元`);
    return { ...project.reward, money: bonus };
  }
  state.flags.programming_royalty_persistent_v1 = true;
  const stored=state.career.passiveIncome;
  const current = typeof stored==='number'&&Number.isFinite(stored)?Math.max(0,stored):0;
  const cap=quote.royaltyCap!,addition = Math.max(0, Math.min(cap - current, Math.round(quote.royalty! * programmingPassiveMultiplier(current,cap))));
  state.career.passiveIncome = current + addition;
  pushLog(state, '💻', `【${project.name}】大功告成！${addition > 0 ? `每周版税 +${addition} 元（当前 ${state.career.passiveIncome} 元/周，本件上限 ${cap}${quote.legacy?'，原作品权益':''}，之后逐周减少）` : '版税已达本件上限，本次不再增加收益；历史权益完整保留'}`);
  return project.reward;
}
