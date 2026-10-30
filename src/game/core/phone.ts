/**
 * 手机系统纯逻辑：打电话（家人/朋友）、手机游戏、在线学习。
 * 纯逻辑层：可播种 RNG、时长推进。
 */
import type { GameState, ResultDelta, Effects, SmsMessage } from "../types";
import { applyEffects, advanceTime, collectDeltas, triggerCollapse, pushLog } from "../engine";
import { getFamily } from "./families";
import { guardCollapse } from "./fatigue";
import { chance, weightedDraw, randomInt } from "../rng";
import { gameDay, isWeekend } from "./calendar";
import { addAffinity } from "./relationships";
import { npcName } from "./npcs";
import { hasLaptop as hasPc } from "./projects";
import { contactIdFromConversationId, conversationIdForMessage, currentSmsTimestamp, nextSmsId } from "./sms";

export interface PhoneResult {
  ok: boolean;
  text: string;
  deltas?: ResultDelta[];
  reason?: string;
}

function containsNonFiniteNumber(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(containsNonFiniteNumber);
  if (value && typeof value === "object") return Object.values(value).some(containsNonFiniteNumber);
  return false;
}

function replyEffectsError(state: GameState, effects: Effects): string | undefined {
  if (!effects || typeof effects !== "object" || containsNonFiniteNumber(effects)) return "回复内容无效，请稍后再试";
  if (typeof effects.money === "number" && state.player.money + effects.money < 0) return "余额不足，无法完成这项回复";
  return undefined;
}

/** 给家人打电话：按家庭条件分流文案与效果（v1.3：加按天冷却，修复无限刷心情漏洞） */
export function callFamily(state: GameState): PhoneResult {
  const f = getFamily(state.family);
  if (!f) return { ok: false, text: "拨号失败", reason: "没有通讯录" };

  // v1.3：按天冷却，与 callFriend/callContact 一致，防无限刷心情/压力
  const today = gameDay(state.time);
  if (state.flags["call_family_day"] === today) {
    return { ok: false, text: "今天已经给家里打过电话了，明天再聊吧", reason: "cooling" };
  }

  let text = "";
  let effects: Record<string, number> = {};
  switch (f.id) {
    case "destitute":
      text = "电话那头传来妈妈的声音：家里最近难，你寄的钱到了吗？";
      effects = { mood: -4, stress: 6 };
      break;
    case "tight":
      text = "爸妈问吃得好不好，叮嘱别太省，钱不够说一声。";
      effects = { mood: 4, stress: -3 };
      break;
    case "wealthy":
      text = "爸说这个月打钱给你了，让你别太拼，照顾好身体。";
      effects = { mood: 6, stress: -4 };
      break;
    default:
      text = "妈说家里都好，让你在外照顾好自己。";
      effects = { mood: 3, stress: -2 };
  }
  state.flags["call_family_day"] = today; // v1.3：成功通话记入今日冷却
  state.flags["socialized_once"] = true; // 新手引导明确允许通过手机联系家人完成社交步骤
  applyEffects(state, { mood: effects.mood, stress: effects.stress }, "📞");
  advanceTime(state, 0.5);
  return { ok: true, text, deltas: collectDeltas({ mood: effects.mood, stress: effects.stress }) };
}

/** 给朋友打电话：从已建立关系中随机挑一位（friend/close_friend/lover 且好感≥40） */
export function callFriend(state: GameState): PhoneResult {
  // v1.215 修复（P1-5）：按天冷却，防无限刷心情/压力/好感
  const today = gameDay(state.time);
  if (state.flags["call_friend_day"] === today) {
    return { ok: false, text: "今天已经和朋友打过电话了，明天再聊吧", reason: "cooling" };
  }
  const candidates = state.relationships.filter(
    (r) =>
      (r.state === "friend" || r.state === "close_friend" || r.state === "lover") && r.affinity >= 40,
  );
  if (candidates.length === 0) {
    // 还没有能聊天的朋友
    applyEffects(state, { mood: -2, log: "翻了翻通讯录，好像没什么可以打电话的朋友" }, "📞");
    advanceTime(state, 0.3);
    return {
      ok: true,
      text: "翻遍通讯录，暂时没有能聊天的朋友……多去城里走动走动，认识些新朋友吧",
      deltas: collectDeltas({ mood: -2 }),
    };
  }
  const pick = weightedDraw(state.rng, candidates.map((r) => ({ item: r, weight: 1 })));
  if (!pick) return { ok: false, text: "信号不好", reason: "no_pick" };
  state.flags["call_friend_day"] = today; // v1.215：通话成功记入今日冷却
  addAffinity(state, pick.npcId, 2, "call");
  applyEffects(state, { mood: 5, stress: -4, log: `给${npcName(pick.npcId)}打了个电话，聊得挺开心` }, "📞");
  advanceTime(state, 0.5);
  return {
    ok: true,
    text: `给${npcName(pick.npcId)}打了通电话，心情好多了。`,
    deltas: collectDeltas({ mood: 5, stress: -4 }),
  };
}

/** 手机打游戏：解压但费时间 */
export function playGame(state: GameState): PhoneResult {
  // v0.91：体力归零仍打游戏 → 晕倒
  const g = guardCollapse(state, "在极度疲惫时打游戏", triggerCollapse);
  if (!g.ok) {
    return { ok: false, text: "眼前一黑，你晕倒了……", reason: g.reason };
  }
  applyEffects(state, { mood: 6, stress: -4, stamina: -3, log: "玩了会手机游戏，放空了一下" }, "🎮");
  advanceTime(state, 1);
  return { ok: true, text: "打了几局小游戏，脑子放空了。", deltas: collectDeltas({ mood: 6, stress: -4, stamina: -3 }) };
}

/** 在线学习：费流量费，长智力；有笔记本电脑效率翻倍 */
export function studyOnline(state: GameState): PhoneResult {
  if (state.player.money < 3) {
    return { ok: false, text: "流量费都交不起了", reason: "需要 3 元流量费" };
  }
  const hasLaptop = hasPc(state);
  const gain = hasLaptop ? 4 : 2;
  applyEffects(state, { money: -3, intelligence: gain, stamina: -5, log: `用手机看了${hasLaptop ? "（笔记本同步）" : ""}会儿网课，智力+${gain}` }, "📱");
  advanceTime(state, 1);
  return {
    ok: true,
    text: hasLaptop ? "开着笔记本同步学，效率翻倍。" : "手机屏幕小，但学到了东西。",
    deltas: collectDeltas({ money: -3, intelligence: gain, stamina: -5 }),
  };
}

