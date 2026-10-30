import { ensureStockMarket, nextStockBoundary, processStockMarket } from './stockMarket';
import { processCompany } from './company';
import { stockMinute, STOCK_DAY } from './stockMath';
/**
 * 时间系统（v4 小时制）：时刻推进 / 显式睡觉 / 入睡结算 / 月度房租与月供。
 * 纯逻辑：输入 state，返回新 state。
 * 关键：跨午夜不自动入睡（支持夜班），睡觉是玩家显式行动；凌晨 3 点后或体力耗尽强制兜底。
 */
import type { GameState, Period } from "../types";
import {settlePropertyRent} from './propertyPortfolio';
import {consumeHotelPrepayment} from './cityHotels';
import { residenceSleepHours, expireTemporaryResidenceStays, consumeNpcCrashStay } from "./residence";
import { PERIOD_ORDER } from "../types";
import { getEffectiveLodging, getResidenceLodging, nightlyPrice, nightlyCost, getLeaseTier, LEASE_PERIOD_DAYS } from "./housing";
import { getMaxStamina } from "./stats";
import { clampAttr } from "./attributes";
import { pushLog, applyEffects } from "../engine";
import { statusSleepPenalty, reconcileStatuses, cureStatuses, upsertStatus, hasStatus, registerNightOwl } from "./statuses";
import { processWorkCalendar } from "./career";
import { refreshDailyQuests, retireDailyGoals } from "./quests";
import { refreshLaborMarket } from "./jobs";
import { checkVehicleExpiry } from "./vehicle";
import { checkMembershipExpiry } from "./membership";
import { dailySurvivalSettlement } from "./survival";
import { checkEnding } from "./endings";
import { monthlyInflationRate, priceIndexCap } from "./difficulty";
import { settleInvestments } from "./invest";
import { facilityEfficiency } from "./facility";
import { rollWeather, currentWeather } from "./weather";
import { maybeReceiveSms, maybeReceiveJunkSms } from "./phone";
import { tickContactBenefits } from "./contacts";
import { tickMoments } from "./moments";
import { tickOrders } from "./orders";
import { tickForum } from "./forum";
import { allCitizens } from "./citizens";
import { tickTarotDaily, tarotCard, onLibraryStudy } from "./tarot";
import { tickRelationshipDecay, tickRomance, tickColleagueAffinity, tickLoans, npcPerkOf } from "./relationships";
import { npcName, npcNick, getNpcDef } from "./npcs";
import { tickStory, decideStoryFinal } from "./story";
import { weeklySettlement, recordMoney } from "./weekly";
import { checkCatAcquisition } from "./cat";
import { tickCatCareDaily, tickCatAutoFeeder } from "./catCare";
import { tickSmallPetsDaily } from "./smallPets";
import { expireTicketIfMissed } from "./tournament";
import { fromLinearDay, gameDay, linearDay } from "./calendar";
import { removeRetiredNpcTasks } from "./npcTaskAvailability";
import { formatDuration } from "./quests";
import { tickNpcTasks } from "./npcTasks";
import familyData from "../data/families.json";
export { themeOfHour } from "../timeOfDay";

const FAMILY_MAP = new Map(
  (familyData as { families: Array<{ id: string; icon: string; monthlyPayment: number; monthlyNote?: string }> }).families.map(
    (f) => [f.id, f],
  ),
);

/** 月份名称 */
export function monthName(month: number): string {
  return `${month}月`;
}

/** 小时 → 时段派生标签（不落存档） */
export function periodOfHour(hour: number): Period {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 23) return "evening";
  return "night"; // 23:00-4:59
}

/** 日/月/年进位（day 30 → 下月 1 号；month 12 → 下年 1 月） */
function rollDay(state: GameState): void {
  state.time.day++;
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
  // v0.95 季节/天气：每天重掷天气（按季节加权，rng 可复现）
  expireTicketIfMissed(state);
  // v1.215 修复：移到月份进位之后，避免每月 1 号仍按旧月份季节掷天气（P2-2）
  state.weather = { id: rollWeather(state), lastRollDay: gameDay(state.time) };
  // v1.3：跨天让联系人与市民自动发布 Moments 动态（侧面教学城市玩法）
  tickMoments(state, allCitizens());
  // v1.3：跨天推进订单到达 + 论坛市民帖
  tickOrders(state);
  tickForum(state, allCitizens());
  // v1.4：跨天检查达成目标型猫咪获取（如攒够存款解锁黄金猫）
  const newCat = checkCatAcquisition(state);
  if (newCat) pushLog(state, newCat.icon, `一只${newCat.name}悄悄跟回了家，愿意成为你的伙伴`);
  // v1.4 P2：跨天猫咪生存状态衰减 + 训练计数重置 + 猫窝心情加成
  for (const msg of tickCatCareDaily(state)) pushLog(state, "🐱", msg);
  // v1.4：跨天小宠物只衰减饥饿和心情，不接入猫咪养成系统
  for (const msg of tickSmallPetsDaily(state)) pushLog(state, "🐦", msg);
}

