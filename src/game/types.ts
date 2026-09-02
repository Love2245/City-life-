/**
 * 游戏核心类型定义（纯逻辑层，禁止 import DOM/Svelte/Tauri）
 * 所有类型与 JSON 存档 schema 一一对应。
 */

/** 时段制：一天 3 个主时段 + 可选深夜 */
export type Period = "morning" | "afternoon" | "evening" | "night";

export const PERIOD_ORDER: Period[] = ["morning", "afternoon", "evening", "night"];

/** 生存属性（0-100，每日自然变化） */
export interface SurvivalAttrs {
  /** 体力 */
  stamina: number;
  /** 健康 */
  health: number;
  /** 心情 */
  mood: number;
  /** 干净度 */
  hygiene: number;
  /** 饱腹 */
  satiety: number;
}

/** 发展属性（长期积累） */
export interface GrowthStats {
  /** 智力 */
  intelligence: number;
  /** 魅力 */
  charm: number;
  /** 体质 */
  fitness: number;
  /** 影响力（创业线关键） */
  fame: number;
}

/** 技能（0-10 级） */
export interface Skills {
  programming: number;
  design: number;
  writing: number;
  operation: number;
  cooking: number;
  service: number;
  driving: number;
  management: number;
}

export type SkillKey = keyof Skills;

/** 关系状态 */
export type RelationState = "stranger" | "acquaintance" | "friend" | "close_friend" | "lover" | "blocked";

/** v0.991 游戏模式 */
export type GameMode = "normal" | "eternal" | "story";

/** 借款记录 */
export interface Loan {
  amount: number;
  /** 借款日（绝对日 linearDay） */
  since: number;
}

export interface Relationship {
  npcId: string;
  /** 好感度 0-100 */
  affinity: number;
  state: RelationState;
  /** 上次互动日（绝对日 linearDay）；用于淡漠/恋爱维护判定 */
  lastInteractionDay?: number;
  /** 未清借款 */
  loan?: Loan;
  /** 约会次数 */
  dateCount?: number;
}

/** v0.99 社交/恋爱运行时状态（随存档持久化） */
export interface RomanceState {
  dateCount: Record<string, number>;
  cohabiting: boolean;
  /** 今晚蹭住对象 npcId（夜间结算兑现） */
  crashTonight?: string;
  /** 在途借款方 npcId */
  loanNpc?: string;
  /** 已表白记录 npcId → true */
  confessed?: Record<string, boolean>;
}

/* ==================== v1.0 剧情模式 ==================== */

/** 六条主线：来城之因 */
export type StoryKind =
  | "repay_debt" // 还清赌债
  | "grandma_op" // 奶奶的手术费
  | "brother_school" // 弟弟的学费
  | "seek_justice" // 讨个说法
  | "learn_craft" // 学门手艺
  | "return_glory"; // 风风光光回去

/** 四解法：屈服 / 砸钱 / 视而不见 / 特殊 */
export type StorySolutionKind = "yield" | "money" | "ignore" | "special";

/** 卡牌解法的前置条件（在 ActionRequirements 之外的关系/物品/剧情要求） */
export interface StorySolutionReq {
  attr?: Partial<Record<string, number>>;
  skill?: Partial<Record<string, number>>;
  money?: number;
  fame?: number;
  flag?: string;
  item?: string;
  contact?: string;
  npc?: string;
  npcAffinity?: number;
  conscienceMin?: number;
  conscienceMax?: number;
  stageMin?: number;
  doneCard?: string;
}

/** 单条解法 */
export interface StorySolution {
  kind: StorySolutionKind;
  label: string;
  desc: string;
  requires?: StorySolutionReq;
  effects?: Effects;
  /** 寄回/存入目标资金的数额（主线推进卡专用） */
  goal?: number;
  /** 良心增减（屈服通常为负） */
  conscience?: number;
  log?: string;
  /** 完成后解锁的卡（因果链） */
  unlock?: string[];
  /** 完成即推进主线阶段 */
  advanceStage?: boolean;
}

/** 意外卡 / 差事卡定义（arc 缺省 = 中立卡） */
export interface StoryCardDef {
  id: string;
  arc?: StoryKind;
  /** 所属阶段（推进卡专用） */
  stage?: number;
  title: string;
  icon: string;
  text: string;
  /** 可触发窗口（gameDay 绝对日区间） */
  window: [number, number];
  /** 触发后必须处理的天数 */
  deadlineDays: number;
  weight?: number;
  /** 放宽抽卡可行性（如赌鬼投靠等核心剧情卡：至少 1 条可行解即可） */
  always?: boolean;
  solutions: StorySolution[];
  ignoreConsequence?: {
    effects?: Effects;
    conscience?: number;
    log?: string;
    unlock?: string[];
  };
  once?: boolean;
  requires?: StorySolutionReq;
}

/** 进行中的意外卡 */
export interface ActiveStoryCard {
  cardId: string;
  triggeredDay: number;
  deadlineDay: number;
  status: "active" | "resolved" | "failed";
  solutionKind?: StorySolutionKind;
}

/** 赌鬼投靠状态 */
export interface StoryGambler {
  sinceDay: number;
  /** 偷钱日（逾期未处理） */
  deadlineDay: number;
  state: "active" | "resolved" | "theft";
}

/** 剧情模式运行时状态（随存档持久化） */
export interface StoryState {
  arc: StoryKind | null;
  /** 当前阶段 0..4 */
  stage: number;
  /** 已推进到目标的资金（寄回/存下） */
  goalFund: number;
  /** 良心 -10..10 */
  conscience: number;
  /** 累计失约次数（≥3 → 打道回府） */
  failedObligations: number;
  activeCards: ActiveStoryCard[];
  doneCards: string[];
  gambler: StoryGambler | null;
  /** 下次抽卡日 */
  nextDrawDay: number;
  /** 终局已就绪（等待结局判定） */
  finalTriggered: boolean;
  /** 已判定的终局结局 id（防止重复判定） */
  finalEnding?: string;
  /** 故事开场是否已看过 */
  introSeen: boolean;
}

/** v1.10 周记：本周累计统计（周日晚上睡觉时汇总为 report 后清零） */
export interface WeeklyState {
  /** 本周累计收入 */
  earned: number;
  /** 本周累计支出 */
  spent: number;
  /** 本周互动次数 per NPC */
  interactions: Record<string, number>;
  /** 本周完成工作次数 */
  jobsDone: number;
  /** 周记待查看（周日结算置 true，UI 观察跳转） */
  pending: boolean;
  /** 已生成的周记（null=本周末结算） */
  report: WeeklyReport | null;
}

/** v1.10 周记报告（展示用，一次性） */
export interface WeeklyReport {
  earned: number;
  spent: number;
  interactions: Array<{ npcId: string; count: number }>;
  jobsDone: number;
  /** 剧情模式目标缺口（非剧情模式为 null） */
  goalGap: string | null;
}

/** 联系人关系分类（用于通信 App 分组展示） */
export type ContactRelation =
  | "parent"
  | "manager"
  | "leader"
  | "mentor"
  | "employee"
  | "customer"
  | "friend"
  | "special";

/** 联系人定期发送的教程/关照短信 */
export interface ContactTutorial {
  /** 间隔天数 */
  everyDays: number;
  /** 短信正文 */
  text: string;
  /** 阅读后结算效果 */
  effects?: Effects;
}

/** 联系人添加时的一次性效果（赠物/属性/日志） */
export interface ContactOnAdd {
  /** 直接赠予的背包物品 id */
  items?: string[];
  /** 属性/金钱等结算 */
  effects?: Effects;
  /** 自定义日志 */
  log?: string;
  /** 一次性设置的 flag（如 referral_<jobId> 内推免证书） */
  flags?: Record<string, boolean>;
}

/** 联系人静态定义（data/contacts.json） */
export interface ContactDef {
  id: string;
  name: string;
  /** 头像 emoji */
  avatar: string;
  relation: ContactRelation;
  /** 称谓（店长/组长/象棋大爷…） */
  title: string;
  /** 一句话简介 */
  intro: string;
  canCall: boolean;
  canSms: boolean;
  /** 默认联系人（开局即有，如父母） */
  default?: boolean;
  /** 添加时欢迎短信 */
  hello?: string;
  /** 添加时一次性效果 */
  onAdd?: ContactOnAdd;
  /** 内推岗位（免证书直接入职，由 onAdd.flags 的 referral_<jobId> 推导） */
  referralJob?: string;
  /** 定期发送的教程/关照短信 */
  tutorial?: ContactTutorial;
}

