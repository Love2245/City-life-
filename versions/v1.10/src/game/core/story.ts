/**
 * v1.0 剧情模式核心逻辑：来城之因 → 目标 → 五阶段 → 障碍卡 → 终局。
 *
 * 机制概览：
 * - 每局随机一条主线（六选一），家庭固定赤贫（唯一劳动力 + 爱赌的家人）；
 * - 每 5~9 天抽一次卡：一张"保底推进卡"（当前阶段主线卡）+ 一张随机卡
 *   （中立卡 / 本线障碍卡 / 阶段≥2 后低概率混入其他线障碍卡）；
 * - 每张卡 2~4 个解法（屈服 / 砸钱 / 无视 / 特殊），至少 2 个非无视解可行才可抽（杜绝死局）；
 * - 过期未决 → 失约：记 failedObligations + ignoreConsequence + 良心下降；
 * - 良心值 -10..10 影响噩梦事件与终局评级；
 * - 终局：五阶段推进完成后按「目标达成 + 良心 + 关系 + 健康」三档/四档判定，
 *   走 checkEnding（endings.json 的 story 条件）触发，接回忆录与命运点结算。
 *
 * 依赖约束：本文件允许 import engine（与 contacts.ts 相同形态，time→story→engine→time 环在 ESM 下可行）。
 */
import type {
  ActiveStoryCard,
  Allocation,
  Effects,
  GameState,
  ResultDelta,
  StoryCardDef,
  StoryKind,
  StorySolution,
  StorySolutionReq,
  StoryState,
} from "../types";
import { applyEffects, collectDeltas, pushLog } from "../engine";
import { gameDay } from "./calendar";
import { weightedDraw, randomInt } from "../rng";
import { ARC_MAP, ARC_STAGE_CARDS, CARDS, CARD_MAP, type StoryArcDef } from "../data/story";
import { getNpcDef } from "./npcs";

/** 剧情模式固定分配（赤贫出身，10 点配额） */
export const STORY_DEFAULT_ALLOCATION: Allocation = {
  money: 3,
  stamina: 3,
  intelligence: 2,
  charm: 2,
  items: 0,
};

/** 失败结局的失约次数阈值 */
export const STORY_FAIL_LIMIT = 3;
/** 良心范围 */
export const CONSCIENCE_MIN = -10;
export const CONSCIENCE_MAX = 10;

export function emptyStoryState(): StoryState {
  return {
    arc: null,
    stage: 0,
    goalFund: 0,
    conscience: 0,
    failedObligations: 0,
    activeCards: [],
    doneCards: [],
    gambler: null,
    nextDrawDay: 4,
    finalTriggered: false,
    introSeen: false,
  };
}

function clampConscience(v: number): number {
  return Math.max(CONSCIENCE_MIN, Math.min(CONSCIENCE_MAX, v));
}

/** 随机抽一条主线 */
export function randomArc(state: GameState): StoryKind {
  const picked = weightedDraw(state.rng, ARC_MAP_ALL().map((a) => ({ item: a.id, weight: 1 })));
  return picked ?? "repay_debt";
}

function ARC_MAP_ALL(): StoryArcDef[] {
  return Object.values(ARC_MAP) as StoryArcDef[];
}

/** 开启剧情模式（固定赤贫家庭），返回主线定义供开场展示 */
export function startStory(state: GameState, arc?: StoryKind): StoryArcDef {
  const id = arc ?? randomArc(state);
  state.mode = "story";
  state.family = "destitute";
  state.story = emptyStoryState();
  state.story.arc = id;
  return ARC_MAP[id];
}

/** 是否处于进行中的剧情模式 */
export function isStoryActive(state: GameState): boolean {
  return state.mode === "story" && !!state.story.arc && !state.endingId;
}

/** 当前主线定义 */
export function currentArc(state: GameState): StoryArcDef | undefined {
  return state.story.arc ? ARC_MAP[state.story.arc] : undefined;
}

/* ==================== 可行性 ==================== */

function attrValue(state: GameState, key: string): number {
  const attrs = state.player.attrs as unknown as Record<string, number>;
  const stats = state.player.stats as unknown as Record<string, number>;
  return attrs[key] ?? stats[key] ?? 0;
}

