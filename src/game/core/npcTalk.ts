/**
 * 都市生活 v1.43 — NPC 多节点会话与统一结算。
 *
 * 会话期间只改变 NpcConversationSession，不直接改变 GameState。
 * 结束时在状态副本中完成所有校验和效果，再由 UI 通过 replaceState 提交。
 */
import type {
  GameState,
  RelationState,
  ResultDelta,
} from "../types";
import {
  findRelationship,
  ensureRelationship,
  addAffinity,
  currentState,
  STATE_LABEL,
} from "./relationships";
import { maybeAddNpcContact } from "./contacts";
import { recordNpcDialogueDay } from "./npcFamiliarity";
import { npcFirstEncounterNode } from "../data/npcFirstEncounters";
import {
  getNpcDef,
  npcNick,
  npcKnownName,
  npcDescriptor,
  npcConversationName,
  npcPresenceAt,
  npcAtLocation,
  allNpcs,
  type NpcTalkNode,
  type NpcTalkOption,
  type NpcTalkStageKey,
} from "./npcs";
import { addItem, getItem } from "./items";
import { applyEffects, pushLog } from "../engine";
import { advanceHours } from "./time";
import { gameDay, weekdayOf } from "./calendar";
import {
  GREETING_TIME_COST,
  greetedToday,
  markGreeted,
  npcGreetingNode,
} from "../data/npcGreetings";
import {
  recordRemasterConversation,
  remasterConversationStart,
  remasterDailyConversationStart,
  remasterEligibleTopics,
  remasterScene,
  remasterSceneReward,
  hintFor,
  type NpcRemasterSceneKind,
} from "../data/npcDialogueRemaster";
import { outfitContextForNpc, type OutfitContext } from "./npcOutfits";
import { outfitOccasionFitForState } from "./playerOutfitResolver";
import { npcChatBoundaryLine } from "../data/npcChatBoundaries";
import {availableNpcGroupScenes,npcGroupScene,npcGroupSceneAvailable,npcGroupDayFlag} from '../data/npcGroupScenes';
import type {NpcSpeech} from './npcDialoguePlayback';
import { npcOrdinaryAppearanceUnlocked, INTRO_FIRST_COMPLETE, INTRO_SECOND_COMPLETE, LOUNGE_BEER_COUPON } from '../data/npcIntroductionProgress';
import { npcIntroduction, npcIntroductionAvailable, npcIntroductionNode } from '../data/npcSharedIntroductions';
import locations from '../data/locations.json';
import {NPC_DIALOGUE_BENEFITS,npcDialogueBenefitClaimed,recordNpcDialogueBenefit} from '../data/npcDialogueBenefits';
import {NPC_CONTEXT_DIALOGUES,npcContextDialogueStart,npcDialogueActivity,recordNpcContextDialogue} from '../data/npcContextDialogues';
import { getNpcTaskTopics, executeNpcTaskAction } from './npcTasks';
import type { NpcTaskTopic } from '../npcTaskTypes';

export type TalkKey = Exclude<NpcTalkStageKey, "meet">;
export type NpcConversationEntry = "meet" | "chat" | "formal" | "introduction";
export type NpcConversationEndReason = "complete" | "leave";
export type NpcConversationKind = NpcRemasterSceneKind | "legacy" | "greeting" | "limit" | "formal" | "group" | "introduction" | "context" | "task";

const AFFINITY_SESSION_MIN = -5;
const AFFINITY_SESSION_MAX = 5;

/** 每日完成三次正常聊天后提醒；第四次婉拒、第五次不满并扣好感，第六次起拒聊。 */
export const NPC_DAILY_CHAT_SOFT_LIMIT = 3;
export const NPC_DAILY_CHAT_HARD_LIMIT = 5;
const NPC_CHAT_LIMIT_NODE_ID = "daily_chat_limit";

function npcChatDayKey(npcId: string): string {
  return `npc_chat_day_${npcId}`;
}

function npcChatCountKey(npcId: string): string {
  return `npc_chat_count_${npcId}`;
}

function npcTalkCommitCursorKey(npcId: string): string {
  return `npc_talk_commit_cursor_${npcId}`;
}

function npcTalkCommitCursor(state: GameState, npcId: string): number {
  const value = state.flags[npcTalkCommitCursorKey(npcId)];
  return typeof value === "number" && Number.isSafeInteger(value) ? Math.max(0, value) : 0;
}

function sessionIdentity(state: GameState, npcId: string): Pick<NpcConversationSession, "sessionId" | "commitSequence"> {
  const commitSequence = npcTalkCommitCursor(state, npcId) + 1;
  return {
    sessionId: `npc-talk:${npcId}:${commitSequence}`,
    commitSequence,
  };
}

function recordSessionCommit(state: GameState, session: NpcConversationSession): void {
  if (!Number.isSafeInteger(session.commitSequence) || session.commitSequence < 1) return;
  const key = npcTalkCommitCursorKey(session.npcId);
  state.flags[key] = Math.max(npcTalkCommitCursor(state, session.npcId), session.commitSequence);
}

