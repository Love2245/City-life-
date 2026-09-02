/**
 * v1.33 P2 卡牌对决：类《杀戮尖塔》抽卡回合对战引擎（纯逻辑层，可单测）。
 * - 手牌打牌：选牌 → 扣能量 → 结算 → 弃牌；每回合 3 能量、抽 5 张
 * - 敌方意图预告：回合开始显示意图，结束回合才执行
 * - 格挡 block（回合结束清除）/ 力量 strength（叠加层）
 * - 五系循环克制：自然→科技→神秘→宇宙→自然；普通系不参与（×1.0）
 * - 伤害 ≈ 威力 × 攻击/10（×克制×力量）；格挡 ≈ 格挡 × 防御/10
 * - 状态异常：中毒 / 麻痹 / 睡眠 / 灼伤
 * - 战斗状态随存档持久化（state.catBattle），结束后清空并结算奖励
 */
import type {
  CatBattleState,
  CatBattleUnit,
  CatCardDef,
  CatElement,
  CatOpponentDef,
  CatOpponentMechanic,
  CatSkillDef,
  CatStatusId,
  CatTournamentDef,
  CatTrainType,
  EnemyIntent,
  GameState,
  PetState,
  RngState,
} from "../types";
import { chance, createRng, randomInt } from "../rng";
import { getCatDef, gainCatExp, computeCatAttrs } from "./cat";
import { activePetOf, applyBattleInjury, catBattleAttrs, catCurHp, catDowned, catMaxHp, TRAIN_LABEL, TRAIN_BASE_GAIN, CAT_TRAIN_TYPES } from "./catCare";
import { equippedAccessoryEffect } from "./catAccessory";
import { addItem, removeItem, itemCount } from "./items";
import { recordMoney } from "./weekly";
import { settleTournamentMatch } from "./tournament";
import { pushLog } from "../engine";
import { gameDay } from "./calendar";
import { advanceHours } from "./time";
import {
  ensureCardPack,
  packDeckIds,
  rollCardOffer,
  ensureVariantsRegistered,
  OFFER_CHANCE_DUEL,
  OFFER_CHANCE_TRAIN,
} from "./cardPack";
import catSkillsData from "../data/catSkills.json";
import catBattlesData from "../data/catBattles.json";
import catCardsData from "../data/catCards.json";

/* ------------------------------------------------------------------ *
 * 数据加载
 * ------------------------------------------------------------------ */

export const SKILL_DATA = catSkillsData as unknown as { version: number; skills: CatSkillDef[] };
export const SKILLS: CatSkillDef[] = SKILL_DATA.skills;
export const BATTLE_DATA = catBattlesData as unknown as {
  version: number;
  opponents: CatOpponentDef[];
  tournaments: CatTournamentDef[];
  boss: CatOpponentDef;
};
export const CARD_DATA = catCardsData as unknown as { version: number; cards: CatCardDef[] };

const skillMap = new Map<string, CatSkillDef>(SKILLS.map((s) => [s.id, s]));
const opponentMap = new Map<string, CatOpponentDef>(
  [...BATTLE_DATA.opponents, BATTLE_DATA.boss].map((o) => [o.id, o]),
);
const tournamentMap = new Map<string, CatTournamentDef>(BATTLE_DATA.tournaments.map((t) => [t.id, t]));
const cardMap = new Map<string, CatCardDef>(CARD_DATA.cards.map((c) => [c.id, c]));

export function getSkillDef(id: string): CatSkillDef | undefined {
  return skillMap.get(id);
}

/** v1.37 卡包系统：注册动态生成的变体卡（品质/强化），供 cardPack 模块回填 cardMap */
export function registerCardDef(def: CatCardDef): void {
  cardMap.set(def.id, def);
}

export function getOpponentDef(id: string): CatOpponentDef | undefined {
  return opponentMap.get(id);
}

export function allOpponents(): CatOpponentDef[] {
  return BATTLE_DATA.opponents;
}

export function getTournamentDef(id: string): CatTournamentDef | undefined {
  return tournamentMap.get(id);
}

export function allTournaments(): CatTournamentDef[] {
  return BATTLE_DATA.tournaments;
}

export function getBossDef(): CatOpponentDef {
  return BATTLE_DATA.boss;
}

export function getCardDef(id: string): CatCardDef | undefined {
  // v1.37 卡包系统：首次查卡时惰性注册品质/强化变体（幂等，须在 cardMap 就绪后执行）
  ensureVariantsRegistered();
  return cardMap.get(id);
}

export function allCards(): CatCardDef[] {
  return CARD_DATA.cards;
}

/* ------------------------------------------------------------------ *
 * v1.33 P4 对手机制查询
 * ------------------------------------------------------------------ */

/** 当前战斗对手的专属机制（无则 undefined） */
export function opponentMechanic(b: CatBattleState): CatOpponentMechanic | undefined {
  return getOpponentDef(b.opponentId)?.mechanic;
}

/** 骷髅猫：是否处于尸体状态 */
function isCorpse(b: CatBattleState): boolean {
  return !!b.mechanicState?.corpse;
}

/** 幽灵猫咪：是否处于免疫伤害状态 */
function isGhostActive(b: CatBattleState): boolean {
  const mech = opponentMechanic(b);
  return !!mech?.ghostRounds && (b.mechanicState?.ghostCountdown ?? 0) > 0;
}

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** 每回合初始能量 */
export const ENERGY_PER_TURN = 3;
/** 每回合手牌数 */
export const HAND_SIZE = 5;
/** 抽牌堆/弃牌堆耗尽后重洗 */
export const MIN_DECK_SIZE = 12;

/** v1.33 P4 亡灵法师幼崽：每只吸收的固定伤害 */
export const MINION_HP = 12;

/** 状态持续时间（回合数） */
export const STATUS_DURATION: Record<CatStatusId, number> = {
  poison: 3,
  paralysis: 2,
  sleep: 2,
  burn: 3,
};
/** 中毒/灼伤每回合末损失最大 HP 比例 */
export const POISON_DMG_PCT = 0.05;
export const BURN_DMG_PCT = 0.04;
/** 麻痹无法行动概率 */
export const PARALYSIS_SKIP = 0.25;
/** 睡眠被自然醒概率（回合开始） */
export const SLEEP_WAKE_NATURAL = 0.5;
/** 灼伤攻击伤害减半 */
export const BURN_ATK_REDUCE = 0.25;