/* ===================== 家人消息（v0.935 扩展） ===================== */

export interface FamilyReplyOption {
  /** 态度标签，如「暖心回应」 */
  label: string;
  /** 态度：暖心 / 平实 / 冷淡 */
  tone: "warm" | "neutral" | "cold";
  /** 选择该回复对玩家属性的影响 */
  effects: Effects;
  /** 家人的回应文案（反馈） */
  reply: string;
}

export interface FamilyMessageScenario {
  id: string;
  /** 家人发来的消息正文 */
  text: string;
  /** 三条不同态度的回复选项 */
  options: FamilyReplyOption[];
}

/**
 * 各家庭的消息场景池。每条消息提供 3 个态度选项（暖心 / 平实 / 冷淡），
 * 反馈（心情 / 压力 / 金钱等）各不相同，玩家的选择会影响关系走向。
 */
export const FAMILY_MESSAGES: Record<string, FamilyMessageScenario[]> = {
  destitute: [
    {
      id: "d_寄钱",
      text: "妈：娃啊，家里米缸又快见底了，你那边……能再寄点回来不？",
      options: [
        { label: "妈你别省，我这就寄", tone: "warm", effects: { money: -30, mood: 4, stress: -3, log: "给家里寄了 30 元" }, reply: "妈：好孩子，自己别太委屈。" },
        { label: "我尽量凑凑", tone: "neutral", effects: { money: -10, mood: 1, stress: 1, log: "给家里寄了 10 元" }, reply: "妈：嗯，有难处就说话。" },
        { label: "我自己都紧巴巴", tone: "cold", effects: { mood: -3, stress: 4, log: "没给家里寄钱，妈叹了口气" }, reply: "妈：……（电话那头沉默了一会儿）" },
      ],
    },
    {
      id: "d_奶奶住院",
      text: "爸：你奶前两天摔了腿，住院要花钱，你方便不……",
      options: [
        { label: "我先转 50 元，垫一部分费用", tone: "warm", effects: { money: -50, mood: 3, stress: -4, log: "替奶奶垫了 50 元医药费" }, reply: "爸：收到，我先拿这笔去垫住院费用，后面的账再跟你说。" },
        { label: "我先转 20 元，尽一点力", tone: "neutral", effects: { money: -20, mood: 0, stress: 1, log: "给家里转了 20 元应急" }, reply: "爸：收到，先垫一部分，后面我再想办法。" },
        { label: "我真拿不出", tone: "cold", effects: { mood: -4, stress: 5, log: "没帮上奶奶的医药费" }, reply: "爸：……你自己顾好自己吧。" },
      ],
    },
    {
      id: "d_报平安",
      text: "妈：天冷了，多穿点，别光顾着省钱饿着自己。",
      options: [
        { label: "妈你也是，我挺好的", tone: "warm", effects: { mood: 5, stress: -4 }, reply: "妈：听你这么说，妈就放心了。" },
        { label: "嗯，知道了", tone: "neutral", effects: { mood: 1, stress: 0 }, reply: "妈：嗯呐。" },
        { label: "忙，先挂了", tone: "cold", effects: { mood: -2, stress: 2, log: "匆匆挂了妈的电话" }, reply: "妈：……（嘟嘟声）" },
      ],
    },
  ],
  tight: [
    {
      id: "t_吃得好不好",
      text: "爸妈：最近吃得好不好？别太省，钱不够说一声。",
      options: [
        { label: "挺好的，我还学做饭了", tone: "warm", effects: { mood: 4, stress: -3, log: "跟爸妈说最近学做饭" }, reply: "爸妈：真棒，别饿着。" },
        { label: "还行，凑合", tone: "neutral", effects: { mood: 1, stress: 0 }, reply: "爸妈：那就好。" },
        { label: "老一套，别念了", tone: "cold", effects: { mood: -1, stress: 2 }, reply: "爸妈：……（讪讪挂了）" },
      ],
    },
    {
      id: "t_催婚",
      text: "妈：隔壁小王都带对象回家了，你啥时候带人回来呀？",
      options: [
        { label: "妈你别急，遇着了告诉你", tone: "warm", effects: { mood: 2, stress: -1 }, reply: "妈：行，妈不催你。" },
        { label: "知道了，看缘分", tone: "neutral", effects: { mood: 0, stress: 2 }, reply: "妈：缘分缘分，你总这么说。" },
        { label: "我的事你少管", tone: "cold", effects: { mood: -3, stress: 3 }, reply: "妈：你这孩子，怎么说翻脸就翻脸。" },
      ],
    },
    {
      id: "t_寄特产",
      text: "爸：老家的笋干我给你留了一份，下次回家时记得拿。",
      options: [
        { label: "太好了，回家时我记得拿", tone: "warm", effects: { mood: 5, stress: -3 }, reply: "爸：好，给你收好了，回来时带上。" },
        { label: "知道了，谢谢爸", tone: "neutral", effects: { mood: 2, stress: 0 }, reply: "爸：嗯，回来路上提前说一声。" },
        { label: "不用特意给我留", tone: "cold", effects: { mood: -1, stress: 1 }, reply: "爸：那行，家里人吃也一样。" },
      ],
    },
  ],
  ordinary: [
    {
      id: "o_日常问候",
      text: "妈：在外头照顾好自己，别老熬夜。",
      options: [
        { label: "妈你也是，我尽量早睡", tone: "warm", effects: { mood: 3, stress: -3 }, reply: "妈：好，咱娘俩都保重。" },
        { label: "嗯嗯，知道", tone: "neutral", effects: { mood: 1, stress: 0 }, reply: "妈：嗯。" },
        { label: "知道了知道了", tone: "cold", effects: { mood: -1, stress: 2 }, reply: "妈：你这语气……" },
      ],
    },
    {
      id: "o_寄腊肉",
      text: "爸：家里给你寄的熟食包裹显示已经送到。腊肉记得及时取，天气热的话先冷藏。",
      options: [
        { label: "谢谢爸，我先吃一份", tone: "warm", effects: { mood: 5, stress: -4, satiety: 8, log: "取出家里寄来的腊肉吃了一份" }, reply: "爸：喜欢就好，剩下的记得冷藏。" },
        { label: "收到，我晚点去取", tone: "neutral", effects: { mood: 2, stress: 0 }, reply: "爸：行，记得及时取，别放坏了。" },
        { label: "以后别特意寄了", tone: "cold", effects: { mood: -1, stress: 1 }, reply: "爸：知道了，你自己注意吃饭。" },
      ],
    },
    {
      id: "o_问工作",
      text: "妈：最近工作顺心不？别太累着。",
      options: [
        { label: "挺顺的，领导还夸我", tone: "warm", effects: { mood: 4, stress: -3 }, reply: "妈：那就好，妈放心了。" },
        { label: "就那样，混口饭", tone: "neutral", effects: { mood: 1, stress: 0 }, reply: "妈：踏实就好。" },
        { label: "累死了别问了", tone: "cold", effects: { mood: -2, stress: 3 }, reply: "妈：……（不敢多说）" },
      ],
    },
  ],
  wealthy: [
    {
      id: "w_打零花",
      text: "爸：这阵子生活费够不够？家里最近周转得开，有需要就告诉我，别为了证明自己硬扛。",
      options: [
        { label: "谢谢爸，暂时够用，我会照顾好自己", tone: "warm", effects: { mood: 6, stress: -4 }, reply: "爸：好，身体是本钱，别把自己逼太紧。" },
        { label: "目前还行，有需要我再说", tone: "neutral", effects: { mood: 2, stress: 0 }, reply: "爸：行，别等到真周转不开了才开口。" },
        { label: "知道了，我自己安排", tone: "cold", effects: { mood: 0, stress: 1 }, reply: "爸：好，照顾好自己。" },
      ],
    },
    {
      id: "w_事业关心",
      text: "爸：公司的事别硬扛，需要资源跟爸说。",
      options: [
        { label: "爸放心，我在学自己扛", tone: "warm", effects: { mood: 4, stress: -3 }, reply: "爸：有这份心气，好。" },
        { label: "好的，有需要会讲", tone: "neutral", effects: { mood: 1, stress: 0 }, reply: "爸：行。" },
        { label: "不用你管", tone: "cold", effects: { mood: -2, stress: 3 }, reply: "爸：……（脸色一沉）" },
      ],
    },
    {
      id: "w_催回国",
      text: "妈：你哥都回国了，你啥时候回来帮家里？",
      options: [
        { label: "妈，我在外面闯闯，站稳了就回", tone: "warm", effects: { mood: 3, stress: -2 }, reply: "妈：行，妈支持你。" },
        { label: "再看吧", tone: "neutral", effects: { mood: 0, stress: 1 }, reply: "妈：你总说再看。" },
        { label: "我的路我自己走", tone: "cold", effects: { mood: -1, stress: 2 }, reply: "妈：你这孩子，主意大。" },
      ],
    },
  ],
};

