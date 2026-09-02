/**
 * 都市生活 v1.3b3 — NPC 分层对话 + 多日委托（纯逻辑层）
 * 与 relationships / contacts 解耦：本文件只消费它们的导出函数，不反向被依赖。
 * UI 层（ScenePanel / NpcTalkModal）直接调用 get 函数与 choose 函数，
 * 不经由 actions.json 注册（对话是「指定 NPC」而非「地点通用行动」）。
 */
import type { GameState, RelationState, NpcCommission } from "../types";
import {
  findRelationship,
  ensureRelationship,
  addAffinity,
  currentState,
  STATE_LABEL,
} from "./relationships";
import { maybeAddNpcContact } from "./contacts";
import { getNpcDef, npcNick, allNpcs, type NpcTalkOption } from "./npcs";
import { applyEffects, pushLog } from "../engine";
import { advanceHours } from "./time";
import { gameDay } from "./calendar";

type TalkKey = "acquaintance" | "friend" | "close_friend";

/** 由好感推导当前对话档位 */
function talkKeyOf(affinity: number): TalkKey {
  if (affinity >= 70) return "close_friend";
  if (affinity >= 40) return "friend";
  return "acquaintance";
}

/** 当前地点在场、可被搭话/聊天的 NPC 列表（含关系状态） */
export interface PresentNpc {
  id: string;
  name: string;
  nick: string;
  icon: string;
  /** 是否已结识（有 relationship 记录） */
  known: boolean;
  /** 当前关系档位中文（未结识显示「陌生人」） */
  stateLabel: string;
  affinity: number;
}

export function presentNpcs(state: GameState): PresentNpc[] {
  return allNpcs()
    .filter((n) => n.meetLocation === state.locationId)
    .map((n) => {
      const rel = findRelationship(state, n.id);
      const label = rel ? STATE_LABEL[currentState(rel) as RelationState] : "陌生人";
      return {
        id: n.id,
        name: n.name,
        nick: n.nick ?? n.name,
        icon: n.icon ?? "🧑",
        known: !!rel,
        stateLabel: label,
        affinity: rel?.affinity ?? 0,
      };
    });
}

/** 对话视图（供 UI 渲染台词与选项） */
export interface NpcTalkView {
  npcId: string;
  name: string;
  nick: string;
  icon: string;
  stateLabel: string;
  affinity: number;
  tierKey: TalkKey;
  text: string;
  options: NpcTalkOption[];
}

/**
 * 取当前适用的对话档位。
 * - 未结识 → null（UI 改用「搭话认识」）。
 * - 有档位数据 → 返回该档台词 + 选项。
 * - 无档位数据 → 合成一段「打招呼」（小额好感，防止空对话）。
 */
export function npcTalkTier(state: GameState, npcId: string): NpcTalkView | null {
  const def = getNpcDef(npcId);
  const rel = findRelationship(state, npcId);
  if (!def || !rel) return null;
  const key = talkKeyOf(rel.affinity);
  const tier = def.talk?.[key];
  const nick = def.nick ?? def.name;
  if (tier) {
    return {
      npcId,
      name: def.name,
      nick,
      icon: def.icon ?? "🧑",
      stateLabel: STATE_LABEL[currentState(rel) as RelationState],
      affinity: rel.affinity,
      tierKey: key,
      text: tier.text,
      options: tier.options ?? [],
    };
  }
  // 无档位数据：合成通用打招呼
  return {
    npcId,
    name: def.name,
    nick,
    icon: def.icon ?? "🧑",
    stateLabel: STATE_LABEL[currentState(rel) as RelationState],
    affinity: rel.affinity,
    tierKey: key,
    text: `你跟${nick}打了个招呼。`,
    options: [{ label: "随便聊聊", affinity: 1, log: `你和${nick}闲扯了几句。` }],
  };
}

