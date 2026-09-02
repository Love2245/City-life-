/**
 * 手机系统纯逻辑：打电话（家人/朋友）、手机游戏、在线学习。
 * 纯逻辑层：可播种 RNG、时长推进。
 */
import type { GameState, ResultDelta, Effects } from "../types";
import { applyEffects, advanceTime, collectDeltas, triggerCollapse, pushLog } from "../engine";
import { getFamily } from "./families";
import { guardCollapse } from "./fatigue";
import { chance, weightedDraw, randomInt } from "../rng";
import { gameDay, isWeekend } from "./calendar";
import { addAffinity, getNpcDef } from "./relationships";

export interface PhoneResult {
  ok: boolean;
  text: string;
  deltas?: ResultDelta[];
  reason?: string;
}

/** 给家人打电话：按家庭条件分流文案与效果 */
export function callFamily(state: GameState): PhoneResult {
  const f = getFamily(state.family);
  if (!f) return { ok: false, text: "拨号失败", reason: "没有通讯录" };

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
  applyEffects(state, { mood: effects.mood, stress: effects.stress }, "📞");
  advanceTime(state, 0.5);
  return { ok: true, text, deltas: collectDeltas({ mood: effects.mood, stress: effects.stress }) };
}

/** 给朋友打电话：从已结识、关系达朋友（好感≥40）的 NPC 中随机挑一个煲电话粥，+2 好感、解压 */
export function callFriend(state: GameState): PhoneResult {
  const friends = state.relationships.filter(
    (r) =>
      (r.state === "friend" || r.state === "close_friend" || r.state === "lover") &&
      (r.affinity ?? 0) >= 40,
  );
  if (friends.length === 0) {
    applyEffects(state, { mood: -2, stress: 3, log: "翻了翻通讯录，好像没什么可以打电话的朋友" }, "📞");
    advanceTime(state, 0.3);
    return { ok: true, text: "翻遍通讯录，好像没什么能打电话的朋友……", deltas: collectDeltas({ mood: -2, stress: 3 }) };
  }
  const pick = friends[randomInt(state.rng, 0, friends.length - 1)];
  const name = getNpcDef(pick.npcId)?.name ?? "朋友";
  const gain = addAffinity(state, pick.npcId, 2, { name });
  applyEffects(state, { mood: 5, stress: -4, log: `和${name}煲了会电话粥，心情好多了${gain ? `，${gain}` : ""}` }, "📞");
  advanceTime(state, 0.5);
  return { ok: true, text: `和${name}聊了会近况，心情好多了。`, deltas: collectDeltas({ mood: 5, stress: -4 }) };
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
  const hasLaptop = !!state.flags["item_laptop"];
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
        { label: "医药费我出，别耽搁", tone: "warm", effects: { money: -50, mood: 3, stress: -4, log: "替奶奶付了 50 元医药费" }, reply: "爸：唉，辛苦你了。" },
        { label: "我凑一点寄过去", tone: "neutral", effects: { money: -20, mood: 0, stress: 1, log: "给家里寄了 20 元" }, reply: "爸：行，够买几天药了。" },
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
      text: "爸：老家寄来的笋干给你留了一份，记得收。",
      options: [
        { label: "太好了！谢谢爸", tone: "warm", effects: { mood: 5, stress: -3 }, reply: "爸：喜欢就常回来拿。" },
        { label: "收到，谢了", tone: "neutral", effects: { mood: 2, stress: 0 }, reply: "爸：嗯，吃好。" },
        { label: "又乱花钱", tone: "cold", effects: { mood: -1, stress: 1 }, reply: "爸：你这孩子，爸乐意。" },
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
      text: "爸：给你寄了点家乡腊肉，记得查收。",
      options: [
        { label: "哇！谢谢爸，正好馋这口", tone: "warm", effects: { mood: 5, stress: -4, satiety: 8, log: "收到家里寄的腊肉，心情大好" }, reply: "爸：吃好喝好，别省。" },
        { label: "收到啦", tone: "neutral", effects: { mood: 2, stress: 0 }, reply: "爸：嗯，趁鲜吃。" },
        { label: "又花邮费", tone: "cold", effects: { mood: -1, stress: 1 }, reply: "爸：你这孩子，爸高兴寄。" },
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
      text: "爸：这个月零花钱打你卡上了，别太拼。",
      options: [
        { label: "谢谢爸，我会注意身体", tone: "warm", effects: { mood: 6, stress: -4 }, reply: "爸：嗯，身体是本钱。" },
        { label: "嗯，收到了", tone: "neutral", effects: { mood: 2, stress: 0 }, reply: "爸：花完再说。" },
        { label: "知道了", tone: "cold", effects: { mood: 0, stress: 1 }, reply: "爸：……（淡淡应了声）" },
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
  if (state.flags.fm_lastDay === state.time.day) return null;
  if (!chance(state.rng, 0.6)) return null;
  state.flags.fm_lastDay = state.time.day;
  return pickFamilyMessage(state, famId);
}

/* ===================== 短信系统（v0.97：通信应用） ===================== */

/** 短信场景：可带触发条件（按当天状态匹配，更真实） */
export interface SmsScenario extends FamilyMessageScenario {
  /** 发送人昵称 */
  sender: string;
  senderIcon: string;
  /** 触发条件：rainy=雨雪天 / tired=疲惫 / poor=低收入 / weekend=周末 / any=任意 */
  condition?: "rainy" | "tired" | "poor" | "weekend" | "any";
}

/** 收件箱里的短信（快照存文案与选项，回复后标记） */
export interface SmsMessage {
  id: string;
  sender: string;
  senderIcon: string;
  text: string;
  options: FamilyReplyOption[];
  replied: boolean;
  replyText?: string;
  /** 收到的绝对日 */
  day: number;
}

/** 短信场景池（下班后/睡前按条件收到） */
export const SMS_SCENARIOS: SmsScenario[] = [
  {
    id: "sms_weather_rain",
    sender: "妈妈",
    senderIcon: "👩",
    condition: "rainy",
    text: "妈：我看了天气预报，你那边下雨了。出门记得带伞，淋了雨容易感冒。",
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
    text: "奶奶：天冷了，被子够不够厚？钱别都花在外头，多买点暖和的。",
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
    text: "朋友：听说你最近干得挺猛啊，累不累？别把自己累垮了，周末出来坐坐？",
    options: [
      { label: "是有点累，周末见！", tone: "warm", effects: { mood: 5, stress: -4 }, reply: "朋友：好嘞，老地方见！" },
      { label: "还行，到时候再说", tone: "neutral", effects: { mood: 2, stress: -1 }, reply: "朋友：行，你有空喊我。" },
      { label: "忙，没空", tone: "cold", effects: { mood: -1, stress: 2 }, reply: "朋友：……那改天吧。" },
    ],
  },
  {
    id: "sms_money",
    sender: "爸爸",
    senderIcon: "👨",
    condition: "poor",
    text: "爸：最近手头紧不紧？不够花就说，爸给你打点，别死扛着。",
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
    text: "妈：周末了，自己一个人也要好好吃饭。别总泡面，妈不放心。",
    options: [
      { label: "妈，我今天做了顿好的", tone: "warm", effects: { mood: 4, satiety: 5 }, reply: "妈：那就好，妈放心了。" },
      { label: "知道了妈", tone: "neutral", effects: { mood: 2 }, reply: "妈：嗯，周末愉快。" },
      { label: "我吃啥不用你操心", tone: "cold", effects: { mood: -2 }, reply: "妈：……（隔了好久才回了个嗯）" },
    ],
  },
  {
    id: "sms_friend_hello",
    sender: "老同学",
    senderIcon: "🎓",
    condition: "any",
    text: "老同学：兄弟，好久不见！听说你来城里发展了？混得咋样？",
    options: [
      { label: "刚起步，还在打拼呢", tone: "warm", effects: { mood: 3, fame: 1 }, reply: "老同学：加油，改天请你吃饭！" },
      { label: "就那样呗", tone: "neutral", effects: { mood: 1 }, reply: "老同学：那有空聚聚。" },
      { label: "跟你没关系", tone: "cold", effects: { mood: -2, stress: 1 }, reply: "老同学：……（没再回复）" },
    ],
  },
  {
    id: "sms_landlord",
    sender: "房东",
    senderIcon: "🏠",
    condition: "any",
    text: "房东：小兄弟，这个月房租记得准时交哈，老规矩，微信转我就行。",
    options: [
      { label: "好的房东，记着呢", tone: "warm", effects: { mood: 1, stress: -1 }, reply: "房东：靠谱！" },
      { label: "知道了", tone: "neutral", effects: {}, reply: "房东：嗯，别忘就行。" },
      { label: "能不能宽限几天？", tone: "cold", effects: { stress: 3, mood: -2 }, reply: "房东：……尽量别拖哈。" },
    ],
  },
  {
    id: "sms_birthday",
    sender: "妈妈",
    senderIcon: "👩",
    condition: "any",
    text: "妈：今天是你的生日呀！妈给你发个红包，记得买点好吃的犒劳自己。",
    options: [
      { label: "谢谢妈！我爱你们", tone: "warm", effects: { money: 50, mood: 8, stress: -3, log: "收到妈妈 50 元生日红包" }, reply: "妈：乖，妈永远爱你！" },
      { label: "妈你还记得啊", tone: "neutral", effects: { money: 50, mood: 4 }, reply: "妈：自己的孩子，咋能忘。" },
      { label: "生日而已，不用破费", tone: "cold", effects: { mood: -1 }, reply: "妈：这孩子，妈乐意。" },
    ],
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

/** 每天独立概率（25%）收到垃圾广告短信 */
export function maybeReceiveJunkSms(state: GameState): void {
  if (state.flags.junk_lastDay === gameDay(state.time)) return;
  if (!chance(state.rng, 0.25)) return;
  state.flags.junk_lastDay = gameDay(state.time);
  const blocked = (typeof state.flags.junkBlocked === "number" ? state.flags.junkBlocked : 0);
  const tpl = JUNK_SMS_TEMPLATES[randomInt(state.rng, 0, JUNK_SMS_TEMPLATES.length - 1)];
  const msg: SmsMessage = {
    id: `junk_${junkSender(blocked)}_${gameDay(state.time)}`,
    sender: junkSender(blocked),
    senderIcon: "📦",
    text: `【限时特惠】${tpl.product}\n仅售 ${tpl.price}！${tpl.desc}，点击下方确认收货地址立即发货 →`,
    options: JUNK_OPTIONS,
    replied: false,
    day: gameDay(state.time),
  };
  state.smsInbox = [...state.smsInbox, msg];
  pushLog(state, "📦", `收到一条疑似垃圾广告短信（来自「${junkSender(blocked)}」）`);
}

/** 当前状态匹配的短信池（条件场景优先，any 兜底） */
function smsPool(state: GameState): SmsScenario[] {
  const rainy = state.weather?.id === "rain" || state.weather?.id === "snow";
  const tired = state.player.attrs.stamina < 30;
  const poor = state.player.money < 200;
  const weekend = isWeekend(state.time);
  const cond = SMS_SCENARIOS.filter((s) => {
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
  if (cond.length > 0) return cond;
  return SMS_SCENARIOS.filter((s) => s.condition === "any");
}

/**
 * v0.97 收到短信：每天至多一条（flag sms_lastDay 记绝对日）。
 * 下班后（睡觉结算）调用；命中推入收件箱并提示。
 */
export function maybeReceiveSms(state: GameState): SmsScenario | null {
  if (state.flags.sms_lastDay === gameDay(state.time)) return null;
  if (!chance(state.rng, 0.45)) return null;
  const pool = smsPool(state);
  // v0.98：房东短信仅在租房后（contacts 中存在房东）才推送
  const filtered = pool.filter((s) => s.sender !== "房东" || state.contacts.some((c) => c.id === "landlord"));
  const pick = weightedDraw(state.rng, filtered.map((s) => ({ item: s, weight: 1 }))) ?? filtered[0];
  if (!pick) return null;
  state.flags.sms_lastDay = gameDay(state.time);
  const msg: SmsMessage = {
    id: `${pick.id}_${gameDay(state.time)}`,
    sender: pick.sender,
    senderIcon: pick.senderIcon,
    text: pick.text,
    options: pick.options,
    replied: false,
    day: gameDay(state.time),
  };
  state.smsInbox = [...state.smsInbox, msg];
  pushLog(state, "📩", `收到一条来自「${pick.sender}」的短信，打开通信应用查看`);
  return pick;
}

/** 回复短信：施加选项效果并标记已读，返回回应文案 */
export function replySms(state: GameState, smsId: string, optionIndex: number): PhoneResult {
  const msg = state.smsInbox.find((m) => m.id === smsId);
  if (!msg) return { ok: false, text: "短信不存在", reason: "无效短信" };
  if (msg.replied) return { ok: false, text: "这条短信已经回复过了", reason: "已回复" };

  // v0.98 垃圾广告短信特殊处理
  if (msg.id.startsWith("junk_")) {
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
  msg.replied = true;
  msg.replyText = opt.reply;
  applyEffects(state, opt.effects, "💬");
  return { ok: true, text: opt.reply, deltas: collectDeltas(opt.effects) };
}

/** 未读短信数（通信应用角标） */
export function unreadSmsCount(state: GameState): number {
  return state.smsInbox.filter((m) => !m.replied).length;
}

/**
 * v0.978 代码触发的短信（联系人欢迎/定期教程/系统推送）。
 * 推入收件箱并提示；缺省一个「好的」中性选项以便回复闭环。
 */
export function sendSms(
  state: GameState,
  sender: string,
  senderIcon: string,
  text: string,
  options?: FamilyReplyOption[],
): void {
  const fallback: FamilyReplyOption[] = [{ label: "好的", tone: "neutral", effects: {}, reply: "👍" }];
  const opts = options && options.length > 0 ? options : fallback;
  const msg: SmsMessage = {
    id: `sys_${sender}_${gameDay(state.time)}_${state.smsInbox.length}`,
    sender,
    senderIcon,
    text,
    options: opts,
    replied: false,
    day: gameDay(state.time),
  };
  state.smsInbox = [...state.smsInbox, msg];
  pushLog(state, "📩", `收到一条来自「${sender}」的短信，打开通信应用查看`);
}
