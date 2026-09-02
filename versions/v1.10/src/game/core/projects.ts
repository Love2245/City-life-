/**
 * 创业项目系统（v0.9）：推进 career.projects 进度，完成自动发奖励。
 * 纯逻辑层：JSON 数据 + 引擎结算。
 * 由 actions.json 的 work_project handler 调用。
 */
import type { GameState, Effects, ResultDelta } from "../types";
import { facilityEfficiency } from './facility';
import { applyEffects, collectDeltas, pushLog } from "../engine";
import projectsData from "../data/projects.json";

/** 创业项目定义（projects.json 数据） */
export interface ProjectDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
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
  return p ? projectProgress(state, id) >= (p.maxProgress ?? 100) : false;
}

/** 已完成的创业项目数（结局判定用） */
export function projectsDoneCount(state: GameState): number {
  return PROJECTS.filter((p) => isProjectDone(state, p.id)).length;
}

const SKILL_NAMES: Record<string, string> = {
  programming: "编程", design: "设计", writing: "文案", operation: "运营",
  cooking: "厨艺", service: "服务", driving: "驾驶", management: "管理",
};

/** 需求校验（技能/物品/未完成） */
export function checkProjectRequirements(
  state: GameState,
  p: ProjectDef,
): { ok: boolean; reason?: string } {
  if (p.skill) {
    for (const [k, need] of Object.entries(p.skill)) {
      const key = k as keyof typeof p.skill;
      if (state.player.skills[key as keyof typeof state.player.skills] < (need ?? 0)) {
        return { ok: false, reason: `需要${SKILL_NAMES[k] ?? k} ${need} 级` };
      }
    }
  }
  if (p.flag && !state.flags[p.flag]) {
    return { ok: false, reason: "缺少必要物品" };
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

  const max = p.maxProgress ?? 100;
  const cur = projectProgress(state, p.id);
  const devEff = facilityEfficiency(state, "dev");
  const next = Math.min(max, cur + p.progressPerAction * devEff);
  state.career.projects[p.id] = next;

  const completed = next >= max;
  const eff = completed ? mergeEffects(p.effects, p.reward) : p.effects;
  applyEffects(state, eff, p.icon);
  if (completed) {
    pushLog(state, "🎉", `【${p.name}】大功告成！`);
  }
  return { ok: true, completed, deltas: collectDeltas(eff) };
}