/** 兜底池（未知家庭时使用） */
const FALLBACK_MESSAGES: FamilyMessageScenario[] = FAMILY_MESSAGES.ordinary;

/** 随机抽取一条家人消息（避免与上次重复，用数字下标记录上次，规避 flags 仅允许 number|boolean） */
export function pickFamilyMessage(state: GameState, familyId: string): FamilyMessageScenario {
  const pool = FAMILY_MESSAGES[familyId];
  const list = pool && pool.length ? pool : FALLBACK_MESSAGES;
  let pick = weightedDraw(state.rng, list.map((s) => ({ item: s, weight: 1 })));
  if (!pick) pick = list[0];
  const lastIdx = typeof state.flags.fm_lastIdx === "number" ? (state.flags.fm_lastIdx as number) : -1;
  if (list.length > 1 && lastIdx >= 0 && lastIdx < list.length) {
    const others = list.filter((_, i) => i !== lastIdx);
    const alt = weightedDraw(state.rng, others.map((s) => ({ item: s, weight: 1 })));
    if (alt) pick = alt;
  }
  const idx = list.findIndex((s) => s.id === pick!.id);
  state.flags.fm_lastIdx = idx >= 0 ? idx : 0;
  return pick;
}

/** 回复家人消息：施加所选选项效果，返回家人回应文案 */
export function replyFamilyMessage(
  state: GameState,
  scenario: FamilyMessageScenario,
  optionIndex: number,
): PhoneResult {
  const opt = scenario.options[optionIndex];
  if (!opt) return { ok: false, text: "没有这个回复", reason: "无效选项" };
  // 同一条消息只结算一次，避免重复点击或重复提交重复获得心情/压力效果。
  const replyKey = `fm_replied_${scenario.id}_${gameDay(state.time)}`;
  if (state.flags[replyKey]) {
    return { ok: false, text: "这条消息已经回复过了", reason: "已回复" };
  }
  const invalidEffects = replyEffectsError(state, opt.effects);
  if (invalidEffects) return { ok: false, text: invalidEffects, reason: invalidEffects };
  state.flags[replyKey] = true;
  applyEffects(state, opt.effects, "💬");
  advanceTime(state, 0.3);
  return { ok: true, text: opt.reply, deltas: collectDeltas(opt.effects) };
}

/**
 * 不定时接收家人消息：每天至多一条，打开手机时按概率触发（60%）。
 * 命中后由 UI 写入 uiState.pendingFamilyMsg 并提示，返回场景供暂存。
 */
export function tryReceiveFamilyMessage(state: GameState): FamilyMessageScenario | null {
  const famId = getFamily(state.family)?.id ?? "ordinary";
  // v0.99 修复：用绝对日判定"今天已收过"
  // v1.3b6 AI 优化：触发概率 0.6 → 0.35，避免家人消息刷屏
  const todayAbs = gameDay(state.time);
  if (state.flags.fm_lastDay === todayAbs) return null;
  if (!chance(state.rng, 0.35)) return null;
  state.flags.fm_lastDay = todayAbs;
  return pickFamilyMessage(state, famId);
}

/* ===================== 短信系统（v0.97：通信应用） ===================== */

/** 短信场景：可带触发条件（按当天状态匹配，更真实） */
export interface SmsScenario extends FamilyMessageScenario {
  /** 发送人昵称 */
  sender: string;
  senderIcon: string;
  /** 需要已建立的联系人身份；没有该联系人时不会抽到这条场景消息 */
  contactId?: string;
  /** 触发条件：rainy=雨雪天 / tired=疲惫 / poor=低收入 / weekend=周末 / any=任意 */
  condition?: "rainy" | "tired" | "poor" | "weekend" | "any";
  /**
   * v1.01 家庭适配：
   * - family：仅这些家庭可见（缺省全部）
   * - notFamily：这些家庭不可见（如赤贫家庭不会收到「妈妈发红包」等不贴合剧情的短信）
   */
  family?: string[];
  notFamily?: string[];
}

