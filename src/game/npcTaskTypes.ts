import type { GameState } from "./types";
import type { NpcSpeech } from "./core/npcDialoguePlayback";

export type NpcTaskId = "zhao_toy" | "xiaoyu_print" | "farmer_delivery" | "zhao_staff";
export interface NpcStaffData {
  askedNpcIds: string[];
  clueBoyue?: boolean;
  kejieAgreed?: boolean;
  kejieDailyWage?: number;
  kejieTravelCost?: number;
  jackAgreed?: boolean;
  jackInvitedByKejie?: boolean;
  netbarStaffAgreed?: boolean;
  submittedRoute?: "netbar" | "kejie" | "pair";
  submittedAt?: number;
  /** 交付完成后的次日零点，采用与任务相同的绝对游戏分钟。 */
  settlementReadyAt?: number;
  /** 网咖路线须先在次日起向赵刚确认表现，再找老板领辛苦费。 */
  resultReviewedAt?: number;
  commission?: number;
  marginShare?: number;
}
export interface NpcTaskData {
  referencePrice?: number;
  reservationDay?: number;
  reservationPrice?: number;
  clueBoyue?: boolean;
  chenConsulted?: boolean;
  acquiredVia?: "boyue" | "reservation" | "gift";
  toyPaid?: number;
  quoteAmount?: number;
  appointmentDay?: number;
  goodPrints?: number;
  wrongPrints?: number;
  wrongShown?: boolean;
  receiptPrice?: number;
  printedAt?: number;
  loadedAt?: number;
  signedAt?: number;
  entrustedReturned?: boolean;
  staff?: NpcStaffData;
}
export interface NpcTaskProgress {
  taskId: NpcTaskId;
  stage: string;
  acceptedAt: number;
  deadlineAt: number;
  revision: number;
  data: NpcTaskData;
  outcome?: string;
  failureReason?: string;
  resolvedAt?: number;
}
export interface NpcTaskAction {
  taskId: NpcTaskId;
  action: string;
  appointmentDay?: number;
  expectedRevision?: number;
}
export interface NpcTaskChoice {
  id: string;
  label: string;
  playerReply?: string;
  action: NpcTaskAction;
  disabledReason?: string;
  /** 只切换当前临时会话的选项页，不提交动作或消耗时间。 */
  nextTopic?: string;
}
export interface NpcTaskTopic {
  id: string;
  taskId: NpcTaskId;
  npcId: string;
  channel: "formal" | "chat";
  title: string;
  description: string;
  text: string;
  /** 作者明确标记的说话人；缺省时沿用单人任务台词播放。 */
  speeches?: readonly NpcSpeech[];
  choices: NpcTaskChoice[];
  artId?: string;
  category?: "offer" | "active" | "delivery" | "history";
  playerThought?: string;
  branches?: Record<string, NpcTaskTopic>;
}
export interface NpcTaskSummary {
  title: string;
  detail: string;
  deadlineText: string;
  urgent: boolean;
  stageLabel: string;
  lines: string[];
  attachments: string[];
  outcome?: string;
}
export interface NpcTaskActionResult {
  ok: boolean;
  reason?: string;
  state?: GameState;
  text: string;
  timeCost: number;
  artId?: string;
  taskId: NpcTaskId;
}
export interface NpcTaskDocument {
  title: string;
  artId: string;
  fields: Array<{ label: string; value: string }>;
  text?: string;
}