/** 读取同一 NPC 在当前绝对日已经完成的日常聊天次数；跨天自动视为 0。 */
export function npcChatCountToday(
  state: Pick<GameState, "flags" | "time">,
  npcId: string,
  today = gameDay(state.time),
): number {
  if (state.flags[npcChatDayKey(npcId)] !== today) return 0;
  const count = state.flags[npcChatCountKey(npcId)];
  return typeof count === "number" && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function recordNpcChat(state: GameState, npcId: string): void {
  const today = gameDay(state.time);
  // 先读取旧日期对应的值，再写入今天。若先覆盖日期标记，
  // npcChatCountToday 会误把昨天的次数当成今天的次数继续累加。
  const countToday = npcChatCountToday(state, npcId, today);
  state.flags[npcChatDayKey(npcId)] = today;
  state.flags[npcChatCountKey(npcId)] = countToday + 1;
}

/** 由关系状态/好感推导已认识 NPC 的对话档位。低于朋友仍使用相识内容。 */
function talkKeyOf(affinity: number, relationState?: RelationState): TalkKey {
  if (relationState === "lover") return "close_friend";
  if (affinity >= 70) return "close_friend";
  if (affinity >= 40) return "friend";
  return "acquaintance";
}

function stageOf(def: ReturnType<typeof getNpcDef>, key: NpcTalkStageKey) {
  return def?.talk?.[key];
}

function nodeOf(def: ReturnType<typeof getNpcDef>, key: NpcTalkStageKey, nodeId: string): NpcTalkNode | undefined {
  const stage = stageOf(def, key);
  return stage?.nodes[nodeId];
}

/** 当前地点在场、可被搭话/聊天的 NPC 列表（含关系状态）。 */
export interface PresentNpc {
  id: string;
  name: string;
  nick: string;
  displayName: string;
  descriptor: string;
  icon: string;
  /** 是否已结识（有 relationship 记录）。 */
  known: boolean;
  /** 当前关系档位中文（未结识显示「陌生人」）。 */
  stateLabel: string;
  affinity: number;
  /** v1.45 当前地点对应的 NPC 服装场景。 */
  outfitContext: OutfitContext;
}

export type NpcFormalTopicCategory = "delivery" | "active" | "story" | "commission" | "done" | "failed";

/** 由当前存档和场景实时生成的正式对话话题，不单独写入存档。 */
export interface NpcFormalTopic {
  id: string;
  category: NpcFormalTopicCategory;
  label: string;
  description: string;
  kind: "event" | "request" | "delivery" | "active";
  stageKey: TalkKey;
  nodeId?: string;
  sceneId?: string;
  groupSceneId?: string;
  text?: string;
  options?: NpcTalkOption[];
  npcTaskTopicId?: string;
  speeches?: readonly NpcSpeech[];
  artId?: string;
}

const FORMAL_TOPIC_ORDER: Record<NpcFormalTopicCategory, number> = {
  delivery: 0,
  active: 1,
  story: 2,
  commission: 3,
  done: 4,
  failed: 4,
};

export function presentNpcs(state: GameState): PresentNpc[] {
  const time = {
    ...state.time, seed: state.rng.seed, weekday: weekdayOf(state.time),
    hour: state.time.hour,
    minute: state.time.minute,
    regionId: state.region,
  };
  return allNpcs()
    .filter((n) => npcOrdinaryAppearanceUnlocked(state, n.id) && npcAtLocation(n, state.locationId, time))
    .map((n) => {
      const rel = findRelationship(state, n.id);
      const label = rel ? STATE_LABEL[currentState(rel) as RelationState] : "陌生人";
      const displayStage = rel ? talkKeyOf(rel.affinity, rel.state) : "meet";
      return {
        id: n.id,
        name: npcKnownName(n.id),
        nick: npcNick(n.id),
        displayName: rel ? npcConversationName(n.id, displayStage) : "？？？",
        descriptor: npcDescriptor(n.id),
        icon: n.icon ?? "🧑",
        known: !!rel,
        stateLabel: label,
        affinity: rel?.affinity ?? 0,
        outfitContext: outfitContextForNpc(n.id, state.locationId, time),
      };
    });
}





/** 仅用于拦截旧版本仍打开的会话；这些占位动作已不再发放或结算。 */
function isLegacyNpcRequest(option: NpcTalkOption): boolean {
  return !!(option.help || option.commission || option.cityCommissionId || option.cityCommissionDeliver);
}

/** 正式对话只办理委托；人物故事和生活片段统一从闲聊进入。 */
export function npcFormalTopics(state: GameState, npcId: string): NpcFormalTopic[] {
  const def = getNpcDef(npcId);
  const relationship = findRelationship(state, npcId);
  if (!def || !relationship || relationship.state === "blocked" || !npcOrdinaryAppearanceUnlocked(state, npcId)) return [];
  const stageKey = talkKeyOf(relationship.affinity, relationship.state);
  const topics: NpcFormalTopic[] = [];
  for (const topic of getNpcTaskTopics(state, npcId, 'formal')) {
    topics.push({ id: `task:${topic.id}`, npcTaskTopicId: topic.id,
      category: topic.category === 'history' ? (state.quests.find(q => q.npcTask?.taskId === topic.taskId)?.status === 'done' ? 'done' : 'failed') : topic.category === 'delivery' ? 'delivery' : topic.category === 'offer' ? 'commission' : 'active',
      kind: topic.category === 'delivery' ? 'delivery' : topic.category === 'offer' ? 'request' : 'active',
      stageKey, label: topic.title, description: topic.description, text: topic.text,
      options: taskTopicOptions(topic), speeches: topic.speeches, artId: topic.artId });
  }

  return topics.sort((a, b) => FORMAL_TOPIC_ORDER[a.category] - FORMAL_TOPIC_ORDER[b.category]);
}

function optionsForNode(
  state: GameState,
  _def: ReturnType<typeof getNpcDef>,
  _key: NpcTalkStageKey,
  node: NpcTalkNode,
  entry: NpcConversationEntry,
): NpcTalkOption[] {
  const visible = node.options.filter(option => npcTalkOptionAvailable(state, option));
  if (entry === "chat" && node.options.some(isLegacyNpcRequest)
    && (visible.length === 0 || visible.every(option => option.leave))) {
    visible.unshift({ label: "那我们聊点别的吧。", playerReply: "那我们聊点别的吧。", log: "你们转而聊了些日常话题。" });
  }
  return visible;
}

function textForVisibleOptions(
  _def: ReturnType<typeof getNpcDef>,
  _key: NpcTalkStageKey,
  node: NpcTalkNode,
  _options: NpcTalkOption[],
  entry: NpcConversationEntry,
): string {
  if (node.speeches) return node.text;
  if (entry === "chat" && node.options.some(isLegacyNpcRequest)
    && /帮|帮忙|搭把手|委托|安排|缺人|工作|活儿|接下|整理|宣传|布置/.test(node.text)) {
    return "你们转而聊了些日常话题。";
  }
  return node.text;
}

/** 对话视图（供 UI 渲染台词与选项）。 */
export interface NpcTalkView {
  npcId: string;
  name: string;
  nick: string;
  displayName: string;
  descriptor: string;
  /** 保留给旧列表调用方；全屏对话界面不把它当立绘显示。 */
  icon: string;
  stateLabel: string;
  affinity: number;
  tierKey: TalkKey;
  stageKey: NpcTalkStageKey;
  nodeId: string;
  text: string;
  options: NpcTalkOption[];
  conversationKind: NpcConversationKind;
  conversationTitle?: string;
  /** Stable cast order and explicit owners of each line in a shared scene. */
  participants?: readonly string[];
  presentParticipants?: readonly string[];
  participantNames?: Record<string, string>;
  speeches?: readonly NpcSpeech[];
}

/** 一次会话中已经选择、等待统一提交的选项。 */
export interface NpcConversationSelection {
  stageKey: NpcTalkStageKey;
  nodeId: string;
  option: NpcTalkOption;
  /** 经过本次会话 -5～+5 限幅后的实际好感变化。 */
  affinity: number;
}

export interface NpcConversationSession {
  npcId: string;
  /** 可随存档序列化的提交身份；游标写在 GameState.flags 中用于跨读档防重。 */
  sessionId: string;
  commitSequence: number;
  entry: NpcConversationEntry;
  /** 打开时锁定的关系档位；meet 是特殊初见阶段。 */
  lockedStage: NpcTalkStageKey;
  /** 开始时的实际关系快照；提交前要求关系未被其他操作改变。 */
  relationshipAtStart?: { affinity: number; state: RelationState };
  stageKey: NpcTalkStageKey;
  nodeId: string;
  /** 重制稿中的场景 id；缺省代表旧版兼容内容。 */
  sceneId?: string;
  groupSceneId?: string;
  introductionId?: string;
  introductionQuote?: string;
  /** 独立于故事进度的短场景池；只有完成一次交流才消耗本日片段。 */
  contextSceneId?: string;
  introductionAtStart?: { clock: string; locationId: string; regionId?: string; relationships: Record<string, { affinity: number; state: RelationState } | null> };
  groupAtStart?: {day:number;locationId:string;regionId?:string;relationships:Record<string,{affinity:number;state:RelationState}>};
  formalTopicId?: string;
  /** 正式话题可用临时台词和选项；不写入存档，只有提交后才应用实际效果。 */
  formalTitle?: string;
  formalText?: string;
  formalSpeeches?: readonly NpcSpeech[];
  formalOptions?: NpcTalkOption[];
  npcTaskTopicId?: string;
  npcTaskBranch?: string;
  artId?: string;
  /**
   * v1.43 每日首次问候：当天第一次搭话时用这个一次性节点取代常规日常池。
   * 只有一轮（选项均为结束型），因此不需要在阶段节点表里查后续。
   */
  greetingNode?: NpcTalkNode;
  encounterNode?: NpcTalkNode;
  encounterLocation?: string;
  /** 当天前 3 次正常聊天后，第四、五次使用不同的边界回应。 */
  chatLimitNotice?: "polite" | "upset";
  /** 用于阻止并发会话或重复提交多计一次聊天。 */
  chatDayAtStart?: number;
  chatCountAtStart?: number;
  /** v1.46 普通日常首节点偶尔显示的自然条件线索。 */
  hintText?: string;
  pending: NpcConversationSelection[];
  affinityDelta: number;
  progressed: boolean;
  status: "active" | "ended" | "cancelled";
  endReason?: NpcConversationEndReason;
}

export interface NpcConversationBeginResult {
  ok: boolean;
  reason?: string;
  session?: NpcConversationSession;
}

export interface NpcConversationAdvanceResult {
  ok: boolean;
  reason?: string;
  session?: NpcConversationSession;
}

export interface NpcConversationItemChange {
  id: string;
  name: string;
  value: number;
}

export interface NpcConversationSummary {
  endReason: NpcConversationEndReason;
  text: string;
  timeCost: number;
  affinityBefore: number;
  affinityAfter: number;
  affinityDelta: number;
  deltas: ResultDelta[];
  items: NpcConversationItemChange[];
  commissionTitles: string[];
  contactAdded: boolean;
  contactNames?: string[];
  artId?: string;
}

export interface NpcConversationCommitResult {
  ok: boolean;
  reason?: string;
  /** 成功时返回待由 UI 通过 replaceState 提交的完整状态副本。 */
  state?: GameState;
  summary?: NpcConversationSummary;
  text: string;
}

function cloneState(state: GameState): GameState {
  try {
    // GameState 多为纯数据；但当 state 是 Svelte 5 $state 代理时，
    // structuredClone 会因代理内部槽位而抛 DataCloneError（见 settle 调用链）。
    return structuredClone(state) as GameState;
  } catch {
    // 兜底：穿透 Svelte 代理做纯数据深拷贝（读代理属性得到普通值，递归重建普通对象）。
    // GameState 仅含纯数据（无 Set/Map/Date/函数），故可无损重建，且保留 undefined。
    return deepClonePlain(state);
  }
}

function deepClonePlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => deepClonePlain(v)) as unknown as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key in value as Record<string, unknown>) {
      out[key] = deepClonePlain((value as Record<string, unknown>)[key]);
    }
    return out as unknown as T;
  }
  return value;
}

function currentAffinity(state: GameState, npcId: string, def: ReturnType<typeof getNpcDef>): number {
  return findRelationship(state, npcId)?.affinity ?? def?.initialAffinity ?? 0;
}

function introductionClock(state: GameState): string {
  return `${gameDay(state.time)}:${state.time.hour}:${state.time.minute}`;
}

export function npcTalkOptionAvailable(state: GameState, option: NpcTalkOption): boolean {
  if (isLegacyNpcRequest(option)) return false;
  if(option.dialogueBenefitId&&npcDialogueBenefitClaimed(state,option.dialogueBenefitId))return false;
  if (option.requiresHeardFlag && state.flags[option.requiresHeardFlag] !== true) return false;
  const money = Math.max(0, Number.isFinite(state.player.money) ? state.player.money : 0);
  if (option.cashCondition?.minimum != null && money < option.cashCondition.minimum) return false;
  if (option.cashCondition?.below != null && money >= option.cashCondition.below) return false;
  if (option.cashQuoteCondition) {
    if (!/^[1-9]\d{0,309}$/.test(option.cashQuoteCondition.amount)) return false;
    const affordable = BigInt(Math.floor(money)) >= BigInt(option.cashQuoteCondition.amount);
    if (affordable !== option.cashQuoteCondition.affordable) return false;
  }
  return true;
}

export interface NpcCasualTopic { id: string; label: string; description: string; playerThought?: string }
export function npcCasualTopics(state: GameState, npcId: string): NpcCasualTopic[] {
  const rel = findRelationship(state, npcId);
  if (!rel || rel.state === "blocked" || !npcIsPresentAtCurrentLocation(state, npcId)) return [];
  return [
    ...getNpcTaskTopics(state, npcId, 'chat').map(topic => ({ id: `task:${topic.id}`, label: topic.title, description: topic.description, ...(topic.playerThought ? { playerThought: topic.playerThought } : {}) })),
    ...availableNpcGroupScenes(state,npcId).map(scene => ({ id: `group:${scene.id}`, label: `三人一起聊聊：${scene.title}`, description: scene.description })),
  ];
}