/** 运行时联系人（存档快照；含动态字段） */
export interface Contact {
  id: string;
  name: string;
  avatar: string;
  relation: ContactRelation;
  title: string;
  intro: string;
  canCall: boolean;
  canSms: boolean;
  /** 加入时的游戏天数（绝对日） */
  addedDay: number;
  /** 内推岗位（免证书直接入职） */
  referralJob?: string;
  /** 定期教程（拷贝自定义，便于结算） */
  tutorial?: ContactTutorial;
  /** 上次发放教程/关照的游戏天数（绝对日） */
  lastBenefitDay?: number;
  /** v1.3b3 溯源：由某 NPC 结识后自动加为联系人（id = npc_<npcId>），用于关系页/通信联动 */
  npcId?: string;
}

/** Debuff 状态 id */
export type StatusId =
  | "exhausted"
  | "muscle_strain"
  | "sleep_disorder"
  | "sick"
  | "hungry"
  /** v0.92 抑郁症：心情连续 7 天 <30 触发，无法工作，需就医治疗 */
  | "depressed"
  /** v0.95 失眠：睡眠 <4h / 连续熬夜累积，可诱发感冒 */
  | "insomnia"
  /** v0.95 感冒：小病，久拖可恶化成 sick */
  | "cold"
  /** v0.95 好运 buff：心情结算加成，3 天自然消失 */
  | "lucky"
  /** v0.95 霉运 debuff：心情反向，3 天自然消失 */
  | "unlucky";

/** v0.95 天气类型 */
export type WeatherId = "sunny" | "cloudy" | "rain" | "snow" | "heatwave" | "coldwave";

/** v0.95 装备槽位 */
export type ItemSlot = "clothes" | "accessory" | "furniture" | "transport" | "tool";

/** 音效 id（Web Audio 合成） */
export type SoundId =
  | "cashier" | "eat" | "coin" | "shower" | "exercise" | "sleep" | "nap"
  | "study" | "read" | "walk" | "rain" | "success" | "error" | "phone" | "game" | "computer"
  | "battle_attack" | "battle_hurt" | "battle_defend" | "battle_heal"
  | "battle_draw" | "battle_win" | "battle_lose" | "battle_intent";

/** 生效中的 debuff 状态 */
export interface ActiveStatus {
  id: StatusId;
  /** 0-3，越高越严重 */
  severity: number;
  /** 连续触发计数（解除/升级判定用） */
  count: number;
}

/** 效果描述：行动/事件选项/背景/工作的公共结算结构 */
export interface Effects {
  money?: number;
  debt?: number;
  stamina?: number;
  health?: number;
  mood?: number;
  hygiene?: number;
  satiety?: number;
  intelligence?: number;
  charm?: number;
  fitness?: number;
  fame?: number;
  stress?: number;
  skills?: Partial<Skills>;
  flags?: Record<string, boolean>;
  /** 移除的 flag（如考完驾照清除"已报名"标记） */
  cureFlags?: string[];
  log?: string;
  /** v0.981 额外时间开销（小时）：事件选项可以"多花你一小时"，正数推进时间 */
  hours?: number;
  /** 施加/叠加 debuff 状态 */
  statuses?: Array<{ id: StatusId; severity?: number }>;
  /** 移除 debuff 状态 */
  cureStatuses?: StatusId[];
}

/** 设施类型（住宿/住处可用功能） */
export type Facility = "rest" | "shower" | "cook";

/** 住宿档位（housing.json 数据） */
export interface LodgingTier {
  id: string;
  name: string;
  icon: string;
  price: number;
  /** 体力恢复率 0-1 */
  recovery: number;
  /** 心情加成（可为负） */
  moodBonus: number;
  facilities: Facility[];
  /** 入睡副作用（如 ATM：健康-2/压力+8/干净-4） */
  sideEffects?: {
    health?: number;
    stress?: number;
    hygiene?: number;
  };
  /** 所处区域：residential=住宅区 / center=市中心 */
  area: "residential" | "center";
  /** v0.97 出门后所在二级区域（home 动态归属；hotel/公寓→downtown_center，青旅/民宿/政府住房→downtown_residential） */
  region?: string;
  /** v0.981 仅能通过特定行动获得（如寺庙义工换禅房），不出现在公开住宿选择列表 */
  hidden?: boolean;
  desc: string;
}

/** 住房数据结构 */
export interface HousingData {
  /** 政府免费住宿档位 */
  gov: LodgingTier;
  /** 按天住宿档位列表 */
  nightly: LodgingTier[];
  /** 月租房源列表 */
  lease: (LodgingTier & { rentGrowthRate: number })[];
  /** v0.94 可购置产权的房源（一次性付款，购房后免租） */
  buy: (LodgingTier & { buyPrice: number })[];
}

/** 住房状态（v2 三态共存 + v0.94 产权 own） */
export type LivingMode = "gov" | "nightly" | "lease" | "own";

export interface Housing {
  mode: LivingMode;
  /** 政府免费住宿剩余晚数（mode=gov 有效，7→0 到期转 nightly） */
  govDaysLeft: number;
  /** 按天住宿：今晚的选择（mode=nightly 有效，未选默认 atm） */
  nightly: { lodgingId: string } | null;
  /** 月租（mode=lease 有效，保留原月租+20%涨幅机制） */
  lease: {
    housingId: string;
    rent: number;
    rentGrowthCount: number;
  } | null;
  /** 产权房源 id（mode=own 有效） */
  ownedId?: string;
}

/** 行动需求校验条件 */
export interface ActionRequirements {
  /** 属性下限门槛（体力/智力需 ≥ X） */
  attr?: Partial<Record<string, number>>;
  /** 属性上限门槛（如健康需 < X 才可治疗/住院） */
  attrMax?: Partial<Record<string, number>>;
  skill?: Partial<Skills>;
  money?: number;
  flag?: string;
  /** v1.4 未持有该 flag 时才可进行（如已收养某猫后不再出现收养选项） */
  notFlag?: string;
  /** 处于该 debuff 状态时行动禁用 */
  noStatus?: StatusId[];
  /** v0.92：需要持有并在有效期内的会籍（如 "gym"），过期自动重新锁定 */
  membership?: string;
  /** v0.981 星期限定：仅这些星期可做（英文 mon/tue/wed/thu/fri/sat/sun，与 JobDef.restDays 同格式） */
  weekday?: string[];
  /** v0.981 时段限定：行动级营业时间（24h 制，end 不含；比地点 openHours 更严格） */
  hourRange?: { start: number; end: number };
  /** v0.981 数值 flag 门槛：如做满 1 次义工才解锁素斋（flags 只存 number|boolean） */
  flagAtLeast?: { flag: string; value: number };
  /** v0.981 每日一次：值为记录用 flag 名（存当日 gameDay），同一天内不可重复 */
  oncePerDay?: string;
  /** v1.33 需携带猫咪才可进行（如户外训练 / 家里喂食洗澡） */
  hasActivePet?: boolean;
}

