/** 1.498 猫咪对决入口与生活/赛事奖励。战斗规则在catDuelCombat，收藏在catDuelCollection。 */
import { isResidenceLocation } from './residence';
import type { CatBattleState, CatBattleUnit, CatCardDef, CatElement, CatOpponentDef, CatSkillDef, CatStatusId, CatTournamentDef, CatTrainType, GameState, PetState, RngState } from '../types';
import { chance, createRng, randomInt } from '../rng';
import { getCatDef, gainCatExp, computeCatAttrs } from './cat';
import { activePetOf, applyBattleInjury, catDowned, isCatFostered, TRAIN_LABEL, TRAIN_BASE_GAIN, CAT_TRAIN_TYPES } from './catCare';
import { addItem } from './items';
import { recordMoney } from './weekly';
import { settleTournamentMatch } from './tournament';
import { pushLog } from '../engine';
import { gameDay } from './calendar';
import { advanceHours } from './time';
import { changeGrowthStat } from './growthStats';
import { rollCardOffer, OFFER_CHANCE_DUEL, OFFER_CHANCE_TRAIN } from './cardPack';
import { DUEL_CARDS, STARTER_CARDS, getDuelCard } from './catDuelCards';
import { startDuelBattle, normalizedPlayer, normalizedOpponent, playDuelCard, endDuelPlayerTurn, resolveDuelCard, runDuelEnemyTurn, resumeDuelRecovery } from './catDuelCombat';
import catSkillsData from '../data/catSkills.json';
import catBattlesData from '../data/catBattles.json';
export {cardInBattle,previewDuelCard,duelMechanicText,enemyDamage,resumeDuelRecovery} from './catDuelCombat';
export const SKILL_DATA=catSkillsData as unknown as {version:number;skills:CatSkillDef[]};
export const SKILLS=SKILL_DATA.skills;
export const BATTLE_DATA=catBattlesData as unknown as {version:number;opponents:CatOpponentDef[];tournaments:CatTournamentDef[];boss:CatOpponentDef};
export const CARD_DATA={version:2,cards:DUEL_CARDS};
const skillMap=new Map(SKILLS.map(s=>[s.id,s]));
const opponentMap=new Map([...BATTLE_DATA.opponents,BATTLE_DATA.boss].map(o=>[o.id,o]));
const tournamentMap=new Map(BATTLE_DATA.tournaments.map(t=>[t.id,t]));
export const getSkillDef=(id:string)=>skillMap.get(id);
export const getOpponentDef=(id:string)=>opponentMap.get(id);
export const allOpponents=()=>BATTLE_DATA.opponents;
export const getTournamentDef=(id:string)=>tournamentMap.get(id);
export const allTournaments=()=>BATTLE_DATA.tournaments;
export const getBossDef=()=>BATTLE_DATA.boss;
export const getCardDef=getDuelCard;
export const allCards=()=>DUEL_CARDS;
export function registerCardDef(_def:CatCardDef):void{}
export const opponentMechanic=(b:CatBattleState)=>getOpponentDef(b.opponentId)?.mechanic;
export const ENERGY_PER_TURN=3,HAND_SIZE=5,MIN_DECK_SIZE=12,MINION_HP=8;
export const STATUS_DURATION:Record<CatStatusId,number>={poison:3,paralysis:2,sleep:2,burn:3};
export const POISON_DMG_PCT=0,BURN_DMG_PCT=0,PARALYSIS_SKIP=0,SLEEP_WAKE_NATURAL=1,BURN_ATK_REDUCE=0;
export const ELEMENT_LABEL:Record<CatElement,string>={normal:'普通',nature:'自然',tech:'科技',mystic:'神秘',cosmic:'宇宙'};
export const STATUS_LABEL:Record<CatStatusId,string>={poison:'中毒',paralysis:'虚弱',sleep:'易伤',burn:'中毒'};
export const CARD_TYPE_LABEL:Record<CatCardDef['type'],string>={attack:'攻击',defend:'防御',skill:'技能'};
export function elementMultiplier(_a:CatElement,_b:CatElement):number{return 1;}
export function effectiveSpd(_unit:CatBattleUnit):number{return 0;}
export function dodgeChance(_unit:CatBattleUnit):number{return 0;}
export function cardDamage(_a:CatBattleUnit,strength:number,_d:CatBattleUnit,power:number):number{return Math.max(0,Math.floor(power+strength));}
export function cardBlockValue(_def:number,block:number):number{return Math.max(0,Math.floor(block));}
export const unitFromPet=normalizedPlayer;
export const unitFromOpponent=normalizedOpponent;
export function buildPlayerDeck(_catId:string,_skills:string[]):string[]{return STARTER_CARDS.flatMap(id=>[id,id]);}
export const startBattle=startDuelBattle;
export const playCard=playDuelCard;
export const endPlayerTurn=endDuelPlayerTurn;
export function resolveCard(b:CatBattleState,card:CatCardDef):string[]{const before=b.log.length;const def=getDuelCard(card.id);if(def&&b.duel)resolveDuelCard(b,def);return b.log.slice(before);}
export function endOfTurn(b:CatBattleState):string[]{const before=b.log.length;runDuelEnemyTurn(b);return b.log.slice(before);}
export function applyStatus(_rng:RngState,unit:CatBattleUnit,status:CatStatusId):void{unit.status=status;unit.statusTurns=STATUS_DURATION[status];}
export function startBossBattle(state:GameState):{ok:boolean;reason?:string}{return startBattle(state,getBossDef().id);}
export function tournamentCleared(state:GameState,id:string):boolean{return !!state.catFlags[`tournament_${id}`];}
export function bossDefeated(state:GameState):boolean{return !!state.catFlags.boss_roundhead;}

