import type { GameState } from "../types";
import {buildFiveLaneChart} from '../../lib/rhythmChart';
import { applyEffects, pushLog } from "../engine";
import { chance, randomInt } from "../rng";
import {casinoRandomInt,shuffleCasinoCards} from './casinoRandom';
import { linearDay, fromLinearDay, isWeekend, gameDay } from "./calendar";
import { advanceHours } from "./time";
import { recordMoney } from "./weekly";
import { addItem } from "./items";
import { getLocation, isLocationOpen, isLocationVisible, isLocationUnlocked, autoExitIfClosed } from "./actions";
import { fameIncomeMult } from "./stats";
import { canWork } from "./survival";
import { scaleCost } from "./difficulty";
import { scaledDifficulty } from './minigame';
import {financialRiskAccess,recordFinancialEvent,applyFinancialSanctions,financialBanReason,financialStorageProblem} from './financialRisk';

export type CasinoGameKind = "blackjack" | "high_low" | "poker" | "slots" | "roulette_redblack" | "roulette_highlow" | "roulette_number";
export type CasinoRoom = "leisure" | "competition";
export type LeisureKind = CasinoGameKind | "claw" | "platform" | "dance" | "singing";
export type LeisureCheck = { ok: true } | { ok: false; reason: string };
export interface SessionBase {
  id: number;
  kind: LeisureKind;
  locationId: string;
  startedMinute: number;
  night: number;
  durationMinutes: number;
  paid: number;
  currency?: "cash" | "chips";
  room?: CasinoRoom;
  phase: "playing" | "ready";
  forfeited?: boolean;
}
export interface BlackjackSession extends SessionBase {
  kind: "blackjack";
  bet: number;
  deck: number[];
  cursor: number;
  player: number[];
  dealer: number[];
}
export interface PokerSession extends SessionBase {
  kind: "poker";
  bet: number;
  deck: number[];
  player: number[];
  dealer: number[];
  board: number[];
  continued: boolean;
}
export interface CasinoSession extends SessionBase {
  kind: Exclude<CasinoGameKind, "blackjack" | "poker">;
  bet: number;
  currency: "chips";
  room: CasinoRoom;
  choice: "red" | "black" | "low" | "high" | number;
  outcome: number[];
}
export const PLUSH_IDS = ["plush_bear", "plush_rabbit", "plush_cat", "plush_panda", "plush_dinosaur"] as const;
export interface ClawSession extends SessionBase {
  kind: "claw";
  position: number;
  success: boolean;
  plushId: typeof PLUSH_IDS[number];
}
export interface PlatformSession extends SessionBase {
  kind: "platform";
  elapsedMs: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  lives: number;
  checkpoint: number;
  invulnerableMs: number;
  collected: number[];
  defeated: number[];
  complete: boolean;
}
export interface DanceNote { atMs: number; lane: 0 | 1 | 2 | 3 | 4; status: "pending" | "hit" | "miss"; precision?:number }
export interface DanceSession extends SessionBase {
  chartVersion?: 2;
  combo?: number;
  kind: "dance" | "singing";
  track: number;
  elapsedMs: number;
  lengthMs: number;
  hitWindowMs: number;
  notes: DanceNote[];
  /** A singing session locks its disclosed income at admission, before fame changes. */
  incomeBase?: number;
  strayHits?:number;
}
export type LeisureSession = BlackjackSession | PokerSession | CasinoSession | ClawSession | PlatformSession | DanceSession;
export interface LeisureResult {
  id: number;
  kind: LeisureKind;
  summary: string;
  moneyDelta: number;
  payout: number;
  chipDelta?: number;
  moodDelta: number;
  staminaDelta: number;
  durationMinutes: number;
  itemId?: string;
  won?: boolean;
  perfect?: boolean;
}
export interface DistrictLeisureState {
  nextSessionId: number;
  active: LeisureSession | null;
  lastResult?: LeisureResult;
  dancePerfectNight?: number;
  danceDrinkClaimedNight?: number;
  singingLastDay?: number;
  casinoChips?: number;
  casinoGiftNight?: number;
  casinoSnackNight?: number;
  casinoRoom?: CasinoRoom;
}
export interface LeisureStartOptions { bet?: number; track?: number; currency?: "cash" | "chips"; room?: CasinoRoom; choice?: CasinoSession["choice"] }
export type LeisureInput =
  | { type: "hit" | "stand" | "fold" | "continue" | "grab" | "reveal" | "forfeit" }
  | { type: "claw_move"; delta: number }
  | { type: "platform_tick"; dtMs: number; move: -1 | 0 | 1; jump?: boolean }
  | { type: "dance_tick"; dtMs: number }
  | { type: "dance_hit"; lane: 0 | 1 | 2 | 3 | 4 };

