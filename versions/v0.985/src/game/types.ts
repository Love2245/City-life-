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
export type RelationState = "stranger" | "acquaintance" | "friend" | "close_friend" | "lover";

export interface Relationship {
  npcId: string;
  /** 好感度 0-100 */
  affinity: number;
  state: RelationState;
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
export type ItemSlot = "clothes" | "accessory" | "furniture";

/** 音效 id（Web Audio 合成） */
export type SoundId =
  | "cashier" | "eat" | "coin" | "shower" | "exercise" | "sleep" | "nap"
  | "study" | "read" | "walk" | "rain" | "success" | "error" | "phone" | "game";

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
  /** v0.97 操作分组：home 界面把同类操作聚合为入口（cook=烹饪 / dev=开发），组内行动不直接平铺 */
  group?: "cook" | "dev";
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
    | "buy_vehicle";
  /** buy_item/use_item 对应的物品 id */
  itemId?: string;
  /** sign_lease 对应的月租档位 id */
  housingId?: string;
  /** rent_vehicle 对应的载具类型 */
  vehicleType?: string;
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
}

/** v0.97 短信收件箱条目（通信应用） */
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
  /** 收到的绝对日（gameDay） */
  day: number;
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
  /** v0.95 装备后的持续加成（clamp 后叠加，如穿衣服+魅力、摆家具+心情） */
  bonus?: Partial<Pick<SurvivalAttrs, "mood" | "hygiene" | "health"> & Pick<GrowthStats, "charm" | "fame" | "fitness" | "intelligence">>;
  /** v0.935：是否在开局「起步装备」中点数兑换（低价值的零食/生鲜不在此列） */
  startOffer?: boolean;
  /** v0.935：开局兑换时实际消耗的点数（缺省用顶层 pointCost）。高价值装备点数更高，增强策略性 */
  startCost?: number;
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
  flags: Flags;
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
  /**
   * v0.981 必定触发的事件 id 队列：
   * 由剧情挂点写入（如弥撒结束后的教友聚餐），下一次 rollEvent 优先弹出并消费，
   * 绕过概率与条件过滤。可选字段 → 旧存档无需迁移。
   */
  pendingEvents?: string[];
}