function taskTopicOptions(topic: NpcTaskTopic): NpcTalkOption[] {
  return topic.choices.map(choice => ({ label: choice.label, playerReply: choice.playerReply,
    npcTaskAction: choice.action, ...(choice.nextTopic ? { npcTaskNextTopic: choice.nextTopic } : {}), ...(choice.disabledReason ? { disabledReason: choice.disabledReason } : {}) }));
}

export function beginNpcIntroduction(state: GameState, sceneId: string): NpcConversationBeginResult {
  const scene = npcIntroduction(sceneId);
  if (!scene || !npcIntroductionAvailable(state, scene)) return { ok: false, reason: "这次相遇暂时无法开始" };
  const npcId = scene.participants[0];
  return { ok: true, session: { ...sessionIdentity(state, npcId), npcId, entry: "introduction", lockedStage: "meet", stageKey: "meet",
    nodeId: scene.start, introductionId: scene.id, introductionQuote: "100000",
    introductionAtStart: { clock: introductionClock(state), locationId: state.locationId, regionId: state.region,
      relationships: Object.fromEntries(scene.participants.map(id => { const r = findRelationship(state, id); return [id, r ? { affinity: r.affinity, state: r.state } : null]; })) },
    pending: [], affinityDelta: 0, progressed: false, status: "active" } };
}

/** 当前会话节点的渲染数据。 */
export function npcConversationView(
  state: GameState,
  session: NpcConversationSession,
): NpcTalkView | null {
  const def = getNpcDef(session.npcId);
  if (!def) return null;
  const rel = findRelationship(state, session.npcId);
  const stateLabel = session.entry === "meet"
    ? "初见"
    : rel
      ? STATE_LABEL[currentState(rel) as RelationState]
      : "相识";

  if (session.introductionId) {
    const scene = npcIntroduction(session.introductionId);
    if (!scene || !/^[1-9]\d{0,309}$/.test(session.introductionQuote ?? "")) return null;
    const node = npcIntroductionNode(scene, session.nodeId, session.introductionQuote);
    if (!node) return null;
    const named = session.introductionId === "M02" || /m1_(?:names|parting|invite|done)/.test(node.id);
    return { npcId: session.npcId, name: npcKnownName(session.npcId), nick: npcNick(session.npcId), displayName: named ? npcKnownName(session.npcId) : "衣着惹眼的青年",
      descriptor: npcDescriptor(session.npcId), icon: def.icon ?? "🧑", stateLabel: "初见", affinity: currentAffinity(state, session.npcId, def),
      tierKey: "acquaintance", stageKey: "meet", nodeId: node.id, text: node.speeches.map(s => s.text).join("\n"),
      options: node.options.filter(option => npcTalkOptionAvailable(state, option)), conversationKind: "introduction", conversationTitle: scene.title,
      participants: scene.participants, presentParticipants: node.presentParticipants, speeches: node.speeches,
      participantNames: Object.fromEntries(scene.participants.map(id => [id, named ? npcKnownName(id) : id === "npc_fan_kexi" ? "拿着旧笔的女孩" : "衣着惹眼的青年"])) };
  }

  if(session.groupSceneId){
    const scene=npcGroupScene(session.groupSceneId),node=scene?.nodes[session.nodeId];if(!scene||!node)return null;
    return{npcId:session.npcId,name:npcKnownName(session.npcId),nick:npcNick(session.npcId),displayName:npcConversationName(session.npcId,session.stageKey),descriptor:npcDescriptor(session.npcId),icon:def.icon??'🧑',stateLabel,affinity:currentAffinity(state,session.npcId,def),tierKey:session.stageKey==='meet'?'acquaintance':session.stageKey,stageKey:session.stageKey,nodeId:node.id,text:node.speeches.map(s=>s.text).join('\n'),options:node.options,conversationKind:'group',conversationTitle:scene.title,participants:scene.participants,speeches:node.speeches};
  }

  if (session.chatLimitNotice) {
    return {
      npcId: session.npcId,
      name: npcKnownName(session.npcId),
      nick: npcNick(session.npcId),
      displayName: npcConversationName(session.npcId, session.stageKey),
      descriptor: npcDescriptor(session.npcId),
      icon: def.icon ?? "🧑",
      stateLabel,
      affinity: currentAffinity(state, session.npcId, def),
      tierKey: session.stageKey === "meet" ? "acquaintance" : session.stageKey,
      stageKey: session.stageKey,
      nodeId: NPC_CHAT_LIMIT_NODE_ID,
      text: npcChatBoundaryLine(session.npcId, session.chatLimitNotice, currentAffinity(state, session.npcId, def)),
      options: [{ label: "（告辞。）", leave: true }],
      conversationKind: "limit",
    };
  }

  // 每日首次问候用一次性节点（不在阶段表里），其余走阶段节点表。
  const contextScene=session.contextSceneId?NPC_CONTEXT_DIALOGUES[session.contextSceneId]:undefined;
  const node = contextScene?.nodes[session.nodeId] ?? session.encounterNode ?? session.greetingNode ?? nodeOf(def, session.stageKey, session.nodeId);
  if (!node && !session.formalText) return null;
  const scene = remasterScene(session.npcId, session.sceneId);
  const options = session.formalOptions ?? optionsForNode(state, def, session.stageKey, node!, session.entry);
  let baseText = session.formalText ?? textForVisibleOptions(def, session.stageKey, node!, options, session.entry);
  const hintText = session.pending.length === 0 && !session.greetingNode ? session.hintText : undefined;
  let speeches = session.formalSpeeches ?? (!session.formalText && baseText === node?.text ? node?.speeches : undefined);
  if(session.entry==='chat'&&!contextScene&&!session.greetingNode&&scene?.kind==='daily'
    &&session.pending.length>0&&!node?.options.some(option=>option.next)){
    const activity=npcDialogueActivity(session.npcId,state.locationId);
    if(activity){baseText+=`\n${activity.closing}`;if(speeches)speeches=[...speeches,{speakerId:session.npcId,text:activity.closing,portraitText:activity.closing}];}
  }
  if (scene?.retellable && scene.locationId && scene.locationId !== state.locationId
    && node?.id === scene.startNodeId && !session.greetingNode && session.pending.length === 0) {
    const place = locations.find(location => location.id === scene.locationId)?.name ?? '别处';
    const cue = `话题转到${place}，${npcKnownName(session.npcId)}说起那边的一件小事。`;
    baseText = `${cue}\n${baseText}`;
    if (speeches) speeches = [{ speakerId: null, text: cue }, ...speeches];
  }
  if (speeches && scene?.retrospectiveAfter && session.pending.length === 0
    && state.flags[`npc_remaster_event_seen_${session.npcId}_${scene.retrospectiveAfter}`] === true) {
    speeches = [{ speakerId: null, text: "你们翻到以前留下的草稿，聊起那时的小事。" }, ...speeches];
  }
  return {
    npcId: session.npcId,
    name: npcKnownName(session.npcId),
    nick: npcNick(session.npcId),
    displayName: npcConversationName(session.npcId, session.stageKey),
    descriptor: npcDescriptor(session.npcId),
    icon: def.icon ?? "🧑",
    stateLabel,
    affinity: currentAffinity(state, session.npcId, def),
    tierKey: session.stageKey === "meet" ? "acquaintance" : session.stageKey,
    stageKey: session.stageKey,
    nodeId: session.nodeId,
    text: hintText ? `${baseText}\n\n${hintText}` : baseText,
    speeches,
    options,
    conversationKind: session.npcTaskTopicId ? 'task' : contextScene?'context':session.encounterNode
      ? "meet"
      : session.greetingNode
        ? "greeting"
        : session.entry === "formal" && !scene
          ? "formal"
          : session.entry === "chat" && scene?.kind === "event"
            ? "daily"
            : (scene?.kind ?? "legacy"),
    conversationTitle: contextScene?.activity.title ?? (session.greetingNode ? undefined : session.formalTitle ?? scene?.title),
  };
}