const PLACE: Record<LeisureKind, string> = {
  blackjack: "boyue_texas_shop", high_low: "boyue_texas_shop", poker: "boyue_texas_shop", slots: "boyue_texas_shop",
  roulette_redblack: "boyue_texas_shop", roulette_highlow: "boyue_texas_shop", roulette_number: "boyue_texas_shop", claw: "boyue_arcade",
  platform: "boyue_arcade", dance: "boyue_nightclub",
  singing: "boyue_lounge_bar",
};
const DURATION: Record<LeisureKind, number> = { blackjack: 5, high_low: 5, poker: 10, slots: 5, roulette_redblack: 5, roulette_highlow: 5, roulette_number: 5, claw: 5, platform: 30, dance: 30, singing: 180 };
const GAME_LABEL: Record<LeisureKind, string> = { blackjack:"21点", high_low:"比大小", poker:"对庄德州", slots:"老虎机", roulette_redblack:"押红黑", roulette_highlow:"押大小", roulette_number:"押单号", claw:"抓娃娃", platform:"跃过泊月街", dance:"五轨舞蹈", singing:"清吧驻唱" };
const DANCE_TRACK_CONFIG = [
  { name: "月色步调", noteCount: 48, intervalMs: 600 },
  { name: "霓虹街拍", noteCount: 56, intervalMs: 500 },
  { name: "泊月律动", noteCount: 64, intervalMs: 430 },
] as const;
export const DANCE_TRACKS = DANCE_TRACK_CONFIG.map(({ name }) => name);
export function districtArcadeCost(state: GameState): number { return scaleCost(state, 5); }
const nowMinute = (state: GameState) => linearDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
export function districtLeisureNight(state: GameState): number {
  return linearDay(state.time) - (state.time.hour < 6 ? 1 : 0);
}
function data(state: GameState): DistrictLeisureState {
  return state.districtLeisure ??= { nextSessionId: 1, active: null };
}
const CASINO_KINDS: CasinoGameKind[] = ["blackjack", "high_low", "poker", "slots", "roulette_redblack", "roulette_highlow", "roulette_number"];
function isCasinoKind(kind: LeisureKind): kind is CasinoGameKind { return CASINO_KINDS.includes(kind as CasinoGameKind); }
function validRoom(room: unknown): room is CasinoRoom { return room === "leisure" || room === "competition"; }
export const CASINO_ROOMS = {
  leisure: { name: "新手场", minBet: 50, maxBet: 500, entryFee: 0 },
  competition: { name: "高级场", minBet: 1000, maxBet: 50000, entryFee: 50 },
} as const;
export function casinoBetRange(room: CasinoRoom): [number, number] {
  return [CASINO_ROOMS[room].minBet, CASINO_ROOMS[room].maxBet];
}
/** 旧档未结束的低额牌局继续结算，新开的牌局只使用当前范围。 */
function savedCasinoBetValid(room: CasinoRoom, bet: number): boolean {
  return Number.isSafeInteger(bet) && bet >= (room === 'leisure' ? 20 : 200) && bet <= CASINO_ROOMS[room].maxBet;
}
function casinoAtShop(state: GameState): boolean { return state.locationId === "boyue_texas_shop"; }
/** 每个营业夜首次进场赠送筹码；高级场门票按次支付。 */
export function enterCasinoRoom(state: GameState, room: CasinoRoom): LeisureCheck {
  const risk=financialRiskAccess(state,'casino');if(!risk.ok)return risk;
  if (!validRoom(room)) return { ok: false, reason: "请选择有效场次" };
  if (!casinoAtShop(state) || !isLocationOpen(getLocation("boyue_texas_shop")!, state.time.hour + state.time.minute / 60, state)) return { ok: false, reason: "小店当前未营业" };
  if (!isWeekend(fromLinearDay(districtLeisureNight(state)))) return { ok: false, reason: "牌桌只在周末营业夜开放" };
  if (state.districtLeisure?.active) return { ok: false, reason: "请先完成当前牌局" };
  const s = data(state), fee = CASINO_ROOMS[room].entryFee;
  if (state.player.money < fee) return { ok: false, reason: "高级场门票需要 50 元" };
  if (fee) { state.player.money -= fee; recordMoney(state, -fee); }
  s.casinoRoom = room;
  if (s.casinoGiftNight !== districtLeisureNight(state)) {
    s.casinoChips = (s.casinoChips ?? 0) + 100;
    s.casinoGiftNight = districtLeisureNight(state);
    pushLog(state, "🎟️", "本营业夜首次入场，获赠 100 筹码。");
  }
  pushLog(state, "♠", `${CASINO_ROOMS[room].name}入场${fee ? `，支付 ${fee} 元门票` : ""}。`);
  return { ok: true };
}
export function leaveCasinoRoom(state: GameState): void { if (state.districtLeisure) delete state.districtLeisure.casinoRoom; }
export function buyCasinoChips(state: GameState, cash: number): LeisureCheck {
  const risk=financialRiskAccess(state,'casino');if(!risk.ok)return risk;
  if (!casinoAtShop(state) || !Number.isSafeInteger(cash) || cash < 1) return { ok: false, reason: "请输入至少 1 元的整数金额" };
  if (state.districtLeisure?.active || state.player.money < cash) return { ok: false, reason: state.districtLeisure?.active ? "牌局进行中不能兑换" : "余额不足" };
  state.player.money -= cash; recordMoney(state, -cash); data(state).casinoChips = (data(state).casinoChips ?? 0) + cash * 5;
  pushLog(state, "🪙", `支付 ${cash} 元，兑换 ${cash * 5} 筹码。`); return { ok: true };
}
export function redeemCasinoChips(state: GameState, chips: number): LeisureCheck {
  const risk=financialRiskAccess(state,'casino');if(!risk.ok)return risk;
  if (!casinoAtShop(state) || !Number.isSafeInteger(chips) || chips < 5 || chips % 5 !== 0) return { ok: false, reason: "筹码需按 5 的倍数兑换" };
  if (state.districtLeisure?.active || (state.districtLeisure?.casinoChips ?? 0) < chips) return { ok: false, reason: state.districtLeisure?.active ? "牌局进行中不能兑换" : "筹码不足" };
  data(state).casinoChips = (data(state).casinoChips ?? 0) - chips; const cash = chips / 5; state.player.money += cash; recordMoney(state, cash);
  pushLog(state, "🪙", `兑换 ${chips} 筹码，收到 ${cash} 元。`); return { ok: true };
}
export function takeCasinoSnack(state: GameState): LeisureCheck {
  const risk=financialRiskAccess(state,'casino');if(!risk.ok)return risk;
  if (!casinoAtShop(state) || !isLocationOpen(getLocation("boyue_texas_shop")!, state.time.hour + state.time.minute / 60, state)) return { ok: false, reason: "小店当前未营业" };
  if (state.districtLeisure?.active) return { ok: false, reason: "牌局进行中不能取餐" };
  const s = data(state), night = districtLeisureNight(state);
  if (s.casinoSnackNight === night) return { ok: false, reason: "本营业夜的免费小吃已经领取" };
  s.casinoSnackNight = night; applyEffects(state, { satiety: 8 }, "🥟"); pushLog(state, "🥟", "领了一份免费小吃，垫了垫肚子。"); return { ok: true };
}
export function hasPerfectDanceDrink(state: GameState): boolean {
  const s = state.districtLeisure, night = districtLeisureNight(state);
  return !!s && s.dancePerfectNight === night && s.danceDrinkClaimedNight !== night;
}
/** Call only after the bar's own admission/stock checks succeed. No cash is awarded here. */
export function consumePerfectDanceDrink(state: GameState): boolean {
  if (!hasPerfectDanceDrink(state)) return false;
  data(state).danceDrinkClaimedNight = districtLeisureNight(state);
  return true;
}
function operatingMinutesLeft(state: GameState, kind: LeisureKind): number {
  const hour = state.time.hour + state.time.minute / 60;
  const loc = getLocation(PLACE[kind]);
  const hours = loc?.openHours;
  if (!hours) return Infinity;
  if (hours.start > hours.end) return (hour >= hours.start ? 24 - hour + hours.end : hours.end - hour) * 60;
  return (hours.end - hour) * 60;
}
export function canUseDistrictLeisure(state: GameState, kind: LeisureKind): LeisureCheck {
  if (!Object.prototype.hasOwnProperty.call(PLACE, kind)) return { ok: false, reason: "未知娱乐项目" };
  // UI derived values call this query; durable reconciliation belongs to commands.
  if(isCasinoKind(kind)){
    const reason=financialBanReason(state,'casino');if(reason)return{ok:false,reason};
    if(state.financialRisk?.storageBlocked)return{ok:false,reason:financialStorageProblem()};
  }
  if (state.districtLeisure?.active) return { ok: false, reason: "先完成或恢复当前娱乐会话" };
  if (state.endingId) return { ok: false, reason: "本局已经结束" };
  if (state.flags.hospitalized) return { ok: false, reason: "住院期间不能参加娱乐" };
  if (state.work?.active) return { ok: false, reason: "请先完成当前工作班次" };
  if (state.locationId !== PLACE[kind]) return { ok: false, reason: "请先到对应娱乐场所" };
  const loc = getLocation(PLACE[kind]);
  if (!loc || !isLocationUnlocked(state, loc) || !isLocationVisible(state, loc) || !isLocationOpen(loc, state.time.hour + state.time.minute / 60, state)) {
    return { ok: false, reason: "当前不在营业时段" };
  }
  // Explicitly preserve the weekend-night owner date for both card games.
  if (isCasinoKind(kind) && !isWeekend(fromLinearDay(districtLeisureNight(state)))) {
    return { ok: false, reason: "牌桌只在周末营业夜开放" };
  }
  if (operatingMinutesLeft(state, kind) + 1e-7 < DURATION[kind]) return { ok: false, reason: `距打烊不足 ${DURATION[kind]} 分钟，请下次再来` };
  if (kind === "dance" && state.player.attrs.stamina < 10) return { ok: false, reason: "跳舞需要至少 10 点体力" };
  if (kind === "singing") {
    if (state.player.stats.charm < 25) return { ok: false, reason: "驻唱需要魅力 25" };
    if (state.statuses.some(s => s.id === "sick")) return { ok: false, reason: "生病时不能驻唱" };
    const work = canWork(state); if (!work.ok) return { ok: false, reason: work.reason ?? "当前不能驻唱" };
    if (state.districtLeisure?.singingLastDay === gameDay(state.time)) return { ok: false, reason: "今天已经驻唱过，每日只能演出一次" };
  }
  return { ok: true };
}
export function shuffledLeisureDeck(_state?: GameState): number[] {
  return shuffleCasinoCards(Array.from({length:52},(_,i)=>i));
}
function randomCasinoOutcome(kind:Exclude<CasinoGameKind,'blackjack'|'poker'>):number[]{
  if(kind==='high_low'){const deck=shuffledLeisureDeck();return[cardRank(deck[0]),cardRank(deck[1])];}
  return kind==='slots'?Array.from({length:3},()=>casinoRandomInt(0,5)):[casinoRandomInt(0,36)];
}

