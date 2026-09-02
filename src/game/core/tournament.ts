/**
 * v1.33 P4 喵喵对决赛 + 耄耋之王：报名 / 门票 / 赛程 / 名次计算（纯逻辑层，可单测）。
 * - 论坛报名：自动扣门票费（20/50/100 三档）→ 背包固定刷新一张门票
 * - 赛程：每周日 14:00 在游乐场开赛；连胜 3 场（按档位对手池随机抽取）完赛
 * - 名次奖金：冠军 10× / 亚军 2× / 季军 1×；第 4 名起无奖金
 * - 终极耄耋对决：大师杯冠军解锁，精英车轮战 → 圆头猫咪
 * 战斗本身由 catBattle.ts 承担；本模块负责报名/赛程数据与赛事推进
 * （settleTournamentMatch 由 catBattle.settleBattle 调用，运行时引用无循环执行问题）。
 */
import type {
  CatOpponentTier,
  CatTournamentDef,
  CatTournamentEntry,
  GameState,
  RngState,
} from "../types";
import { pushLog } from "../engine";
import { addItem, removeItem } from "./items";
import { recordMoney } from "./weekly";
import { getAccessoryDef, rollAccessoryForTier, ACC_QUALITY_LABEL } from "./catAccessory";
import { gameDay, weekdayOf } from "./calendar";
import { randomInt } from "../rng";
import { activePetOf, catDowned } from "./catCare";
import { allOpponents, getBossDef, getTournamentDef, startBattle } from "./catBattle";

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** 门票物品：档位 id → 物品 id */
export const TICKET_ITEMS: Record<string, string> = {
  tournament_primary: "cat_ticket_primary",
  tournament_mid: "cat_ticket_mid",
  tournament_advanced: "cat_ticket_advanced",
  ultimate: "cat_ticket_ultimate",
};

/** 每档门票费（元）；从档位定义读取，此处仅做默认兜底 */
export const DEFAULT_FEES: Record<string, number> = {
  tournament_primary: 20,
  tournament_mid: 50,
  tournament_advanced: 100,
  ultimate: 0,
};

/** 周日开赛小时 */
export const MATCH_HOUR = 14;

/** 名次标签 */
export const RANK_LABEL: Record<number, string> = {
  1: "🥇 冠军",
  2: "🥈 亚军",
  3: "🥉 季军",
};

/* ------------------------------------------------------------------ *
 * 赛程工具
 * ------------------------------------------------------------------ */

/** 距最近一个周日开赛还有多少天（0 = 今天开赛，需 14:00 后） */
export function daysUntilMatchday(state: GameState): number {
  const w = weekdayOf(state.time);
  // weekdayOf：0=周一 … 6=周日；周日当天 = 0
  return ((6 - w) % 7 + 7) % 7;
}

/** 今天是否开赛日（周日） */
export function isMatchday(state: GameState): boolean {
  return weekdayOf(state.time) === 6;
}

/** 今天是否已过开赛时刻（周日 14:00 后） */
export function matchdayStarted(state: GameState): boolean {
  return isMatchday(state) && state.time.hour >= MATCH_HOUR;
}

/** 赛事报名是否已到期/可开赛（周日 14:00 后且报名已生效） */
export function tournamentLive(state: GameState): boolean {
  const entry = state.catTournament?.entry;
  if (!entry || entry.settled) return false;
  if (entry.started) return true;
  return matchdayStarted(state);
}

/* ------------------------------------------------------------------ *
 * 对手队列
 * ------------------------------------------------------------------ */