export interface BattleReward {
  exp: number;
  money: number;
  fame: number;
  itemId?: string;
  leveled: boolean;
  newLevel?: number;
  /** v1.39 本场是否获胜（赛事连胜自动续战判定用） */
  won: boolean;
  /** v1.34 休闲对决胜利额外提升的猫咪属性 */
  attr?: CatTrainType;
  gain?: number;
  /** v1.37 卡包刷新：胜利刷出的卡牌（UI 弹窗让玩家选择是否收入卡包） */
  cardOffer?: { defId: string; source: "train" | "duel" | "tournament" };
}

/** 结算战斗奖励：经验/金钱/声望/物品；写入宠物与主角状态，返回奖励明细 */
export function settleBattle(state: GameState): BattleReward | null {
  const b = state.catBattle;
  if (!b || !b.finished) return null;
  if (b.duel?.practice) { state.catBattle = undefined; return { exp:0, money:0, fame:0, leveled:false, won:!!b.won }; }
  const pet = state.pets.find((p) => p.uid === b.playerUid);
  if (!pet || isCatFostered(pet)) return null;

  let reward: { exp: number; money: number; fame: number; itemId?: string };
  let resultExtra: { attr: CatTrainType; gain: number } | undefined;
  if (b.won) {
    const opp = getOpponentDef(b.opponentId);
    reward = opp?.reward ?? { exp: 10, money: 10, fame: 1 };
    // 赛事完赛额外奖励（冠军：击败赛程最后一个对手时发放）
    if (b.tournamentId && isTournamentLastOpponent(state, b.tournamentId, b.opponentId)) {
      const t = getTournamentDef(b.tournamentId);
      if (t) {
        reward = {
          exp: reward.exp + (t.reward?.exp ?? 0),
          money: reward.money + (t.reward?.money ?? 0),
          fame: reward.fame + (t.reward?.fame ?? 0),
          itemId: t.reward?.itemId ?? reward.itemId,
        };
      }
    }
    // v1.34 休闲对决（公园自由锻炼 / 游乐场娱乐赛）：胜利随机提升一个猫咪属性，不给金钱奖励
    if (b.casual) {
      const boost = boostRandomCatAttr(state, pet);
      reward = { exp: Math.max(reward.exp, 10), money: 0, fame: 0 };
      resultExtra = { attr: boost.attr, gain: boost.gain };
    }
    // Boss 击败标记
    if (b.opponentId === getBossDef().id) {
      state.catFlags["boss_roundhead"] = true;
    }
    markOpponentDefeated(state, b.opponentId);
  } else {
    reward = { exp: Math.max(1, Math.round((getOpponentDef(b.opponentId)?.reward?.exp ?? 10) / 2)), money: 0, fame: 0 };
    if (b.casual) {
      // v1.34 休闲对决失败无惩罚：不受伤、不扣心情（赛事/野生对决仍按原规则置伤）
    } else {
      // v1.33 P3 失败置伤：轻/中/重随机（赛事战败必中伤起）
      applyBattleInjury(state, pet, { heavier: !!b.tournamentId });
    }
  }

  const leveled = gainCatExp(pet, reward.exp);
  // 新版每场统一80生命，不将竞技生命回写日常猫咪HP。
  state.player.money += reward.money;
  recordMoney(state, reward.money);
  // v1.43.1 修复：影响力与其它属性一样 clamp 0-100（此前直接 += 可突破上限）
  changeGrowthStat(state, "fame", reward.fame);
  if (reward.itemId) addItem(state, reward.itemId, 1);
  if (b.won) {
    pushLog(state, "🏆", `「${pet.name}」在对决中获胜！获得 ${reward.exp} 经验、${reward.money} 元、${reward.fame} 声望${reward.itemId ? "、" + reward.itemId : ""}${resultExtra ? `，${TRAIN_LABEL[resultExtra.attr]} +${resultExtra.gain}` : ""}`);
  } else {
    if (!b.casual) pet.care.mood = Math.max(0, pet.care.mood - 5);
    pushLog(state, "😿", `「${pet.name}」在对决中落败，只获得了 ${reward.exp} 经验${b.casual ? "（休闲对决，没有其他损失）" : ""}`);
  }

  // v1.33 P4c 赛事推进：连胜记录 / 名次 / 奖金 / 解锁（先于清空战斗状态）
  if (b.tournamentId) settleTournamentMatch(state, b.won ?? false);

  // v1.37 卡包刷新：比赛胜利必得（稀有度上移）；普通对决胜利较高概率
  // v1.39 赛事连胜自动续战：仅最后一场胜利发放卡牌（中间场次不打断战斗流程）
  let cardOffer: BattleReward["cardOffer"] | undefined;
  if (b.won) {
    if (b.tournamentId) {
      if (isTournamentLastOpponent(state, b.tournamentId, b.opponentId)) {
        const defId = rollCardOffer(state, "tournament");
        if (defId) cardOffer = { defId, source: "tournament" };
      }
    } else if (chance(state.rng, OFFER_CHANCE_DUEL)) {
      const defId = rollCardOffer(state, "duel");
      if (defId) cardOffer = { defId, source: "duel" };
    }
  }

  const result: BattleReward = {
    exp: reward.exp,
    money: reward.money,
    fame: reward.fame,
    itemId: reward.itemId,
    leveled,
    newLevel: leveled ? pet.level : undefined,
    won: b.won === true,
    attr: resultExtra?.attr,
    gain: resultExtra?.gain,
    cardOffer,
  };
  state.catBattle = undefined;
  return result;
}

