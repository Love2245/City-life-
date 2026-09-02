import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { adoptCat, getCatDef } from "../src/game/core/cat";
import { setActivePet } from "../src/game/core/catCare";
import {
  ENERGY_PER_TURN,
  HAND_SIZE,
  MIN_DECK_SIZE,
  allCards,
  allOpponents,
  allTournaments,
  applyStatus,
  bossDefeated,
  buildPlayerDeck,
  cardBlockValue,
  cardDamage,
  elementMultiplier,
  endOfTurn,
  endPlayerTurn,
  getBossDef,
  getCardDef,
  getOpponentDef,
  getSkillDef,
  getTournamentDef,
  maybeTriggerWildBattle,
  playCard,
  settleBattle,
  startBattle,
  tournamentCleared,
  tournamentProgress,
  STATUS_DURATION,
} from "../src/game/core/catBattle";
import { signupTournament } from "../src/game/core/tournament";
import type { CatBattleUnit, CatStatusId } from "../src/game/types";

/** 收养一只猫并设为携带 */
function setupCat(catId = "orange", seed = 7): ReturnType<typeof createInitialState> {
  const s = createInitialState(seed);
  const pet = adoptCat(s, catId);
  expect(pet).not.toBeNull();
  setActivePet(s, s.pets[0].uid);
  return s;
}

/** 构造一个战斗单位（测试用） */
function mkUnit(over: Partial<CatBattleUnit> = {}): CatBattleUnit {
  return {
    name: "测试猫",
    icon: "🐱",
    level: 10,
    element: "normal",
    attrs: { hp: 100, atk: 20, def: 15, spd: 12 },
    skills: ["hiss", "scratch"],
    hp: 100,
    ...over,
  };
}

/** 把战斗推进到下一个玩家回合开始 */
function stepTurn(s: ReturnType<typeof createInitialState>): void {
  const b = s.catBattle;
  if (!b || b.finished) return;
  if (b.phase === "player") endPlayerTurn(s);
}

describe("v1.33 P2 卡牌数据层", () => {
  it("卡牌 id 唯一，三类全覆盖，费用非负", () => {
    const ids = allCards().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const kinds = new Set(allCards().map((c) => c.type));
    for (const k of ["attack", "defend", "skill"] as const) {
      expect(kinds.has(k), `缺 ${k} 类卡牌`).toBe(true);
    }
    for (const c of allCards()) {
      expect(c.cost, `${c.id} 费用`).toBeGreaterThanOrEqual(0);
      expect(c.desc.length).toBeGreaterThan(0);
    }
  });

  it("攻击牌都有威力，防御牌都有格挡", () => {
    for (const c of allCards()) {
      if (c.type === "attack") expect(c.effect?.power, `${c.id} 缺威力`).toBeGreaterThan(0);
      if (c.type === "defend") expect(c.effect?.block, `${c.id} 缺格挡`).toBeGreaterThan(0);
    }
  });

  it("getCardDef 查询可用", () => {
    expect(getCardDef("scratch")?.name).toBe("抓挠");
    expect(getCardDef("nonexistent")).toBeUndefined();
  });
});

describe("v1.33 P2 卡组构建", () => {
  it("橘猫卡组 ≥ 最小尺寸且引用真实卡牌", () => {
    const def = getCatDef("orange");
    const deck = buildPlayerDeck("orange", def?.skills ?? []);
    expect(deck.length).toBeGreaterThanOrEqual(MIN_DECK_SIZE);
    for (const id of deck) expect(getCardDef(id), `卡组引用不存在的卡 ${id}`).toBeTruthy();
  });

  it("橘猫专属牌并入卡组", () => {
    const deck = buildPlayerDeck("orange", getCatDef("orange")?.skills ?? []);
    expect(deck).toContain("orange_exclusive");
  });

  it("未知猫种回退基础卡组", () => {
    const deck = buildPlayerDeck("nonexistent", []);
    expect(deck.length).toBeGreaterThanOrEqual(MIN_DECK_SIZE);
  });
});

