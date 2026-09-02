/**
 * 联系人系统（v0.978）：
 * - 默认联系人：父母两人（开局即有）。
 * - 动态添加：随机事件选择、入职（工厂组长）等触发 addContact。
 * - 价值体现：
 *   · 内推（referral_<jobId> flag）：免证书直接入职（咖啡店员/便利店长）。
 *   · 定期教程/关照短信（tutorial）：棋谱教程/书法心得/编程技巧/组长窍门。
 *   · 赠物（onAdd.items）：如书法大爷的手稿。
 * 纯逻辑层，只依赖 types + phone + engine + calendar + JSON。
 */
import type { GameState, Contact, ContactDef, ContactRelation } from "../types";
import type { PhoneResult } from "./phone";
import { applyEffects, collectDeltas, pushLog, advanceTime } from "../engine";
import { gameDay } from "./calendar";
import { sendSms } from "./phone";
import { onContactMessaged } from "./tarot";
import { addItem } from "./items";
import contactsData from "../data/contacts.json";

const DEFS = (contactsData as unknown as { contacts: ContactDef[] }).contacts;
const DEF_MAP = new Map(DEFS.map((c) => [c.id, c]));

/** 通信应用联系人分组标签 */
export const CONTACT_GROUP_LABEL: Record<ContactRelation, string> = {
  parent: "家人",
  manager: "上司 / 店长",
  leader: "组长",
  mentor: "前辈 / 导师",
  employee: "同事",
  customer: "顾客",
  friend: "朋友",
  special: "特殊",
};

export function getContactDef(id: string): ContactDef | undefined {
  return DEF_MAP.get(id);
}

export function hasContact(state: GameState, id: string): boolean {
  return state.contacts.some((c) => c.id === id);
}

export function getContact(state: GameState, id: string): Contact | undefined {
  return state.contacts.find((c) => c.id === id);
}

/** 默认联系人（开局即有，如父母） */
export function defaultContacts(): Contact[] {
  return DEFS.filter((d) => d.default).map((d) => buildContact(d, 0));
}

function buildContact(d: ContactDef, day: number): Contact {
  const c: Contact = {
    id: d.id,
    name: d.name,
    avatar: d.avatar,
    relation: d.relation,
    title: d.title,
    intro: d.intro,
    canCall: d.canCall,
    canSms: d.canSms,
    addedDay: day,
  };
  if (d.referralJob) c.referralJob = d.referralJob;
  if (d.tutorial) c.tutorial = d.tutorial;
  return c;
}

/**
 * 新增联系人：幂等。
 * 触发：欢迎短信 + onAdd 效果（赠物 / 属性 / 内推 flag / 日志）。
 */
export function addContact(state: GameState, id: string): boolean {
  if (hasContact(state, id)) return false;
  const d = DEF_MAP.get(id);
  if (!d) return false;
  const day = gameDay(state.time);
  const c = buildContact(d, day);
  // 内推 flag（onAdd.flags 中以 referral_<jobId> 形式存在）
  if (d.onAdd?.flags) {
    for (const [flag, val] of Object.entries(d.onAdd.flags)) {
      if (val) {
        state.flags[flag] = true;
        if (flag.startsWith("referral_")) c.referralJob = flag.slice("referral_".length);
      }
    }
  }
  state.contacts = [...state.contacts, c];
  // 赠物：消耗品进背包计数（v0.99 修复：原误入 ownedItems——那是开局选品临时字段，物品永远无法使用）
  if (d.onAdd?.items) {
    for (const it of d.onAdd.items) addItem(state, it);
  }
  // 一次性效果
  if (d.onAdd?.effects) applyEffects(state, d.onAdd.effects, d.avatar);
  // 日志
  pushLog(
    state,
    d.avatar,
    `新增联系人：${d.name}（${d.title}）` + (d.onAdd?.log ? ` · ${d.onAdd.log}` : ""),
  );
  // 欢迎短信
  if (d.hello) sendSms(state, d.name, d.avatar, d.hello);
  return true;
}