/** 开始一次初见或已认识 NPC 的对话。 */
export function beginNpcConversation(
  state: GameState,
  npcId: string,
  entry: NpcConversationEntry,
  topicId?: string,
): NpcConversationBeginResult {
  const def = getNpcDef(npcId);
  if (!def) return { ok: false, reason: "找不到这位 NPC" };
  if (!npcOrdinaryAppearanceUnlocked(state, npcId)) return { ok: false, reason: "请先完成小吃街与清吧的共同初见" };
  if (entry === "introduction") return { ok: false, reason: "请从场景中的相遇入口开始" };
  const time = {
    ...state.time, seed: state.rng.seed, weekday: weekdayOf(state.time),
    hour: state.time.hour,
    minute: state.time.minute,
    regionId: state.region,
  };
  const presence = npcPresenceAt(def, time);
  if (!presence) return { ok: false, reason: "现在不在这里" };
  const isHere = npcAtLocation(def, state.locationId, time);
  if (!isHere) return { ok: false, reason: entry === "meet" ? "这里没有这个人" : "现在不在这里" };
  const rel = findRelationship(state, npcId);

  if (entry === "meet") {
    if (rel) return { ok: false, reason: "你们已经认识了" };
  } else {
    if (!rel) return { ok: false, reason: "你们还不认识" };
    if (rel.state === "blocked") return { ok: false, reason: "现在不方便联系 TA" };
  }

  const lockedStage: NpcTalkStageKey = entry === "meet" ? "meet" : talkKeyOf(rel?.affinity ?? 0, rel?.state);
  // 玩家主动点选任务话题，直达办理正文；不读取每日问候或闲聊额度。
  if (entry === 'chat' && topicId?.startsWith('task:')) {
    const topic = getNpcTaskTopics(state, npcId, 'chat').find(candidate => candidate.id === topicId.slice(5));
    if (!topic) return { ok: false, reason: '这件事的进展已经改变，请重新查看话题' };
    if (topic.playerThought) return { ok: false, reason: topic.playerThought };
    return { ok: true, session: { ...sessionIdentity(state, npcId), npcId, entry, lockedStage,
      relationshipAtStart: { affinity: rel!.affinity, state: rel!.state }, stageKey: lockedStage,
      nodeId: `task:${topic.id}`, npcTaskTopicId: topic.id, encounterLocation: state.locationId,
      formalTitle: topic.title, formalText: topic.text, formalSpeeches: topic.speeches, formalOptions: taskTopicOptions(topic), artId: topic.artId,
      pending: [], affinityDelta: 0, progressed: false, status: 'active' } };
  }
  const today = gameDay(state.time);
  const dailyChatCount = entry === "chat" ? npcChatCountToday(state, npcId, today) : 0;
  const encounterNode = entry === "meet" && state.locationId !== def.meetLocation
    ? npcFirstEncounterNode(npcId, state.locationId) : undefined;
  const selectedTopic = topicId ? remasterEligibleTopics(state, npcId, "chat", rel?.affinity ?? 0).find(scene => scene.id === topicId) : undefined;
  const selectedGroup = topicId?.startsWith('group:') ? availableNpcGroupScenes(state,npcId).find(scene => `group:${scene.id}` === topicId) : undefined;
  if (topicId && (entry !== "chat" || (!selectedTopic && !selectedGroup))) return { ok: false, reason: "这个闲聊话题暂时无法开始" };
  const contextStart=entry==='chat'&&!selectedTopic&&!selectedGroup&&dailyChatCount<NPC_DAILY_CHAT_SOFT_LIMIT?npcContextDialogueStart(state,npcId):undefined;
  const remasterStart = contextStart?undefined:selectedTopic ? { sceneId: selectedTopic.id, kind: selectedTopic.kind, stageKey: selectedTopic.stageKey, nodeId: selectedTopic.startNodeId, title: selectedTopic.title } : entry === "meet"
    ? remasterConversationStart(state, npcId, lockedStage, rel?.affinity ?? 0)
    : remasterDailyConversationStart(state, npcId, lockedStage, rel?.affinity ?? 0);
  if (entry === "chat" && dailyChatCount >= NPC_DAILY_CHAT_HARD_LIMIT) {
    return { ok: false, reason: npcChatBoundaryLine(npcId, "refusal", currentAffinity(state, npcId, def)) };
  }
  if (entry === "chat" && dailyChatCount >= NPC_DAILY_CHAT_SOFT_LIMIT) {
    const chatLimitNotice = dailyChatCount === NPC_DAILY_CHAT_SOFT_LIMIT ? "polite" : "upset";
    return {
      ok: true,
      session: {
        ...sessionIdentity(state, npcId),
        npcId,
        entry,
        lockedStage,
        ...(rel ? { relationshipAtStart: { affinity: rel.affinity, state: rel.state } } : {}),
        stageKey: lockedStage,
        nodeId: NPC_CHAT_LIMIT_NODE_ID,
        pending: [],
        affinityDelta: 0,
        progressed: false,
        status: "active",
        chatLimitNotice,
        chatDayAtStart: today,
        chatCountAtStart: dailyChatCount,
      },
    };
  }

  if (selectedGroup) {
    return { ok: true, session: { ...sessionIdentity(state,npcId), npcId, entry:'chat', lockedStage, stageKey:lockedStage,
      relationshipAtStart:{affinity:rel!.affinity,state:rel!.state}, groupSceneId:selectedGroup.id,
      groupAtStart:{day:today,locationId:state.locationId,regionId:state.region,relationships:Object.fromEntries(selectedGroup.participants.map(id=>{const r=findRelationship(state,id)!;return[id,{affinity:r.affinity,state:r.state}];}))},
      nodeId:selectedGroup.start,encounterLocation:state.locationId,chatDayAtStart:today,chatCountAtStart:dailyChatCount,
      pending:[],affinityDelta:0,progressed:false,status:'active' } };
  }
  const stageKey = remasterStart?.stageKey ?? lockedStage;
  const stage = stageOf(def, stageKey);
  const nodeId = contextStart?.startNodeId ?? encounterNode?.id ?? remasterStart?.nodeId ?? stage?.start;
  const hasStartNode = !!nodeId && (!!contextStart || !!encounterNode || !!stage?.nodes[nodeId]);
  const placeholderText = !hasStartNode ? def.dialoguePlaceholder?.trim() : undefined;
  if (!hasStartNode && !placeholderText) return { ok: false, reason: "这段对话还没有准备好" };

  // 主动选中的话题直达正文；其他地点无合适日常时只作短暂问候。
  const greetingNode = entry === "chat" && !contextStart && !selectedTopic && (!remasterStart || !greetedToday(state, npcId, today))
    ? npcGreetingNode(npcId, state.locationId, state.time.hour, today)
    : undefined;
  const hintKey = `npc_remaster_hint_day_${npcId}`;
  const hintText = entry === "chat"
    && !greetingNode
    && remasterStart?.kind === "daily"
    && state.flags[hintKey] !== today
    ? hintFor(state, npcId, remasterStart.sceneId)
    : undefined;

  return {
    ok: true,
    session: {
      ...sessionIdentity(state, npcId),
      npcId,
      entry,
      lockedStage,
      ...(rel ? { relationshipAtStart: { affinity: rel.affinity, state: rel.state } } : {}),
      stageKey,
      nodeId: hasStartNode ? nodeId! : "dialogue_placeholder",
      sceneId: encounterNode ? undefined : remasterStart?.sceneId,
      ...(contextStart?{contextSceneId:contextStart.id}:{}),
      encounterNode,
      encounterLocation: contextStart || encounterNode || remasterStart ? state.locationId : undefined,
      greetingNode,
      hintText,
      ...(placeholderText ? {
        formalText: placeholderText,
        formalOptions: [{ label: "（先告辞。）", leave: true }],
      } : {}),
      pending: [],
      affinityDelta: 0,
      progressed: false,
      status: "active",
      ...(entry === "chat" ? { chatDayAtStart: today, chatCountAtStart: dailyChatCount } : {}),
    },
  };
}

/** 开始指定的正式话题；正式对话不读取、修改每日闲聊次数。 */
export function beginNpcFormalConversation(
  state: GameState,
  npcId: string,
  topicId: string,
): NpcConversationBeginResult {
  const def = getNpcDef(npcId);
  if (!def) return { ok: false, reason: "找不到这位 NPC" };
  if (!npcOrdinaryAppearanceUnlocked(state, npcId)) return { ok: false, reason: "请先完成小吃街与清吧的共同初见" };
  const time = {
    ...state.time, seed: state.rng.seed, weekday: weekdayOf(state.time),
    hour: state.time.hour,
    minute: state.time.minute,
    regionId: state.region,
  };
  if (!npcPresenceAt(def, time) || !npcAtLocation(def, state.locationId, time)) {
    return { ok: false, reason: "现在不在这里" };
  }
  const relationship = findRelationship(state, npcId);
  if (!relationship) return { ok: false, reason: "你们还不认识" };
  if (relationship.state === "blocked") return { ok: false, reason: "现在不方便联系 TA" };
  const topic = npcFormalTopics(state, npcId).find((candidate) => candidate.id === topicId);
  if (!topic) return { ok: false, reason: "这件事已经处理过，或暂时无法继续" };
  const lockedStage = talkKeyOf(relationship.affinity, relationship.state);
  const nodeId = topic.nodeId ?? `formal_${topic.id}`;
  const session: NpcConversationSession = {
    ...sessionIdentity(state, npcId),
    npcId,
    entry: "formal",
    lockedStage,
    relationshipAtStart: { affinity: relationship.affinity, state: relationship.state },
    stageKey: topic.stageKey,
    nodeId,
    formalTopicId: topic.id,
    ...(topic.npcTaskTopicId ? { npcTaskTopicId: topic.npcTaskTopicId, artId: topic.artId } : {}),
    encounterLocation: state.locationId,
    ...(topic.sceneId ? { sceneId: topic.sceneId } : {}),
    ...(topic.groupSceneId?{groupSceneId:topic.groupSceneId,groupAtStart:{day:gameDay(state.time),locationId:state.locationId,regionId:state.region,relationships:Object.fromEntries(npcGroupScene(topic.groupSceneId)!.participants.map(id=>{const r=findRelationship(state,id)!;return[id,{affinity:r.affinity,state:r.state}];}))}}:{}),
    ...(topic.kind === "event" ? {} : {
      formalTitle: topic.label,
      formalText: topic.text ?? topic.description,
      formalSpeeches: topic.speeches,
      formalOptions: topic.options ?? [],
    }),
    pending: [],
    affinityDelta: 0,
    progressed: false,
    status: "active",
  };
  if (!npcConversationView(state, session)) return { ok: false, reason: "这段正式对话暂时无法载入" };
  return { ok: true, session };
}



function validateEffects(effects: unknown): string | undefined {
  if (!effects || typeof effects !== "object") return undefined;
  const raw = effects as { hours?: unknown; items?: unknown };
  if (Object.prototype.hasOwnProperty.call(raw, "hours")) return "对话选项不能额外消耗时间";
  if (raw.items === undefined) return undefined;
  if (!raw.items || typeof raw.items !== "object" || Array.isArray(raw.items)) return "物品奖励配置无效";
  for (const [itemId, qty] of Object.entries(raw.items as Record<string, unknown>)) {
    if (!getItem(itemId)) return `未知物品：${itemId}`;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0) return "物品奖励数量必须是正整数";
  }
  return undefined;
}