/**
 * 推进 hours 小时（支持 0.5）。跨 24:00 只 rollover 日期 + 标熬夜，不自动入睡结算。
 * 清醒时间消耗饱腹（每小时 -3）；睡眠/小睡不消耗。
 */
export function advanceHours(
  state: GameState,
  hours: number,
  decaySatietyEnabled = true,
  preserveSettlementFlags = false,
  onArrival?: () => void,
): { crossedDay: boolean } {
  retireDailyGoals(state);
  if (state.districtLeisure?.active) return { crossedDay: false };
  if (!preserveSettlementFlags) expireTemporaryResidenceStays(state);
  // 先处理当前位置，再依次越过每个午夜；工资与缺勤由持久化游标幂等消费。
  processWorkCalendar(state);
  processCompany(state);
  // 游戏时钟统一使用整分钟；兼容旧档中残留的浮点分钟。
  const elapsedMinutes = Number.isFinite(hours) ? Math.max(0, Math.round(hours * 60)) : 0;
  hours = elapsedMinutes / 60;
  // Historic tools sometimes supplied day 31 despite the game's 30-day calendar.
  if(state.time.day<1||state.time.day>30||state.time.month<1||state.time.month>12)Object.assign(state.time,fromLinearDay(linearDay(state.time)));
  const startMinute=stockMinute(state),targetMinute=startMinute+elapsedMinutes;
  const market=ensureStockMarket(state);
  // Tests, new-life setup and historical developer time changes may move an unused market forward.
  // A live account is never reset or re-priced by this compatibility path.
  if((market.nextQuoteMinute<startMinute||market.lastProcessedMinute>startMinute)&&market.cashCents===0&&!market.positions.length&&!market.orders.length&&!market.trades.length&&!market.loan&&!market.gapDebts.length){
    delete state.economy.stockMarket;ensureStockMarket(state);
  }
  processStockMarket(state);
  let dayRolls=0,arrived=false,cursor=startMinute;
  while(cursor<targetMinute&&state.endingId!=='ending_financial_default'){
    const midnight=(Math.floor(cursor/STOCK_DAY)+1)*STOCK_DAY;
    const boundary=Math.min(midnight,nextStockBoundary(state,targetMinute));
    if(boundary<=cursor)throw new Error('股市时间游标异常，拒绝重复推进');
    const crossed=boundary===midnight;
    if(crossed){state.time.hour=0;state.time.minute=0;rollDay(state);dayRolls++;settlePropertyRent(state);}
    else{const within=((boundary%STOCK_DAY)+STOCK_DAY)%STOCK_DAY;state.time.hour=Math.floor(within/60);state.time.minute=within%60;}
    processWorkCalendar(state);
    processCompany(state);
    if(boundary===targetMinute&&onArrival){onArrival();arrived=true;processWorkCalendar(state);}
    processStockMarket(state);
    if(crossed&&decaySatietyEnabled&&!preserveSettlementFlags&&state.endingId!=='ending_financial_default')settlePreviousCalendarDay(state);
    cursor=boundary;
  }
  if(!arrived&&state.endingId!=='ending_financial_default'){onArrival?.();processWorkCalendar(state);processStockMarket(state);}
  hours=(stockMinute(state)-startMinute)/60;
  if (dayRolls > 0) {
    state.time.stayedUp = true;
    // v1.215：跨天重置「已结算」哨兵，新一天可正常结算月租/发薪/结局。
    // 睡眠流程例外：结算发生在 advanceHours 之前，睡到次日后仍需保留刚写入的
    // anchor/legacy 标记，避免“结算了 Day7，睡醒时标记却被删掉”的错位。
    if (!preserveSettlementFlags) {
      delete state.flags["settledToday"];
      delete state.flags["collapseSettledToday"];
    }
    // v1.42：settledAnchor / collapseSettledAnchor 使用完整年月日，不随跨午夜清除。
    // 熬夜跨午夜后的第一次睡眠仍锚定前一日，清除会重新执行上一日结算。
    // 跨天：归档昨日任务 + 为在职正式工排今日班（惰性，重复调用无副作用）
    refreshDailyQuests(state);
    // 跨天：重建今日劳务市场岗位池（v0.89：不再依赖走进劳务市场触发）
    refreshLaborMarket(state);
    // v1.215：跨天自动生成次日每日目标（dailyGoals.test.ts）
  }
  // 清醒消耗饱腹（促进正常饮食；睡眠/小睡传 false 跳过）
  if (decaySatietyEnabled && hours > 0) {
    // 按累计经过时间取整并保存小数余量，避免同样 1 小时因行动拆分方式不同而多扣饱腹。
    // 余量允许为负：半小时仍沿用原有 -2 点显示，但两次半小时合计严格等于一小时 -3 点。
    const carry = Number(state.flags["satiety_decay_remainder"] ?? 0);
    const accrued = hours * 3 + (Number.isFinite(carry) ? carry : 0);
    const decay = Math.max(0, Math.round(accrued));
    const nextSatiety = Math.max(0, state.player.attrs.satiety - decay);
    state.player.attrs.satiety = nextSatiety;
    if (nextSatiety <= 0) {
      delete state.flags["satiety_decay_remainder"];
    } else {
      const remainder = accrued - decay;
      if (Math.abs(remainder) < 1e-9) delete state.flags["satiety_decay_remainder"];
      else state.flags["satiety_decay_remainder"] = remainder;
    }
  }
  // v0.985 女祭司：在图书馆里泡掉的每一个清醒小时都计入累计学习时长
  if (decaySatietyEnabled && hours > 0 && state.locationId === "library") {
    onLibraryStudy(state, hours);
  }
  // 非跨天时间推进也检查一次，能覆盖玩耍等行动刚把猫咪饱食度降到阈值以下的情况。
  // 跨天时 rollDay 已在日衰减之后结算过自动喂食，避免同一推进重复反馈。
  if (dayRolls === 0) {
    for (const msg of tickCatAutoFeeder(state)) pushLog(state, "🤖", msg);
  }
  if (!preserveSettlementFlags) expireTemporaryResidenceStays(state);
  tickNpcTasks(state);
  return { crossedDay: dayRolls > 0 };
}