/** v1.39 AI 阈值常量（可调参） */
const AI_HEAL_HP_PCT = 0.4;
const AI_FINISHER_HP_PCT = 0.4;
const AI_STATUS_CHANCE = 0.55;
const AI_BLOCK_THRESHOLD = 12;
const AI_BLOCK_REROUTE_STATUS = 0.6;
const AI_BLOCK_REROUTE_HEAL = 0.3;
const AI_BLOCK_REROUTE_DEFEND = 0.4;
const AI_DEFEND_HP_PCT = 0.6;
const AI_DEFEND_CHANCE = 0.5;
const AI_ATTACK_HEAVY = 0.65;

export const ELEMENT_LABEL: Record<CatElement, string> = {
  normal: "普通",
  nature: "自然",
  tech: "科技",
  mystic: "神秘",
  cosmic: "宇宙",
};

export const STATUS_LABEL: Record<CatStatusId, string> = {
  poison: "中毒",
  paralysis: "麻痹",
  sleep: "睡眠",
  burn: "灼伤",
};

export const CARD_TYPE_LABEL: Record<CatCardDef["type"], string> = {
  attack: "攻击",
  defend: "防御",
  skill: "技能",
};

/* ------------------------------------------------------------------ *
 * 克制与数值
 * ------------------------------------------------------------------ */

/** 五系循环克制：自然→科技→神秘→宇宙→自然 */
const ELEMENT_CYCLE: Record<CatElement, CatElement> = {
  nature: "tech",
  tech: "mystic",
  mystic: "cosmic",
  cosmic: "nature",
  normal: "normal",
};

/** 克制系数：克制 1.5、被克 0.5、普通/无关 1.0 */
export function elementMultiplier(attacker: CatElement, defender: CatElement): number {
  if (attacker === "normal" || defender === "normal") return 1;
  if (ELEMENT_CYCLE[attacker] === defender) return 1.5;
  if (ELEMENT_CYCLE[defender] === attacker) return 0.5;
  return 1;
}

/** 有效速度（麻痹减半，用于闪避） */
export function effectiveSpd(unit: CatBattleUnit): number {
  return unit.status === "paralysis" ? Math.max(1, Math.round(unit.attrs.spd / 2)) : unit.attrs.spd;
}

/** 闪避率：速度越快越难被命中，封顶 30%（v1.39 提升系数让闪避更有存在感） */
export function dodgeChance(unit: CatBattleUnit): number {
  return Math.max(0, Math.min(0.30, effectiveSpd(unit) * 0.015));
}

/** 卡牌伤害：威力 × 攻击/10 × 克制 ×（灼伤减半）；最低 1 */
export function cardDamage(
  attacker: CatBattleUnit,
  attackerStrength: number,
  defender: CatBattleUnit,
  power: number,
): number {
  let atk = attacker.attrs.atk + attackerStrength;
  if (attacker.status === "burn") atk *= 1 - BURN_ATK_REDUCE;
  let dmg = (power * atk) / 10;
  dmg *= elementMultiplier(attacker.element, defender.element);
  return Math.max(1, Math.round(dmg));
}

/** 卡牌格挡：格挡 × 防御/10；最低 1 */
export function cardBlockValue(def: number, block: number): number {
  return Math.max(1, Math.round((block * def) / 10));
}

/* ------------------------------------------------------------------ *
 * 战斗单位构建
 * ------------------------------------------------------------------ */

/** 由玩家宠物构建战斗单位（有效属性 × 饱食修正 + 猫窝 DEF 加成） */
export function unitFromPet(state: GameState, petUid: string): CatBattleUnit | null {
  const pet = state.pets.find((p) => p.uid === petUid);
  if (!pet) return null;
  const def = getCatDef(pet.catId);
  const attrs = catBattleAttrs(state, pet);
  return {
    name: pet.name,
    icon: pet.icon,
    level: pet.level,
    element: def?.element ?? "normal",
    attrs,
    skills: def?.skills ?? [],
    desc: def?.desc,
    // v1.39 战斗以当前生命值开局（战后保留，不再每次满血）；钳制在战斗上限内
    hp: Math.min(catCurHp(pet), attrs.hp),
  };
}

/** 由对手定义构建战斗单位 */
export function unitFromOpponent(opp: CatOpponentDef): CatBattleUnit {
  return {
    name: opp.name,
    icon: opp.icon,
    level: opp.level,
    element: opp.element,
    attrs: { ...opp.attrs },
    skills: opp.skills,
    desc: opp.desc,
    hp: opp.attrs.hp,
  };
}

/* ------------------------------------------------------------------ *
 * 卡组构建
 * ------------------------------------------------------------------ */

const BASE_DECK = ["scratch", "scratch", "scratch", "pounce", "pounce", "guard", "guard", "guard", "fortify", "meow"];

/** 攻击技能 → 卡牌 id（按威力分档） */
function attackCardOf(sk: CatSkillDef): string {
  if ((sk.effect?.multihit ?? 0) >= 2) return "flurry";
  const p = sk.power ?? 0;
  if (p <= 30) return "scratch";
  if (p <= 60) return "pounce";
  return "heavy_strike";
}

/** 系别 → 系别攻击牌（普通系无专属攻击牌） */
function elementAttackCard(el: CatElement): string | null {
  if (el === "normal") return null;
  return `atk_${el}`;
}

/** 状态 → 状态牌 */
function statusCardOf(status: CatStatusId | undefined): string | null {
  switch (status) {
    case "poison":
      return "venom_bite";
    case "paralysis":
      return "web_trap";
    case "burn":
      return "ember_touch";
    case "sleep":
      return "drowsy_spores";
    default:
      return null;
  }
}

/**
 * 构建玩家卡组：基础卡 + 系别攻击 + 猫种专属 + 技能派生卡（去重）。
 * 技能派生：攻击技能按威力映射为对应攻击牌，治疗→补给，防御→蜷缩，状态→对应状态牌。
 */
export function buildPlayerDeck(catId: string, skillIds: string[]): string[] {
  const deck = [...BASE_DECK];
  const def = getCatDef(catId);
  if (def) {
    const el = elementAttackCard(def.element);
    if (el && getCardDef(el)) deck.push(el);
    const excl = `${catId}_exclusive`;
    if (getCardDef(excl)) deck.push(excl);
  }
  const added = new Set<string>();
  for (const sid of skillIds) {
    const sk = getSkillDef(sid);
    if (!sk) continue;
    let card: string | null = null;
    if (sk.kind === "attack") card = attackCardOf(sk);
    else if (sk.kind === "heal") card = "heal_medium";
    else if (sk.kind === "status") card = statusCardOf(sk.effect?.status);
    else if (sk.kind === "defense") card = "fortify";
    if (card && !added.has(card) && getCardDef(card)) {
      deck.push(card);
      added.add(card);
    }
  }
  while (deck.length < MIN_DECK_SIZE) deck.push("scratch");
  return deck;
}