function validateOption(
  state: GameState,
  session: NpcConversationSession,
  option: NpcTalkOption,
): string | undefined {
  if (isLegacyNpcRequest(option)) return "旧版占位委托已移除，请重新打开对话";
  if (option.disabledReason) return option.disabledReason;
  if (!npcTalkOptionAvailable(state, option)) return "这个选项的条件已经改变，请重新选择";
  const effectReason = validateEffects(option.effects);
  if (effectReason) return effectReason;
  if (option.dialogueBenefitId) {
    const benefit = NPC_DIALOGUE_BENEFITS[option.dialogueBenefitId];
    if (!benefit || benefit.npcId !== session.npcId) return "赠物分支配置无效";
    const benefitReason = validateEffects(benefit.effects);
    if (benefitReason) return benefitReason;
    if (npcDialogueBenefitClaimed(state, option.dialogueBenefitId)) return "这份心意今天已经收过了，先让对方留着吧。";
    if (session.pending.some(selection => selection.option.dialogueBenefitId === option.dialogueBenefitId)) return "这份赠物已经选过了";
  }
  return undefined;
}

function cappedAffinityDelta(current: number, requested: number): { applied: number; next: number } {
  const next = Math.max(AFFINITY_SESSION_MIN, Math.min(AFFINITY_SESSION_MAX, current + requested));
  return { applied: next - current, next };
}

/** 对话中的好感统一限于 -5～+5，避免长分支在一次会话内被刷爆。 */
export function capNpcConversationAffinity(current: number, requested: number): { applied: number; next: number } {
  return cappedAffinityDelta(current, requested);
}

function leaveHasOwnSettlement(option: NpcTalkOption): boolean {
  return (option.affinity ?? 0) !== 0
    || !!option.dialogueBenefitId
    || !!option.effects
    || !!option.log;
}

/** 选择一个节点选项，只推进临时会话。 */
export function advanceNpcConversation(
  state: GameState,
  session: NpcConversationSession,
  optionIndex: number,
): NpcConversationAdvanceResult {
  if (session.status !== "active") return { ok: false, reason: "这段对话已经结束" };
  const view = npcConversationView(state, session);
  if (!view) return { ok: false, reason: "当前对话节点不存在" };
  const option = view.options[optionIndex];
  if (!option) return { ok: false, reason: "没有这个选项" };

  if (session.npcTaskTopicId && option.npcTaskNextTopic) {
    const root = getNpcTaskTopics(state, session.npcId, session.entry === 'formal' ? 'formal' : 'chat').find(t => t.id === session.npcTaskTopicId);
    const current = session.npcTaskBranch ? root?.branches?.[session.npcTaskBranch] : root;
    const canonical = current && taskTopicOptions(current).find(candidate => JSON.stringify(candidate) === JSON.stringify(option));
    if (!root || !canonical || canonical.disabledReason || session.pending.length) return { ok: false, reason: canonical?.disabledReason ?? '人手情况已经改变，请重新查看话题' };
    const branch = option.npcTaskNextTopic === 'root' ? undefined : option.npcTaskNextTopic;
    const next = branch ? root.branches?.[branch] : root;
    if (!next) return { ok: false, reason: '这页人手选项已经失效' };
    return { ok: true, session: { ...session, npcTaskBranch: branch, nodeId: `task:${root.id}${branch ? `:${branch}` : ''}`,
      formalText: next.text, formalSpeeches: next.speeches, formalOptions: taskTopicOptions(next), status: 'active', progressed: false, endReason: undefined } };
  }

  if (option.leave) {
    // 纯「离开」不会建立关系，也不消耗时间；文案里带有好感或奖励的
    // 「我先走了」则应当保留该选择，并与此前进度一起原子结算。
    if (leaveHasOwnSettlement(option)) {
      const reason = validateOption(state, session, option);
      if (reason) return { ok: false, reason };
      const affinity = cappedAffinityDelta(session.affinityDelta, option.affinity ?? 0);
      return {
        ok: true,
        session: {
          ...session,
          pending: [
            ...session.pending,
            { stageKey: session.stageKey, nodeId: session.nodeId, option, affinity: affinity.applied },
          ],
          affinityDelta: affinity.next,
          progressed: true,
          status: "ended",
          endReason: "leave",
        },
      };
    }
    return {
      ok: true,
      session: {
        ...session,
        status: "ended",
        endReason: "leave",
      },
    };
  }

  const reason = validateOption(state, session, option);
  if (reason) return { ok: false, reason };

  const affinity = cappedAffinityDelta(session.affinityDelta, option.affinity ?? 0);
  const nextStage = option.nextStage ?? session.stageKey;
  let nextNode = option.next;
  if (option.nextStage) {
    const stage = stageOf(getNpcDef(session.npcId), option.nextStage);
    if (!stage) return { ok: false, reason: "下一段对话内容不存在" };
    nextNode = stage.start;
  }

  const nextSession: NpcConversationSession = {
    ...session,
    stageKey: nextStage,
    nodeId: nextNode ?? session.nodeId,
    pending: [
      ...session.pending,
      { stageKey: session.stageKey, nodeId: session.nodeId, option, affinity: affinity.applied },
    ],
    affinityDelta: affinity.next,
    progressed: true,
    status: nextNode ? "active" : "ended",
    endReason: nextNode ? undefined : "complete",
    ...(session.introductionId && session.nodeId === "m1_more" && nextNode === "m1_more"
      ? { introductionQuote: `${session.introductionQuote ?? "100000"}0` } : {}),
  };
  if(session.groupSceneId&&nextNode&&!npcGroupScene(session.groupSceneId)?.nodes[nextNode])return{ok:false,reason:'下一段共同对话不存在'};
  return { ok: true, session: nextSession };
}

function applyConversationEffects(
  state: GameState,
  effects: import("../types").ConversationEffects | undefined,
  icon: string,
): void {
  if (!effects) return;
  const { items, ...baseEffects } = effects;
  applyEffects(state, baseEffects, icon);
  for (const [itemId, qty] of Object.entries(items ?? {})) addItem(state, itemId, qty);
}



function pushDiff(out: ResultDelta[], key: string, label: string, before: number, after: number): void {
  // v1.43：结算面板显示的差值统一保留一位小数，避免把浮点尾差（如 -3.000000007）暴露给玩家。
  const value = Math.round((after - before) * 10) / 10;
  if (value !== 0) out.push({ key, label, value });
}

const SKILL_LABELS: Record<string, string> = {
  programming: "编程",
  design: "设计",
  writing: "文案",
  operation: "运营",
  cooking: "厨艺",
  service: "服务",
  driving: "驾驶",
  management: "管理",
};

function stateDeltas(before: GameState, after: GameState, npcId: string): {
  deltas: ResultDelta[];
  items: NpcConversationItemChange[];
} {
  const deltas: ResultDelta[] = [];
  pushDiff(deltas, "money", "金钱", before.player.money, after.player.money);
  const attrs = [
    ["stamina", "体力"],
    ["health", "健康"],
    ["mood", "心情"],
    ["hygiene", "干净度"],
    ["satiety", "饱腹"],
  ] as const;
  for (const [key, label] of attrs) pushDiff(deltas, key, label, before.player.attrs[key], after.player.attrs[key]);
  const stats = [
    ["intelligence", "智力"],
    ["charm", "魅力"],
    ["fitness", "体质"],
    ["fame", "影响力"],
  ] as const;
  for (const [key, label] of stats) pushDiff(deltas, key, label, before.player.stats[key], after.player.stats[key]);
  pushDiff(deltas, "stress", "压力", before.player.stress, after.player.stress);

  for (const key of Object.keys(after.player.skills)) {
    const beforeValue = before.player.skills[key as keyof typeof before.player.skills] ?? 0;
    const afterValue = after.player.skills[key as keyof typeof after.player.skills] ?? 0;
    pushDiff(deltas, key, SKILL_LABELS[key] ?? key, beforeValue, afterValue);
  }

  const beforeRel = findRelationship(before, npcId)?.affinity ?? getNpcDef(npcId)?.initialAffinity ?? 0;
  const afterRel = findRelationship(after, npcId)?.affinity ?? beforeRel;
  pushDiff(deltas, "affinity", `${npcNick(npcId)}好感`, beforeRel, afterRel);

  const items: NpcConversationItemChange[] = [];
  const itemIds = new Set([...Object.keys(before.inventory ?? {}), ...Object.keys(after.inventory ?? {})]);
  for (const id of itemIds) {
    const value = (after.inventory?.[id] ?? 0) - (before.inventory?.[id] ?? 0);
    if (value !== 0) {
      const item = getItem(id);
      items.push({ id, name: item?.name ?? id, value });
      deltas.push({ key: `item:${id}`, label: item?.name ?? id, value });
    }
  }
  return { deltas, items };
}

function validatePendingSelections(state: GameState, session: NpcConversationSession): string | undefined {
  let reserved: NpcConversationSession = { ...session, pending: [] };
  for (const selection of session.pending) {
    if(selection.option.dialogueBenefitId){
      const node=session.contextSceneId?NPC_CONTEXT_DIALOGUES[session.contextSceneId]?.nodes[selection.nodeId]
        :session.greetingNode?npcGreetingNode(session.npcId,state.locationId,state.time.hour,gameDay(state.time))
        :nodeOf(getNpcDef(session.npcId),selection.stageKey,selection.nodeId);
      if(!node?.options.some(option=>option.dialogueBenefitId===selection.option.dialogueBenefitId&&option.label===selection.option.label))return '赠物的接受分支已经失效，请重新开始';
    }
    const reason = validateOption(state, reserved, selection.option);
    if (reason) return reason;
    reserved = { ...reserved, pending: [...reserved.pending, selection] };
  }
  return undefined;
}