/** 行动定义（actions.json 数据） */
export interface ActionDef {
  id: string;
  locationId: string;
  name: string;
  icon: string;
  desc: string;
  /** 消耗时长（小时，支持 0.5） */
  duration: number;
  requirements?: ActionRequirements;
  /** 需要当前住处具备的设施（如洗澡/做饭） */
  requiresFacility?: Facility;
  /** v0.97 操作分组：home 界面把同类操作聚合为入口（cook=烹饪 / read=读书 / cat=猫咪）；v1.33 增 cat_train=公园训练 / pet=宠物用品店 */
  group?: "cook" | "dev" | "read" | "cat" | "cat_train" | "pet";
  /** 特殊 handler（sign_lease 签约月租 / buy_item 购买入包 / use_item 使用物品 / hospitalize 住院 / discharge 出院 / apply_job 入职 / resign 辞职 / rent_vehicle 租载具 / wash_center 洗浴 / stay_hotel 开房 / sleep_modal 睡觉弹窗 / work_project 创业项目推进） */
  handler?:
    | "sign_lease"
    | "buy_item"
    | "use_item"
    | "hospitalize"
    | "discharge"
    | "apply_job"
    | "resign"
    | "rent_vehicle"
    | "wash_center"
    | "stay_hotel"
    | "sleep_modal"
    | "work_project"
    /** v0.92 便利店/餐饮购买：弹出「堂食 / 打包」选择 */
    | "buy_food"
    /** v0.92 生鲜购买：直接入包（蔬菜/肉类），需带回住处烹饪 */
    | "buy_ingredient"
    /** v0.92 水果摊：可当场吃掉或带走 */
    | "buy_fresh"
    /** v0.92 厨房烹饪：消耗背包食材产出成品并即时食用 */
    | "cook_item"
    /** v0.92 会籍办理：月卡入背包并记录到期日 */
    | "buy_membership"
    /** v0.92 心理门诊：治疗抑郁症 */
    | "treat_depression"
  /** v0.94 经济闭环：一次性买断产权房（housingId → living.mode=own） */
    | "buy_property"
    /** v0.94 经济闭环：购置载具产权（vehicleType → vehicles[type].owned=true，免租赁到期） */
    | "buy_vehicle"
    /** v1.20 退还租用载具（vehicleType → 退押金并回收） */
    | "return_vehicle"
    /** v1.10 培训学校：免费上课（每天限 1 次，连续 3 天或累计 5 次领培训证书） */
    | "train_study"
    /** v1.20 图书馆读书（bookId → data/books.ts） */
    | "read_book"
    /** v1.20 便利店盲盒：10 元随机两个食物/食材 */
    | "blind_box"
    /** v1.25 主动搭话结识新朋友（社交地点，每日限 2 次） */
    | "meet_someone"
    /** v1.25 酒店前台咨询（房型/早餐） */
    | "hotel_frontdesk"
    /** v1.3 笔记本：在家「使用笔记本」进入全屏桌面（见 LaptopDesktopView） */
    | "use_laptop"
    /** v1.4 P2 猫咪养成：喂食/清洁/玩耍/训练（catAction 分派，目标猫由 opts.catUid 指定） */
    | "cat_care"
    /** v1.39 宠物医院：恢复猫咪生命值（catCare.restoreCatHp） */
    | "cat_restore_hp"
    /** v1.4 P2 购买猫咪用品（catItemId → catItems.json，入背包） */
    | "buy_cat_item"
    /** v1.33 宠物用品店领养猫咪：打开领养弹窗（不推进时间） */
    | "pet_adopt"
    /** v1.33 P3 宠物医院：治疗携带猫咪伤势（catCare.treatInjury） */
    | "treat_injury"
    /** v1.33 P4d 游乐场赛场：进入对决赛（开赛并开战，战斗界面由 UI 弹出） */
    | "tournament_arena"
    /** v1.34 公园「猫咪自由锻炼」（50% 加属性 / 50% 遭遇敌人，可决斗或逃跑） */
    | "cat_free_train"
    /** v1.34 游乐场「喵喵娱乐赛」（无需门票，立即开战，失败无惩罚） */
    | "fun_match"
    /** v1.37 宠物医院「猫咪特殊训练」：付费选卡强化（打开医院训练弹窗） */
    | "cat_special_train"
    /** v1.37 宠物医院「猫咪专注性训练」：付费选卡永久删除（打开医院训练弹窗） */
    | "cat_focus_train"
    /** v1.38 宠物用品店购买饰品（accessoryId → data/catAccessories.json，入 ownedAccessories） */
    | "buy_accessory";
  /** buy_item/use_item 对应的物品 id */
  itemId?: string;
  /** v1.4 P2 cat_care 分派：feed/clean/play/train */
  catAction?: CatActionType;
  /** v1.4 P2 训练类型（catAction=train 时生效） */
  trainType?: CatTrainType;
  /** v1.4 P2 buy_cat_item 对应的猫咪用品 id（data/catItems.json） */
  catItemId?: string;
  /** v1.38 buy_accessory 对应的饰品 id（data/catAccessories.json） */
  accessoryId?: string;
  /** sign_lease 对应的月租档位 id */
  housingId?: string;
  /** rent_vehicle 对应的载具类型 */
  vehicleType?: string;
  /** v1.20 图书馆读书对应的书目 id（见 data/books.ts） */
  bookId?: string;
  /** work_project 对应的创业项目 id */
  projectId?: string;
  /** v0.92 buy_membership 对应的会籍 id（见 core/membership.ts） */
  membershipId?: string;
  /** v0.92 cook_item 对应的菜谱 id（见 core/cooking.ts） */
  recipeId?: string;
  /** 结算弹窗随机评价文案 */
  verdicts?: string[];
  /** 结算音效 */
  sound?: SoundId;
  /** 执行该行动后触发随机事件的自定义概率（缺省用全局 0.18；如街头闲逛/公园散步更高） */
  eventChance?: number;
  effects: Effects;
  /** v1.3b2 限时折扣：某时刻后按比例打折（如菜市场 21:00 后 7.5 折）。仅对 effects.money < 0 生效 */
  discount?: { afterHour: number; rate: number };
}

/** 地点定义（locations.json 数据） */
export interface LocationDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  gradient: string;
  /** 小地图坐标 */
  pos?: { x: number; y: number };
  /** 营业时段（24h 制，end 不含；start>end 支持跨夜；缺省=全天） */
  openHours?: { start: number; end: number };
  /** 归属区域 id 数组（同 id 可跨多区，如便利店属市中心/商场/住宅区） */
  regions?: string[];
  /** 暂未开放：灰显 + 🔒 + 点击 toast */
  locked?: boolean;
  /** v0.97 周末限定地点：仅周六/周日在地图上显示并开放（如临时集市） */
  weekendOnly?: boolean;
}

/** 区域定义（regions.json 数据） */
export interface Region {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 区域视图背景渐变（二级区域不生图，直接用渐变） */
  gradient: string;
  /** 暂未开放（火车站/郊区） */
  locked?: boolean;
  /** 父区域 id（一级区域缺省；sub-region 填 downtown） */
  parent?: string;
}

/** 岗位定义（jobs.json 数据） */
export interface JobDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 消耗时长（小时） */
  duration: number;
  /** day=日结（进每日岗位池）；fixed=固定岗位；weekly=周结；monthly=月结（正式工） */
  kind: "day" | "fixed" | "weekly" | "monthly";
  /** fixed 岗位所在地点 */
  locationId?: string;
  requirements?: ActionRequirements;
  effects: Effects;
  /** 结算弹窗随机评价文案 */
  verdicts?: string[];
  /** 结算音效 */
  sound?: SoundId;
  /** day 岗位进池权重 */
  weight?: number;
  /** day 岗位单日名额 */
  quota?: number;
  /** 重体力标记：体力不足时触发肌肉劳损 */
  heavy?: boolean;
  /** 交通工具收益分档：none/bicycle/e_bike/tricycle/car → 覆盖基础 effects */
  incomeTiers?: Record<
    string,
    { money: number; stamina?: number; stress?: number; log?: string; desc?: string; moneyRange?: { min: number; max: number } }
  >;
  /** 顶层工资浮动区间（如销售底薪+提成） */
  moneyRange?: { min: number; max: number };
  /** 上班开始时刻 0-23；缺省表示随时可干 */
  startHour?: number;
  /** 下班时刻，缺省派生为 (startHour + duration) % 24 */
  endHour?: number;
  /** 是否需要按时到岗；缺省由 kind 推断（day=false，其余=true） */
  punctual?: boolean;
  /**
   * v0.97 休息日（星期标识 "sat"/"sun"）。
   * 缺省 = ["sat"]（普通工作固定周六休）；双休岗写 ["sat","sun"]；自由接单岗（外卖/网约车等）写 [] 不休。
   */
  restDays?: string[];
}

/** 任务类型：job=工作任务；story=支线剧情（预留）；main=主线（预留） */
export type QuestType = "job" | "story" | "main";

/** 任务状态 */
export type QuestStatus = "pending" | "active" | "done" | "failed" | "missed";

/** 任务栏条目 */
export interface Quest {
  /** `q_${day}_${jobId}`，保证同日同岗幂等 */
  id: string;
  type: QuestType;
  /** 标题，如"去咖啡厅上班" */
  title: string;
  icon: string;
  desc: string;
  /** 需前往的地点（story 可空） */
  locationId?: string;
  /** 目标开始时刻 0-23；无则不做定时判定 */
  startHour?: number;
  /** 结束时刻 0-23 */
  endHour?: number;
  /** 归属天（跨天归档判定） */
  day: number;
  status: QuestStatus;
  /** type=job 时关联岗位 */
  jobId?: string;
  /** day 岗从劳务市场接的 offer uid */
  offerUid?: string;
  /** UI 摘要，如 "+120 元/天" */
  reward?: string;
  /** 已产生的罚款累计（展示用） */
  fine?: number;
  /** v1.3b3 NPC 多日委托：完成时结算 rewardEffects 并发日志 */
  commission?: NpcCommission;
}