/** 是否击败了当前赛事赛程的最后一个对手（通关判定，读报名时生成的对手队列） */
function isTournamentLastOpponent(state: GameState, tournamentId: string, opponentId: string): boolean {
  const entry = state.catTournament?.entry;
  if (!entry || entry.tierId !== tournamentId) return false;
  const q = entry.queue;
  return q.length > 0 && q[q.length - 1] === opponentId;
}

/** 赛事当前进度：当前报名赛事已击败的对手数（未报名/非本赛事 = 0） */
export function tournamentProgress(state: GameState, tournamentId: string): number {
  const entry = state.catTournament?.entry;
  if (!entry || entry.tierId !== tournamentId) return 0;
  return entry.beaten.length;
}

/** 标记对手已击败（赛事进度用） */
export function markOpponentDefeated(state: GameState, opponentId: string): void {
  state.catFlags[`defeat_${opponentId}`] = true;
}

/* ------------------------------------------------------------------ *
 * 外出遭遇
 * ------------------------------------------------------------------ */

/**
 * 携带猫咪办事（执行动作）后概率触发野生对决（独立 rng，不消耗主存档 rng 保证可复现）。
 * 【已停用 · v1.34】路边决斗已收敛到「公园自由锻炼 / 娱乐赛」。
 * 本函数与它写入的 `cat_battle_pending` 标记当前**没有调用方**；保留是为了兼容旧存档字段，
 * 新玩法请走 `startFunMatch`（娱乐赛）与 `freeTrainCat`（自由锻炼）。
 *
 * 触发条件：携带猫 / 未受伤 / 无进行中对决 / 不在家 / 同一天未触发过（冷却）。
 * 触发时置 cat_battle_pending 标记，由 GameView 弹出战斗界面。
 */
