/**
 * NPC 回应立绘的分级判定。
 *
 * 六个代码表达情绪类别，强度 0–3 表达当下表现幅度。普通礼貌、工作说明、
 * 玩家/他人发言、引用、旧情绪和假设不驱动立绘。正式稿以本人当前原始段落
 * 的表现标注为准；新增或改写的段落再使用克制的公共规则。
 */
import performanceData from "../data/npcDialoguePerformance.json";
export type NpcDialogueEmotion =
  | "default" | "emotion_happy" | "emotion_disappointed" | "emotion_angry"
  | "emotion_surprised" | "emotion_embarrassed" | "emotion_sad"
  | "emotion_worried" | "emotion_confident"
  | "expression_smile" | "expression_angry" | "expression_surprised" | "expression_embarrassed"
  | "expression_sad" | "expression_worried" | "expression_confident" | "expression_thinking"
  | "action_arms_crossed" | "action_hands_on_hips" | "action_thinking" | "action_shrug";

export type NpcDialogueMoodCode = "$0" | "$h" | "$s" | "$u" | "$l" | "$a";
export type NpcDialogueIntensity = 0 | 1 | 2 | 3;
export type DialogueEmotionCategory = "neutral" | "happy" | "sad" | "angry" | "surprised" | "embarrassed" | "worried" | "confident" | "thoughtful";
export type DialogueVisualLevel = 0 | 1 | 2;

export interface NpcDialogueMood {
  code: NpcDialogueMoodCode;
  intensity: NpcDialogueIntensity;
  /** 供界面与对白审计使用的细微状态，不改变六类情绪代码。 */
  nuance?: string;
  variant: NpcDialogueEmotion;
  category?: DialogueEmotionCategory;
  /** One is a face-only change; two permits a body gesture. */
  visualLevel?: DialogueVisualLevel;
  explicitGesture?:boolean;
}

type MoodDefinition = Omit<NpcDialogueMood, "variant">;
type MoodCode = Exclude<NpcDialogueMoodCode, "$0">;
type RoleCue = { cue: string; mood: MoodDefinition; variant?: NpcDialogueEmotion };

interface AuthoredPerformance {
  npcId: string;
  text: string;
  category: DialogueEmotionCategory;
  intensity: NpcDialogueIntensity;
  reason: string;
}

// 保留标点、引号和动作，只容忍文件换行与段首段尾空白。不能用节点、关系
// 档位或上一段情绪代替当前文本：正文改写后须重新审阅，否则走通用回退。
const performanceKey = (npcId: string, text: string): string => `${npcId}\u0000${text.replace(/\r\n?/g, "\n").trim()}`;
const AUTHORED_PERFORMANCES = new Map(
  (performanceData.rows as readonly AuthoredPerformance[]).map(row => [performanceKey(row.npcId, row.text), row]),
);
const CATEGORY_CODES: Record<DialogueEmotionCategory, NpcDialogueMoodCode> = {
  neutral: "$0", happy: "$h", sad: "$s", angry: "$a", surprised: "$u",
  embarrassed: "$l", worried: "$u", confident: "$u", thoughtful: "$u",
};

const NEUTRAL: NpcDialogueMood = { code: "$0", intensity: 0, variant: "default",category:"neutral",visualLevel:0 };
const roleCue = (cue: string, code: NpcDialogueMoodCode, intensity: NpcDialogueIntensity, nuance?: string, variant?: NpcDialogueEmotion): RoleCue => ({
  cue,
  mood: { code, intensity, nuance },
  variant,
});

