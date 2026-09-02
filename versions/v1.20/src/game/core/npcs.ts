/**
 * 都市生活 v0.99 — NPC 数据访问层
 * 纯数据：不依赖游戏状态，禁止 import engine/time。
 */
import npcData from "../data/npcs.json";

export interface NpcMeetConditions {
  minCharm?: number;
  hourRange?: [number, number];
  minMoney?: number;
  /** v0.992 仅在职（state.flags.employed）时可偶遇（同事类 NPC 用） */
  requireEmployed?: boolean;
}

export interface NpcDef {
  id: string;
  name: string;
  /** v0.991 占位称呼（建立关系后显示；真名留待 1.0） */
  nick?: string;
  icon?: string;
  romanceable?: boolean;
  /** 偶遇地点（locationMap 中的地点 id） */
  meetLocation?: string;
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
}

const REGISTRY: Record<string, NpcDef> = Object.fromEntries(
  (npcData as unknown as NpcDef[]).map((n) => [n.id, n]),
);

export function getNpcDef(id: string): NpcDef | undefined {
  return REGISTRY[id];
}

export function allNpcs(): NpcDef[] {
  return Object.values(REGISTRY);
}

export function npcName(id: string): string {
  return REGISTRY[id]?.name ?? id;
}

/** v0.991 占位称呼（nick）；未提供回退真名 */
export function npcNick(id: string): string {
  return REGISTRY[id]?.nick ?? REGISTRY[id]?.name ?? id;
}