/** 短信场景池（下班后/睡前按条件收到） */
export const SMS_SCENARIOS: SmsScenario[] = [
  {
    id: "sms_weather_rain",
    sender: "妈妈",
    senderIcon: "👩",
    condition: "rainy",
    text: "我看了天气预报，你那边在下雨。出门带把伞，路滑的时候慢一点。",
    options: [
      { label: "妈放心，我带着伞呢", tone: "warm", effects: { mood: 3, stress: -2 }, reply: "妈：好，那就行。" },
      { label: "知道了", tone: "neutral", effects: { mood: 1 }, reply: "妈：嗯，照顾好自己。" },
      { label: "雨不大，没事", tone: "cold", effects: { mood: -1, stress: 1 }, reply: "妈：你总是这么说……" },
    ],
  },
  {
    id: "sms_weather_cold",
    sender: "奶奶",
    senderIcon: "👵",
    condition: "rainy",
    text: "奶奶：天冷了，被子够不够厚？钱别都花在外头，给自己添件暖和的。",
    options: [
      { label: "奶奶，我穿得可暖了", tone: "warm", effects: { mood: 4, stress: -2 }, reply: "奶奶：好孩子，奶奶放心。" },
      { label: "还行吧", tone: "neutral", effects: { mood: 1 }, reply: "奶奶：嗯，别冻着。" },
      { label: "我自己知道", tone: "cold", effects: { mood: -1 }, reply: "奶奶：唉，你这孩子。" },
    ],
  },
  {
    id: "sms_work_tired",
    sender: "朋友",
    senderIcon: "🧑",
    condition: "tired",
    text: "朋友：听说你最近工作挺忙，累不累？周末要是有空，出来坐坐、透透气？",
    options: [
      { label: "是有点累，周末我尽量安排", tone: "warm", effects: { mood: 5, stress: -4 }, reply: "朋友：好，临近了再商量时间，不用赶。" },
      { label: "还行，到时候看安排", tone: "neutral", effects: { mood: 2, stress: -1 }, reply: "朋友：行，你有空再给我消息。" },
      { label: "忙，没空", tone: "cold", effects: { mood: -1, stress: 2 }, reply: "朋友：……那改天吧。" },
    ],
  },
  {
    id: "sms_money",
    sender: "爸爸",
    senderIcon: "👨",
    condition: "poor",
    // v1.01：赤贫家庭（剧情模式）爸妈自己都揭不开锅，不会反过来借钱给你
    notFamily: ["destitute"],
    text: "爸：最近手头紧不紧？不够花就跟我说，能帮的我会帮，别一个人硬扛。",
    options: [
      { label: "爸，真不用，我能扛", tone: "warm", effects: { mood: 3, stress: -2 }, reply: "爸：有骨气，但别硬撑。" },
      { label: "那……借我 200 行吗", tone: "neutral", effects: { money: 200, mood: 2, log: "爸给打了 200 元" }, reply: "爸：这就给你转，省着点花。" },
      { label: "钱的事别管", tone: "cold", effects: { mood: -2, stress: 2 }, reply: "爸：……（没再回）" },
    ],
  },
  {
    id: "sms_weekend_dinner",
    sender: "妈妈",
    senderIcon: "👩",
    condition: "weekend",
    // v1.01：赤贫家庭妈妈满脑子是钱和债，温馨周末关怀不贴合
    notFamily: ["destitute"],
    text: "妈：周末了，别总拿泡面对付。刚吃过饭没有？忙起来也要记得按时吃。",
    options: [
      { label: "刚吃过一顿热乎的，这会儿不饿", tone: "warm", effects: { mood: 4, satiety: 5 }, reply: "妈：那就好，周末也别把饭点拖得太晚。" },
      { label: "知道了妈", tone: "neutral", effects: { mood: 2 }, reply: "妈：嗯，周末愉快。" },
      { label: "我吃啥不用你操心", tone: "cold", effects: { mood: -2 }, reply: "妈：……（隔了好久才回了个嗯）" },
    ],
  },
  {
    id: "sms_friend_hello",
    sender: "老同学",
    senderIcon: "🎓",
    condition: "any",
    text: "老同学：好久不见！听说你来城里发展了？最近还适应吗？",
    options: [
      { label: "刚起步，还在慢慢适应", tone: "warm", effects: { mood: 3, fame: 1 }, reply: "老同学：加油。有空我们先在线上接着聊，真要聚再定时间。" },
      { label: "还在适应，之后再聊", tone: "neutral", effects: { mood: 1 }, reply: "老同学：行，忙完再联系。" },
      { label: "跟你没关系", tone: "cold", effects: { mood: -2, stress: 1 }, reply: "老同学：……（没再回复）" },
    ],
  },
  {
    id: "sms_landlord",
    sender: "房东",
    senderIcon: "🏠",
    condition: "any",
    contactId: "landlord",
    text: "这月房租截止日快到了，按租约里约定的方式办理就行。账单或转账信息有疑问的话，先找我核实。",
    options: [
      { label: "收到，我会在截止日前按租约处理", tone: "warm", effects: { mood: 1, stress: -1 }, reply: "房东：好，办完留好凭证就行。" },
      { label: "我记下截止日了", tone: "neutral", effects: {}, reply: "房东：嗯，有问题提前说。" },
      { label: "我这几天周转不开，想商量延期", tone: "cold", effects: { stress: 3, mood: -2 }, reply: "房东：先把具体情况和时间说清楚，我再看怎么安排。" },
    ],
  },
  {
    id: "sms_mom_care",
    sender: "妈妈",
    senderIcon: "👩",
    condition: "any",
    // 普通家庭的关照短信；赤贫家庭走下方的专属生活压力文案。
    notFamily: ["destitute"],
    text: "妈：这两天还好吗？我想给你转 50 元买饭，手头不紧的话就当应急。要我现在转吗？",
    options: [
      { label: "好，谢谢妈，转来我拿去吃饭", tone: "warm", effects: { money: 50, mood: 8, stress: -3, log: "收到妈妈转来的 50 元生活费" }, reply: "妈：已经转过去了，按时吃饭，别把自己累着。" },
      { label: "好，先收下，等宽裕了我再还你", tone: "neutral", effects: { money: 50, mood: 4, log: "收到妈妈转来的 50 元应急款" }, reply: "妈：已经转了，这是给你的生活费，不用还；记得好好吃饭。" },
      { label: "先不用转，家里自己留着吧", tone: "cold", effects: { mood: -1 }, reply: "妈：好，听你的。有需要再跟妈说。" },
    ],
  },

  /* ==================== v1.01 赤贫家庭（剧情模式）专属短信 ====================
     赤贫出身：家里唯一劳动力 + 爱赌的家人，父母短信围绕「催钱 / 诉苦 / 药费 / 债」，
     不再出现「发红包 / 打钱给你」等不符合家庭境况的内容。 */

  {
    id: "sms_destitute_rice",
    sender: "妈妈",
    senderIcon: "👩",
    condition: "any",
    family: ["destitute"],
    text: "妈：娃啊，家里米缸又见底了，你爹那点工钱都填了牌桌。你那边……能再寄点回来不？",
    options: [
      { label: "这就寄 100", tone: "warm", effects: { money: -100, mood: -2, stress: -3, log: "给家里寄了 100 元买米" }, reply: "妈：好孩子，家里等你信儿。" },
      { label: "我先转 30 元，其他的再想办法", tone: "neutral", effects: { money: -30, mood: -1, stress: 1, log: "给家里转了 30 元买米" }, reply: "妈：收到了，先把米买上；你那边也别硬扛。" },
      { label: "我自己也紧巴巴", tone: "cold", effects: { mood: -4, stress: 4, log: "没寄钱，妈叹了口气" }, reply: "妈：……（那头安静了好久）" },
    ],
  },
  {
    id: "sms_destitute_debtor",
    sender: "爸爸",
    senderIcon: "👨",
    condition: "any",
    family: ["destitute"],
    text: "爸：债主又上门了，说月底再拿不出钱就搬东西。你在城里……有办法吗？",
    options: [
      { label: "寄 200 先稳住", tone: "warm", effects: { money: -200, mood: -3, stress: -3, log: "寄了 200 元稳住债主" }, reply: "爸：唉，难为你了。" },
      { label: "让他们缓几天", tone: "neutral", effects: { stress: 4, mood: -2, log: "让家里拖几天" }, reply: "爸：人家说了，拖不了几回。" },
      { label: "家里先扛着吧", tone: "cold", effects: { mood: -5, stress: 5, log: "你让家里自己想办法" }, reply: "爸：……行，你顾好自己。" },
    ],
  },
  {
    id: "sms_destitute_grandma_med",
    sender: "妈妈",
    senderIcon: "👩",
    condition: "any",
    family: ["destitute"],
    text: "妈：你奶奶的药又该买了，药房说不能欠着……这个月你看着办。",
    options: [
      { label: "寄 150 买药", tone: "warm", effects: { money: -150, mood: -2, stress: -3, log: "寄了 150 元给奶奶买药" }, reply: "妈：妈替奶奶谢你。" },
      { label: "先欠着，下月补", tone: "neutral", effects: { stress: 4, mood: -2, log: "让药房先记着账" }, reply: "妈：药房那边……不好说话。" },
      { label: "忙，回头再说", tone: "cold", effects: { mood: -5, stress: 3, log: "你没回话，妈的短信停在了那一条" }, reply: "妈：……（隔天又发来一条：娃，药断不起啊）" },
    ],
  },
  {
    id: "sms_destitute_gambler",
    sender: "妈妈",
    senderIcon: "👩",
    condition: "any",
    family: ["destitute"],
    text: "妈：你爹昨天又去牌桌了，输光了工钱，回来一句话不说。你是长子，劝劝他。",
    options: [
      { label: "打电话骂他一顿", tone: "warm", effects: { mood: -1, stress: 2, log: "你打电话把爹数落了一顿" }, reply: "妈：骂完他心里能好受点，可转头又忘了。" },
      { label: "我再找机会劝劝他", tone: "neutral", effects: { mood: -2, stress: 2, log: "你又劝了爹几句，他还是没吱声" }, reply: "妈：你尽力就好，他这毛病不是一句两句能改的。" },
      { label: "让他自生自灭", tone: "cold", effects: { mood: -4, stress: 3, log: "你说不管了，电话那头是你妈的叹气声" }, reply: "妈：可他到底是你爹啊……" },
    ],
  },
  {
    id: "sms_destitute_care",
    sender: "妈妈",
    senderIcon: "👩",
    condition: "any",
    family: ["destitute"],
    text: "妈：今天给你煮了碗面，家里没啥好东西。你在城里也要记得吃饭。",
    options: [
      { label: "妈，面我记在心里了", tone: "warm", effects: { mood: 6, stress: -3 }, reply: "妈：乖，等你回来，妈给你做顿好的。" },
      { label: "嗯，知道了", tone: "neutral", effects: { mood: 2 }, reply: "妈：在外头照顾好自己。" },
      { label: "一碗面顶什么用", tone: "cold", effects: { mood: -3, stress: 2 }, reply: "妈：……（那头传来轻轻的抽泣声）" },
    ],
  },

  /* ==================== v1.3b9 新增联系人消息（用户反馈"加入更多联系人主动发送的信息事件"） ==================== */

  {
    id: "sms_leader_overtime",
    sender: "组长",
    senderIcon: "👷",
    contactId: "factory_leader",
    condition: "tired",
    text: "明天白天有一批急单，班组需要加班。加班费按 1.5 倍结算；有兴趣的话，先来厂里确认班次和工时。",
    options: [
      { label: "我有兴趣，明天去确认具体安排", tone: "warm", effects: { mood: -2, stress: 3, money: 0, log: "表达了加班意向，尚未报名（需到厂确认班次）" }, reply: "组长：行，明天先来找我确认工时；完成签到后才算加班。" },
      { label: "明天我先不排加班，得休息一下", tone: "neutral", effects: { mood: 1 }, reply: "组长：知道了，先把状态缓过来，下次排班再问你。" },
      { label: "别总盯着我", tone: "cold", effects: { mood: -1, stress: 2 }, reply: "组长：……行，就当我没问。" },
    ],
  },
  {
    id: "sms_chess_invite",
    sender: "棋摊大爷",
    senderIcon: "♟️",
    contactId: "park_chess_grandpa",
    condition: "weekend",
    text: "小张今天临时有事没来，棋桌空了个位。周末有空来街心公园下两盘象棋吧，不赌输赢，就当活动活动。",
    options: [
      { label: "有空过去，先把棋摊位置发我", tone: "warm", effects: { mood: 5, stress: -3 }, reply: "棋摊大爷：就在街心公园东门那排棋桌。出门前再告诉我一声，不用赶。" },
      { label: "今天还不确定，晚点再答复", tone: "neutral", effects: { mood: 2 }, reply: "棋摊大爷：好，有空再来，棋桌天天都在。" },
      { label: "今天没空", tone: "cold", effects: { mood: -1 }, reply: "棋摊大爷：唉，年轻人的周末就是忙哟。" },
    ],
  },
  {
    id: "sms_clerk_newdrink",
    sender: "咖啡店员",
    senderIcon: "☕",
    contactId: "cafe_clerk",
    condition: "any",
    text: "店里上了秋季限定桂花拿铁。本周会员可以线上下单，付款 15 元后即时送到你当前住处，想尝尝吗？",
    options: [
      { label: "现在下单一杯（15 元）", tone: "warm", effects: { mood: 4, money: -15, log: "线上下单的桂花拿铁已即时送达，花费 15 元" }, reply: "咖啡店员：订单送到啦，15 元已扣款。趁热喝，桂花香会明显些。" },
      { label: "把咖啡厅点位发我，我有空去看看", tone: "neutral", effects: { mood: 1 }, reply: "咖啡店员：地图上的咖啡厅点位就是门店，到店后看当天菜单就行。" },
      { label: "戒咖啡了", tone: "cold", effects: { mood: -1 }, reply: "咖啡店员：？？？你上周还一天两杯呢。" },
    ],
  },
  {
    id: "sms_coder_gossip",
    sender: "程序员小哥",
    senderIcon: "💻",
    contactId: "library_coder",
    condition: "any",
    text: "隔壁组有人跳槽后薪资涨了不少。我也在考虑换工作，但手头项目还没收尾；你觉得我该先做什么准备？",
    options: [
      { label: "先把简历和项目经历整理好，再挑合适岗位", tone: "warm", effects: { mood: 2 }, reply: "程序员小哥：有道理，我先列清楚做过的项目和技术栈，合适的机会再投。" },
      { label: "先把手头项目收尾，再了解市场行情", tone: "neutral", effects: { mood: 1, intelligence: 1, log: "建议程序员朋友先完成手头项目，再了解岗位与薪资行情" }, reply: "程序员小哥：稳妥，至少先把交接和目标岗位想清楚。" },
      { label: "我现在没精力替你拿主意", tone: "cold", effects: { mood: -1 }, reply: "程序员小哥：懂，那我先自己列列利弊，不打扰你了。" },
    ],
  },
  {
    id: "sms_landlord_pipe",
    sender: "房东",
    senderIcon: "🏠",
    contactId: "landlord",
    condition: "any",
    text: "楼道总闸明天上午检修，预计停水两小时。你可以提前留些生活用水；具体恢复时间以师傅现场进度为准。",
    options: [
      { label: "收到，谢谢提醒", tone: "warm", effects: { mood: 1 }, reply: "房东：客气啥，都是应该的。" },
      { label: "知道了", tone: "neutral", effects: {}, reply: "房东：嗯。" },
      { label: "能不能挑晚上修？", tone: "cold", effects: { stress: 2, mood: -1 }, reply: "房东：师傅白天才有空，克服一下吧。" },
    ],
  },
  {
    id: "sms_gym_buddy",
    sender: "健身房肌友",
    senderIcon: "💪",
    condition: "any",
    text: "肌友：明天我打算练腿。你要是也想练，临近了再对一下时间；别为了打卡硬撑，动作做稳比加重量重要。",
    options: [
      { label: "我有兴趣，明天再和你确认时间", tone: "warm", effects: { mood: 4 }, reply: "肌友：好，等你消息。我先按自己的节奏练，不给你占器械。" },
      { label: "明天得看工作安排", tone: "neutral", effects: { mood: 1 }, reply: "肌友：行，确定了再说，别赶。" },
      { label: "这阵子我不打算练腿", tone: "cold", effects: { mood: -1 }, reply: "肌友：收到，那我不催你。改天练上肢再喊你。" },
    ],
  },
  {
    id: "sms_forum_pal",
    sender: "论坛网友·钓鱼佬",
    senderIcon: "🎣",
    condition: "weekend",
    text: "钓鱼佬：城郊那个野塘最近有人钓到大鱼。我明早五点出发，路线发你了。你有兴趣的话先看看交通和返程安排，再决定来不来。",
    options: [
      { label: "我先看下路线和返程，临出发前再确认", tone: "warm", effects: { mood: 5, stress: -3 }, reply: "钓鱼佬：行，路线和返程班次都在刚才那条里；明早出发前再给我准话。" },
      { label: "五点太早，这次先不约了", tone: "neutral", effects: { mood: 2 }, reply: "钓鱼佬：理解，改天找个近点的地方再约。" },
      { label: "钓鱼有什么意思", tone: "cold", effects: { mood: -1 }, reply: "钓鱼佬：你不懂，钓的不是鱼，是寂寞。" },
    ],
  },
  {
    id: "sms_aunt_greeting",
    sender: "二姨",
    senderIcon: "🧣",
    condition: "weekend",
    text: "二姨：刷到你朋友圈了，在城里还适应吗？最近有对象没有？你表弟考试进了前十，二姨就是随口问问，你别有压力。",
    options: [
      { label: "二姨好，工作生活都在慢慢适应", tone: "warm", effects: { mood: 3 }, reply: "二姨：那就好，有空常跟家里说说近况，别光报喜不报忧。" },
      { label: "还行，忙", tone: "neutral", effects: { mood: 1 }, reply: "二姨：忙好啊，忙说明有出息。" },
      { label: "表弟那么好找他去", tone: "cold", effects: { mood: -2, stress: 2 }, reply: "二姨：你这孩子，翅膀硬了……" },
    ],
  },
  {
    id: "sms_community_checkup",
    sender: "社区卫生站",
    senderIcon: "🏥",
    condition: "any",
    text: "【社区卫生服务站】本周六 9:00—12:00 在街道活动室开展基础健康筛查，项目和适用人群以现场公告为准。请带身份证；是否参加可自行安排。",
    options: [],
  },
];