/** v1.3b3 NPC 多日委托进度（挂在 Quest.commission 上，随任务栏一起展示与归档） */
export interface NpcCommission {
  npcId: string;
  /** 持续总天数 */
  days: number;
  /** 接任务的绝对日（gameDay） */
  startDay: number;
  /** 完成时结算效果（金钱/属性/flag 等） */
  rewardEffects: Effects;
  /** 任务栏奖励展示文案（如 "+200 元 +5 心情"） */
  rewardText: string;
}

/** v0.97 短信收件箱条目（通信应用）
 *  v1.3 扩展：增加 contactId/npcId 外键与 dir 方向，支撑会话分组与主角主动发消息。
 */
export interface SmsMessage {
  id: string;
  /** 发送人昵称 */
  sender: string;
  senderIcon: string;
  /** 消息正文 */
  text: string;
  /** 回复选项（态度标签 + 效果 + 家人回应） */
  options: Array<{
    label: string;
    tone: "warm" | "neutral" | "cold";
    effects: Effects;
    reply: string;
  }>;
  /** 是否已回复 */
  replied: boolean;
  replyText?: string;
  /** v1.39 是否已读（打开会话即标记已读；未回复但已读不再计入未读角标） */
  read?: boolean;
  /** 收到的绝对日（gameDay） */
  day: number;
  /** v1.3：关联联系人 id（来自 contacts.json），用于会话分组；家人/朋友亦归入 contacts 体系 */
  contactId?: string;
  /** v1.3：关联 NPC id（来自 npcs.json），与 contactId 二选一 */
  npcId?: string;
  /** v1.3：消息方向。in=对方发来，out=主角发出 */
  dir: "in" | "out";
}

/** 结算结果增量（收益/消耗汇总） */
export interface ResultDelta {
  key: string;
  label: string;
  /** 带符号数值 */
  value: number;
}

/** 行动/工作结算结果（供结算弹窗展示） */
export interface ActionResult {
  actionId: string;
  icon: string;
  name: string;
  /** 本次消耗时长（小时） */
  duration: number;
  deltas: ResultDelta[];
  /** 结算音效 */
  sound?: SoundId;
  /** 随机评价文案 */
  verdict: string;
  /** v0.965 工作质量分（0-1）：无小游戏时负责人对话的质量依据（迟到/旷工扣分） */
  quality?: number;
}

/** 随机事件定义（events.json 数据） */
export interface EventConditions {
  locationId?: string;
  period?: Period[];
  hourRange?: { start: number; end: number };
  attr?: Partial<Record<string, number>>;
  skill?: Partial<Skills>;
  flag?: string;
  notFlag?: string;
  minMoney?: number;
  /** v0.94 难度递增：事件仅在难度等级落入区间时可触发 */
  difficulty?: { min?: number; max?: number };
  /** v0.95 季节过滤（spring/summer/autumn/winter，任一匹配即可） */
  season?: string[];
  /** v0.95 天气过滤（sunny/cloudy/rain/snow/heatwave/coldwave，任一匹配即可） */
  weather?: string[];
  /** v0.95 节假日过滤（holidays.json 的 id，如 national_day/spring_festival） */
  holiday?: string[];
  /** v0.97 周末过滤：true=仅周六日触发；false=仅工作日触发 */
  weekend?: boolean;
  /**
   * v0.981 区域过滤：任一命中即可。
   * 支持一级区（suburb / downtown）与二级区（rural / suburban_edge …），
   * 按玩家所在二级区的整条区域路径匹配。
   */
  region?: string[];
  /** v0.981 多地点过滤：任一命中即可（locationId 的数组版，二者取并集） */
  locationIn?: string[];
  /** v1.4 P2 携带猫咪过滤：true=需已设置 activePet 才可触发 */
  hasActivePet?: boolean;
}

export interface EventChoice {
  label: string;
  requires?: ActionRequirements;
  effects: Effects;
  /** v0.981 结果文案：选完之后展示的一句"后来怎么样了"，缺省时回退 effects.log */
  outcome?: string;
  /** 运气选项：成本+胜负概率（走 state.rng 可复现） */
  gamble?: { cost: number; win: number; lose: number; winChance: number };
  /** v0.978 选择后新增联系人（data/contacts.json 的 id） */
  addContact?: string;
  /**
   * v1.01 选择后结识 NPC（data/npcs.json 的 id，或 "any" = 随机结识一个
   * 当前地点常驻且尚未认识的 NPC）。与 addContact 可同时存在。
   */
  addNpc?: string;
  /** v1.4 选择后收养猫咪（data/cats.json 的 id） */
  adoptCat?: string;
  /** v1.4 P2 猫咪效果：作用于当前携带猫咪（activePet）的生存状态 */
  catEffect?: {
    satiety?: number;
    mood?: number;
    hygiene?: number;
  };
}

export interface EventDef {
  id: string;
  title: string;
  icon: string;
  text: string;
  /** 事件结算音效 */
  sound?: SoundId;
  weight: number;
  conditions?: EventConditions;
  choices: EventChoice[];
  /** 冷却天数（缺省 0 可每日重复） */
  cooldown?: number;
  /** 一次性（记录 ev_<id>_done） */
  once?: boolean;
  /** v0.94 难度递增：事件基调，用于负面事件权重放大 */
  tone?: "positive" | "negative" | "neutral";
}

export interface EventData {
  version: number;
  events: EventDef[];
}

/** 劳务市场当日岗位（跨天重建） */
export interface JobOffer {
  /** 稳定 id（同岗位多份时区分） */
  uid: string;
  jobId: string;
  /** 剩余名额 */
  quota: number;
}

/** 背景维度选项 */
export interface BackgroundOption {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** UI 展示标签（如 "+💰200"） */
  tags?: string[];
  /** 平衡点约定（同维度内保持一致） */
  cost?: number;
  effects: Effects;
}

/** 背景维度 */
export interface BackgroundDimension {
  id: string;
  name: string;
  icon: string;
  desc: string;
  options: BackgroundOption[];
}

export interface BackgroundData {
  version: number;
  dimensions: BackgroundDimension[];
}

/** 职业/项目状态 */
export interface CareerState {
  jobId: string | null;
  /** 周结/月结（正式工）在职类型；day/fixed 无在职概念 */
  kind: "weekly" | "monthly" | null;
  /** 入职日（day 数） */
  hiredDay: number;
  /** 已上班天数（发薪后重置） */
  workedDays: number;
  /** 上次上班 day（自动离职判定） */
  lastWorkDay: number;
  /** 实习期累计工作日（jobId → 天数，满 3 天自动发证） */
  internDays: Record<string, number>;
  /** 实习期最后一次上班的 day（同日幂等防重复累加） */
  internLastDay: number;
  /** 创业项目进度（如独立游戏开发进度 0-100） */
  projects: Record<string, number>;
  /** v1.20 编程周入：每完成一部编程作品累加的每周固定版税/奖金（可叠加） */
  passiveIncome?: number;
}

/** 时间状态（v4 小时制） */
export interface TimeState {
  /** 总天数（从 1 开始） */
  day: number;
  /** 月份 1-12 */
  month: number;
  /** 年份 */
  year: number;
  /** 当前时刻（0-23） */
  hour: number;
  /** 当前分钟（0-59） */
  minute: number;
  /** 本清醒周期是否熬夜（跨 24:00 未睡 = true） */
  stayedUp: boolean;
}

/** 日志条目 */
export interface LogEntry {
  day: number;
  period: Period;
  /** 时刻（24h 制，v4 起写入） */
  hour?: number;
  icon: string;
  text: string;
}

/** RNG 状态（可播种、可复现） */
export interface RngState {
  seed: number;
  calls: number;
}

/** 全局状态标记（触发过的事件/剧情；number 用于冷却天数等） */
export type Flags = Record<string, boolean | number>;

/** 家庭条件配置（families.json 数据） */
export interface FamilyConfig {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 初始资金 */
  initialMoney: number;
  /** 每月 20 号结算：正=家里给，负=支出 */
  monthlyPayment: number;
  monthlyNote?: string;
  /** 开局属性修正（占位，复用 applyEffects） */
  attrMods?: Effects;
  /** 体力上限修正（缺省 0） */
  staminaCapMod?: number;
  /** 属性点配额（拮据 5，其余 10） */
  pointQuota: number;
  /** 政府免费住宿晚数（赤贫 15/拮据 7/普通 7/富裕 0） */
  freeHousingNights: number;
  /** 租房折扣 0~1（赤贫 0.15） */
  rentDiscount: number;
  tags?: string[];
}

/** 属性点分配（5 种去向） */
export interface Allocation {
  money: number;
  charm: number;
  stamina: number;
  intelligence: number;
  /** 投入"物品类别"的点数（2 点换 1 件） */
  items: number;
}