/** 是否拥有某岗位的内推（免证书直接入职） */
export function isReferred(state: GameState, jobId: string): boolean {
  return !!state.flags[`referral_${jobId}`];
}

/** 给联系人打电话（返回结算结果与文案，供通信 App 复用） */
export function callContact(state: GameState, id: string): PhoneResult {
  const c = getContact(state, id);
  if (!c) return { ok: false, text: "联系人不存在", reason: "无效联系人" };
  const line: Record<ContactRelation, string> = {
    parent: `${c.name}：好好照顾自己，别太拼了。`,
    manager: `${c.name}：店里最近缺人，有空来帮忙啊。`,
    leader: `${c.name}：好好干，有啥不懂的问我就行。`,
    mentor: `${c.name}：后生，有空常来切磋。`,
    employee: `${c.name}：嘿，下班一起喝一杯？`,
    customer: `${c.name}：老板，下次照顾生意哈！`,
    friend: `${c.name}：最近咋样？有空聚聚。`,
    special: `${c.name}：缘分到此，后会有期。`,
  };
  onContactMessaged(state, c.id); // v0.985 恋人：主动通讯的不同对象去重累计
  applyEffects(state, { mood: 2 }, "📞");
  advanceTime(state, 0.5); // v0.99 修复：与 callFamily/callFriend 一致，通话消耗 0.5 小时
  pushLog(state, "📞", `给${c.name}打了个电话`);
  return { ok: true, text: line[c.relation] ?? `和${c.name}聊了几句。`, deltas: collectDeltas({ mood: 2 }) };
}

/**
 * v0.985 主动给联系人发短信。
 * 此前通信 App 的 💬 按钮只是跳转到收件箱，玩家其实无法「发出」任何东西；
 * 现在真正发出一条问候，并换回对方一条回信 —— 同时登记「恋人」牌的通讯对象。
 */
export function smsContact(state: GameState, id: string): PhoneResult {
  const c = getContact(state, id);
  if (!c) return { ok: false, text: "联系人不存在", reason: "无效联系人" };
  if (!c.canSms) return { ok: false, text: "对方没留短信方式", reason: "该联系人不接收短信" };
  const reply: Record<ContactRelation, string> = {
    parent: `${c.name}：看到消息了，家里都好，你自己吃饭别对付。`,
    manager: `${c.name}：收到。这两天要是有空，过来搭把手。`,
    leader: `${c.name}：嗯呐，明天照常，早点到别赶。`,
    mentor: `${c.name}：有心了。得空来坐坐，给你讲两手。`,
    employee: `${c.name}：哈哈哈刚还念叨你呢，下班约一个？`,
    customer: `${c.name}：哟老板还记着我，下回还找你！`,
    friend: `${c.name}：还行吧，苟着呢。你最近咋样？`,
    special: `${c.name}：……看到了。保重。`,
  };
  onContactMessaged(state, c.id);
  sendSms(state, c.name, c.avatar, reply[c.relation] ?? `${c.name}：收到，改天聊。`);
  applyEffects(state, { mood: 1 }, "💬");
  pushLog(state, "💬", `给${c.name}发了条短信`);
  return { ok: true, text: `消息发出去了，${c.name}很快就回了你。`, deltas: collectDeltas({ mood: 1 }) };
}

/**
 * 睡眠结算：联系人定期发送教程/关照短信（棋谱教程/书法心得/编程技巧/组长窍门…）。
 * 在 time.ts 的 sleepSettlement 末尾调用。
 */
export function tickContactBenefits(state: GameState): void {
  const day = gameDay(state.time);
  for (const c of state.contacts) {
    if (!c.tutorial) continue;
    const last = c.lastBenefitDay ?? c.addedDay;
    if (day - last < c.tutorial.everyDays) continue;
    c.lastBenefitDay = day;
    sendSms(state, c.name, c.avatar, c.tutorial.text);
    if (c.tutorial.effects) applyEffects(state, c.tutorial.effects, c.avatar);
  }
}
