/** 实体NPC委托：话题只读，动作在状态副本上原子提交，时间仍由统一引擎推进。 */
import type { GameState, Quest } from "../types";
import type {
  NpcTaskAction, NpcTaskActionResult, NpcTaskChoice, NpcTaskDocument,
  NpcTaskId, NpcTaskProgress, NpcTaskSummary, NpcTaskTopic,
} from "../npcTaskTypes";
import { NPC_TASK_DEFINITIONS, NPC_TASK_OFFER_TEXT, RETIRED_NPC_CITY_COMMISSION_IDS } from "../data/npcTaskData";
import { START_EPOCH, WEEKDAY_LABEL, fromLinearDay, gameDay, weekdayOf } from "./calendar";
import { addAffinity, findRelationship } from "./relationships";
import { npcAtLocation, npcPresenceAt } from "./npcs";
import { advanceHours } from "./time";
import { nextLogSequence } from "./logSequence";
import { recordMoney } from "./weekly";
import { executeNpcStaffAction, getNpcStaffTopics, npcStaffReported, npcStaffSummary } from './npcStaffTask';
import { isCurrentNpcTask, removeRetiredNpcTasks } from './npcTaskAvailability';

export { RETIRED_NPC_CITY_COMMISSION_IDS } from "../data/npcTaskData";
const WEEK = 7 * 1440;
const INTRO = 30;
const HANDOVER = 5;
const PRINT = 30;
const OWNER_IDS = new Set(["npc_zhao_gang", "npc_lin_xiaoyu", "npc_suburb_farmer"]);

export function npcTaskNow(state: GameState): number {
  return gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
}

export function getNpcTaskQuest(state: GameState, taskId: NpcTaskId): Quest | undefined {
  return state.quests.find((quest) => quest.npcTask?.taskId === taskId);
}

export function isRetiredNpcCommission(npcId: string, _title?: string): boolean {
  return OWNER_IDS.has(npcId);
}

export function isRetiredNpcCityCommission(id: string): boolean {
  return (RETIRED_NPC_CITY_COMMISSION_IDS as readonly string[]).includes(id);
}

function count(state: GameState, itemId: string): number {
  return Math.max(0, state.inventory[itemId] ?? 0);
}
function add(state: GameState, itemId: string, quantity = 1): void {
  state.inventory[itemId] = count(state, itemId) + quantity;
}
function take(state: GameState, itemId: string, quantity = 1): void {
  const left = count(state, itemId) - quantity;
  if (left > 0) state.inventory[itemId] = left;
  else delete state.inventory[itemId];
}
function changeMoney(state: GameState, amount: number): void {
  state.player.money += amount;
  if (amount !== 0) recordMoney(state, amount);
}
function relation(state: GameState, npcId: string): number {
  const rel = findRelationship(state, npcId);
  return rel?.state === "blocked" ? -1 : rel?.affinity ?? 0;
}
function present(state: GameState, npcId: string): boolean {
  return npcAtLocation(npcId, state.locationId, {
    ...state.time, seed: state.rng.seed, weekday: weekdayOf(state.time), regionId: state.region,
  });
}
function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)])) as T;
  }
  return value;
}
function log(state: GameState, taskId: NpcTaskId, text: string): void {
  const hour = state.time.hour;
  state.log.push({ sequence: nextLogSequence(state), day: state.time.day, hour,
    period: hour >= 5 && hour < 11 ? "morning" : hour >= 11 && hour < 17 ? "afternoon" : hour >= 17 && hour < 23 ? "evening" : "night",
    icon: NPC_TASK_DEFINITIONS[taskId].icon, text });
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}
function dateLabel(day: number): string {
  const date = fromLinearDay(START_EPOCH + day);
  return `${date.year}年${date.month}月${date.day}日 ${WEEKDAY_LABEL[weekdayOf(date)]}`;
}
function minuteLabel(minute: number): string {
  const day = Math.floor(minute / 1440);
  const withinDay = minute - day * 1440;
  return `${dateLabel(day)} ${String(Math.floor(withinDay / 60)).padStart(2, "0")}:${String(withinDay % 60).padStart(2, "0")}`;
}
function effectiveDeadline(progress: NpcTaskProgress): number {
  const day = progress.data.appointmentDay;
  if (progress.taskId === "farmer_delivery" && day !== undefined) {
    if (progress.stage === "await_loading") return Math.min(progress.deadlineAt, day * 1440 + 11 * 60);
    if (progress.stage === "await_signature") return Math.min(progress.deadlineAt, day * 1440 + 16 * 60);
  }
  return progress.deadlineAt;
}
function remainingFailure(state: GameState, progress: NpcTaskProgress, minutes: number): string | undefined {
  if (npcTaskNow(state) + minutes > effectiveDeadline(progress)) return "已经来不及在约定时间内完成这次办理；本次不扣钱、不交物。";
  return undefined;
}
function failureText(progress: NpcTaskProgress): string {
  if (progress.taskId === "farmer_delivery" && progress.stage === "await_loading") return "错过约定日11:00前完成装货的时段";
  if (progress.taskId === "farmer_delivery" && progress.stage === "await_signature") return "错过约定日16:00前完成签收的时段";
  return "超过七天的委托期限";
}
function fail(state: GameState, quest: Quest, reason: string, affinity = -5, outcome = "expired"): void {
  if (quest.status !== "active" || !quest.npcTask) return;
  const progress = quest.npcTask;
  quest.status = "failed";
  progress.stage = "failed";
  progress.failureReason = reason;
  progress.outcome = outcome;
  progress.resolvedAt = npcTaskNow(state);
  progress.revision += 1;
  addAffinity(state, NPC_TASK_DEFINITIONS[progress.taskId].npcId, affinity, reason);
  log(state, progress.taskId, `《${quest.title}》未完成：${reason}。好感${affinity}，本次委托已经结束。`);
}
function complete(state: GameState, quest: Quest, outcome: string, affinity: number, money: number): void {
  const progress = quest.npcTask!;
  quest.status = "done";
  progress.stage = "done";
  progress.outcome = outcome;
  changeMoney(state, money);
  if (affinity !== 0) addAffinity(state, NPC_TASK_DEFINITIONS[progress.taskId].npcId, affinity, outcome);
}

/** 每次实际时间推进后调用；只消费新任务，重复调用不会重复扣好感。 */
export function tickNpcTasks(state: GameState): void {
  removeRetiredNpcTasks(state);
  const now = npcTaskNow(state);
  for (const quest of state.quests) {
    const p = quest.npcTask;
    if (!p || quest.status !== "active") continue;
    // 一周要求是向赵刚报好人手；等待次日表现和后续领款不算找人超期。
    if (npcStaffReported(p)) continue;
    const isWindow = p.taskId === "farmer_delivery" && (p.stage === "await_loading" || p.stage === "await_signature");
    if (now > p.deadlineAt || (isWindow && now >= effectiveDeadline(p))) fail(state, quest, failureText(p));
  }
}