/** 只收录需要结合人物语气才能读准的原句，不把普通情绪词做成全局触发器。 */
const ROLE_CUES: Readonly<Record<string, readonly RoleCue[]>> = {
  npc_fan_kejie: [
    roleCue("你不会是等着我们家小妹来吧", "$a", 1, "chat-boundary-annoyance"),
    roleCue("你还真接得住啊", "$h", 1, "playful-price-joke"),
    roleCue("开玩笑的，不卖，也不收钱", "$h", 1, "admitting-the-joke"),
    roleCue("这回是我没分寸", "$l", 1, "sincere-apology"),
    roleCue("价值刚刚涨过", "$h", 1, "sibling-teasing"),
    roleCue("你先闻闻这个", "$h", 1, "friendly-food-joke"),
    roleCue("我今天已经说够多了", "$h", 1, "self-deprecating-humor"),
    roleCue("都死了。", "$a", 1, "defensive-family-answer"),
    roleCue("问题是我只有一个", "$u", 1, "weighing-real-choices", "expression_thinking"),
  ],
  npc_jack_fanma: [
    roleCue("是拿我打趣", "$a", 1, "chat-boundary-annoyance"),
    roleCue("你来晚了。", "$a", 1, "mild-impatience"),
    roleCue("我练过，今天能一口气说完", "$u", 1, "quiet-pride", "expression_confident"),
    roleCue("别人终于不会叫到一半停住", "$h", 1, "name-humor"),
    roleCue("这个理由，我接受", "$h", 1, "remembering-food-and-friends"),
    roleCue("好吃是另一件事，也得让他知道", "$h", 1, "fair-food-review"),
    roleCue("我也不知道他钱够不够", "$u", 1, "considering-a-friend", "expression_thinking"),
  ],
  npc_fan_kexi: [
    roleCue("你是不是就想看看我生气是什么样子", "$a", 1, "chat-boundary-annoyance"),
    roleCue("这个能写。我用过的", "$l", 1, "reluctant-pen-sale"),
    roleCue("范柯杰！刚才不是", "$a", 1, "interrupted-sibling-protest"),
    roleCue("你先别拿钱", "$u", 1, "protective-concern"),
    roleCue("我是他妹妹。", "$0", 0, "matter-of-fact-introduction"),
    roleCue("你闭嘴。", "$a", 1, "sibling-annoyance"),
    roleCue("不能我一说加油", "$u", 1, "practical-support", "expression_thinking"),
    roleCue("我没法替你说他确认过", "$u", 1, "careful-family-answer", "expression_thinking"),
  ],
  npc_lin_xiaoyu: [
    roleCue("这里能坐", "$h", 1, "welcoming-smile"),
    roleCue("看帽子就行", "$u", 1, "friendly-humor"),
    roleCue("你这问题问得及时", "$u", 1, "self-deprecating-humor"),
    roleCue("远看像帽子", "$u", 1, "self-deprecating-humor", "action_shrug"),
    roleCue("全塞上去，我看着难受", "$u", 1, "design-focus", "action_thinking"),
    roleCue("听着心疼了一下", "$s", 1, "gentle-empathy"),
    // ── 2026-10-26 大修新增：正文改写后重新审阅的语气线索 ──
    roleCue("纸别垫东西", "$u", 1, "territorial-about-her-sketch"),
    roleCue("越改越大", "$u", 1, "creative-humor"),
    roleCue("像橘子皮", "$u", 1, "design-focus", "expression_thinking"),
    roleCue("别看我皱眉", "$u", 1, "dry-humor"),
    roleCue("它不负责味道", "$u", 1, "dry-humor"),
    roleCue("适合印在饭盒", "$u", 1, "design-focus", "expression_thinking"),
    roleCue("我先不说我的", "$u", 1, "withholding-her-own-answer", "expression_thinking"),
    // ── 专业话题：她一讲到设计就连说一大段，语气是笃定的、不带笑的 ──
    roleCue("明度差七级", "$u", 1, "design-lecture", "expression_thinking"),
    roleCue("靠面积分", "$u", 1, "design-lecture", "expression_thinking"),
    roleCue("字号往上顶", "$u", 1, "design-lecture", "expression_thinking"),
    roleCue("颜色压不住", "$u", 1, "unsolicited-design-verdict"),
    roleCue("跟你在抢", "$u", 1, "unsolicited-design-verdict"),
    roleCue("一层半", "$u", 1, "design-lecture", "expression_thinking"),
    roleCue("食堂找饭", "$u", 1, "amused-by-a-practical-answer", "expression_thinking"),
    roleCue("确实难分", "$u", 1, "design-focus", "expression_thinking"),
    roleCue("我不写“显眼”", "$u", 1, "respecting-the-answer"),
    roleCue("我盯着它们两小时", "$u", 1, "design-focus", "expression_thinking"),
    // 注意：不要为“绿裙子”加 roleCue。该句另有“＋我现在有点担心”的担忧判定用例，
    // 加全局线索会把担忧误判成开心；这句的情绪由逐段标注（performance.json）单独给出。
    roleCue("薄荷的", "$h", 1, "offering-something-small"),
    roleCue("饼干不给你", "$h", 1, "dry-refusal"),
    roleCue("你别问为什么", "$u", 1, "keeping-a-small-secret"),
    roleCue("发根长出来了", "$l", 1, "caught-mid-grooming"),
    roleCue("像来钓鱼的", "$u", 1, "self-deprecating-humor"),
    roleCue("等到舍得画，已经干了", "$u", 1, "regret-over-supplies", "action_thinking"),
    roleCue("盒子挺忙", "$h", 1, "dry-humor"),
    roleCue("那几个字挺好看", "$u", 1, "nostalgic-attachment", "action_thinking"),
    roleCue("一开口就像那种", "$u", 1, "social-hesitation"),
    roleCue("只剩一个“馄”字", "$u", 1, "design-focus", "action_thinking"),
    roleCue("我当时偏偏听进去了", "$u", 1, "remembering-a-teacher"),
    roleCue("想换的通常是客户", "$h", 1, "dry-humor"),
    roleCue("耳朵是故意的", "$u", 1, "design-focus"),
    roleCue("难看还是我画的", "$u", 1, "owning-her-work"),
    roleCue("你没说“都好”", "$h", 1, "grateful-for-honesty"),
    roleCue("要对它表示感动", "$u", 1, "reluctant-to-sentimentalize"),
    roleCue("各看各的也行", "$h", 1, "quiet-company"),
    roleCue("画了一个星期", "$h", 1, "quiet-trust"),
    roleCue("没话说就别说", "$u", 1, "no-pleasantries-needed"),
    roleCue("这个答案不像画展介绍", "$h", 1, "dry-humor"),
    roleCue("名字在饮料下面", "$h", 1, "self-deprecating-humor"),
    roleCue("我能盯着这个改半小时", "$u", 1, "design-focus", "expression_thinking"),
    roleCue("像不像攒包装的那种人", "$l", 1, "caught-hoarding"),
    roleCue("我画到半夜", "$u", 1, "worked-too-late"),
    roleCue("是一直没顾上换", "$s", 1, "gentle-empathy"),
    roleCue("两件事能同时成立", "$u", 1, "holding-two-truths", "expression_thinking"),
    roleCue("我自己也喜欢", "$h", 1, "quiet-acceptance"),
    roleCue("猫放这里", "$h", 1, "small-reward"),
    roleCue("今天是客人", "$h", 1, "letting-it-go"),
  ],
  npc_zhao_gang: [
    roleCue("这一栏你写得可大", "$u", 1, "considering-the-form"),
    roleCue("不会的照样写不会", "$u", 1, "practical-focus"),
    roleCue("我这腰可不再陪着跑了", "$u", 1, "practical-humor"),
    roleCue("又该交摊位费了", "$u", 1, "self-deprecating-humor"),
    roleCue("他们叫我黄金右脚", "$u", 1, "quiet-pride"),
    roleCue("不是钱长腿了", "$u", 1, "practical-humor"),
    roleCue("我跟我自己吵了十分钟", "$u", 1, "self-deprecating-humor"),
    roleCue("其实就是没听", "$u", 1, "admitting-a-mistake"),
    roleCue("我自己都发虚", "$u", 1, "nostalgic-humor"),
    roleCue("我得去补这顿批评", "$u", 1, "belated-self-correction"),
    roleCue("我这嘴跟电话铃似的", "$u", 1, "self-deprecating-humor"),
    roleCue("嘴还能聊满一场", "$u", 1, "warm-friendship"),
    roleCue("先别上！", "$u", 2, "focused-warning", "action_thinking"),
    // 过去那一刻的感受不代表当前难过；讲到女儿的童年糗事则是温和的怀念。
    roleCue("奶油糊我鼻子上", "$h", 1, "family-warmth"),
  ],
  npc_chen_jie: [
    roleCue("酱料台成图书馆了", "$h", 1, "workday-humor"),
    roleCue("想吃饭还是吃点心", "$u", 1, "attentive-question"),
    roleCue("有人只是来找洗手间", "$u", 1, "workday-humor"),
    roleCue("我后面只有一盆没洗的工具", "$u", 1, "workday-humor"),
    roleCue("我也得看字", "$u", 1, "workday-humor"),
    roleCue("我看着也舒服", "$h", 1, "quiet-satisfaction"),
    roleCue("我烦的是", "$a", 1, "contained-irritation"),
    roleCue("还是觉得憋屈", "$a", 2, "workplace-hurt"),
    roleCue("我看得难受，纸条还在冰箱上", "$s", 2, "moved-by-daughters-note"),
    roleCue("我看得难受", "$s", 2, "moved-by-daughters-note"),
    roleCue("她还是有点不服", "$a", 1, "editorial-pride"),
    roleCue("水都能自己熟悉店里路线", "$u", 1, "workday-humor"),
    roleCue("挑水果比点货难", "$u", 1, "workday-humor"),
  ],
  npc_wang_lei: [
    roleCue("影子都没地方落", "$h", 1, "welcoming-smile"),
    roleCue("问出了半张履历", "$u", 1, "self-deprecating-humor"),
    roleCue("我先不问得像登记", "$u", 1, "self-deprecating-humor"),
    roleCue("我第二，说明至少赢了几个", "$u", 1, "quiet-pride"),
    roleCue("他说这话时很高兴", "$h", 2, "warm-pride"),
    roleCue("老伴走三年", "$s", 1, "quiet-mourning"),
    roleCue("我怕风吹走", "$u", 1, "self-deprecating-humor"),
    roleCue("我舍不得这儿", "$u", 1, "attachment-to-home"),
    roleCue("头一回上摄影课", "$u", 1, "careful-anticipation"),
  ],
  npc_netbar_boss: [
    roleCue("上机，还是找人", "$u", 1, "attentive-question"),
    roleCue("买了耳机也不代表必须忍着", "$u", 1, "quiet-confidence"),
    roleCue("一步一步来", "$u", 1, "patient-focus"),
    roleCue("喜欢写自己想做的东西", "$h", 1, "craft-enjoyment"),
    roleCue("想念几个人", "$s", 1, "restrained-nostalgia"),
    roleCue("我妈编故事", "$s", 1, "tender-memory"),
    roleCue("这个开场不太熟练", "$u", 1, "dry-self-deprecation"),
    roleCue("这一项工作不接受催促", "$u", 1, "deadpan-humor"),
    roleCue("白拆了一个小时", "$u", 1, "technical-frustration-humor"),
    roleCue("那你好", "$u", 1, "deadpan-humor"),
    roleCue("今天有新进展", "$u", 2, "quiet-pride", "action_thinking"),
  ],
  npc_librarian: [
    roleCue("这两种找法不一样", "$u", 1, "attentive-question"),
    roleCue("那范围可大了", "$u", 1, "considering-the-request"),
    roleCue("我刚才堵着路了", "$h", 1, "welcoming-smile"),
    roleCue("已经有人进去找前台了", "$u", 1, "dry-humor"),
    roleCue("猜错有猜错的热闹", "$u", 1, "dry-humor"),
    roleCue("我画猫像土豆长了天线", "$u", 1, "dry-self-deprecation"),
    roleCue("我管得住嘴", "$u", 1, "dry-humor"),
    roleCue("谁笑我谁继续穿硌脚的", "$u", 1, "self-deprecating-humor"),
    roleCue("幸好只印了几份", "$u", 1, "awkward-humor"),
    roleCue("舍不得。那边还得倒一趟车", "$u", 1, "reluctant-goodbye"),
    roleCue("我还是喜欢。这页也照样放他的意见", "$h", 1, "quiet-love-of-books"),
    roleCue("自己笑出声", "$h", 1, "bookish-self-amusement"),
    roleCue("她笑着给你指空位", "$h", 1, "welcoming-smile"),
    roleCue("她还是有点不服", "$a", 1, "editorial-pride"),
  ],
  npc_flower_market_owner: [
    roleCue("我先知道放哪儿", "$h", 1, "welcoming-smile"),
    roleCue("能放多大的盆", "$u", 1, "considering-the-space"),
    roleCue("别送得人家回去先搬家具", "$u", 1, "practical-humor"),
    roleCue("我喜欢这样，亮得干脆", "$h", 1, "craft-pride"),
    roleCue("这盆没养成", "$0", 0),
    roleCue("我最爱试这些", "$h", 1, "craft-enjoyment"),
    roleCue("终于学会不点头就记", "$u", 1, "learning-from-a-mistake"),
    roleCue("我又不泡茶", "$u", 1, "dry-humor"),
    roleCue("我舍不得归舍不得", "$s", 1, "letting-go-of-old-shop"),
    roleCue("这里终于能放我的饭盒了", "$h", 1, "family-warmth"),
    roleCue("她笑着拿过来量尺寸", "$h", 2, "shared-family-joy"),
    roleCue("自己一直惦记的那块空地已经放了椅子", "$h", 1, "quiet-family-warmth"),
    roleCue("她回我三个笑脸", "$u", 1, "knowing-family-humor"),
    roleCue("没空骂今天的我", "$u", 1, "self-deprecating-humor"),
    roleCue("口袋居然是缝出来的", "$u", 1, "past-mishap-humor"),
    roleCue("东西能用上，我就高兴", "$h", 1, "quiet-satisfaction"),
    roleCue("价钱也真敢开", "$0", 0),
  ],
  npc_snack_street_vendor: [
    roleCue("让我坐着过会儿瘾", "$h", 1, "stall-owner-humor"),
    roleCue("不是你胆子多大", "$u", 1, "welcoming-humor"),
    roleCue("菜单上画一颗椒", "$u", 1, "explaining-the-menu"),
    // 讲述过去客人鼓掌时的反应是干幽默，不把旧情绪直接重演成开心脸。
    roleCue("把我也叫高兴了，多颠了两下", "$u", 1, "recounted-showmanship"),
    roleCue("今天花生炸得好，我已经尝过三回了", "$h", 1, "enjoying-the-food"),
    roleCue("算了，我就是眼光好", "$u", 1, "foodie-confidence"),
    roleCue("鱼还得来，就是主角换了", "$u", 1, "dry-storytelling"),
    roleCue("这话我爱听", "$h", 1, "family-encouragement"),
    roleCue("那边她笑了，这边我也笑了", "$u", 1, "shared-family-amusement"),
    roleCue("我笑得有点响", "$h", 2, "audible-laugh"),
    roleCue("也是捧场", "$h", 1, "warm-satisfaction"),
    roleCue("嘴馋", "$u", 1, "foodie-humor"),
    roleCue("差点颠过头", "$u", 1, "showmanship"),
  ],
  npc_suburb_farmer: [
    roleCue("你想看也行", "$h", 1, "welcoming-smile"),
    roleCue("别光问“累不累”", "$u", 1, "understated-humor"),
    roleCue("那个一个字就答完了", "$u", 1, "understated-humor"),
    roleCue("这批脆不脆，我敢讲", "$u", 1, "quiet-professional-confidence"),
    roleCue("那我就该找个圈让它绕着长了", "$u", 1, "understated-humor"),
    roleCue("鸡的记性挺好", "$u", 1, "understated-humor"),
    roleCue("听他吓唬我", "$u", 1, "understated-humor"),
    roleCue("也省风", "$u", 1, "dry-humor"),
    roleCue("不大舍得", "$s", 1, "reluctant-to-stop-farming"),
    roleCue("招牌换了，我从门口走过去都没认出来", "$h", 1, "small-life-pleasure"),
    roleCue("结果它赢了", "$u", 1, "self-deprecating-humor"),
  ],
};