function npcIsPresentAtCurrentLocation(state: GameState, npcId: string): boolean {
  const def = getNpcDef(npcId);
  if (!def || !npcOrdinaryAppearanceUnlocked(state, npcId)) return false;
  const time = {
    ...state.time, seed: state.rng.seed, weekday: weekdayOf(state.time),
    hour: state.time.hour,
    minute: state.time.minute,
    regionId: state.region,
  };
  return !!npcPresenceAt(def, time) && npcAtLocation(def, state.locationId, time);
}

function validateSessionContext(state: GameState, session: NpcConversationSession): string | undefined {
  if (session.encounterLocation && session.encounterLocation !== state.locationId) {
    return "相遇地点已改变，这段对话已失效，请重新开始";
  }
  if (!npcIsPresentAtCurrentLocation(state, session.npcId)) {
    return "NPC 已不在当前地点，这段对话已经失效";
  }

  const relationship = findRelationship(state, session.npcId);
  if (session.entry === "meet") {
    if (relationship) return "这次初见已经失效，你们已经认识了";
    return undefined;
  }

  if (!relationship) return "这段对话已经失效，你们还不认识";
  if (relationship.state === "blocked") return "这段对话已经失效，当前无法联系 TA";
  const startedRelationship = session.relationshipAtStart;
  if (!startedRelationship
    || relationship.affinity !== startedRelationship.affinity
    || relationship.state !== startedRelationship.state) {
    return "你们的关系已经发生变化，请重新开始对话";
  }
  return undefined;
}

/** Shared openings settle only after the authored terminal node is reached. */
function commitNpcIntroduction(state: GameState, session: NpcConversationSession): NpcConversationCommitResult {
  const scene = npcIntroduction(session.introductionId), started = session.introductionAtStart;
  const fail = (reason: string): NpcConversationCommitResult => ({ ok: false, reason, text: "" });
  if (!scene || session.entry !== "introduction" || session.npcId !== scene.participants[0] || !started || !npcIntroductionAvailable(state, scene)) return fail("这次相遇已经结束或暂时无法继续");
  if (started.clock !== introductionClock(state) || started.locationId !== state.locationId || started.regionId !== state.region) return fail("相遇的时间或地点已改变，请重新开始");
  for (const id of scene.participants) {
    const r = findRelationship(state, id), before = started.relationships[id];
    if ((r ? JSON.stringify({ affinity: r.affinity, state: r.state }) : "null") !== JSON.stringify(before)) return fail("参与者的关系已经改变，请重新开始");
  }
  const beforeAffinity = currentAffinity(state, session.npcId, getNpcDef(session.npcId));
  if (session.endReason === "leave") {
    const draft = cloneState(state); recordSessionCommit(draft, session);
    const text = "你向他们道别，这次相遇可以下回再继续。";
    return { ok: true, state: draft, text, summary: { endReason: "leave", text, timeCost: 0, affinityBefore: beforeAffinity, affinityAfter: beforeAffinity, affinityDelta: 0, deltas: [], items: [], commissionTitles: [], contactAdded: false } };
  }
  let cursor = scene.start, quote = "100000", completed = false;
  for (const [index, selection] of session.pending.entries()) {
    const node = npcIntroductionNode(scene, cursor, quote);
    const canonical = node?.options.find(option => JSON.stringify(option) === JSON.stringify(selection.option));
    if (!canonical || canonical.leave || completed || selection.stageKey !== "meet" || selection.nodeId !== cursor || !npcTalkOptionAvailable(state, canonical)) return fail("相遇中的选择已失效，请重新开始");
    if (cursor === "m1_more" && canonical.next === "m1_more") quote += "0";
    completed = !canonical.next;
    if (canonical.next) cursor = canonical.next;
    if (completed && index !== session.pending.length - 1) return fail("这次相遇已经结束");
  }
  const validEnd = scene.id === "M01" ? ["m1_done", "m1_done_no_coupon"].includes(cursor) : cursor === "m2_done";
  if (!completed || !validEnd || !session.progressed || session.nodeId !== cursor || session.introductionQuote !== quote) return fail("请先完成这次相遇");
  const draft = cloneState(state), contacts: string[] = [], affinityDeltas: ResultDelta[] = [];
  const newIds = scene.id === "M01" ? scene.participants : ["npc_jack_fanma"];
  for (const id of newIds) {
    // Replaying in an existing save must not overwrite lover/blocked states or
    // grant the original first-meeting affection a second time.
    if (!findRelationship(draft, id)) {
      const before = getNpcDef(id)?.initialAffinity ?? 0;
      ensureRelationship(draft, id); addAffinity(draft, id, 3, "meet");
      const after = findRelationship(draft, id)!.affinity;
      if (after !== before) affinityDeltas.push({ key: `affinity:${id}`, label: `${npcKnownName(id)}好感`, value: after - before });
    }
    recordNpcDialogueDay(draft, id); markGreeted(draft, id, gameDay(draft.time));
    if (maybeAddNpcContact(draft, id)) contacts.push(npcKnownName(id));
  }
  if (scene.id === "M01") {
    draft.flags[INTRO_FIRST_COMPLETE] = true;
    if (cursor === "m1_done" && draft.flags.npc_introduction_coupon_issued !== true) {
      addItem(draft, LOUNGE_BEER_COUPON, 1); draft.flags.npc_introduction_coupon_issued = true;
    }
  } else draft.flags[INTRO_SECOND_COMPLETE] = true;
  draft.flags.socialized_once = true;
  const timeCost = 0.5;
  advanceHours(draft, timeCost); recordSessionCommit(draft, session);
  const receivedCoupon=(draft.inventory[LOUNGE_BEER_COUPON]??0)>(state.inventory[LOUNGE_BEER_COUPON]??0);
  const text = scene.id === "M01" ? `你认识了范柯杰和范珂汐，记下了清吧的邀请。${receivedCoupon?'你收下一张清吧啤酒券，放进背包。':''}` : "你和范柯杰、杰克聊过一阵，各自回到原来的安排。";
  pushLog(draft, "💬", text);
  const regular = stateDeltas(state, draft, session.npcId);
  return { ok: true, state: draft, text, summary: { endReason: "complete", text, timeCost, affinityBefore: beforeAffinity,
    affinityAfter: findRelationship(draft, session.npcId)?.affinity ?? beforeAffinity,
    affinityDelta: (findRelationship(draft, session.npcId)?.affinity ?? beforeAffinity) - beforeAffinity,
    deltas: [...regular.deltas.filter(d => d.key !== "affinity"), ...affinityDeltas], items: regular.items, commissionTitles: [], contactAdded: contacts.length > 0, contactNames: contacts } };
}

/** 实体委托独立结算，保留普通会话的身份校验与状态副本提交。 */
function commitNpcTaskConversation(state: GameState, session: NpcConversationSession): NpcConversationCommitResult {
  const beforeAffinity = findRelationship(state, session.npcId)?.affinity ?? 0;
  if (session.endReason === 'leave' && session.pending.length === 0) {
    const draft = cloneState(state);
    recordSessionCommit(draft, session);
    const text = '你暂时收起话题，还没有确认任何办理事项。';
    return { ok: true, state: draft, text, summary: { endReason: 'leave', text, timeCost: 0,
      affinityBefore: beforeAffinity, affinityAfter: beforeAffinity, affinityDelta: 0,
      deltas: [], items: [], commissionTitles: [], contactAdded: false } };
  }
  const channel = session.entry === 'formal' ? 'formal' : 'chat';
  const root = getNpcTaskTopics(state, session.npcId, channel).find(candidate => candidate.id === session.npcTaskTopicId);
  const topic = session.npcTaskBranch ? root?.branches?.[session.npcTaskBranch] : root;
  const selection = session.pending[0];
  const canonical = topic && taskTopicOptions(topic).find(option => JSON.stringify(option) === JSON.stringify(selection?.option));
  if (!canonical?.npcTaskAction || canonical.disabledReason || session.pending.length !== 1
    || !session.progressed || selection.nodeId !== session.nodeId) {
    return { ok: false, reason: canonical?.disabledReason ?? '任务办理条件已经改变，请重新打开话题', text: '' };
  }
  const result = executeNpcTaskAction(state, session.npcId, canonical.npcTaskAction);
  if (!result.ok || !result.state) return { ok: false, reason: result.reason ?? '这次办理没有完成', text: '' };
  if (result.timeCost > 0) {
    result.state.flags.socialized_once = true;
    recordNpcDialogueDay(result.state, session.npcId);
  }
  recordSessionCommit(result.state, session);
  const changes = stateDeltas(state, result.state, session.npcId);
  if (canonical.npcTaskAction.taskId === 'zhao_staff') {
    for (const id of ['npc_zhao_gang', 'npc_fan_kejie', 'npc_jack_fanma']) {
      if (id === session.npcId) continue;
      pushDiff(changes.deltas, `affinity:${id}`, `${getNpcDef(id)?.name ?? id}好感`,
        findRelationship(state, id)?.affinity ?? 0, findRelationship(result.state, id)?.affinity ?? 0);
    }
  }
  const afterAffinity = findRelationship(result.state, session.npcId)?.affinity ?? beforeAffinity;
  return { ok: true, state: result.state, text: result.text, summary: { endReason: 'complete', text: result.text,
    timeCost: result.timeCost, affinityBefore: beforeAffinity, affinityAfter: afterAffinity,
    affinityDelta: afterAffinity - beforeAffinity, ...changes, commissionTitles: [], contactAdded: false, artId: result.artId } };
}