/** 最近两个未来日期；同时验证农场装货和老城签收的真实排班。 */
export function npcTaskAppointmentDays(state: GameState): number[] {
  const result: number[] = [];
  const today = gameDay(state.time);
  for (let offset = 1; offset <= 7 && result.length < 2; offset += 1) {
    const date = fromLinearDay(START_EPOCH + today + offset);
    if (weekdayOf(date) > 3) continue;
    const time = { ...date, seed: state.rng.seed, weekday: weekdayOf(date), hour: 8, minute: 0 };
    if (npcPresenceAt("npc_suburb_farmer", time)?.locationId !== "farm") continue;
    const receiver = npcPresenceAt("npc_snack_street_vendor", { ...time, hour: 13 });
    if (receiver?.locationId === "snack_street" && receiver.regionId === "downtown_station") result.push(today + offset);
  }
  return result;
}

function choice(taskId: NpcTaskId, action: string, label: string, progress?: NpcTaskProgress, disabledReason?: string, appointmentDay?: number): NpcTaskChoice {
  return { id: `${taskId}:${action}${appointmentDay === undefined ? "" : `:${appointmentDay}`}`, label,
    action: { taskId, action, ...(progress ? { expectedRevision: progress.revision } : {}), ...(appointmentDay === undefined ? {} : { appointmentDay }) },
    ...(disabledReason ? { disabledReason } : {}) };
}
function topic(taskId: NpcTaskId, npcId: string, channel: "chat" | "formal", category: NonNullable<NpcTaskTopic["category"]>, text: string, choices: NpcTaskChoice[], artId?: string): NpcTaskTopic {
  const def = NPC_TASK_DEFINITIONS[taskId];
  return { id: `npc_task:${taskId}:${npcId || "counter"}:${category}`, taskId, npcId, channel, category,
    title: def.title, description: category === "offer" ? "听取委托并决定是否接受 · 约30分钟" : category === "history" ? "回顾这次委托的结果" : "办理这件正在进行的委托", text, choices, artId };
}
function acknowledgment(taskId: NpcTaskId, p: NpcTaskProgress): NpcTaskChoice[] {
  return [choice(taskId, "acknowledge", "我知道了。", p)];
}
function canSpend(state: GameState, amount: number): string | undefined {
  return state.player.money < amount ? `现金不足，需要${amount}元` : undefined;
}
function printerUnavailable(state: GameState): string | undefined {
  if (state.locationId !== "internet_cafe" || !present(state, "npc_netbar_boss")) return "打印需找住宅区网咖老板：周一至周五09:00—18:00在柜台";
  const relationship = findRelationship(state, "npc_netbar_boss");
  if (!relationship || relationship.state === "blocked") return "先与柜台老板打个招呼、相识，再说明打印要求";
  const endMinute = state.time.hour * 60 + state.time.minute + PRINT - 1;
  const finishing = { ...state.time, hour: Math.floor(endMinute / 60), minute: endMinute % 60 };
  if (endMinute >= 1440 || !npcAtLocation("npc_netbar_boss", state.locationId, { ...finishing, seed: state.rng.seed, weekday: weekdayOf(finishing), regionId: state.region })) return "老板18:00下班，本次需30分钟，请在17:30前开始打印";
  return undefined;
}
function goodsUnavailable(state: GameState, p: NpcTaskProgress, minutes: number, amount = 0): string | undefined {
  return remainingFailure(state, p, minutes) ?? canSpend(state, amount);
}