/** 物品定义（items.json 数据） */
export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 兑换点数（缺省 = 顶层 pointCost 2） */
  cost?: number;
  effects?: Effects;
  /** 消耗品：背包中使用消耗 */
  consumable?: boolean;
  /** 使用效果（applyEffects 结构） */
  useEffects?: Effects;
  /** 背包展示名（如车 → "电动车钥匙"） */
  keyDisplay?: string;
  unlocks?: {
    jobs?: string[];
    actions?: string[];
    flags?: string[];
  };
  tags?: string[];
  /** v0.94 奢侈品标记：buy_item 购买时记入 economy.ownedLuxury（纯身份型消费，驱动奢侈品成就） */
  luxury?: boolean;
  /** v0.95 装备槽位：clothes/accessory/furniture。有 slot 的物品可「装备/摆放」，持续提供 bonus */
  slot?: ItemSlot;
  /** v1.05 设施等级：低/中/高（缺省=无等级） */
  tier?: 'low' | 'mid' | 'high';
  /** v1.05 设施效率加成：装备/摆放后提升住房相关效率（rest=睡眠恢复, cook=烹饪速度, dev=开发速度） */
  facilityBonus?: { rest?: number; cook?: number; dev?: number };
  /** v0.95 装备后的持续加成（clamp 后叠加，如穿衣服+魅力、摆家具+心情） */
  bonus?: Partial<Pick<SurvivalAttrs, "mood" | "hygiene" | "health"> & Pick<GrowthStats, "charm" | "fame" | "fitness" | "intelligence">>;
  /** v0.935：是否在开局「起步装备」中点数兑换（低价值的零食/生鲜不在此列） */
  startOffer?: boolean;
  /** v0.935：开局兑换时实际消耗的点数（缺省用顶层 pointCost）。高价值装备点数更高，增强策略性 */
  startCost?: number;
  /** v1.32：开局兑换该物品时收养的猫咪（cats.json 的 id，如 "orange"） */
  cat?: string;
  /** v1.10 手机外观皮肤：购买对应品质手机后永久改变右侧手机 UI 外观 */
  phoneSkin?: "default" | "rice" | "flower" | "fruit";
}

export interface FamilyData {
  version: number;
  allocationRates: {
    moneyPerPoint: number;
    charmPerPoint: number;
    intelligencePerPoint: number;
    staminaPerPoint: number;
  };
  families: FamilyConfig[];
}

export interface ItemData {
  version: number;
  pointCost: number;
  items: ItemDef[];
}

/** 载具记录（v0.94：owned=true 表示已购置产权，不受租赁到期限制） */
export interface VehicleEntry {
  day: number;
  month: number;
  year: number;
  owned?: boolean;
  /** v1.20 押金制租赁：记录押金金额，退租/买断时退还或抵扣；缺省=旧版 30 天月租档 */
  deposit?: number;
}

/** 投资组合条目（v0.94 投资理财） */
export interface Investment {
  /** 唯一 id */
  id: string;
  /** 产品 id（对应 invest.json） */
  productId: string;
  /** 本金 */
  principal: number;
  /** 当前市值（每月结算按 rng 波动） */
  value: number;
  /** 购入日（absoluteDay） */
  boughtDay: number;
}

/** v0.94 经济子系统状态 */
export interface EconomyState {
  /** 通胀指数（1.0 = 基准；随天数上升，作用于买价） */
  priceIndex: number;
  /** 投资组合 */
  investments: Investment[];
  /** 已购奢侈品 id 列表（纯身份型消费） */
  ownedLuxury: string[];
  /** v0.992 投资自增序号（持久化，杜绝「卖出再买入」复用 id 导致卖错单） */
  nextInvSeq: number;
}

/** v0.94 收集类追踪（v0.985 起服务于塔罗牌判定与图鉴统计） */
export interface SeenState {
  /** 已吃过的食物/物品 id */
  itemsEaten: string[];
  /** 已到访地点 id */
  locationsVisited: string[];
}

/**
 * v0.985 塔罗牌解锁状态。
 * 22 张大阿尔卡纳（0 愚者 … 21 世界）取代 v0.94 的字符串成就系统。
 */
export interface TarotState {
  /** 已解锁牌 id（0-21）；新档默认 [0]，即开局即赠的「愚者」 */
  unlocked: number[];
}

/**
 * v0.985 塔罗牌计数器。
 * 仅记录无法从 GameState 现有字段直接派生的累计量；
 * 教皇/战车/恶魔/太阳/审判等牌直接读 flags / career.projects / economy / unlockedEndings。
 */
export interface TarotCounters {
  /** 图书馆累计学习小时数（女祭司） */
  libraryStudyHours: number;
  /** 饱腹/心情/干净度均≥80 的连续天数（皇后） */
  queenStreak: number;
  /** 连续不请假不迟到天数（皇帝） */
  emperorStreak: number;
  /** 主动发过短信的不同联系人 id（恋人） */
  messagedDistinct: string[];
  /** 无固定工作连续天数（隐者） */
  joblessStreak: number;
  /** 触发过的不同随机事件 id（命运之轮） */
  distinctEvents: string[];
  /** 五项生存属性稳定 50-80 的连续天数（正义） */
  justiceStreak: number;
  /** 心情≥85 的连续天数（星星） */
  starStreak: number;
  /** 晕倒后未睡而继续行动（倒吊人） */
  collapsedThenActed: boolean;
  /** 做过的不同工作 id（死神） */
  distinctJobKinds: string[];
  /** 完成的助人事件次数（节制） */
  helpedEvents: number;
  /** 夜间 23:00-5:00 行动累计次数（月亮） */
  nightActions: number;
  /** 从抑郁或重伤中完全恢复过（力量） */
  recoveredFromDepressionOrInjury: boolean;
  /** 正处于重大生存危机中（健康归零倒计时 / 濒临破产 / 晕倒），高塔的前置 */
  majorCrisisHit: boolean;
  /** 曾陷入重大生存危机并挺了过来（高塔） */
  survivedMajorNegative: boolean;
  /** 完成工作并获得报酬的次数（魔术师） */
  workPayCount: number;
}

/** v0.94 新手引导进度 */
export interface TutorialState {
  /** 已完成引导步骤 id */
  done: string[];
  /** 当前激活步骤序号（<0 表示全部完成） */
  activeStep: number;
}

/* ==================== v1.4 耄耋大作战 ==================== */

/** v1.4 猫咪稀有度 */
export type CatRarity = "common" | "rare" | "super" | "legend" | "boss";

/** v1.4 猫咪性格（±10% 属性修正，个体差异） */
export type CatPersonality = "bold" | "calm" | "lazy" | "lively" | "stubborn";

/** v1.4 猫咪四维战斗属性 */
export interface CatCombatAttrs {
  /** 生命值，归零即战败 */
  hp: number;
  /** 攻击力 */
  atk: number;
  /** 防御力 */
  def: number;
  /** 速度（决定出手顺序） */
  spd: number;
}

/** v1.4 猫咪生存状态（0-100，独立于主角生存属性） */
export interface CatCareState {
  /** 饱食度 */
  satiety: number;
  /** 心情 */
  mood: number;
  /** 干净度 */
  hygiene: number;
}

/** v1.4 猫咪获取条件（达成目标型） */
export interface CatAcquireGoal {
  /** 存款门槛（元） */
  money?: number;
  /** 影响力门槛 */
  fame?: number;
  /** 指定技能满级 */
  skillMax?: SkillKey;
  /** 指定 flag */
  flag?: string;
}

/** v1.4 猫咪静态定义（data/cats.json） */
export interface CatDef {
  id: string;
  name: string;
  icon: string;
  rarity: CatRarity;
  desc: string;
  /** v1.4 P3 五行属性 */
  element: CatElement;
  /** 基础战斗属性 */
  base: CatCombatAttrs;
  /** 每级成长率 */
  growth: CatCombatAttrs;
  /** 技能 id 列表（P3 战斗系统启用） */
  skills?: string[];
  /** 获取方式说明（图鉴展示） */
  acquireNote?: string;
  /** 达成目标型获取条件（缺省 = 事件/其他方式获取） */
  acquireGoal?: CatAcquireGoal;
}

/** v1.4 猫咪用品品类 */
export type CatItemCat = "food" | "toy" | "bed" | "train" | "special";

/** v1.4 猫咪用品档位 */
export type CatItemTier = "basic" | "good" | "lux";

