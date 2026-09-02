/**
 * 创业项目系统（v0.9）：推进 career.projects 进度，完成自动发奖励。
 * 纯逻辑层：JSON 数据 + 引擎结算。
 * 由 actions.json 的 work_project handler 调用。
 */
import type { GameState, Effects, ResultDelta } from "../types";
import { facilityEfficiency } from './facility';
import { applyEffects, collectDeltas, pushLog } from "../engine";
import { itemCount, getItem, removeItem } from "./items";
import { fameIncomeMult } from "./stats";
import projectsData from "../data/projects.json";

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

/** 已完成的创业项目数（结局判定用） */
export function projectsDoneCount(state: GameState): number {
  // v1.20 可重复项目（编程/设计）以"完成过至少一次"计数（flag 记录），避免周入流永不入账结局判定
  return PROJECTS.filter(
    (p) => isProjectDone(state, p.id) || state.flags[`project_completed_${p.id}`] === true,
  ).length;
}

const SKILL_NAMES: Record<string, string> = {
  programming: "编程", design: "设计", writing: "文案", operation: "运营",
  cooking: "厨艺", service: "服务", driving: "驾驶", management: "管理",
};

/* ==================== v1.20 电脑档次 / 收入档位 ==================== */

export type LaptopTier = "none" | "low" | "mid" | "high";

/** 当前最高电脑档次（旧笔记本 / 办公本 / 电竞本） */
export function laptopTier(state: GameState): LaptopTier {
  if (state.flags["item_laptop_pro"]) return "high";
  if (state.flags["item_laptop_mid"]) return "mid";
  if (state.flags["item_laptop"]) return "low";
  return "none";
}

export function hasLaptop(state: GameState): boolean {
  return laptopTier(state) !== "none";
}

/** 居家设计单次进度（按电脑档次 10% / 15% / 25%） */
export function designProgressOf(state: GameState): number {
  const tier = laptopTier(state);
  return tier === "high" ? 25 : tier === "mid" ? 15 : tier === "low" ? 10 : 0;
}

/** 编程周入档位（技能 <4 → 100 / 4-6 → 200 / ≥7 → 500） */
export function programmingWeeklyTier(skill: number): number {
  if (skill >= 7) return 500;
  if (skill >= 4) return 200;
  return 100;
}

/** 居家设计单次奖金档位（设计 <4 → 100 / 4-6 → 300 / ≥7 → 800） */
export function designBonusTier(skill: number): number {
  if (skill >= 7) return 800;
  if (skill >= 4) return 300;
  return 100;
}

/** 摆摊小技巧等级（读书积累，每级 +10% 摆摊收入，封顶 5 级） */
export function stallTipLevel(state: GameState): number {
  const v = state.flags["stall_tip_level"];
  return Math.max(0, Math.min(5, typeof v === "number" ? v : 0));
}