export function getNpcTaskTopics(state: GameState, npcId: string, channel: "formal" | "chat"): NpcTaskTopic[] {
  if (!present(state, npcId) || relation(state, npcId) < 0) return [];
  const results: NpcTaskTopic[] = [];
  for (const def of Object.values(NPC_TASK_DEFINITIONS)) {
    if (!isCurrentNpcTask(def.id)) continue;
    if (def.id === 'zhao_staff') continue;
    const quest = getNpcTaskQuest(state, def.id);
    const p = quest?.npcTask;
    if (def.npcId === npcId && channel === "formal") {
      if (!quest) {
        if (relation(state, npcId) < 20) continue;
        const accepts = def.id === "farmer_delivery"
          ? npcTaskAppointmentDays(state).map((day) => choice(def.id, "accept", `就定${dateLabel(day)}（上午装货）`, undefined, undefined, day))
          : [choice(def.id, "accept", "交给我吧，我会在一周内回来。")];
        results.push(topic(def.id, npcId, channel, "offer", NPC_TASK_OFFER_TEXT[def.id], [...accepts, choice(def.id, "decline", "这回我恐怕腾不出空，先不答应了。")], def.id === "zhao_toy" ? "zhao-toy-poster" : def.id === "xiaoyu_print" ? "xiaoyu-original" : "farmer-appointment"));
        continue;
      }
      if (!p) continue;
      if (quest.status !== "active") {
        const returnable = quest.status === "failed" && !p.data.entrustedReturned && (
          (def.id === "xiaoyu_print" && count(state, "task_print_original") > 0) ||
          (def.id === "farmer_delivery" && count(state, "task_vegetable_crate") > 0));
        results.push(topic(def.id, npcId, channel, "history", historyText(p), returnable
          ? [choice(def.id, "return_entrusted", def.id === "xiaoyu_print" ? "把原稿还给你，不收钱。" : "把还没送出的菜筐归还，不收钱。", p)]
          : acknowledgment(def.id, p), quest.status === 'done' ? (def.id === "zhao_toy" ? "zhao-delivery-scene" : def.id === "xiaoyu_print" ? "xiaoyu-delivery-scene" : "farmer-return-scene") : undefined));
        continue;
      }
      if (def.id === "zhao_toy") {
        if (p.stage === "has_toy" && count(state, "task_toy_bear") > 0) {
          const disabled = remainingFailure(state, p, HANDOVER);
          results.push(topic(def.id, npcId, channel, "delivery", "赵刚先看了看盒子，又翻到背面找那只熊的图。\n\n『对，就是这个。我还怕给孩子拿错了。你跑这一趟，花了多少？你说个数，咱把账结了。』\n\n玩具仍在你手里。确认报价后才办理交接；本次交接约5分钟。", [
            choice(def.id, "quote_free", "不收钱了，带回去给孩子吧。", p, disabled),
            choice(def.id, "quote_standard", "按标准售价，100元。", p, disabled),
            choice(def.id, "quote_150", "150元，我也费了点工夫。", p, disabled),
            choice(def.id, "quote_200", "200元，这趟不容易。", p, disabled),
            choice(def.id, "quote_1000", "得1000元。（对方可能拒绝，这次委托将结束）", p, disabled),
          ], "zhao-delivery-scene"));
        } else {
          results.push(topic(def.id, npcId, channel, "active", "赵刚把宣传单折好。\n\n『还没拿到啊？没事，你把日子看住。别为了这点东西跟人置气。拿到了咱当面说价，没到手先不算钱。』", acknowledgment(def.id, p), "zhao-toy-poster"));
        }
      } else if (def.id === "xiaoyu_print") {
        const valid = count(state, "task_print_original") > 0 && count(state, "task_print_good") > 0 && count(state, "task_print_receipt") > 0;
        const text = valid
          ? "林小雨把样张放平，先退开两步，再俯身沿着四角看了一圈。\n\n『字没挤，边也全。就是我想看的效果。原稿和打印小票也带着吧？那咱一起交接，我把十二块打印费和二十块辛苦钱给你。』\n\n交接约5分钟，确认后收走原稿、合格样张与凭据。"
          : count(state, "task_print_wrong") > 0
            ? "林小雨没有马上接走样张，先把它和原稿的角对齐。\n\n『这张缩成A4了，你看，右下角也少了一截；灯一照，亮膜把细字盖住了。我想看的是挂起来的招牌，这个不行。』\n\n她把样张递回你手里。\n\n『没关系，你拿给我看就好。再去印A3、哑光、整图不裁边那份。错印这张留着，钱也别算进报销，咱按原先说的办。』"
            : "林小雨指了指原稿袋：『A3、哑光、完整画面不裁边。去网咖时把这三条说清楚，打印小票也别丢，回来我一起验。』";
        results.push(topic(def.id, npcId, channel, valid ? "delivery" : "active", text,
          valid ? [choice(def.id, "deliver_print", "原稿、样张和12元凭据都在，交给你。", p, remainingFailure(state, p, HANDOVER))]
            : count(state, "task_print_wrong") > 0 ? [choice(def.id, "show_wrong", "确实印错了，我会按要求重新印。", p, remainingFailure(state, p, INTRO))] : acknowledgment(def.id, p), valid ? "xiaoyu-delivery-scene" : count(state, "task_print_wrong") > 0 ? "xiaoyu-proof-wrong" : "xiaoyu-original"));
      } else {
        const day = p.data.appointmentDay!;
        if (p.stage === "await_loading") {
          const now = npcTaskNow(state);
          const disabled = gameDay(state.time) !== day || now < day * 1440 + 8 * 60
            ? `请在${dateLabel(day)}08:00—10:30开始装货` : remainingFailure(state, p, PRINT);
          results.push(topic(def.id, npcId, channel, "active", `陈守田指着筐边系好的纸条。\n\n『日子是${dateLabel(day)}，八点到十一点得装完，要半个钟头。两筐一块儿走，送老城，别跑到马师傅周末的摊位去。』`, [choice(def.id, "load_vegetables", "按约定装好两筐菜。（30分钟）", p, disabled)], "farmer-loading-scene"));
        } else if (p.stage === "await_return" && count(state, "task_delivery_receipt") > 0) {
          results.push(topic(def.id, npcId, channel, "delivery", "陈守田擦了擦手，把回执转到亮处。\n\n『两筐，马师傅签了，时间也对。行，这活儿做完了，八十块给你。单子我留着，省得两头记岔。』", [choice(def.id, "deliver_receipt", "两筐已经交齐，这是签收回执。", p, remainingFailure(state, p, HANDOVER))], "farmer-return-scene"));
        } else {
          results.push(topic(def.id, npcId, channel, "active", "陈守田看了一眼约定单：『菜得交给老城小吃街的马师傅，下午一点到四点，记着把签好的回执带回来。没有回执，我这边没法结账。』", acknowledgment(def.id, p), "farmer-appointment"));
        }
      }
    }
  }
  const toy = getNpcTaskQuest(state, "zhao_toy");
  if (npcId === "npc_chen_jie" && channel === "chat" && toy?.status === "active" && toy.npcTask) {
    const p = toy.npcTask;
    if (p.stage === "seeking" && !p.data.acquiredVia && count(state, "task_toy_bear") === 0) {
      results.push(topic("zhao_toy", npcId, channel, "active", "你把那张小熊活动宣传单递给陈姐，说明朋友早上没弄明白领取流程，想托你问问还有没有。\n\n陈姐抹了抹台面。\n\n『早上是有位大哥急了，我也不知道他叫什么。现金买饭一直收，活动报名走手机；那小熊的券是分批放的，柜台不能拿普通餐单顶。店里说快了，他越听越像要乱扣钱，就吵起来了。』\n\n『他怕花冤枉钱，我能明白。咱们先把东西和规矩问清楚，别再替谁生一回气。』", [choice("zhao_toy", "ask_chen", "那这一批小熊，还有办法拿到吗？（约30分钟）", p, remainingFailure(state, p, INTRO))], "zhao-counter-scene"));
    } else if (p.stage === "reserved") {
      const ready = gameDay(state.time) >= p.data.reservationDay!;
      results.push(topic("zhao_toy", npcId, channel, "active", `陈姐指了指取货单：『我答应的这一份给你留着。${dateLabel(p.data.reservationDay!)}起，拿单子到这儿交五十块成本就行。我不当班也照样认单，别为这事白跑。』`, [choice("zhao_toy", "pickup_reserved", "凭单支付50元取货。（5分钟）", p, ready ? goodsUnavailable(state, p, HANDOVER, p.data.reservationPrice!) : "约定次日起才可领取")], "zhao-toy-ticket"));
    }
  }
  const printQuest = getNpcTaskQuest(state, "xiaoyu_print");
  if (npcId === "npc_netbar_boss" && channel === "chat" && printQuest?.status === "active" && printQuest.npcTask && count(state, "task_print_original") > 0) {
    results.push(printServiceTopic(state, printQuest.npcTask, npcId, channel));
  }
  const vegetables = getNpcTaskQuest(state, "farmer_delivery");
  if (npcId === "npc_snack_street_vendor" && channel === "chat" && state.locationId === "snack_street" && vegetables?.status === "active" && vegetables.npcTask?.stage === "await_signature") {
    const p = vegetables.npcTask;
    const day = p.data.appointmentDay!;
    const disabled = gameDay(state.time) !== day || state.time.hour < 13 ? "请在约定日13:00—15:55办理签收"
      : count(state, "task_vegetable_crate") < 2 ? "随身背包里需要陈叔托运的两筐任务鲜蔬" : remainingFailure(state, p, HANDOVER);
    results.push(topic("farmer_delivery", npcId, channel, "delivery", "马师傅把锅铲搁在一边，先看筐上的纸条。\n\n『陈叔那两筐？放这儿阴凉点，我数一下。』\n\n他掀开盖布，翻看了底下的菜叶。\n\n『两筐齐，没闷坏。回执给你，你带回去让他结劳务。菜钱我和他另算，不让你夹在中间。』", [choice("farmer_delivery", "sign_vegetables", "交出两筐菜，请马师傅签收。（5分钟）", p, disabled)], "farmer-delivery-scene"));
  }
  return [...results.filter(result => isCurrentNpcTask(result.taskId)), ...getNpcStaffTopics(state, npcId, channel)];
}

