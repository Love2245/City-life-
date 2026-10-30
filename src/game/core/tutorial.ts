/**
 * 新手引导系统（v0.94 / Y3）。
 * 纯逻辑层：首日引导任务链（熟悉手机 → 吃饭 → 找工作 → 赚第一笔钱 → 睡一觉）。
 * 步骤完成 = 加入 state.tutorial.done；自动条件在 checkTutorialProgress 判定，
 * 挂点：engine.applyEffects 尾部（随结算自动推进）+ PhoneView 打开手机时手动完成首步。
 */
import type { GameState } from "../types";
import tutorialData from "../data/tutorial.json";
import locationData from "../data/locations.json";
import projectData from "../data/projects.json";

export interface TutorialStepDef {
  id: string;
  title: string;
  icon: string;
  desc: string;
  hint: string;
  optional?: boolean;
}

const tutorialSource = tutorialData as {
  steps: TutorialStepDef[];
  growthHints?: TutorialStepDef[];
};

export const TUTORIAL_STEPS: TutorialStepDef[] = tutorialSource.steps;
export const GROWTH_TUTORIAL_HINTS: TutorialStepDef[] = tutorialSource.growthHints ?? [];

export interface LongTermGoal {
  id: "settle" | "roots" | "career" | "life";
  title: string;
  icon: string;
  desc: string;
  /** 0..1, computed from the current save each time the target page is rendered. */
  progress: number;
  details: string[];
}

const CITY_CENTER_VISIT_IDS = new Set(
  (locationData as Array<{ id: string; regions?: string[] }>)
    // Shared locations (for example, a convenience store) do not prove which district was visited.
    .filter((location) => location.regions?.length === 1 && ["downtown_center", "downtown_commercial"].includes(location.regions[0]))
    .map((location) => location.id),
);

const PROJECT_DEFS = projectData as Array<{ id: string; maxProgress?: number; repeatable?: boolean }>;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function hasVisitedCityCenter(state: GameState): boolean {
  if (state.area === "downtown_center" || ["downtown_center", "downtown_commercial"].includes(state.region ?? "") || state.locationId === "downtown_center") {
    return true;
  }
  const visited = state.seen?.locationsVisited ?? [];
  return visited.some((id) => CITY_CENTER_VISIT_IDS.has(id));
}

function hasFriendRelationship(state: GameState): boolean {
  return (state.relationships ?? []).some((relation) =>
    relation.state !== "blocked" &&
    (relation.state === "friend" || relation.state === "close_friend" || relation.state === "lover" || relation.affinity >= 40),
  );
}

function growthHintCondition(state: GameState, id: string): boolean {
  switch (id) {
    case "growth_cash_1000":
      return (state.player?.money ?? 0) >= 1000;
    case "growth_downtown_center":
      return hasVisitedCityCenter(state);
    case "growth_skill_3":
      return Object.values(state.player?.skills ?? {}).some((level) => typeof level === "number" && level >= 3);
    case "growth_friend":
      return hasFriendRelationship(state);
    case "growth_ending":
      return !!state.endingId || (state.unlockedEndings?.length ?? 0) > 0;
    default:
      return false;
  }
}

/**
 * 认领下一条已满足条件的成长提示。每次最多返回一条，展示标记复用旧存档已有的 flags 容器。
 * 未完成九步新手引导时不触发，旧存档无需新增字段或迁移。
 */
export function claimNextGrowthHint(state: GameState): TutorialStepDef | null {
  if (!isTutorialDone(state)) return null;
  state.flags ??= {};
  for (const hint of GROWTH_TUTORIAL_HINTS) {
    const shownFlag = `growth_hint_seen_${hint.id}`;
    if (state.flags[shownFlag] === true || !growthHintCondition(state, hint.id)) continue;
    state.flags[shownFlag] = true;
    return hint;
  }
  return null;
}

/** 基于既有存档字段即时计算人生阶段目标；不写入目标进度，也不新增存档字段。 */
export function getLongTermGoals(state: GameState): LongTermGoal[] {
  const career = state.career;
  const living = state.living;
  const player = state.player;
  const skills = Object.values(player?.skills ?? {}).filter((level): level is number => typeof level === "number");
  const highestSkill = Math.max(0, ...skills);
  const fixedResidence = living?.mode === "own" || living?.mode === "lease";
  const stableIncome = !!career?.jobId || (career?.passiveIncome ?? 0) > 0;
  const relationships = state.relationships ?? [];
  const closeFriendIds = new Set(
    relationships
      .filter((relation) => relation.state !== "blocked" &&
        (relation.state === "close_friend" || relation.state === "lover" || relation.affinity >= 70))
      .map((relation) => relation.npcId),
  );
  const closeFriendCount = closeFriendIds.size;
  const flags = state.flags ?? {};
  const projects = career?.projects ?? {};
  const completedProject = PROJECT_DEFS.some((project) => {
    if (flags[`project_completed_${project.id}`] === true) return true;
    if (project.repeatable) return false;
    const maxProgress = project.maxProgress ?? 100;
    return (projects[project.id] ?? 0) >= maxProgress;
  });
  const cash = player?.money ?? 0;
  const fame = player?.stats?.fame ?? 0;
  const ownedHome = living?.mode === "own";

  return [
    {
      id: "settle",
      title: "站稳脚跟",
      icon: "🏠",
      desc: "建立稳定收入，住进固定住所",
      progress: (Number(stableIncome) + Number(fixedResidence)) / 2,
      details: [
        `稳定收入：${stableIncome ? "已达成" : "入职或发展持续收入"}`,
        `固定住所：${fixedResidence ? "已达成" : "签租约或买下住房"}`,
      ],
    },
    {
      id: "roots",
      title: "在城市扎根",
      icon: "🌳",
      desc: "拥有自己的房子，结交三位挚友",
      progress: (Number(ownedHome) + clamp01(closeFriendCount / 3)) / 2,
      details: [
        `自有住房：${ownedHome ? "已达成" : "买下一处产权房"}`,
        `挚友：${Math.min(closeFriendCount, 3)}/3`,
      ],
    },
    {
      id: "career",
      title: "事业有成",
      icon: "🚀",
      desc: "精进一项技能，并完成创业项目",
      progress: (clamp01(highestSkill / 5) + Number(completedProject)) / 2,
      details: [
        `最高技能：${Math.min(highestSkill, 5)}/5 级`,
        `完成创业项目：${completedProject ? "已达成" : "尚未完成"}`,
      ],
    },
    {
      id: "life",
      title: "活出个人样",
      icon: "✨",
      desc: "积累存款与名声，走出自己的生活方式",
      progress: (clamp01(cash / 10_000) + clamp01(fame / 100)) / 2,
      details: [
        `现金：¥${Math.max(0, Math.floor(cash))}/¥10,000`,
        `名声：${Math.max(0, Math.floor(fame))}/100`,
      ],
    },
  ];
}