/** Compatibility entry: a paid round is immutable across load/list/import/preview. */
export function refreshLoadedCasinoRandomness(_state:GameState):void{}
export const cardRank = (card: number) => card % 13 + 2;
export function cardLabel(card: number): string {
  const rank = cardRank(card);
  return `${["♣", "♦", "♥", "♠"][Math.floor(card / 13)]}${rank <= 10 ? rank : ["J", "Q", "K", "A"][rank - 11]}`;
}
export function blackjackValue(cards: number[]): { total: number; soft: boolean; natural: boolean } {
  let total = 0, aces = 0;
  for (const card of cards) { const r = cardRank(card); if (r === 14) { total++; aces++; } else total += Math.min(r, 10); }
  const soft = aces > 0 && total + 10 <= 21;
  if (soft) total += 10;
  return { total, soft, natural: cards.length === 2 && total === 21 };
}
function straightHigh(ranks: number[]): number {
  for (let high = 14; high >= 5; high--) if ([0, 1, 2, 3, 4].every(j => ranks.includes(high - j === 1 ? 14 : high - j))) return high;
  return 0;
}
function handKey(category: number, ranks: number[]): number {
  let key = category;
  for (let i = 0; i < 5; i++) key = key * 15 + (ranks[i] ?? 0);
  return key;
}
export const POKER_HAND_NAMES = ["高牌", "一对", "两对", "三条", "顺子", "同花", "葫芦", "四条", "同花顺"] as const;
/** Normal best-five comparison. No qualifications, balancing rolls, or money-dependent cards. */
export function evaluatePokerHand(cards: number[]): { category: number; key: number; name: string } {
  const count = Array<number>(15).fill(0), suits: number[][] = [[], [], [], []];
  for (const c of cards) { count[cardRank(c)]++; suits[Math.floor(c / 13)].push(cardRank(c)); }
  const ranks: number[] = [];
  for (let r = 14; r >= 2; r--) if (count[r]) ranks.push(r);
  const result = (category: number, r: number[]) => ({ category, key: handKey(category, r), name: POKER_HAND_NAMES[category] });
  const flush = suits.find(s => s.length >= 5)?.sort((a, b) => b - a);
  if (flush && straightHigh(flush)) return result(8, [straightHigh(flush)]);
  const groups = ranks.slice().sort((a, b) => count[b] - count[a] || b - a), first = groups[0];
  if (count[first] === 4) return result(7, [first, ranks.find(r => r !== first) ?? 0]);
  if (count[first] === 3) { const pair = groups.find(r => r !== first && count[r] >= 2); if (pair) return result(6, [first, pair]); }
  if (flush) return result(5, flush.slice(0, 5));
  const straight = straightHigh(ranks); if (straight) return result(4, [straight]);
  if (count[first] === 3) return result(3, [first, ...ranks.filter(r => r !== first).slice(0, 2)]);
  const pairs = ranks.filter(r => count[r] === 2);
  if (pairs.length >= 2) return result(2, [pairs[0], pairs[1], ranks.find(r => r !== pairs[0] && r !== pairs[1]) ?? 0]);
  if (pairs.length === 1) return result(1, [pairs[0], ...ranks.filter(r => r !== pairs[0]).slice(0, 3)]);
  return result(0, ranks.slice(0, 5));
}
const RED_WHEEL = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const SLOT_MULTIPLIERS = [3, 5, 8, 14, 22, 40] as const;
export const SLOT_SYMBOLS = ["🍒", "🍋", "🔔", "🍀", "💎", "7️⃣"] as const;
function casinoOutcomeLabel(s: CasinoSession): string {
  if (s.kind === "high_low") return `你抽到 ${s.outcome[0]}，庄家抽到 ${s.outcome[1]}`;
  if (s.kind === "slots") return s.outcome.map(i => SLOT_SYMBOLS[i] ?? "？").join("　");
  return `转出 ${s.outcome[0]} · ${s.outcome[0] === 0 ? "绿" : RED_WHEEL.has(s.outcome[0]) ? "红" : "黑"}`;
}
export function startDistrictLeisure(state: GameState, kind: LeisureKind, options: LeisureStartOptions = {}): LeisureCheck {
  if(isCasinoKind(kind)){const risk=financialRiskAccess(state,'casino');if(!risk.ok)return risk;}
  const check = canUseDistrictLeisure(state, kind); if (!check.ok) return check;
  const bet = options.bet ?? 20;
  const currency = options.currency ?? "cash";
  const casinoRoom = options.room ?? state.districtLeisure?.casinoRoom;
  if (isCasinoKind(kind) && currency === "chips") {
    if (!validRoom(casinoRoom)) return { ok: false, reason: "请先选择新手场或高级场" };
    const [minBet, maxBet] = casinoBetRange(casinoRoom);
    if (!Number.isSafeInteger(bet) || bet < minBet || bet > maxBet) return { ok: false, reason: `本场下注需为 ${minBet}—${maxBet} 筹码` };
    if (kind === "blackjack" && bet % 2 !== 0) return { ok: false, reason: "21点底注请使用偶数筹码，以便完整结算天然21点的2.5倍返还" };
  } else if (isCasinoKind(kind)) {
    if (!(["blackjack", "poker"] as LeisureKind[]).includes(kind) || !Number.isSafeInteger(bet) || bet < 20 || bet > (kind === "poker" ? 1000 : 2000)) return { ok: false, reason: "请在赌场兑换筹码后入桌" };
  }
  if ((kind === "dance" || kind === "singing") && (!Number.isInteger(options.track ?? 0) || (options.track ?? 0) < 0 || (options.track ?? 0) >= DANCE_TRACKS.length)) return { ok: false, reason: "请选择有效曲目" };
  if ((kind === "high_low" || kind === "roulette_highlow") && !["high", "low"].includes(String(options.choice ?? "high"))) return { ok: false, reason: "请选择大或小" };
  if (kind === "roulette_redblack" && !["red", "black"].includes(String(options.choice ?? "red"))) return { ok: false, reason: "请选择红或黑" };
  if (kind === "roulette_number" && (!Number.isInteger(options.choice) || (options.choice as number) < 0 || (options.choice as number) > 36)) return { ok: false, reason: "请选择 0—36 的单个号码" };
  const casino = isCasinoKind(kind);
  const paid = casino ? bet : kind === "dance" || kind === "singing" ? 0 : districtArcadeCost(state);
  if (casino && currency === "chips") {
    const needed = kind === "poker" ? bet * 2 : bet;
    if ((state.districtLeisure?.casinoChips ?? 0) < needed) return { ok: false, reason: kind === "poker" ? "筹码不足以承担底注和追加注" : "筹码不足" };
  } else if (state.player.money < (kind === "poker" ? bet * 2 : paid)) return { ok: false, reason: kind === "poker" ? "余额不足以承担底注和追加注" : "余额不足" };
  let casinoDeck:number[]|undefined,casinoOutcome:number[]|undefined;
  if(casino)try{
    if(kind==='blackjack'||kind==='poker')casinoDeck=shuffledLeisureDeck();
    else casinoOutcome=randomCasinoOutcome(kind as Exclude<CasinoGameKind,'blackjack'|'poker'>);
  }catch{return{ok:false,reason:'当前环境无法生成随机牌局，请重新打开游戏后再试'};}
  if(casino&&!recordFinancialEvent(state,'casino'))return{ok:false,reason:financialStorageProblem()};
  const s = data(state), base = { id: s.nextSessionId++, locationId: PLACE[kind], startedMinute: nowMinute(state), night: districtLeisureNight(state), durationMinutes: DURATION[kind], paid, phase: "playing" as const, ...(casino && currency === "chips" ? { currency: "chips" as const, room: casinoRoom } : {}) };
  delete s.lastResult;
  if (casino && currency === "chips") s.casinoChips = (s.casinoChips ?? 0) - paid;
  else { state.player.money -= paid; if (paid) recordMoney(state, -paid); }
  if (kind === "blackjack" || kind === "poker") {
    const deck = casinoDeck!, player = [deck[0], deck[2]], dealer = [deck[1], deck[3]];
    if (kind === "blackjack") s.active = { ...base, kind, bet, deck, player, dealer, cursor: 4, phase: blackjackValue(player).natural || blackjackValue(dealer).natural ? "ready" : "playing" };
    else s.active = { ...base, kind, bet, deck, player, dealer, board: deck.slice(4, 9), continued: false };
  } else if (casino && currency === "chips") {
    const kindCasino = kind as Exclude<CasinoGameKind, "blackjack" | "poker">;
    const choice = options.choice ?? (kind === "slots" ? 0 : kind === "roulette_number" ? 0 : "high");
    const outcome=casinoOutcome!;
    s.active = { ...base, kind: kindCasino, bet, currency: "chips", room: casinoRoom!, choice: choice as CasinoSession["choice"], outcome };
  } else if (kind === "claw") s.active = { ...base, kind, position: 0.5, success: chance(state.rng, 0.05), plushId: PLUSH_IDS[randomInt(state.rng, 0, 4)] };
  else if (kind === "platform") s.active = { ...base, kind, elapsedMs: 0, x: 50, y: 300, vx: 0, vy: 0, grounded: true, lives: 3, checkpoint: 0, invulnerableMs: 0, collected: [], defeated: [], complete: false };
  else if (kind === "dance" || kind === "singing") {
    const track = options.track ?? 0;
    const trackConfig = DANCE_TRACK_CONFIG[track as 0 | 1 | 2];
    if (!trackConfig) return { ok: false, reason: "请选择有效曲目" };
    const notes = buildFiveLaneChart(trackConfig.noteCount,trackConfig.intervalMs,1800,()=>randomInt(state.rng,0,999999)/1000000)
      .map(n=>({atMs:n.hitAt,lane:n.track as DanceNote['lane'],status:'pending' as const}));
    const lastNote = notes[notes.length - 1];
    if (!lastNote) return { ok: false, reason: "曲目生成失败" };
    const incomeBase = kind === "singing"
      ? Math.min(66, Math.round((18 + Math.min(25, 0.25 * (state.player.stats.charm + state.player.stats.fame))) * fameIncomeMult(state)))
      : undefined;
    if (kind === "singing") s.singingLastDay = gameDay(state.time);
    s.active = { ...base, kind, track, chartVersion:2,combo:0,elapsedMs: 0, lengthMs: lastNote.atMs + 1200, hitWindowMs: Math.round((125 + Math.max(0, Math.min(100, state.player.stats.charm)) * .15)*scaledDifficulty(state)), notes, incomeBase, strayHits:0 };
  } else return { ok: false, reason: "当前游戏无法开局" };
  pushLog(state, "🎮", `开始${GAME_LABEL[kind]}${paid ? `，${casino && currency === "chips" ? `支付 ${paid} 筹码` : `支付 ${paid} 元`}` : ""}；关闭界面可以稍后恢复。`);
  return { ok: true };
}