function printServiceTopic(state: GameState, p: NpcTaskProgress, npcId = "", channel: "chat" | "formal" = "chat"): NpcTaskTopic {
  return topic("xiaoyu_print", npcId, channel, "active", "柜台旁的打印机亮着待机灯。价目表分两行：\n\nA4亮面传单版 · 8元：缩印、裁去外缘，表面覆亮膜。\nA3哑光整图版 · 12元：保留完整设计和四角标记，不裁边。\n\n每次打印约30分钟。林小雨的原稿要求A3、哑光、完整画面；确认哪一份，就付哪一份的钱。", [
    choice("xiaoyu_print", "print_wrong", "印A4亮面传单版，8元。（30分钟）", p, printerUnavailable(state) ?? goodsUnavailable(state, p, PRINT, 8)),
    choice("xiaoyu_print", "print_good", "印A3哑光整图版，12元。（30分钟）", p, printerUnavailable(state) ?? goodsUnavailable(state, p, PRINT, 12)),
  ], "xiaoyu-print-scene");
}

export function getNpcTaskCounterTopics(state: GameState): NpcTaskTopic[] {
  const results: NpcTaskTopic[] = [];
  const toy = getNpcTaskQuest(state, "zhao_toy");
  if (toy?.status === "active" && toy.npcTask && !toy.npcTask.data.acquiredVia && count(state, "task_toy_bear") === 0) {
    const p = toy.npcTask;
    if (state.locationId === "boyue_fast_food") {
      results.push(topic("zhao_toy", "", "chat", "active", "泊月快餐店的活动柜台里，还有同款小熊的独立包装。\n\n屏幕显示：原创联名小熊摆件，店内标准售价100元，活动剩余现货可直接购买。工作人员确认就是宣传单上的那一款。\n\n是否支付100元购买一份？办理约5分钟，确认后才扣款。", [choice("zhao_toy", "buy_toy", "确认支付100元购买。", p, goodsUnavailable(state, p, HANDOVER, p.data.referencePrice!)), choice("zhao_toy", "cancel", "先不买，我再想想。", p)], "zhao-toy-box"));
    }
    if (state.locationId === "fast_food" && p.stage === "reserved") {
      const ready = gameDay(state.time) >= p.data.reservationDay!;
      results.push(topic("zhao_toy", "", "chat", "active", `柜台核对了陈姐留下的预约单。\n\n约定日期：${dateLabel(p.data.reservationDay!)}起。约定成本：${p.data.reservationPrice}元。\n陈姐今天不在也可以凭原单领取；本次办理约5分钟。`, [choice("zhao_toy", "pickup_reserved", "凭单支付50元领取小熊。", p, ready ? goodsUnavailable(state, p, HANDOVER, p.data.reservationPrice!) : "还没到约定取货日期"), choice("zhao_toy", "cancel", "暂时不取。", p)], "zhao-toy-ticket"));
    }
  }
  const printQuest = getNpcTaskQuest(state, "xiaoyu_print");
  if (state.locationId === "internet_cafe" && printQuest?.status === "active" && printQuest.npcTask && count(state, "task_print_original") > 0) {
    results.push(printServiceTopic(state, printQuest.npcTask));
  }
  return results.filter(result => isCurrentNpcTask(result.taskId));
}

function historyText(p: NpcTaskProgress): string {
  if (p.taskId === "zhao_toy") {
    if (p.outcome === "gift") return "赵刚把盒子放进包的最上面，拉链留到最后才拉上。\n\n『钱你都不收，我再多说就假了。孩子拿到，我让他好好给你说声谢谢。你以后有事也直说。』";
    if (p.outcome === "standard") return "赵刚数了一百二十块递来。\n\n『一百是东西的钱，二十是你跑腿的。别推了，我知道光找这个就得费工夫。这回算你帮我把脸找回来了。』";
    if (p.outcome === "marked_up_150") return "赵刚点清一百五十块，把盒子收进包里。\n\n『行，说好的数。谢了，我带回去。』他低头把宣传单也塞了进去，没有再多说。";
    if (p.outcome === "marked_up_200") return "赵刚把两百块递过来，又用手指敲了敲宣传单上的标价。\n\n『单子上一百，你给我算二百……行，我应了就给。下次有加的钱，你先告诉我，别等东西拎到跟前才说。』";
    if (p.outcome === "extortion") return "赵刚没有接盒子，把手里的钱又收了回去。\n\n『一千？我看不懂手机，不是看不懂这张一百的价签。你把我当什么人了？东西你留着，这事到这儿。』\n\n这次委托已结束。玩具仍归你所有，不能重新报价。";
    return `赵刚把折好的宣传单塞进兜里：『过了日子就算了。我答应孩子的，我自己再想办法。』\n\n失败原因：${p.failureReason ?? "本次委托未完成"}。自费取得的玩具仍归你所有。`;
  }
  if (p.taskId === "xiaoyu_print") return p.outcome === "printed"
    ? "林小雨把合格样张贴到墙边，向后退了两步。\n\n『这下能看出来了，最下面那行还得再拉开一点。你把我纸上的几句话当回事，我省了好多猜。十二块打印费、二十块辛苦钱，都结清了。』"
    : `林小雨把空下来的稿袋收好：『这回赶不上，就先停。我得重新排时间，原稿还在你那里就带回来，别弄丢。』\n\n失败原因：${p.failureReason ?? "本次委托未完成"}。错印或自费样张由你保留，归还原稿不会改写这次结果。`;
  return p.outcome === "delivered"
    ? "陈守田把回执夹进账本，拿铅笔划掉两筐。\n\n『菜到、单回、钱清，利利索索。你这人记时辰，下回有别的活儿我心里有数。』"
    : `陈守田把约定单翻过来，重新记了一行。\n\n『这个时辰过了，晚市就得另想办法。没送出去的菜别在路上搁着，带回我这儿。账不能算做完，东西得有着落。』\n\n失败原因：${p.failureReason ?? "本次委托未完成"}。归还受托菜筐不发奖励，也不撤销失败。`;
}