export function storyReqMet(state: GameState, r?: StorySolutionReq): { ok: boolean; reason?: string } {
  if (!r) return { ok: true };
  if (r.attr) {
    for (const [k, need] of Object.entries(r.attr)) {
      if (attrValue(state, k) < (need ?? 0)) return { ok: false, reason: `${k}不足` };
    }
  }
  if (r.skill) {
    for (const [k, need] of Object.entries(r.skill)) {
      if (state.player.skills[k as keyof typeof state.player.skills] < (need ?? 0)) {
        return { ok: false, reason: "技能不足" };
      }
    }
  }
  if (r.money != null && state.player.money < r.money) return { ok: false, reason: "金钱不足" };
  if (r.fame != null && state.player.stats.fame < r.fame) return { ok: false, reason: "名声不足" };
  if (r.flag && !state.flags[r.flag]) return { ok: false, reason: "条件未满足" };
  if (r.item && (state.inventory[r.item] ?? 0) < 1) return { ok: false, reason: "缺少物品" };
  if (r.contact && !state.contacts.some((c) => c.id === r.contact)) {
    return { ok: false, reason: "还不认识这个人" };
  }
  if (r.npc) {
    const rel = state.relationships.find((x) => x.npcId === r.npc);
    // v1.06：告知 NPC 名字、常驻地点与当前/目标好感
    const def = getNpcDef(r.npc);
    const name = def?.name ?? r.npc;
    const loc = def?.meetLocation ?? "";
    const locHint = loc ? `（常去 ${loc}）` : "";
    const curAff = rel?.affinity ?? 0;
    if (!rel || rel.state === "blocked") return { ok: false, reason: `还不认识${name}${locHint}` };
    if (r.npcAffinity != null && rel.affinity < r.npcAffinity) {
      return { ok: false, reason: `${name} 好感不足（${curAff}/${r.npcAffinity}）${locHint}` };
    }
  }
  if (r.conscienceMin != null && state.story.conscience < r.conscienceMin) {
    return { ok: false, reason: "良心不足" };
  }
  if (r.conscienceMax != null && state.story.conscience > r.conscienceMax) {
    return { ok: false, reason: "良心过高，下不去手" };
  }
  if (r.stageMin != null && state.story.stage < r.stageMin) return { ok: false, reason: "时机未到" };
  if (r.doneCard && !state.story.doneCards.includes(r.doneCard)) {
    return { ok: false, reason: "前置事件未完成" };
  }
  return { ok: true };
}

export function solutionFeasible(
  state: GameState,
  _card: StoryCardDef,
  sol: StorySolution,
): { ok: boolean; reason?: string } {
  return storyReqMet(state, sol.requires);
}

/** 非"无视"的可行解数量（抽卡前校验，至少 2 条防死局） */
export function feasibleSolutionCount(state: GameState, card: StoryCardDef): number {
  return card.solutions.filter((s) => s.kind !== "ignore" && solutionFeasible(state, card, s).ok).length;
}

/** 卡是否可抽（窗口 / 前置 / 未处理 / 可行解 ≥2） */
export function cardDrawable(state: GameState, card: StoryCardDef): boolean {
  const st = state.story;
  const today = gameDay(state.time);
  if (today < card.window[0] || today > card.window[1]) return false;
  if (st.doneCards.includes(card.id)) return false;
  if (st.activeCards.some((a) => a.cardId === card.id && a.status === "active")) return false;
  if (!storyReqMet(state, card.requires).ok) return false;
  // 主线推进卡 / 核心剧情卡：至少 1 条可行解即可；其余随机卡要求 ≥2 条防死局
  const isProgress = card.arc === st.arc && card.stage != null;
  return feasibleSolutionCount(state, card) >= (isProgress || card.always ? 1 : 2);
}

/** 把卡加入进行中（幂等） */
function queueCard(state: GameState, card: StoryCardDef): boolean {
  const st = state.story;
  if (st.activeCards.some((a) => a.cardId === card.id && a.status === "active")) return false;
  const today = gameDay(state.time);
  st.activeCards.push({
    cardId: card.id,
    triggeredDay: today,
    deadlineDay: today + card.deadlineDays,
    status: "active",
  });
  pushLog(state, card.icon, `【${card.title}】限期 ${card.deadlineDays} 天内处理，打开手机查看详情`);
  if (card.id === "neutral_gambler_arrives") {
    st.gambler = { sinceDay: today, deadlineDay: today + card.deadlineDays, state: "active" };
  }
  return true;
}