/* ==================== v0.98 垃圾广告短信 ==================== */

const JUNK_SMS_TEMPLATES = [
  { product: "蓝牙耳机（全新未拆）", price: "15.8 元", desc: "音质媲美千元机，原厂直发" },
  { product: "电动牙刷", price: "19.9 元", desc: "清洁力是普通牙刷 20 倍" },
  { product: "二手手机（八成新）", price: "299 元", desc: "无拆无修，带原装充电器" },
  { product: "名牌运动鞋（断码）", price: "88 元", desc: "清仓甩卖，仅剩最后一批" },
  { product: "保温杯礼盒", price: "29.9 元", desc: "316 不锈钢，买二送一" },
  { product: "充电宝 20000mAh", price: "35 元", desc: "自带三根线，可带上飞机" },
  { product: "折叠晾衣架", price: "12.8 元", desc: "租房必备，承重 30kg" },
  { product: "Kindle 阅读器", price: "199 元", desc: "库存压箱底，屏幕完好" },
  { product: "手工檀香皂 x6", price: "9.9 元", desc: "天然精油冷制皂，包邮" },
  { product: "车载手机支架", price: "8.8 元", desc: "磁吸 360° 旋转，秒安装" },
];

function junkSender(blocked: number): string {
  return `二手商城-${9527 + (blocked % 100) * 13}`;
}