/**
 * 旧调用兼容：仅清理退役委托，不再按天数结算奖励。
 */
export function tickNpcCommissions(state: GameState): void {
  removeRetiredNpcTasks(state);
}

/**
 * 显式睡觉：按小时数入睡（支持夜班）。
 * 熬夜判定：本清醒周期已跨午夜，或入睡时刻 >= 23 点。
 */
export function sleepRecoveryFraction(state: GameState, hours: number, stayedUp: boolean, lodgingRecovery = (state.flags.hospitalized ? getResidenceLodging(state) : getEffectiveLodging(state)).recovery): number {
  return lodgingRecovery * sleepQualityOf(hours) * statusSleepPenalty(state) * (stayedUp ? 0.85 : 1) * facilityEfficiency(state, "rest");
}

export function previewSleepStamina(state: GameState, hours: number): number {
  const max = getMaxStamina(state);
  const stayedUp = state.time.stayedUp || state.time.hour >= 23;
  // sleep() registers a new short-night sleep disorder before restoring stamina.
  // Project that status without changing the live save while the modal is open.
  const projected: GameState = stayedUp && hours < 7 && !state.statuses.some(status => status.id === "sleep_disorder")
    ? { ...state, statuses: [...state.statuses, { id: "sleep_disorder", severity: 1, count: 1 }] }
    : state;
  const recovery = sleepRecoveryFraction(projected, hours, stayedUp);
  return clampStamina(state.player.attrs.stamina + (max - state.player.attrs.stamina) * recovery, max);
}

export function sleep(state: GameState, hours: number): void {
  if (state.districtLeisure?.active) return;
  hours = residenceSleepHours(state, hours);
  expireTemporaryResidenceStays(state);
  if (hours <= 0) return;
  const sleepHour = state.time.hour;
  const stayedUp = state.time.stayedUp || sleepHour >= 23;
  // v0.992 修复：睡够 8h 也会触发「获得→立即解除」作息混乱日志对——只有短睡（<7h）的熬夜才算作息紊乱
  if (stayedUp && hours < 7) registerNightOwl(state);
  // 同一日的连续睡眠只能执行一次生活结算；睡眠恢复本身仍然可以正常发生。
  // 旧版会用“连续长睡”绕过 settledAnchor，导致房租、月供、发薪和医院费用重复结算。
  sleepSettlement(state, { stayedUp, hours });
  advanceHours(state, hours, false, true); // 睡眠不消耗饱腹，并保留本次结算锚点
  if (hours >= 6 && state.districtServices) state.districtServices.alcoholCups = 0;
  if (state.romance.crashTonight) consumeNpcCrashStay(state);
  expireTemporaryResidenceStays(state);
  // v1.42：睡眠本身也要留下操作反馈，即使免费住宿没有费用日志。
  // 结算前记录数值，避免日志文案与本次睡眠时长脱节。
  pushLog(state, "🛏️", `睡了 ${formatDuration(hours)}，体力恢复至 ${Math.round(state.player.attrs.stamina)}，心情 ${Math.round(state.player.attrs.mood)}`);
  state.time.stayedUp = false;
}

/** 睡到自然醒（次日 7 点），返回实际小时数。恰好 07:00 时为 0（安全空操作，调用方应隐藏该选项）。 */
export function naturalWakeHours(state: GameState): number {
  const now = state.time.hour * 60 + state.time.minute;
  const target = 7 * 60;
  // 旧写法 `% 1440 || 1440` 在恰好 07:00 时返回 24 小时：玩家整点行动后选「睡到自然醒」
  // 会睡满一整天，醒来还是 07:00，白过一天且不触发熬夜登记。
  const minutes = (target - now + 1440) % 1440;
  return minutes / 60;
}