function unlockCards(state: GameState, ids: string[]): void {
  for (const id of ids) state.flags[`story_unlocked_${id}`] = true;
}

/* ==================== 抽卡 ==================== */

export function drawStoryCards(state: GameState): void {
  const st = state.story;
  if (!st.arc) return;
  const today = gameDay(state.time);

  // 1) 保底：当前阶段推进卡（未完成则必抽）
  const stageCardId = ARC_STAGE_CARDS[st.arc][Math.min(4, st.stage)];
  const stageCard = stageCardId ? CARD_MAP[stageCardId] : undefined;
  if (stageCard && cardDrawable(state, stageCard)) queueCard(state, stageCard);

  // 2) 随机：中立卡 + 本线障碍卡 +（阶段≥2 混入其他线障碍卡，低权重）
  const candidates: StoryCardDef[] = CARDS.filter((c) => {
    if (!cardDrawable(state, c)) return false;
    if (!c.arc) return true; // 中立卡
    if (c.arc === st.arc) return true; // 本线障碍
    return st.stage >= 2; // 其他线障碍：阶段 2 起混入
  });
  if (candidates.length > 0) {
    const weighted = candidates.map((c) => ({
      item: c,
      weight: c.arc && c.arc !== st.arc ? (c.weight ?? 10) * 0.3 : (c.weight ?? 10),
    }));
    const picked = weightedDraw(state.rng, weighted);
    if (picked) queueCard(state, picked);
  }

  st.nextDrawDay = today + 5 + randomInt(state.rng, 0, 4);
}

/* ==================== 解决 / 失约 ==================== */

function applyCardEffects(state: GameState, eff: Effects | undefined, icon: string): ResultDelta[] {
  if (!eff) return [];
  applyEffects(state, eff, icon);
  return collectDeltas(eff);
}

/** 解决一张进行中的卡 */
export function resolveStoryCard(
  state: GameState,
  activeId: string,
  solutionIdx: number,
): { ok: boolean; reason?: string; deltas?: ResultDelta[]; completed?: boolean } {
  const st = state.story;
  const act = st.activeCards.find((a) => a.cardId === activeId && a.status === "active");
  if (!act) return { ok: false, reason: "这件事已经处理或过期了" };
  const card = CARD_MAP[act.cardId];
  if (!card) return { ok: false, reason: "未知事项" };
  const sol = card.solutions[solutionIdx];
  if (!sol) return { ok: false, reason: "未知解法" };
  const check = solutionFeasible(state, card, sol);
  if (!check.ok) return { ok: false, reason: check.reason ?? "条件未满足" };

  act.status = "resolved";
  act.solutionKind = sol.kind;
  if (!st.doneCards.includes(card.id)) st.doneCards.push(card.id);

  const deltas: ResultDelta[] = [];
  deltas.push(...applyCardEffects(state, sol.effects, card.icon));
  if (sol.goal) {
    st.goalFund += sol.goal;
    deltas.push({ key: "goal", label: "寄回家", value: sol.goal });
  }
  if (sol.conscience) {
    st.conscience = clampConscience(st.conscience + sol.conscience);
    deltas.push({ key: "conscience", label: "良心", value: sol.conscience });
  }
  if (sol.log) pushLog(state, card.icon, sol.log);
  if (sol.unlock) unlockCards(state, sol.unlock);

  // 赌鬼离场
  if (card.id === "neutral_gambler_arrives") st.gambler = null;

  // 主线推进卡：仅当前阶段卡才能推进阶段（v1.06：旧阶段卡重抽不再跳阶段）
  let completed = false;
  if (card.arc === st.arc && card.stage != null) {
    if (card.stage === st.stage) {
      const arc = ARC_MAP[st.arc];
      st.stage = Math.min(4, st.stage + 1);
      if (st.stage <= 4) {
        pushLog(state, "📜", `主线推进：「${arc.stages[st.stage - 1]}」→「${arc.stages[st.stage]}」`);
      }
    }
    if (card.stage >= 4) {
      st.finalTriggered = true;
      completed = true;
      pushLog(state, "🎬", "主线进入终局——该了结来城里时的那件事了");
    }
  }

  return { ok: true, deltas, completed };
}