const JUNK_OPTIONS: FamilyReplyOption[] = [
  { label: "拉黑", tone: "cold", effects: {}, reply: "已拉黑，但对方会换号继续发送…" },
  { label: "打开链接看看", tone: "neutral", effects: {}, reply: "⚠️ 网页无法打开" },
  { label: "退订/差评", tone: "cold", effects: {}, reply: "⚠️ 感谢好评！客服已收到您的反馈" },
];

export const MAX_SMS_MESSAGES = 300;
function appendSms(state: GameState, ...messages: SmsMessage[]): void {
  state.smsInbox = [...(state.smsInbox ?? []), ...messages].slice(-MAX_SMS_MESSAGES);
}

/** 每天独立概率（25%）收到垃圾广告短信 */
export function maybeReceiveJunkSms(state: GameState): void {
  if (state.flags.junk_lastDay === gameDay(state.time)) return;
  if (!chance(state.rng, 0.25)) return;
  state.flags.junk_lastDay = gameDay(state.time);
  const blocked = (typeof state.flags.junkBlocked === "number" ? state.flags.junkBlocked : 0);
  const tpl = JUNK_SMS_TEMPLATES[randomInt(state.rng, 0, JUNK_SMS_TEMPLATES.length - 1)];
  const msg: SmsMessage = {
    id: nextSmsId(state, `junk_${junkSender(blocked)}`),
    sender: junkSender(blocked),
    senderIcon: "📦",
    text: `【限时特惠】${tpl.product}\n仅售 ${tpl.price}！${tpl.desc}，点击下方确认收货地址立即发货 →`,
    options: JUNK_OPTIONS,
    replied: false,
    day: gameDay(state.time),
    dir: "in",
    conversationId: conversationIdForMessage(state, { sender: junkSender(blocked) }),
    sentAt: currentSmsTimestamp(state),
  };
  appendSms(state, msg);
  pushLog(state, "📦", `收到一条疑似垃圾广告短信（来自「${junkSender(blocked)}」）`);
}