/** Fisher-Yates 洗牌（用主存档 rng，保证可复现） */
function shuffle<T>(arr: T[], rng: RngState): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(rng, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 按档位池构建对手队列：从 normal/intermediate/boss 池各随机抽取若干只（同场不重复），
 * 顺序随机；终极耄耋对决在末尾追加 Boss「圆头猫咪」（固定殿后）。
 */
export function buildOpponentQueue(state: GameState, tierId: string): string[] {
  const t = getTournamentDef(tierId);
  if (!t) return [];
  const picked: string[] = [];
  const tiers: CatOpponentTier[] = ["normal", "intermediate", "boss"];
  const total = totalPoolCount(t);
  for (const tier of tiers) {
    const count = t.pools[tier] ?? 0;
    if (count <= 0) continue;
    const candidates = allOpponents().filter((o) => o.tier === tier);
    for (const o of shuffle(candidates, state.rng)) {
      if (picked.length >= total || picked.includes(o.id)) continue;
      picked.push(o.id);
      if (picked.length >= total) break;
    }
  }
  const queue = shuffle(picked, state.rng); // 池内对手顺序随机
  if (t.ultimate) queue.push(getBossDef().id); // 终极赛圆头猫咪固定殿后
  return queue;
}

function totalPoolCount(t: CatTournamentDef): number {
  return (t.pools.normal ?? 0) + (t.pools.intermediate ?? 0) + (t.pools.boss ?? 0);
}

/* ------------------------------------------------------------------ *
 * 报名
 * ------------------------------------------------------------------ */

/** 报名资格检查（不修改状态），供 UI 展示禁用原因 */
export function signupCheck(state: GameState, tierId: string): { ok: boolean; reason?: string } {
  const t = getTournamentDef(tierId);
  if (!t) return { ok: false, reason: "未知赛事" };
  const entry = state.catTournament?.entry;
  if (entry && !entry.settled) {
    return { ok: false, reason: "已报名「" + (getTournamentDef(entry.tierId)?.name ?? "赛事") + "」，请先完赛" };
  }
  const pet = activePetOf(state);
  if (!pet) return { ok: false, reason: "先领养并携带一只猫咪再来报名" };
  if (catDowned(pet)) return { ok: false, reason: "「" + pet.name + "」生命值归零倒下了，先带它去宠物医院治疗" };
  if (pet.injured) return { ok: false, reason: "「" + pet.name + "」还受着伤，先带它去宠物医院治疗" };
  if (pet.level < (t.minLevel ?? 1)) {
    return { ok: false, reason: `需要猫咪等级 ≥ ${t.minLevel}（当前 Lv.${pet.level}）` };
  }
  if (t.ultimate && !state.catTournament?.ultimateUnlocked) {
    return { ok: false, reason: "赢得大师杯冠军后可解锁终极耄耋对决" };
  }
  if (state.player.money < t.fee) {
    return { ok: false, reason: `报名费 ${t.fee} 元不够（余额 ${state.player.money} 元）` };
  }
  return { ok: true };
}

/**
 * 论坛报名：扣门票费 → 发门票物品 → 生成对手队列 → 写入 catTournament.entry。
 */
export function signupTournament(state: GameState, tierId: string): { ok: boolean; reason?: string } {
  const t = getTournamentDef(tierId);
  if (!t) return { ok: false, reason: "未知赛事" };
  const check = signupCheck(state, tierId);
  if (!check.ok) return check;

  state.player.money -= t.fee;
  recordMoney(state, -t.fee);
  const ticketId = TICKET_ITEMS[tierId];
  if (ticketId) addItem(state, ticketId, 1);

  if (!state.catTournament) state.catTournament = { ultimateUnlocked: false, elderKing: false };
  const entry: CatTournamentEntry = {
    tierId,
    signupDay: gameDay(state.time),
    fee: t.fee,
    started: false,
    settled: false,
    roundIndex: 0,
    beaten: [],
    queue: buildOpponentQueue(state, tierId),
  };
  state.catTournament.entry = entry;

  const days = daysUntilMatchday(state);
  const startText = days === 0 ? "今天 14:00 开赛" : `${days} 天后（周日 14:00）开赛`;
  pushLog(state, "🎟️", `已报名「${t.name}」，扣报名费 ${t.fee} 元，门票已放入背包（${startText}）`);
  return { ok: true };
}

/** 门票是否可作废（开赛已过且未开赛 → 缺席作废）。调用方在开赛时确认。 */
export function expireTicketIfMissed(state: GameState): void {
  const entry = state.catTournament?.entry;
  if (!entry || entry.settled || entry.started) return;
  // 已过周日 14:00 仍未开赛，且报名发生在更早的日子（当天报名的仍可开赛）→ 作废不退款
  if (matchdayStarted(state) && entry.signupDay < gameDay(state.time)) {
    entry.settled = true;
    const t = getTournamentDef(entry.tierId);
    removeItem(state, TICKET_ITEMS[entry.tierId], 1);
    pushLog(state, "🎟️", `未在开赛时到场，「${t?.name ?? "赛事"}」门票作废（不退款）`);
  }
}

/* ------------------------------------------------------------------ *
 * 赛程进行
 * ------------------------------------------------------------------ */

/** 当前应挑战的对手 id（未开赛/已结束返回 undefined） */
export function currentOpponentId(state: GameState): string | undefined {
  const entry = state.catTournament?.entry;
  if (!entry || entry.settled || !entry.started) return undefined;
  if (entry.roundIndex >= entry.queue.length) return undefined;
  return entry.queue[entry.roundIndex];
}

/**
 * 在游乐场赛场开启赛事（到场即开赛，优先于缺席作废）：
 * 门票是否作废由其它入口（如论坛/移动）调用 expireTicketIfMissed 判定，
 * 玩家来到赛场按下「开赛」即视为到场，直接消耗门票开赛。
 */
export function startTournament(state: GameState): { ok: boolean; reason?: string } {
  const entry = state.catTournament?.entry;
  if (!entry || entry.settled) return { ok: false, reason: "当前没有待开赛的赛事报名" };
  if (!matchdayStarted(state)) {
    const days = daysUntilMatchday(state);
    return { ok: false, reason: days === 0 ? "开赛时间为周日 14:00" : `距开赛还有 ${days} 天（周日 14:00）` };
  }
  if (entry.started) return { ok: true };
  entry.started = true;
  entry.roundIndex = 0;
  removeItem(state, TICKET_ITEMS[entry.tierId], 1);
  const t = getTournamentDef(entry.tierId);
  pushLog(state, "🏟️", `「${t?.name ?? "赛事"}」开赛！连赢 ${entry.queue.length} 场即可夺冠，输一场即出局`);
  return { ok: true };
}

/** 开始当前赛程的下一场对决（开赛后才可用） */
export function startNextTournamentBattle(state: GameState): { ok: boolean; reason?: string } {
  const entry = state.catTournament?.entry;
  if (!entry || entry.settled || !entry.started) return { ok: false, reason: "赛事尚未开赛或已结束" };
  const oppId = currentOpponentId(state);
  if (!oppId) return { ok: false, reason: "没有下一场对手" };
  return startBattle(state, oppId, entry.tierId);
}

/**
 * 结算一场赛事对决（由 settleBattle 在战斗结束后调用）：
 * 胜 → 记录击败并推进下一场；完赛（全胜）→ 冠军结算。
 * 负 → 按当前连胜数出局结算名次。
 */
export function settleTournamentMatch(state: GameState, won: boolean): void {
  const entry = state.catTournament?.entry;
  if (!entry || entry.settled || !entry.started) return;
  const oppId = entry.queue[entry.roundIndex] ?? entry.queue[entry.queue.length - 1];
  if (won) {
    if (oppId && !entry.beaten.includes(oppId)) entry.beaten.push(oppId);
    entry.roundIndex += 1;
    if (entry.roundIndex >= entry.queue.length) {
      finalizeTournament(state, 1);
    }
  } else {
    finalizeTournament(state, rankFor(entry));
  }
}

/**
 * 赛事终局结算：写名次 + 奖金（冠军 10× / 亚军 2× / 季军 1×）+ 门票回收 + 解锁。
 * 大师杯夺冠 → 解锁终极耄耋对决；终极赛夺冠 → 获得「耄耋之王」称号。
 */
export function finalizeTournament(state: GameState, rank: number): void {
  const entry = state.catTournament?.entry;
  if (!entry || entry.settled) return;
  const t = getTournamentDef(entry.tierId);
  if (!t) {
    entry.settled = true;
    return;
  }
  const prize = prizeAmount(t, rank);
  entry.settled = true;
  entry.rank = rank;
  entry.prizeMoney = prize;
  if (state.catTournament) state.catTournament.lastRank = rank;
  if (prize > 0) {
    state.player.money += prize;
    recordMoney(state, prize);
  }
  if (rank === 1) {
    state.catFlags[`tournament_${entry.tierId}`] = true;
    if (entry.tierId === "tournament_advanced") {
      if (state.catTournament) state.catTournament.ultimateUnlocked = true;
      pushLog(state, "👑", "赢得大师杯冠军！「终极耄耋对决」已解锁！");
    }
    if (entry.tierId === "ultimate") {
      if (state.catTournament) state.catTournament.elderKing = true;
      state.catFlags["elder_king"] = true;
      pushLog(state, "👑", "击败圆头猫咪，成为「耄耋之王」！");
    }
    // v1.38 赛事冠军按档位掉落饰品（品质随档位提升）
    const accId = rollAccessoryForTier(state, entry.tierId);
    const acc = getAccessoryDef(accId);
    if (acc) {
      state.ownedAccessories[accId] = (state.ownedAccessories[accId] ?? 0) + 1;
      pushLog(state, acc.icon, `🏅 冠军饰品入手：${acc.name}（${ACC_QUALITY_LABEL[acc.quality]}），可在猫咪面板佩戴！`);
    }
  }
  removeItem(state, TICKET_ITEMS[entry.tierId], 1);
  const label = RANK_LABEL[rank] ?? `第 ${rank} 名`;
  pushLog(state, "🏆", `「${t.name}」落幕：${label}${prize > 0 ? `，奖金 ${prize} 元` : ""}`);
}

/** 剩余对手数量 */
export function remainingOpponents(state: GameState): number {
  const entry = state.catTournament?.entry;
  if (!entry || entry.settled) return 0;
  return entry.queue.length - entry.beaten.length;
}

/** 报名后到开赛的展示文案（门票标注倒计时用） */
export function ticketStatusText(state: GameState): string {
  const entry = state.catTournament?.entry;
  if (!entry) return "";
  const days = daysUntilMatchday(state);
  if (entry.settled) return "已结束";
  if (entry.started) return "进行中";
  if (days === 0) return "今天 14:00 开赛";
  return `距开赛还有 ${days} 天`;
}

/* ------------------------------------------------------------------ *
 * 名次与奖金
 * ------------------------------------------------------------------ */

/**
 * 在游乐场赛场按下「进入赛场」：未开赛且已到开赛时刻则开赛，随即开战。
 * 到场即优先（不触发缺席作废——缺席作废由论坛入口判定），玩家来到赛场即可开赛。
 */
export function enterTournamentArena(state: GameState): { ok: boolean; reason?: string; battleStarted?: boolean } {
  const entry = state.catTournament?.entry;
  if (!entry || entry.settled) return { ok: false, reason: "还没有有效的赛事报名，先去城市论坛报名吧" };
  if (!entry.started) {
    const r = startTournament(state);
    if (!r.ok) return r;
  }
  const next = startNextTournamentBattle(state);
  if (!next.ok) return next;
  return { ok: true, battleStarted: true };
}

/** 名次（1=冠军…）：全胜 = 1；否则按击败数倒排（3 场赛：胜 2=2 名 / 胜 1=3 名 / 全败=4 名） */
export function rankFor(entry: CatTournamentEntry): number {
  const wins = entry.beaten.length;
  if (wins >= entry.queue.length) return 1;
  return entry.queue.length + 1 - wins;
}

/** 某档位名次奖金（元）：门票 × 倍数；第 4 名起 0 */
export function prizeAmount(t: CatTournamentDef, rank: number): number {
  const mult = rank === 1 ? t.prize.champion : rank === 2 ? t.prize.second : rank === 3 ? t.prize.third : 0;
  return t.fee * mult;
}