/** 到期未处理 → 失约 */
function failStoryCard(state: GameState, act: ActiveStoryCard): void {
  const st = state.story;
  const card = CARD_MAP[act.cardId];
  if (!card) {
    act.status = "failed";
    return;
  }
  act.status = "failed";
  st.failedObligations++;
  const con = card.ignoreConsequence?.conscience ?? -1;
  st.conscience = clampConscience(st.conscience + con);
  applyCardEffects(state, card.ignoreConsequence?.effects, card.icon);
  if (card.ignoreConsequence?.log) pushLog(state, "⚠️", card.ignoreConsequence.log);
  if (card.ignoreConsequence?.unlock) unlockCards(state, card.ignoreConsequence.unlock);
  if (card.id === "neutral_gambler_arrives") st.gambler = null;
  // v1.065：阶段卡失约 = 主线永久失败，触发终局（不进 doneCards，给玩家明确的失败原因）
  const isStageCard = card.arc === st.arc && card.stage === st.stage;
  if (isStageCard) {
    st.finalTriggered = true;
    pushLog(state, "💔", `主线阶段「${card.title}」逾期未决——你没能扛住来城里时的那份责任，故事到此为止`);
  } else if (!st.doneCards.includes(card.id)) {
    st.doneCards.push(card.id);
  }
  pushLog(state, "⏰", `「${card.title}」逾期未决，你失约了一次（已失约 ${st.failedObligations}/${STORY_FAIL_LIMIT} 次）`);
}

/** 每晚结算：失约 / 赌鬼开销 / 良心噩梦 / 抽卡 / 超时终局 */
export function tickStory(state: GameState): void {
  if (!isStoryActive(state)) return;
  const st = state.story;
  const today = gameDay(state.time);

  // 1) 到期未决
  for (const act of [...st.activeCards]) {
    if (act.status === "active" && today >= act.deadlineDay) failStoryCard(state, act);
  }

  // 2) 赌鬼日常开销（吃你的、喝你的）
  const gAct = st.activeCards.find((a) => a.cardId === "neutral_gambler_arrives" && a.status === "active");
  if (gAct) {
    const drain = Math.min(50, state.player.money);
    state.player.money -= drain;
    state.player.attrs.mood = Math.max(0, state.player.attrs.mood - 2);
    if ((today - gAct.triggeredDay) % 2 === 0) {
      pushLog(state, "🎲", `二叔又出去"手气好"了一圈，你的钱少了 ${drain} 元`);
    }
  }

  // 3) 良心噩梦（跨过阈值时提醒一次）
  if (st.conscience <= -5 && !state.flags["story_nightmare_warned"]) {
    state.flags["story_nightmare_warned"] = true;
    state.player.attrs.mood = Math.max(0, state.player.attrs.mood - 3);
    pushLog(state, "🌒", "夜里你梦见那些被你辜负的人，醒来一身冷汗（良心太低了，心情 -3）");
  }

  // 4) 抽卡
  if (today >= st.nextDrawDay) drawStoryCards(state);

  // 5) 失约满 3 次 → 终局（失败）
  if (st.failedObligations >= STORY_FAIL_LIMIT && !st.finalTriggered) {
    st.finalTriggered = true;
    pushLog(state, "💔", `你连续 ${STORY_FAIL_LIMIT} 次失约，再也担不起来城里时的那份承诺`);
  }

  // 6) 主线硬期限（v1.06：分线路配置，不再全局 330 天）
  const arc = currentArc(state);
  const deadline = arc?.deadlineDays ?? 330;
  if (today >= deadline && !st.finalTriggered) {
    st.finalTriggered = true;
    pushLog(state, "🕰️", `期限已到，你却没能了结来城里时的那件事——「${arc?.goal ?? ""}」`);
  }
}

/* ==================== 目标与终局 ==================== */

/** 主动寄钱回家：现金 → 目标资金（金钱型主线的自由度来源） */
export function remitToFamily(state: GameState, amount: number): { ok: boolean; reason?: string; deltas?: ResultDelta[] } {
  if (!isStoryActive(state)) return { ok: false, reason: "当前不在剧情模式" };
  const st = state.story;
  const arc = currentArc(state);
  if (!arc || arc.goalTotal <= 0) return { ok: false, reason: "这条主线不需要寄钱" };
  const amt = Math.max(0, Math.floor(amount));
  if (amt <= 0) return { ok: false, reason: "金额无效" };
  if (state.player.money < amt) return { ok: false, reason: "现金不足" };
  state.player.money -= amt;
  st.goalFund += amt;
  pushLog(state, "💌", `给家里寄了 ${amt} 元（目标资金 ${st.goalFund} 元）`);
  return {
    ok: true,
    deltas: [
      { key: "money", label: "金钱", value: -amt },
      { key: "goal", label: "寄回家", value: amt },
    ],
  };
}