/** 文本里明确标出的说话人；群像和玩家原话不驱动当前 NPC 的立绘。 */
const SPEAKER_LABEL_TO_NPC_ID: Readonly<Record<string, string | null>> = {
  玩家: null,
  主角: null,
  林小雨: "npc_lin_xiaoyu",
  赵刚: "npc_zhao_gang",
  陈姐: "npc_chen_jie",
  王磊: "npc_wang_lei",
  网吧老板: "npc_netbar_boss",
  网咖老板: "npc_netbar_boss",
  老板: "npc_netbar_boss",
  图书馆大姐: "npc_librarian",
  大姐: "npc_librarian",
  苏荷: "npc_flower_market_owner",
  马师傅: "npc_snack_street_vendor",
  陈守田: "npc_suburb_farmer",
  陈叔: "npc_suburb_farmer",
  范柯杰: "npc_fan_kejie",
  范珂汐: "npc_fan_kexi",
  杰克范马: "npc_jack_fanma",
  杰克: "npc_jack_fanma",
  母亲: null,
  父亲: null,
  女儿: null,
  儿子: null,
  妈妈: null,
  爸爸: null,
  闺女: null,
  老伴: null,
  朋友: null,
  熟人: null,
  帮工: null,
  学生: null,
  老师: null,
  店员: null,
  客人: null,
  顾客: null,
  读者: null,
};
const NPC_NAMED_ACTOR_ALIASES: Readonly<Record<string, readonly string[]>> = {
  npc_lin_xiaoyu: ["林小雨"],
  npc_zhao_gang: ["赵刚","老工头"],
  npc_chen_jie: ["陈姐"],
  npc_wang_lei: ["王磊", "王叔","王爷爷"],
  npc_netbar_boss: ["网吧老板", "网咖老板"],
  npc_librarian: ["图书馆大姐", "大姐"],
  npc_flower_market_owner: ["苏荷"],
  npc_snack_street_vendor: ["马师傅"],
  npc_suburb_farmer: ["陈守田", "陈叔"],
  npc_fan_kejie: ["范柯杰"],
  npc_fan_kexi: ["范珂汐"],
  npc_jack_fanma: ["杰克范马", "杰克"],
};
const SPEAKER_LABEL_PATTERN = new RegExp(
  `(^|[\\n“「『（(，。！？；;])(${Object.keys(SPEAKER_LABEL_TO_NPC_ID)
    .sort((left, right) => right.length - left.length)
    .map((label) => label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"))
    .join("|")})[：:]\\s*`,
  "g",
);