/** 当前状态匹配的短信池（条件场景优先，any 兜底）。
 *  v1.01：叠加家庭过滤——赤贫家庭（剧情模式）只收到贴合境况的短信（催钱/诉苦/药费/债），
 *  过滤掉「妈妈发红包」「爸打钱给你」等不符合赤贫背景的内容。 */
export function smsPool(state: GameState): SmsScenario[] {
  const rainy = state.weather?.id === "rain" || state.weather?.id === "snow";
  const tired = state.player.attrs.stamina < 30;
  const poor = state.player.money < 200;
  const weekend = isWeekend(state.time);
  const fam = state.family;
    // v1.05 冷却：已回复的短信在 5 天内不重复进入候选池
  const coolDays = 5;
  const isCooled = (sid: string): boolean => {
    for (const m of state.smsInbox) {
      if (m.replied && m.id.startsWith(sid) && gameDay(state.time) - m.day < coolDays) return true;
    }
    return false;
  };
  const famOk = (s: SmsScenario): boolean => {
    if (s.family && !s.family.includes(fam)) return false;
    if (s.notFamily && s.notFamily.includes(fam)) return false;
    if (s.contactId && !state.contacts.some((contact) => contact.id === s.contactId)) return false;
    return true;
  };
  const cond = SMS_SCENARIOS.filter((s) => {
    if (!famOk(s)) return false;
    // v1.3b9：家庭专属短信（如赤贫剧情的催钱/药费）无条件入池——条件场景再多也不能挤掉剧情核心体验
    if (s.family && s.family.length > 0) return true;
    switch (s.condition) {
      case "rainy":
        return rainy;
      case "tired":
        return tired;
      case "poor":
        return poor;
      case "weekend":
        return weekend;
      default:
        return false;
    }
  });
  const condCooled = cond.filter((c: SmsScenario) => !isCooled(c.id));
  if (condCooled.length > 0) return condCooled;
  const anyOk = SMS_SCENARIOS.filter((s) => s.condition === "any" && famOk(s));
  const anyCooled = anyOk.filter((s: SmsScenario) => !isCooled(s.id));
  return anyCooled.length > 0 ? anyCooled : anyOk;
}

/**
 * v0.97 收到短信：每天至多一条（flag sms_lastDay 记绝对日）。
 * 下班后（睡觉结算）调用；命中推入收件箱并提示。
 */
export function maybeReceiveSms(state: GameState): SmsScenario | null {
  if (state.flags.sms_lastDay === gameDay(state.time)) return null;
  if (!chance(state.rng, 0.35)) return null;
  const pool = smsPool(state);
  const pick = weightedDraw(state.rng, pool.map((s) => ({ item: s, weight: 1 }))) ?? pool[0];
  if (!pick) return null;
  state.flags.sms_lastDay = gameDay(state.time);
  const msg: SmsMessage = {
    id: nextSmsId(state, pick.id),
    sender: pick.sender,
    senderIcon: pick.senderIcon,
    text: pick.text,
    options: pick.options,
    replied: false,
    day: gameDay(state.time),
    dir: "in",
    contactId: pick.contactId,
    conversationId: conversationIdForMessage(state, { sender: pick.sender, contactId: pick.contactId }),
    sentAt: currentSmsTimestamp(state),
  };
  appendSms(state, msg);
  pushLog(state, "📩", `收到一条来自「${pick.sender}」的短信，打开通信应用查看`);
  return pick;
}

