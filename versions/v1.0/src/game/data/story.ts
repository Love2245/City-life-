/**
 * v1.0 剧情模式内容数据：六条主线 + 卡池。
 * 纯数据层：只依赖 types，逻辑在 core/story.ts。
 *
 * 结构：
 * - ARCS：六条"来城之因 → 目标 → 五阶段"主线；
 * - CARDS：推进卡（arc+stage）/ 主线障碍卡（arc）/ 中立卡（arc 缺省）。
 * 每张卡 2~4 个解法（屈服 / 砸钱 / 无视 / 特殊），至少一个非无视解可行才可抽。
 */
import type { StoryCardDef, StoryKind, StorySolution } from "../types";

/** 主线定义 */
export interface StoryArcDef {
  id: StoryKind;
  title: string;
  /** 来城之因（开场白） */
  why: string;
  /** 目标 */
  goal: string;
  /** 五个阶段名 */
  stages: [string, string, string, string, string];
  /** 目标资金（非金钱型主线为 0） */
  goalTotal: number;
  /** 结局收束文案（bad / good / great / perfect） */
  epilogues: Record<"bad" | "good" | "great" | "perfect", string>;
}

/** 快捷解法构造 */
function sol(
  kind: StorySolution["kind"],
  label: string,
  desc: string,
  extra: Partial<StorySolution> = {},
): StorySolution {
  return { kind, label, desc, ...extra };
}

export const ARCS: StoryArcDef[] = [
  {
    id: "repay_debt",
    title: "还清赌债",
    why: "爹在镇上的牌桌上欠了两万，债主放话年底前不还就砸房子。家里把能卖的都卖了，偷偷托关系把你送进城——你是家里唯一能还上这笔钱的人。",
    goal: "在 12 个月内攒下 2 万元，替家里还清赌债。",
    stages: ["站稳脚跟", "寄回第一笔钱", "躲过催债", "凑大额尾款", "还清赌债"],
    goalTotal: 20000,
    epilogues: {
      bad: "你没能凑够那笔钱。年底，债主还是砸了老家的门，你在城里的电话再也没响过。",
      good: "还清债的那天，爹在电话那头半天没说话，最后只说了一句：回来吧。你看着这座城市，第一次觉得脚下的地是实的。",
      great: "你不仅还清了债，还给家里留了余钱。乡亲们说，老李家出了个有出息的。",
      perfect: "你替家里还清了债，又带着城里攒下的人脉给村里修了条路。回乡那天，全村人都在路口等你。",
    },
  },
  {
    id: "grandma_op",
    title: "奶奶的手术费",
    why: "奶奶的心脏要做手术，医院说再不治就没机会了，手术费三万。家里砸锅卖铁凑了个零头，你揣着那点钱和一张车票进了城。",
    goal: "在 10 个月的治疗窗口内攒够 3 万元，赶在奶奶的手术日之前。",
    stages: ["寄药费", "病情恶化", "识破黑诊所", "尾款冲刺", "手术日"],
    goalTotal: 30000,
    epilogues: {
      bad: "手术日那天，你没能赶回去。后来家里的电话断了很久，再接通时，谁也没有提起奶奶。",
      good: "手术很成功。奶奶醒来第一句话是问你在城里吃饱没有。你攥着住院单，哭得像个孩子。",
      great: "手术顺利，奶奶还多活了几年，逢人就说孙子在城里出息了。",
      perfect: "你赶在手术日前凑够了钱，还托城里认识的医生请了最好的主刀。出院那天，奶奶拉着你的手说：咱家的日子要好了。",
    },
  },
  {
    id: "brother_school",
    title: "弟弟的学费",
    why: "弟弟考上了县城最好的高中，家里却供不起。你是老大，爹说：你去城里挣，学费你管。",
    goal: "每月供上 500 元学费，直到弟弟高考录取。",
    stages: ["第一学期", "成绩下滑", "辍学风波", "高考冲刺", "录取通知书"],
    goalTotal: 8000,
    epilogues: {
      bad: "你最终没能供完。弟弟的录取通知书寄到镇上那天，你正在另一座城市的地下室里收拾行李。",
      good: "录取通知书寄到的那天，爹在电话里念了三遍学校名。你说：好，好。",
      great: "弟弟考上了省城的大学，你说学费别愁，家里有哥。",
      perfect: "弟弟大学毕业那年，把第一份工资寄回了家。汇款单附言写着一行字：哥，轮到我了。",
    },
  },
  {
    id: "seek_justice",
    title: "讨个说法",
    why: "爹在城里的工地干活时「意外」身亡，包工头用三万块私了了。那笔钱你没要，你上了车，要去查清楚爹到底是怎么没的。",
    goal: "在诉讼时效内找到证据、立案，替爹讨回公道。",
    stages: ["打听工友", "找到账本", "被收买", "立案开庭", "判决日"],
    goalTotal: 0,
    epilogues: {
      bad: "证据链断了，案子不了了之。你带着爹的旧工牌回了家，把它放在堂屋最显眼的地方。",
      good: "判决下来的那天，包工头当庭低下了头。你在旁听席上把爹的工牌攥出了汗。",
      great: "胜诉之后，工地上还清了所有工人的欠薪。你爹的名字，被刻在工会的感谢墙上。",
      perfect: "你不仅讨回了公道，还推动改了工地的安全规定。葬礼那天没流完的泪，你在判决日替他流完了。",
    },
  },
  {
    id: "learn_craft",
    title: "学门手艺",
    why: "村里的老人说：光会卖力气，一辈子都是苦命。家里托关系送你去城里，跟一位同乡老师傅学做面点——学成了，就饿不着了。",
    goal: "把厨艺练到 5 级，通过老师傅的出师考。",
    stages: ["拜师", "学擀面", "学拉面", "出师前考", "出师考"],
    goalTotal: 0,
    epilogues: {
      bad: "你没能出师。老师傅把擀面杖收进了柜子，说：手艺这东西，急不得。你低着头，没敢再看他。",
      good: "出师那天，老师傅把一套旧案板交给你：以后吃饭的家伙。你捧着它，像捧着一整个家。",
      great: "你的招牌面在夜市小有名气，老师傅坐在摊前吃完一碗，抹了抹嘴：像样。",
      perfect: "你盘下了老师傅的铺子，改了招牌但没改味道。老顾客都说，还是那个味儿。",
    },
  },
  {
    id: "return_glory",
    title: "风风光光回去",
    why: "全村凑钱送你进城，指望你出人头地。其实你自己也不知道要什么，只知道年底回去，不能让人看扁。",
    goal: "攒下 8000 元、挣到 30 点名声，年底体面地回去。",
    stages: ["站稳脚跟", "攒下第一笔", "挣点名望", "攒够盘缠", "回乡日"],
    goalTotal: 8000,
    epilogues: {
      bad: "你两手空空地回去了。村口没人问你，但目光像秤一样压着你。",
      good: "你带着钱回去了，给家里翻了房顶，给村里请了顿流水席。",
      great: "你不但挣了钱，还带回来一沓城里的人脉，帮村里牵线卖上了农产品。",
      perfect: "你回去那天，全村人都在。你挨个敬酒，最后对老村长说：叔，我没给咱村丢人。",
    },
  },
];

export const ARC_MAP: Record<StoryKind, StoryArcDef> = Object.fromEntries(
  ARCS.map((a) => [a.id, a]),
) as Record<StoryKind, StoryArcDef>;

