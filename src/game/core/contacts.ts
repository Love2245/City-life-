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
import { findRelationship } from "./relationships";
import { getNpcDef, npcKnownName, npcNick } from "./npcs";
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
  // v1.3b7 线程 key 可能是 sender 名字（历史消息无 contactId），回退按名字查找
  return state.contacts.find((c) => c.id === id || c.name === id);
}

/**
 * v1.3b3 由 NPC 自动加为联系人（好感达 contactAt 门槛时调用）。
 * 用 NPC 的网名 + 网络头像，增强沉浸；id = npc_<npcId>，幂等。
 */
export function addContactFromNpc(state: GameState, npcId: string): boolean {
  const id = `npc_${npcId}`;
  if (hasContact(state, id)) return false;
  const def = getNpcDef(npcId);
  if (!def) return false;
  const day = gameDay(state.time);
  const c: Contact = {
    id,
    name: def.netName ?? def.name,
    avatar: def.netAvatar ?? def.icon ?? "👤",
    relation: "friend",
    title: npcNick(npcId),
    intro: def.desc ?? "",
    canCall: true,
    canSms: true,
    addedDay: day,
    npcId,
  };
  state.contacts = [...state.contacts, c];
  pushLog(state, c.avatar, `新增联系人：${c.name}（${c.title}）`);
  if (def.netName) sendSms(state, c.name, c.avatar, `我是${npcKnownName(npcId)}～以后常联系呀！`);
  return true;
}