function textForSpeaker(npcId: string, text: string): string {
  const labels = [...text.matchAll(SPEAKER_LABEL_PATTERN)];
  if (labels.length === 0) return text;

  const ownSpeech: string[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    const match = labels[index];
    const label = match[2];
    if (SPEAKER_LABEL_TO_NPC_ID[label] !== npcId && !(npcId==='player'&&['玩家','主角'].includes(label))) continue;
    const start = (match.index ?? 0) + match[0].length;
    const end = labels[index + 1]?.index ?? text.length;
    ownSpeech.push(text.slice(start, end));
  }
  return ownSpeech.length > 0 ? ownSpeech.join(" ") : "";
}

function actionsForSpeaker(npcId: string, text: string): string {
  const aliases = Object.entries(NPC_NAMED_ACTOR_ALIASES);
  const unquoted=text.replace(/[“「『][^”」』]*[”」』]/g," ");
  return [...unquoted.matchAll(/（([^（）]*)）|\(([^()]*)\)/g)]
    .filter((match) => {
      const action = match[1] ?? match[2] ?? "";
      if(npcId!=='player'&&/^(?:他|她)/.test(action)&&action[0] !== (FEMALE_NPCS.has(npcId)?'她':'他'))return false;
      if (/^(?:母亲|妈妈|父亲|爸爸|女儿|儿子|老伴|朋友|客人|学生|店员|对方|她妈妈|他妈妈)/.test(action)) return false;
      if ((npcId!=='player'&&/^(?:你|玩家|主角)/.test(action))||/(?:回忆|想起|当年|以前|曾经|如果|假如)/.test(action)) return false;
      const namedActors = aliases.filter(([, names]) => names.some((name) => action.includes(name)));
      return namedActors.length === 0 || namedActors.every(([owner]) => owner === npcId);
    })
    .map((match) => match[1] ?? match[2] ?? "")
    .join(" ")
    .replace(/(?:没有|并未|并不|不曾|别|不要)(?:明显|真的|大)?(?:微笑|笑|哭|怒吼|抱臂|叉腰|摊手|耸肩|扶额|挠头)[^，。！？;；]*/g," ");
}

