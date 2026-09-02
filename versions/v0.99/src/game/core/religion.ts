/**
 * 宗教支线互斥系统（v0.98）：
 * - 教堂线：参加弥撒 → 累计 5 次 → 洗礼 → 教堂完成，禁止进入寺庙。
 * - 寺庙线：做义工 → 累计 5 次 → 佛法会 → 再累计 5 次 → 三宝 → 寺庙完成，禁止进入教堂。
 * 纯逻辑层，依赖 flags（全 number 语义）。
 */
import type { GameState } from "../types";
import { pushLog } from "../engine";

/**
 * 排队一个必定触发的事件。
 * 这里不 import events.ts，避免 actions → religion → events → actions 的循环依赖，
 * 直接写 state 字段（rollEvent 会优先消费）。
 */
function queueEvent(state: GameState, eventId: string): void {
  if (!state.pendingEvents) state.pendingEvents = [];
  if (!state.pendingEvents.includes(eventId)) state.pendingEvents.push(eventId);
}

/* ==================== 教堂 ==================== */

/** 弥撒次数（≥5 解锁洗礼） */
const MASS_FOR_BAPTISM = 5;

/** 弥撒结算后调用 */
export function afterChurchMass(state: GameState): void {
  const count = (typeof state.flags.church_attended === "number" ? state.flags.church_attended : 0) + 1;
  state.flags.church_attended = count;
  pushLog(state, "⛪", `第 ${count} 次参加教堂弥撒`);

  if (!state.flags.church_baptized && count >= MASS_FOR_BAPTISM) {
    state.flags.church_baptized = true;
    pushLog(state, "✝️", "神父为你主持了洗礼——你正式成为了教会的一员。从此之后，寺庙对你关上了大门。");
  }

  // v0.981 弥撒散场后，教友们照例聚餐——必定触发（免费的一顿丰盛晚饭）
  queueEvent(state, "ev_church_fellowship");
}

/** 是否可以进入教堂（寺庙未完成、未洗礼前） */
export function canEnterChurch(state: GameState): boolean {
  if (state.flags.temple_done) return false;
  return true;
}

/** 是否已完成洗礼（不可逆） */
export function isChurchBaptized(state: GameState): boolean {
  return !!state.flags.church_baptized;
}

/* ==================== 寺庙 ==================== */

const VOLUNTEER_FOR_CEREMONY = 5;
const VOLUNTEER_FOR_TRIPLE = 10;

/** 义工结算后调用 */
export function afterTempleVolunteer(state: GameState): void {
  const count = (typeof state.flags.temple_volunteered === "number" ? state.flags.temple_volunteered : 0) + 1;
  state.flags.temple_volunteered = count;
  pushLog(state, "🛕", `第 ${count} 次在寺庙做义工`);

  if (!state.flags.temple_ceremony && count >= VOLUNTEER_FOR_CEREMONY) {
    state.flags.temple_ceremony = true;
    pushLog(state, "🙏", "住持为你举办了佛法会——你在众人见证下与佛结缘。");
  }
  if (!state.flags.temple_done && count >= VOLUNTEER_FOR_TRIPLE) {
    state.flags.temple_done = true;
    pushLog(state, "🪷", "住持授予你三宝，你已是佛门弟子。从此教堂对你关上了大门。");
  }
}

/** 是否可以进入寺庙（教堂未完成） */
export function canEnterTemple(state: GameState): boolean {
  if (state.flags.church_baptized) return false;
  return true;
}

/** 是否已完成三宝（不可逆） */
export function isTempleDone(state: GameState): boolean {
  return !!state.flags.temple_done;
}

/* ==================== 互斥检查（供 UI / 行动校验） ==================== */

/** 返回「禁止进入原因」或 null（可进入） */
export function religionBlockReason(
  state: GameState,
  locationId: string,
): string | null {
  if (locationId === "church" && state.flags.temple_done) {
    return "你已是佛门弟子，教堂大门紧闭。";
  }
  if (locationId === "temple" && state.flags.church_baptized) {
    return "你已受洗归主，寺庙与你无缘。";
  }
  return null;
}