export const PLATFORM_LEVEL = {
  width: 2400, height: 420, playerSize: 30, limitMs: 120000,
  platforms: [{ x: 0, y: 330, width: 380 }, { x: 480, y: 290, width: 220 }, { x: 820, y: 250, width: 180 }, { x: 1110, y: 310, width: 250 }, { x: 1510, y: 270, width: 210 }, { x: 1830, y: 330, width: 570 }],
  coins: [{ x: 220, y: 275 }, { x: 535, y: 235 }, { x: 640, y: 235 }, { x: 890, y: 195 }, { x: 1190, y: 255 }, { x: 1320, y: 255 }, { x: 1580, y: 215 }, { x: 1880, y: 275 }, { x: 2140, y: 275 }, { x: 2310, y: 275 }],
  enemies: [{ min: 520, max: 650, y: 266 }, { min: 1160, max: 1310, y: 286 }, { min: 1950, max: 2150, y: 306 }],
};
export function platformEnemyPositions(s: PlatformSession): Array<{ x: number; y: number; defeated: boolean }> {
  return PLATFORM_LEVEL.enemies.map((e, i) => { const span = e.max - e.min, t = (s.elapsedMs / 1000 * 55 + i * 40) % (2 * span); return { x: e.min + (t < span ? t : 2 * span - t), y: e.y, defeated: s.defeated.includes(i) }; });
}
function platformLoseLife(s: PlatformSession): void {
  if (s.invulnerableMs > 0) return;
  s.lives--; if (s.lives <= 0) { s.phase = "ready"; return; }
  const p = PLATFORM_LEVEL.platforms[s.checkpoint]; s.x = p.x + 30; s.y = p.y - 30; s.vx = 0; s.vy = 0; s.grounded = true; s.invulnerableMs = 1500;
}
function platformTick(s: PlatformSession, input: Extract<LeisureInput, { type: "platform_tick" }>): void {
  const dt = Math.max(0, Math.min(50, input.dtMs)); if (!Number.isFinite(dt) || ![-1, 0, 1].includes(input.move)) return;
  const sec = dt / 1000, previousBottom = s.y + 30;
  s.elapsedMs += dt; s.invulnerableMs = Math.max(0, s.invulnerableMs - dt); s.vx = input.move * 190;
  if (input.jump && s.grounded) { s.vy = -440; s.grounded = false; }
  s.x = Math.max(0, Math.min(PLATFORM_LEVEL.width - 30, s.x + s.vx * sec)); s.vy += 920 * sec; s.y += s.vy * sec; s.grounded = false;
  PLATFORM_LEVEL.platforms.forEach((p, i) => { if (s.vy >= 0 && previousBottom <= p.y + 1 && s.y + 30 >= p.y && s.x + 30 > p.x && s.x < p.x + p.width) { s.y = p.y - 30; s.vy = 0; s.grounded = true; s.checkpoint = Math.max(s.checkpoint, i); } });
  PLATFORM_LEVEL.coins.forEach((c, i) => { if (!s.collected.includes(i) && Math.abs(s.x + 15 - c.x) < 28 && Math.abs(s.y + 15 - c.y) < 28) s.collected.push(i); });
  platformEnemyPositions(s).forEach((e, i) => { if (!e.defeated && Math.abs(s.x + 15 - e.x - 12) < 27 && Math.abs(s.y + 15 - e.y - 12) < 27) { if (s.vy > 0 && previousBottom <= e.y + 12) { s.defeated.push(i); s.vy = -280; } else platformLoseLife(s); } });
  if (s.y > PLATFORM_LEVEL.height + 30) { s.invulnerableMs = 0; platformLoseLife(s); }
  if (s.x >= PLATFORM_LEVEL.width - 60) { s.complete = true; s.phase = "ready"; }
  if (s.elapsedMs >= PLATFORM_LEVEL.limitMs) s.phase = "ready";
}
export function stepDistrictLeisure(state: GameState, sessionId: number, input: LeisureInput): LeisureCheck {
  const s = state.districtLeisure?.active;
  if (!s || s.id !== sessionId) return { ok: false, reason: "娱乐会话已变化，请恢复当前进度" };
  if (s.phase !== "playing") return { ok: false, reason: "本轮已完成，请结算" };
  if (state.locationId !== s.locationId || state.flags.hospitalized || state.endingId) return { ok: false, reason: "当前无法继续娱乐" };
  const casinoInput=isCasinoKind(s.kind)&&(input.type==='forfeit'||s.kind==='blackjack'&&['hit','stand'].includes(input.type)||s.kind==='poker'&&['fold','continue'].includes(input.type)||s.kind!=='blackjack'&&s.kind!=='poker'&&input.type==='reveal');
  if(casinoInput){
    const risk=financialRiskAccess(state,'casino');if(!risk.ok)return risk;
    if(s.kind==='poker'&&input.type==='continue'&&(s.currency==='chips'?(state.districtLeisure?.casinoChips??0)<s.bet:state.player.money<s.bet))return{ok:false,reason:'余额或筹码不足以追加底注，可以弃牌'};
    if(!recordFinancialEvent(state,'casino'))return{ok:false,reason:financialStorageProblem()};
  }
  if (input.type === "forfeit") { s.forfeited = true; s.phase = "ready"; return { ok: true }; }
  if (s.kind === "blackjack" && (input.type === "hit" || input.type === "stand")) {
    if (input.type === "hit") {
      const card = s.deck[s.cursor];
      if (s.cursor >= s.deck.length || !Number.isInteger(card) || card < 0 || card >= 52) s.phase = "ready";
      else { s.player.push(card); s.cursor++; if (blackjackValue(s.player).total >= 21) s.phase = "ready"; }
    }
    else s.phase = "ready";
    if (s.phase === "ready" && blackjackValue(s.player).total <= 21) {
      while (s.cursor < s.deck.length && blackjackValue(s.dealer).total < 17) {
        const card = s.deck[s.cursor];
        if (!Number.isInteger(card) || card < 0 || card >= 52) break;
        s.dealer.push(card); s.cursor++;
      }
    }
  } else if (s.kind === "poker" && (input.type === "fold" || input.type === "continue")) {
    if (input.type === "continue") {
      if (s.currency === "chips") {
        if ((state.districtLeisure?.casinoChips ?? 0) < s.bet) return { ok: false, reason: "筹码不足以追加同额底注，可以弃牌" };
        data(state).casinoChips = (data(state).casinoChips ?? 0) - s.bet;
      } else {
        if (state.player.money < s.bet) return { ok: false, reason: "余额不足以追加同额底注，可以弃牌" };
        state.player.money -= s.bet; recordMoney(state, -s.bet);
      }
      s.paid += s.bet; s.continued = true;
    }
    s.phase = "ready";
  } else if (s.kind === "claw" && input.type === "claw_move") {
    if (!Number.isFinite(input.delta)) return { ok: false, reason: "无效移动" };
    s.position = Math.max(0, Math.min(1, s.position + Math.max(-0.12, Math.min(0.12, input.delta))));
  } else if (s.kind === "claw" && input.type === "grab") s.phase = "ready";
  else if (isCasinoKind(s.kind) && s.kind !== "blackjack" && s.kind !== "poker" && input.type === "reveal") s.phase = "ready";
  else if (s.kind === "platform" && input.type === "platform_tick") platformTick(s, input);
  else if ((s.kind === "dance" || s.kind === "singing") && input.type === "dance_tick") {
    if (!Number.isFinite(input.dtMs) || input.dtMs < 0) return { ok: false, reason: "无效节拍" };
    s.elapsedMs += Math.min(100, input.dtMs);
    for (const note of s.notes) if (note.status === "pending" && s.elapsedMs > note.atMs + s.hitWindowMs) {note.status = "miss";s.combo=0;}
    if (s.elapsedMs >= s.lengthMs) s.phase = "ready";
  } else if ((s.kind === "dance" || s.kind === "singing") && input.type === "dance_hit") {
    if (![0, 1, 2, 3, 4].includes(input.lane)) return { ok: false, reason: "无效舞蹈轨道" };
    const note = s.notes.filter(n => n.lane === input.lane && n.status === "pending").sort((a, b) => Math.abs(a.atMs - s.elapsedMs) - Math.abs(b.atMs - s.elapsedMs))[0];
    if (note && Math.abs(note.atMs - s.elapsedMs) <= s.hitWindowMs) {
      note.status = "hit";
      const offset=Math.abs(note.atMs-s.elapsedMs)/s.hitWindowMs;
      note.precision=offset<=.4?1:offset<=.75?.75:.4;
      s.combo=(s.combo??0)+1;
    } else {s.strayHits=(s.strayHits??0)+1;s.combo=0;}
  } else return { ok: false, reason: "该操作不属于当前游戏" };
  return { ok: true };
}
export function settleDistrictLeisure(state: GameState, sessionId: number): LeisureCheck & { result?: LeisureResult } {
  const s = state.districtLeisure?.active;
  if (!s || s.id !== sessionId || s.phase !== "ready") return { ok: false, reason: "本轮尚未完成或已经结算" };
  if(isCasinoKind(s.kind)){const risk=financialRiskAccess(state,'casino');if(!risk.ok)return risk;}
  if (state.locationId !== s.locationId || state.flags.hospitalized || state.endingId) return { ok: false, reason: "当前无法结算娱乐" };
  let payout = 0, moodDelta = 0, staminaDelta = 0, itemId: string | undefined, won = false, perfect = false, summary = "本轮结束";
  if (s.kind === "blackjack") {
    const p = blackjackValue(s.player), d = blackjackValue(s.dealer);
    const tied = !s.forfeited && p.total <= 21 && p.total === d.total && p.natural === d.natural;
    won = !s.forfeited && p.total <= 21 && (p.natural ? !d.natural : !d.natural && (d.total > 21 || p.total > d.total));
    payout = tied ? s.paid : won ? s.bet * (p.natural ? 2.5 : 2) : 0;
    summary = `${p.natural ? "天然21点" : `玩家${p.total}点`} / ${d.natural ? "庄家天然21点" : `庄家${d.total}点`}：${s.forfeited ? "提前结束，损失已付底注" : tied ? "平局，退回全部底注" : won ? `获胜，返还${payout}${s.currency === "chips" ? "筹码" : "元"}（含本金）` : "庄家获胜"}`;
  } else if (s.kind === "poker") {
    const p = evaluatePokerHand([...s.player, ...s.board]), d = evaluatePokerHand([...s.dealer, ...s.board]);
    const tied = !s.forfeited && s.continued && p.key === d.key;
    won = !s.forfeited && s.continued && p.key > d.key;
    payout = tied ? s.paid : won ? s.paid * 2 : 0;
    summary = !s.continued || s.forfeited ? "弃牌，本局只扣已支付的下注" : `${p.name} / 庄家${d.name}：${tied ? "平局分池，退回底注与追加注" : won ? `获胜，返还${payout}${s.currency === "chips" ? "筹码" : "元"}（含本金）` : "庄家获胜"}`;
  } else if (s.kind === "high_low" || s.kind === "slots" || s.kind === "roulette_redblack" || s.kind === "roulette_highlow" || s.kind === "roulette_number") {
    if (s.kind === "high_low") {
      const [playerRank, dealerRank] = s.outcome;
      const tied = !s.forfeited && playerRank === dealerRank;
      won = !s.forfeited && (s.choice === "high" ? playerRank > dealerRank : playerRank < dealerRank);
      payout = tied ? s.paid : won ? s.bet * 2 : 0;
      summary = `${casinoOutcomeLabel(s)}；${s.forfeited ? "提前结束，损失已付底注" : tied ? "同点平局，退回全部底注" : won ? `猜中，返还 ${payout} 筹码（含本金）` : "未中，庄家收走底注"}`;
    } else if (s.kind === "slots") {
      const [a, b, c] = s.outcome, triple = a === b && b === c, pair = a === b || b === c || a === c;
      won = !s.forfeited && pair;
      payout = won ? s.bet * (triple ? SLOT_MULTIPLIERS[a] : 1) : 0;
      summary = `${casinoOutcomeLabel(s)}；${triple ? `三连，${SLOT_MULTIPLIERS[a]} 倍返还` : pair ? "两连，返还底注" : "没有连中"}${won ? ` ${payout} 筹码` : ""}。`;
    } else {
      const n = s.outcome[0], red = n > 0 && RED_WHEEL.has(n), isLow = n >= 1 && n <= 18, choice = s.choice;
      won = !s.forfeited && (s.kind === "roulette_redblack" ? choice === (red ? "red" : "black") && n !== 0
        : s.kind === "roulette_highlow" ? choice === (isLow ? "low" : "high") && n !== 0
        : choice === n);
      const multiplier = s.kind === "roulette_number" ? 36 : 2;
      if (won) payout = s.bet * multiplier;
      summary = `${casinoOutcomeLabel(s)}；${won ? `押中，返还 ${payout} 筹码（含本金）` : "未中，庄家收走底注"}`;
    }
  } else if (s.kind === "claw") {
    won = !s.forfeited && s.success; if (won) { moodDelta = 30; itemId = s.plushId; }
    summary = won ? "抓中了！玩偶落进取物口，你开心地把它抱在怀里。" : "爪子轻轻一晃，玩偶又落回了堆里。下次再试试吧。";
  } else if (s.kind === "platform") {
    moodDelta = Math.max(3, Math.min(15, 3 + Math.round(6 * s.x / PLATFORM_LEVEL.width) + Math.round(3 * s.collected.length / PLATFORM_LEVEL.coins.length) + (s.complete ? 3 : 0)));
    summary = s.complete ? "越过最后一道障碍，顺利抵达终点！" : "这一轮结束了。你松开按钮，回味刚才的几次跳跃。";
  } else if (s.kind === "dance" || s.kind === "singing") {
    const ratio=Math.min(1,Math.max(0,(s.notes.reduce((sum,n)=>sum+(n.status==='hit'?(n.precision??1):0),0)-(s.strayHits??0)*.2)/Math.max(1,s.notes.length)));
    won=!s.forfeited&&ratio>=.6;
    perfect = !s.forfeited && ratio>=.95;
    moodDelta = won ? 5 + Math.round(10 * ratio) : -2; staminaDelta = -10;
    if (s.kind === "singing") {
      const incomeBase = s.incomeBase ?? 0;
      payout = won ? Math.round(incomeBase * ratio) : 0;
      moodDelta = won?5:-2; staminaDelta = -12;
      summary = won ? `演唱 ${Math.round(ratio*100)} 分，收到本场报酬 ¥${payout}。` : `演唱 ${Math.round(ratio*100)} 分，未达到 60 分，本场没有报酬。`;
    } else {
      if (perfect) data(state).dancePerfectNight = s.night;
      summary = perfect ? "舞步精准！酒保向你招手：今晚请你喝一杯。" : won ? `舞蹈 ${Math.round(ratio*100)} 分，顺利完成。` : `舞蹈 ${Math.round(ratio*100)} 分，这次没能跟上节拍，下次再试试。`;
    }
  }
  const chipGame = s.currency === "chips";
  if(isCasinoKind(s.kind)&&!recordFinancialEvent(state,'casino',Math.round((payout-s.paid)*(chipGame?20:100))))return{ok:false,reason:financialStorageProblem()};
  const result: LeisureResult = { id: s.id, kind: s.kind, summary, moneyDelta: chipGame ? 0 : payout - s.paid, ...(chipGame ? { chipDelta: payout - s.paid } : {}), payout, moodDelta, staminaDelta, durationMinutes: s.durationMinutes, itemId, won, perfect };
  // Release the global leisure lock before advancing time. Committed result prevents repeat reward/time.
  data(state).active = null; data(state).lastResult = result;
  if (payout) {
    if (chipGame) data(state).casinoChips = (data(state).casinoChips ?? 0) + payout;
    else { state.player.money += payout; recordMoney(state, payout); }
  }
  if (itemId) addItem(state, itemId);
  if (moodDelta || staminaDelta) applyEffects(state, { mood: moodDelta, stamina: staminaDelta }, "🎮");
  if (s.kind === "singing" && won) applyEffects(state, { fame: 2, stress: -5 }, "🎤");
  advanceHours(state, s.durationMinutes / 60);
  if(isCasinoKind(s.kind)){
    applyFinancialSanctions(state);
    const risk=financialBanReason(state,'casino');if(risk){summary+=' '+risk;result.summary=summary;}
  }
  autoExitIfClosed(state);
  pushLog(state, "🎮", summary);
  return { ok: true, result };
}
function validDeck(deck: unknown): deck is number[] {
  return Array.isArray(deck) && deck.length === 52 && new Set(deck).size === 52 && deck.every(c => Number.isInteger(c) && c >= 0 && c < 52);
}
function finiteFields(s: object, names: string[]): boolean { return names.every(k => { const v = (s as Record<string, unknown>)[k]; return typeof v === "number" && Number.isFinite(v); }); }
/** Preserve original deals, claw rolls, positions and note statuses; never reroll on load. */
export function normalizeDistrictLeisure(state: GameState): void {
  const raw = state.districtLeisure;
  if (!raw || typeof raw !== "object") { state.districtLeisure = { nextSessionId: 1, active: null }; return; }
  raw.nextSessionId = Number.isSafeInteger(raw.nextSessionId) && raw.nextSessionId > 0 ? raw.nextSessionId : 1;
  for (const key of ["dancePerfectNight", "danceDrinkClaimedNight", "singingLastDay", "casinoGiftNight", "casinoSnackNight"] as const) if (!Number.isSafeInteger(raw[key])) delete raw[key];
  // Keep newly introduced optional fields absent in older saves. Gameplay reads
  // the balance with ?? 0, so migration need not rewrite otherwise untouched saves.
  if (raw.casinoChips !== undefined && (!Number.isSafeInteger(raw.casinoChips) || raw.casinoChips < 0)) raw.casinoChips = 0;
  if (!validRoom(raw.casinoRoom)) delete raw.casinoRoom;
  const s = raw.active;
  if (!s) { raw.active = null; return; }
  let valid = typeof s === "object" && Object.prototype.hasOwnProperty.call(PLACE, s.kind) && s.locationId === PLACE[s.kind] && s.locationId === state.locationId
    && Number.isSafeInteger(s.id) && s.id > 0 && ["playing", "ready"].includes(s.phase)
    && s.durationMinutes === DURATION[s.kind] && finiteFields(s, ["startedMinute", "night", "paid"]) && s.paid >= 0;
  if (valid && (s.kind === "blackjack" || s.kind === "poker")) {
    valid = validDeck(s.deck) && Number.isSafeInteger(s.bet)
      && Array.isArray(s.player) && Array.isArray(s.dealer) && s.player.length >= 2 && s.dealer.length >= 2;
    if (valid && s.currency === "chips") {
      const room = validRoom(s.room) ? s.room : undefined;
      valid = !!room && savedCasinoBetValid(room, s.bet) && Number.isSafeInteger(raw.casinoChips);
    } else if(valid) valid = s.bet >= 20 && s.bet <= (s.kind === "poker" ? 1000 : 2000);
    if (valid && s.kind === "blackjack") valid = s.paid === s.bet && Number.isInteger(s.cursor) && s.cursor >= 4 && s.cursor <= 52
      && s.cursor === s.player.length + s.dealer.length && new Set([...s.player, ...s.dealer]).size === s.cursor
      && [...s.player, ...s.dealer].every(c => s.deck.slice(0, s.cursor).includes(c));
    if (valid && s.kind === "poker") valid = typeof s.continued === "boolean" && s.player.length === 2 && s.dealer.length === 2
      && s.player[0] === s.deck[0] && s.player[1] === s.deck[2] && s.dealer[0] === s.deck[1] && s.dealer[1] === s.deck[3]
      && Array.isArray(s.board) && s.board.length === 5 && s.board.every((c, i) => c === s.deck[i + 4]) && s.paid === s.bet * (s.continued ? 2 : 1);
  } else if (s.kind !== "blackjack" && s.kind !== "poker" && isCasinoKind(s.kind)) {
    if (valid) {
      const c = s as CasinoSession, room = validRoom(s.room) ? s.room : undefined;
      valid = c.currency === "chips" && !!room && savedCasinoBetValid(room, c.bet)
        && c.paid === c.bet && Number.isSafeInteger(raw.casinoChips) && Array.isArray(c.outcome)
        && c.outcome.length === (c.kind === "high_low" || c.kind === "slots" ? 2 + Number(c.kind === "slots") : 1)
        && c.outcome.every((n: number) => Number.isInteger(n) && n >= 0 && n <= (c.kind === "slots" ? 5 : c.kind === "high_low" ? 14 : 36))
        && ((c.kind === "high_low" || c.kind === "roulette_highlow") ? ["high", "low"].includes(String(c.choice))
          : c.kind === "roulette_redblack" ? ["red", "black"].includes(String(c.choice))
          : c.kind === "roulette_number" ? Number.isInteger(c.choice) && (c.choice as number) >= 0 && (c.choice as number) <= 36 : c.kind === "slots");
    }
  } else if (valid && s.kind === "claw") valid = Number.isSafeInteger(s.paid) && typeof s.success === "boolean" && PLUSH_IDS.includes(s.plushId) && Number.isFinite(s.position) && s.position >= 0 && s.position <= 1;
  else if (valid && s.kind === "platform") valid = Number.isSafeInteger(s.paid) && finiteFields(s, ["elapsedMs", "x", "y", "vx", "vy", "lives", "checkpoint", "invulnerableMs"])
    && typeof s.grounded === "boolean" && typeof s.complete === "boolean"
    && s.elapsedMs >= 0 && s.elapsedMs <= PLATFORM_LEVEL.limitMs + 50 && s.x >= 0 && s.x <= PLATFORM_LEVEL.width && Number.isInteger(s.lives) && s.lives >= 0 && s.lives <= 3
    && Number.isInteger(s.checkpoint) && s.checkpoint >= 0 && s.checkpoint < PLATFORM_LEVEL.platforms.length
    && Array.isArray(s.collected) && s.collected.every(i => Number.isInteger(i) && i >= 0 && i < PLATFORM_LEVEL.coins.length) && new Set(s.collected).size === s.collected.length
    && Array.isArray(s.defeated) && s.defeated.every(i => Number.isInteger(i) && i >= 0 && i < PLATFORM_LEVEL.enemies.length);
  else if (valid && (s.kind === "dance" || s.kind === "singing")) valid = s.paid === 0 && Number.isInteger(s.track) && s.track >= 0 && s.track < 3 && finiteFields(s, ["elapsedMs", "lengthMs", "hitWindowMs"])
    && s.elapsedMs >= 0 && s.lengthMs > 0 && s.hitWindowMs >= 80 && s.hitWindowMs <= 270 && Array.isArray(s.notes) && s.notes.length === (s.chartVersion===2?DANCE_TRACK_CONFIG[s.track as 0 | 1 | 2]?.noteCount:[32,40,48][s.track])
    && s.notes.every(n => Number.isFinite(n.atMs) && n.atMs > 0 && [0, 1, 2, 3, 4].includes(n.lane) && ["pending", "hit", "miss"].includes(n.status))
    && (s.kind !== "singing" || Number.isFinite(s.incomeBase) && (s.incomeBase ?? 0) >= 0);
  if (!valid) raw.active = null;
  else raw.nextSessionId = Math.max(raw.nextSessionId, s.id + 1);
}