/** 将会话中的所有选择一次性应用到状态副本。 */
export function commitNpcConversation(
  state: GameState,
  session: NpcConversationSession,
): NpcConversationCommitResult {
  if (session.status !== "ended" || !session.endReason) {
    return { ok: false, reason: "对话尚未结束", text: "" };
  }

  const def = getNpcDef(session.npcId);
  if (!def) return { ok: false, reason: "找不到这位 NPC", text: "" };

  const commitCursor = npcTalkCommitCursor(state, session.npcId);
  if (!Number.isSafeInteger(session.commitSequence) || session.commitSequence < 1) {
    return { ok: false, reason: "对话会话序号无效，请重新开始", text: "" };
  }
  if (session.commitSequence <= commitCursor) {
    return { ok: false, reason: "这段对话已经结算过了", text: "" };
  }
  if (session.commitSequence !== commitCursor + 1) {
    return { ok: false, reason: "对话会话序号已过期，请重新开始", text: "" };
  }
  if (session.sessionId !== `npc-talk:${session.npcId}:${session.commitSequence}`) {
    return { ok: false, reason: "对话会话信息无效，请重新开始", text: "" };
  }

  if (session.introductionId) return commitNpcIntroduction(state, session);

  const contextReason = validateSessionContext(state, session);
  if (contextReason) return { ok: false, reason: contextReason, text: "" };
  if (session.npcTaskTopicId) return commitNpcTaskConversation(state, session);
  if(session.contextSceneId){
    const context=NPC_CONTEXT_DIALOGUES[session.contextSceneId];
    if(!context||context.activity.npcId!==session.npcId||session.entry!=='chat'
      ||!context.activity.locations.includes(state.locationId))return{ok:false,reason:'这段场景对话已失效',text:''};
    let cursor=context.startNodeId,complete=false;
    for(const choice of session.pending){
      const node=context.nodes[cursor],canonical=node?.options.find(option=>JSON.stringify(option)===JSON.stringify(choice.option));
      if(complete||!canonical||choice.nodeId!==cursor)return{ok:false,reason:'场景对话的选择顺序已失效',text:''};
      complete=!canonical.next;if(canonical.next)cursor=canonical.next;
    }
    if(session.nodeId!==cursor||(session.endReason==='complete'&&!complete))return{ok:false,reason:'场景对话尚未完成',text:''};
  }

  if (session.entry === "formal" && session.formalTopicId
    && !npcFormalTopics(state, session.npcId).some((topic) => topic.id === session.formalTopicId)) {
    return { ok: false, reason: "这件事已经处理过，或当前情况发生了变化", text: "" };
  }

  if(session.groupSceneId){
    const scene=npcGroupScene(session.groupSceneId),started=session.groupAtStart;
    if(!scene||!started||session.entry!=='chat'||!npcGroupSceneAvailable(state,scene,session.npcId)
      ||session.chatDayAtStart!==gameDay(state.time)||session.chatCountAtStart!==npcChatCountToday(state,session.npcId))return{ok:false,reason:'共同对话已失效，请重新开始',text:''};
    if(started.day!==gameDay(state.time)||started.locationId!==state.locationId||started.regionId!==state.region)return{ok:false,reason:'共同对话的时间或地点已改变',text:''};
    for(const id of scene.participants){const r=findRelationship(state,id),before=started.relationships[id];if(!r||!before||r.affinity!==before.affinity||r.state!==before.state)return{ok:false,reason:'参与者的关系已经改变，请重新开始对话',text:''};}
    const beforeAffinity=currentAffinity(state,session.npcId,def);
    if(session.endReason==='leave')return{ok:true,text:'你向两人道别，离开了小桌。',summary:{endReason:'leave',text:'你向两人道别，离开了小桌。',timeCost:0,affinityBefore:beforeAffinity,affinityAfter:beforeAffinity,affinityDelta:0,deltas:[],items:[],commissionTitles:[],contactAdded:false}};
    let cursor=scene.start,completed=false;
    for(const [i,selection]of session.pending.entries()){
      const node=scene.nodes[cursor],canonical=node?.options.find(o=>JSON.stringify(o)===JSON.stringify(selection.option));
      if(!node||selection.nodeId!==cursor||!canonical||canonical.leave||completed)return{ok:false,reason:'共同对话的选择顺序无效',text:''};
      completed=!canonical.next;if(canonical.next)cursor=canonical.next;
      if(completed&&i!==session.pending.length-1)return{ok:false,reason:'共同对话已结束',text:''};
    }
    if(!completed||!session.progressed||session.nodeId!==cursor)return{ok:false,reason:'请先完成这段共同对话',text:''};
    const draft=cloneState(state),contacts:string[]=[],deltas:ResultDelta[]=[];
    for(const id of scene.participants){const before=findRelationship(draft,id)!.affinity;addAffinity(draft,id,1,'talk');recordNpcDialogueDay(draft,id);const after=findRelationship(draft,id)!.affinity;if(after!==before)deltas.push({key:`affinity:${id}`,label:`${npcKnownName(id)}好感`,value:after-before});if(maybeAddNpcContact(draft,id))contacts.push(npcKnownName(id));}
    draft.flags[npcGroupDayFlag(scene.id)]=gameDay(state.time);draft.flags.socialized_once=true;
    recordNpcChat(draft,session.npcId);markGreeted(draft,session.npcId,gameDay(draft.time));
    const timeCost=GREETING_TIME_COST;advanceHours(draft,timeCost);recordSessionCommit(draft,session);
    const text=`你和${scene.participants.map(npcKnownName).join('、')}在小桌旁聊了一会儿。`;pushLog(draft,'💬',text);
    const regular=stateDeltas(state,draft,session.npcId);deltas.unshift(...regular.deltas.filter(d=>d.key!=='affinity'));
    const afterAffinity=findRelationship(draft,session.npcId)!.affinity;
    return{ok:true,state:draft,text,summary:{endReason:'complete',text,timeCost,affinityBefore:beforeAffinity,affinityAfter:afterAffinity,affinityDelta:afterAffinity-beforeAffinity,deltas,items:regular.items,commissionTitles:[],contactAdded:contacts.length>0,contactNames:contacts}};
  }

  const scene = remasterScene(session.npcId, session.sceneId);
  const isEventConversation = session.entry !== "meet" && scene?.kind === "event";
  if (isEventConversation && state.flags[`npc_remaster_event_seen_${session.npcId}_${scene.id}`] === true) {
    return { ok: false, reason: "这段特别对话已经结算过了", text: "" };
  }

  if (session.entry === "chat" && session.chatDayAtStart != null && session.chatCountAtStart != null
    && (session.chatDayAtStart !== gameDay(state.time)
      || session.chatCountAtStart !== npcChatCountToday(state, session.npcId))) {
    return { ok: false, reason: "这段聊天已失效，请重新开始对话", text: "" };
  }

  if (session.entry === "meet" && session.endReason === "leave"
    && session.pending.some(({ option }) => option.leaveAfterNext)) {
    const draft = cloneState(state);
    recordSessionCommit(draft, session);
    const text = "你礼貌地告别，没有继续这段对话。";
    const affinity = currentAffinity(state, session.npcId, def);
    return {
      ok: true,
      state: draft,
      text,
      summary: {
        endReason: session.endReason,
        text,
        timeCost: 0,
        affinityBefore: affinity,
        affinityAfter: affinity,
        affinityDelta: 0,
        deltas: [],
        items: [],
        commissionTitles: [],
        contactAdded: false,
      },
    };
  }

  if (session.chatLimitNotice) {
    const draft = cloneState(state);
    const affinityBefore = currentAffinity(draft, session.npcId, def);
    if (session.chatLimitNotice === "upset") {
      addAffinity(draft, session.npcId, -2, "talk");
    }
    recordNpcChat(draft, session.npcId);
    recordSessionCommit(draft, session);
    const affinityAfter = currentAffinity(draft, session.npcId, def);
    const affinityDelta = affinityAfter - affinityBefore;
    const text = npcChatBoundaryLine(session.npcId, session.chatLimitNotice, affinityBefore);
    return {
      ok: true,
      state: draft,
      text,
      summary: {
        endReason: session.endReason ?? "leave",
        text,
        timeCost: 0,
        affinityBefore,
        affinityAfter,
        affinityDelta,
        deltas: affinityDelta === 0 ? [] : [{ key: "affinity", label: `${npcNick(session.npcId)}好感`, value: affinityDelta }],
        items: [],
        commissionTitles: [],
        contactAdded: false,
      },
    };
  }

  if (!session.progressed) {
    // v1.43：每日首次问候若被直接跳过，也记为「今天打过招呼了」，
    // 避免玩家反复重开同一段问候来重掷台词。
    if (session.greetingNode) {
      const draft = cloneState(state);
      markGreeted(draft, session.npcId, gameDay(draft.time));
      recordSessionCommit(draft, session);
      const text = "你点了点头，没多停留。";
      return {
        ok: true,
        state: draft,
        text,
        summary: {
          endReason: session.endReason,
          text,
          timeCost: 0,
          affinityBefore: currentAffinity(state, session.npcId, def),
          affinityAfter: currentAffinity(state, session.npcId, def),
          affinityDelta: 0,
          deltas: [],
          items: [],
          commissionTitles: [],
          contactAdded: false,
        },
      };
    }
    // 初见直接离开仍是完全无痕；但已展示的特殊事件要在退出时记为发生，避免重复触发。
    if (scene?.kind === "event") {
      const draft = cloneState(state);
      recordRemasterConversation(draft, session.npcId, session.sceneId, []);
      recordSessionCommit(draft, session);
      const text = "你没有继续聊下去，但这次偶遇不会再重复发生。";
      return {
        ok: true,
        state: draft,
        text,
        summary: {
          endReason: session.endReason,
          text,
          timeCost: 0,
          affinityBefore: currentAffinity(state, session.npcId, def),
          affinityAfter: currentAffinity(state, session.npcId, def),
          affinityDelta: 0,
          deltas: [],
          items: [],
          commissionTitles: [],
          contactAdded: false,
        },
      };
    }
    return {
      ok: true,
      text: "你礼貌地告别，没有继续这段对话。",
      summary: {
        endReason: session.endReason,
        text: "你礼貌地告别，没有继续这段对话。",
        timeCost: 0,
        affinityBefore: currentAffinity(state, session.npcId, def),
        affinityAfter: currentAffinity(state, session.npcId, def),
        affinityDelta: 0,
        deltas: [],
        items: [],
        commissionTitles: [],
        contactAdded: false,
      },
    };
  }

  const validationReason = validatePendingSelections(state, session);
  if (validationReason) return { ok: false, reason: validationReason, text: "" };

  const draft = cloneState(state);
  const notes: string[] = [];
  const commissionTitles: string[] = [];
  const beforeAffinity = currentAffinity(draft, session.npcId, def);
  const outfitBonus = session.entry === "meet"
    ? outfitOccasionFitForState(draft, "date").bonus
    : 0;

  // 初见的正常进度才建立关系；addAffinity(0) 也会记录一次真实互动。
  if (session.entry === "meet") ensureRelationship(draft, session.npcId);
  draft.flags["socialized_once"] = true;
  const totalAffinityDelta = Math.max(
    AFFINITY_SESSION_MIN,
    Math.min(AFFINITY_SESSION_MAX, session.affinityDelta + outfitBonus),
  );
  addAffinity(draft, session.npcId, totalAffinityDelta, session.entry === "meet" ? "meet" : "talk");
  if (outfitBonus !== 0) {
    notes.push(outfitBonus > 0 ? "这身穿搭让初次见面更显得体" : "这身穿搭和今天的见面场合不太合拍");
  }

  for (const selection of session.pending) {
    const option = selection.option;
    applyConversationEffects(draft, option.effects, "💬");
    if(option.dialogueBenefitId){
      const benefit=NPC_DIALOGUE_BENEFITS[option.dialogueBenefitId];
      applyConversationEffects(draft,benefit.effects,'🎁');
      recordNpcDialogueBenefit(draft,option.dialogueBenefitId);
      pushLog(draft,'🎁',benefit.summary);notes.push(benefit.summary);
    }

    if (option.log) notes.push(option.log);
  }

  const isGreeting = !!session.greetingNode;
  if (!isGreeting) {
    const sceneReward = remasterSceneReward(session.npcId, session.sceneId);
    if (sceneReward) {
      applyConversationEffects(draft, { items: { [sceneReward.itemId]: 1 } }, "🎁");
      notes.push(sceneReward.text);
    }
    recordRemasterConversation(draft, session.npcId, session.sceneId, session.pending.map((selection) => selection.option));
    if (session.npcId === "npc_fan_kejie" && scene?.id.endsWith("_d24") && session.endReason === "complete") {
      draft.flags.npc_heard_kejie_parents_dead = true;
    }
  }
  if(session.contextSceneId){
    recordNpcContextDialogue(draft,session.contextSceneId);
    notes.push(`你和${npcKnownName(session.npcId)}趁着空当简短聊了几句，随后各自继续手头的事。`);
    markGreeted(draft,session.npcId,gameDay(draft.time));
  }

  if (session.entry === "chat") recordNpcChat(draft, session.npcId);

  if (session.hintText && session.entry === "chat" && session.chatDayAtStart != null) {
    draft.flags[`npc_remaster_hint_day_${session.npcId}`] = session.chatDayAtStart;
  }

  const thirdChatReminder = session.entry === "chat" && session.chatCountAtStart === NPC_DAILY_CHAT_SOFT_LIMIT - 1
    ? npcChatBoundaryLine(session.npcId, "reminder", currentAffinity(draft, session.npcId, def))
    : undefined;

  recordNpcDialogueDay(draft, session.npcId);
  const contactAdded = maybeAddNpcContact(draft, session.npcId);
  if (contactAdded) notes.push(`你和${npcNick(session.npcId)}互留了联系方式。`);
  // v1.43：每日首次问候只占几分钟（6 分钟），正式对话仍固定 0.5 小时；问候不计入特殊事件进度。
  const timeCost = isGreeting || session.contextSceneId ? GREETING_TIME_COST : 0.5;
  // 初见本身已经是这一天的一次完整交流，因此同样记为「今天打过招呼」——
  // 否则刚结识完再搭话又会被地点问候拦住，显得重复。
  if (isGreeting || session.entry === "meet") markGreeted(draft, session.npcId, gameDay(draft.time));
  advanceHours(draft, timeCost);
  recordSessionCommit(draft, session);

  // before 快照延迟到首次使用前才克隆（提前返回的路径不需要它）。
  const before = cloneState(state);
  const { deltas, items } = stateDeltas(before, draft, session.npcId);
  const afterAffinity = findRelationship(draft, session.npcId)?.affinity ?? beforeAffinity;
  const affinityDelta = afterAffinity - beforeAffinity;
  const parts: string[] = [];
  if (affinityDelta !== 0) parts.push(`好感 ${beforeAffinity} → ${afterAffinity}`);
  parts.push(...notes);
  for(const item of items.filter(item=>item.value>0)){
    const describedByBenefit=session.pending.some(selection=>!!NPC_DIALOGUE_BENEFITS[selection.option.dialogueBenefitId??'']?.effects.items?.[item.id]);
    if(!describedByBenefit&&!parts.some(part=>part.includes(item.name)))parts.push(`你收下${item.name} ×${item.value}，放进背包`);
  }
  if (parts.length === 0) parts.push(`你和${npcNick(session.npcId)}聊了几句。`);
  if (thirdChatReminder) parts.push(thirdChatReminder);
  const joined = parts.map(part=>part.replace(/[。；]+$/u,'')).join("；");
  const text = /[。！？!?][”」』]?$/u.test(joined) ? joined : `${joined}。`;

  return {
    ok: true,
    state: draft,
    text,
    summary: {
      endReason: session.endReason,
      text,
      timeCost,
      affinityBefore: beforeAffinity,
      affinityAfter: afterAffinity,
      affinityDelta,
      deltas,
      items,
      commissionTitles,
      contactAdded,
    },
  };
}