export function npcTaskSummary(state: GameState, quest: Quest): NpcTaskSummary {
  const p = quest.npcTask;
  if (!p) return { title: quest.title, detail: quest.desc, deadlineText: "", urgent: false, stageLabel: quest.status, lines: [], attachments: [] };
  if (p.taskId === 'zhao_staff') return npcStaffSummary(state, quest);
  const taskId = p.taskId;
  let detail = "";
  let stageLabel = "进行中";
  const lines: string[] = [];
  const attachments: string[] = [];
  if (taskId === "zhao_toy") {
    attachments.push("zhao-toy-poster", "zhao-toy-box");
    lines.push(`接取时约定的参考售价：${p.data.referencePrice}元`, `随身小熊：${count(state, "task_toy_bear")}份`);
    if (p.stage === "seeking") { stageLabel = "寻找联名小熊"; detail = "到快餐店询问活动，找到宣传单上的同款小熊。"; }
    if (p.data.clueBoyue) lines.push("已听到的线索：陈姐建议去泊月新区的快餐分店看看。");
    if (p.stage === "reserved") { stageLabel = "等待预约取货"; detail = `${dateLabel(p.data.reservationDay!)}起，凭单到老城快餐厅支付${p.data.reservationPrice}元领取。`; }
    if (p.stage === "has_toy") { stageLabel = "带回小熊，当面报价"; detail = "到赵刚身边选择正式对话，交付前决定报价。"; }
    if (p.data.chenConsulted) attachments.push("zhao-counter-scene");
    if (p.data.reservationDay !== undefined) attachments.push("task_toy_ticket");
    if (p.data.acquiredVia && p.data.acquiredVia !== 'boyue') attachments.push("zhao-pickup-scene");
    if (quest.status === 'done' && p.data.quoteAmount !== undefined) attachments.push("zhao-delivery-scene");
    if (p.data.acquiredVia) lines.push(`本次实际取得成本：${p.data.toyPaid ?? 0}元`);
    if (p.data.quoteAmount !== undefined) lines.push(`本次报价：${p.data.quoteAmount}元`);
  } else if (taskId === "xiaoyu_print") {
    attachments.push("task_print_original");
    if ((p.data.goodPrints ?? 0) > 0) attachments.push("task_print_good");
    if ((p.data.wrongPrints ?? 0) > 0) attachments.push("task_print_wrong");
    lines.push("要求：A3、哑光、完整画面不裁边", "办理地点：住宅区网咖，找老板（周一至周五09:00—18:00）", "正确打印费12元，劳务费20元；错印费用自付。", `原稿${count(state, "task_print_original")}份 · 合格样张${count(state, "task_print_good")}份 · 错印样张${count(state, "task_print_wrong")}份 · 凭据${count(state, "task_print_receipt")}张`);
    stageLabel = p.stage === "has_proof" ? "带回样张验收" : "到网咖打印样张";
    detail = "拿原稿去网咖，合格样张、原稿和12元凭据一起交给林小雨。";
    if (p.data.goodPrints) attachments.push("task_print_receipt");
    if ((p.data.goodPrints ?? 0) + (p.data.wrongPrints ?? 0) > 0) attachments.push("xiaoyu-print-scene");
    if (p.outcome === "printed") attachments.push("xiaoyu-delivery-scene");
  } else {
    const day = p.data.appointmentDay!;
    attachments.push("task_delivery_appointment");
    lines.push(`约定日期：${dateLabel(day)}`, "农场装货：08:00—11:00完成（耗时30分钟）", "老城小吃街签收：13:00—16:00完成（耗时5分钟）", `任务鲜蔬${count(state, "task_vegetable_crate")}筐 · 收货回执${count(state, "task_delivery_receipt")}张`);
    if (p.stage === "await_loading") { stageLabel = "按约到农场装货"; detail = `在${dateLabel(day)}上午到农场找陈守田，最迟10:30开始装货。`; }
    if (p.stage === "await_signature") { stageLabel = "送两筐菜到老城"; detail = "带两筐任务鲜蔬到老城区小吃街找马师傅，最迟15:55开始签收。"; }
    if (p.stage === "await_return") { stageLabel = "带签收回执回农场"; detail = "找到陈守田，正式对话交回回执，结清80元劳务。"; attachments.push("task_delivery_receipt"); }
    if (p.data.signedAt !== undefined && !attachments.includes("task_delivery_receipt")) attachments.push("task_delivery_receipt");
    if (p.data.loadedAt !== undefined) attachments.push("farmer-loading-scene");
    if (p.data.signedAt !== undefined) attachments.push("farmer-delivery-scene");
    if (p.outcome === "delivered") attachments.push("farmer-return-scene");
  }
  if (quest.status !== "active") {
    stageLabel = quest.status === "done" ? "已完成" : "未完成";
    detail = quest.status === "done" ? '物品与费用已经当面结清，下面保留这次委托的结果。' : `失败原因：${p.failureReason ?? "委托未完成"}`;
    lines.push(p.data.entrustedReturned ? "受托物品已经归还；本次结果保留。" : "本次故事已经结束，不会重新发放。");
  }
  return { title: quest.title, detail, deadlineText: `截止：${minuteLabel(p.deadlineAt)}`, urgent: quest.status === "active" && effectiveDeadline(p) - npcTaskNow(state) <= 1440,
    stageLabel, lines, attachments, outcome: p.outcome ? historyText(p) : undefined };
}