/** 是否已完成全部引导步骤 */
export function isTutorialDone(state: GameState): boolean {
  return TUTORIAL_STEPS.every((s) => s.optional || state.tutorial.done.includes(s.id));
}

/** 当前激活步骤（第一个未完成的；全部完成返回 null） */
export function currentTutorialStep(state: GameState): { index: number; def: TutorialStepDef } | null {
  for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
    if (!TUTORIAL_STEPS[i].optional && !state.tutorial.done.includes(TUTORIAL_STEPS[i].id)) {
      return { index: i, def: TUTORIAL_STEPS[i] };
    }
  }
  return null;
}

/** 手动完成一步（UI 交互触发，如打开手机） */
export function completeTutorialStep(state: GameState, id: string): boolean {
  if (!TUTORIAL_STEPS.some((s) => s.id === id)) return false;
  if (state.tutorial.done.includes(id)) return false;
  state.tutorial.done.push(id);
  state.tutorial.activeStep = TUTORIAL_STEPS.findIndex((s) => s.id === id) + 1;
  return true;
}

/**
 * 自动判定条件完成的步骤（随结算调用），返回本次新完成的 id 列表（供 UI toast）。
 * 各步骤完成条件（基于既有 flags / 状态，避免额外状态字段）：
 *  - open_phone：无自动条件（由手机打开动作完成）
 *  - eat_meal：当日进食过（ateToday，engine.applyEffects 写）
 *  - commute_once：成功移动到过一个地点（commuted_once）
 *  - find_job：已入职或曾工作（career.jobId 或 ever_worked）
 *  - work_once：累计完成过工作（jobs_done_count ≥ 1）
 *  - save_game：写入过自动/手动存档（saved_once）
 *  - care_cat：仅在玩家已有猫并成功照顾后完成；可选，不阻塞新手主线
 *  - socialize：搭话、聊天或联系过他人（socialized_once）
 *  - rest_well：睡过觉或从晕倒中恢复（slept_once / collapsed_once）
 */
export function checkTutorialProgress(state: GameState): string[] {
  const newly: string[] = [];
  // 用实时数组判断（同一调用内新完成的前置步骤立即可见，支持链式推进）
  const has = (id: string) => state.tutorial.done.includes(id) || newly.includes(id);
  if (has("open_phone") && !has("eat_meal") && state.flags["ateToday"] === true) {
    newly.push("eat_meal");
  }
  if (has("eat_meal") && !has("commute_once") && state.flags["commuted_once"] === true) {
    newly.push("commute_once");
  }
  if (has("commute_once") && !has("find_job")) {
    const worked = state.career.jobId !== null || state.flags["ever_worked"] === true;
    if (worked) newly.push("find_job");
  }
  if (has("find_job") && !has("work_once")) {
    const count = typeof state.flags["jobs_done_count"] === "number" ? (state.flags["jobs_done_count"] as number) : 0;
    if (count >= 1) newly.push("work_once");
  }
  if (has("work_once") && !has("save_game") && state.flags["manual_saved_once"] === true) {
    newly.push("save_game");
  }
  if (has("save_game") && !has("care_cat") && state.flags["cat_cared_once"] === true) {
    newly.push("care_cat");
  }
  if (has("save_game") && !has("socialize") && state.flags["socialized_once"] === true) {
    newly.push("socialize");
  }
  if (has("socialize") && !has("rest_well") &&
    (state.flags["slept_once"] === true || state.flags["collapsed_once"] === true)) {
    newly.push("rest_well");
  }
  for (const id of newly) {
    state.tutorial.done.push(id);
  }
  const idx = currentTutorialStep(state);
  state.tutorial.activeStep = idx ? idx.index : -1; // -1 = 全部完成
  return newly;
}

/** 首日是否还未开始引导（供开局提示） */
export function shouldShowTutorialTip(state: GameState): boolean {
  return !isTutorialDone(state) && !state.tutorial.done.includes("open_phone");
}