export const CARDS: StoryCardDef[] = [
  /* ==================== 主线推进卡（每线 5 张） ==================== */

  // ---- 还清赌债 ----
  {
    id: "repay_s0", arc: "repay_debt", stage: 0,
    title: "站稳脚跟", icon: "🏗️",
    text: "进城第七天，你终于在一家劳务中介挂了号。爹在电话里没提钱，但你知道他在等。先找份能干的活。",
    window: [3, 30], deadlineDays: 7,
    solutions: [
      sol("yield", "干苦力日结", "干三天装卸工，攒下第一笔钱", { effects: { stamina: -35, mood: -2 }, goal: 300, conscience: 0 }),
      sol("money", "存一笔启动金", "从生活费里抠出 500 元寄回家", { requires: { money: 500 }, effects: { money: -500 }, goal: 500 }),
      sol("special", "托赵刚介绍个稳定活", "赵刚好感足够，他给你介绍了一份日结岗", { requires: { npc: "npc_zhao_gang", npcAffinity: 25 }, effects: { mood: 3 }, goal: 400 }),
    ],
    ignoreConsequence: { effects: { mood: -5 }, conscience: -1, log: "第一周没挣到钱，爹没说什么，但电话那头安静了很久", unlock: ["repay_s1"] },
  },
  {
    id: "repay_s1", arc: "repay_debt", stage: 1,
    title: "寄回第一笔钱", icon: "💌",
    text: "爹来信说，债主每月催一次，家里快撑不住了。这月必须寄回 800 元。",
    window: [25, 70], deadlineDays: 7,
    solutions: [
      sol("yield", "打双份工", "白天干日结，晚上去网吧守夜", { effects: { stamina: -45, stress: 8 }, goal: 800 }),
      sol("money", "寄出 800 元", "从积蓄里直接寄", { requires: { money: 800 }, effects: { money: -800 }, goal: 800 }),
      sol("special", "陈姐赊你一个月工钱", "陈姐提前预支你一个月工资", { requires: { npc: "npc_chen_jie", npcAffinity: 40 }, effects: { mood: 3 }, goal: 800 }),
      sol("ignore", "先拖着", "下月一起补", { conscience: -1, log: "这月没寄钱，债主的电话打到了家里" }),
    ],
    ignoreConsequence: { effects: { mood: -8 }, conscience: -2, log: "家里被债主催得鸡飞狗跳，爹在电话里骂了你一顿" },
  },
  {
    id: "repay_s2", arc: "repay_debt", stage: 2,
    title: "躲过催债", icon: "🚪",
    text: "债主不知从哪打听到你在城里，托人捎话：下个月再不还 3000，就去你厂门口堵你。",
    window: [60, 120], deadlineDays: 7,
    solutions: [
      sol("yield", "主动还 2000 认个错", "先还一部分，稳住对方", { requires: { money: 2000 }, effects: { money: -2000, mood: -3 }, goal: 2000 }),
      sol("money", "一次性还 3000", "咬咬牙全还上", { requires: { money: 3000 }, effects: { money: -3000 }, goal: 3000 }),
      sol("special", "找王磊调解", "王磊当过干部，帮你和债主谈分期", { requires: { npc: "npc_wang_lei", npcAffinity: 40 }, effects: { mood: 3 }, goal: 1000 }),
      sol("ignore", "换个厂躲几天", "先避风头", { effects: { stress: 6 }, conscience: -1, log: "你躲了三天，厂里扣了两天旷工" }),
    ],
    ignoreConsequence: { effects: { money: -500, mood: -10 }, conscience: -2, log: "债主堵到厂门口，你赔了面子还搭进去 500 元" },
  },
  {
    id: "repay_s3", arc: "repay_debt", stage: 3,
    title: "凑大额尾款", icon: "🧱",
    text: "还差最后一笔大的：8000 元。爹说家里把牛都卖了，就等你这笔。",
    window: [100, 180], deadlineDays: 10,
    solutions: [
      sol("yield", "接一个押运大单", "连续十天高强度押运，一次结 8000", { requires: { attr: { health: 45, stamina: 50 } }, effects: { stamina: -60, health: -4, stress: 10 }, goal: 8000 }),
      sol("money", "一次性寄 8000", "把积蓄全寄回去", { requires: { money: 8000 }, effects: { money: -8000 }, goal: 8000 }),
      sol("special", "创业项目赚一笔", "完成一个创业项目，用收益顶上", { requires: { skill: { programming: 3 }, flag: "item_laptop" }, effects: { mood: 8 }, goal: 8000 }),
      sol("ignore", "再拖一个月", "谎称下月发奖金", { conscience: -2, log: "你骗家里说下月发奖金，夜里睡不踏实" }),
    ],
    ignoreConsequence: { effects: { mood: -12, stress: 10 }, conscience: -3, log: "家里把最后的地也押了出去，你恨自己没用" },
  },
  {
    id: "repay_s4", arc: "repay_debt", stage: 4,
    title: "还清赌债", icon: "🔥",
    text: "债主说：钱凑齐了，就把借条烧了。爹把电话递给你，那头一片安静。",
    window: [150, 300], deadlineDays: 10,
    solutions: [
      sol("money", "凑齐尾款", "把最后一笔寄回去，债主当面烧了借条", { requires: { money: 4000 }, effects: { money: -4000, mood: 10 }, goal: 4000, conscience: 1 }),
      sol("special", "带工友一起回去作证", "当着全村的面还钱，把欠条钉在墙上", { requires: { fame: 15 }, effects: { fame: 3, mood: 8 }, goal: 4000, conscience: 1 }),
      sol("yield", "求债主宽限一年", "再签一年分期", { effects: { stress: 8, mood: -5 }, conscience: -1, goal: 0 }),
    ],
    ignoreConsequence: { effects: { mood: -15 }, conscience: -3, log: "借条没有烧掉，你心里那根刺也拔不掉" },
  },

  // ---- 奶奶的手术费 ----
  {
    id: "grandma_s0", arc: "grandma_op", stage: 0,
    title: "寄药费", icon: "💊",
    text: "奶奶的药不能断，每月要 200 元。医院说：先稳定住，手术费慢慢凑。",
    window: [3, 30], deadlineDays: 7,
    solutions: [
      sol("yield", "省吃俭用寄药费", "泡面馒头过一个月", { effects: { satiety: -10, mood: -3 }, goal: 200 }),
      sol("money", "寄 200 元", "药不能断", { requires: { money: 200 }, effects: { money: -200 }, goal: 200 }),
      sol("special", "老医生帮忙开便宜药", "社区老医生给你开了平价替代药", { requires: { contact: "library_coder" }, effects: { mood: 4 }, goal: 200 }),
    ],
    ignoreConsequence: { effects: { mood: -8 }, conscience: -2, log: "这月没寄药费，奶奶停药三天" },
  },
  {
    id: "grandma_s1", arc: "grandma_op", stage: 1,
    title: "病情恶化", icon: "🆘",
    text: "家里来信：奶奶夜里喘不上气，送了一次急诊。医生说必须尽快手术，否则……",
    window: [25, 70], deadlineDays: 7,
    solutions: [
      sol("money", "寄 1000 元住院押金", "先把人稳住", { requires: { money: 1000 }, effects: { money: -1000, mood: -4 }, goal: 1000 }),
      sol("yield", "接重症陪护夜班", "白天打工，晚上去医院陪护赚外快", { effects: { stamina: -50, health: -2, stress: 8 }, goal: 1000 }),
      sol("special", "林小雨帮忙联系慈善基金", "她认识做公益的朋友，帮忙申请了补助", { requires: { npc: "npc_lin_xiaoyu", npcAffinity: 45 }, effects: { mood: 6 }, goal: 1000 }),
      sol("ignore", "当做没收到信", "先忙眼前的", { conscience: -2, log: "你把信压在了枕头底下" }),
    ],
    ignoreConsequence: { effects: { mood: -12 }, conscience: -3, log: "奶奶在病床上念叨你的名字，你错过了那周的探视" },
  },
  {
    id: "grandma_s2", arc: "grandma_op", stage: 2,
    title: "识破黑诊所", icon: "🏥",
    text: "有人给你介绍了一家'包治百病'的诊所，说 5000 元就能'加急手术'。老医生听了直摇头。",
    window: [60, 120], deadlineDays: 7,
    solutions: [
      sol("special", "让老医生出具正规方案", "社区老医生帮你核对资质，揭穿骗局", { requires: { npc: "npc_wang_lei", npcAffinity: 30 }, effects: { mood: 5, intelligence: 1 }, conscience: 1 }),
      sol("money", "多花 500 挂号正规医院", "宁可多花钱，也不走野路子", { requires: { money: 500 }, effects: { money: -500 }, goal: 500, conscience: 1 }),
      sol("yield", "把 5000 交给黑诊所", "赌一把", { requires: { money: 5000 }, effects: { money: -5000, mood: -10 }, conscience: -2, log: "钱被骗了，奶奶的病情还耽误了一周" }),
    ],
    ignoreConsequence: { effects: { money: -2000 }, conscience: -2, log: "你犹豫了一周，黑诊所跑路了，定金 2000 打了水漂" },
  },
  {
    id: "grandma_s3", arc: "grandma_op", stage: 3,
    title: "尾款冲刺", icon: "🏃",
    text: "医院通知：手术排在两个月后，需先交 2 万定金。家里把所有亲戚都借遍了。",
    window: [100, 180], deadlineDays: 10,
    solutions: [
      sol("yield", "日夜连轴打工", "一个月不休息，拼出定金", { requires: { attr: { stamina: 40, health: 40 } }, effects: { stamina: -70, health: -5, stress: 12 }, goal: 20000 }),
      sol("money", "一次性交定金", "把积蓄都押上去", { requires: { money: 20000 }, effects: { money: -20000 }, goal: 20000 }),
      sol("special", "老医生担保分期", "他愿意担保，先交一半", { requires: { npc: "npc_chen_jie", npcAffinity: 50 }, effects: { mood: 6 }, goal: 10000 }),
      sol("ignore", "再等等", "说不定费用会降", { conscience: -2, log: "手术窗口又缩了一个月" }),
    ],
    ignoreConsequence: { effects: { mood: -12 }, conscience: -3, log: "定金没凑齐，手术往后推了一个月" },
  },
  {
    id: "grandma_s4", arc: "grandma_op", stage: 4,
    title: "手术日", icon: "🩺",
    text: "医院来电话：床位排到了，手术费还差 6000，三天内补齐，否则让给下一位。",
    window: [150, 280], deadlineDays: 3,
    solutions: [
      sol("money", "补齐 6000", "把钱凑齐，亲眼看着奶奶进手术室", { requires: { money: 6000 }, effects: { money: -6000, mood: 10 }, goal: 6000, conscience: 1 }),
      sol("special", "找基金会紧急救助", "林小雨牵线的基金会愿意垫付", { requires: { npc: "npc_lin_xiaoyu", npcAffinity: 60 }, effects: { mood: 8 }, goal: 6000, conscience: 1 }),
      sol("yield", "求医院宽限三天", "签下保证书，下周补交", { effects: { stress: 8 }, goal: 3000 }),
    ],
    ignoreConsequence: { effects: { mood: -20 }, conscience: -3, log: "床位让给了别人，你在医院走廊坐到天亮" },
  },

  // ---- 弟弟的学费 ----
  {
    id: "brother_s0", arc: "brother_school", stage: 0,
    title: "第一学期", icon: "📚",
    text: "弟弟开学要交 600 元学费加杂费。爹说：家里拿不出，你看着办。",
    window: [3, 30], deadlineDays: 7,
    solutions: [
      sol("money", "寄 600 元", "学费不能拖", { requires: { money: 600 }, effects: { money: -600 }, goal: 600 }),
      sol("yield", "打一周夜工", "白天上班晚上搬货", { effects: { stamina: -40, stress: 6 }, goal: 600 }),
      sol("special", "让弟弟申请贫困补助", "你帮弟弟写材料申请补助", { requires: { attr: { intelligence: 40 } }, effects: { mood: 4 }, goal: 600 }),
    ],
    ignoreConsequence: { effects: { mood: -6 }, conscience: -1, log: "学费迟交了三天，弟弟在教室门口站了一节课" },
  },
  {
    id: "brother_s1", arc: "brother_school", stage: 1,
    title: "成绩下滑", icon: "📉",
    text: "班主任打来电话：弟弟最近上课走神，月考退步二十名。这孩子是不是不想读了？",
    window: [25, 70], deadlineDays: 7,
    solutions: [
      sol("money", "给弟弟寄学习资料和营养费", "花 300 元买资料、订牛奶", { requires: { money: 300 }, effects: { money: -300 }, goal: 300 }),
      sol("special", "写信开导他", "你把自己打工攒钱供他读书的事写给他", { requires: { attr: { intelligence: 35 } }, effects: { mood: 5 }, goal: 100, conscience: 1 }),
      sol("yield", "请假回去看他一趟", "来回三天，当面聊聊", { effects: { money: -200, stamina: -20 }, goal: 100 }),
      sol("ignore", "忙，顾不上", "年轻人自己会想通", { conscience: -1, log: "弟弟在电话里欲言又止，最后只说：哥，没事" }),
    ],
    ignoreConsequence: { effects: { mood: -8 }, conscience: -2, log: "弟弟的成绩又掉了一截，他把书塞进了床底" },
  },
  {
    id: "brother_s2", arc: "brother_school", stage: 2,
    title: "辍学风波", icon: "🎒",
    text: "弟弟打电话说：哥，我不想念了，想去南方打工。他说家里太苦，不能总让你一个人扛。",
    window: [60, 120], deadlineDays: 7,
    solutions: [
      sol("yield", "坚决劝他读下去", "你把自己的辛苦掰开揉碎讲给他听", { effects: { mood: -4 }, goal: 300, conscience: 1 }),
      sol("money", "寄 800 元让他安心", "钱打过去，告诉他学费不用愁", { requires: { money: 800 }, effects: { money: -800 }, goal: 800 }),
      sol("special", "让老师帮忙做思想工作", "班主任出面开导，弟弟打消了念头", { requires: { contact: "library_coder" }, effects: { mood: 5 }, goal: 300, conscience: 1 }),
      sol("ignore", "随他吧", "孩子大了管不住", { conscience: -2, log: "弟弟买了南下的车票，你是在他上车后才知道的" }),
    ],
    ignoreConsequence: { effects: { mood: -12 }, conscience: -3, log: "弟弟在南方电子厂流水线站了一周，手肿得握不住筷子" },
  },
  {
    id: "brother_s3", arc: "brother_school", stage: 3,
    title: "高考冲刺", icon: "✍️",
    text: "距离高考还有一百天。弟弟说想报省城的大学，你听着心里发烫。家里需要再凑 1000 元冲刺费用。",
    window: [100, 180], deadlineDays: 10,
    solutions: [
      sol("money", "寄 1000 元冲刺费", "报补习班、买冲刺卷", { requires: { money: 1000 }, effects: { money: -1000 }, goal: 1000 }),
      sol("yield", "替弟弟买全套真题", "你托城里的书店打折买齐", { effects: { stamina: -20 }, goal: 600 }),
      sol("special", "程序员小哥给他远程补课", "你认识的码农弟弟理科好，远程辅导", { requires: { npc: "npc_wang_lei", npcAffinity: 35 }, effects: { mood: 6 }, goal: 400, conscience: 1 }),
    ],
    ignoreConsequence: { effects: { mood: -10 }, conscience: -2, log: "冲刺班名额被别人顶了，弟弟在电话里说：没事哥" },
  },
  {
    id: "brother_s4", arc: "brother_school", stage: 4,
    title: "录取通知书", icon: "🎓",
    text: "高考放榜。弟弟的分数够省城大学了，但报道要一次性交 4000 元。就这一哆嗦。",
    window: [150, 260], deadlineDays: 7,
    solutions: [
      sol("money", "凑齐 4000 元", "交上学费，亲眼看着他进校门", { requires: { money: 4000 }, effects: { money: -4000, mood: 12 }, goal: 4000, conscience: 1 }),
      sol("special", "助学贷款 + 你担保", "你替他办了助学贷款，自己担保", { requires: { attr: { intelligence: 45 } }, effects: { mood: 8 }, goal: 4000, conscience: 1 }),
      sol("yield", "请老村长担保缓交", "老村长出面，先入学后补费", { effects: { stress: 6 }, goal: 2000 }),
    ],
    ignoreConsequence: { effects: { mood: -18 }, conscience: -3, log: "报到最后一天，弟弟把录取通知书锁进了抽屉" },
  },

  // ---- 讨个说法 ----
  {
    id: "justice_s0", arc: "seek_justice", stage: 0,
    title: "打听工友", icon: "👷",
    text: "你找到当年和爹一起干活的工友。他们欲言又止，都说'是意外'，但眼神躲闪。",
    window: [3, 30], deadlineDays: 7,
    solutions: [
      sol("special", "请赵刚帮忙牵线", "赵刚认识老工人，帮你约到了关键证人", { requires: { npc: "npc_zhao_gang", npcAffinity: 30 }, effects: { mood: 3, flags: { story_evidence_witness: true } }, unlock: ["justice_s1"] }),
      sol("money", "请工友喝酒套话", "花 300 元摆一桌，有人松了口", { requires: { money: 300 }, effects: { money: -300, mood: -2, flags: { story_evidence_witness: true } }, unlock: ["justice_s1"] }),
      sol("yield", "蹲守工地半个月", "天天在工地门口等熟人", { effects: { stamina: -30, mood: -4, flags: { story_evidence_witness: true } }, unlock: ["justice_s1"] }),
    ],
    ignoreConsequence: { effects: { mood: -8 }, conscience: -1, log: "工友们散了，你再难找到愿意开口的人" },
  },
  {
    id: "justice_s1", arc: "seek_justice", stage: 1,
    title: "找到账本", icon: "📒",
    text: "一个老工友塞给你半本账本，说：出事那天，工地根本没按规程作业。但这东西，他们不会让你留着。",
    window: [25, 80], deadlineDays: 7,
    solutions: [
      sol("yield", "把账本藏进出租屋", "先收好，找懂行的人看", { effects: { mood: 2, flags: { story_evidence_ledger: true } }, unlock: ["justice_s2"] }),
      sol("special", "让程序员小哥帮忙拍照留档", "他帮你扫描备份，藏一份在云端", { requires: { npc: "npc_wang_lei", npcAffinity: 30 }, effects: { mood: 5, flags: { story_evidence_ledger: true } }, unlock: ["justice_s2"], conscience: 1 }),
      sol("money", "请律师看一遍", "花 500 元请律师评估", { requires: { money: 500 }, effects: { money: -500, flags: { story_evidence_ledger: true } }, unlock: ["justice_s2"] }),
    ],
    ignoreConsequence: { effects: { mood: -10 }, conscience: -2, log: "账本被偷了，线索断了一半" },
  },
  {
    id: "justice_s2", arc: "seek_justice", stage: 2,
    title: "被收买", icon: "💰",
    text: "包工头托人带话：这事翻篇，给你 3 万，比你爹的命值。你攥着那沓钱，指节发白。",
    window: [60, 130], deadlineDays: 7,
    solutions: [
      sol("yield", "把钱退回去", "当面把钱砸回去，说：我爹的命不卖", { effects: { mood: 6, fame: 5, flags: { story_evidence_bribe: true } }, conscience: 2, unlock: ["justice_s3"] }),
      sol("special", "录音留证，假装收下", "你收下钱，转头把录音交给王磊", { requires: { npc: "npc_wang_lei", npcAffinity: 45 }, effects: { fame: 4, flags: { story_evidence_bribe: true } }, conscience: 1, unlock: ["justice_s3"] }),
      sol("ignore", "收下钱，就此罢手", "三万块，够家里过几年了", { effects: { money: 30000, mood: -10 }, conscience: -4, log: "你把钱寄回了家，夜里却梦见爹站在工地上看你" }),
    ],
    ignoreConsequence: { effects: { mood: -15, stress: 10 }, conscience: -3, log: "你犹豫的这几天，关键证人的证词被人动了手脚" },
  },
  {
    id: "justice_s3", arc: "seek_justice", stage: 3,
    title: "立案开庭", icon: "⚖️",
    text: "王磊帮你把案子递了上去。开庭前，包工头托人递话：撤诉，这事就算了；不撤，你在这座城市待不久。",
    window: [100, 190], deadlineDays: 10,
    solutions: [
      sol("yield", "坚持开庭", "顶着压力走上法庭", { effects: { stress: 12, fame: 6 }, conscience: 2, unlock: ["justice_s4"] }),
      sol("special", "陈姐联合工友作证", "你帮过的工友愿意出庭", { requires: { npc: "npc_chen_jie", npcAffinity: 50 }, effects: { mood: 6, fame: 4 }, conscience: 1, unlock: ["justice_s4"] }),
      sol("money", "请更好的律师", "花 2000 元请名律师", { requires: { money: 2000 }, effects: { money: -2000 }, unlock: ["justice_s4"] }),
      sol("ignore", "撤诉", "你不怕，但家里人怕", { effects: { mood: -15 }, conscience: -4, log: "你在撤诉书上签了字，笔尖划破了纸" }),
    ],
    ignoreConsequence: { effects: { mood: -15, stress: 8 }, conscience: -3, log: "错过举证期，证据效力大打折扣" },
  },
  {
    id: "justice_s4", arc: "seek_justice", stage: 4,
    title: "判决日", icon: "📜",
    text: "宣判那天，旁听席上坐着当年和爹一起干活的人。你攥着爹的旧工牌，等法官念出那个名字。",
    window: [150, 280], deadlineDays: 3,
    solutions: [
      sol("yield", "听完判决", "无论结果，你都站着听完", { effects: { mood: 8, fame: 8 }, conscience: 2 }),
      sol("special", "请工友一同出庭", "你帮过的人，此刻站在你身边", { requires: { npc: "npc_chen_jie", npcAffinity: 55 }, effects: { mood: 10, fame: 5 }, conscience: 2 }),
    ],
    ignoreConsequence: { effects: { mood: -15 }, conscience: -2, log: "你没能到场，判决缺席——公道迟到了" },
  },

  // ---- 学门手艺 ----
  {
    id: "craft_s0", arc: "learn_craft", stage: 0,
    title: "拜师", icon: "🥟",
    text: "老师傅坐在案板后面打量你：要学手艺，先要懂规矩。拜师礼，你打算拿什么来？",
    window: [3, 30], deadlineDays: 7,
    solutions: [
      sol("special", "送一幅书法手稿", "你把公园书法大爷送的手稿当作拜师礼", { requires: { item: "item_manuscript" }, effects: { mood: 5, skills: { cooking: 1 } }, conscience: 1 }),
      sol("money", "包 200 元红包", "按规矩来", { requires: { money: 200 }, effects: { money: -200, skills: { cooking: 1 } } }),
      sol("yield", "白干一个月学徒", "从扫地、洗案板做起", { effects: { stamina: -30, mood: -2, skills: { cooking: 1 } } }),
    ],
    ignoreConsequence: { effects: { mood: -6 }, conscience: -1, log: "老师傅把门关上了，说：想清楚了再来" },
  },
  {
    id: "craft_s1", arc: "learn_craft", stage: 1,
    title: "学擀面", icon: "🥖",
    text: "老师傅扔给你一根擀面杖：先擀一百张皮，皮破一张，重来一遍。",
    window: [25, 70], deadlineDays: 7,
    solutions: [
      sol("yield", "擀到手臂发酸", "练基本功没有捷径", { effects: { stamina: -35, mood: -3, skills: { cooking: 1 } } }),
      sol("money", "买好面粉加班练", "自己买料，下班后加练", { requires: { money: 150 }, effects: { money: -150, skills: { cooking: 2 } } }),
      sol("special", "师兄弟偷偷指点", "老师傅的另一个徒弟帮你纠正手法", { requires: { contact: "library_coder" }, effects: { mood: 4, skills: { cooking: 1 } } }),
    ],
    ignoreConsequence: { effects: { mood: -6 }, conscience: -1, log: "你偷了几天懒，老师傅看在眼里没说话" },
  },
  {
    id: "craft_s2", arc: "learn_craft", stage: 2,
    title: "学拉面", icon: "🍜",
    text: "老师傅说：面和人的性子一样，急不得。他让你练拉面，一根不能断。",
    window: [60, 120], deadlineDays: 7,
    solutions: [
      sol("yield", "练到手抽筋", "每天收摊后加练两小时", { effects: { stamina: -40, mood: -2, skills: { cooking: 1 } } }),
      sol("money", "报名夜市摆摊练手", "边卖边练，还能挣点钱", { requires: { money: 300 }, effects: { money: -300, fame: 2, skills: { cooking: 1 } }, goal: 300 }),
      sol("special", "请老师傅吃顿好的", "请他喝酒，酒后他多教了你两招", { requires: { npc: "npc_chen_jie", npcAffinity: 40 }, effects: { mood: 6, skills: { cooking: 2 } } }),
    ],
    ignoreConsequence: { effects: { mood: -6 }, conscience: -1, log: "师傅抽查时你拉了三次都断了，他叹了口气" },
  },
  {
    id: "craft_s3", arc: "learn_craft", stage: 3,
    title: "出师前考", icon: "🏮",
    text: "老师傅的铺子被对头盯上了，对方放话要收购门面。师傅说：你出一桌面点，把客人留住，我就教你压箱底的手艺。",
    window: [100, 190], deadlineDays: 10,
    solutions: [
      sol("yield", "连夜赶制一桌面点", "包子、拉面、花卷，把客人喂饱", { requires: { skill: { cooking: 3 } }, effects: { stamina: -45, fame: 3, skills: { cooking: 1 } }, goal: 500 }),
      sol("money", "买好食材办试吃", "花钱办一场免费试吃攒人气", { requires: { money: 600 }, effects: { money: -600, fame: 4, skills: { cooking: 1 } }, goal: 400 }),
      sol("special", "程序员小哥帮你发网帖", "他在本地论坛帮你宣传了铺子", { requires: { npc: "npc_wang_lei", npcAffinity: 35 }, effects: { fame: 4, mood: 4, skills: { cooking: 1 } } }),
    ],
    ignoreConsequence: { effects: { money: -400, mood: -8 }, conscience: -1, log: "对头挖走了两个熟客，铺子生意冷了一截" },
  },
  {
    id: "craft_s4", arc: "learn_craft", stage: 4,
    title: "出师考", icon: "🎖️",
    text: "老师傅说：最后一道题，做一碗你心里最好的面。他说完，坐到了门口的长椅上等你。",
    window: [150, 280], deadlineDays: 7,
    solutions: [
      sol("yield", "做一碗最用心的面", "把这一年的苦都揉进面里", { requires: { skill: { cooking: 4 } }, effects: { mood: 10, fame: 4, skills: { cooking: 1 } }, conscience: 1 }),
      sol("special", "请师傅的老友来尝", "王磊当了一辈子美食家，他的一句话顶你练一年", { requires: { npc: "npc_wang_lei", npcAffinity: 50 }, effects: { mood: 8, fame: 5, skills: { cooking: 1 } }, conscience: 1 }),
    ],
    ignoreConsequence: { effects: { mood: -12 }, conscience: -2, log: "你怕考砸，没敢上案板。师傅把门关了三天" },
  },

  // ---- 风风光光回去 ----
  {
    id: "glory_s0", arc: "return_glory", stage: 0,
    title: "站稳脚跟", icon: "🧭",
    text: "进城第一个月，你连东南西北都分不清。村里来信：'好好干，别给咱村丢人。'",
    window: [3, 30], deadlineDays: 7,
    solutions: [
      sol("yield", "先找份稳定的活", "日结也好，先站稳", { effects: { stamina: -20 }, goal: 300 }),
      sol("money", "存下第一笔钱", "省吃俭用攒 500", { requires: { money: 500 }, effects: { money: -500 }, goal: 500 }),
      sol("special", "让赵刚介绍个熟人圈子", "进城办事，先要有认得的人", { requires: { npc: "npc_zhao_gang", npcAffinity: 20 }, effects: { mood: 3 }, goal: 300 }),
    ],
    ignoreConsequence: { effects: { mood: -6 }, conscience: -1, log: "一个月过去，你连房租都差点没交上" },
  },
  {
    id: "glory_s1", arc: "return_glory", stage: 1,
    title: "攒下第一笔", icon: "🏦",
    text: "村里开始有人打电话问：挣了多少了？你对着存折上的一千块，说了句：还行。",
    window: [25, 70], deadlineDays: 7,
    solutions: [
      sol("yield", "打双份工攒钱", "辛苦是辛苦，数字在涨", { effects: { stamina: -40, stress: 6 }, goal: 1200 }),
      sol("money", "存 1200 元", "钱在存折上，心里才踏实", { requires: { money: 1200 }, effects: { money: -1200 }, goal: 1200 }),
      sol("special", "让陈姐教你记账", "她的账本让每一分钱都有去处", { requires: { npc: "npc_chen_jie", npcAffinity: 30 }, effects: { mood: 3, intelligence: 1 }, goal: 800 }),
    ],
    ignoreConsequence: { effects: { mood: -8 }, conscience: -1, log: "电话里你吹了个牛，挂了电话盯着存折发愣" },
  },
  {
    id: "glory_s2", arc: "return_glory", stage: 2,
    title: "挣点名望", icon: "🌟",
    text: "村里传话：隔壁村的小子回来给村里拉了项目。老村长问你：你在城里，认识几个人？",
    window: [60, 130], deadlineDays: 7,
    solutions: [
      sol("yield", "街头卖艺攒名声", "拉不下脸，但确实来钱", { requires: { attr: { charm: 25 } }, effects: { fame: 4, stamina: -25 }, goal: 400 }),
      sol("money", "赞助一次社区活动", "花 500 元捐给社区，名字上了红榜", { requires: { money: 500 }, effects: { money: -500, fame: 4 }, goal: 300 }),
      sol("special", "带工友参加公益", "你组队去敬老院帮厨，上了本地新闻", { requires: { npc: "npc_chen_jie", npcAffinity: 45 }, effects: { fame: 6, mood: 6 }, goal: 200, conscience: 2 }),
    ],
    ignoreConsequence: { effects: { fame: -2, mood: -6 }, conscience: -1, log: "你在城里三年没留下一个名字" },
  },
  {
    id: "glory_s3", arc: "return_glory", stage: 3,
    title: "攒够盘缠", icon: "🧳",
    text: "离年底还有三个月。村长在电话里说：村里等着你回来摆酒。你数了数存折，还差得远。",
    window: [100, 190], deadlineDays: 10,
    solutions: [
      sol("yield", "冲刺三个月", "三份工轮着打", { requires: { attr: { stamina: 45 } }, effects: { stamina: -60, health: -3 }, goal: 4000 }),
      sol("money", "存 4000 元", "盘缠和酒席钱", { requires: { money: 4000 }, effects: { money: -4000 }, goal: 4000 }),
      sol("special", "创业项目赚一笔", "把技能变成钱", { requires: { skill: { programming: 3 }, flag: "item_laptop" }, effects: { mood: 8, fame: 3 }, goal: 3000 }),
      sol("ignore", "到时候借钱充面子", "先应下来再说", { effects: { stress: 8 }, conscience: -1, log: "你答应得痛快，心里却越来越虚" }),
    ],
    ignoreConsequence: { effects: { money: -1000, mood: -10 }, conscience: -2, log: "为了充场面你先借了钱，窟窿越捅越大" },
  },
  {
    id: "glory_s4", arc: "return_glory", stage: 4,
    title: "回乡日", icon: "🏡",
    text: "腊月二十三，你站在村口。老村长领着人迎出来，有人扛着鞭炮，有人端着酒。",
    window: [150, 300], deadlineDays: 10,
    solutions: [
      sol("money", "摆酒请全村", "流水席摆了十桌，你挨个敬酒", { requires: { money: 3000 }, effects: { money: -3000, mood: 12, fame: 5 }, goal: 3000, conscience: 1 }),
      sol("special", "给村里牵线卖农产品", "你带来城里的人脉，帮村里开了销路", { requires: { fame: 25 }, effects: { fame: 6, mood: 10 }, goal: 2000, conscience: 2 }),
      sol("yield", "低调地回去", "只和家人吃了一顿饭", { effects: { mood: 4 }, goal: 500 }),
    ],
    ignoreConsequence: { effects: { mood: -12 }, conscience: -2, log: "你最终没敢回去，村里那桌酒席空了一整年" },
  },

  /* ==================== 主线障碍卡（每线 2 张） ==================== */

  {
    id: "repay_obstacle_debtor", arc: "repay_debt",
    title: "债主上门", icon: "🪓",
    text: "债主的打手找到了你的出租屋，扔下一张名片：下个月再不还 3000，就不是递名片这么简单了。",
    window: [40, 150], deadlineDays: 7, requires: { stageMin: 1 },
    solutions: [
      sol("money", "还 3000 息事宁人", "破财消灾", { requires: { money: 3000 }, effects: { money: -3000 }, goal: 3000 }),
      sol("yield", "报警备案", "警察来了，打手暂时消停", { effects: { stress: 6 }, conscience: 0 }),
      sol("special", "赵刚出面周旋", "赵刚在劳务市场有面子，帮你压了压", { requires: { npc: "npc_zhao_gang", npcAffinity: 50 }, effects: { mood: 4 }, goal: 1500 }),
      sol("ignore", "搬家躲起来", "换个住处，先躲一阵", { effects: { money: -200, mood: -5 }, conscience: -1 }),
    ],
    ignoreConsequence: { effects: { money: -800, mood: -10 }, conscience: -1, log: "打手砸了门锁，你损失了 800 元财物" },
  },
  {
    id: "repay_obstacle_gray", arc: "repay_debt",
    title: "快钱的诱惑", icon: "🎰",
    text: "工友神神秘秘地说：有个来钱快的活，一晚上 2000，就问你敢不敢。你想起家里那张借条。",
    window: [70, 200], deadlineDays: 7, requires: { stageMin: 2 },
    solutions: [
      sol("yield", "接下这单", "你知道不干净，但钱太急了", { effects: { money: 2000, mood: -8, stress: 10 }, conscience: -3, log: "钱是挣到了，你的手也脏了", unlock: ["neutral_info_sale"] }),
      sol("money", "用积蓄顶上", "宁可慢一点，也不碰脏钱", { requires: { money: 2000 }, effects: { money: -2000, mood: 4 }, goal: 2000, conscience: 2 }),
      sol("special", "让程序员小哥查查底细", "他查出这是个骗局，你躲过一劫", { requires: { npc: "npc_wang_lei", npcAffinity: 40 }, effects: { mood: 5, intelligence: 1 }, conscience: 1 }),
      sol("ignore", "当没听见", "心里默念：忍", { effects: { mood: -4 }, conscience: 0 }),
    ],
    ignoreConsequence: { effects: { money: -500 }, conscience: -1, log: "工友因为你没接单，赌气摔了杯子，你赔了 500" },
  },

  {
    id: "grandma_obstacle_clinic", arc: "grandma_op",
    title: "黑诊所上门推销", icon: "💉",
    text: "一个自称'专家'的人找到你：包治百病，先交 2000 定金，手术费全免。他把宣传单塞进你手里。",
    window: [40, 150], deadlineDays: 7, requires: { stageMin: 1 },
    solutions: [
      sol("money", "花 500 元核实资质", "你花钱查了他们的底", { requires: { money: 500 }, effects: { money: -500 }, conscience: 1 }),
      sol("special", "老医生帮你写'防骗单'", "他把常见骗术写给你看", { requires: { npc: "npc_wang_lei", npcAffinity: 35 }, effects: { intelligence: 1, mood: 4 }, conscience: 1 }),
      sol("ignore", "撕了传单", "眼不见心不烦", { effects: { mood: -2 } }),
    ],
    ignoreConsequence: { effects: { money: -2000, mood: -10 }, conscience: -2, log: "你半信半疑交了定金，人跑了" },
  },
  {
    id: "grandma_obstacle_bill", arc: "grandma_op",
    title: "医院催款单", icon: "🧾",
    text: "医院发来催款通知：住院费欠了 1200，一周内不补，停药。",
    window: [70, 200], deadlineDays: 7, requires: { stageMin: 2 },
    solutions: [
      sol("money", "补交 1200", "药不能停", { requires: { money: 1200 }, effects: { money: -1200 }, goal: 1200 }),
      sol("yield", "申请分期", "和医院谈妥按月补", { effects: { stress: 4 }, goal: 600 }),
      sol("special", "陈姐帮你垫付", "她年轻时也欠过医药费，懂这种难", { requires: { npc: "npc_chen_jie", npcAffinity: 55 }, effects: { mood: 8 }, goal: 1200, conscience: 1 }),
      sol("ignore", "拖一拖", "说不定医院忘了", { conscience: -1, log: "奶奶的药停了两天" }),
    ],
    ignoreConsequence: { effects: { money: -1500, mood: -10 }, conscience: -2, log: "停药两天后病情反复，重新住院多花了 1500" },
  },

  {
    id: "brother_obstacle_bully", arc: "brother_school",
    title: "弟弟被欺负", icon: "🥊",
    text: "弟弟在校被几个混混堵了几次，书包被扔进池塘。他不敢说，是你打电话听出他声音不对。",
    window: [40, 150], deadlineDays: 7, requires: { stageMin: 1 },
    solutions: [
      sol("yield", "请假回县城一趟", "亲自去学校找老师", { effects: { money: -200, stamina: -20 }, goal: 100 }),
      sol("money", "给班主任塞红包", "托老师多照看", { requires: { money: 500 }, effects: { money: -500 }, goal: 200 }),
      sol("special", "让退役的表哥去接他", "你城里认识的退役军人，顺路回了趟老家", { requires: { contact: "landlord" }, effects: { mood: 6 }, goal: 200, conscience: 1 }),
      sol("ignore", "告诉他要坚强", "男孩子挨两下没事", { conscience: -2, log: "弟弟在学校越来越沉默" }),
    ],
    ignoreConsequence: { effects: { mood: -10 }, conscience: -2, log: "混混变本加厉，弟弟一周没敢去上课" },
  },
  {
    id: "brother_obstacle_loan", arc: "brother_school",
    title: "高利贷上门", icon: "🧮",
    text: "家里的一个远房亲戚借了高利贷跑路，债主找上了你家门，说：你是老大，你来还。",
    window: [80, 200], deadlineDays: 7, requires: { stageMin: 2 },
    solutions: [
      sol("money", "替亲戚还 2000", "先堵上窟窿，回头再找亲戚算账", { requires: { money: 2000 }, effects: { money: -2000, mood: -5 }, goal: 2000 }),
      sol("special", "王磊帮你出法律意见", "他教你如何应对暴力催收", { requires: { npc: "npc_wang_lei", npcAffinity: 50 }, effects: { mood: 5, intelligence: 1 }, goal: 500, conscience: 1 }),
      sol("yield", "报警处理", "让警察介入", { effects: { stress: 8, mood: -2 }, goal: 0 }),
      sol("ignore", "让家里自己扛", "这不是你的债", { effects: { mood: -8 }, conscience: -2, log: "家里的门被泼了油漆" }),
    ],
    ignoreConsequence: { effects: { money: -1000, mood: -10 }, conscience: -2, log: "你不管，家里只好借钱还，又背了一层债" },
  },

  {
    id: "justice_obstacle_threat", arc: "seek_justice",
    title: "匿名警告", icon: "✉️",
    text: "门口塞了一封信：别查了，再查下去，你和你家里人都不会好过。信里夹着一张照片——你家门口。",
    window: [40, 150], deadlineDays: 7, requires: { stageMin: 1 },
    solutions: [
      sol("yield", "把信交给警方", "报警，留下记录", { effects: { stress: 8, mood: -3 }, conscience: 1 }),
      sol("money", "花钱请保镖/搬家", "换住处，花 1000 买安心", { requires: { money: 1000 }, effects: { money: -1000 }, goal: 500 }),
      sol("special", "赵刚派人盯着", "江湖人办江湖事", { requires: { npc: "npc_zhao_gang", npcAffinity: 50 }, effects: { mood: 4 }, goal: 500 }),
      sol("ignore", "烧了信继续查", "你爹的命比你的怕值钱", { effects: { stress: 6 }, conscience: 1, unlock: ["justice_obstacle_bribe"] }),
    ],
    ignoreConsequence: { effects: { money: -500, mood: -8 }, conscience: -1, log: "你夜里被砸了窗，赔了 500 修玻璃" },
  },
  {
    id: "justice_obstacle_bribe", arc: "seek_justice",
    title: "证人的沉默", icon: "🤐",
    text: "当年亲眼看到事故的老张，突然改了口：那天我什么都没看见。他老婆在病床上等钱。",
    window: [80, 200], deadlineDays: 7, requires: { stageMin: 2 },
    solutions: [
      sol("money", "替他垫医药费", "给他老婆垫 2000 手术费", { requires: { money: 2000 }, effects: { money: -2000, mood: 3 }, unlock: ["justice_s3"], conscience: 1 }),
      sol("special", "王磊出面作保", "有干部担保，老张才敢说真话", { requires: { npc: "npc_wang_lei", npcAffinity: 50 }, effects: { mood: 6 }, unlock: ["justice_s3"], conscience: 1 }),
      sol("yield", "用录音笔套话", "你单独约老张，录下了关键证词", { effects: { stress: 8 }, unlock: ["justice_s3"], conscience: 0 }),
      sol("ignore", "算了吧", "少一个证人而已", { effects: { mood: -6 }, conscience: -2 }),
    ],
    ignoreConsequence: { effects: { mood: -10 }, conscience: -2, log: "老张连夜搬走了，你失去最后一个证人" },
  },

  {
    id: "craft_obstacle_rival", arc: "learn_craft",
    title: "对头踢馆", icon: "🥊",
    text: "街对面的新店放话：老师傅的徒弟？来，比一场，输了就关店走人。店里老客都看着你。",
    window: [60, 170], deadlineDays: 7, requires: { stageMin: 2 },
    solutions: [
      sol("yield", "应战", "用刚学的手艺比一场", { requires: { skill: { cooking: 3 } }, effects: { fame: 4, mood: 3, skills: { cooking: 1 } }, goal: 300 }),
      sol("money", "请评委压场", "请美食博主来公正评判", { requires: { money: 600 }, effects: { money: -600, fame: 3 }, goal: 200 }),
      sol("special", "老师傅亲自压阵", "师父往门口一坐，对头气势就矮了半截", { requires: { npc: "npc_wang_lei", npcAffinity: 45 }, effects: { fame: 5, mood: 6 }, goal: 200, conscience: 1 }),
      sol("ignore", "不接招", "清者自清", { effects: { fame: -2, mood: -4 } }),
    ],
    ignoreConsequence: { effects: { fame: -4, mood: -6 }, conscience: -1, log: "你不战而退，街坊开始传言老师傅手艺不行了" },
  },
  {
    id: "craft_obstacle_rent", arc: "learn_craft",
    title: "铺子涨价", icon: "📈",
    text: "房东通知：铺子租金翻倍，不租就搬。老师傅攥着存折沉默了一下午。",
    window: [90, 200], deadlineDays: 10, requires: { stageMin: 3 },
    solutions: [
      sol("money", "帮师傅垫半年租金", "垫 3000 元", { requires: { money: 3000 }, effects: { money: -3000, mood: 6 }, goal: 2000, conscience: 2 }),
      sol("yield", "和房东谈分期", "你替师傅出面周旋", { requires: { attr: { charm: 40 } }, effects: { mood: 4 }, goal: 1000 }),
      sol("special", "王磊帮忙找新铺面", "他认识中介，帮你谈了个便宜的", { requires: { npc: "npc_wang_lei", npcAffinity: 50 }, effects: { mood: 8 }, goal: 1500, conscience: 1 }),
      sol("ignore", "让师傅自己想办法", "他自己的铺子", { effects: { mood: -8 }, conscience: -2, log: "师傅没说什么，但你出师那天，他没笑" }),
    ],
    ignoreConsequence: { effects: { money: -1500, mood: -8 }, conscience: -2, log: "铺子最终还是搬了，熟客丢了一大半" },
  },

  {
    id: "glory_obstacle_scam", arc: "return_glory",
    title: "成功学骗局", icon: "🎤",
    text: "有人拉你听'三天变富翁'的课，说交 2000 元入场费，就能认识'改变命运的人脉'。会场里人山人海。",
    window: [50, 170], deadlineDays: 7, requires: { stageMin: 1 },
    solutions: [
      sol("money", "交 2000 元听课", "万一真有用呢", { requires: { money: 2000 }, effects: { money: -2000, mood: -6 }, conscience: -1, log: "课讲完，除了口号你什么也没学会" }),
      sol("special", "程序员小哥上网查背景", "他查出这是传销骗局", { requires: { npc: "npc_wang_lei", npcAffinity: 30 }, effects: { intelligence: 1, mood: 4 }, conscience: 1 }),
      sol("yield", "假装感兴趣白蹭课", "你蹭了两天，一分钱没花", { effects: { stress: 3, mood: -2 } }),
      sol("ignore", "看都不看", "天上不掉馅饼", { effects: { mood: 2 }, conscience: 0 }),
    ],
    ignoreConsequence: { effects: { money: -2000, mood: -8 }, conscience: -1, log: "你半信半疑交了 2000，课程一半是喊口号" },
  },
  {
    id: "glory_obstacle_letter", arc: "return_glory",
    title: "村里的来信", icon: "✉️",
    text: "老村长来信：隔壁村的小子给村里拉了项目，咱村就等你了。信里还夹着两张车票——一张是回程的。",
    window: [70, 200], deadlineDays: 7, requires: { stageMin: 2 },
    solutions: [
      sol("yield", "回信坦诚", "告诉村长你还在努力，别让全村等你", { effects: { mood: 2, fame: 1 }, conscience: 1 }),
      sol("money", "先寄 1000 元给村里修路", "钱到，人心稳", { requires: { money: 1000 }, effects: { money: -1000, fame: 3 }, goal: 1000 }),
      sol("special", "带城里朋友一起回信", "你认识的人越多，信里越有分量", { requires: { fame: 15 }, effects: { fame: 2, mood: 3 }, goal: 500 }),
      sol("ignore", "把信压着", "等有了成绩再回", { effects: { mood: -4 }, conscience: -1 }),
    ],
    ignoreConsequence: { effects: { fame: -3, mood: -6 }, conscience: -1, log: "你没回信，村里人说你在城里把家乡忘了" },
  },

  /* ==================== 中立卡（12 张，任意主线适用） ==================== */

  {
    id: "neutral_friend_errand",
    title: "朋友的忙", icon: "🤝",
    text: "朋友打电话来：有个急事，帮我跑一趟，三天内办完就行。具体是什么，电话里没说清。",
    window: [15, 330], deadlineDays: 3,
    solutions: [
      sol("yield", "去办", "花半天时间跑一趟", { effects: { stamina: -10, mood: 2 }, conscience: 1 }),
      sol("money", "花钱请人代办", "出 50 元找人跑腿", { requires: { money: 50 }, effects: { money: -50, mood: 1 } }),
      sol("ignore", "说在忙", "下次吧", { effects: { mood: -3 } }),
      sol("special", "让另一个朋友代办", "你认识的人里正好有人顺路", { requires: { npc: "npc_zhao_gang", npcAffinity: 30 }, effects: { mood: 3 }, conscience: 1 }),
    ],
    ignoreConsequence: { effects: { mood: -6 }, log: "朋友说没事，但语气淡了不少" },
  },
  {
    id: "neutral_borrow_id",
    title: "借证件", icon: "🪪",
    text: "工友说：身份证复印件借我用一下，办入职手续。他眼神有点飘。",
    window: [20, 200], deadlineDays: 3,
    solutions: [
      sol("yield", "借给他", "都是兄弟，别多想", { effects: { mood: 2 }, conscience: -1, log: "几天后你收到一笔不明转账记录", unlock: ["neutral_info_sale"] }),
      sol("money", "给 50 元让他别借", "宁可破财", { requires: { money: 50 }, effects: { money: -50 } }),
      sol("ignore", "婉拒", "证件不外借", { effects: { mood: -3 } }),
      sol("special", "让程序员小哥查查", "他提醒你，最近有人拿复印件开卡", { requires: { npc: "npc_wang_lei", npcAffinity: 35 }, effects: { intelligence: 1, mood: 3 }, conscience: 1 }),
    ],
    ignoreConsequence: { effects: { mood: -4 }, log: "工友没再提，但你们之间有了点隔阂" },
  },
  {
    id: "neutral_red_white",
    title: "红白喜事", icon: "🧧",
    text: "同事家办喜事，随份子的名单传到了你手里。不去不好看，去了又是一笔。",
    window: [25, 300], deadlineDays: 5,
    solutions: [
      sol("money", "随 200 元", "礼多人不怪", { requires: { money: 200 }, effects: { money: -200, mood: 2 } }),
      sol("yield", "帮忙干活抵礼", "提前去帮了一天忙", { effects: { stamina: -15, mood: 3 } }),
      sol("ignore", "托人说有事", "钱省了，面子薄了", { effects: { mood: -4 } }),
      sol("special", "送一幅书法手稿", "比钱有心意", { requires: { item: "item_manuscript" }, effects: { mood: 4, fame: 1 }, conscience: 1 }),
    ],
    ignoreConsequence: { effects: { mood: -6 }, log: "同事没说什么，但排班时你总是被排到夜班" },
  },
  {
    id: "neutral_midnight_loan",
    title: "深夜电话", icon: "🌙",
    text: "凌晨一点，一个老朋友打来电话：兄弟，江湖救急，借 50 块，明天就还。",
    window: [20, 280], deadlineDays: 2,
    solutions: [
      sol("yield", "借给他", "50 块不算什么", { requires: { money: 50 }, effects: { money: -50, mood: 2 } }),
      sol("ignore", "假装没听见", "再打来就关机", { effects: { mood: -4 }, conscience: -1 }),
      sol("special", "问清原因帮他想办法", "原来是孩子发烧，你帮他联系了陈姐家的诊所", { requires: { npc: "npc_chen_jie", npcAffinity: 35 }, effects: { mood: 5 }, conscience: 2 }),
    ],
    ignoreConsequence: { effects: { mood: -5 }, log: "第二天他托人带话：那 50 块不用了，你看不起人" },
  },
  {
    id: "neutral_utility_split",
    title: "合租分摊", icon: "💡",
    text: "室友说这个月水电超了，让你多摊 30 块，说他家里困难。你知道他家其实不困难。",
    window: [25, 250], deadlineDays: 3,
    solutions: [
      sol("money", "多出 30 元", "多一事不如少一事", { requires: { money: 30 }, effects: { money: -30, mood: 1 } }),
      sol("ignore", "按规矩平摊", "亲兄弟明算账", { effects: { mood: -3 } }),
      sol("special", "帮他介绍份加班", "让他自己赚，别总惦记别人的", { requires: { contact: "factory_leader" }, effects: { mood: 4 }, conscience: 1 }),
    ],
    ignoreConsequence: { effects: { mood: -4 }, log: "室友夜里把空调温度调高了一度" },
  },
  {
    id: "neutral_breakfast",
    title: "顺手带饭", icon: "🥪",
    text: "同事每天早上让你带早饭，已经一个月没给过钱。今天他又把 5 块钱塞到你桌上——还是那 5 块。",
    window: [30, 260], deadlineDays: 3,
    solutions: [
      sol("yield", "继续带", "算了，几块钱", { effects: { money: -10, mood: -1 } }),
      sol("ignore", "这周不带", "让他自己买", { effects: { mood: -4 } }),
      sol("special", "教他自己做早餐", "你把自己学的厨艺教他，一劳永逸", { requires: { skill: { cooking: 2 } }, effects: { mood: 4, fame: 1 }, conscience: 1 }),
    ],
    ignoreConsequence: { effects: { mood: -4 }, log: "同事在背后说你小气" },
  },
  {
    id: "neutral_storage",
    title: "旧物寄存", icon: "🧳",
    text: "一个朋友说要去外地几天，把一个行李箱寄存在你屋里：帮我看着，别动。箱子挺沉。",
    window: [40, 260], deadlineDays: 7,
    solutions: [
      sol("yield", "收下", "朋友一场", { effects: { mood: 2 }, conscience: -1, log: "夜里你听见箱子里有轻微的电子音", unlock: ["neutral_info_sale"] }),
      sol("ignore", "婉拒", "屋里没地方", { effects: { mood: -4 } }),
      sol("special", "让陈姐帮你看看", "她见得多，一眼看出箱子不对劲", { requires: { npc: "npc_chen_jie", npcAffinity: 45 }, effects: { mood: 4 }, conscience: 1 }),
    ],
    ignoreConsequence: { effects: { stress: 6 }, log: "箱子在你屋里放了半个月，朋友再也没来取" },
  },
  {
    id: "neutral_dinner_invite",
    title: "请客吃饭", icon: "🍲",
    text: "认识不久的朋友约你吃饭，说'我请'。结账时，服务员把账单放到了你面前。",
    window: [25, 280], deadlineDays: 3,
    solutions: [
      sol("money", "大方请了", "面子比钱贵", { requires: { money: 120 }, effects: { money: -120, mood: 4, fame: 1 } }),
      sol("ignore", "AA", "谁也别占谁便宜", { effects: { mood: -3 } }),
      sol("special", "带自己做的饭菜去", "你下厨做了一桌，比饭店还香", { requires: { skill: { cooking: 3 } }, effects: { mood: 6, fame: 2 }, conscience: 1 }),
    ],
    ignoreConsequence: { effects: { mood: -5 }, log: "朋友说改天再聚，但你们没再聚过" },
  },
  {
    id: "neutral_neighbor_help",
    title: "求医问药", icon: "🏥",
    text: "隔壁老太太敲你门：孙子发烧了，你能送我们去医院吗？她腿脚不好。",
    window: [30, 280], deadlineDays: 2,
    solutions: [
      sol("yield", "送他们去医院", "折腾半宿，天亮才回来", { effects: { stamina: -20, mood: 5 }, conscience: 2 }),
      sol("ignore", "说自己也病了", "不是不想帮", { effects: { mood: -5 }, conscience: -1 }),
      sol("special", "请陈姐上门看看", "陈姐懂点医，先应急", { requires: { npc: "npc_chen_jie", npcAffinity: 40 }, effects: { mood: 6 }, conscience: 2 }),
    ],
    ignoreConsequence: { effects: { mood: -6 }, log: "老太太自己背孙子去了医院，你一夜没睡好" },
  },
  {
    id: "neutral_refer_job",
    title: "介绍工作", icon: "🧰",
    text: "老乡让你介绍进厂，说想跟你干。可厂里这周名额就一个，你自己也想留下。",
    window: [35, 220], deadlineDays: 5,
    solutions: [
      sol("yield", "把名额让给他", "老乡不容易", { effects: { mood: -3, fame: 2 }, conscience: 1 }),
      sol("ignore", "自己上", "先顾自己", { effects: { mood: -4 }, conscience: -1 }),
      sol("special", "花 200 元找中介加名额", "两全其美", { requires: { money: 200 }, effects: { money: -200, mood: 4, fame: 1 }, conscience: 1 }),
    ],
    ignoreConsequence: { effects: { mood: -5 }, log: "老乡去了隔壁厂，后来再没联系你" },
  },
  {
    id: "neutral_shift_favor",
    title: "顶班还情", icon: "🔄",
    text: "上个月你欠了同事一个人情，他说：这周末帮我顶个班，我回老家。",
    window: [45, 240], deadlineDays: 4,
    solutions: [
      sol("yield", "去顶班", "人情债，欠不得", { effects: { stamina: -25, mood: 2 }, conscience: 1 }),
      sol("ignore", "说自己有安排", "下回再说", { effects: { mood: -5 }, conscience: -1 }),
      sol("special", "找人替你顶", "你认识的工友正好想挣加班费", { requires: { npc: "npc_zhao_gang", npcAffinity: 40 }, effects: { mood: 3 } }),
    ],
    ignoreConsequence: { effects: { mood: -6 }, log: "同事回来没说什么，但再也没帮过你" },
  },
  {
    id: "neutral_info_sale",
    title: "信息买卖", icon: "🕵️",
    text: "有人出 100 元，买你'邻居的作息'和'公司内部消息'。他说：只是问问。",
    window: [50, 300], deadlineDays: 3,
    solutions: [
      sol("yield", "卖给他", "100 块也是钱", { effects: { money: 100, mood: -6 }, conscience: -3, log: "钱到账了，你心里沉甸甸的" }),
      sol("ignore", "不卖", "来路不明的人，少沾", { effects: { mood: 2 }, conscience: 1 }),
      sol("special", "告诉当事人", "你把这事告诉邻居和主管，他们开始防着那个人", { requires: { npc: "npc_chen_jie", npcAffinity: 40 }, effects: { mood: 5, fame: 2 }, conscience: 2 }),
    ],
    ignoreConsequence: { effects: { mood: -6 }, conscience: -1, log: "那人换了个方式，从别人那买到了消息" },
  },

  /* ---- 赌鬼投靠（特殊中立卡，走赌鬼状态机） ---- */
  {
    id: "neutral_gambler_arrives",
    title: "赌鬼亲戚进城", icon: "🎲",
    text: "家里那个好赌的二叔突然出现在你出租屋门口，行李都没带，说：侄子，城里我人生地不熟，先住你这儿。你闻到他身上的酒味。",
    window: [25, 80], deadlineDays: 7, always: true,
    solutions: [
      sol("money", "给 800 元打发他回老家", "路费加'赌本'，送走瘟神", { requires: { money: 800 }, effects: { money: -800, mood: -4 }, conscience: 0 }),
      sol("special", "赵刚出面送他上车", "赵刚一句话，比你的钱管用", { requires: { npc: "npc_zhao_gang", npcAffinity: 45 }, effects: { mood: 4 }, conscience: 1 }),
      sol("special", "王磊介绍他去戒赌所", "王磊帮他联系了戒赌所，还安排了份临时工", { requires: { npc: "npc_wang_lei", npcAffinity: 45 }, effects: { mood: 5, fame: 1 }, conscience: 2 }),
      sol("yield", "先让他住下", "都是亲戚，总不能赶出去", { effects: { mood: -4 }, conscience: -1, log: "二叔住下了，你的钱包开始以肉眼可见的速度瘪下去" }),
    ],
    ignoreConsequence: { effects: { money: -500, mood: -10 }, conscience: -1, log: "第七天夜里，二叔偷了你 500 元现金和一块值钱的东西，从此消失" },
  },
];

export const CARD_MAP: Record<string, StoryCardDef> = Object.fromEntries(
  CARDS.map((c) => [c.id, c]),
);

/** 各主线阶段推进卡 id（stage 0..4） */
export const ARC_STAGE_CARDS: Record<StoryKind, string[]> = {
  repay_debt: ["repay_s0", "repay_s1", "repay_s2", "repay_s3", "repay_s4"],
  grandma_op: ["grandma_s0", "grandma_s1", "grandma_s2", "grandma_s3", "grandma_s4"],
  brother_school: ["brother_s0", "brother_s1", "brother_s2", "brother_s3", "brother_s4"],
  seek_justice: ["justice_s0", "justice_s1", "justice_s2", "justice_s3", "justice_s4"],
  learn_craft: ["craft_s0", "craft_s1", "craft_s2", "craft_s3", "craft_s4"],
  return_glory: ["glory_s0", "glory_s1", "glory_s2", "glory_s3", "glory_s4"],
};
