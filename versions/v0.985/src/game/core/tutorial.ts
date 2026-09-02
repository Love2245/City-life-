/**
 * 新手引导系统（v0.94 / Y3）。
 * 纯逻辑层：首日引导任务链（熟悉手机 → 吃饭 → 找工作 → 赚第一笔钱 → 睡一觉）。
 * 步骤完成 = 加入 state.tutorial.done；自动条件在 checkTutorialProgress 判定，
 * 挂点：engine.applyEffects 尾部（随结算自动推进）+ PhoneView 打开手机时手动完成首步。
 */
import type { GameState } from "../types";
import tutorialData from "../data/tutorial.json";

export interface TutorialStepDef {
  id: string;
  title: string;
  icon: string;
  desc: string;
  hint: string;
}

export const TUTORIAL_STEPS: TutorialStepDef[] = (tutorialData as { steps: TutorialStepDef[] }).steps;

/** 是否已完成全部引导步骤 */
export function isTutorialDone(state: GameState): boolean {
  return TUTORIAL_STEPS.every((s) => state.tutorial.done.includes(s.id));
}

/** 当前激活步骤（第一个未完成的；全部完成返回 null） */
export function currentTutorialStep(state: GameState): { index: number; def: TutorialStepDef } | null {
  for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
    if (!state.tutorial.done.includes(TUTORIAL_STEPS[i].id)) {
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
 *  - find_job：已入职或曾工作（career.jobId 或 ever_worked）
 *  - work_once：累计完成过工作（jobs_done_count ≥ 1）
 *  - rest_well：睡过觉（slept_once，time.sleepSettlement 写）
 */
export function checkTutorialProgress(state: GameState): string[] {
  const newly: string[] = [];
  // 用实时数组判断（同一调用内新完成的前置步骤立即可见，支持链式推进）
  const has = (id: string) => state.tutorial.done.includes(id) || newly.includes(id);
  if (has("open_phone") && !has("eat_meal") && state.flags["ateToday"] === true) {
    newly.push("eat_meal");
  }
  if (has("eat_meal") && !has("find_job")) {
    const worked = state.career.jobId !== null || state.flags["ever_worked"] === true;
    if (worked) newly.push("find_job");
  }
  if (has("find_job") && !has("work_once")) {
    const count = typeof state.flags["jobs_done_count"] === "number" ? (state.flags["jobs_done_count"] as number) : 0;
    if (count >= 1) newly.push("work_once");
  }
  if (has("work_once") && !has("rest_well") && state.flags["slept_once"] === true) {
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