/** 主线目标是否达成 */
export function arcGoalMet(state: GameState, arc?: StoryKind): boolean {
  const st = state.story;
  const a = arc ?? st.arc;
  if (!a) return false;
  switch (a) {
    case "repay_debt":
    case "grandma_op":
    case "brother_school":
      return st.goalFund >= ARC_MAP[a].goalTotal;
    case "return_glory":
      return st.goalFund >= ARC_MAP[a].goalTotal && state.player.stats.fame >= 30;
    case "learn_craft":
      return state.player.skills.cooking >= 5;
    case "seek_justice":
      return (
        !!state.flags["story_evidence_witness"] &&
        !!state.flags["story_evidence_ledger"] &&
        !!state.flags["story_evidence_bribe"]
      );
  }
  return false;
}

/** v1.06：目标未达成时给出具体缺口描述（供终局提示用） */
export function arcGoalGap(state: GameState, arc?: StoryKind): string | null {
  const st = state.story;
  const a = arc ?? st.arc;
  if (!a) return null;
  switch (a) {
    case "repay_debt":
    case "grandma_op":
    case "brother_school":
    case "return_glory": {
      const total = ARC_MAP[a].goalTotal;
      const gap = total - st.goalFund;
      if (gap <= 0) return null;
      return `目标还差 ${gap} 元——在任务栏「寄钱回家」凑齐`;
    }
    case "learn_craft": {
      const gap = 5 - state.player.skills.cooking;
      if (gap <= 0) return null;
      return `厨艺还差 ${gap} 级——多去厨房练手`;
    }
    case "seek_justice": {
      const missing: string[] = [];
      if (!state.flags["story_evidence_witness"]) missing.push("证人证词");
      if (!state.flags["story_evidence_ledger"]) missing.push("账本证据");
      if (!state.flags["story_evidence_bribe"]) missing.push("受贿证据");
      if (missing.length === 0) return null;
      return `缺少关键证据：${missing.join("、")}`;
    }
  }
}

/** 终局评级：目标 + 良心 + 关系 + 健康 → 写入 story 结局 flag（由 checkEnding 接住） */
export function decideStoryFinal(state: GameState): void {
  const st = state.story;
  if (!st.finalTriggered || state.endingId || st.finalEnding) return;
  const goalMet = arcGoalMet(state);
  const healthy = state.player.attrs.health >= 60 && state.player.attrs.mood >= 50;
  const hasDeepRelation = state.relationships.some((r) => r.affinity >= 80);

  let id: string;
  if (!goalMet || st.failedObligations >= STORY_FAIL_LIMIT) {
    id = "ending_story_flee";
    // v1.06：告知具体未达成原因
    const arc = currentArc(state);
    if (!goalMet && arc) {
      const gap = arcGoalGap(state, arc.id);
      if (gap) pushLog(state, "💔", gap);
    }
  } else if (st.conscience >= 4 && healthy && hasDeepRelation) {
    id = "ending_story_citizen";
  } else if (st.conscience >= 2) {
    id = "ending_story_honor";
  } else {
    id = "ending_story_home";
  }
  st.finalEnding = id;
  state.flags[`story_${id}`] = true;
}

/** 供 UI：当前进行中的人情债列表 */
export function activeStoryCards(state: GameState): Array<{ act: ActiveStoryCard; def: StoryCardDef }> {
  return state.story.activeCards
    .filter((a) => a.status === "active")
    .map((act) => ({ act, def: CARD_MAP[act.cardId] }))
    .filter((x) => !!x.def);
}

/* ==================== v1.01 流程指引辅助（供任务栏/简介页 UI 使用） ==================== */

/** 距离下次抽卡（来事）的天数；已到点返回 0 */
export function storyNextDrawIn(state: GameState): number {
  if (!isStoryActive(state)) return 0;
  const d = state.story.nextDrawDay - gameDay(state.time);
  return Math.max(0, d);
}