export function getNpcTaskDocument(state: GameState, itemId: string): NpcTaskDocument | undefined {
  const toy = getNpcTaskQuest(state, "zhao_toy")?.npcTask;
  const print = getNpcTaskQuest(state, "xiaoyu_print")?.npcTask;
  const vegetables = getNpcTaskQuest(state, "farmer_delivery")?.npcTask;
  if ((itemId === "task_toy_ticket" || itemId === "zhao-toy-ticket") && toy?.data.reservationDay !== undefined) return {
    title: "小熊预约取货单", artId: "zhao-toy-ticket", fields: [{ label: "取货地点", value: "老城快餐厅柜台" }, { label: "可领取日期", value: `${dateLabel(toy.data.reservationDay)}起` }, { label: "已约定成本", value: `${toy.data.reservationPrice}元` }, { label: "数量", value: "一份小熊，凭单领取，陈姐休息仍可办理" }], text: "请在赵刚委托总期限内领取。取走小熊后，原单核销。",
  };
  if (["task_print_original", "task_print_good", "task_print_wrong", "task_print_receipt", "xiaoyu-original", "xiaoyu-proof-good", "xiaoyu-proof-wrong", "xiaoyu-print-receipt"].includes(itemId) && print) {
    const wrong = itemId === "task_print_wrong" || itemId === "xiaoyu-proof-wrong";
    const receipt = itemId === "task_print_receipt" || itemId === "xiaoyu-print-receipt";
    const original = itemId === "task_print_original" || itemId === "xiaoyu-original";
    return { title: original ? "林小雨的设计原稿" : receipt ? "合格样张打印凭据" : wrong ? "A4亮面错印样张" : "A3哑光整图样张", artId: original ? "xiaoyu-original" : receipt ? "xiaoyu-print-receipt" : wrong ? "xiaoyu-proof-wrong" : "xiaoyu-proof-good", fields: [
      { label: "规格", value: wrong ? "A4 · 亮面 · 缩印裁边" : "A3 · 哑光 · 整图不裁边" },
      { label: "委托人", value: "林小雨" },
      ...(receipt ? [{ label: "本份合格打印费", value: "12元" }, { label: "打印时间", value: print.data.printedAt === undefined ? "尚未打印" : minuteLabel(print.data.printedAt) }] : []),
    ], text: wrong ? "右下角定位标记和外缘画面缺失，亮面反光；这份成品不能完成委托。" : "完整画面保留四角标记。原稿、这份合格样张与12元凭据一并交接。" };
  }
  if (["task_delivery_appointment", "task_delivery_receipt", "farmer-appointment", "farmer-receipt"].includes(itemId) && vegetables?.data.appointmentDay !== undefined) {
    const receipt = itemId === "task_delivery_receipt" || itemId === "farmer-receipt";
    return { title: receipt ? "马师傅的收货回执" : "两筐菜送货约定单", artId: receipt ? "farmer-receipt" : "farmer-appointment", fields: [
      { label: "约定日期", value: dateLabel(vegetables.data.appointmentDay) }, { label: "数量", value: "受托鲜蔬两筐" }, { label: "装货", value: "农场，08:00—11:00完成，需30分钟" },
      { label: "收货", value: "老城区小吃街，马师傅，13:00—16:00完成，需5分钟" },
      ...(receipt ? [{ label: "签收时间", value: vegetables.data.signedAt === undefined ? "尚未签收" : minuteLabel(vegetables.data.signedAt) }, { label: "签收人", value: vegetables.data.signedAt === undefined ? "未签" : "马师傅 · 已验两筐" }] : [{ label: "劳务", value: "回执交回后支付80元" }]),
    ] };
  }
  if ((itemId === "task_toy_bear" || itemId === "zhao-toy-poster" || itemId === "zhao-toy-box") && toy) return { title: "快餐联名小熊", artId: itemId === "task_toy_bear" ? "zhao-toy-box" : itemId, fields: [{ label: "活动参考售价", value: `${toy.data.referencePrice}元` }, { label: "规格", value: "暖棕色小熊、奶油色肚皮与爪印，透明展示盒一份" }], text: "赵刚提供的活动宣传单。购买前请自行向柜台确认现货。" };
  return undefined;
}