/** 情绪词只在当前陈述里生效；去掉转述、回忆、否定和假设部分。 */
const FEMALE_NPCS=new Set(['npc_lin_xiaoyu','npc_chen_jie','npc_librarian','npc_flower_market_owner','npc_fan_kexi']);
const OTHER_ACTOR=/母亲|妈妈|父亲|爸爸|女儿|儿子|闺女|老伴|朋友|老人|孙子|读者|客人|学生|店员|对方|别人|有人|玩家|主角/;

/** Quotes at the start of an NPC paragraph, and quotes following that NPC's
 * own action, are dialogue. Embedded quotations and another person's speech
 * are not. In particular, `“...。”她翻开记录，“...。”` is two own utterances. */
function spokenParts(npcId:string,text:string):{speech:string;inlineActions:string} {
  const plain=text.replace(/（[^（）]*）|\([^()]*\)/g,' ');
  const quotes=[...plain.matchAll(/[“「『]([^”」』]*)[”」』]/g)];
  const ownPronoun=FEMALE_NPCS.has(npcId)?'她':'他';
  const names=NPC_NAMED_ACTOR_ALIASES[npcId]??[];
  const ownNarration=(part:string)=>{
    const trimmed=part.trim().replace(/^[，,。！？:：]+/,'');
    if(OTHER_ACTOR.test(trimmed))return false;
    if(Object.entries(NPC_NAMED_ACTOR_ALIASES).some(([id,aliases])=>id!==npcId&&aliases.some(name=>trimmed.includes(name))))return false;
    // Bare “他说/她说” denotes a quotation in ordinary speech, not a stage action.
    return names.some(name=>trimmed.startsWith(name))
      || trimmed.startsWith(ownPronoun)&&!new RegExp(`^${ownPronoun}说[：:]`).test(trimmed)
      || /^(?:说完|说到这里|读了一遍|回头|转身|回来时|自己)(?:[^。！？]*)(?:笑|皱眉|叹|愣|停|低头)/.test(trimmed);
  };
  let lastEnd=0,hadOwnQuote=false;
  const spoken:string[]=[],actions:string[]=[];
  for(const quote of quotes){
    const start=quote.index??0,prefix=plain.slice(lastEnd,start);
    const continuation=plain.slice(start+quote[0].length).trim().replace(/^[，,。！？!?]+/,'');
    const quotedTerm=start===0&&!/[，,。！？!?；;]/.test(quote[1])&&/^(?:这一|这句|这个|这种|这项|那句|那种)/.test(continuation);
    const own=!quotedTerm&&((!plain.slice(0,start).trim()||ownNarration(prefix))
      &&!OTHER_ACTOR.test(prefix)&&!/(?:说|问|写着|留言)[：:]\s*$/.test(prefix.trim())
      || ownNarration(prefix)&&names.some(name=>prefix.trim().startsWith(name)));
    if(own){spoken.push(quote[1]);hadOwnQuote=true;if(ownNarration(prefix))actions.push(prefix);}
    lastEnd=start+quote[0].length;
  }
  const remainder=plain.replace(/[“「『][^”」』]*[”」』]/g,' ');
  // Non-quoted first-person dialogue stays usable. Prose around a quoted
  // paragraph is kept only as that speaker's visible action.
  if(hadOwnQuote){
    for(const clause of remainder.split(/[。！？!?]/))if(ownNarration(clause))actions.push(clause);
    // A quoted term followed by ordinary speech, e.g. “什么都能干”？这一栏…,
    // is not a fully quoted prose paragraph. Keep its unquoted continuation.
    if(quotes.length===1&&!ownNarration(remainder)&&!OTHER_ACTOR.test(remainder))spoken.push(remainder);
  }else if(!/^(?:他|她|你|玩家|主角|母亲|父亲|朋友|老人|孙子|读者|客人)(?:说|问|看见|听见|承认|笑|拿|把|正|在)/.test(plain.trim())){
    spoken.push(remainder);
  }
  return{speech:spoken.join(' '),inlineActions:actions.join(' ')};
}