export function maybeTriggerWildBattle(state: GameState, probability = 0.1): boolean {
  const pet = activePetOf(state);
  if (!pet) return false;
  if (catDowned(pet)) return false;
  if (pet.injured) return false;
  if (state.catBattle && !state.catBattle.finished) return false;
  if (isResidenceLocation(state)) return false;
  // 冷却：同一天只触发一次，避免连续弹窗
  const today = gameDay(state.time);
  if (state.flags["cat_wild_battle_day"] === today) return false;
  // 独立 rng：seed 由存档 seed + 当前绝对日派生，同一天内结果稳定
  // v1.36 修复：野生遭遇 rng 改为真随机（之前用 state.rng.seed + 2000 + 当日绝对日，
  // 同一天内总是抽到同一个敌人）。
  const rng = createRng();
  if (!chance(rng, probability)) return false;
  const candidates = allOpponents().filter(
    (o) => !o.id.startsWith("t") && !o.id.startsWith("opp_") && pet.level >= (o.minLevel ?? 1),
  );
  if (candidates.length === 0) return false;
  const opp = candidates[randomInt(rng, 0, candidates.length - 1)];
  const r = startBattle(state, opp.id);
  if (!r.ok) return false;
  state.flags["cat_battle_pending"] = true;
  state.flags["cat_wild_battle_day"] = today;
  return true;
}

/** 当前绝对日（外出遭遇独立 rng 用） */
function absoluteDayOf(state: GameState): number {
  const t = state.time;
  return (t.year - 2026) * 360 + (t.month - 1) * 30 + t.day;
}

/* ------------------------------------------------------------------ *
 * v1.34 休闲对决（公园自由锻炼 / 游乐场喵喵娱乐赛）
 *
 * 与赛事/野生对决的区别：
 * - 失败无惩罚：不受伤、不扣心情（settleBattle 的 casual 分支）
 * - 胜利随机提升一个猫咪属性（trainBonus 永久加成）
 * - 每日有次数上限，防止无限刷属性
 * ------------------------------------------------------------------ */

/** 公园「猫咪自由锻炼」每日次数上限 */
export const FREE_TRAIN_DAILY_LIMIT = 3;
/** 游乐场「喵喵娱乐赛」每日次数上限 */
export const FUN_MATCH_DAILY_LIMIT = 3;

/** 读当日已用次数（按绝对日自动跨天归零） */
function dailyUsed(state: GameState, dayKey: string, countKey: string): number {
  const today = absoluteDayOf(state);
  return state.flags[dayKey] === today ? (state.flags[countKey] as number) || 0 : 0;
}
/**
 * 记录一次当日使用。
 * v1.34-hotfix：跨天必须先重置计数——原实现只累加不清零，
 * 第二天点第 2 次就会读到昨天的累计数直接判定「已达上限」（能玩的次数越来越少）。
 */
function bumpDaily(state: GameState, dayKey: string, countKey: string): void {
  const today = absoluteDayOf(state);
  if (state.flags[dayKey] !== today) {
    state.flags[dayKey] = today;
    state.flags[countKey] = 1;
    return;
  }
  state.flags[countKey] = ((state.flags[countKey] as number) || 0) + 1;
}

/**
 * 随机提升一个猫咪属性（trainBonus 永久加成，重算 attrs）。
 * 用独立 rng（seed 派生自存档 seed + 绝对日），不消耗主存档 rng，保证可复现。
 */
export function boostRandomCatAttr(
  _state: GameState,
  pet: PetState,
  gain = TRAIN_BASE_GAIN,
): { attr: CatTrainType; gain: number } {
  // v1.36 修复：属性提升 rng 改为真随机，使每次休闲锻炼/娱乐赛胜利加成属性真正随机。
  const rng = createRng();
  const attr = CAT_TRAIN_TYPES[randomInt(rng, 0, CAT_TRAIN_TYPES.length - 1)];
  pet.trainBonus = { ...(pet.trainBonus ?? {}), [attr]: (pet.trainBonus?.[attr] ?? 0) + gain };
  const def = getCatDef(pet.catId);
  if (def) pet.attrs = computeCatAttrs(def, pet.level, pet.personality, pet.trainBonus);
  return { attr, gain };
}

