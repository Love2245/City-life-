import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { addContact, contactSmsTopics, smsContact } from "../src/game/core/contacts";
import { FAMILY_MESSAGES, markSmsRead, maybeReceiveSms, replyFamilyMessage, replySms, sendSms, SMS_SCENARIOS, smsPool, unreadSmsCount } from "../src/game/core/phone";
import { formatSmsTimestamp, groupSmsThreads, normalizeMessages } from "../src/game/core/sms";
import { gameDay } from "../src/game/core/calendar";
import type { GameState, SmsMessage } from "../src/game/types";

function fresh(): GameState {
  return createInitialState(1480);
}

describe("短信身份、时间与回复结算", () => {
  it("系统通知没有虚构回复选项，ID 唯一且打开后只变为已读", () => {
    const state = fresh();
    sendSms(state, "程序员小哥", "💻", "发来一条学习资料。", undefined, { contactId: "library_coder" });
    sendSms(state, "程序员小哥", "💻", "又发来一条学习资料。", undefined, { contactId: "library_coder" });

    expect(state.smsInbox[0].options).toEqual([]);
    expect(state.smsInbox[0].id).not.toBe(state.smsInbox[1].id);
    expect(state.smsInbox[0].conversationId).toBe("contact:library_coder");
    expect(unreadSmsCount(state)).toBe(2);
    expect(replySms(state, state.smsInbox[0].id, 0).ok).toBe(false);
    markSmsRead(state, state.smsInbox[0].id);
    expect(state.smsInbox[0].read).toBe(true);
    expect(state.smsInbox[0].replied).toBe(false);
    expect(unreadSmsCount(state)).toBe(1);
  });

  it("旧存档补稳定会话和时间，保留真正待回复选项并移除旧通知假回复", () => {
    const state = fresh();
    const pending: SmsMessage = {
      id: "sms_old_story",
      sender: "爸爸",
      senderIcon: "👨",
      text: "家里来信",
      options: [{ label: "给家里寄 10 元", tone: "warm", effects: { money: -10 }, reply: "收到。" }],
      replied: false,
      day: 2,
      dir: "in",
    };
    const notification = {
      id: "sys_程序员小哥_2_0",
      sender: "程序员小哥",
      senderIcon: "💻",
      text: "发来一条教程",
      options: [{ label: "好的", tone: "neutral" as const, effects: {}, reply: "👍" }],
      replied: false,
      day: 2,
      dir: "in" as const,
    };
    const duplicate = { ...pending };
    state.smsInbox = [
      pending,
      { ...pending, id: "out_sms_old_story", sender: "我", text: "给家里寄 10 元", options: [], dir: "out" },
      { ...pending, id: "resp_sms_old_story", text: "收到。", options: [], dir: "in", replied: true },
      notification,
      duplicate,
    ];

    normalizeMessages(state);

    expect(state.smsInbox[0].conversationId).toBe("contact:parent_father");
    expect(state.smsInbox[0].options).toHaveLength(1);
    expect(state.smsInbox[1].replyToId).toBe(pending.id);
    expect(state.smsInbox[1].conversationId).toBe("contact:parent_father");
    expect(state.smsInbox[2].replyToId).toBe(pending.id);
    expect(state.smsInbox[2].options).toEqual([]);
    expect(state.smsInbox[3].options).toEqual([]);
    expect(state.smsInbox.map((message) => message.id).filter((id, i, all) => all.indexOf(id) !== i)).toEqual([]);
    expect(state.smsInbox.every((message) => Number.isFinite(message.sentAt))).toBe(true);
    expect(state.smsInbox[0].timestampEstimated).toBe(true);
    expect(formatSmsTimestamp(state.smsInbox[0].sentAt, state.smsInbox[0].day, state.smsInbox[0].timestampEstimated)).toContain("8/3 · 时间未记载");
  });

  it("余额不足、无效序号或非有限效果时不改消息、金钱、时间和奖励状态", () => {
    const state = fresh();
    state.player.money = 20;
    const message: SmsMessage = {
      id: "sms_costly",
      sender: "妈妈",
      senderIcon: "👩",
      text: "家里急需钱",
      options: [{ label: "寄出 50 元", tone: "warm", effects: { money: -50 }, reply: "收到。" }],
      replied: false,
      day: 0,
      dir: "in",
      conversationId: "contact:parent_mother",
    };
    state.smsInbox.push(message);
    const snapshot = { money: state.player.money, time: { ...state.time }, inbox: state.smsInbox.length, flags: { ...state.flags } };

    expect(replySms(state, message.id, 0).ok).toBe(false);
    expect(replySms(state, message.id, 9).ok).toBe(false);
    message.options[0].effects.money = Number.NaN;
    expect(replySms(state, message.id, 0).ok).toBe(false);

    expect(state.player.money).toBe(snapshot.money);
    expect(state.time).toEqual(snapshot.time);
    expect(state.smsInbox).toHaveLength(snapshot.inbox);
    expect(state.flags).toEqual(snapshot.flags);
    expect(message.replied).toBe(false);
  });

  it("家人临时消息的付费回复余额不足时保留选择并可重试", () => {
    const state = fresh();
    state.family = "destitute";
    state.player.money = 20;
    const scenario = FAMILY_MESSAGES.destitute[0];
    const beforeTime = { ...state.time };

    const result = replyFamilyMessage(state, scenario, 0);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("余额不足");
    expect(state.player.money).toBe(20);
    expect(state.time).toEqual(beforeTime);
    expect(state.flags[`fm_replied_${scenario.id}_${gameDay(state.time)}`]).toBeUndefined();
    state.player.money = 100;
    expect(replyFamilyMessage(state, scenario, 0).ok).toBe(true);
    expect(replyFamilyMessage(state, scenario, 0).ok).toBe(false);
    expect(state.player.money).toBe(70);
  });

  it("家人转账只在接受后到账；特定场景须先取得对应联系人且沿用同一会话身份", () => {
    const care = SMS_SCENARIOS.find((scenario) => scenario.id === "sms_mom_care")!;
    const state = fresh();
    state.family = "ordinary";
    const beforeMoney = state.player.money;
    const message: SmsMessage = {
      ...care,
      id: "sms_mom_care_regression",
      replied: false,
      day: gameDay(state.time),
      dir: "in",
      conversationId: "contact:parent_mother",
      contactId: "parent_mother",
    };
    state.smsInbox.push(message);

    expect(care.text).toContain("要我现在转吗");
    expect(replySms(state, message.id, 1).ok).toBe(true);
    expect(state.player.money).toBe(beforeMoney + 50);
    expect(message.replyText).toContain("已经转了");

    const cafeScenario = SMS_SCENARIOS.find((scenario) => scenario.id === "sms_clerk_newdrink")!;
    const withoutClerk = fresh();
    withoutClerk.player.money = 1000;
    withoutClerk.player.attrs.stamina = 80;
    withoutClerk.time.day = 3;
    expect(smsPool(withoutClerk).some((scenario) => scenario.id === cafeScenario.id)).toBe(false);
    addContact(withoutClerk, "cafe_clerk");
    expect(smsPool(withoutClerk).some((scenario) => scenario.id === cafeScenario.id)).toBe(true);
    expect(cafeScenario.contactId).toBe("cafe_clerk");

    let receivedInContactThread = false;
    for (let seed = 1; seed <= 300 && !receivedInContactThread; seed++) {
      const candidate = fresh();
      candidate.player.money = 1000;
      candidate.player.attrs.stamina = 80;
      candidate.time.day = 3;
      addContact(candidate, "cafe_clerk");
      candidate.rng = { seed, calls: 0 };
      const selected = maybeReceiveSms(candidate);
      if (selected?.id !== cafeScenario.id) continue;
      const received = candidate.smsInbox.at(-1)!;
      expect(received.contactId).toBe("cafe_clerk");
      expect(received.conversationId).toBe("contact:cafe_clerk");
      receivedInContactThread = true;
    }
    expect(receivedInContactThread).toBe(true);
  });

  it("社区健康提醒是只读通知，且咖啡购买的到账、扣款与消费文案一致", () => {
    const notice = SMS_SCENARIOS.find((scenario) => scenario.id === "sms_community_checkup")!;
    expect(notice.options).toEqual([]);

    const coffee = SMS_SCENARIOS.find((scenario) => scenario.id === "sms_clerk_newdrink")!;
    expect(coffee.text).toContain("付款 15 元后即时送到");
    expect(coffee.options[0].effects.money).toBe(-15);
    expect(coffee.options[0].effects.log).toContain("已即时送达");
    expect(coffee.options[0].reply).toContain("已扣款");
  });

  it("回复使用实际当前时间、唯一 ID 和原消息关联；第二次提交不重复结算", () => {
    const state = fresh();
    const original: SmsMessage = {
      id: "sms_late_reply",
      sender: "爸爸",
      senderIcon: "👨",
      text: "有空回来吃饭吗？",
      options: [{ label: "我想周末回家", tone: "warm", effects: { mood: 2 }, reply: "好，等你回来。" }],
      replied: false,
      day: 0,
      dir: "in",
      conversationId: "contact:parent_father",
    };
    state.smsInbox.push(original);
    state.time.day = 4;
    state.time.hour = 18;
    state.time.minute = 25;
    const expectedTime = gameDay(state.time) * 1440 + 18 * 60 + 25;
    const beforeMood = state.player.attrs.mood;

    expect(replySms(state, original.id, 0).ok).toBe(true);
    expect(replySms(state, original.id, 0).ok).toBe(false);
    const [outgoing, response] = state.smsInbox.slice(-2);
    expect(state.player.attrs.mood).toBe(beforeMood + 2);
    expect(outgoing.sentAt).toBe(expectedTime);
    expect(response.sentAt).toBe(expectedTime);
    expect(outgoing.day).toBe(gameDay(state.time));
    expect(response.day).toBe(outgoing.day);
    expect(outgoing.conversationId).toBe("contact:parent_father");
    expect(response.conversationId).toBe(outgoing.conversationId);
    expect(outgoing.replyToId).toBe(original.id);
    expect(response.replyToId).toBe(original.id);
    expect(new Set(state.smsInbox.map((message) => message.id)).size).toBe(state.smsInbox.length);
  });

  it("奶奶来信、玩家回复和奶奶回信固定在一个会话，不混入妈妈", () => {
    const state = fresh();
    const grandmotherScenario = SMS_SCENARIOS.find((scenario) => scenario.id === "sms_weather_cold")!;
    state.smsInbox.push({
      ...grandmotherScenario,
      id: "sms_grandma_thread_regression",
      day: gameDay(state.time),
      dir: "in",
      replied: false,
      // 旧版误标联系人时，显示仍应按真实的发件人身份归入奶奶。
      contactId: "parent_mother",
      conversationId: "contact:parent_mother",
    });
    sendSms(state, "妈妈", "👩", "今晚记得早点休息。", undefined, { contactId: "parent_mother" });

    expect(replySms(state, "sms_grandma_thread_regression", 0).ok).toBe(true);
    const threads = groupSmsThreads(state);
    const grandmother = threads.find((thread) => thread.key === "family:grandmother");
    const mother = threads.find((thread) => thread.key === "contact:parent_mother");

    expect(grandmother?.name).toBe("奶奶");
    expect(grandmother?.msgs.map((message) => message.dir)).toEqual(["in", "out", "in"]);
    expect(grandmother?.msgs.slice(1).every((message) => message.conversationId === "family:grandmother" && message.contactId === undefined)).toBe(true);
    expect(mother?.msgs).toHaveLength(1);
    expect(threads).toHaveLength(2);
  });

  it("旧版我/奶奶分线程按原回复关联恢复为同一会话且保留历史消息", () => {
    const state = fresh();
    const incoming: SmsMessage = {
      id: "sms_grandma_old",
      sender: "奶奶",
      senderIcon: "👵",
      text: "天冷了，多穿一点。",
      options: [{ label: "我会的", tone: "warm", effects: {}, reply: "好孩子。" }],
      replied: true,
      day: 2,
      dir: "in",
    };
    state.smsInbox = [
      incoming,
      { ...incoming, id: "out_sms_grandma_old", sender: "我", text: "我会的", options: [], dir: "out", replied: false, conversationId: "system:outgoing" },
      { ...incoming, id: "resp_sms_grandma_old", text: "好孩子。", options: [], conversationId: "sender:我" },
    ];

    normalizeMessages(state);

    expect(state.smsInbox.map((message) => message.conversationId)).toEqual([
      "family:grandmother",
      "family:grandmother",
      "family:grandmother",
    ]);
    const [thread] = groupSmsThreads(state);
    expect(thread.key).toBe("family:grandmother");
    expect(thread.msgs).toHaveLength(3);
  });

  it("联系人话题按身份定制，同一人每日只获得一次短信心情收益", () => {
    const state = fresh();
    state.player.attrs.mood = 40;
    const mother = state.contacts.find((contact) => contact.id === "parent_mother")!;
    const topics = contactSmsTopics(state, mother);
    expect(topics.map((topic) => topic.label)).toEqual(expect.arrayContaining(["问问家里近况", "说说最近工作"]));

    expect(smsContact(state, mother.id, "family_news").ok).toBe(true);
    const firstOutgoing = state.smsInbox.at(-2)!;
    const firstReply = state.smsInbox.at(-1)!;
    expect(firstOutgoing.text).toContain("家里最近怎么样");
    expect(firstReply.replied).toBe(true);
    expect(firstReply.read).toBe(true);
    expect(unreadSmsCount(state)).toBe(0);
    expect(state.player.attrs.mood).toBe(41);

    expect(smsContact(state, mother.id, "my_work").ok).toBe(true);
    expect(state.player.attrs.mood).toBe(41);
    expect(state.smsInbox.at(-2)!.text).not.toBe(firstOutgoing.text);

    state.time.day += 1;
    expect(smsContact(state, mother.id, "health").ok).toBe(true);
    expect(state.player.attrs.mood).toBe(42);
  });

  it("旧版 tone API 调用迁移到具体话题，不再生成语气标签文案", () => {
    const state = fresh();
    expect(smsContact(state, "parent_mother", "positive").ok).toBe(true);
    expect(state.smsInbox.at(-2)?.text).toContain("家里最近怎么样");
    expect(state.smsInbox.at(-2)?.text).not.toContain("积极");
    expect(state.smsInbox.at(-2)?.text).not.toContain("好久没联系");
  });
});