/** 小睡（白天补觉，不结算自然衰减；恢复上限的 30%，但仍消耗清醒时段的饱腹） */
export function nap(state: GameState, hours = 2): void {
  const maxStamina = getMaxStamina(state);
  state.player.attrs.stamina = clampStamina(state.player.attrs.stamina + maxStamina * 0.3, maxStamina);
  state.player.attrs.mood = clampAttr(state.player.attrs.mood + 3);
  advanceHours(state, hours, true); // 小睡不是夜间睡眠，不能通过补觉规避饱腹消耗
}

/**
 * v0.93 起床闹钟：计划睡 plannedHours，但若设定了 alarmHour，则会被闹钟提前叫醒。
 * 实际睡眠时长 = min(计划时长, 到闹钟时刻的时长)。闹钟时刻按「当前时刻之后的下一个 alarmHour」计算
 * （例如 23:00 设 7:00 → 8h；02:00 设 7:00 → 5h；闹钟与当前同点 → 次日此时）。
 * v1.215 修复：改用分钟精度——当前时刻带分钟（如 23:15）时不再被近似成整点（P2-1）。
 */
export function alarmCappedHours(state: GameState, plannedHours: number): number {
  const a = state.alarmHour;
  if (a === undefined || a === null) return plannedHours;
  const nowMin = state.time.hour * 60 + state.time.minute;
  const targetMin = a * 60;
  let diffMin = (targetMin - nowMin + 1440) % 1440;
  if (diffMin === 0) diffMin = 1440; // 与当前同点 → 次日此时
  return Math.min(plannedHours, diffMin / 60);
}

/** 闹钟实际叫醒时刻（小时数，分钟为小数：6.75 = 06:45），未设定返回 undefined */
export function alarmWakeHour(state: GameState): number | undefined {
  const a = state.alarmHour;
  if (a === undefined || a === null) return undefined;
  const nowMin = state.time.hour * 60 + state.time.minute;
  const targetMin = a * 60;
  let diffMin = (targetMin - nowMin + 1440) % 1440;
  if (diffMin === 0) diffMin = 1440;
  return ((nowMin + diffMin) % 1440) / 60;
}

/** 房租涨幅计算（从 lease 档位自带 rentGrowthRate 读取；12 次封顶） */
function computeNextRent(state: GameState): number {
  if (!state.living.lease) return 0;
  const rent = state.living.lease.rent;
  if (state.living.lease.rentGrowthCount >= 12) return rent; // 12 个月后停止上涨
  const tier = getLeaseTier(state.living.lease.housingId);
  const growthRate = tier?.rentGrowthRate ?? 0.2;
  const next = Math.round(rent * (1 + growthRate));
  // v1.43 经济修正：涨租必须有绝对上限。旧版按月复利（0.2）会涨到 8916 元/月，
  // 超过全游戏工资天花板（最高时薪 16.2 元/时 → 月薪约 3000-3700），租房路线数学上必破产。
  const cap = tier?.rentCap;
  return cap !== undefined ? Math.min(next, cap) : next;
}

/**
 * 入睡结算（每次清醒周期结束时执行）：
 * 1. 按天住宿费（mode=nightly）
 * 2. 体力恢复率随住宿档位，按体力上限（maxStamina）比例恢复（熬夜减半）
 * 3. 心情 = 基础 + 档位加成（熬夜额外 -10）
 * 4. 档位副作用（ATM 伤健康/增压/掉干净）
 * 5. 政府免费住宿倒计时（到期转 nightly）
 * 6. 自然结算：健康衰减/干净下降/压力回落/抑郁/饥饿
 * 7. 月租结算（mode=lease 且滚动租期到期）
 * 8. 月供结算（每月 20 号，按家庭条件）
 */
/** 睡眠质量系数（UI 与结算共用，v0.936：避免睡眠恢复预览与真实公式不一致）
 * 睡 ≥10h 满恢复；否则按小时比例，最短保底 0.2。 */
export function sleepQualityOf(hours: number): number {
  return hours >= 10 ? 1 : Math.max(0.2, hours / 8);
}