/** 回复短信：施加选项效果并标记已读，返回回应文案 */
export function replySms(state: GameState, smsId: string, optionIndex: number): PhoneResult {
  const msg = state.smsInbox.find((m) => m.id === smsId);
  if (!msg) return { ok: false, text: "短信不存在", reason: "无效短信" };
  if (msg.dir !== "in") return { ok: false, text: "这条消息不能回复", reason: "非收到的消息" };
  if (msg.replied) return { ok: false, text: "这条短信已经回复过了", reason: "已回复" };
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= (msg.options?.length ?? 0)) {
    return { ok: false, text: "没有这个回复", reason: "无效选项" };
  }

  // v0.98 垃圾广告短信特殊处理
  if (msg.id.startsWith("junk_")) {
    const opt = msg.options[optionIndex];
    const invalidEffects = opt ? replyEffectsError(state, opt.effects) : undefined;
    if (invalidEffects) return { ok: false, text: invalidEffects, reason: invalidEffects };
    msg.replied = true;
    if (optionIndex === 0) {
      // 拉黑 — 伪功能，换号
      state.flags.junkBlocked = ((typeof state.flags.junkBlocked === "number" ? state.flags.junkBlocked : 0) + 1);
      const blocked = state.flags.junkBlocked as number;
      msg.replyText = `已拉黑（对方换号 ${junkSender(blocked)} 继续发送）`;
      pushLog(state, "📦", `拉黑了「${msg.sender}」，但对方已换号继续发送…`);
    } else if (optionIndex === 2) {
      // 退订/差评 → 感谢好评
      msg.replyText = "⚠️ 感谢好评！客服已收到您的反馈";
      pushLog(state, "📦", "回复了垃圾短信差评，对方回复「感谢好评」");
    } else {
      msg.replyText = "⚠️ 网页无法打开";
    }
    return { ok: true, text: msg.replyText ?? "已处理" };
  }

  const opt = msg.options[optionIndex];
  if (!opt) return { ok: false, text: "没有这个回复", reason: "无效选项" };
  const invalidEffects = replyEffectsError(state, opt.effects);
  if (invalidEffects) return { ok: false, text: invalidEffects, reason: invalidEffects };
  msg.replied = true;
  msg.read = true;
  msg.replyText = opt.reply;
  // v1.39 回复后生成「主角发出的消息 + 对方回应」，让对话流更自然（不再只是气泡内注释）
  const conversationId = conversationIdForMessage(state, msg);
  const threadKey = contactIdFromConversationId(conversationId);
  const timestamp = currentSmsTimestamp(state);
  const day = gameDay(state.time);
  const outMsg: SmsMessage = {
    id: nextSmsId(state, "out"),
    sender: "我",
    senderIcon: "🙂",
    text: opt.label,
    options: [],
    replied: false,
    day,
    dir: "out",
    contactId: threadKey,
    npcId: msg.npcId,
    conversationId,
    sentAt: timestamp,
    replyToId: msg.id,
  };
  const respMsg: SmsMessage = {
    id: nextSmsId(state, "resp"),
    sender: msg.sender,
    senderIcon: msg.senderIcon,
    text: opt.reply,
    options: [],
    replied: true,
    read: true,
    day,
    dir: "in",
    contactId: threadKey,
    npcId: msg.npcId,
    conversationId,
    sentAt: timestamp,
    replyToId: msg.id,
  };
  appendSms(state, outMsg, respMsg);
  applyEffects(state, opt.effects, "💬");
  // L10 修复（v1.43）：与 replyFamilyMessage 统一耗时口径——回一条短信同样占用 0.3 小时，
  // 不再出现「家人短信耗时、普通联系人短信零耗时」两套标准。
  advanceTime(state, 0.3);
  return { ok: true, text: opt.reply, deltas: collectDeltas(opt.effects) };
}

/** v1.39 标记短信为已读（打开会话 / 点「全部已读」时调用） */
export function markSmsRead(state: GameState, smsId: string): void {
  const msg = state.smsInbox.find((m) => m.id === smsId);
  if (msg && !msg.replied) msg.read = true;
}

/** 未读短信数（通信应用角标；仅计入收到的、未回复且未读的消息） */
export function unreadSmsCount(state: GameState): number {
  return state.smsInbox.filter((m) => m.dir === "in" && !m.replied && !m.read).length;
}

/**
 * v0.978 代码触发的短信（联系人欢迎/定期教程/系统推送）。
 * 推入收件箱并提示；未显式传入选项时按只读通知处理，不制造虚构的回复。
 */
export function sendSms(
  state: GameState,
  sender: string,
  senderIcon: string,
  text: string,
  options?: FamilyReplyOption[],
  opts2?: {
    dir?: "in" | "out";
    contactId?: string;
    npcId?: string;
    conversationId?: string;
    replyToId?: string;
    replied?: boolean;
    read?: boolean;
    sentAt?: number;
  },
): void {
  const opts = options ?? [];
  const dir = opts2?.dir ?? "in";
  const identitySource = {
    conversationId: opts2?.conversationId,
    contactId: opts2?.contactId,
    npcId: opts2?.npcId,
    sender,
  };
  const msg: SmsMessage = {
    id: nextSmsId(state, dir === "out" ? "out" : "sys"),
    sender,
    senderIcon,
    text,
    options: opts,
    replied: opts2?.replied ?? false,
    read: opts2?.read,
    day: opts2?.sentAt === undefined ? gameDay(state.time) : Math.floor(opts2.sentAt / 1440),
    dir,
    contactId: opts2?.contactId,
    npcId: opts2?.npcId,
    conversationId: conversationIdForMessage(state, identitySource),
    sentAt: opts2?.sentAt ?? currentSmsTimestamp(state),
    replyToId: opts2?.replyToId,
  };
  appendSms(state, msg);
  if ((opts2?.dir ?? "in") === "in") {
    pushLog(state, "📩", `收到一条来自「${sender}」的短信，打开通信应用查看`);
  }
}