/** v1.33 P3 特殊用品效果类型 */
export type CatSpecialEffect =
  /** 治愈药水：恢复受伤猫咪一个等级（轻伤可直接治愈） */
  | "heal_injury"
  /** v1.39 生命药剂：恢复猫咪生命值（50% 最大生命） */
  | "heal_hp"
  /** 净化剂：清除战斗中异常状态（战斗外用也可防中毒） */
  | "purify_status"
  /** 复活石：战斗中濒死一次自动复活（携带生效，单次战斗一次） */
  | "revive_stone";

/** v1.4 猫咪用品定义（data/catItems.json） */
export interface CatItemDef {
  id: string;
  name: string;
  icon: string;
  /** 品类：food 猫粮 / toy 玩具 / bed 猫窝 / train 训练道具 / special 医院特供 */
  cat: CatItemCat;
  /** 档位：basic 普通 / good 优质 / lux 豪华 */
  tier: CatItemTier;
  desc: string;
  /** 购买价（元） */
  price: number;
  /** 使用效果：恢复饱食度 */
  satiety?: number;
  /** 使用效果：恢复心情 */
  mood?: number;
  /** v1.39 使用效果：恢复生命值（猫粮/生命药剂） */
  hp?: number;
  /** 训练效率加成（0-1，如 0.2 = +20%） */
  trainBoost?: number;
  /** 猫窝：战斗 DEF 加成（豪华档） */
  defBonus?: number;
  /** v1.33 P3 特殊用品效果（special 类目） */
  special?: CatSpecialEffect;
}

/** v1.33 P3 猫咪伤势等级 */
export type CatInjuryLevel = "light" | "medium" | "heavy";

/** v1.33 P3 猫咪受伤状态（对决失败置伤，医院治疗清除） */
export interface CatInjury {
  level: CatInjuryLevel;
  /** 受伤所在绝对日（linearDay，用于 UI 展示恢复/治疗信息） */
  day: number;
}

/** v1.38 饰品品质（0 普通 / 1 精良 / 2 稀有 / 3 史诗） */
export type CatAccessoryQuality = 0 | 1 | 2 | 3;

/** v1.38 饰品效果（战斗开局生效） */
export interface CatAccessoryEffect {
  /** 对决开始时的额外力量 */
  startStrength?: number;
  /** 对决开始时的额外格挡 */
  startBlock?: number;
  /** 对决开始时按最大 HP 提升的百分比（0-1，如 0.1 = +10% 上限） */
  maxHpPct?: number;
  /** 对决开始时额外抽牌数（覆盖默认手牌数） */
  drawBonus?: number;
}

/** v1.38 饰品定义（data/catAccessories.json） */
export interface CatAccessoryDef {
  id: string;
  name: string;
  icon: string;
  quality: CatAccessoryQuality;
  desc: string;
  /** 商店售价（元，获取途径之一） */
  price: number;
  effect: CatAccessoryEffect;
}

/** v1.4 猫咪训练类型（对应四维战斗属性） */
export type CatTrainType = "atk" | "def" | "spd" | "hp";

/** v1.4 猫咪养成操作（cat_care 行动分派） */
export type CatActionType = "feed" | "clean" | "play" | "train";

/** v1.37 卡包条目：uid 用于定位单张卡（医院强化 / 删除），defId 指向卡牌定义（含品质与强化变体） */
export interface CardPackEntry {
  uid: string;
  defId: string;
}

/** v1.4 猫咪运行时状态（随存档持久化） */
export interface PetState {
  /** 唯一 id */
  uid: string;
  /** 猫种 id（data/cats.json） */
  catId: string;
  /** 展示图标（来自猫种定义，冗余存储便于 UI 直接使用） */
  icon: string;
  /** 玩家起的名字 */
  name: string;
  /** 性格（随机生成，±10% 属性修正） */
  personality: CatPersonality;
  /** 等级 */
  level: number;
  /** 经验 */
  exp: number;
  /** 当前战斗属性（基础 + 等级成长 + 性格修正） */
  attrs: CatCombatAttrs;
  /** v1.39 当前生命值（缺省 = attrs.hp 满血；战后保留、每日回 20%、归零需宠物医院治疗） */
  curHp?: number;
  /** 生存状态 */
  care: CatCareState;
  /** 获得绝对日 */
  acquiredDay: number;
  /** 图鉴/成就标记 */
  flags?: Record<string, boolean>;
  /** v1.4 P2 训练加成：训练系统永久提升（叠加在基础+成长+性格之上） */
  trainBonus?: Partial<CatCombatAttrs>;
  /** v1.4 P2 今日已训练次数（跨天重置，受每日上限约束） */
  trainedToday?: number;
  /** v1.4 P2 今日各训练项次数（收益递减用，跨天重置） */
  trainCounts?: Record<string, number>;
  /** v1.33 P3 受伤状态（对决失败置伤，医院治疗清除；受伤无法参战/训练效率降低） */
  injured?: CatInjury;
  /** v1.37 卡包：该猫咪的卡组（对决抽牌堆来源；缺省时按初始 8 攻 + 8 防自动补建） */
  cardPack?: CardPackEntry[];
  /** v1.38 已佩戴的饰品 id（data/catAccessories.json；未佩戴则 undefined） */
  accessory?: string;
  /** v1.38 是否生病（长期饱食/心情过低触发；生病无法参战、训练效率大降） */
  sick?: boolean;
  /** v1.38 连续低数值天数（≥ 阈值触发生病，恢复后清零） */
  neglectDays?: number;
}

/* ==================== v1.4 P3 耄耋对决 ==================== */

/** v1.4 P3 五行属性：自然→科技→神秘→宇宙→自然 循环克制；普通不参与 */
export type CatElement = "normal" | "nature" | "tech" | "mystic" | "cosmic";

/** v1.4 P3 状态异常（首版 4 种） */
export type CatStatusId = "poison" | "paralysis" | "sleep" | "burn";

/** v1.4 P3 技能类型 */
export type CatSkillKind = "attack" | "defense" | "heal" | "status";

/** v1.4 P3 技能定义（data/catSkills.json） */
export interface CatSkillDef {
  id: string;
  name: string;
  icon: string;
  kind: CatSkillKind;
  /** 所属属性（对应克制系） */
  element: CatElement;
  /** 威力（攻击类） */
  power?: number;
  /** 命中率 0-1 */
  hitRate: number;
  /** 怒气消耗 */
  rageCost: number;
  desc: string;
  /** 特殊效果 */
  effect?: {
    /** 治疗：恢复自身最大 HP 的百分比（0-1） */
    healPct?: number;
    /** 施加状态异常 */
    status?: CatStatusId;
    /** 状态施加概率 0-1 */
    statusChance?: number;
    /** 本回合减伤比例（0-1，如 0.5 = 减伤 50%） */
    selfDefend?: number;
    /** 连击次数 */
    multihit?: number;
  };
}

/** v1.33 P4 对决赛对手等级池 */
export type CatOpponentTier = "normal" | "intermediate" | "boss";

/** v1.33 P4 对手机制（可叠加，走卡牌意图 AI） */
export interface CatOpponentMechanic {
  /** 自愈：每回合回复（amount 固定值 或 pct 最大 HP 比例） */
  regen?: { amount?: number; pct?: number };
  /** 闪避：被玩家攻击时闪避概率 0-1 */
  dodge?: number;
  /** 缠绕：每 N 回合使玩家本回合无法出牌 */
  bindEvery?: number;
  /** 尸体复活：首次被击败进入尸体，M 回合内未被再次击中则复活 */
  corpseRounds?: number;
  /** 幽灵：免疫伤害，N 回合后自动消失（玩家获胜） */
  ghostRounds?: number;
  /** 雪球：每回合主攻击之外额外固定伤害 */
  snowball?: number;
  /** 棉花糖福利：不攻击，把玩家血量回满后自动获胜 */
  marshmallow?: boolean;
  /** 召唤幼崽：满血时 N 只（随血量下降退场），每只吸收 12 点伤害 */
  summonMinions?: number;
  /** 定时炸弹：开局给玩家安装炸弹，N 回合倒计时，爆炸判负 */
  bombTurns?: number;
  /** 死亡自爆：死亡时对玩家造成固定伤害（血量 ≤ 爆炸值则同归于尽判负） */
  selfDestruct?: number;
}

/** v1.4 P3 对手/赛事定义（data/catBattles.json） */
export interface CatOpponentDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  element: CatElement;
  level: number;
  attrs: CatCombatAttrs;
  skills: string[];
  /** 胜利奖励 */
  reward: { exp: number; money: number; fame: number; itemId?: string };
  /** 挑战所需最低猫咪等级 */
  minLevel?: number;
  /** v1.33 P4 对手池等级（对决赛按池随机匹配） */
  tier?: CatOpponentTier;
  /** v1.33 P4 专属机制 */
  mechanic?: CatOpponentMechanic;
}