/** 休闲对手池：普通 tier（lv 5-7）为大概率，中级 tier（lv 10-13）为小概率 */
export function randomCasualOpponent(state: GameState, tier: "normal" | "intermediate"): CatOpponentDef | undefined {
  const pet = activePetOf(state);
  if (!pet) return undefined;
  // v1.36 修复：休闲对手 rng 改为真随机，每次从候选池里真正随机抽取（之前同日同 seed 总是同一对手）。
  const rng = createRng();
  const candidates = allOpponents().filter((o) => {
    // 无 tier 的野外对手只作为普通赛的入门池，避免一级猫直接撞上高级中级赛。
    const isBeginner = tier === "normal" && o.tier == null && o.level <= 4;
    if (o.tier !== tier && !isBeginner) return false;
    const minLevel = isBeginner ? 1 : (o.minLevel ?? (tier === "normal" ? Math.max(1, o.level - 2) : Math.max(5, o.level - 3)));
    if (pet.level < minLevel) return false;
    const maxGap = tier === "normal" ? 3 : 4;
    return o.level <= pet.level + maxGap;
  });
  if (candidates.length === 0) return undefined;
  return candidates[randomInt(rng, 0, candidates.length - 1)];
}

/** 休闲对手展示信息 */
export interface CasualEncounterInfo {
  opponentId: string;
  opponentName: string;
  opponentIcon: string;
  opponentLevel: number;
  tierLabel: string;
  /** 休闲赛明确的匹配等级区间，避免玩家误以为会跨档随机。 */
  tierRange: string;
}

function tierRangeOf(tier: CatOpponentDef["tier"]): string {
  return tier === "intermediate" ? "匹配 Lv.10–13" : "匹配 Lv.1–7";
}

function encounterInfoOf(opp: CatOpponentDef): CasualEncounterInfo {
  return {
    opponentId: opp.id,
    opponentName: opp.name,
    opponentIcon: opp.icon ?? "🐈",
    opponentLevel: opp.level,
    tierLabel: opp.tier === "intermediate" ? "中级" : "普通",
    tierRange: tierRangeOf(opp.tier),
  };
}

/** 公园「猫咪自由锻炼」结果 */
export type FreeTrainResult =
  | { ok: false; reason: string }
  | { ok: true; kind: "boost"; attr: CatTrainType; gain: number; cardOffer?: { defId: string; source: "train" } }
  | { ok: true; kind: "battle"; encounter: CasualEncounterInfo };

/**
 * 公园自由锻炼（免费）：50% 随机提升一个猫咪属性；50% 遭遇普通敌人（casual 战斗）。
 * 每日 FREE_TRAIN_DAILY_LIMIT 次；耗时 0.5h。遭遇战由 UI 弹确认框让玩家选择决斗/逃跑。
 */
export function freeTrainCat(state: GameState): FreeTrainResult {
  const pet = activePetOf(state);
  if (!pet) return { ok: false, reason: "先领养并携带一只猫咪" };
  if (pet.injured) {
    return { ok: false, reason: `「${pet.name}」还受着伤，先带它去宠物医院治疗` };
  }
  const used = dailyUsed(state, "cat_free_train_day", "cat_free_train_count");
  if (used >= FREE_TRAIN_DAILY_LIMIT) {
    return { ok: false, reason: `今天已经自由锻炼 ${FREE_TRAIN_DAILY_LIMIT} 次了，明天再来吧` };
  }
  bumpDaily(state, "cat_free_train_day", "cat_free_train_count");

  // v1.36 修复：属性/遭遇分支 50% 概率与遭遇对手抽取均改为真随机。
  const rng = createRng();
  if (chance(rng, 0.5)) {
    // 50%：随机属性提升
    advanceHours(state, 0.5);
    const boost = boostRandomCatAttr(state, pet);
    pushLog(state, "🏋️", `「${pet.name}」在公园自由锻炼，${TRAIN_LABEL[boost.attr]} +${boost.gain}`);
    // v1.37 卡包刷新：户外锻炼较低概率刷出一张随机品质的卡
    const defId = chance(rng, OFFER_CHANCE_TRAIN) ? rollCardOffer(state, "train") : null;
    const cardOffer = defId ? { defId, source: "train" as const } : undefined;
    return { ok: true, kind: "boost", attr: boost.attr, gain: boost.gain, cardOffer };
  }
  // 50%：遭遇普通敌人。与娱乐赛共用等级匹配器，避免一级猫随机撞上高等级野外池。
  const opp = randomCasualOpponent(state, "normal");
  if (!opp) {
    // 兜底：没有任何可挑战对手时改给属性提升
    advanceHours(state, 0.5);
    const boost = boostRandomCatAttr(state, pet);
    pushLog(state, "🏋️", `「${pet.name}」在公园自由锻炼，${TRAIN_LABEL[boost.attr]} +${boost.gain}`);
    return { ok: true, kind: "boost", attr: boost.attr, gain: boost.gain };
  }
  const r = startBattle(state, opp.id, undefined, { casual: true });
  if (!r.ok) {
    // 战斗未能开启（如等级限制）→ 退回属性提升
    advanceHours(state, 0.5);
    const boost = boostRandomCatAttr(state, pet);
    pushLog(state, "🏋️", `「${pet.name}」在公园自由锻炼，${TRAIN_LABEL[boost.attr]} +${boost.gain}`);
    return { ok: true, kind: "boost", attr: boost.attr, gain: boost.gain };
  }
  advanceHours(state, 0.5);
  return { ok: true, kind: "battle", encounter: encounterInfoOf(opp) };
}