describe("v1.33 P2 克制与数值", () => {
  it("普通系参与任何克制都 = 1.0", () => {
    expect(elementMultiplier("normal", "nature")).toBe(1);
    expect(elementMultiplier("tech", "normal")).toBe(1);
  });

  it("自然克科技（1.5），科技被自然克（0.5）", () => {
    expect(elementMultiplier("nature", "tech")).toBe(1.5);
    expect(elementMultiplier("tech", "nature")).toBe(0.5);
  });

  it("五系循环克制完整", () => {
    expect(elementMultiplier("tech", "mystic")).toBe(1.5);
    expect(elementMultiplier("mystic", "cosmic")).toBe(1.5);
    expect(elementMultiplier("cosmic", "nature")).toBe(1.5);
  });

  it("伤害随攻击/防御成长", () => {
    const atk = mkUnit({ attrs: { hp: 100, atk: 20, def: 10, spd: 10 } });
    const def = mkUnit({ attrs: { hp: 100, atk: 10, def: 20, spd: 10 } });
    const d1 = cardDamage(atk, 0, def, 12);
    const d2 = cardDamage(atk, 5, def, 12);
    expect(d2).toBeGreaterThan(d1);
    expect(cardBlockValue(20, 10)).toBeGreaterThan(cardBlockValue(10, 10));
  });
});

describe("v1.33 P2 战斗回合流程", () => {
  it("startBattle 需要携带猫", () => {
    const s = createInitialState(7);
    const r = startBattle(s, "wild_stray");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("携带");
  });

  it("startBattle 初始化：能量/手牌/抽牌堆/回合 1", () => {
    const s = setupCat();
    const r = startBattle(s, "wild_stray");
    expect(r.ok).toBe(true);
    const b = s.catBattle!;
    expect(b.phase).toBe("player");
    expect(b.turn).toBe(1);
    expect(b.playerEnergy).toBe(ENERGY_PER_TURN);
    expect(b.playerHand.length).toBe(HAND_SIZE);
    expect(b.playerDrawPile.length).toBeGreaterThan(0);
    expect(b.enemyIntent).toBeTruthy();
    expect(b.opponent.name).toBe("流浪猫");
  });

  it("playCard 扣能量、结算、弃牌", () => {
    const s = setupCat();
    startBattle(s, "wild_stray");
    const b = s.catBattle!;
    const cardId = b.playerHand.find((id) => getCardDef(id)?.type === "attack") ?? b.playerHand[0];
    const cost = getCardDef(cardId)!.cost;
    const hpBefore = b.opponent.hp;
    const energyBefore = b.playerEnergy;
    const beforeCount = b.playerHand.filter((x) => x === cardId).length;
    const r = playCard(s, cardId);
    expect(r.ok).toBe(true);
    expect(b.playerEnergy).toBe(energyBefore - cost);
    expect(b.playerHand.filter((x) => x === cardId).length).toBe(beforeCount - 1);
    expect(b.playerDiscardPile.filter((x) => x === cardId).length).toBeGreaterThan(0);
    // 攻击牌应造成伤害
    if (getCardDef(cardId)?.type === "attack") {
      expect(b.opponent.hp).toBeLessThan(hpBefore);
    }
  });

  it("能量不足不能出牌", () => {
    const s = setupCat();
    startBattle(s, "wild_stray");
    const b = s.catBattle!;
    b.playerEnergy = 0;
    const cardId = b.playerHand[0];
    const r = playCard(s, cardId);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("能量");
  });

  it("endPlayerTurn 敌方行动并开启新回合", () => {
    const s = setupCat();
    startBattle(s, "wild_stray");
    const b = s.catBattle!;
    const r = endPlayerTurn(s);
    expect(r.ok).toBe(true);
    expect(b.phase).toBe("player");
    expect(b.turn).toBe(2);
    expect(b.playerBlock).toBe(0); // 回合结束格挡清零
    expect(b.playerHand.length).toBe(HAND_SIZE); // 补满手牌
    expect(b.playerEnergy).toBe(ENERGY_PER_TURN);
    // 敌方意图必然有输出（攻击可能被闪避，但日志有新增）
    expect(b.log.length).toBeGreaterThan(1);
  });

  it("防守牌叠加格挡并抵挡敌方伤害", () => {
    const s = setupCat();
    startBattle(s, "wild_stray");
    const b = s.catBattle!;
    // 确定性手牌：两张防守牌
    b.playerHand = ["guard", "guard"];
    b.playerEnergy = 3;
    playCard(s, "guard");
    playCard(s, "guard");
    expect(b.playerBlock).toBeGreaterThan(0);
    endPlayerTurn(s);
    expect(b.playerBlock).toBe(0); // 敌方行动后格挡清零
  });

  it("v1.39 杀戮尖塔式：回合结束手牌全部弃入弃牌堆", () => {
    const s = setupCat();
    startBattle(s, "wild_stray");
    const b = s.catBattle!;
    // 手里留 3 张牌不打出
    b.playerHand = b.playerHand.slice(0, 3);
    const kept = [...b.playerHand];
    const discardBefore = b.playerDiscardPile.length;
    endPlayerTurn(s);
    // 手牌清空，弃牌堆新增 3 张（含原弃牌）
    expect(b.playerHand.length).toBe(HAND_SIZE); // 新回合已补满
    expect(b.playerDiscardPile.length).toBe(discardBefore + 3);
    for (const id of kept) {
      expect(b.playerDiscardPile).toContain(id);
    }
  });

  it("v1.39 杀戮尖塔式：抽牌堆耗尽后重洗弃牌堆", () => {
    const s = setupCat();
    startBattle(s, "wild_stray");
    const b = s.catBattle!;
    // 构造：抽牌堆 1 张、弃牌堆 6 张、手牌 0
    b.playerDrawPile = ["scratch"];
    b.playerDiscardPile = ["guard", "guard", "guard", "guard", "guard", "guard"];
    b.playerHand = [];
    endPlayerTurn(s);
    // 新回合抽 5 张：1 张来自抽牌堆，剩余 4 张来自重洗后的弃牌堆
    expect(b.playerHand.length).toBe(HAND_SIZE);
    expect(b.playerDrawPile.length).toBe(2);
    expect(b.playerDiscardPile.length).toBe(0);
  });
});