/** 每周日结算：发放编程周入（由 weekly.ts 调用），返回发放金额 */
export function settlePassiveIncome(state: GameState): number {
  const inc = state.career.passiveIncome ?? 0;
  if (inc <= 0) return 0;
  state.player.money += inc;
  pushLog(state, "💻", `本周编程版税/奖金到账 +${inc} 元（多部作品可叠加，下周继续发放）`);
  return inc;
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
      if ((p.id === "street_stall" || p.id === "market_stall") && key === "cooking" && state.flags["item_stall_cart"]) {
        continue;
      }
      if (state.player.skills[key as keyof typeof state.player.skills] < (need ?? 0)) {
        return { ok: false, reason: `需要${SKILL_NAMES[k] ?? k} ${need} 级` };
      }
    }
  }
  // v1.20：编程/设计项目需要任意一台笔记本电脑（旧/办公/电竞本均可）
  if ((p.category === "programming" || p.category === "design") && !hasLaptop(state)) {
    return { ok: false, reason: "缺少笔记本电脑" };
  }
  if (p.flag && !state.flags[p.flag]) {
    return { ok: false, reason: "缺少必要物品" };
  }
  // v1.25 摆摊需食材：背包必须备好对应食材（去菜市场/郊区农村购买）
  if (p.needs) {
    const missing: string[] = [];
    for (const [itemId, need] of Object.entries(p.needs)) {
      if (itemCount(state, itemId) < (need ?? 1)) {
        missing.push(`${getItem(itemId)?.name ?? itemId} ×${need ?? 1}`);
      }
    }
    if (missing.length > 0) {
      return { ok: false, reason: `背包里缺少食材：${missing.join("、")}（可去菜市场或郊区农村购买）` };
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
): { ok: boolean; reason?: string; completed?: boolean; deltas?: ResultDelta[] } {
  const p = getProject(projectId);
  if (!p) return { ok: false, reason: "未知项目" };
  const check = checkProjectRequirements(state, p);
  if (!check.ok) return { ok: false, reason: check.reason };

  // v1.25 摆摊消耗食材（校验已保证背包充足）
  if (p.needs) {
    for (const [itemId, count] of Object.entries(p.needs)) {
      removeItem(state, itemId, count ?? 1);
    }
  }

  const max = p.maxProgress ?? 100;
  const cur = projectProgress(state, p.id);
  // v1.20 设计进度按电脑档次 10%/15%/25%，不再乘设施系数（与需求文案一致）
  const step =
    p.category === "design"
      ? Math.max(p.progressPerAction, designProgressOf(state))
      : p.progressPerAction * facilityEfficiency(state, "dev");
  const next = Math.min(max, cur + step);
  state.career.projects[p.id] = next;

  const completed = next >= max;
  let eff: Effects = p.effects;
  if (completed) {
    state.flags[`project_completed_${p.id}`] = true;
    if (p.category === "programming") {
      // v1.20 编程：不再一次性发奖金 → 累加每周固定版税（按编程等级 100/200/500，可叠加）
      const weekly = programmingWeeklyTier(state.player.skills.programming);
      state.career.passiveIncome = (state.career.passiveIncome ?? 0) + weekly;
      eff = mergeEffects(p.effects, { ...p.reward, money: undefined });
      pushLog(state, "💻", `【${p.name}】大功告成！每周固定版税 +${weekly} 元（累计 ${state.career.passiveIncome} 元/周），可以开发下一部作品了`);
    } else if (p.category === "design") {
      // v1.20 设计：完成一单 → 按设计等级发一次性奖金（100/300/800），随后开始下一单
      const bonus = designBonusTier(state.player.skills.design);
      eff = mergeEffects(p.effects, { ...p.reward, money: bonus });
      pushLog(state, "🛋️", `【${p.name}】交付一单！设计费 +${bonus} 元，下一单马上开工`);
      state.career.projects[p.id] = 0;
    } else {
      // 创业/摆摊类：一次性奖金（摆摊小技巧按等级加成 10%/级）
      const tip = stallTipLevel(state);
      const reward = tip > 0 && p.reward.money
        ? { ...p.reward, money: Math.round(p.reward.money * (1 + 0.1 * tip)) }
        : p.reward;
      eff = mergeEffects(p.effects, reward);
      pushLog(state, "🎉", `【${p.name}】大功告成！${tip > 0 ? `（摆摊小技巧加成 ${tip * 10}%）` : ""}`);
    }
  }
  // v1.25 摆摊按次营收：影响力(fame) + 摆摊小技巧（每级 +10%，封顶 5 级）加成
  if (p.perActionIncome) {
    const tip = stallTipLevel(state);
    const income = Math.round(p.perActionIncome * fameIncomeMult(state) * (1 + 0.1 * tip));
    eff = mergeEffects(eff, { money: income });
  }
  applyEffects(state, eff, p.icon);
  if (completed && p.repeatable && p.category !== "design") {
    state.career.projects[p.id] = 0; // v1.20 编程作品完成后可继续下一部
  }
  return { ok: true, completed, deltas: collectDeltas(eff) };
}