/** 放弃临时会话；不触碰正式游戏状态。 */
export function cancelNpcConversation(session: NpcConversationSession): NpcConversationSession {
  return { ...session, status: "cancelled" };
}

/** 旧版读取接口：返回当前关系阶段的第一个节点，供旧列表/外部调用方兼容。 */
export function npcTalkTier(state: GameState, npcId: string): NpcTalkView | null {
  const started = beginNpcConversation(state, npcId, "chat");
  return started.session ? npcConversationView(state, started.session) : null;
}

/** 旧版单次选择接口：保留一次选择即结算的行为，新界面不再调用。 */
export interface NpcTalkResult {
  ok: boolean;
  reason?: string;
  text: string;
  affinity?: number;
  commission?: boolean;
}

export function chooseNpcTalkOption(state: GameState, npcId: string, idx: number): NpcTalkResult {
  const begin = beginNpcConversation(state, npcId, "chat");
  if (!begin.ok || !begin.session) return { ok: false, reason: begin.reason, text: "" };
  const advanced = advanceNpcConversation(state, begin.session, idx);
  if (!advanced.ok || !advanced.session) return { ok: false, reason: advanced.reason, text: "" };
  // 兼容调用方只选择一个旧版选项即结束，不改变新 UI 的多节点流程。
  const ended: NpcConversationSession = advanced.session.status === "ended"
    ? advanced.session
    : { ...advanced.session, status: "ended", endReason: "complete" };
  const committed = commitNpcConversation(state, ended);
  if (!committed.ok || !committed.summary) {
    return { ok: false, reason: committed.reason, text: "" };
  }
  if (committed.state) Object.assign(state, committed.state);
  return {
    ok: true,
    text: committed.text,
    affinity: committed.summary.affinityAfter,
    commission: committed.summary.commissionTitles.length > 0,
  };
}

/**
 * 对未结识的在场 NPC 定向搭话的旧接口。
 * 新场景按钮改走 beginNpcConversation；保留此函数供旧逻辑兼容，仍是固定 +3/0.5 小时。
 */
export function meetSpecificNpc(state: GameState, npcId: string): { ok: boolean; reason?: string } {
  if (!npcOrdinaryAppearanceUnlocked(state, npcId)) return { ok: false, reason: "请先完成共同初见" };
  if (findRelationship(state, npcId)) return { ok: false, reason: "你们已经认识了" };
  const def = getNpcDef(npcId);
  if (!def) return { ok: false, reason: "这里没有这个人" };
  if (!npcAtLocation(def, state.locationId, {
    ...state.time, seed: state.rng.seed, weekday: weekdayOf(state.time),
    hour: state.time.hour,
    minute: state.time.minute,
    regionId: state.region,
  })) return { ok: false, reason: "现在不在这里" };
  ensureRelationship(state, npcId);
  state.flags["socialized_once"] = true;
  addAffinity(state, npcId, 3, "meet");
  maybeAddNpcContact(state, npcId);
  pushLog(state, "👋", `你主动上前搭话，认识了${npcNick(npcId)}`);
  advanceHours(state, 0.5);
  return { ok: true };
}
