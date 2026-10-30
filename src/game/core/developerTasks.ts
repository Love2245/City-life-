/** 正式游戏内的调试场景。只准备状态，不调用奖励结算，也不依赖文案检测页。 */
import type { GameState, Quest } from "../types";
import type { NpcTaskId } from "../npcTaskTypes";
import { NPC_TASK_DEFINITIONS } from "../data/npcTaskData";
import { npcTaskAppointmentDays, npcTaskNow } from "./npcTasks";
import { gameDay, START_EPOCH, fromLinearDay } from "./calendar";
import { isCurrentNpcTask } from "./npcTaskAvailability";

export const DEVELOPER_TASK_PRESETS: Partial<Record<NpcTaskId, { id: string; name: string }[]>> = {
  zhao_toy: [
    { id: "reset", name: "尚未接取（清除本任务及专属物品）" },
    { id: "start", name: "已接取，寻找小熊" },
    { id: "reserved", name: "陈姐已预约，明日50元取货" },
    { id: "ready", name: "已取得小熊，等待向赵刚报价" },
    { id: "expired", name: "已过期，等待正常失败检查" },
  ],
  zhao_staff: [
    { id: "reset", name: "尚未接取（清除本任务）" },
    { id: "start", name: "已接取，开始找人" },
    { id: "kejie170", name: "范柯杰一人，150元＋20元车费" },
    { id: "kejie200", name: "范柯杰一人，200元" },
    { id: "pair170", name: "范柯杰170元＋杰克，两人答应" },
    { id: "pair200", name: "范柯杰200元＋杰克，两人答应" },
    { id: "pair300", name: "范柯杰300元主动叫上杰克" },
    { id: "netbar", name: "网咖老板答应安排两位店员" },
    { id: "reported", name: "今天已报告双人名单，等待明日反馈" },
    { id: "ready", name: "已到反馈日，双人路线等待赵刚结算" },
    { id: "netbarReady", name: "已到反馈日，店员路线等待赵刚反馈" },
    { id: "netbarBonus", name: "赵刚已反馈，等待老板给100元" },
    { id: "expired", name: "招人期限已过，等待失败检查" },
  ],
};
const TASK_ITEMS: Record<NpcTaskId, string[]> = {
  zhao_toy: ["task_toy_bear", "task_toy_ticket"],
  xiaoyu_print: ["task_print_original", "task_print_good", "task_print_wrong", "task_print_receipt"],
  farmer_delivery: ["task_delivery_appointment", "task_vegetable_crate", "task_delivery_receipt"],
  zhao_staff: [],
};
export function prepareDeveloperTask(state: GameState, taskId: NpcTaskId, preset: string): string {
  if (!isCurrentNpcTask(taskId) || !DEVELOPER_TASK_PRESETS[taskId]?.some((p) => p.id === preset)) throw new Error("任务已移除或场景不存在");
  const previous = state.quests.find((q) => q.npcTask?.taskId === taskId);
  const revision = (previous?.npcTask?.revision ?? 0) + 1;
  state.quests = state.quests.filter((q) => q.npcTask?.taskId !== taskId);
  for (const id of TASK_ITEMS[taskId]) delete state.inventory[id];
  if (preset === "reset") return "已重置任务；过去已结算的金钱和好感不会倒扣";
  const now = npcTaskNow(state), day = gameDay(state.time), def = NPC_TASK_DEFINITIONS[taskId];
  const q: Quest = { id: `q_npc_task_${taskId}`, type: "story", title: def.title, icon: def.icon, desc: def.desc,
    day, status: "active", reward: "按任务实际流程结算",
    npcTask: { taskId, stage: "seeking", acceptedAt: now, deadlineAt: now + 7 * 1440, revision, data: {} } };
  const p = q.npcTask!;
  const item = (id: string, n = 1) => { state.inventory[id] = n; };
  if (taskId === "zhao_toy") {
    p.data.referencePrice = 100;
    if (preset === "reserved") {
      p.stage = "reserved"; p.data.reservationDay = day + 1; p.data.reservationPrice = 50; item("task_toy_ticket");
    } else if (preset === "ready") {
      p.stage = "has_toy"; p.data.acquiredVia = "boyue"; p.data.toyPaid = 100; item("task_toy_bear");
    }
  } else if (taskId === "xiaoyu_print") {
    p.stage = "await_print"; item("task_print_original");
    if (preset === "wrong") { p.stage = "has_proof"; p.data.wrongPrints = 1; item("task_print_wrong"); }
    if (preset === "ready") {
      p.stage = "has_proof"; Object.assign(p.data, { goodPrints: 1, receiptPrice: 12, printedAt: now });
      item("task_print_good"); item("task_print_receipt");
    }
  } else if (taskId === "farmer_delivery") {
    const date = npcTaskAppointmentDays(state)[0];
    if (date === undefined) throw new Error("未来一周没有可配送日期");
    p.stage = "await_loading"; p.data.appointmentDay = date; item("task_delivery_appointment");
    if (["loading", "loaded", "ready", "expired"].includes(preset)) {
      Object.assign(state.time, fromLinearDay(START_EPOCH + date), { hour: preset === "loaded" ? 13 : preset === "ready" ? 15 : preset === "expired" ? 12 : 8, minute: 0 });
      if (preset === "loaded" || preset === "ready") {
        p.stage = "await_signature"; p.data.loadedAt = date * 1440 + 8 * 60 + 30; item("task_vegetable_crate", 2);
      }
      if (preset === "ready") { p.stage = "await_return"; p.data.signedAt = date * 1440 + 13 * 60 + 5; delete state.inventory.task_vegetable_crate; item("task_delivery_receipt"); }
    }
  } else {
    p.stage = "seeking_staff";
    const s = p.data.staff = { askedNpcIds: [] } as NonNullable<typeof p.data.staff>;
    if (/^(kejie|pair)/.test(preset) || ["reported", "ready"].includes(preset)) {
      s.kejieAgreed = true;
      s.kejieDailyWage = preset.endsWith("170") ? 150 : preset.endsWith("200") ? 200 : 300;
      s.kejieTravelCost = preset.endsWith("170") ? 20 : 0;
      if (preset.startsWith("pair") || ["reported", "ready"].includes(preset)) {
        s.jackAgreed = true; s.jackInvitedByKejie = s.kejieDailyWage === 300;
      }
    }
    if (preset.startsWith("netbar")) s.netbarStaffAgreed = true;
    if (["reported", "ready", "netbarReady", "netbarBonus"].includes(preset)) {
      p.stage = preset === "netbarBonus" ? "await_netbar_bonus" : "await_staff_result";
      s.submittedRoute = preset.startsWith("netbar") ? "netbar" : "pair";
      s.submittedAt = preset === "reported" ? now : now - 1440;
      s.settlementReadyAt = (Math.floor(s.submittedAt / 1440) + 1) * 1440;
      p.acceptedAt = Math.min(p.acceptedAt, s.submittedAt - 60);
      if (preset === "netbarBonus") s.resultReviewedAt = now;
    }
  }
  if (preset === "expired" && taskId !== "farmer_delivery") { p.acceptedAt = now - 8 * 1440; p.deadlineAt = now - 1; }
  state.quests.push(q);
  return "已准备任务状态和对应物品；没有发放奖励或扣除费用";
}