export function sleepSettlement(
  state: GameState,
  opts?: { stayedUp?: boolean; hours?: number; calendarOnly?: boolean },
): void {
  expireTemporaryResidenceStays(state);
  const p = state.player;
  const attrsAtStart = { ...p.attrs, stress: p.stress };
  const stayedUp = opts?.stayedUp ?? false;
  const hours = opts?.hours ?? 8;
  const calendarOnly = opts?.calendarOnly ?? false;
  // v1.215 修复（P1-9）：抑郁判定用「入睡前」心情——睡眠+8 之后再判会把阈值虚抬，抑郁系统近乎失效
  const preMood = p.attrs.mood;
  // v1.215 修复（P1-8）：结算锚定「日历日」而非入睡日。
  // 熬夜跨午夜后入睡时（state.time.stayedUp），本清醒周期属于昨天，租金/发薪应锚回昨天；
  // 否则 1 号通宵到 2 号再睡会逃掉 1 号月租、发薪日通宵会让工资顺延。
  const anchor = settlementAnchor(state);
  const anchorDay = anchor.day;
  const anchorKey = settlementAnchorKey(anchor.year, anchor.month, anchor.day);
  // v1.42 H1：按完整年月日去重，不再把睡眠时刻当作新的清醒周期。
  // 旧版 settledToday / collapseSettledToday 仍兼容读取，避免旧存档在首次睡眠时重复扣费。
  const settlementMinute = state.time.day * 1440 + state.time.hour * 60 + state.time.minute;
  // 所有睡眠入口都按完整年月日幂等；跨到下一天后锚点自然变化，才会开始下一次生活结算。
  const normalAlreadySettled = state.flags["settledAnchor"] === anchorKey;
  const legacyNormalAlreadySettled = state.flags["settledToday"] === anchorDay;
  const collapseAlreadySettled = state.flags["collapseSettledAnchor"] === anchorKey
    || state.flags["collapseSettledToday"] === anchorDay;
  const alreadySettled = collapseAlreadySettled || normalAlreadySettled || legacyNormalAlreadySettled;
  // v0.992 蹭住（crashTonight 非空）用独立档位：青旅级恢复 + 心情加成 + 无露宿副作用。
  // 原实现只免了住宿费，恢复系数与副作用仍取当前 nightly 档位——露宿街头去蹭住反而白吃健康/压力惩罚。
  const crashedAt = state.romance.crashTonight;
  const hospitalized = !!state.flags["hospitalized"];
  let hospitalNightsAfterSettlement: number | undefined;
  const lodging = crashedAt
    ? {
        ...getEffectiveLodging(state),
        icon: "🛏️",
        name: `${npcName(crashedAt)}家`,
        recovery: 0.65,
        moodBonus: 5,
        sideEffects: undefined,
      }
    : hospitalized
      ? getResidenceLodging(state) // 住院恢复率忽略外宿（人实际在病房，不在外宿点）
      : getEffectiveLodging(state);
  const maxStamina = getMaxStamina(state);
  // v0.94 新手引导：睡过觉即完成「好好睡一觉」步骤
  if (!calendarOnly) state.flags["slept_once"] = true;

  // 1) 按天住宿费用（mode=nightly；未选默认 atm 0 元；住院期间免住宿费）
  // v0.95 寒潮：住宿费上浮 1.3 倍（own 产权房免——不在 nightly 分支）
  if ((state.living.mode === "nightly" || state.living.awayNight) && !hospitalized && !alreadySettled) {
    const base = nightlyPrice(state);
    if (crashedAt) {
      pushLog(state, "🛏️", `在${npcName(crashedAt)}家蹭住了一晚，省下 ${base} 元住宿费`);
    } else {
      const coldwave = currentWeather(state) === "coldwave";
      const prepaid=consumeHotelPrepayment(state,lodging.id);
      const price = prepaid?0:nightlyCost(state, base);
      p.money -= price;
      if (price > 0) {
        recordMoney(state, -price); // v1.215 修复（P1-10）：按天住宿费计入周记
        pushLog(state, lodging.icon, `住在${lodging.name} -${price} 元${coldwave ? "（寒潮取暖加价）" : ""}`);
      } else {
        pushLog(state, lodging.icon, prepaid?`住在${lodging.name}，本晚房费已预付`:`在${lodging.name}凑合了一晚（免费）`);
      }
    }
  }

  // 借宿登记保持到退房，睡醒仍在同一间房，居家功能不会凭空消失。
  // 住院时作废借宿登记；医院收费与恢复另行处理。
  if (hospitalized) state.living.awayNight = null;

  // 1.5) 住院结算：每晚 +15 健康、-60 元；首晚治病；是否出院在自然健康结算后判断。
  // 同一结算锚点只收一次，避免连续睡眠反复扣住院费。
  if (hospitalized && !alreadySettled) {
    const nights = (state.flags["hospitalNights"] as number) ?? 0;
    if (nights === 0) {
      cureStatuses(state, ["sick"]);
    }
    cureStatuses(state,["cold"]);
    p.attrs.health = clampAttr(p.attrs.health + 15);
    p.money -= 60;
    recordMoney(state, -60); // v1.10 周记
    if (p.money < 0) {
      pushLog(state, "🏥", "住院费 60 元，钱不够了！");
    } else {
      pushLog(state, "🏥", `住院第 ${nights + 1} 晚，健康 +15，住院费 -60 元`);
    }
    hospitalNightsAfterSettlement = nights + 1;
    state.flags["hospitalNights"] = hospitalNightsAfterSettlement;
  }

  // 2) 体力恢复 = 住宿档位 recovery × 睡眠质量 × debuff 惩罚
  // v0.93：短睡（<4h）质量下限由 0.5× 提升至保底 0.2，避免"睡一小觉几乎不回体力"
  if (!calendarOnly) {
    const recovery = sleepRecoveryFraction(state, hours, stayedUp, lodging.recovery);
    p.attrs.stamina = clampStamina(p.attrs.stamina + (maxStamina - p.attrs.stamina) * recovery, maxStamina);

    // 3) 心情 = 基础 8 + 档位加成（熬夜额外 -10，短睡<6h 额外 -6）
    // v0.95 良性循环：好运 buff 心情恢复 +2，霉运 -1
    const moodBuff = hasStatus(state, "lucky") ? 2 : hasStatus(state, "unlucky") ? -1 : 0;
    p.attrs.mood = clampAttr(p.attrs.mood + 8 + lodging.moodBonus + moodBuff - (stayedUp ? 10 : 0) - (hours < 6 ? 6 : 0));

    // 4) 档位副作用（如 ATM：健康-2/压力+8/干净-4）
    if (lodging.sideEffects) {
      p.attrs.health = clampAttr(p.attrs.health + (lodging.sideEffects.health ?? 0));
      p.stress = clampAttr(p.stress + (lodging.sideEffects.stress ?? 0));
      p.attrs.hygiene = clampAttr(p.attrs.hygiene + (lodging.sideEffects.hygiene ?? 0));
    }
  }

  // 5) 政府免费住宿倒计时（同一日第二次睡眠不重复消耗一晚）
  if (!alreadySettled) {
    if (state.living.mode === "gov" && !state.living.awayNight) {
      state.living.govDaysLeft--;
      if (state.living.govDaysLeft <= 0) {
        state.living.mode = "nightly";
        state.living.nightly = null;
        pushLog(state, "🏛️", "政府免费住宿已到期，今晚起要自己找地方住");
      }
    }

    // 5.5) 健康自然恢复（健康靠行动恢复；<20 持续恶化逼就医；按时睡有奖励）
    if (p.attrs.health < 20) {
      p.attrs.health = clampAttr(p.attrs.health - 1); // 持续恶化，逼就医
    }
    if (!stayedUp && hours >= 7 && hours <= 9) {
      p.attrs.health = clampAttr(p.attrs.health + 0.5); // 按时睡奖励
    }

    // 6) 自然结算
    if (stayedUp) p.attrs.health = clampAttr(p.attrs.health - 0.5);

    // 健康基础衰减（体力过低时加速）
    const healthDecay = 1 + (p.attrs.stamina < 20 ? 3 : 0);
    p.attrs.health = clampAttr(p.attrs.health - healthDecay);

    // 干净度每日下降
    p.attrs.hygiene = clampAttr(p.attrs.hygiene - 6);

    // 压力自然回落 15
    p.stress = clampAttr(p.stress - 15);

    // 抑郁状态（心情 < 20）：健康额外衰减
    if (p.attrs.mood < 20) {
      p.attrs.health = clampAttr(p.attrs.health - 1.5);
      p.lowMoodStreak++;
    } else {
      p.lowMoodStreak = 0;
    }

    // 饱腹：连续不吃东西的惩罚（当日吃过则清零）
    if (state.flags["ateToday"]) {
      p.hungryStreak = 0;
      state.flags["ateToday"] = false;
    } else {
      p.hungryStreak++;
    }
    if (p.hungryStreak >= 2) {
      p.attrs.health = clampAttr(p.attrs.health - 1.5);
      p.attrs.stamina = clampStamina(p.attrs.stamina - 5, maxStamina);
    }
  }

  if (hospitalNightsAfterSettlement !== undefined) {
    const recoveredEnough = p.attrs.health >= 85
      || (hospitalNightsAfterSettlement >= 3 && p.attrs.health >= 60);
    if (recoveredEnough) {
      state.flags["hospitalized"] = false;
      state.flags["hospitalNights"] = 0;
      pushLog(state, "🏥", "病情好转，办理出院了");
    }
  }

  // 7) 滚动租期到期时扣下一期租金；锚定自然日并受本次睡眠幂等保护。
  if (state.living.mode === "lease" && state.living.lease && !alreadySettled) {
    const lease = state.living.lease;
    const currentGameDay = gameDay(state.time);
    // 防御未经过存档迁移的旧运行时状态：把首期视为已经付清，再给完整 30 日权益。
    lease.nextRentDay ??= currentGameDay + LEASE_PERIOD_DAYS;
    // NaN/Infinity 和负数无法构成有效的日历游标；特别是 -Infinity 会让下面的 while 永远成立。
    if (!Number.isSafeInteger(lease.nextRentDay) || lease.nextRentDay < 0) {
      lease.nextRentDay = currentGameDay + LEASE_PERIOD_DAYS;
    }
    const anchorGameDay = gameDay(anchor);
    delete state.flags["lease_prepaid_month"];
    delete state.flags["lease_first_month_prepaid"];
    // 通常只结算一期；若系统日期被跳过，则补齐所有已到期租期，避免白住。
    while (lease.nextRentDay <= anchorGameDay) {
      const rent = lease.rent;
      p.money -= rent;
      recordMoney(state, -rent); // v1.10 周记
      if (p.money < 0) {
        pushLog(state, "🏠", `交房租 -${rent}，资金不足！`);
      } else {
        pushLog(state, "🏠", `交了房租 -${rent}，剩余 ${p.money} 元`);
      }
      const nextRent = computeNextRent(state);
      if (nextRent !== rent) {
        lease.rent = nextRent;
        lease.rentGrowthCount++;
        pushLog(state, "📈", `续租后房租涨至 ${nextRent} 元`);
      }
      const previousRentDay = lease.nextRentDay;
      lease.nextRentDay += LEASE_PERIOD_DAYS;
      if (!Number.isSafeInteger(lease.nextRentDay) || lease.nextRentDay <= previousRentDay) {
        lease.nextRentDay = anchorGameDay + LEASE_PERIOD_DAYS;
        break;
      }
    }
  }

  // 8) 月供结算（每月 20 号，按家庭条件；剧情模式的家里开销由主线卡承担，不再重复扣款）
  if (anchorDay === 20 && state.mode !== "story" && !alreadySettled) {
    const f = FAMILY_MAP.get(state.family);
    if (f && f.monthlyPayment !== 0) {
      p.money += f.monthlyPayment;
      recordMoney(state, f.monthlyPayment); // v1.10 周记
      pushLog(state, f.icon, f.monthlyNote ?? `月供 ${f.monthlyPayment > 0 ? "+" : ""}${f.monthlyPayment} 元`);
    }
  }

  // 工资和缺勤已在 advanceHours 的班末与发薪零点结算；睡眠只处理生活状态。

  if (!alreadySettled) {
    // 先执行逾期债务追扣/挂账，再按日终余额维护连续欠债天数，供破产结局判定。
    for (const l of tickLoans(state)) pushLog(state, "💰", l);
    p.debtStreak = p.debt > 0 ? Math.max(0, Math.floor(p.debtStreak ?? 0)) + 1 : 0;
  }

  // 资金为负天数连续判定必须放在工资、月供和房租全部结算之后，避免发薪日误记破产天数。
  if (!alreadySettled) {
    p.negativeMoneyStreak = p.money < 0 ? p.negativeMoneyStreak + 1 : 0;
  }

  // 8.6) 租用载具到期收回
  checkVehicleExpiry(state);

  // 8.6.1) 会籍月卡到期失效（v0.92：健身月卡过期 → 锻炼重新锁定）
  checkMembershipExpiry(state);

  // debuff 调和（睡觉 = 休息，2 晚解除肌肉劳损）
  if (!calendarOnly) reconcileStatuses(state, { slept: true, hoursSlept: hours, stayedUp, rested: true,medicalCare:hospitalized });

  // 8.6.3~8.9.5 均为每日一次的结算；同一天再次短睡只恢复体力/心情，不能重复推进生活系统。
  if (!alreadySettled) {
    // 8.6.3) v0.97 睡前收短信：每天至多一条（下班后的家人/朋友联系）
    maybeReceiveSms(state);

  // 8.6.4) v0.978 联系人定期教程/关照短信（棋谱教程/书法心得/编程技巧/组长窍门…）
  tickContactBenefits(state);

  // 8.6.5) v0.98 垃圾广告短信：每天 25% 概率
  maybeReceiveJunkSms(state);

  // 8.6.2) 生存指标惩罚结算（v0.92）：抑郁累计 / 健康归零倒计时 / 邋遢附加损伤
  // 放在 reconcileStatuses 之后，确保 sick 等基础状态先就位，再叠加抑郁判定。
  dailySurvivalSettlement(state, {
    preMood, // v1.215：抑郁判定用入睡前心情，避免睡眠 +8 抬高阈值
    upsertStatus: (id, severity) => upsertStatus(state, id, severity ?? 1),
    log: (icon, text) => pushLog(state, icon, text),
  });


  // 8.6.6) v0.985 塔罗：只有真的睡下才结束「晕倒后未睡」的观察窗（倒吊人只认硬撑不睡的那一次）
  // v1.43.1 修复（🔴）：triggerCollapse 会以 stayedUp:true 调用本函数（晕倒=强撑，并非入睡），
  // 旧代码无条件清除该 flag → 玩家下一次行动时 flag 已为 false →「倒吊人」永不点亮，
  // 连带需要集齐 0–20 的「世界」也无法解锁。仅在非 stayedUp 时清除。
  if (!stayedUp) state.flags.collapsed_not_slept = false;

  // 8.7) 结局判定（v0.9）：每晚结算后自动检查触发条件
  // v1.215 修复（P2-6）：剧情模式主线未终局时跳过这里——「第 360 天」等硬期限结局
  // 应交由下方剧情块内的 checkEnding 收尾，避免抢跑主线终局。
  // v1.215 哨兵语义：已结算且结局已触发时不再重复判定（防晕倒结算后当晚再睡重复打结局日志）；
  // 但「同日再睡且结局尚未触发」时仍需检查（如饿死结局在当晚第二次入睡才达成）。
  if ((!alreadySettled || !state.endingId) && !(state.mode === "story" && state.story.arc && !state.story.finalTriggered)) {
    const ended = checkEnding(state);
    if (ended) {
      pushLog(state, "🎬", `触发结局【${ended.name}】——${ended.desc}`);
    }
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
  }

  // 8.9.6) v1.0 剧情模式：失约/抽卡/赌鬼开销/超时 + 终局评级 + 结局判定
  if (!alreadySettled && state.mode === "story" && !state.endingId) {
    tickStory(state);
    decideStoryFinal(state);
    if (!state.endingId) {
      const ended2 = checkEnding(state);
      if (ended2) {
        pushLog(state, "🎬", `触发结局【${ended2.name}】——${ended2.desc}`);
      }
    }
  }

  // 8.10) v1.10 周记：每周日晚上睡觉时汇总本周数据并置 pending（UI 观察跳转周记页）
  // v1.215 语义：与月租/发薪/结局一致，同入睡日不重复结算——否则晕倒结算后当晚再睡会生成空周报覆盖真实数据
  if (!state.endingId && !alreadySettled) {
    weeklySettlement(state, anchor);
  }

  // v1.42：记录完整结算锚点；保留旧字段供旧版 UI/存档兼容读取。
  state.flags["settledAnchor"] = anchorKey;
  // 旧字段仍保留给旧版存档读取，但必须和 settledAnchor 使用同一个锚点日；
  // 熬夜跨午夜时不能把“新日”写进去，否则会拦掉新日第一次结算。
  state.flags["settledToday"] = anchorDay;
  state.flags["settledAtMinute"] = settlementMinute;
  state.flags["lastSleepHours"] = hours;

  const attrLabels: Record<string, string> = {
    stamina: "体力", health: "健康", mood: "心情", hygiene: "清洁", satiety: "饱腹", stress: "压力",
  };
  const attrChanges = Object.entries(attrLabels).flatMap(([key, label]) => {
    const before = attrsAtStart[key as keyof typeof attrsAtStart];
    const after = key === "stress" ? p.stress : p.attrs[key as keyof typeof p.attrs];
    const delta = Math.round((after - before) * 10) / 10;
    return delta === 0 ? [] : [`${label} ${delta > 0 ? "+" : ""}${delta}`];
  });
  if (attrChanges.length) pushLog(state, "🧾", `本次日结属性变化：${attrChanges.join("、")}`);
}

/** 醒着跨过午夜时，结算刚结束的自然日，避免小睡/等待绕开每日账单与生存变化。 */
function settlePreviousCalendarDay(state: GameState): void {
  const previous = fromLinearDay(linearDay(state.time) - 1);
  const previousKey = settlementAnchorKey(previous.year, previous.month, previous.day);
  const previousAlreadySettled = state.flags["settledAnchor"] === previousKey
    || state.flags["collapseSettledAnchor"] === previousKey
    || state.flags["settledToday"] === previous.day
    || state.flags["collapseSettledToday"] === previous.day;
  if (previousAlreadySettled) return;

  // 此时 state.time 已进入新日；沿用睡眠结算锚点，把账单归到刚结束的那天。
  state.time.stayedUp = true;
  sleepSettlement(state, { stayedUp: true, hours: 0, calendarOnly: true });
}

/** 返回本次入睡所属的自然日；跨午夜熬夜时回退到前一日（每月固定 30 天）。 */
function settlementAnchor(state: GameState): { year: number; month: number; day: number } {
  if (!state.time.stayedUp) {
    return { year: state.time.year, month: state.time.month, day: state.time.day };
  }
  const previous = state.time.day > 1
    ? { year: state.time.year, month: state.time.month, day: state.time.day - 1 }
    : state.time.month > 1
      ? { year: state.time.year, month: state.time.month - 1, day: 30 }
      : { year: state.time.year - 1, month: 12, day: 30 };

  // Midnight already settles this date. Sleeping afterward only restores rest;
  // it must not consume the unfinished current calendar day.
  return previous;
}

/** 年月日压缩为可存入 Flags 的数值键（游戏日期范围内保持安全整数）。 */
export function settlementAnchorKey(year: number, month: number, day: number): number {
  return year * 10000 + month * 100 + day;
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
  const total = Math.round(hour * 60 + minute);
  const clock = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}`;
}

export { PERIOD_ORDER };