/** v1.3b3 好感达联系人门槛时幂等加为联系人（防重复添加） */
export function maybeAddNpcContact(state: GameState, npcId: string): boolean {
  const def = getNpcDef(npcId);
  if (def?.contactAt === undefined) return false;
  const rel = findRelationship(state, npcId);
  if (!rel || rel.affinity < def.contactAt) return false;
  if (state.flags[`npc_contact_added_${npcId}`]) return false;
  state.flags[`npc_contact_added_${npcId}`] = true;
  return addContactFromNpc(state, npcId);
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
  // v1.215 修复（P1-5）：按联系人按天冷却，防无限刷心情
  const today = gameDay(state.time);
  if (state.flags[`call_${c.id}_day`] === today) {
    return { ok: false, text: `今天已经给${c.name}打过电话了，明天再聊吧`, reason: "cooling" };
  }
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
  state.flags[`call_${c.id}_day`] = today; // v1.215：成功通话记入今日冷却
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
export interface ContactSmsTopic {
  id: string;
  label: string;
  outgoing: string;
  reply: string;
}

/** 具体话题按关系和联系人身份提供，防止所有人的短信只是替换了姓名的同一句话。 */
export function contactSmsTopics(state: GameState, contact: Contact): ContactSmsTopic[] {
  const name = contact.name;
  const topics: Record<ContactRelation, ContactSmsTopic[]> = {
    parent: [
      { id: "family_news", label: "问问家里近况", outgoing: "家里最近怎么样？我这边一切都好。", reply: `${name}：家里还好，你不用惦记。记得按时吃饭，有事就跟家里说。` },
      { id: "my_work", label: "说说最近工作", outgoing: "最近工作有些忙，不过我在慢慢适应。", reply: `${name}：刚开始都不容易，别只顾着干活，身体也要照顾好。` },
      { id: "health", label: "提醒对方保重身体", outgoing: "最近天气变化大，你也记得添衣、早点休息。", reply: `${name}：知道啦。你在外面也照顾好自己，别总让家里操心。` },
    ],
    manager: [
      { id: "store_schedule", label: "询问近期工作安排", outgoing: "想问下店里最近的排班安排，有消息麻烦告诉我。", reply: `${name}：安排确定后我会按实际班表通知你，先留意消息。` },
      { id: "store_status", label: "聊聊门店近况", outgoing: "最近店里生意怎么样？客流有没有什么变化？", reply: `${name}：最近客流还算平稳，主要还是把服务和交接做好。` },
      { id: "work_advice", label: "请教岗位要求", outgoing: "我想把岗位上的事情做稳些，最需要先注意什么？", reply: `${name}：先把流程和交接记清楚，遇到不确定的事及时问，别凭感觉处理。` },
    ],
    leader: [
      { id: "shift_time", label: "确认班次与到岗时间", outgoing: "我想确认一下接下来班次的时间，免得记错。", reply: `${name}：按排班表上的时间来，临时有调整我会提前跟你说。` },
      { id: "work_process", label: "请教工作流程", outgoing: "有个流程细节我还想确认一下，按规范步骤做对吗？", reply: `${name}：对，先按作业要求做，碰到异常先停下来报告，别跳过检查。` },
      { id: "shift_report", label: "汇报最近的工作状态", outgoing: "最近的工作我基本跟上了，有不熟的地方还在补。", reply: `${name}：知道了，继续把交接和安全检查做好，不确定就及时问。` },
    ],
    mentor: [
      { id: "ask_skill", label: contact.id === "park_chess_grandpa" ? "请教一步棋的思路" : contact.id === "park_calligraphy_grandpa" ? "请教临帖的方法" : "请教一个具体技巧", outgoing: contact.id === "park_chess_grandpa" ? "我复盘棋谱时有一步没想明白，应该先看哪些变化？" : contact.id === "park_calligraphy_grandpa" ? "练字时总是把结构写散，临帖应先观察哪里？" : `最近在学${contact.title}相关的内容，想请你指点一个关键步骤。`, reply: contact.id === "park_chess_grandpa" ? `${name}：先别急着找妙手，先数清双方子力和要点，再看对方下一步威胁什么。` : contact.id === "park_calligraphy_grandpa" ? `${name}：先看字的重心和笔画间距，慢慢临准结构，再谈速度。` : `${name}：先把基本步骤练熟，知道每一步为什么做，再逐渐加快。` },
      { id: "share_progress", label: "说说最近的学习进度", outgoing: "我最近一直在练之前学的内容，慢慢能看出一点门道了。", reply: `${name}：能坚持练就好，记得留意细节，别只求快。` },
      { id: "thank_advice", label: "感谢之前的帮助", outgoing: "上次你给我的建议我用上了，确实帮我理清了思路。", reply: `${name}：能派上用场就好，之后遇到问题再慢慢琢磨。` },
    ],
    employee: [
      { id: "work_today", label: "聊聊今天的工作", outgoing: "今天事情不少，交接还算顺利，你那边忙吗？", reply: `${name}：忙归忙，按顺序做就没那么乱。希望你今天也顺顺当当。` },
      { id: "meal", label: "交流附近吃饭的地方", outgoing: "附近有没有方便又实惠的吃饭地方？想换个口味。", reply: `${name}：店后面那家小店分量还行，去之前可以看看当天菜单。` },
      { id: "work_tip", label: "交流岗位经验", outgoing: "你做这行有一阵了，有没有什么容易忽略的小细节？", reply: `${name}：收尾时对一遍工具和台面，交班会省不少麻烦。` },
    ],
    customer: [
      { id: "service_followup", label: "回访上次服务", outgoing: "上次的服务还合适吗？有需要调整的地方可以告诉我。", reply: `${name}：整体挺合适的，谢谢你主动问。` },
      { id: "customer_needs", label: "询问后续需求", outgoing: "之后如果还有需要，告诉我具体时间和要求，我再确认能否安排。", reply: `${name}：好，有确定的需求我会提前联系你。` },
      { id: "thank_customer", label: "感谢对方一直支持", outgoing: "谢谢你之前的支持，之后我也会继续认真做好服务。", reply: `${name}：客气了，做事认真就好。` },
    ],
    friend: [
      { id: "recent_life", label: "聊聊最近生活", outgoing: "最近过得怎么样？我这阵子一直在忙工作和生活上的事。", reply: `${name}：还可以，最近也在忙自己的安排。你别把休息落下了。` },
      { id: "weekend_hobby", label: "聊聊休息时的兴趣", outgoing: "你最近休息时都做什么？我想找点轻松的事情换换脑子。", reply: `${name}：我最近会出去走走，找个安静地方坐一会儿也挺舒服。` },
      { id: "share_small_thing", label: "分享今天的一件小事", outgoing: "今天路上看到一只猫在窗台晒太阳，突然觉得生活也有挺可爱的瞬间。", reply: `${name}：哈哈，这种小事确实能让人心情好一点。` },
    ],
    special: [
      { id: "greeting", label: "发一条克制的问候", outgoing: "最近还好吗？只是想问候一声。", reply: `${name}：谢谢你的问候。我会照顾好自己，你也保重。` },
      { id: "wish_well", label: "祝对方一切顺利", outgoing: "希望你接下来的事情都能顺利，也记得照顾好自己。", reply: `${name}：谢谢。也祝你接下来的日子平安顺利。` },
      { id: "acknowledge", label: "简单表达惦念", outgoing: "偶尔会想起以前一起经历的事，希望你现在一切安好。", reply: `${name}：我收到了。那些经历我也记得，你多保重。` },
    ],
  };
  let result = topics[contact.relation] ?? topics.friend;
  if (contact.id === "library_coder") {
    result = [
      { id: "debugging", label: "请教排查代码报错", outgoing: "我遇到一个代码报错，准备先从输入、边界条件和调用栈逐步排查。你通常先看哪里？", reply: `${name}：我会先确认错误位置和输入，再缩小到最小复现；别急着重写，先找到触发条件。` },
      { id: "learning_tech", label: "交流最近在学的技术", outgoing: "你最近在看什么技术？我在图书馆整理学习计划，想听听实用的方向。", reply: `${name}：我最近主要看工程实践。挑一个小项目做完，比同时收藏一堆教程更容易看出差距。` },
      { id: "code_review", label: "讨论代码优化思路", outgoing: "我在想怎么让代码更容易维护。你会先看重复逻辑，还是先看模块边界？", reply: `${name}：先看重复逻辑和职责边界，改动前跑一遍现有用例，确认结果一致再整理结构。` },
    ];
  } else if (contact.id === "cafe_clerk") {
    result = [
      { id: "coffee_shift", label: "聊聊咖啡店的忙闲时段", outgoing: "咖啡店最近哪个时段最忙？我想了解实际的出杯节奏。", reply: `${name}：早上和午休前后通常更忙，先把点单、出杯和清洁的顺序理清就不容易乱。` },
      { id: "drink_menu", label: "问问最近的饮品变化", outgoing: "最近店里的菜单有上新吗？有没有什么口味比较受欢迎？", reply: `${name}：上新会看当季原料和顾客反馈，具体供应还是以当天菜单为准。` },
      { id: "service_detail", label: "请教咖啡店服务细节", outgoing: "如果顾客对饮品有特殊要求，怎么确认最不容易出错？", reply: `${name}：复述一遍规格和冷热、糖度，再交给制作台，信息就不容易漏。` },
    ];
  } else if (contact.id === "landlord") {
    result = [
      { id: "repair", label: "询问房屋报修流程", outgoing: "屋里设施如果出了问题，应该通过什么方式报修？", reply: `${name}：先把问题和房间位置说清楚，最好附一张照片，我收到后再确认处理安排。` },
      { id: "lease", label: "确认租住事项", outgoing: "我想确认下目前的租住事项，具体期限和费用以合同记录为准，对吗？", reply: `${name}：对，按双方确认的合同记录来，有调整我会提前联系你。` },
      { id: "quiet_hours", label: "了解楼里的生活提醒", outgoing: "楼里对夜间安静或垃圾投放有什么需要特别注意的规定吗？", reply: `${name}：晚上尽量控制音量，垃圾按楼下标识分类投放就行。` },
    ];
  }
  if (contact.relation === "friend" && state.player.attrs.stamina < 30) {
    result = [
      { ...result[0], id: "tired_checkin", label: "说说最近有点累", outgoing: "最近有点累，想找个人说两句。你这阵子还好吗？", reply: `${name}：最近忙的话先把休息补上，事情一件件处理，不用一下子全扛着。` },
      ...result.slice(1),
    ];
  }
  if (contact.id === "parent_mother" && state.family === "destitute") {
    result[0] = { ...result[0], reply: "妈妈：家里最近还是紧些，不过你先照顾好自己，别把日子过垮了。" };
  }
  if (contact.id === "parent_father" && state.family === "destitute") {
    result[0] = { ...result[0], reply: "爸爸：家里眼下还在想办法，你在外头先站稳脚跟，有消息我再告诉你。" };
  }
  return result;
}

/** 按话题与具体联系人身份回复；每位联系人每天最多获得一次短信心情收益。 */
export function smsContact(
  state: GameState,
  id: string,
  topicId?: string,
): PhoneResult {
  const c = getContact(state, id);
  if (!c) return { ok: false, text: "联系人不存在", reason: "无效联系人" };
  if (!c.canSms) return { ok: false, text: "对方没留短信方式", reason: "该联系人不接收短信" };
  const topics = contactSmsTopics(state, c);
  const legacyToneIndex: Record<string, number> = { positive: 0, neutral: 1, negative: 2 };
  const topic = topicId
    ? topics.find((option) => option.id === topicId) ?? topics[legacyToneIndex[topicId]]
    : topics[0];
  if (!topic) return { ok: false, text: "请选择一个有效的话题", reason: "无效话题" };
  const today = gameDay(state.time);
  const rewardKey = `sms_contact_reward_${c.id}_day`;
  const rewardFirstContactToday = state.flags[rewardKey] !== today;
  const effects: { mood?: number } = rewardFirstContactToday ? { mood: 1 } : {};
  const conversationId = `contact:${c.id}`;
  onContactMessaged(state, c.id);
  if (rewardFirstContactToday) state.flags[rewardKey] = today;
  // Keep both sides under the stable contact identity and link the response to its prompt.
  sendSms(state, "我", "🙂", topic.outgoing, undefined, { dir: "out", contactId: c.id, conversationId });
  const outgoing = state.smsInbox[state.smsInbox.length - 1];
  sendSms(state, c.name, c.avatar, topic.reply, undefined, {
    dir: "in",
    contactId: c.id,
    conversationId,
    replyToId: outgoing.id,
    replied: true,
    read: true,
  });
  if (effects.mood) applyEffects(state, effects, "💬");
  pushLog(state, "💬", `给${c.name}发了条短信，聊了「${topic.label}」`);
  return { ok: true, text: `${c.name}回复了你：「${topic.reply}」`, deltas: collectDeltas(effects) };
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