function currentSpeech(text: string): string {
  const spoken=text.trim();
  return spoken
    .replace(/[“「『][^”」』]*[”」』]/g, " ")
    .replace(/我(?:现在|今天|确实|真的|觉得|感到)?(?:一点也)?不高兴/g,"我有点不满")
    .replace(/我(?:现在|今天|确实|真的|觉得|感到)?(?:一点也)?不开心/g,"我有点难过")
    .replace(/我(?:现在|这次|确实|真的)?(?:没|没有)(?:什么)?(?:把握|信心|底气)/g,"我有点担心")
    .replace(/(?:如果|假如|要是|倘若|就算|万一)[^。！？!?；;\n]*(?:[。！？!?；;\n]|$)/g," ")
    .replace(/(?:小时候|年轻时|年轻时候|当年|当时|那时|昨天|前天|那天|上周|上个月|去年|以前|从前|曾经|过去|刚才)[^，,。！？!?；;\n]*(?:[，,。！？!?；;\n]|$)/g, " ")
    .replace(/(?:不是|并不|不|没|没有|未曾|别|不用|不必|不要|不能|不会|不想|不代表|不等于)(?:一直|那么|这么|很|太|真|再|更|特别|有点)?(?:开心|高兴|欣慰|生气|恼火|烦躁|难过|伤心|失望|担心|焦虑|脸红|害羞|喜欢|想笑|把握|信心|自信|底气|笃定|确定|放心)[^，,。！？!?；;\n]*/g, " ")
    .replace(/(?:他说|她说|我妈说|我妈妈说|他妈妈说|她妈妈说|女儿说|儿子说|朋友说|对方说|有人说|别人说|客人说|学生说)[^，,。！？!?；;\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mood(code: MoodCode, intensity: Exclude<NpcDialogueIntensity, 0>, nuance?: string): MoodDefinition {
  return { code, intensity, nuance };
}

function obviousIntensity(actions: string, speech: string): MoodDefinition | undefined {
  const all = actions + " " + speech;
  if (/嚎啕大哭|崩溃(?:地)?哭|哭到停不下来|失声痛哭/.test(all)) return mood("$s", 3, "overwhelming-grief");
  if (/怒吼|暴怒|大发雷霆|拍桌怒斥|气得发抖/.test(all)) return mood("$a", 3, "outburst");
  if (/捧腹大笑|开怀大笑|笑得停不下来|笑到直不起腰/.test(all)) return mood("$h", 3, "unrestrained-laughter");

  if (/哭出声|眼泪(?:掉下来|流下来)|眼眶(?:湿润|发红)|哽咽|忍不住落泪/.test(all)) return mood("$s", 2, "visible-hurt");
  if (/笑出了声|忍不住笑|笑得有点响|明显笑起来|兴奋得/.test(all)) return mood("$h", 2, "clear-joy");
  if (/斥责|发火|很生气|非常生气|憋屈|强压着火/.test(all)) return mood("$a", 2, "clear-irritation");
  if (/难过地低下头|悲伤地低头|伤心得说不出话/.test(all)) return mood("$s", 1, "quiet-sadness");
  return undefined;
}

function romanticBlush(actions: string, speech: string): MoodDefinition | undefined {
  const all = actions + " " + speech;
  const confession = /喜欢你|对你(?:有感觉|有好感)|想和你在一起|想跟你交往|要不要和我约会|我向你告白/.test(speech);
  const visibleBlush = /脸红|红着脸|耳根(?:发热|通红)|脸颊泛红|害羞地/.test(all);
  if (confession && visibleBlush) return mood("$l", 2, "reciprocal-affection");
  if (/热吻|当众亲吻|主动吻上/.test(all)) return mood("$l", 3, "open-affection");
  if (visibleBlush) return mood("$l", 1, "visible-blush");
  if (confession) return mood("$l", 1, "quiet-confession");
  return undefined;
}

function liveAnger(speech: string, actions: string): MoodDefinition | undefined {
  const all = speech + " " + actions;
  if (/我烦的是|有点(?:烦|不满|生气|恼火)|稍微不耐烦|心里有点火/.test(all)) return mood("$a", 1, "contained-irritation");
  if (/听着就烦|觉得憋屈|很不满|确实恼火|现在很生气|对(?:你|他|她|这件事)发火|我真的生气|我(?:现在|确实|真的)?(?:有点|挺|很|特别)?(?:生气|恼火|不满|烦躁)/.test(all)) {
    return mood("$a", 2, "clear-irritation");
  }
  return undefined;
}

function liveSadness(speech: string, actions: string): MoodDefinition | undefined {
  const all = speech + " " + actions;
  if (/心里(?:一沉|发酸|很难受|很难过)|有点(?:难过|伤心|失落|遗憾|舍不得)|心疼了一下|觉得(?:难过|伤心|失落|遗憾)|我(?:现在)?(?:有点|挺)?舍不得|现在(?:很|真的)?(?:难过|伤心|失落)/.test(all)) {
    return mood("$s", 1, "quiet-sadness");
  }
  if (/我(?:现在)?(?:真的很|真的|很|特别)难过|我(?:现在)?(?:觉得|感到)(?:很|特别)难受|很(?:伤心|失落)|心里特别难受|失去(?:了)?(?:亲人|老伴)/.test(all)) {
    return mood("$s", 2, "clear-sadness");
  }
  return undefined;
}

function clearConcern(speech: string, actions: string): MoodDefinition | undefined {
  const all = speech + " " + actions;
  if (/(?:我(?:现在|确实|真的|一直)?(?:很|特别|挺|一直)担心|我放心不下|我心里很没底|我提心吊胆|担心得睡不着|提心吊胆)/.test(all)) {
    return mood("$u", 2, "clear-concern");
  }
  return undefined;
}

function clearConfidence(speech: string): MoodDefinition | undefined {
  if (/(?:我(?:现在|这次|确实|真的)?(?:很|特别|非常|十足)?有(?:十足)?把握|我(?:现在|这次|确实|真的)?(?:很|特别|非常)?有信心|我敢保证|这事包在我身上|交给我就行|我肯定能(?:做好|办好|处理好))/.test(speech)) {
    return mood("$u", /很|特别|非常|十足|敢保证|包在我身上|交给我就行|肯定能/.test(speech)?2:1, "clear-confidence");
  }
  return undefined;
}
function liveHappiness(speech: string, actions: string): MoodDefinition | undefined {
  const all = speech + " " + actions;
  if (/特别开心|高兴得(?:跳起来|合不拢嘴)|兴奋极了|笑得停不下来/.test(all)) return mood("$h", 3, "strong-joy");
  if (/我(?:现在|这才|也|就|真(?:的)?|挺|很|最|特别)?(?:喜欢|开心|高兴|满意|欣慰|满足)|我(?:现在|真(?:的)?|挺|很|特别)?(?:觉得|感到)(?:很|挺|特别)?(?:开心|高兴|满意|欣慰)|心里(?:暖和|踏实)|松了口气|如释重负|(?:现在|这下)放心了/.test(all)) {
    return mood("$h", 1, "quiet-warmth");
  }
  if (/轻轻地?笑|笑了笑|笑了一下|笑了下|浅笑|微笑|淡淡一笑|嘴角(?:微微)?上扬|眉眼柔和|自己看着笑了/.test(all)) {
    return mood("$h", 1, "small-smile");
  }
  if (/笑着|笑起来|笑了一声|笑了|又笑|满意地笑|开心地笑/.test(actions)) return mood("$h", 1, "small-smile");
  return undefined;
}

function lowKeyAction(speech: string, actions: string): MoodDefinition | undefined {
  const all = speech + " " + actions;
  if (/想了想|沉吟|思索|停了片刻|说到这里停了停/.test(actions)) return mood("$u", 1, "considering");
  if (/我(?:现在|一直|确实)?(?:有点|稍微|略微)?担心|放心不下|心里没底|现在还不踏实|有点不安|担心地扶额|忧心地皱眉/.test(all)) {
    return mood("$u", 1, "concern");
  }
  if (/吃了一惊|有点意外|确实惊讶|显然没料到/.test(all)) return mood("$u", 1, "curiosity");
  if (/愣了一下|愣了愣|怔了一下|睁大眼|抬了抬眉毛/.test(actions)) return mood("$u",1,"small-surprise");
  if (/(?:我(?:现在|确实|还是|也)?|现在|这下)(?:有点|挺)?不好意思|我(?:有点|稍微)?尴尬/.test(speech)) return mood("$l",1,"social-embarrassment");
  if (/抿了抿嘴|垂下眼|眼神黯淡|神情低落/.test(actions)) return mood("$s",1,"quiet-sadness");
  if (/(?:皱眉|眉头轻蹙)/.test(actions) && /核对|检查|纸上|账|尺寸|数据|工作|办法/.test(all)) {
    return mood("$u", 1, "focused-work");
  }
  return undefined;
}

const FACE_VARIANTS:Record<DialogueEmotionCategory,NpcDialogueEmotion>={neutral:"default",happy:"expression_smile",sad:"expression_sad",angry:"expression_angry",surprised:"expression_surprised",embarrassed:"expression_embarrassed",worried:"expression_worried",confident:"expression_confident",thoughtful:"expression_thinking"};
function categoryOf(definition:MoodDefinition):DialogueEmotionCategory {
  if(definition.category)return definition.category;
  if(definition.code==="$0")return "neutral";
  if(definition.code==="$h")return "happy";
  if(definition.code==="$s")return "sad";
  if(definition.code==="$a")return "angry";
  if(definition.code==="$l")return "embarrassed";
  const nuance=definition.nuance??"";
  if(/concern|warning/.test(nuance))return "worried";
  if(/confidence|pride/.test(nuance))return "confident";
  if(/curiosity|surprise/.test(nuance))return "surprised";
  if(/humor|amusement|warm-friendship|showmanship/.test(nuance))return "happy";
  if(/hesitation|awkward/.test(nuance))return "embarrassed";
  return "thoughtful";
}
function bodyGesture(actions:string):NpcDialogueEmotion|undefined {
  if(/抱臂|双臂交叉|双手交叉(?:在胸前)?/.test(actions))return "action_arms_crossed";
  if(/叉腰|手放在腰间/.test(actions))return "action_hands_on_hips";
  if(/托腮|扶额|手抵(?:着)?下巴|挠头/.test(actions))return "action_thinking";
  if(/摊手|把手摊开|手一摊|耸肩|双手张开/.test(actions))return "action_shrug";
}
function resolveMood(npcId:string,definition:MoodDefinition,actions:string):NpcDialogueMood {
  void npcId;
  const category=categoryOf(definition);
  const gesture=bodyGesture(actions),visualLevel:DialogueVisualLevel=gesture?2:definition.intensity>0?1:0;
  // A feeling does not imply a gesture. Worry must not invent a hand on the
  // chin, and a laugh must not make the speaker put their hands on their hips.
  return{...definition,category,visualLevel,explicitGesture:!!gesture,variant:gesture??FACE_VARIANTS[category]};
}

export function npcDialogueMoodForText(npcId: string, text: string): NpcDialogueMood {
  const attributedText = textForSpeaker(npcId, text);
  if (!attributedText.trim()) return NEUTRAL;
  const parts=spokenParts(npcId,attributedText);
  const actions = actionsForSpeaker(npcId, attributedText)+' '+parts.inlineActions;
  const speech = currentSpeech(parts.speech);

  const reviewed = AUTHORED_PERFORMANCES.get(performanceKey(npcId, text));
  if (reviewed) {
    return resolveMood(npcId, {
      code: CATEGORY_CODES[reviewed.category], intensity: reviewed.intensity,
      category: reviewed.category, nuance: "authored-current-paragraph",
    }, actions);
  }

  // 明确动作和告白优先；随后让逐句审过的角色锚点覆盖公共词义，避免把回忆或
  // 该角色的干幽默统一判成悲伤/开心，最后才使用安全的第一人称情绪判断。
  const explicitAction = obviousIntensity(actions, speech) ?? romanticBlush(actions, speech);
  if (explicitAction) return resolveMood(npcId,explicitAction,actions);

  // 少量角色对白要看具体语境；避免同一个关键词套用到所有 NPC。
  const normalizeCue=(value:string)=>value.replace(/[\s，,。！？!?；;：:、“”「」『』]/g,'');
  const authored = ROLE_CUES[npcId]?.find(({ cue }) => normalizeCue(speech).includes(normalizeCue(cue)) || normalizeCue(actions).includes(normalizeCue(cue)));
  if (authored) {
    return resolveMood(npcId,authored.mood,actions);
  }

  const currentEmotion = liveAnger(speech, actions)
    ?? liveSadness(speech, actions)
    ?? clearConcern(speech, actions)
    ?? (/我(?:现在|一直|确实)?(?:有点|稍微|略微)?担心|我放心不下|我心里没底/.test(speech)?mood('$u',1,'concern'):undefined)
    ?? liveHappiness(speech, actions);
  if (currentEmotion) return resolveMood(npcId,currentEmotion,actions);

  const nuancedMood = clearConcern(speech, actions) ?? clearConfidence(speech);
  if (nuancedMood) return resolveMood(npcId,nuancedMood,actions);

  if(/我(?:现在|确实|真的)?(?:有点|很|非常|特别)?(?:惊讶|震惊)|完全没料到/.test(speech))return resolveMood(npcId,mood("$u",/震惊|非常|特别|完全没料到/.test(speech)?2:1,"clear-surprise"),actions);

  const smallAction = lowKeyAction(speech, actions);
  if (smallAction) return resolveMood(npcId,smallAction,actions);
  if(bodyGesture(actions))return resolveMood(npcId,NEUTRAL,actions);
  return NEUTRAL;
}

/** 兼容旧调用点：返回实际用于选图的素材名；新代码应保留 code 与 intensity。 */
export function npcEmotionForText(text: string, npcId = "npc_unknown"): NpcDialogueEmotion {
  return npcDialogueMoodForText(npcId, text).variant;
}