/** v1.33 P4 对决赛档位定义（3 档赛事 + 终极耄耋对决） */
export interface CatTournamentDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 门票费（元）；终极对决为 0 */
  fee: number;
  /** 报名所需最低猫咪等级 */
  minLevel?: number;
  /** 3 场对手组合：normal / intermediate / boss 池各取几只（抽取后顺序随机） */
  pools: Partial<Record<CatOpponentTier, number>>;
  /** 名次奖金倍数（🥇冠军 / 🥈亚军 / 🥉季军） */
  prize: { champion: number; second: number; third: number };
  /** 完赛额外奖励（冠军获得） */
  reward?: { exp: number; money: number; fame: number; itemId?: string };
  /** 是否终极耄耋对决（大师杯冠军解锁，冠军得「耄耋之王」） */
  ultimate?: boolean;
}

/** v1.33 P2 战斗中单位（卡牌版：能量/格挡/力量由战斗状态统一管理） */
export interface CatBattleUnit {
  name: string;
  icon: string;
  level: number;
  element: CatElement;
  attrs: CatCombatAttrs;
  skills: string[];
  /** 定义在 data 中的「样貌 / 性格」描述（对手来自 catBattles.json，玩家来自 cats.json） */
  desc?: string;
  /** 当前 HP */
  hp: number;
  /** 状态异常 */
  status?: CatStatusId;
  /** 状态剩余回合 */
  statusTurns?: number;
  /** 睡眠剩余回合 */
  sleepTurns?: number;
}

/** v1.33 P2 卡牌类型 */
export type CatCardType = "attack" | "defend" | "skill";

/** v1.33 P2 卡牌效果 */
export interface CatCardEffect {
  /** 基础威力（最终伤害 ≈ 威力 × 攻击/10） */
  power?: number;
  /** 连击次数 */
  hits?: number;
  /** 基础格挡（最终格挡 ≈ 格挡 × 防御/10） */
  block?: number;
  /** 固定治疗量 */
  heal?: number;
  /** 按最大 HP 比例治疗（0-1） */
  healPct?: number;
  /** 抽牌数 */
  draw?: number;
  /** 力量提升 */
  strength?: number;
  /** 施加给对手的状态 */
  status?: CatStatusId;
  /** 状态施加概率 0-1 */
  statusChance?: number;
  /** 无视对手格挡 */
  pierce?: boolean;
  /** 使用后从卡组移除 */
  exhaust?: boolean;
  /** 清除自身异常状态 */
  cure?: boolean;
}

/** v1.33 P2 卡牌定义（data/catCards.json） */
export interface CatCardDef {
  id: string;
  name: string;
  icon: string;
  type: CatCardType;
  element: CatElement;
  /** 能量消耗 */
  cost: number;
  desc: string;
  effect?: CatCardEffect;
  /** v1.37 品质档位 0-3（0 普通 / 1 精良 / 2 稀有 / 3 史诗），基础卡缺省为 0 */
  quality?: number;
  /** v1.37 基础卡 id（品质/强化变体卡回指；基础卡缺省为自身 id） */
  baseId?: string;
}

/** v1.33 P2 敌方意图（回合预告，回合结束才执行） */
export interface EnemyIntent {
  kind: "attack" | "defend" | "skill";
  name: string;
  icon: string;
  /** 攻击威力 / 格挡值 / 治疗量（已按对手属性缩放） */
  value: number;
  hits?: number;
  status?: CatStatusId;
  /** 无视玩家格挡 */
  pierce?: boolean;
}

/** v1.33 P2 战斗状态（随存档持久化，仅战斗进行时非空） */
export interface CatBattleState {
  /** 对手 id（catBattles.json） */
  opponentId: string;
  /** 玩家猫咪 uid */
  playerUid: string;
  /** 赛事 id（赛事挑战时非空） */
  tournamentId?: string;
  /** v1.34 休闲对决（公园自由锻炼 / 游乐场娱乐赛）：失败无惩罚（不受伤、不扣心情），胜利额外随机提升一个猫咪属性 */
  casual?: boolean;
  player: CatBattleUnit;
  opponent: CatBattleUnit;
  turn: number;
  log: string[];
  finished: boolean;
  won?: boolean;
  /** 战斗专用 RNG（与主存档 rng 解耦，保证可复现） */
  rng: RngState;
  /** v1.33 P2 阶段：player 出牌中 / enemy 敌方行动 / over 已结束 */
  phase: "player" | "enemy" | "over";
  /** 玩家当前能量 */
  playerEnergy: number;
  /** 每回合初始能量 */
  playerMaxEnergy: number;
  /** 玩家格挡（回合结束清除） */
  playerBlock: number;
  /** 玩家力量（叠加层） */
  playerStrength: number;
  /** 敌方格挡 */
  opponentBlock: number;
  /** 敌方格挡力量 */
  opponentStrength: number;
  /** 玩家手牌（卡牌 id） */
  playerHand: string[];
  /** 抽牌堆 */
  playerDrawPile: string[];
  /** 弃牌堆 */
  playerDiscardPile: string[];
  /** 敌方意图（回合预告） */
  enemyIntent?: EnemyIntent;
  /** v1.33 P3 复活石是否已在本场战斗中生效（单场一次） */
  reviveUsed?: boolean;
  /** v1.33 P4 对手机制运行时状态（尸体/幽灵/炸弹/幼崽/缠绕等瞬态计数） */
  mechanicState?: {
    /** 骷髅猫：尸体状态中 */
    corpse?: boolean;
    /** 骷髅猫：尸体复活倒计时 */
    corpseCountdown?: number;
    /** 幽灵猫咪：剩余回合 */
    ghostCountdown?: number;
    /** 杀手皇后：炸弹倒计时 */
    bombCountdown?: number;
    /** 亡灵法师：剩余幼崽数（每只吸收 MINION_HP 后消失） */
    minions?: number;
    /** 亡灵法师：当前这只幼崽已承受的伤害（0-12，跨回合计） */
    minionHp?: number;
    /** 蛛网猫：距下次缠绕经过的回合数（每 bindEvery 回合触发一次） */
    bindCooldown?: number;
  };
}