/** 所有钱物/结果校验完成后才复制并提交，失败返回绝不修改传入状态。 */
export function executeNpcTaskAction(state: GameState, npcId: string | null, action: NpcTaskAction): NpcTaskActionResult {
  const reject = (reason: string): NpcTaskActionResult => ({ ok: false, reason, text: "", timeCost: 0, taskId: action.taskId });
  if (!isCurrentNpcTask(action.taskId)) return reject("这项样板任务已移除");
  const def = NPC_TASK_DEFINITIONS[action.taskId];
  if (!def) return reject("没有这个NPC委托");
  if (state.endingId) return reject("当前人生已经结束");
  if (state.districtLeisure?.active) return reject("请先结束当前活动再办理委托");
  if (npcId && (!present(state, npcId) || relation(state, npcId) < 0)) return reject("对方现在不在这里或不愿与你交谈");
  if (action.taskId === 'zhao_staff') return executeNpcStaffAction(state, npcId, action);
  const quest = getNpcTaskQuest(state, action.taskId);
  const p = quest?.npcTask;
  if (action.expectedRevision !== undefined && (!p || p.revision !== action.expectedRevision)) return reject("这件事的进度已经改变，请重新查看话题");
  const owner = npcId === def.npcId;
  const active = quest?.status === "active";
  const now = npcTaskNow(state);
  if (action.action === "decline") {
    if (quest || !owner || relation(state, npcId!) < 20) return reject("这个委托目前不能接取或拒绝");
    return { ok: true, state: clone(state), text: action.taskId === "zhao_toy" ? "赵刚把单子收回去：『没空就不勉强。先说清楚，比答应了晾着强。』" : action.taskId === "xiaoyu_print" ? "林小雨把原稿放回包里：『没关系，那我再排一下时间。』" : "陈守田收起铅笔：『行，别把时辰硬挤到一块儿。』", timeCost: 0, taskId: action.taskId };
  }
  if (action.action === "cancel") {
    if (!active || !getNpcTaskCounterTopics(state).some((entry) => entry.taskId === action.taskId)) return reject("这里没有这项可取消的柜台办理");
    return { ok: true, state: clone(state), text: "你暂时没有办理，钱和物品都没有变化，之后还可以回来。", timeCost: 0, taskId: action.taskId };
  }
  if (action.action === "acknowledge") {
    if (!quest || !npcId || !getNpcTaskTopics(state, npcId, owner ? "formal" : "chat").some((entry) => entry.taskId === action.taskId)) return reject("现在没有这项话题");
    return { ok: true, state: clone(state), text: "你记下了这件事。", timeCost: 0, taskId: action.taskId };
  }
  let minutes = HANDOVER;
  let text = "";
  let artId: string | undefined;
  let mutate: (draft: GameState, draftQuest: Quest | undefined) => void;
  if (action.action === "accept") {
    if (quest || !owner || relation(state, npcId!) < 20) return reject("未达到相识好感20，或本次委托已有永久记录");
    if (action.taskId === "farmer_delivery" && !npcTaskAppointmentDays(state).includes(action.appointmentDay!)) return reject("请选择最近两个实际可装货并在老城签收的约定日期");
    minutes = INTRO;
    text = action.taskId === "zhao_toy" ? "赵刚把单子折好交给你：『那我等你信。价先看清楚，别跟人再吵起来。拿回来咱再结账。』\n\n委托已加入待办，七天倒计时开始。" : action.taskId === "xiaoyu_print" ? "林小雨把原稿袋交到你手里：『三条要求都写着，按这个就行。办完把原稿和小票也带回来。』\n\n原稿已放入随身背包，七天倒计时开始。" : `陈守田把日子圈了起来：『就定${dateLabel(action.appointmentDay!)}。上午装完、下午交齐，回来拿八十。』\n\n送货约定单已放入随身背包。`;
    artId = action.taskId === "zhao_toy" ? "zhao-toy-poster" : action.taskId === "xiaoyu_print" ? "xiaoyu-original" : "farmer-appointment";
    mutate = (draft) => {
      const progress: NpcTaskProgress = { taskId: def.id, stage: def.id === "zhao_toy" ? "seeking" : def.id === "xiaoyu_print" ? "await_print" : "await_loading", acceptedAt: now, deadlineAt: now + WEEK, revision: 1, data: def.id === "zhao_toy" ? { referencePrice: 100 } : def.id === "farmer_delivery" ? { appointmentDay: action.appointmentDay } : {} };
      draft.quests.push({ id: `q_npc_task_${def.id}`, type: "story", title: def.title, icon: def.icon, desc: def.desc, day: gameDay(draft.time), status: "active", reward: def.id === "farmer_delivery" ? "80元 · 好感+8" : def.id === "xiaoyu_print" ? "32元（含12元打印费）· 好感+6" : "当面议价", npcTask: progress });
      if (def.id === "xiaoyu_print") add(draft, "task_print_original");
      if (def.id === "farmer_delivery") add(draft, "task_delivery_appointment");
    };
  } else if (action.action === "return_entrusted") {
    if (quest?.status !== "failed" || !p || !owner || p.data.entrustedReturned) return reject("没有可归还的受托物品");
    const itemId = action.taskId === "xiaoyu_print" ? "task_print_original" : action.taskId === "farmer_delivery" ? "task_vegetable_crate" : "";
    if (!itemId || count(state, itemId) === 0) return reject("背包里没有尚未归还的受托物品");
    text = action.taskId === "xiaoyu_print" ? "林小雨检查原稿后收好：『纸还在就好。这回的事已经过去，我另排时间。』\n\n归还原稿，没有奖励，本次失败记录保留。" : "陈守田把剩下的菜筐接过去：『东西拿回来了，我心里有数。晚市那头我另安排，这次就不算做完。』\n\n受托菜筐已全部归还，没有奖励，本次失败记录保留。";
    mutate = (draft, q) => { take(draft, itemId, count(draft, itemId)); q!.npcTask!.data.entrustedReturned = true; };
  } else {
    if (!active || !p) return reject("本次委托没有进行中，已结束的故事不能重新办理");
    const expired = now > p.deadlineAt || (p.taskId === "farmer_delivery" && (p.stage === "await_loading" || p.stage === "await_signature") && now >= effectiveDeadline(p));
    if (expired) return reject("约定时间已经过去，请查看待办中的失败记录");
    const task = action.taskId;
    if (task === "zhao_toy" && action.action === "ask_chen") {
      if (npcId !== "npc_chen_jie" || p.stage !== "seeking" || p.data.acquiredVia || count(state, "task_toy_bear") > 0) return reject("现在不能再向陈姐重复领这份小熊");
      minutes = INTRO;
      const affinity = relation(state, npcId);
      artId = affinity >= 70 ? "zhao-pickup-scene" : "zhao-counter-scene";
      text = affinity < 20 ? "陈姐看过宣传单，把它轻轻推回来。\n\n『这一批柜台的都发完了，真没法再给你一份。抱歉，让你白问了。』\n\n本店这条路暂时没有进展。" : affinity < 40 ? "陈姐朝后面的货架看了看。\n\n『我们这儿这一批确实没有了。你要是不嫌跑远，去泊月新区商场那家分店问问，那边走的货慢一点。你过去先问清楚有没有现货，别急着付钱。』\n\n分店线索已记入待办。" : affinity < 70 ? "陈姐想了一会儿，抽出一张取货单。\n\n『我去问问调配，给你匀一份。明天起过来，五十块成本价，不算你活动餐的钱。我休息也没事，单子给柜台看，他们认。』\n\n你收到了预约取货单；次日起可按约支付50元领取。" : "陈姐朝门边望了望，压低声音。\n\n『这周的真发完了。今早刚到的是下周的新货，我给你先拿一个，别满店嚷。孩子等着呢，不收你钱。』\n\n她在柜台侧边拆开外箱，挑出一份完整包装递给你。\n\n联名小熊已放入随身背包。";
      mutate = (draft, q) => {
        const data = q!.npcTask!.data;
        data.chenConsulted = true;
        if (affinity >= 70) { add(draft, "task_toy_bear"); q!.npcTask!.stage = "has_toy"; data.acquiredVia = "gift"; data.toyPaid = 0; }
        else if (affinity >= 40) { data.reservationDay = gameDay(draft.time) + 1; data.reservationPrice = data.referencePrice! / 2; q!.npcTask!.stage = "reserved"; add(draft, "task_toy_ticket"); }
        else if (affinity >= 20) data.clueBoyue = true;
      };
    } else if (task === "zhao_toy" && (action.action === "buy_toy" || action.action === "pickup_reserved")) {
      const buying = action.action === "buy_toy";
      if (p.data.acquiredVia || count(state, "task_toy_bear") > 0) return reject("这次委托的小熊已经取得，不能重复领取");
      if (buying) {
        if (npcId !== null || state.locationId !== "boyue_fast_food" || !["seeking", "reserved"].includes(p.stage)) return reject("只能在泊月快餐店柜台确认购买");
      } else {
        if (state.locationId !== "fast_food" || (npcId !== null && npcId !== "npc_chen_jie") || p.stage !== "reserved" || count(state, "task_toy_ticket") < 1) return reject("需到老城快餐厅出示本次预约取货单");
        if (gameDay(state.time) < p.data.reservationDay!) return reject("还没到约定的次日取货时间");
      }
      const price = buying ? p.data.referencePrice! : p.data.reservationPrice!;
      if (state.player.money < price) return reject(`现金不足，需要${price}元；本次不扣款`);
      text = `你支付${price}元，柜台核对包装后交给你一份联名小熊。\n\n小熊已放入随身背包，回到赵刚身边通过正式对话交付。`;
      artId = buying ? "zhao-toy-box" : "zhao-pickup-scene";
      mutate = (draft, q) => { changeMoney(draft, -price); add(draft, "task_toy_bear"); take(draft, "task_toy_ticket", count(draft, "task_toy_ticket")); q!.npcTask!.stage = "has_toy"; q!.npcTask!.data.acquiredVia = buying ? "boyue" : "reservation"; q!.npcTask!.data.toyPaid = price; };
    } else if (task === "zhao_toy" && ["quote_free", "quote_standard", "quote_150", "quote_200", "quote_1000"].includes(action.action)) {
      if (!owner || p.stage !== "has_toy" || count(state, "task_toy_bear") < 1) return reject("需拿到本次小熊，回赵刚身边当面交付");
      const quote = action.action === "quote_free" ? 0 : action.action === "quote_standard" ? p.data.referencePrice! : action.action === "quote_150" ? p.data.referencePrice! * 1.5 : action.action === "quote_200" ? p.data.referencePrice! * 2 : p.data.referencePrice! * 10;
      const outcome = action.action === "quote_free" ? "gift" : action.action === "quote_standard" ? "standard" : action.action === "quote_150" ? "marked_up_150" : action.action === "quote_200" ? "marked_up_200" : "extortion";
      const affinity = quote === 0 ? 10 : action.action === "quote_standard" ? 5 : 0;
      const money = action.action === "quote_standard" ? quote + 20 : quote;
      const responseProgress = { ...p, outcome };
      text = historyText(responseProgress) + (outcome === "extortion" ? "\n\n任务失败 · 好感−10 · 玩具保留 · 未付款。" : `\n\n交出小熊 · 收到${money}元${affinity ? ` · 好感+${affinity}` : " · 好感不变"}。`);
      artId = outcome === 'extortion' ? undefined : "zhao-delivery-scene";
      mutate = (draft, q) => { q!.npcTask!.data.quoteAmount = quote; if (outcome === "extortion") fail(draft, q!, "报价为参考售价十倍，赵刚拒绝交易", -10, outcome); else { take(draft, "task_toy_bear"); complete(draft, q!, outcome, affinity, money); } };
    } else if (task === "xiaoyu_print" && (action.action === "print_good" || action.action === "print_wrong")) {
      if (state.locationId !== "internet_cafe" || (npcId !== null && npcId !== "npc_netbar_boss") || count(state, "task_print_original") < 1 || !["await_print", "has_proof"].includes(p.stage)) return reject("需带原稿到网咖办理打印");
      const unavailable = printerUnavailable(state);
      if (unavailable) return reject(unavailable);
      const good = action.action === "print_good";
      const price = good ? 12 : 8;
      if (state.player.money < price) return reject(`现金不足，需要${price}元；本次不扣款、不出纸`);
      minutes = PRINT;
      text = good ? "打印机慢慢吐出完整的A3哑光样张，四角定位标记都在。你核对了原稿，收好12元打印凭据。\n\n合格样张和凭据已放入背包，原稿仍在。" : "机器吐出一张A4亮面传单。它比原稿缩小，外缘和右下角标记被裁掉，灯光在表面映出一片白。\n\n错印样张已放入背包，花费8元；原稿仍在，可以重新打印。";
      artId = "xiaoyu-print-scene";
      mutate = (draft, q) => { changeMoney(draft, -price); add(draft, good ? "task_print_good" : "task_print_wrong"); if (good) { add(draft, "task_print_receipt"); q!.npcTask!.data.goodPrints = (q!.npcTask!.data.goodPrints ?? 0) + 1; q!.npcTask!.data.receiptPrice = 12; q!.npcTask!.data.printedAt = now + PRINT; } else q!.npcTask!.data.wrongPrints = (q!.npcTask!.data.wrongPrints ?? 0) + 1; q!.npcTask!.stage = "has_proof"; };
    } else if (task === "xiaoyu_print" && action.action === "show_wrong") {
      if (!owner || count(state, "task_print_wrong") < 1) return reject("需把实际错印样张带给林小雨查看");
      minutes = INTRO;
      text = "林小雨把错印样张退回你手里：『缩成A4、覆了亮膜，边也裁了。你看这几个角就明白。别急，还有时间，按A3哑光整图版重新印。』\n\n样张仍在背包，没有交接、报销或任务奖励。";
      artId = "xiaoyu-proof-wrong";
      mutate = (_draft, q) => { q!.npcTask!.data.wrongShown = true; };
    } else if (task === "xiaoyu_print" && action.action === "deliver_print") {
      if (!owner || !["task_print_original", "task_print_good", "task_print_receipt"].every((id) => count(state, id) >= 1) || p.data.receiptPrice !== 12 || !p.data.goodPrints) return reject("请带齐原稿、实际合格样张和本次12元打印凭据");
      text = historyText({ ...p, outcome: "printed" }) + "\n\n交出原稿、合格样张与凭据各一份 · 收到32元 · 好感+6。错印费用未报销。";
      artId = "xiaoyu-delivery-scene";
      mutate = (draft, q) => { for (const id of ["task_print_original", "task_print_good", "task_print_receipt"]) take(draft, id); complete(draft, q!, "printed", 6, 32); };
    } else if (task === "farmer_delivery" && action.action === "load_vegetables") {
      if (!owner || state.locationId !== "farm" || p.stage !== "await_loading" || gameDay(state.time) !== p.data.appointmentDay || state.time.hour < 8) return reject("需在约定日上午8点后到农场找陈叔装货");
      minutes = PRINT;
      text = "陈守田挑掉两片压伤的叶子，把盖布掖好。你们核对数量，把两筐菜装稳。\n\n背包获得任务鲜蔬两筐。下午13:00—16:00完成老城区小吃街马师傅的签收。";
      artId = "farmer-loading-scene";
      mutate = (draft, q) => { add(draft, "task_vegetable_crate", 2); q!.npcTask!.stage = "await_signature"; q!.npcTask!.data.loadedAt = now + PRINT; };
    } else if (task === "farmer_delivery" && action.action === "sign_vegetables") {
      if (npcId !== "npc_snack_street_vendor" || state.locationId !== "snack_street" || (state.region && state.region !== "downtown_station") || p.stage !== "await_signature" || gameDay(state.time) !== p.data.appointmentDay || state.time.hour < 13 || count(state, "task_vegetable_crate") < 2) return reject("需在约定日下午带两筐任务鲜蔬，交给老城小吃街实际在场的马师傅");
      text = "马师傅清点两筐菜，在回执上写下数量和时间，再把纸递给你。\n\n背包扣除两筐任务鲜蔬，获得一张签收回执。回到陈叔身边交回回执后结账。";
      artId = "farmer-delivery-scene";
      mutate = (draft, q) => { take(draft, "task_vegetable_crate", 2); add(draft, "task_delivery_receipt"); q!.npcTask!.stage = "await_return"; q!.npcTask!.data.signedAt = now + HANDOVER; };
    } else if (task === "farmer_delivery" && action.action === "deliver_receipt") {
      if (!owner || p.stage !== "await_return" || count(state, "task_delivery_receipt") < 1 || p.data.signedAt === undefined) return reject("需把马师傅实际签过的回执交回陈叔");
      text = historyText({ ...p, outcome: "delivered" }) + "\n\n交回签收回执 · 收到80元 · 好感+8。";
      artId = "farmer-return-scene";
      mutate = (draft, q) => { take(draft, "task_delivery_receipt"); take(draft, "task_delivery_appointment", count(draft, "task_delivery_appointment")); complete(draft, q!, "delivered", 8, 80); };
    } else return reject("当前阶段没有这项办理");
    const reason = remainingFailure(state, p, minutes);
    if (reason) return reject(reason);
  }
  const draft = clone(state);
  const draftQuest = getNpcTaskQuest(draft, action.taskId);
  mutate(draft, draftQuest);
  if (draftQuest?.npcTask) {
    // fail() already advances the revision while recording its one-time penalty.
    if (draftQuest.npcTask.revision === p?.revision) draftQuest.npcTask.revision += 1;
    if (draftQuest.status !== "active" && action.action !== "return_entrusted") draftQuest.npcTask.resolvedAt = now + minutes;
  }
  advanceHours(draft, minutes / 60);
  tickNpcTasks(draft);
  log(draft, action.taskId, text);
  return { ok: true, state: draft, text, timeCost: minutes / 60, artId, taskId: action.taskId };
}
