/**
 * 都市生活 v0.99 — NPC 数据访问层
 * 纯数据：不依赖游戏状态，禁止 import engine/time。
 */
import npcData from "../data/npcs.json";
import locationsData from "../data/locations.json";
import {
  NPC_DIALOGUE_SEEDS,
  npcConversationExtraChoice,
  type NpcDialogueSeed,
  type NpcTalkSpecial,
} from "../data/npcDialogueData";
import { npcDialogueRemasterData } from "../data/npcDialogueRemaster";
import type { ConversationEffects, Effects } from "../types";

/** v1.45 NPC 按排班场景选择的服装上下文。 */
export type NpcOutfitContext =
  | "service"
  | "retail"
  | "outdoor"
  | "medical"
  | "farm"
  | "station"
  | "market"
  | "casual";

export interface NpcMeetConditions {
  minCharm?: number;
  hourRange?: [number, number];
  minMoney?: number;
  /** v0.992 仅在职（state.flags.employed）时可偶遇（同事类 NPC 用） */
  requireEmployed?: boolean;
}

/** v1.44 NPC 每周作息：星期使用 0=周一 … 6=周日，时间段 end 不含。 */
export interface NpcScheduleEntry {
  weekdays: number[];
  locationId: string;
  /** 当地点 ID 在多个区域复用时，指定 NPC 实际所在的那一家。 */
  regionId?: string;
  /** 明确的个人时段；例如 [7, 9] 表示 07:00（含）至 09:00（不含）。 */
  hourRange?: [number, number];
  /** 使用地点自身营业时间；没有营业时间的地点按全天处理。 */
  allDay?: boolean;
  /** 跨午夜班次的星期按开始日计算。 */
  overnight?: boolean;
  /** 同组候选每日固定选择一处，不推进游戏随机数。 */
  randomGroup?: string;
  /** v1.45 当前排班对应的场景服装；缺省按 locationId 推断。 */
  outfitContext?: NpcOutfitContext;
}

export interface NpcPresenceTime {
  year?: number;
  month?: number;
  day?: number;
  seed?: number;
  weekday: number;
  hour: number;
  minute?: number;
  /** 当前具体区域，用于区分跨区域复用同一 locationId 的设施实例。 */
  regionId?: string;
}

/** v1.43 NPC 身份显示：不要求 known 是身份证式全名，可以是自然称呼。 */
export interface NpcIdentity {
  /** 初见时显示的身份/职业描述。 */
  descriptor: string;
  /** 相识阶段使用的熟人称呼。 */
  familiar: string;
  /** 朋友及以上使用的最终显示称呼；长辈可直接使用尊称。 */
  known: string;
}

export interface NpcDef {
  id: string;
  name: string;
  gender?: "male" | "female";
  /** 兼容旧数据的内部姓名字段；界面显示优先使用 identity。 */
  nick?: string;
  /** v1.43 分离初见身份、熟人称呼和深交后的显示称呼。 */
  identity?: NpcIdentity;
  icon?: string;
  romanceable?: boolean;
  /** 偶遇地点（locationMap 中的地点 id） */
  meetLocation?: string;
  /** v1.44 每周多地点作息；存在时优先于旧版 meetLocation/hourRange。 */
  weeklySchedule?: NpcScheduleEntry[];
  meetChance?: number;
  meetConditions?: NpcMeetConditions;
  initialAffinity?: number;
  /** 喜欢/讨厌的礼物（items.json 物品 id） */
  likes?: string[];
  dislikes?: string[];
  /** 好感达此值自动成为联系人 */
  contactAt?: number;
  /** 关系状态 → 特权 id */
  perks?: Record<string, string>;
  /** 例如 "colleague"：同事日久生情 tick 识别用 */
  type?: string;
  desc?: string;
  /**
   * v1.01 相识机制：
   * - introducedBy：由谁介绍相识（NPC id）。玩家与介绍人的好感达到 introduceAt 后，
   *   进入任意地点时由介绍人引荐，确定性相识（不再依赖偶遇概率）。
   * - introduceAt：介绍人好感阈值（默认 40）。
   * - meetVisitCount：常客保底——累计到访 meetLocation 达到该次数后必遇（默认 3），
   *   避免「脸黑永远遇不到」。0 或省略 = 不启用保底。
   * - metText：相识时的提示文案（可选；缺省用通用文案）。
   */
  introducedBy?: string;
  introduceAt?: number;
  meetVisitCount?: number;
  metText?: string;
  /** v1.3b3 网名（相识度达标后加为联系人时作为通信名，增强沉浸） */
  netName?: string;
  /** v1.3b3 网络头像（emoji） */
  netAvatar?: string;
  /** v1.43 四阶段、每阶段五节点的 Galgame 式对话内容。 */
  talk?: Partial<Record<NpcTalkStageKey, NpcTalkStage>>;
  /** 暂无正式对白时，闲聊或初见会话显示的占位台词。 */
  dialoguePlaceholder?: string;
}