/** 游戏主状态（存档快照 = 完整 GameState） */
export interface GameState {
  version: number;
  /** 家庭条件 id（取代原 difficulty） */
  family: string;
  /** 属性点分配 */
  allocation: Allocation;
  /** 已兑换物品 id 列表 */
  ownedItems: string[];
  /** 生效中的 debuff 状态 */
  statuses: ActiveStatus[];
  rng: RngState;
  time: TimeState;
  player: {
    /** 姓名 */
    name: string;
    attrs: SurvivalAttrs;
    stats: GrowthStats;
    skills: Skills;
    money: number;
    debt: number;
    /** 压力 0-100 */
    stress: number;
    /** 连续心情低落天数（孤独死判定用） */
    lowMoodStreak: number;
    /** 连续资金不足天数（破产判定用） */
    negativeMoneyStreak: number;
    /** 连续不吃饭餐数 */
    hungryStreak: number;
    /** v0.92 连续心情 <30 的天数（抑郁症判定，满 7 天触发） */
    depressionStreak: number;
    /** v0.92 健康归零后已持续天数（超过 3 天猝死） */
    criticalHealthStreak: number;
    /** v0.992 命运加成「底子好」：初始体力上限额外 +10×档位（派生进 getMaxStamina，可叠加） */
    staminaCapBonus?: number;
  };
  living: Housing;
  /** 人生经历选择：维度 id → 选项 id */
  backgrounds: Record<string, string>;
  /** 劳务市场今日岗位（跨天重建） */
  laborMarket: {
    generatedDay: number;
    offers: JobOffer[];
  };
  career: CareerState;
  /** 今日任务栏（跨天惰性重建） */
  quests: Quest[];
  /** 任务栏最后生成的天数（惰性重置，仿 laborMarket.generatedDay） */
  questsGeneratedDay: number;
  /** v1.05 每日目标（跨天刷新，随机 2 条；由 quests.generateDailyGoals 生成与结算） */
  dailyGoals?: Array<{ id: string; text: string; reward: { mood: number }; done: boolean; check: (s: GameState) => boolean }>;
  /** 背包：itemId → 数量（默认 { phone: 1 }） */
  inventory: Record<string, number>;
  /** 载具：type → 到期日（租赁）或产权记录（owned=true 表示已购，不计到期） */
  vehicles: Record<string, VehicleEntry>;
  /** v0.92 会籍月卡：membershipId → 到期日（day/month/year），到期自动失效 */
  memberships: Record<string, { day: number; month: number; year: number }>;
  /** v0.97 短信收件箱（通信应用） */
  smsInbox: SmsMessage[];
  /** v0.978 联系人列表（默认父母 + 事件/入职动态添加） */
  contacts: Contact[];
  relationships: Relationship[];
  /** v0.99 NPC 社交/恋爱运行时状态 */
  romance: RomanceState;
  flags: Flags;
  /** v0.991 游戏模式：normal=普通 / eternal=永恒 / story=剧情（剧情分支留待 1.0） */
  mode: GameMode;
  /** v1.0 剧情模式运行时状态（非剧情模式为默认空态） */
  story: StoryState;
  /** v1.10 周记统计（每周日睡觉时汇总并生成 report） */
  weekly: WeeklyState;
  /** v1.10 手机外观皮肤（default/rice/flower/fruit；购买品质手机后改变） */
  phoneSkin?: "default" | "rice" | "flower" | "fruit";
  log: LogEntry[];
  /** 当前所在地点 */
  locationId: string;
  /** 当前浏览/所在区域：主地图=undefined；地图态=栈顶；地点态=来源区域 */
  region?: string;
  /** v0.975 物理所在的二级区域（持久化，切换地图/进地点时不重置；用于跨区出行判定） */
  area?: string;
  /** 导航面包屑栈：["map"] 主地图 / ["map","downtown"] L2 / ["map","downtown","downtown_center"] L3 / [] 地点 */
  navStack: string[];
  /** 结局 id（非空表示游戏已结束） */
  endingId: string | null;
  /** 已解锁结局图鉴 */
  unlockedEndings: string[];
  /** v0.93 起床闹钟：设定的叫醒时刻（0-23）；未设定=undefined（向后兼容，不升版本） */
  alarmHour?: number;
  /** v0.985 塔罗牌解锁状态（取代 v0.94 的 achievements） */
  tarot: TarotState;
  /** v0.985 塔罗牌计数器 */
  counters: TarotCounters;
  /** v0.94 收集类追踪（v0.985 供塔罗判定复用） */
  seen: SeenState;
  /** v0.94 经济子系统（通胀/投资/奢侈品） */
  economy: EconomyState;
  /** v0.94 新手引导进度 */
  tutorial: TutorialState;
  /** v0.985 待弹窗展示的新解锁塔罗牌 id（UI 消费后清空，不入存档语义但随存档迁移） */
  pendingTarot: number[];
  /** v0.95 装备槽位：slot → itemId（穿衣服/摆家具的持续加成来源） */
  equipped: Record<string, string>;
  /** v0.95 天气状态（跨天重掷） */
  weather: { id: WeatherId; lastRollDay: number };
  /** v0.99 存档时间戳（保存时写入，列表排序用；可选 → 旧档无需迁移） */
  savedAt?: string;
  /**
   * v0.981 必定触发的事件 id 队列：
   * 由剧情挂点写入（如弥撒结束后的教友聚餐），下一次 rollEvent 优先弹出并消费，
   * 绕过概率与条件过滤。可选字段 → 旧存档无需迁移。
   */
  pendingEvents?: string[];
  /** v1.3 Moments 社交状态（朋友圈动态 / 主角发帖数 / 已评分帖子） */
  social?: SocialState;
  /** v1.3 订单（外卖 / 网购），延迟交付 */
  orders?: Order[];
  /** v1.3 自媒体直播状态 */
  live?: LiveState;
  /** v1.3 论坛/朋友圈市民作者池（自动发帖用） */
  citizensPool?: CitizenAuthor[];
  /** v1.4 猫咪系统：拥有的猫咪 */
  pets: PetState[];
  /** v1.4 当前携带的猫咪 uid（外出时触发对决） */
  activePet?: string;
  /** v1.4 猫咪图鉴/成就标记（cat_<catId> 已解锁等） */
  catFlags: Record<string, boolean>;
  /** v1.38 已拥有的饰品（id → 数量；可给任意猫咪佩戴） */
  ownedAccessories: Record<string, number>;
  /** v1.4 P3 战斗状态（仅战斗进行时非空，结束后清空） */
  catBattle?: CatBattleState;
  /** v1.33 P4 对决赛/耄耋之王赛事状态（报名/赛程/进行中） */
  catTournament?: CatTournamentState;
}

/** v1.33 P4 赛事报名信息（论坛报名写入） */
export interface CatTournamentEntry {
  /** 档位 id（tournament_primary / tournament_mid / tournament_advanced / ultimate） */
  tierId: string;
  /** 报名绝对日（gameDay） */
  signupDay: number;
  /** 门票费 */
  fee: number;
  /** 是否已开赛（周日 14:00 后标记） */
  started: boolean;
  /** 是否已结算（完赛或出局后标记） */
  settled: boolean;
  /** 当前对手序号（0 起） */
  roundIndex: number;
  /** 本场已击败对手 id */
  beaten: string[];
  /** 本场对手队列（报名时按档位池随机抽取，终极赛末位为圆头猫咪） */
  queue: string[];
  /** 结算名次（1=冠军…，settled 时写入） */
  rank?: number;
  /** 结算奖金（元） */
  prizeMoney?: number;
}

/** v1.33 P4 赛事运行状态（随存档持久化） */
export interface CatTournamentState {
  /** 报名信息（undefined = 未报名） */
  entry?: CatTournamentEntry;
  /** 最近一次赛事名次（1=冠军…；结算时写入） */
  lastRank?: number;
  /** 已解锁终极耄耋对决（大师杯夺冠后） */
  ultimateUnlocked: boolean;
  /** 已获称号「耄耋之王」（击败圆头猫咪后） */
  elderKing: boolean;
}

/** v1.3 Moments 社交状态 */
export interface SocialState {
  /** 全部动态（主角 + 联系人 + 市民），按时间倒序展示（unshift 插入最新） */
  posts: Post[];
  /** 未读 Moments 动态数（红点提示） */
  unreadMoments: number;
}

/** v1.3 Moments 单条评论 */
export interface PostComment {
  id: string;
  authorId: string;
  authorName: string;
  authorIcon: string;
  text: string;
  /** 绝对日（gameDay） */
  day: number;
}

/** v1.3 Moments 点赞/反应 */
export interface PostReaction {
  reactor: string;
  icon: string;
  kind: "like";
}

/** v1.3 Moments 内容分类（决定评分档位） */
export type MomentCategory = "daily" | "fun" | "task";

/** v1.3 Moments 动态条目 */
export interface Post {
  id: string;
  /** 作者类型：self=主角 / contact=联系人 / citizen=市民 / npc=NPC */
  author: "self" | "contact" | "citizen" | "npc";
  /** 关联联系人 id（author === "contact" 时） */
  contactId?: string;
  /** 关联市民 id（author === "citizen" 时） */
  citizenId?: string;
  /** 关联 NPC id（author === "npc" 时） */
  npcId?: string;
  /** 作者显示名（冗余存储，避免查表） */
  authorName?: string;
  /** 作者图标（冗余存储） */
  authorIcon?: string;
  text: string;
  /** 可选配图（emoji 占位） */
  image?: string;
  /** 内容分类 */
  category: MomentCategory;
  /** 侧面教学锚点（如 religion/volunteer/suburb，仅市民帖用） */
  hint?: string;
  /** 论坛帖归属吧（与 forum.ts FORUM_BARS 的 id 对应；"forum"=全部） */
  forumBar?: string;
  /** 绝对日（gameDay） */
  day: number;
  /** 点赞列表 */
  reactions: PostReaction[];
  /** 评论列表 */
  comments: PostComment[];
  /** 主角是否给自己点过赞（toggle） */
  selfLiked: boolean;
}

/** v1.3 订单（外卖 / 网购） */
export interface Order {
  id: string;
  kind: "takeout" | "shop";
  itemId: string;
  name: string;
  icon: string;
  price: number;
  /** 下单绝对日（gameDay） */
  orderDay: number;
  /** 预计到达天数（外卖 0 / 网购 3） */
  etaDays: number;
  /** 是否已到达（可领取） */
  arrived: boolean;
}

/** v1.3 自媒体直播状态 */
export interface LiveState {
  streaming: boolean;
  lastStreamDay: number;
  totalFameGain: number;
}

/** v1.3 论坛/朋友圈市民作者 */
export interface CitizenAuthor {
  id: string;
  name: string;
  avatar: string;
  /** 标签（如 上班族/学生）或简介 */
  tag?: string;
  /** v1.3b8 论坛显示用网名（优先于 name） */
  netName?: string;
  /** v1.3b8 论坛显示用网络头像（优先于 avatar） */
  netAvatar?: string;
}