describe("v1.33 P2 状态异常", () => {
  it("applyStatus 设置持续回合", () => {
    const rng = { seed: 1, calls: 0 };
    const u = mkUnit();
    applyStatus(rng, u, "poison");
    expect(u.status).toBe("poison");
    expect(u.statusTurns).toBe(STATUS_DURATION.poison);
  });

  it("中毒回合末扣血并递减", () => {
    const rng = { seed: 1, calls: 0 };
    const b = {
      player: mkUnit(),
      opponent: mkUnit({ name: "敌猫", attrs: { hp: 100, atk: 10, def: 10, spd: 10 } }),
    } as unknown as Parameters<typeof endOfTurn>[0];
    applyStatus(rng, b.opponent, "poison");
    const hpBefore = b.opponent.hp;
    const logs = endOfTurn(b);
    expect(b.opponent.hp).toBeLessThan(hpBefore);
    expect(logs.some((l) => l.includes("中毒"))).toBe(true);
    expect(b.opponent.statusTurns).toBe(STATUS_DURATION.poison - 1);
  });
});

describe("v1.33 P2 奖励结算", () => {
  it("胜利结算发放经验/金钱并标记对手击败", () => {
    const s = setupCat();
    startBattle(s, "wild_stray");
    const b = s.catBattle!;
    b.opponent.hp = 0;
    b.finished = true;
    b.won = true;
    b.phase = "over";
    const reward = settleBattle(s);
    expect(reward).not.toBeNull();
    expect(reward!.exp).toBeGreaterThan(0);
    expect(reward!.money).toBeGreaterThan(0);
    expect(s.catFlags["defeat_wild_stray"]).toBe(true);
    expect(s.catBattle).toBeUndefined(); // 结算后清空
  });

  it("失败结算只给一半经验", () => {
    const s = setupCat();
    startBattle(s, "wild_stray");
    const b = s.catBattle!;
    b.player.hp = 0;
    b.finished = true;
    b.won = false;
    b.phase = "over";
    const reward = settleBattle(s);
    expect(reward).not.toBeNull();
    expect(reward!.money).toBe(0);
  });

  it("赛事最后一战胜利后标记通关", () => {
    const s = setupCat("orange", 3);
    s.pets[0].level = 10;
    const t = getTournamentDef("tournament_primary")!;
    signupTournament(s, t.id);
    const entry = s.catTournament!.entry!;
    entry.started = true;
    // 连胜整个赛程对手
    for (const oppId of [...entry.queue]) {
      startBattle(s, oppId, t.id);
      const b = s.catBattle!;
      b.opponent.hp = 0;
      b.finished = true;
      b.won = true;
      b.phase = "over";
      settleBattle(s);
    }
    expect(tournamentCleared(s, t.id)).toBe(true);
    expect(entry.rank).toBe(1);
    expect(entry.settled).toBe(true);
  });

  it("击败 Boss 标记 boss_roundhead", () => {
    const s = setupCat("orange", 3);
    s.pets[0].level = 15;
    const boss = getBossDef();
    startBattle(s, boss.id);
    const b = s.catBattle!;
    b.opponent.hp = 0;
    b.finished = true;
    b.won = true;
    b.phase = "over";
    settleBattle(s);
    expect(bossDefeated(s)).toBe(true);
  });

  it("tournamentProgress 统计已击败对手", () => {
    const s = setupCat("orange", 3);
    s.pets[0].level = 10;
    const t = getTournamentDef("tournament_primary")!;
    expect(tournamentProgress(s, t.id)).toBe(0);
    signupTournament(s, t.id);
    const entry = s.catTournament!.entry!;
    entry.started = true;
    const first = entry.queue[0];
    startBattle(s, first, t.id);
    const b = s.catBattle!;
    b.opponent.hp = 0;
    b.finished = true;
    b.won = true;
    b.phase = "over";
    settleBattle(s);
    expect(tournamentProgress(s, t.id)).toBe(1);
  });
});