export type NpcTalkStageKey = "meet" | "acquaintance" | "friend" | "close_friend";

/** v1.43 一个阶段的节点图。 */
export interface NpcTalkStage {
  start: string;
  nodes: Record<string, NpcTalkNode>;
}

/** v1.43 对话节点。 */
export interface NpcTalkNode {
  id: string;
  text: string;
  speeches?: readonly import("./npcDialoguePlayback").NpcSpeech[];
  options: NpcTalkOption[];
}

/** 兼容旧调用方的别名。 */
export interface NpcTalkTier {
  start: string;
  nodes: Record<string, NpcTalkNode>;
}

/** v1.43 对话选项；next 缺省代表阶段结束，nextStage 用于初见→相识。 */
export interface NpcTalkOption {
  /** 实体委托只提交结构化动作；不复用普通聊天奖励。 */
  npcTaskAction?: import("../npcTaskTypes").NpcTaskAction;
  npcTaskNextTopic?: string;
  disabledReason?: string;
  /** 选项文案 */
  label: string;
  /** 选中后在台词框中播放的主角完整回复；缺省由界面按选项语义补全。 */
  playerReply?: string;
  /** 可选话题中引用别人的原话，必须先实际听过。 */
  requiresHeardFlag?: string;
  /** 初见报价仅校验可用现金，不扣款。 */
  cashCondition?: { minimum?: number; below?: number };
  cashQuoteCondition?: { amount: string; affordable: boolean };
  /** 下一个节点 id */
  next?: string;
  /** 阶段结束后的阶段跳转；第一版只允许 meet → acquaintance。 */
  nextStage?: NpcTalkStageKey;
  /** 标记为离开选项；不会进入下一个节点。 */
  leave?: boolean;
  /** 先播放 NPC 对这条告别的回应，再结束；用于不建立关系的初见告别。 */
  leaveAfterNext?: boolean;
  /** 选择后好感增减（可正可负） */
  affinity?: number;
  /** 复用通用效果的即时奖励，hours 不允许出现在对话数据中。 */
  effects?: ConversationEffects;
  /** 明确接受赠物或实际食用的分支；内容由受控表定义，结束后统一结算。 */
  dialogueBenefitId?: string;
  /** 选择后日志（可选） */
  log?: string;
  /** @deprecated 旧占位帮助，仅供失效会话校验；不会展示或结算。 */
  help?: { log: string; reward?: ConversationEffects };
  /** @deprecated 旧多日占位委托，仅供失效会话校验。 */
  commission?: {
    title: string;
    desc: string;
    days: number;
    reward: Effects;
    rewardText: string;
  };
  /** v1.41：联系人达到门槛后由地区 NPC 动态提供的城市连续委托。 */
  cityCommissionId?: string;
  /** 正式对话中交付当前城市委托步骤的物品；实际扣除仍由任务结算器校验。 */
  cityCommissionDeliver?: boolean;
  /** 记录交付对应的步骤，防止旧会话在同一地点重复推进后续交付。 */
  cityCommissionStepIndex?: number;
}

const TALK_STAGE_KEYS: readonly NpcTalkStageKey[] = [
  "meet",
  "acquaintance",
  "friend",
  "close_friend",
];