/** 逃跑：放弃当前 casual 遭遇战（清空战斗状态，不扣任何东西） */
export function fleeCasualBattle(state: GameState): { ok: boolean; reason?: string } {
  const b = state.catBattle;
  if (!b || b.finished) return { ok: false, reason: "当前没有进行中的遭遇战" };
  if (!b.casual) return { ok: false, reason: "赛事或正式对决不能逃跑" };
  const pet = state.pets.find((p) => p.uid === b.playerUid);
  if (pet) pushLog(state, "🏃", `「${pet.name}」撒腿就跑，避开了这场遭遇战`);
  state.catBattle = undefined;
  return { ok: true };
}

/** 游乐场「喵喵娱乐赛」结果 */
export interface FunMatchResult {
  ok: boolean;
  reason?: string;
  encounter?: CasualEncounterInfo;
}

/**
 * 游乐场喵喵娱乐赛：无需门票、立即开战。
 * 大概率普通敌人（80%）、小概率中级敌人（20%）；casual 结算（失败无惩罚、胜利随机加属性）。
 * 每日 FUN_MATCH_DAILY_LIMIT 次；耗时 0.5h。
 */
export function startFunMatch(state: GameState, opponentId?: string): FunMatchResult {
  if(state.catDuel?.recovery) return resumeDuelRecovery(state);
  const pet = activePetOf(state);
  if (!pet) return { ok: false, reason: "先领养并携带一只猫咪" };
  if (pet.injured) {
    return { ok: false, reason: `「${pet.name}」还受着伤，先带它去宠物医院治疗` };
  }
  const used = dailyUsed(state, "cat_fun_match_day", "cat_fun_match_count");
  if (used >= FUN_MATCH_DAILY_LIMIT) {
    return { ok: false, reason: `娱乐赛今天已经打了 ${FUN_MATCH_DAILY_LIMIT} 场，明天再来吧` };
  }

  // v1.36 修复：娱乐赛 tier 抽签改为真随机，使对手档位与具体对手每次都不同。
  const rng = createRng();
  const tier: "normal" | "intermediate" = chance(rng, 0.8) ? "normal" : "intermediate";
  // 中级池对低等级猫可能为空：回退到适配等级的普通池，不让首页娱乐赛因抽签失败。
  const opp = opponentId ? getOpponentDef(opponentId) : randomCasualOpponent(state, tier) ?? (tier === "intermediate" ? randomCasualOpponent(state, "normal") : undefined);
  if (opponentId && opp && (opp.tier === "boss" || opp.level > 13)) return {ok:false,reason:"请在正式赛事中挑战高级对手"};
  if (!opp) return { ok: false, reason: "暂时没有适合你猫咪等级的对手，先提升等级再来吧" };
  const r = startBattle(state, opp.id, undefined, { casual: true });
  if (!r.ok) return { ok: false, reason: r.reason ?? "开赛失败" };
  // 次数扣减必须在两道失败守卫之后：否则无合适对手/开赛失败也会白扣当日一次额度。
  bumpDaily(state, "cat_fun_match_day", "cat_fun_match_count");
  // v1.39 修复：时间扣减移到 startBattle 成功之后，避免开赛失败时白扣时间
  advanceHours(state, 0.5);
  pushLog(state, "🎪", `「${pet.name}」报名了喵喵娱乐赛，对阵${opp.name}（Lv.${opp.level}）`);
  return { ok: true, encounter: encounterInfoOf(opp) };
}
