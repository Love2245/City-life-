/**
 * 时间系统（v4 小时制）：时刻推进 / 显式睡觉 / 入睡结算 / 月度房租与月供。
 * 纯逻辑：输入 state，返回新 state。
 * 关键：跨午夜不自动入睡（支持夜班），睡觉是玩家显式行动；凌晨 3 点后或体力耗尽强制兜底。
 */
import type { GameState, Period } from "../types";
import { PERIOD_ORDER } from "../types";
import { getEffectiveLodging, nightlyPrice, getLeaseTier } from "./housing";
import { getMaxStamina } from "./stats";
import { pushLog, applyEffects } from "../engine";
import { statusSleepPenalty, reconcileStatuses, cureStatuses, upsertStatus, hasStatus, registerNightOwl } from "./statuses";
import { paycheck, checkAutoQuit } from "./career";
import { refreshDailyQuests } from "./quests";
import { refreshLaborMarket } from "./jobs";
import { checkVehicleExpiry } from "./vehicle";
import { checkMembershipExpiry } from "./membership";
import { dailySurvivalSettlement } from "./survival";
import { checkEnding } from "./endings";
import { monthlyInflationRate, priceIndexCap } from "./difficulty";
import { settleInvestments } from "./invest";
import { rollWeather, currentWeather } from "./weather";
import { maybeReceiveSms, maybeReceiveJunkSms } from "./phone";
import { tickContactBenefits } from "./contacts";
import { tickTarotDaily, tarotCard, onLibraryStudy } from "./tarot";
import { tickRelationshipDecay, tickRomance, tickColleagueAffinity, tickLoans, npcPerkOf } from "./relationships";
import { npcName, npcNick, getNpcDef } from "./npcs";
import { tickStory, decideStoryFinal } from "./story";
import { gameDay } from "./calendar";
import familyData from "../data/families.json";

const FAMILY_MAP = new Map(
  (familyData as { families: Array<{ id: string; icon: string; monthlyPayment: number; monthlyNote?: string }> }).families.map(
    (f) => [f.id, f],
  ),
);

/** 月份名称 */
export function monthName(month: number): string {
  return `${month}月`;
}