function specialPatch(special: NpcTalkSpecial | undefined, option: number): Partial<NpcTalkOption> {
  if (!special || special.option !== option) return {};
  const { option: _option, ...patch } = special;
  return patch;
}

/** 将每个节点都有独立内容的种子展开为固定五节点的对话阶段。 */
export function buildNpcTalk(npcId: string, seed: NpcDialogueSeed): Partial<Record<NpcTalkStageKey, NpcTalkStage>> {
  const result: Partial<Record<NpcTalkStageKey, NpcTalkStage>> = {};
  for (const key of TALK_STAGE_KEYS) {
    const stageSeed = seed.stages[key];
    const nodes: Record<string, NpcTalkNode> = {};
    for (let index = 0; index < stageSeed.nodes.length; index += 1) {
      const nodeId = `${key}_${index + 1}`;
      const nodeSeed = stageSeed.nodes[index];
      const choiceLabels = [...nodeSeed.choices, npcConversationExtraChoice(npcId, key, index)];
      const options = choiceLabels.map((label, optionIndex): NpcTalkOption => {
        const option: NpcTalkOption = {
          label,
          affinity: nodeSeed.affinities?.[optionIndex] ?? (optionIndex === 0 ? 1 : optionIndex === 1 ? -1 : 0),
        };
        if (index < stageSeed.nodes.length - 1) {
          option.next = `${key}_${index + 2}`;
        } else if (key === "meet") {
          option.nextStage = "acquaintance";
        }
        if (optionIndex === 0 || optionIndex === 1) {
          Object.assign(option, specialPatch(nodeSeed.special, optionIndex));
        }
        return option;
      });

      if (key === "meet" && index === 0) {
        options.push({ label: "我还有点事，先走了", leave: true });
      }
      if (index === stageSeed.nodes.length - 1) {
        options.push({ label: "今天先聊到这里", leave: true });
      }

      nodes[nodeId] = {
        id: nodeId,
        text: nodeSeed.text,
        options,
      };
    }
    result[key] = { start: `${key}_1`, nodes };
  }
  return result;
}

let npcRegistry: Record<string, NpcDef> | undefined;
function registry(): Record<string, NpcDef> {
  return npcRegistry ??= Object.fromEntries(
    (npcData as unknown as NpcDef[]).map((n) => {
    const remaster = npcDialogueRemasterData()[n.id];
    const seed = NPC_DIALOGUE_SEEDS[n.id];
    if (remaster) {
      const profile = remaster.profile;
      const identity: NpcIdentity = {
        descriptor: profile.descriptor ?? n.identity?.descriptor ?? n.nick ?? n.name,
        familiar: profile.familiar ?? n.identity?.familiar ?? n.nick ?? n.name,
        known: profile.known ?? n.identity?.known ?? n.name,
      };
      return [
        n.id,
        {
          ...n,
          identity,
          desc: profile.desc ?? n.desc,
          metText: profile.metText ?? n.metText,
          talk: remaster.talk,
        },
      ];
    }
    return [n.id, seed ? { ...n, talk: buildNpcTalk(n.id, seed) } : n];
    }),
  ) as Record<string, NpcDef>;
}

const LOCATION_HOURS = new Map(
  (locationsData as Array<{ id: string; openHours?: { start: number; end: number } | null }>).map((location) => [
    location.id,
    location.openHours ?? undefined,
  ]),
);

const LOCATION_REGIONS = new Map(
  (locationsData as Array<{ id: string; regions?: string[] }>).map((location) => [
    location.id,
    location.regions ?? [],
  ]),
);

export function getNpcDef(id: string): NpcDef | undefined {
  return registry()[id];
}

export function allNpcs(): NpcDef[] {
  return Object.values(registry());
}

/**
 * 判断 NPC 在当前小时是否会出现在自己的固定地点。
 * hourRange 使用闭区间；当起点晚于终点时，按跨午夜时段处理。
 */
export function npcAvailableAt(defOrId: NpcDef | string, hour: number): boolean {
  const def = typeof defOrId === "string" ? registry()[defOrId] : defOrId;
  const range = def?.meetConditions?.hourRange;
  if (!range) return true;

  const [start, end] = range;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return true;
  return start <= end
    ? hour >= start && hour <= end
    : hour >= start || hour <= end;
}