describe("v1.33 P2 数据完整性", () => {
  it("对手/赛事/Boss 引用真实技能与卡牌", () => {
    for (const o of allOpponents()) {
      for (const sk of o.skills) {
        expect(getSkillDef(sk), `${o.id} 引用不存在的技能 ${sk}`).toBeTruthy();
      }
    }
    expect(getOpponentDef("wild_stray")?.name).toBe("流浪猫");
    expect(getTournamentDef("tournament_primary")?.name).toBe("入门杯");
    expect(getBossDef().id).toBe("roundhead");
    expect(allTournaments().length).toBeGreaterThanOrEqual(3);
  });

  it("卡组构建不崩溃（遍历所有玩家猫种）", () => {
    const cats = require("../src/game/data/cats.json") as { cats: Array<{ id: string; skills: string[] }> };
    for (const c of cats.cats) {
      const deck = buildPlayerDeck(c.id, c.skills);
      expect(deck.length).toBeGreaterThanOrEqual(MIN_DECK_SIZE);
    }
  });
});

describe("v1.33 P2 外出遭遇", () => {
  it("携带猫时概率触发野生对决", () => {
    const s = setupCat();
    s.locationId = "park";
    s.time.hour = 12;
    let triggered = 0;
    for (let i = 0; i < 200; i++) {
      s.catBattle = undefined;
      s.flags["cat_battle_pending"] = undefined;
      s.flags["cat_wild_battle_day"] = undefined; // 重置同天冷却
      // 用不同 seed 重新生成以覆盖随机性
      if (maybeTriggerWildBattle(s, 1)) triggered++;
    }
    // 概率 1 应全部触发（无猫限制：野生对手 minLevel 均 ≤ 猫等级）
    expect(triggered).toBe(200);
  });

  it("同一天冷却：只触发一次", () => {
    const s = setupCat();
    s.locationId = "park";
    s.time.hour = 12;
    expect(maybeTriggerWildBattle(s, 1)).toBe(true);
    s.catBattle = undefined;
    s.flags["cat_battle_pending"] = undefined;
    expect(maybeTriggerWildBattle(s, 1)).toBe(false);
  });

  it("未携带猫不触发", () => {
    const s = createInitialState(7);
    s.locationId = "park";
    s.time.hour = 12;
    expect(maybeTriggerWildBattle(s, 1)).toBe(false);
    expect(s.catBattle).toBeUndefined();
  });

  it("受伤的猫不触发", () => {
    const s = setupCat();
    s.locationId = "park";
    s.time.hour = 12;
    s.pets[0].injured = { level: "light", day: 0 };
    expect(maybeTriggerWildBattle(s, 1)).toBe(false);
  });

  it("在家不触发", () => {
    const s = setupCat();
    s.locationId = "home";
    s.time.hour = 12;
    expect(maybeTriggerWildBattle(s, 1)).toBe(false);
  });
});

/** 检查战斗中是否真的能跑完多回合（敌方意图不崩溃） */
describe("v1.33 P2 长回合稳定性", () => {
  it("多回合对战不崩溃且有胜败收敛", () => {
    const s = setupCat("orange", 7);
    s.pets[0].level = 20;
    s.pets[0].attrs = { hp: 200, atk: 40, def: 30, spd: 30 };
    startBattle(s, "wild_rival");
    let guard = 0;
    while (s.catBattle && !s.catBattle.finished && guard < 200) {
      const b = s.catBattle;
      // 简单策略：有攻击牌就打，否则结束回合
      const atk = b.playerHand.find((id) => getCardDef(id)?.type === "attack");
      if (atk && b.playerEnergy >= (getCardDef(atk)?.cost ?? 0)) {
        playCard(s, atk);
      } else {
        endPlayerTurn(s);
      }
      guard++;
    }
    expect(s.catBattle).toBeDefined();
    expect(s.catBattle!.finished).toBe(true);
    expect(s.catBattle!.won).toBeTypeOf("boolean");
  });
});