/** 选择某个对话选项后的结算结果 */
export interface NpcTalkResult {
  ok: boolean;
  reason?: string;
  /** 给玩家看的结果文案（含好感变化/奖励/委托提示） */
  text: string;
  affinity?: number;
  /** 是否接下了多日委托 */
  commission?: boolean;
}

/** 接下多日委托 → 写入任务栏（同日同 NPC 幂等） */
function addCommissionQuest(state: GameState, npcId: string, opt: NonNullable<NpcTalkOption["commission"]>): void {
  const day = gameDay(state.time);
  const id = `comm_${npcId}_${day}`;
  if (state.quests.some((q) => q.id === id)) return;
  const def = getNpcDef(npcId);
  const commission: NpcCommission = {
    npcId,
    days: opt.days,
    startDay: day,
    rewardEffects: opt.reward,
    rewardText: opt.rewardText,
  };
  state.quests.push({
    id,
    type: "story",
    title: opt.title,
    icon: def?.icon ?? "📝",
    desc: opt.desc,
    day,
    status: "active",
    reward: opt.rewardText,
    commission,
  });
  pushLog(state, "📋", `接下了${npcNick(npcId)}的委托：「${opt.title}」（约 ${opt.days} 天）`);
}

/**
 * 选择一个对话选项并结算：
 * · 好感 ±（addAffinity 自动同步状态、触发联系人门槛）
 * · help 一次性事件：结算奖励 + 日志
 * · commission 多日委托：写入任务栏
 * 每次对话消耗 0.5 小时（时间即成本，防刷）。
 */
export function chooseNpcTalkOption(state: GameState, npcId: string, idx: number): NpcTalkResult {
  const rel = findRelationship(state, npcId);
  if (!rel) return { ok: false, reason: "你们还不认识", text: "" };
  const key = talkKeyOf(rel.affinity);
  const def = getNpcDef(npcId);
  const tier = def?.talk?.[key];
  const options = tier?.options ?? (def ? [{ label: "随便聊聊", affinity: 1, log: `你和${def.nick ?? def.name}闲扯了几句。` }] : []);
  const opt = options[idx];
  if (!opt) return { ok: false, reason: "没有这个选项", text: "" };

  const before = rel.affinity;
  const after = addAffinity(state, npcId, opt.affinity ?? 0, "talk");
  maybeAddNpcContact(state, npcId);

  const parts: string[] = [];
  if (opt.affinity && opt.affinity !== 0) {
    parts.push(`好感 ${before} → ${after}`);
  }
  let commission = false;
  if (opt.help) {
    if (opt.help.reward) applyEffects(state, opt.help.reward, "🎁");
    pushLog(state, "🎁", opt.help.log);
    parts.push(opt.help.log);
  }
  if (opt.commission) {
    addCommissionQuest(state, npcId, opt.commission);
    commission = true;
    parts.push(`已接下委托「${opt.commission.title}」（${opt.commission.rewardText}）`);
  }
  if (opt.log && !opt.help) parts.push(opt.log);

  advanceHours(state, 0.5);
  const text = parts.length > 0 ? parts.join("；") : `你回应了${def?.nick ?? def?.name ?? "对方"}。`;
  return { ok: true, text, affinity: after, commission };
}

/**
 * 对未结识的在场 NPC 定向搭话（地点面板「搭话认识」按钮调用）。
 * 自然幂等：已结识则拒绝；消耗 0.5 小时。
 */
export function meetSpecificNpc(state: GameState, npcId: string): { ok: boolean; reason?: string } {
  if (findRelationship(state, npcId)) return { ok: false, reason: "你们已经认识了" };
  const def = getNpcDef(npcId);
  if (!def || def.meetLocation !== state.locationId) return { ok: false, reason: "这里没有这个人" };
  ensureRelationship(state, npcId);
  addAffinity(state, npcId, 3, "meet");
  maybeAddNpcContact(state, npcId);
  pushLog(state, "👋", `你主动上前搭话，认识了${npcNick(npcId)}`);
  advanceHours(state, 0.5);
  return { ok: true };
}