/** Fisher-Yates 洗牌（战斗专用 rng，保证可复现） */
function shuffle<T>(arr: T[], rng: RngState): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(rng, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------------------------------------------ *
 * 战斗开始 / 结束
 * ------------------------------------------------------------------ */

/**
 * v1.395 把战斗中的当前血量落盘到宠物身上。
 * 所有退出/切换战斗的路径都必须调用，否则玩家可以用「逃跑 / 关窗口 / 另开一场」
 * 把已受的伤抹掉，等于无脑刷战斗。
 */
export function persistBattleHp(state: GameState): void {
  const b = state.catBattle;
  if (!b) return;
  const pet = state.pets.find((p) => p.uid === b.playerUid);
  if (!pet) return;
  pet.curHp = Math.max(0, Math.min(catMaxHp(pet), Math.round(b.player.hp)));
}

/**
 * v1.395 放弃当前未结束的对决：落盘血量后清空战斗状态，不发放任何奖励。
 * 返回这只猫是否已倒地（供 UI 提示去医院）。
 */
export function abandonBattle(state: GameState): { ok: boolean; downed?: boolean } {
  const b = state.catBattle;
  if (!b) return { ok: false };
  if (!b.finished) persistBattleHp(state);
  const pet = state.pets.find((p) => p.uid === b.playerUid);
  state.catBattle = undefined;
  return { ok: true, downed: pet ? catDowned(pet) : false };
}

/** 开始对决：携带猫 vs 指定对手（赛事内依次挑战时传 tournamentId） */
export function startBattle(
  state: GameState,
  opponentId: string,
  tournamentId?: string,
  opts?: { casual?: boolean },
): { ok: boolean; reason?: string } {
  const pet = activePetOf(state);
  if (!pet) return { ok: false, reason: "先携带一只猫咪才能发起对决" };
  if (catDowned(pet)) {
    return { ok: false, reason: `「${pet.name}」生命值归零倒下了，先带它去宠物医院治疗吧` };
  }
  if (pet.injured) {
    return { ok: false, reason: `「${pet.name}」还受着伤，先带它去宠物医院治疗吧` };
  }
  if (pet.sick) {
    return { ok: false, reason: `「${pet.name}」生病了，先好好照顾它（喂食/陪伴）再对决吧` };
  }
  const opp = getOpponentDef(opponentId);
  if (!opp) return { ok: false, reason: "未知对手" };
  if (pet.level < (opp.minLevel ?? 1)) {
    return { ok: false, reason: `需要猫咪等级 ≥ ${opp.minLevel} 才能挑战${opp.name}` };
  }
  const player = unitFromPet(state, pet.uid);
  if (!player) return { ok: false, reason: "猫咪数据异常" };
  // v1.37 卡包系统：抽牌堆完全由猫咪卡包构成（收养时初始 8 攻 + 8 防，旧存档自动补建）
  const deck = packDeckIds(ensureCardPack(pet));
  // v1.36 修复：战斗内 rng 用真随机种子，使每场对决的抽牌顺序各不相同（之前用
  // state.rng.seed + 1000 派生，同一存档内每场洗牌结果完全相同）。
  const rng = createRng();
  // v1.33 P4 对手机制初始化（幽灵/炸弹/幼崽/缠绕倒计时）
  const mech = opp.mechanic;
  const mechanicState: CatBattleState["mechanicState"] = mech
    ? {
        ...(mech.ghostRounds ? { ghostCountdown: mech.ghostRounds } : {}),
        ...(mech.bombTurns ? { bombCountdown: mech.bombTurns } : {}),
        ...(mech.summonMinions ? { minions: mech.summonMinions, minionHp: MINION_HP } : {}),
        ...(mech.bindEvery ? { bindCooldown: 0 } : {}),
      }
    : undefined;
  // v1.395 覆盖旧战斗前，先把上一场已受的伤落盘（关窗/另开一场等于重置血量的漏洞）
  persistBattleHp(state);
  state.catBattle = {
    opponentId,
    playerUid: pet.uid,
    tournamentId,
    casual: opts?.casual,
    player,
    opponent: unitFromOpponent(opp),
    turn: 0,
    log: [`⚔️ 对决开始！${player.name}（Lv.${player.level}）VS ${opp.name}（Lv.${opp.level}）`],
    finished: false,
    rng,
    phase: "player",
    playerEnergy: 0,
    playerMaxEnergy: ENERGY_PER_TURN,
    playerBlock: 0,
    playerStrength: 0,
    opponentBlock: 0,
    opponentStrength: 0,
    playerHand: [],
    playerDrawPile: shuffle(deck, rng),
    playerDiscardPile: [],
    mechanicState,
  };
  beginPlayerTurn(state.catBattle);
  // v1.38 饰品效果：开局力量 / 格挡 / 最大 HP / 额外抽牌（beginPlayerTurn 之后应用，避免被重置）
  applyAccessoryBattleEffects(state);
  return { ok: true };
}

/** v1.38 饰品开局效果 */
function applyAccessoryBattleEffects(state: GameState): void {
  const b = state.catBattle;
  if (!b) return;
  const pet = state.pets.find((p) => p.uid === b.playerUid);
  const fx = equippedAccessoryEffect(pet);
  if (!fx) return;
  const parts: string[] = [];
  if (fx.startStrength) {
    b.playerStrength += fx.startStrength;
    parts.push(`力量 +${fx.startStrength}`);
  }
  if (fx.startBlock) {
    b.playerBlock += fx.startBlock;
    parts.push(`格挡 +${fx.startBlock}`);
  }
  if (fx.maxHpPct) {
    const bonus = Math.max(1, Math.round(b.player.attrs.hp * fx.maxHpPct));
    b.player.attrs.hp += bonus;
    // v1.395 上限提升只把增量补给当前血，保留已损失的血量。
    // 旧写法 `b.player.hp = b.player.attrs.hp` 会把残血猫直接拉满，
    // 既击穿「战后保留生命」，也让赛事连战的血量延续失效。
    b.player.hp = Math.min(b.player.attrs.hp, b.player.hp + bonus);
    parts.push(`HP 上限 +${bonus}`);
  }
  if (fx.drawBonus) {
    drawCards(b, Math.max(0, fx.drawBonus));
    parts.push(`开局多抽 ${fx.drawBonus} 张`);
  }
  if (parts.length) {
    b.log.push(`✨ ${pet?.name ?? "猫咪"} 的饰品生效：${parts.join("、")}！`);
  }
}

/** v1.38 复活石：玩家濒死时自动消耗一枚复活（50% HP，每场一次） */
function tryRevivePlayer(state: GameState, b: CatBattleState): boolean {
  if (b.reviveUsed) return false;
  const pet = state.pets.find((p) => p.uid === b.playerUid);
  if (!pet || itemCount(state, "cat_revive") <= 0) return false;
  removeItem(state, "cat_revive", 1);
  b.reviveUsed = true;
  b.player.hp = Math.max(1, Math.round(b.player.attrs.hp * 0.5));
  b.log.push(`💎 复活石碎裂，${b.player.name} 原地复活，恢复 ${b.player.hp} HP！`);
  return true;
}

/** 开始 Boss 战（圆头猫咪） */
export function startBossBattle(state: GameState): { ok: boolean; reason?: string } {
  const boss = getBossDef();
  return startBattle(state, boss.id);
}

/** 是否已通关某赛事（全胜） */
export function tournamentCleared(state: GameState, tournamentId: string): boolean {
  return state.catFlags[`tournament_${tournamentId}`] === true;
}

/** 是否已击败 Boss */
export function bossDefeated(state: GameState): boolean {
  return state.catFlags["boss_roundhead"] === true;
}

/* ------------------------------------------------------------------ *
 * 回合流程
 * ------------------------------------------------------------------ */

/** 抽 N 张牌（抽牌堆空则重洗弃牌堆） */
function drawCards(b: CatBattleState, n: number): void {
  for (let i = 0; i < n; i++) {
    if (b.playerDrawPile.length === 0) {
      if (b.playerDiscardPile.length === 0) return;
      b.playerDrawPile = shuffle(b.playerDiscardPile, b.rng);
      b.playerDiscardPile = [];
    }
    const card = b.playerDrawPile.pop();
    if (card) b.playerHand.push(card);
  }
}

/** 开始玩家回合：补满手牌、重置能量与格挡、掷敌方意图 */
function beginPlayerTurn(b: CatBattleState): void {
  b.phase = "player";
  b.playerEnergy = b.playerMaxEnergy;
  b.playerBlock = 0;
  drawCards(b, HAND_SIZE - b.playerHand.length);
  // 蛛网猫缠绕：每 bindEvery 回合本回合无法出牌
  const mech = opponentMechanic(b);
  if (mech?.bindEvery && b.mechanicState) {
    const st = b.mechanicState;
    st.bindCooldown = (st.bindCooldown ?? 0) + 1;
    if (st.bindCooldown >= mech.bindEvery) {
      st.bindCooldown = 0;
      b.playerEnergy = 0;
      b.log.push(`🕸️ ${b.opponent.name} 吐丝缠住了 ${b.player.name}，本回合无法出牌！`);
    }
  }
  // 睡眠：自然醒判定，未醒则本回合无法出牌
  if (b.player.status === "sleep") {
    if (chance(b.rng, SLEEP_WAKE_NATURAL)) {
      b.player.status = undefined;
      b.player.sleepTurns = undefined;
      b.log.push(`😴 ${b.player.name} 打了个哈欠，醒了过来！`);
    } else {
      b.playerEnergy = 0;
      b.log.push(`😴 ${b.player.name} 睡得很香，本回合无法出牌……`);
    }
  }
  // 麻痹：概率本回合无法行动
  if (b.player.status === "paralysis" && chance(b.rng, PARALYSIS_SKIP)) {
    b.playerEnergy = 0;
    b.log.push(`⚡ ${b.player.name} 浑身麻痹，动弹不得！`);
  }
  b.enemyIntent = rollEnemyIntent(b);
  b.turn += 1;
}

/** 出牌：扣能量 → 结算 → 弃牌，返回是否成功 */
export function playCard(state: GameState, cardId: string): { ok: boolean; reason?: string } {
  const b = state.catBattle;
  if (!b || b.finished) return { ok: false, reason: "没有进行中的对决" };
  if (b.phase !== "player") return { ok: false, reason: "现在不能出牌" };
  const card = getCardDef(cardId);
  if (!card) return { ok: false, reason: "未知卡牌" };
  if (!b.playerHand.includes(cardId)) return { ok: false, reason: "这张牌不在手牌里" };
  if (b.playerEnergy < card.cost) return { ok: false, reason: `能量不足（需要 ${card.cost} 点）` };

  b.playerEnergy -= card.cost;
  b.playerHand.splice(b.playerHand.indexOf(cardId), 1);
  b.log.push(...resolveCard(b, card));
  if (!card.effect?.exhaust) b.playerDiscardPile.push(cardId);
  if (card.effect?.draw) drawCards(b, card.effect.draw);

  checkOpponentDeath(b);
  return { ok: true };
}

/**
 * v1.33 P4 对手死亡判定（骷髅尸体 / 机器自爆）。
 * 非骷髅猫或尸体状态下的骷髅猫归零 = 真死亡；首次归零的骷髅猫进入尸体状态。
 */
function checkOpponentDeath(b: CatBattleState): void {
  if (b.opponent.hp > 0) return;
  const mech = opponentMechanic(b);
  // 骷髅猫：首次归零进入尸体状态（不真死）
  if (mech?.corpseRounds && !b.mechanicState?.corpse) {
    if (!b.mechanicState) b.mechanicState = {};
    b.mechanicState.corpse = true;
    b.mechanicState.corpseCountdown = mech.corpseRounds;
    b.opponent.hp = Math.max(1, Math.round(b.opponent.attrs.hp * 0.3));
    b.log.push(`🦴 ${b.opponent.name} 倒下了……亡灵之力让它化作尸体！${mech.corpseRounds} 回合内必须补刀！`);
    return;
  }
  // 真死亡
  b.finished = true;
  b.won = true;
  b.phase = "over";
  b.log.push(`🏆 ${b.opponent.name} 倒下了！${b.player.name} 获胜！`);
  // 机器猫自爆：死亡时对玩家造成固定伤害
  if (mech?.selfDestruct) {
    const boom = mech.selfDestruct;
    b.player.hp = Math.max(0, b.player.hp - boom);
    b.log.push(`💥 ${b.opponent.name} 自爆了！对 ${b.player.name} 造成 ${boom} 点伤害！`);
    if (b.player.hp <= 0) {
      b.won = false;
      b.log.push(`💀 同归于尽……${b.player.name} 也被炸倒了！`);
    }
  }
}

/** 结束玩家回合：敌方执行意图 → 回合末状态 → 进入下一回合 */
export function endPlayerTurn(state: GameState): { ok: boolean; reason?: string } {
  const b = state.catBattle;
  if (!b || b.finished) return { ok: false, reason: "没有进行中的对决" };
  if (b.phase !== "player") return { ok: false, reason: "现在不能结束回合" };
  b.phase = "enemy";

  // v1.39 杀戮尖塔式抽卡：回合结束，手牌全部弃入弃牌堆（下回合再从抽牌堆补满）
  b.playerDiscardPile.push(...b.playerHand);
  b.playerHand = [];

  const logs: string[] = [...executeEnemyIntent(b), ...endOfTurn(b)];

  if (!b.finished && b.player.hp <= 0) {
    if (tryRevivePlayer(state, b)) {
      // 复活石生效：不判负，进入下一回合
    } else {
      b.finished = true;
      b.won = false;
      b.phase = "over";
      logs.push(`💀 ${b.player.name} 倒下了……${b.opponent.name} 获胜！`);
    }
  }
  b.log.push(...logs);
  if (!b.finished) beginPlayerTurn(b);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * 卡牌结算
 * ------------------------------------------------------------------ */

/** 结算一张卡牌的效果，返回日志 */
export function resolveCard(b: CatBattleState, card: CatCardDef): string[] {
  const logs: string[] = [];
  const e = card.effect ?? {};

  if (e.cure && b.player.status) {
    b.player.status = undefined;
    b.player.statusTurns = undefined;
    b.player.sleepTurns = undefined;
    logs.push(`✨ ${b.player.name} 清除了身上的异常状态！`);
  }
  if (e.block) {
    const blk = cardBlockValue(b.player.attrs.def, e.block);
    b.playerBlock += blk;
    logs.push(`🛡️ ${b.player.name} 获得 ${blk} 点格挡！`);
  }
  if (e.strength) {
    b.playerStrength += e.strength;
    logs.push(`💪 ${b.player.name} 力量 +${e.strength}！`);
  }
  if (e.heal || e.healPct) {
    const amount = e.heal
      ? e.heal
      : Math.max(1, Math.round(b.player.attrs.hp * (e.healPct ?? 0)));
    const actual = Math.min(b.player.attrs.hp - b.player.hp, amount);
    b.player.hp += actual;
    if (actual > 0) logs.push(`💗 ${b.player.name} 恢复 ${actual} 点 HP！`);
  }
  if (e.power) {
    const mech = opponentMechanic(b);
    const hits = e.hits ?? 1;
    let total = 0;
    // 闪电猫咪：闪避概率（整张攻击牌判定一次）
    if (mech?.dodge && chance(b.rng, mech.dodge)) {
      logs.push(`💨 ${b.opponent.name} 灵巧地闪开了攻击！`);
    } else {
      for (let i = 0; i < hits; i++) {
        const dmg = cardDamage(b.player, b.playerStrength, b.opponent, e.power);
        let dealt = dmg;
        // 幽灵猫咪：免疫所有伤害
        if (isGhostActive(b)) {
          dealt = 0;
        }
        // 亡灵法师幼崽：先替本体挡伤害
        if (dealt > 0 && mech?.summonMinions) {
          dealt = absorbMinions(b, dealt, logs);
        }
        if (!e.pierce) {
          const absorbed = Math.min(b.opponentBlock, dealt);
          b.opponentBlock -= absorbed;
          dealt -= absorbed;
        }
        dealt = Math.max(0, dealt);
        b.opponent.hp = Math.max(0, b.opponent.hp - dealt);
        total += dealt;
        // v1.39 多段攻击：每段独立记录，驱动逐次飘字动画
        if (hits > 1 && dealt > 0) logs.push(`⚔️ ${b.player.name} 第 ${i + 1} 击造成 ${dealt} 点伤害！`);
        if (b.opponent.hp <= 0 && !isCorpse(b)) break;
      }
    }
    logs.push(`💥 ${b.player.name} 对 ${b.opponent.name} 造成 ${total} 点伤害${hits > 1 ? `（${hits} 连击）` : ""}！`);
  }
  if (e.status && b.opponent.hp > 0 && chance(b.rng, e.statusChance ?? 1)) {
    applyStatus(b.rng, b.opponent, e.status);
    logs.push(`🌀 ${b.opponent.name} 陷入${STATUS_LABEL[e.status]}！`);
  }
  // v1.39 消耗卡牌使用反馈：明确告知玩家该卡已从本场战斗中永久移除
  if (e.exhaust) {
    logs.push(`🔥 「${card.name}」是一次性卡牌，使用后从本场战斗中消耗！`);
  }
  return logs;
}

/** 亡灵法师幼崽挡伤害：每只吸收 MINION_HP 后消失，返回漏到本体的伤害 */
function absorbMinions(b: CatBattleState, dmg: number, logs: string[]): number {
  const st = b.mechanicState;
  if (!st || !st.minions || st.minions <= 0) return dmg;
  let remaining = dmg;
  while (st.minions > 0 && remaining > 0) {
    const cur = st.minionHp ?? MINION_HP;
    if (remaining >= cur) {
      remaining -= cur;
      st.minions -= 1;
      st.minionHp = MINION_HP;
      logs.push(`🐣 一只幼崽被击碎，灰飞烟灭！`);
    } else {
      st.minionHp = cur - remaining;
      logs.push(`🐣 幼崽承受了 ${remaining} 点伤害，摇摇欲坠`);
      remaining = 0;
    }
  }
  return remaining;
}

/** 施加状态异常（覆盖旧状态） */
export function applyStatus(rng: RngState, unit: CatBattleUnit, status: CatStatusId): void {
  unit.status = status;
  unit.statusTurns = STATUS_DURATION[status];
  if (status === "sleep") {
    unit.sleepTurns = randomInt(rng, 1, 2);
  }
}

/* ------------------------------------------------------------------ *
 * 敌方意图
 * ------------------------------------------------------------------ */

/** 由对手技能构建意图池（伤害/格挡/治疗按对手属性缩放） */
function enemyIntentPool(b: CatBattleState): EnemyIntent[] {
  const opp = b.opponent;
  const pool: EnemyIntent[] = [];
  const atkPower = (p: number) => (p <= 30 ? 8 : p <= 60 ? 11 : 14);
  const scale = (power: number) =>
    Math.max(1, Math.round((power * opp.attrs.atk) / 10 * elementMultiplier(opp.element, b.player.element)));
  // 亡灵法师幼崽：满血时本体攻击叠加极高
  const minionCount = opponentMechanic(b)?.summonMinions ? (b.mechanicState?.minions ?? 0) : 0;
  const minionBoost = minionCount * 3;

  // 基础攻击：用对手「第一个攻击技能」命名（取自 catSkills.json 数据，避免自造攻击名）
  const firstAtk = opp.skills.map(getSkillDef).find((s) => s?.kind === "attack");
  if (firstAtk) {
    pool.push({ kind: "attack", name: firstAtk.name, icon: firstAtk.icon, value: scale(8) + minionBoost });
  }
  for (const sid of opp.skills) {
    const sk = getSkillDef(sid);
    if (!sk) continue;
    if (sk.kind === "attack") {
      pool.push({
        kind: "attack",
        name: sk.name,
        icon: sk.icon,
        value: scale(atkPower(sk.power ?? 30)) + minionBoost,
        hits: (sk.effect?.multihit ?? 0) >= 2 ? (sk.effect?.multihit ?? 2) : undefined,
      });
    } else if (sk.kind === "defense") {
      pool.push({
        kind: "defend",
        name: sk.name,
        icon: sk.icon,
        value: cardBlockValue(opp.attrs.def, 10),
      });
    } else if (sk.kind === "heal") {
      pool.push({
        kind: "skill",
        name: sk.name,
        icon: sk.icon,
        value: Math.max(6, Math.round(opp.attrs.hp * (sk.effect?.healPct ?? 0.15))),
      });
    } else if (sk.kind === "status") {
      pool.push({
        kind: "skill",
        name: sk.name,
        icon: sk.icon,
        value: 0,
        status: sk.effect?.status,
      });
    }
  }
  return pool;
}

/**
 * 敌方 AI（v1.36 重写）：像真人一样做取舍，而非只会攻防。
 * 决策顺序：濒死治疗 → 玩家残血出终结重击 → 主动施加减益（中毒/麻痹）打乱节奏
 * → 玩家高格挡时改用非攻击手段（避免伤害被吃光）→ 自身偏低血无治疗时防御拖回合
 * → 否则攻击（偏好重击，但保留普通攻击节奏）。
 */
function rollEnemyIntent(b: CatBattleState): EnemyIntent {
  const pool = enemyIntentPool(b);
  const opp = b.opponent;
  const hpPct = opp.hp / opp.attrs.hp;
  const playerHpPct = b.player.hp / b.player.attrs.hp;
  const heals = pool.filter((i) => i.kind === "skill" && !i.status && i.value > 0);
  const statuses = pool.filter((i) => i.status && !b.player.status);
  const defends = pool.filter((i) => i.kind === "defend");
  const attacks = pool.filter((i) => i.kind === "attack");
  const pick = (arr: EnemyIntent[]) => arr[randomInt(b.rng, 0, arr.length - 1)];
  const heaviest = () => [...attacks].sort((a, c) => c.value - a.value)[0];

  // 1) 濒死优先自愈
  if (hpPct < AI_HEAL_HP_PCT && heals.length) return pick(heals);
  // 2) 玩家残血 → 终结重击（取最高威力攻击）
  if (playerHpPct < AI_FINISHER_HP_PCT && attacks.length) return heaviest();
  // 3) 主动施加减益，打乱玩家节奏（玩家未中招时）
  if (statuses.length && chance(b.rng, AI_STATUS_CHANCE)) return pick(statuses);
  // 4) 玩家格挡很高 → 攻击会被吸收，改用减益 / 治疗 / 防御更划算
  if (b.playerBlock >= AI_BLOCK_THRESHOLD && (statuses.length || heals.length || defends.length)) {
    if (statuses.length && chance(b.rng, AI_BLOCK_REROUTE_STATUS)) return pick(statuses);
    if (heals.length && chance(b.rng, AI_BLOCK_REROUTE_HEAL)) return pick(heals);
    if (defends.length && chance(b.rng, AI_BLOCK_REROUTE_DEFEND)) return pick(defends);
  }
  // 5) 自身偏低血且无治疗 → 防御拖回合（建立格挡）
  if (hpPct < AI_DEFEND_HP_PCT && !heals.length && defends.length && chance(b.rng, AI_DEFEND_CHANCE)) return pick(defends);
  // 6) 否则攻击：偏好重击，偶尔普通攻击保留节奏
  if (attacks.length) {
    return chance(b.rng, AI_ATTACK_HEAVY) ? heaviest() : pick(attacks);
  }
  return { kind: "attack", name: "扑咬", icon: "🐾", value: Math.max(1, Math.round(oppAtkValue(opp))) };
}

function oppAtkValue(unit: CatBattleUnit): number {
  return unit.attrs.atk * 0.8;
}

/** 敌方执行意图：攻击（先扣玩家格挡）/ 防御 / 治疗 / 状态 */
function executeEnemyIntent(b: CatBattleState): string[] {
  const logs: string[] = [];
  const intent = b.enemyIntent;
  const e = b.opponent;
  if (!intent) return logs;
  b.opponentBlock = 0; // 敌方格挡过期

  const mech = opponentMechanic(b);
  // 骷髅猫尸体：不行动不回复
  if (isCorpse(b)) {
    logs.push(`🦴 ${e.name} 是具尸体，毫无反应……`);
    return logs;
  }
  // 棉花糖猫咪福利局：不攻击、回满玩家血量并自动认输
  if (mech?.marshmallow) {
    b.player.hp = b.player.attrs.hp;
    b.finished = true;
    b.won = true;
    b.phase = "over";
    logs.push(`🍬 ${e.name} 不攻击，反而把你的血回满了！`);
    logs.push(`🏆 ${e.name} 认输，${b.player.name} 获胜！`);
    return logs;
  }

  // 睡眠：自然醒判定，未醒跳过
  if (e.status === "sleep") {
    if (chance(b.rng, SLEEP_WAKE_NATURAL)) {
      e.status = undefined;
      e.sleepTurns = undefined;
      logs.push(`😴 ${e.name} 醒了过来！`);
    } else {
      logs.push(`😴 ${e.name} 睡得很香，无法行动……`);
      return logs;
    }
  }
  // 麻痹：概率无法行动
  if (e.status === "paralysis" && chance(b.rng, PARALYSIS_SKIP)) {
    logs.push(`⚡ ${e.name} 浑身麻痹，动弹不得！`);
    return logs;
  }

  if (intent.kind === "attack") {
    if (chance(b.rng, dodgeChance(b.player))) {
      logs.push(`💨 ${b.player.name} 灵巧地躲开了${e.name}的攻击！`);
      return logs;
    }
    let total = 0;
    const hits = intent.hits ?? 1;
    for (let i = 0; i < hits; i++) {
      let dmg = Math.max(1, intent.value);
      if (!intent.pierce) {
        const absorbed = Math.min(b.playerBlock, dmg);
        b.playerBlock -= absorbed;
        dmg -= absorbed;
      }
      dmg = Math.max(0, dmg);
      b.player.hp = Math.max(0, b.player.hp - dmg);
      total += dmg;
      // v1.39 多段攻击：每段独立记录，驱动逐次飘字动画
      if (hits > 1 && dmg > 0) logs.push(`😾 ${e.name} 第 ${i + 1} 击造成 ${dmg} 点伤害！`);
      if (b.player.hp <= 0) break;
    }
    logs.push(
      `😾 ${e.name} 使出「${intent.name}」，对 ${b.player.name} 造成 ${total} 点伤害${hits > 1 ? `（${hits} 连击）` : ""}！`,
    );
    // 雪人猫咪：主攻击之外固定附带雪球伤害
    if (mech?.snowball && b.player.hp > 0) {
      let sb = mech.snowball;
      const absorbed = Math.min(b.playerBlock, sb);
      b.playerBlock -= absorbed;
      sb = Math.max(0, sb - absorbed);
      b.player.hp = Math.max(0, b.player.hp - sb);
      logs.push(`⛄ ${e.name} 甩出一记雪球，额外 ${sb} 点伤害！`);
    }
  } else if (intent.kind === "defend") {
    b.opponentBlock = intent.value;
    logs.push(`🛡️ ${e.name} 使出了「${intent.name}」，获得 ${intent.value} 点格挡！`);
  } else if (intent.kind === "skill") {
    if (intent.status) {
      applyStatus(b.rng, b.player, intent.status);
      logs.push(`🌀 ${e.name} 使出了「${intent.name}」，${b.player.name} 陷入${STATUS_LABEL[intent.status]}！`);
    } else if (intent.value > 0) {
      const actual = Math.min(e.attrs.hp - e.hp, intent.value);
      e.hp += actual;
      logs.push(`💗 ${e.name} 使出了「${intent.name}」，恢复 ${actual} 点 HP！`);
    }
  }
  return logs;
}

/* ------------------------------------------------------------------ *
 * 回合末状态结算
 * ------------------------------------------------------------------ */

/** 回合末：中毒/灼伤扣血、状态持续回合递减、过期清除 + v1.33 P4 对手机制结算 */
export function endOfTurn(b: CatBattleState): string[] {
  const logs: string[] = [];
  for (const unit of [b.player, b.opponent]) {
    if (unit.hp <= 0) continue;
    if (unit.status === "poison") {
      const dmg = Math.max(1, Math.round(unit.attrs.hp * POISON_DMG_PCT));
      unit.hp = Math.max(0, unit.hp - dmg);
      logs.push(`☠️ ${unit.name} 受到中毒伤害 ${dmg} 点！`);
    } else if (unit.status === "burn") {
      const dmg = Math.max(1, Math.round(unit.attrs.hp * BURN_DMG_PCT));
      unit.hp = Math.max(0, unit.hp - dmg);
      logs.push(`🔥 ${unit.name} 受到灼伤伤害 ${dmg} 点！`);
    }
    if (unit.status === "sleep") {
      unit.sleepTurns = (unit.sleepTurns ?? 1) - 1;
      if (unit.sleepTurns <= 0) {
        unit.status = undefined;
        unit.sleepTurns = undefined;
        logs.push(`😴 ${unit.name} 睡醒了！`);
      }
    } else if (unit.statusTurns != null) {
      const label = STATUS_LABEL[unit.status as CatStatusId] ?? "状态";
      unit.statusTurns -= 1;
      if (unit.statusTurns <= 0) {
        unit.status = undefined;
        unit.statusTurns = undefined;
        logs.push(`✨ ${unit.name} 的${label}解除了！`);
      }
    }
  }

  // v1.33 P4 对手机制：自愈 / 尸体 / 幽灵 / 炸弹 / 幼崽
  const mech = opponentMechanic(b);
  if (mech && b.finished) return logs;
  // 汉堡猫咪：每回合自愈
  if (mech?.regen && !isCorpse(b) && b.opponent.hp > 0) {
    const amt = mech.regen.amount ?? Math.max(1, Math.round(b.opponent.attrs.hp * (mech.regen.pct ?? 0)));
    const actual = Math.min(b.opponent.attrs.hp - b.opponent.hp, amt);
    b.opponent.hp += actual;
    if (actual > 0) logs.push(`🍔 ${b.opponent.name} 偷吃汉堡，恢复 ${actual} 点 HP！`);
  }
  // 骷髅猫：尸体复活倒计时
  if (mech?.corpseRounds && b.mechanicState?.corpse) {
    const st = b.mechanicState;
    st.corpseCountdown = (st.corpseCountdown ?? mech.corpseRounds) - 1;
    if (st.corpseCountdown <= 0) {
      st.corpse = false;
      st.corpseCountdown = undefined;
      logs.push(`🦴 ${b.opponent.name} 的亡灵之力复苏，按当前血量 ${b.opponent.hp} 复活了！`);
    }
  }
  // 幽灵猫咪：N 回合后自动消失 → 玩家获胜
  if (mech?.ghostRounds && b.mechanicState?.ghostCountdown) {
    const st = b.mechanicState;
    st.ghostCountdown = (st.ghostCountdown ?? mech.ghostRounds) - 1;
    if (st.ghostCountdown <= 0) {
      st.ghostCountdown = 0;
      b.finished = true;
      b.won = true;
      b.phase = "over";
      logs.push(`👻 ${b.opponent.name} 的时间到了，化作青烟消散——${b.player.name} 熬过了 5 回合，获胜！`);
    }
  }
  // 杀手皇后：炸弹倒计时归零 → 玩家战败
  if (mech?.bombTurns && b.mechanicState?.bombCountdown) {
    const st = b.mechanicState;
    st.bombCountdown = (st.bombCountdown ?? mech.bombTurns) - 1;
    if (st.bombCountdown <= 0) {
      b.finished = true;
      b.won = false;
      b.phase = "over";
      logs.push(`💣 炸弹倒计时归零——轰！${b.player.name} 被炸倒了，战败……`);
    }
  }
  // 亡灵法师：随本体血量下降幼崽退场
  if (mech?.summonMinions && b.mechanicState?.minions && b.mechanicState.minions > 0) {
    const st = b.mechanicState;
    const minions = st.minions ?? 0;
    const hpPct = b.opponent.hp / b.opponent.attrs.hp;
    const target = hpPct >= 0.66 ? mech.summonMinions : hpPct >= 0.33 ? 2 : hpPct > 0 ? 1 : 0;
    if (minions > target) {
      const left = minions - target;
      st.minions = target;
      st.minionHp = MINION_HP;
      logs.push(`😨 ${b.opponent.name} 血量下降，${left} 只幼崽逃散而去！`);
    }
  }
  return logs;
}

/* ------------------------------------------------------------------ *
 * 奖励结算
 * ------------------------------------------------------------------ */

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
  const pet = state.pets.find((p) => p.uid === b.playerUid);
  if (!pet) return null;

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
    reward = { exp: Math.max(1, Math.round((getOpponentDef(b.opponentId)?.reward.exp ?? 10) / 2)), money: 0, fame: 0 };
    if (b.casual) {
      // v1.34 休闲对决失败无惩罚：不受伤、不扣心情（赛事/野生对决仍按原规则置伤）
    } else {
      // v1.33 P3 失败置伤：轻/中/重随机（赛事战败必中伤起）
      applyBattleInjury(state, pet, { heavier: !!b.tournamentId });
    }
  }

  const leveled = gainCatExp(pet, reward.exp);
  // v1.39 战后保留剩余生命（不再每次满血）；倒地（0 HP）需宠物医院治疗
  pet.curHp = Math.max(0, Math.min(catMaxHp(pet), Math.round(b.player.hp)));
  state.player.money += reward.money;
  recordMoney(state, reward.money);
  state.player.stats.fame += reward.fame;
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
        cardOffer = { defId: rollCardOffer(state, "tournament"), source: "tournament" };
      }
    } else if (chance(state.rng, OFFER_CHANCE_DUEL)) {
      cardOffer = { defId: rollCardOffer(state, "duel"), source: "duel" };
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
 * 触发条件：携带猫 / 未受伤 / 无进行中对决 / 不在家 / 同一天未触发过（冷却）。
 * 触发时置 cat_battle_pending 标记，由 GameView 弹出战斗界面。
 */
export function maybeTriggerWildBattle(state: GameState, probability = 0.1): boolean {
  const pet = activePetOf(state);
  if (!pet) return false;
  if (catDowned(pet)) return false;
  if (pet.injured) return false;
  if (state.catBattle && !state.catBattle.finished) return false;
  if (state.locationId === "home") return false;
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
  state: GameState,
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
  const candidates = allOpponents().filter(
    (o) => o.tier === tier && pet.level >= (o.minLevel ?? 1),
  );
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
}

function encounterInfoOf(opp: CatOpponentDef): CasualEncounterInfo {
  return {
    opponentId: opp.id,
    opponentName: opp.name,
    opponentIcon: opp.icon ?? "🐈",
    opponentLevel: opp.level,
    tierLabel: opp.tier === "intermediate" ? "中级" : "普通",
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
    const cardOffer = chance(rng, OFFER_CHANCE_TRAIN)
      ? ({ defId: rollCardOffer(state, "train"), source: "train" } as const)
      : undefined;
    return { ok: true, kind: "boost", attr: boost.attr, gain: boost.gain, cardOffer };
  }
  // 50%：遭遇普通敌人（wild/owner 池优先，tier=normal 兜底）
  const rng2 = createRng();
  let candidates = allOpponents().filter((o) => pet.level >= (o.minLevel ?? 1));
  candidates = candidates.filter(
    (o) => (!o.id.startsWith("t") && !o.id.startsWith("opp_")) || o.tier === "normal",
  );
  if (candidates.length === 0) {
    // 兜底：没有任何可挑战对手时改给属性提升
    advanceHours(state, 0.5);
    const boost = boostRandomCatAttr(state, pet);
    pushLog(state, "🏋️", `「${pet.name}」在公园自由锻炼，${TRAIN_LABEL[boost.attr]} +${boost.gain}`);
    return { ok: true, kind: "boost", attr: boost.attr, gain: boost.gain };
  }
  const opp = candidates[randomInt(rng2, 0, candidates.length - 1)];
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
  const pet = state.pets.find((p) => p.uid === b.playerUid);
  if (pet) pushLog(state, "🏃", `「${pet.name}」撒腿就跑，避开了这场遭遇战`);
  // v1.395 逃跑也要落盘已受的伤，否则逃跑＝免费重置血量，可反复刷战斗
  persistBattleHp(state);
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
export function startFunMatch(state: GameState): FunMatchResult {
  const pet = activePetOf(state);
  if (!pet) return { ok: false, reason: "先领养并携带一只猫咪" };
  if (pet.injured) {
    return { ok: false, reason: `「${pet.name}」还受着伤，先带它去宠物医院治疗` };
  }
  const used = dailyUsed(state, "cat_fun_match_day", "cat_fun_match_count");
  if (used >= FUN_MATCH_DAILY_LIMIT) {
    return { ok: false, reason: `娱乐赛今天已经打了 ${FUN_MATCH_DAILY_LIMIT} 场，明天再来吧` };
  }
  bumpDaily(state, "cat_fun_match_day", "cat_fun_match_count");

  // v1.36 修复：娱乐赛 tier 抽签改为真随机，使对手档位与具体对手每次都不同。
  const rng = createRng();
  const tier: "normal" | "intermediate" = chance(rng, 0.8) ? "normal" : "intermediate";
  const opp = randomCasualOpponent(state, tier);
  if (!opp) return { ok: false, reason: "暂时没有适合你猫咪等级的对手，先提升等级再来吧" };
  const r = startBattle(state, opp.id, undefined, { casual: true });
  if (!r.ok) return { ok: false, reason: r.reason ?? "开赛失败" };
  // v1.39 修复：时间扣减移到 startBattle 成功之后，避免开赛失败时白扣时间
  advanceHours(state, 0.5);
  pushLog(state, "🎪", `「${pet.name}」报名了喵喵娱乐赛，对阵${opp.name}（Lv.${opp.level}）`);
  return { ok: true, encounter: encounterInfoOf(opp) };
}