/** 小时 → 主题（昼夜联动） */
export function themeOfHour(hour: number): "day" | "dusk" | "night" {
  if (hour >= 5 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

/** 小时 → 时段派生标签（不落存档） */
export function periodOfHour(hour: number): Period {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 23) return "evening";
  return "night"; // 23:00-4:59
}

/** 困到必须睡觉：凌晨 3 点后，或体力耗尽 */
export function isExhausted(state: GameState): boolean {
  const fatigued = state.statuses.some((st) => st.id === "exhausted");
  const earlyHour = fatigued ? 2 : 3; // 疲惫时提前到凌晨 2 点逼睡
  return state.player.attrs.stamina <= 0 || (state.time.hour >= earlyHour && state.time.hour < 7);
}

/** 日/月/年进位（day 30 → 下月 1 号；month 12 → 下年 1 月） */
function rollDay(state: GameState): void {
  state.time.day++;
  // v0.95 季节/天气：每天重掷天气（按季节加权，rng 可复现）
  state.weather = { id: rollWeather(state), lastRollDay: gameDay(state.time) };
  if (state.time.day > 30) {
    state.time.day = 1;
    state.time.month++;
    if (state.time.month > 12) {
      state.time.month = 1;
      state.time.year++;
    }
    // v0.94 难度递增：跨月通胀（priceIndex 上限封顶，避免后期物价失控）
    const rate = monthlyInflationRate(state);
    const next = Math.min(priceIndexCap(), +(state.economy.priceIndex * (1 + rate)).toFixed(3));
    if (next > state.economy.priceIndex) {
      const pct = Math.round((next - state.economy.priceIndex) * 100);
      state.economy.priceIndex = next;
      pushLog(state, "📈", `本月物价上涨约 ${pct}%，日常开销越来越贵了`);
    }
    // v0.94 经济闭环：跨月投资结算（存款/基金/股票 rng 盈亏）
    settleInvestments(state);
  }
}

/**
 * 推进 hours 小时（支持 0.5）。跨 24:00 只 rollover 日期 + 标熬夜，不自动入睡结算。
 * 清醒时间消耗饱腹（每小时 -3）；睡眠/小睡不消耗。
 */
export function advanceHours(state: GameState, hours: number, decaySatietyEnabled = true): { crossedDay: boolean } {
  const totalMin = state.time.hour * 60 + state.time.minute + Math.round(hours * 60);
  const dayRolls = Math.floor(totalMin / 1440);
  const remain = totalMin % 1440;
  state.time.hour = Math.floor(remain / 60);
  state.time.minute = remain % 60;
  for (let i = 0; i < dayRolls; i++) rollDay(state);
  if (dayRolls > 0) {
    state.time.stayedUp = true;
    // 跨天：归档昨日任务 + 为在职正式工排今日班（惰性，重复调用无副作用）
    refreshDailyQuests(state);
    // 跨天：重建今日劳务市场岗位池（v0.89：不再依赖走进劳务市场触发）
    refreshLaborMarket(state);
  }
  // 清醒消耗饱腹（促进正常饮食；睡眠/小睡传 false 跳过）
  if (decaySatietyEnabled) {
    state.player.attrs.satiety = Math.max(0, state.player.attrs.satiety - hours * 3);
  }
  // v0.985 女祭司：在图书馆里泡掉的每一个清醒小时都计入累计学习时长
  if (decaySatietyEnabled && hours > 0 && state.locationId === "library") {
    onLibraryStudy(state, hours);
  }
  return { crossedDay: dayRolls > 0 };
}

/**
 * 显式睡觉：按小时数入睡（支持夜班）。
 * 熬夜判定：本清醒周期已跨午夜，或入睡时刻 >= 23 点。
 */
export function sleep(state: GameState, hours: number): void {
  const sleepHour = state.time.hour;
  const stayedUp = state.time.stayedUp || sleepHour >= 23;
  // v0.992 修复：睡够 8h 也会触发「获得→立即解除」作息混乱日志对——只有短睡（<7h）的熬夜才算作息紊乱
  if (stayedUp && hours < 7) registerNightOwl(state);
  sleepSettlement(state, { stayedUp, hours });
  advanceHours(state, hours, false); // 睡眠不消耗饱腹
  state.time.stayedUp = false;
}

/** 睡到自然醒（次日 7 点），返回实际小时数 */
export function naturalWakeHours(state: GameState): number {
  const h = (7 - state.time.hour + 24) % 24;
  // v0.99 修复：恰好 07:00 时睡到次日 7 点（原返回 8 会睡到当天 15:00，与"次日 7:00 起床"文案不符）
  return h === 0 ? 24 : h;
}

/** 小睡（白天补觉，不结算自然衰减；恢复上限的 30%，v0.93 由 0.2 上调） */
export function nap(state: GameState, hours = 2): void {
  const maxStamina = getMaxStamina(state);
  state.player.attrs.stamina = clampStamina(state.player.attrs.stamina + maxStamina * 0.3, maxStamina);
  state.player.attrs.mood = clamp(state.player.attrs.mood + 3);
  advanceHours(state, hours, false); // 小睡不消耗饱腹
}

/**
 * v0.93 起床闹钟：计划睡 plannedHours，但若设定了 alarmHour，则会被闹钟提前叫醒。
 * 实际睡眠时长 = min(计划时长, 到闹钟时刻的小时数)。闹钟时刻按「当前时刻之后的下一个 alarmHour」计算
 * （例如 23:00 设 7:00 → 8h；02:00 设 7:00 → 5h；闹钟与当前同点 → 次日此时）。
 */
export function alarmCappedHours(state: GameState, plannedHours: number): number {
  const a = state.alarmHour;
  if (a === undefined || a === null) return plannedHours;
  let h = (a - state.time.hour + 24) % 24;
  if (h === 0) h = 24; // 与当前同点 → 次日此时
  return Math.min(plannedHours, h);
}

/** 闹钟实际叫醒时刻（0-23），未设定返回 undefined */
export function alarmWakeHour(state: GameState): number | undefined {
  const a = state.alarmHour;
  if (a === undefined || a === null) return undefined;
  let h = (a - state.time.hour + 24) % 24;
  if (h === 0) h = 24;
  return (state.time.hour + h) % 24;
}

/** 房租涨幅计算（从 lease 档位自带 rentGrowthRate 读取；12 次封顶） */
function computeNextRent(state: GameState): number {
  if (!state.living.lease) return 0;
  const rent = state.living.lease.rent;
  if (state.living.lease.rentGrowthCount >= 12) return rent; // 12 个月后封顶
  const tier = getLeaseTier(state.living.lease.housingId);
  const growthRate = tier?.rentGrowthRate ?? 0.2;
  return Math.round(rent * (1 + growthRate));
}

/**
 * 入睡结算（每次清醒周期结束时执行）：
 * 1. 按天住宿费（mode=nightly）
 * 2. 体力恢复率随住宿档位，按体力上限（maxStamina）比例恢复（熬夜减半）
 * 3. 心情 = 基础 + 档位加成（熬夜额外 -10）
 * 4. 档位副作用（ATM 伤健康/增压/掉干净）
 * 5. 政府免费住宿倒计时（到期转 nightly）
 * 6. 自然结算：健康衰减/干净下降/压力回落/抑郁/饥饿
 * 7. 月租结算（mode=lease 且每月 1 号）
 * 8. 月供结算（每月 20 号，按家庭条件）
 */
/** 睡眠质量系数（UI 与结算共用，v0.936：避免睡眠恢复预览与真实公式不一致）
 * 睡 ≥10h 满恢复；否则按小时比例，最短保底 0.2。 */
export function sleepQualityOf(hours: number): number {
  return hours >= 10 ? 1 : Math.max(0.2, hours / 8);
}

export function sleepSettlement(
  state: GameState,
  opts?: { stayedUp?: boolean; hours?: number },
): void {
  const p = state.player;
  const stayedUp = opts?.stayedUp ?? false;
  const hours = opts?.hours ?? 8;
  // v0.992 蹭住（crashTonight 非空）用独立档位：青旅级恢复 + 心情加成 + 无露宿副作用。
  // 原实现只免了住宿费，恢复系数与副作用仍取当前 nightly 档位——露宿街头去蹭住反而白吃健康/压力惩罚。
  const crashedAt = state.romance.crashTonight;
  const lodging = crashedAt
    ? {
        ...getEffectiveLodging(state),
        icon: "🛏️",
        name: `${npcName(crashedAt)}家`,
        recovery: 0.65,
        moodBonus: 5,
        sideEffects: undefined,
      }
    : getEffectiveLodging(state);
  const maxStamina = getMaxStamina(state);
  // v0.94 新手引导：睡过觉即完成「好好睡一觉」步骤
  state.flags["slept_once"] = true;

  // 1) 按天住宿费用（mode=nightly；未选默认 atm 0 元；住院期间免住宿费）
  // v0.95 寒潮：住宿费上浮 1.3 倍（own 产权房免——不在 nightly 分支）
  const hospitalized = !!state.flags["hospitalized"];
  if (state.living.mode === "nightly" && !hospitalized) {
    const base = nightlyPrice(state);
    if (crashedAt) {
      pushLog(state, "🛏️", `在${npcName(crashedAt)}家蹭住了一晚，省下 ${base} 元住宿费`);
      state.romance.crashTonight = undefined;
    } else {
      const coldwave = currentWeather(state) === "coldwave";
      const price = coldwave ? Math.round(base * 1.3) : base;
      p.money -= price;
      if (price > 0) {
        pushLog(state, lodging.icon, `住在${lodging.name} -${price} 元${coldwave ? "（寒潮取暖加价）" : ""}`);
      } else {
        pushLog(state, lodging.icon, `在${lodging.name}凑合了一晚（免费）`);
      }
    }
  }

  // 1.5) 住院结算：每晚 +15 健康、-60 元；首晚治病；3 晚或健康≥85 出院
  if (hospitalized) {
    const nights = (state.flags["hospitalNights"] as number) ?? 0;
    if (nights === 0) {
      cureStatuses(state, ["sick"]);
    }
    p.attrs.health = clamp(p.attrs.health + 15);
    p.money -= 60;
    if (p.money < 0) {
      pushLog(state, "🏥", "住院费 60 元，钱不够了！");
    } else {
      pushLog(state, "🏥", `住院第 ${nights + 1} 晚，健康 +15，住院费 -60 元`);
    }
    const newNights = nights + 1;
    if (newNights >= 3 || p.attrs.health >= 85) {
      state.flags["hospitalized"] = false;
      state.flags["hospitalNights"] = 0;
      pushLog(state, "🏥", "病情好转，办理出院了");
    } else {
      state.flags["hospitalNights"] = newNights;
    }
  }

  // 2) 体力恢复 = 住宿档位 recovery × 睡眠质量 × debuff 惩罚
  // v0.93：短睡（<4h）质量下限由 0.5× 提升至保底 0.2，避免"睡一小觉几乎不回体力"
  const sleepQuality = sleepQualityOf(hours);
  const recovery = lodging.recovery * sleepQuality * statusSleepPenalty(state) * (stayedUp ? 0.85 : 1);
  p.attrs.stamina = clampStamina(p.attrs.stamina + (maxStamina - p.attrs.stamina) * recovery, maxStamina);

  // 3) 心情 = 基础 8 + 档位加成（熬夜额外 -10，短睡<6h 额外 -6）
  // v0.95 良性循环：好运 buff 心情恢复 +2，霉运 -1
  const moodBuff = hasStatus(state, "lucky") ? 2 : hasStatus(state, "unlucky") ? -1 : 0;
  p.attrs.mood = clamp(p.attrs.mood + 8 + lodging.moodBonus + moodBuff - (stayedUp ? 10 : 0) - (hours < 6 ? 6 : 0));

  // 4) 档位副作用（如 ATM：健康-2/压力+8/干净-4）
  if (lodging.sideEffects) {
    p.attrs.health = clamp(p.attrs.health + (lodging.sideEffects.health ?? 0));
    p.stress = clamp(p.stress + (lodging.sideEffects.stress ?? 0));
    p.attrs.hygiene = clamp(p.attrs.hygiene + (lodging.sideEffects.hygiene ?? 0));
  }

  // 5) 政府免费住宿倒计时
  if (state.living.mode === "gov") {
    state.living.govDaysLeft--;
    if (state.living.govDaysLeft <= 0) {
      state.living.mode = "nightly";
      state.living.nightly = null;
      pushLog(state, "🏛️", "政府免费住宿已到期，今晚起要自己找地方住");
    }
  }

  // 5.5) 健康自然恢复（健康靠行动恢复；<20 持续恶化逼就医；按时睡有奖励）
  if (p.attrs.health < 20) {
    p.attrs.health = clamp(p.attrs.health - 1); // 持续恶化，逼就医
  }
  if (!stayedUp && hours >= 7 && hours <= 9) {
    p.attrs.health = clamp(p.attrs.health + 0.5); // 按时睡奖励
  }

  // 6) 自然结算
  if (stayedUp) p.attrs.health = clamp(p.attrs.health - 0.5);

  // 健康基础衰减（体力过低时加速）
  const healthDecay = 1 + (p.attrs.stamina < 20 ? 3 : 0);
  p.attrs.health = clamp(p.attrs.health - healthDecay);

  // 干净度每日下降
  p.attrs.hygiene = clamp(p.attrs.hygiene - 6);

  // 压力自然回落 15
  p.stress = clamp(p.stress - 15);

  // 抑郁状态（心情 < 20）：健康额外衰减
  if (p.attrs.mood < 20) {
    p.attrs.health = clamp(p.attrs.health - 1.5);
    p.lowMoodStreak++;
  } else {
    p.lowMoodStreak = 0;
  }

  // 饱腹：连续不吃东西的惩罚（v0.936：当日吃过则清零，否则 +1，使「饿死街头」结局可达）
  if (state.flags["ateToday"]) {
    p.hungryStreak = 0;
    state.flags["ateToday"] = false;
  } else {
    p.hungryStreak++;
  }
  if (p.hungryStreak >= 2) {
    p.attrs.health = clamp(p.attrs.health - 1.5);
    p.attrs.stamina = clampStamina(p.attrs.stamina - 5, maxStamina);
  }

  // 7) 月租结算（仅 mode=lease 且每月 1 号）
  if (state.living.mode === "lease" && state.living.lease && state.time.day === 1) {
    const rent = state.living.lease.rent;
    p.money -= rent;
    if (p.money < 0) {
      pushLog(state, "🏠", `交房租 -${rent}，资金不足！`);
    } else {
      pushLog(state, "🏠", `交了房租 -${rent}，剩余 ${p.money} 元`);
    }
    const nextRent = computeNextRent(state);
    if (nextRent !== rent) {
      state.living.lease.rent = nextRent;
      state.living.lease.rentGrowthCount++;
      pushLog(state, "📈", `房东通知：下月房租涨至 ${nextRent} 元`);
    }
  }

  // 8) 月供结算（每月 20 号，按家庭条件；剧情模式的家里开销由主线卡承担，不再重复扣款）
  if (state.time.day === 20 && state.mode !== "story") {
    const f = FAMILY_MAP.get(state.family);
    if (f && f.monthlyPayment !== 0) {
      p.money += f.monthlyPayment;
      pushLog(state, f.icon, f.monthlyNote ?? `月供 ${f.monthlyPayment > 0 ? "+" : ""}${f.monthlyPayment} 元`);
    }
  }

  // 资金为负天数连续判定（v0.936：每晚结算末尾统一计算；赚钱回正则清零，避免永久累加导致误判破产）
  p.negativeMoneyStreak = p.money < 0 ? p.negativeMoneyStreak + 1 : 0;

  // 8.5) 周期发薪（周结 day 7/14/21/28、月结 day 30）与自动离职检查
  checkAutoQuit(state);
  paycheck(state);

  // 8.6) 租用载具到期收回
  checkVehicleExpiry(state);

  // 8.6.1) 会籍月卡到期失效（v0.92：健身月卡过期 → 锻炼重新锁定）
  checkMembershipExpiry(state);

  // debuff 调和（睡觉 = 休息，2 晚解除肌肉劳损）
  reconcileStatuses(state, { slept: true, hoursSlept: hours, stayedUp, rested: true });

  // 8.6.3) v0.97 睡前收短信：每天至多一条（下班后的家人/朋友联系）
  maybeReceiveSms(state);

  // 8.6.4) v0.978 联系人定期教程/关照短信（棋谱教程/书法心得/编程技巧/组长窍门…）
  tickContactBenefits(state);

  // 8.6.5) v0.98 垃圾广告短信：每天 25% 概率
  maybeReceiveJunkSms(state);

  // 8.6.2) 生存指标惩罚结算（v0.92）：抑郁累计 / 健康归零倒计时 / 邋遢附加损伤
  // 放在 reconcileStatuses 之后，确保 sick 等基础状态先就位，再叠加抑郁判定。
  dailySurvivalSettlement(state, {
    upsertStatus: (id, severity) => upsertStatus(state, id, severity ?? 1),
    log: (icon, text) => pushLog(state, icon, text),
  });

  // 8.6.6) v0.985 塔罗：睡下即结束「晕倒后未睡」的观察窗（倒吊人只认硬撑不睡的那一次）
  state.flags.collapsed_not_slept = false;

  // 8.7) 结局判定（v0.9）：每晚结算后自动检查触发条件
  const ended = checkEnding(state);
  if (ended) {    pushLog(state, "🎬", `触发结局【${ended.name}】——${ended.desc}`);
  }

  // 8.8) v0.985 塔罗每日结算：维护连胜类计数器（皇后/正义/星星/皇帝/隐者）并评估解锁。
  // 放在结局判定之后，使「太阳/审判」能在触发结局的当晚一并翻开。
  const newlyTarot = tickTarotDaily(state);
  for (const id of newlyTarot) {
    const card = tarotCard(id);
    if (card) pushLog(state, "🔮", `翻开塔罗牌「${id}·${card.name}」——${card.symbol}`);
  }

  // 8.9) v0.99 社交结算：关系淡漠 / 恋爱维护 / 同事好感 / 借款逾期
  for (const l of tickRelationshipDecay(state)) pushLog(state, "🍂", l);
  for (const l of tickRomance(state)) pushLog(state, "💔", l);
  for (const l of tickColleagueAffinity(state)) pushLog(state, "💞", l);
  for (const l of tickLoans(state)) pushLog(state, "💰", l);

  // 8.9.5) v0.992 NPC 特权兑现：free_meal（如陈姐）——每天送一顿工作餐（饱腹+20 心情+2）
  const today = gameDay(state.time);
  for (const rel of state.relationships) {
    if (npcPerkOf(state, rel.npcId) !== "free_meal") continue;
    if (getNpcDef(rel.npcId)?.type === "colleague") continue; // 同事 NPC 无此特权，防御
    const key = `free_meal_${rel.npcId}`;
    if (state.flags[key] === today) continue;
    state.flags[key] = today;
    applyEffects(state, { satiety: 20, mood: 2 });
    pushLog(state, "🍱", `${npcNick(rel.npcId)}给你塞了份工作餐，吃得踏实（饱腹+20，心情+2）`);
  }

  // 8.9.6) v1.0 剧情模式：失约/抽卡/赌鬼开销/超时 + 终局评级 + 结局判定
  if (state.mode === "story" && !state.endingId) {
    tickStory(state);
    decideStoryFinal(state);
    if (!state.endingId) {
      const ended2 = checkEnding(state);
      if (ended2) {
        pushLog(state, "🎬", `触发结局【${ended2.name}】——${ended2.desc}`);
      }
    }
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}
function clampStamina(v: number, max: number): number {
  return Math.max(0, Math.min(max, v));
}

/** 将 period 转为中文标签 */
export function periodLabel(p: Period): string {
  switch (p) {
    case "morning":
      return "上午";
    case "afternoon":
      return "下午";
    case "evening":
      return "晚上";
    case "night":
      return "深夜";
  }
}

/** 时间格式化：14:30 */
export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export { PERIOD_ORDER };