/** 主线硬期限剩余天数（超过则强制终局） */
export function storyDeadlineLeft(state: GameState): number {
  if (!isStoryActive(state)) return 0;
  const arc = currentArc(state);
  return Math.max(0, (arc?.deadlineDays ?? 330) - gameDay(state.time));
}

/** 当前阶段中文名（stage 0..4 → 五阶段之一） */
export function storyStageName(state: GameState): string {
  const arc = currentArc(state);
  if (!arc) return "";
  return arc.stages[Math.min(4, state.story.stage)] ?? "";
}

/** 当前阶段一句话提示：这一阶段该做什么（推进卡已处理 / 待处理时给出不同提示） */
export function storyStageHint(state: GameState): string {
  const st = state.story;
  const arc = currentArc(state);
  if (!arc) return "";
  const stageName = arc.stages[Math.min(4, st.stage)] ?? "";
  // 当前阶段推进卡是否已完成
  const stageCardId = ARC_STAGE_CARDS[st.arc!][Math.min(4, st.stage)];
  const done = stageCardId ? st.doneCards.includes(stageCardId) : false;
  if (done) {
    if (st.stage >= 4) return "五阶段已全部推进，等待终局判定";
    const next = arc.stages[Math.min(4, st.stage + 1)];
    return `「${stageName}」已了结，下一步：${next}`;
  }
  // 是否有进行中的阶段卡
  const pending = st.activeCards.some((a) => a.cardId === stageCardId && a.status === "active");
  if (pending) {
    return `当前阶段「${stageName}」：有一件事限期待办，打开手机【人情债】处理`;
  }
  return `当前阶段「${stageName}」：过几天会来新事，先打工赚钱 / 学技能 / 交朋友做准备`;
}

/**
 * 主线目标统一进度 0-100（各类目标通用：金钱 / 厨艺 / 证据 / 名声）。
 * 非剧情模式返回 0。
 */
export function storyGoalProgress(state: GameState): number {
  if (!isStoryActive(state)) return 0;
  const st = state.story;
  const a = st.arc;
  if (!a) return 0;
  switch (a) {
    case "repay_debt":
    case "grandma_op":
    case "brother_school":
      return goalTotalOf(a) > 0 ? clampPct(st.goalFund / goalTotalOf(a)) : 0;
    case "return_glory": {
      const moneyPct = goalTotalOf(a) > 0 ? st.goalFund / goalTotalOf(a) : 0;
      const famePct = Math.min(1, state.player.stats.fame / 30);
      return clampPct((moneyPct + famePct) / 2);
    }
    case "learn_craft":
      return clampPct(state.player.skills.cooking / 5);
    case "seek_justice": {
      const have = [
        !!state.flags["story_evidence_witness"],
        !!state.flags["story_evidence_ledger"],
        !!state.flags["story_evidence_bribe"],
      ].filter(Boolean).length;
      return clampPct(have / 3);
    }
    default:
      return 0;
  }
}

/** 主线目标达成情况的文字描述（如「已寄 3500/20000」/「厨艺 3/5」） */
export function storyGoalDesc(state: GameState): string {
  const st = state.story;
  const a = st.arc;
  if (!a) return "";
  switch (a) {
    case "repay_debt":
    case "grandma_op":
    case "brother_school":
      return `已寄 ${st.goalFund}/${goalTotalOf(a)} 元`;
    case "return_glory":
      return `已存 ${st.goalFund}/${goalTotalOf(a)} 元 · 名声 ${state.player.stats.fame}/30`;
    case "learn_craft":
      return `厨艺 ${state.player.skills.cooking}/5 级`;
    case "seek_justice":
      return `已掌握证据 ${["story_evidence_witness", "story_evidence_ledger", "story_evidence_bribe"].filter((f) => !!state.flags[f]).length}/3`;
    default:
      return "";
  }
}

/** 主线是否已达成（终局判定的前提；非剧情模式返回 false） */
export function storyGoalMet(state: GameState): boolean {
  return isStoryActive(state) && arcGoalMet(state);
}

function goalTotalOf(a: StoryKind): number {
  return ARC_MAP[a]?.goalTotal ?? 0;
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v * 100)));
}

export { ARC_MAP, ARC_STAGE_CARDS, CARDS, CARD_MAP };
export type { StoryArcDef, StoryKind, StoryCardDef };