function rangeContains(hour: number, minute: number, range: [number, number]): boolean {
  const now = hour + minute / 60;
  const [start, end] = range;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return true;
  if (start === end) return true;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

function scheduleRange(entry: NpcScheduleEntry): [number, number] {
  if (!entry.allDay) return entry.hourRange ?? [0, 24];
  const openHours = LOCATION_HOURS.get(entry.locationId);
  return openHours ? [openHours.start, openHours.end] : [0, 24];
}

/** 返回 NPC 在某个星期/时刻的作息条目；无条目表示当时不在可见地点。 */
export function npcPresenceAt(
  defOrId: NpcDef | string,
  time: NpcPresenceTime,
): NpcScheduleEntry | null {
  const def = typeof defOrId === "string" ? registry()[defOrId] : defOrId;
  if (!def) return null;

  if (def.weeklySchedule?.length) {
    const minute = time.minute ?? 0;
    const now = time.hour + minute / 60;
    const candidates = def.weeklySchedule.filter((entry) => {
      const range = scheduleRange(entry);
      const weekday = entry.overnight && range[0] > range[1] && now < range[1]
        ? (time.weekday + 6) % 7 : time.weekday;
      return entry.weekdays.includes(weekday) && rangeContains(time.hour, minute, range);
    });
    return candidates.find((entry) => {
      if (!entry.randomGroup) return true;
      const group = candidates.filter((other) => other.randomGroup === entry.randomGroup);
      // FNV hash is stable for the save seed and full date, independent of visits or RNG calls.
      const key = `${time.seed ?? 0}:${time.year ?? 0}-${time.month ?? 0}-${time.day ?? time.weekday}:${def.id}:${entry.randomGroup}`;
      let hash = 2166136261;
      for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      return group[(hash >>> 0) % group.length] === entry;
    }) ?? null;
  }

  if (!def.meetLocation || !npcAvailableAt(def, time.hour)) return null;
  return {
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    locationId: def.meetLocation,
    // Old NPC definitions have no schedule instance; use the location's first
    // configured region as their single, stable physical location.
    regionId: LOCATION_REGIONS.get(def.meetLocation)?.[0],
    hourRange: def.meetConditions?.hourRange,
  };
}

/** 判断 NPC 此刻是否在指定地点。 */
export function npcAtLocation(
  defOrId: NpcDef | string,
  locationId: string,
  time: NpcPresenceTime,
): boolean {
  const presence = npcPresenceAt(defOrId, time);
  if (presence?.locationId !== locationId) return false;
  // Omitted region keeps location-only queries useful for callers without map context.
  return !presence.regionId || !time.regionId || presence.regionId === time.regionId;
}

export function npcName(id: string): string {
  return npcKnownName(id);
}

/** 初见阶段的身份描述；兼容未补 identity 的旧 NPC。 */
export function npcDescriptor(id: string): string {
  const def = registry()[id];
  return def?.identity?.descriptor ?? def?.nick ?? def?.desc ?? def?.name ?? id;
}

/** 相识阶段的熟人称呼；兼容旧字段 nick。 */
export function npcFamiliarName(id: string): string {
  const def = registry()[id];
  return def?.identity?.familiar ?? def?.nick ?? def?.name ?? id;
}

/** 朋友及以上的最终显示称呼；长辈可以不是法定姓名。 */
export function npcKnownName(id: string): string {
  const def = registry()[id];
  return def?.identity?.known ?? def?.name ?? def?.nick ?? id;
}

/** 按对话阶段选择显示名；初见不直接暴露姓名。 */
export function npcConversationName(id: string, stage: NpcTalkStageKey): string {
  if (stage === "meet") return "？？？";
  return stage === "acquaintance" ? npcFamiliarName(id) : npcKnownName(id);
}

/** v0.991 兼容入口：返回相识阶段的熟人称呼。 */
export function npcNick(id: string): string {
  return npcFamiliarName(id);
}
